import AppKit
import Combine

enum PetMode: Equatable {
    case travel
    case rest
    case sleep
    case alert
    case held
}

struct WindowInfo {
    let id: Int
    let frame: CGRect
}

struct World {
    var screens: [NSScreen]
    var windows: [WindowInfo]
    var cursor: CGPoint
    var userIdle: TimeInterval
}

private struct Perch {
    var point: CGPoint
    var windowID: Int?
    var windowOffsetX: CGFloat = 0
    var rest: ClosedRange<Double>
}

@MainActor
final class PetModel: ObservableObject {
    static let size = Sprite.size

    @Published var mode: PetMode = .rest
    @Published var phase: Double = 0
    @Published var look = 0
    @Published var hop: CGFloat = 0
    @Published var bubbleOpen = false
    @Published var toast: Insight?
    @Published var greeting: String?
    @Published var digest: Digest?
    @Published var error: String?
    @Published var refreshing = false
    @Published var hidden = false

    var position = CGPoint(x: 400, y: 200)
    private var velocity = CGVector.zero
    private var target: Perch?
    private var perch: Perch?
    private var modeUntil = Date().addingTimeInterval(1)
    private var toastUntil = Date.distantPast
    private var toastStart = Date.distantPast
    private var greetingStart = Date.distantPast
    private var pendingToast: Insight?
    private var seen: Set<String>

    private let maxSpeed: CGFloat = 230
    private let sleepAfter: TimeInterval = 600
    private static let seenKey = "seenInsights"
    private static let greetingKey = "lastGreeting"

    init() {
        seen = Set(UserDefaults.standard.stringArray(forKey: Self.seenKey) ?? [])
    }

    var attention: Int {
        digest?.insights.filter { $0.priority == 1 }.count ?? 0
    }

    var greetingProgress: Int {
        Int(Date().timeIntervalSince(greetingStart) / 0.07)
    }

    var expression: Expression {
        if mode == .held { return .flustered }
        if mode == .sleep { return .asleep }
        if error != nil && digest == nil { return .glitch }
        if toast != nil || greeting != nil || mode == .alert { return .alert }
        if refreshing { return .thinking }
        if bubbleOpen { return .talking }
        if attention > 0 { return .focused }
        if let digest, digest.insights.isEmpty, digest.sources.contains(where: \.ok) { return .chill }
        return .neutral
    }

    func tick(dt: Double, world: World) {
        let now = Date()
        phase += dt

        if let line = greeting, now.timeIntervalSince(greetingStart) > Double(line.count) * 0.07 + 3 {
            greeting = nil
            if let next = pendingToast { pendingToast = nil; show(next) } else { rest(for: 1...2) }
        }
        if toast != nil && now >= toastUntil {
            toast = nil
            if mode == .alert { rest(for: 1...2) }
        }

        let sinceToast = now.timeIntervalSince(toastStart)
        if (toast != nil || greeting != nil) && sinceToast < 3 * 1.1 {
            let cycle = sinceToast.truncatingRemainder(dividingBy: 1.1)
            hop = cycle < 0.4 ? CGFloat(sin(cycle / 0.4 * .pi)) * 10 : 0
        } else if mode == .travel {
            hop = CGFloat(abs(sin(phase * 7))) * 3
        } else if hop != 0 {
            hop = 0
        }

        if mode == .held { return }

        if mode != .alert && !bubbleOpen {
            if world.userIdle > sleepAfter && mode != .sleep {
                mode = .sleep
                velocity = .zero
            } else if mode == .sleep && world.userIdle < 2 {
                rest(for: 1...2)
            }
        }

        followPerchedWindow(world)

        if mode == .sleep || mode == .alert || bubbleOpen {
            look = 0
            return
        }

        switch mode {
        case .travel:
            guard let target else { rest(for: 0.5...1); return }
            let dx = target.point.x - position.x
            let dy = target.point.y - position.y
            let dist = sqrt(dx * dx + dy * dy)
            if dist < 1.5 {
                position = target.point
                velocity = .zero
                perch = target
                self.target = nil
                rest(for: target.rest)
                return
            }
            let speed = min(maxSpeed, dist * 2.6)
            let want = CGVector(dx: dx / dist * speed, dy: dy / dist * speed)
            let k = CGFloat(min(1, dt * 5))
            velocity = CGVector(dx: velocity.dx + (want.dx - velocity.dx) * k, dy: velocity.dy + (want.dy - velocity.dy) * k)
            position.x += velocity.dx * CGFloat(dt)
            position.y += velocity.dy * CGFloat(dt)
            look = velocity.dx > 20 ? 1 : velocity.dx < -20 ? -1 : 0
        case .rest:
            let center = CGPoint(x: position.x + Self.size.width / 2, y: position.y + Self.size.height / 2)
            let dx = world.cursor.x - center.x
            look = dx > 60 ? 1 : dx < -60 ? -1 : 0
            if now >= modeUntil { travel(to: nextPerch(world)) }
        default:
            break
        }
    }

    private func followPerchedWindow(_ world: World) {
        guard mode != .travel, let current = perch, let id = current.windowID else { return }
        guard let window = world.windows.first(where: { $0.id == id }) else {
            perch = nil
            if mode == .rest { modeUntil = Date() }
            return
        }
        position = CGPoint(x: window.frame.minX + current.windowOffsetX, y: window.frame.maxY - 5)
    }

    private func rest(for range: ClosedRange<Double>) {
        mode = .rest
        modeUntil = Date().addingTimeInterval(.random(in: range))
    }

    private func travel(to next: Perch) {
        target = next
        perch = nil
        mode = .travel
    }

    private func nextPerch(_ world: World) -> Perch {
        let size = Self.size
        let screen = world.screens.first(where: { $0.frame.insetBy(dx: -size.width, dy: -size.height).contains(position) }) ?? world.screens.first ?? NSScreen.main!
        let visible = screen.visibleFrame
        let clampX = { (x: CGFloat) in min(max(x, visible.minX + 8), visible.maxX - size.width - 8) }
        let clampY = { (y: CGFloat) in min(max(y, visible.minY), visible.maxY - size.height - 4) }

        let perchable = world.windows.prefix(5).filter { w in
            w.frame.width > size.width + 40 && w.frame.maxY + size.height < screen.frame.maxY - 26 && visible.intersects(w.frame)
        }

        let roll = Double.random(in: 0...1)
        if roll < 0.38, let window = perchable.randomElement() {
            let offset = CGFloat.random(in: 16...(window.frame.width - size.width - 16))
            return Perch(point: CGPoint(x: window.frame.minX + offset, y: window.frame.maxY - 5), windowID: window.id, windowOffsetX: offset, rest: 5...12)
        }
        if roll < 0.55 {
            return Perch(point: CGPoint(x: clampX(.random(in: visible.minX...visible.maxX)), y: visible.minY), rest: 3...8)
        }
        if roll < 0.7 {
            let left = Bool.random()
            let x = left ? visible.minX - size.width * 0.42 : visible.maxX - size.width * 0.58
            return Perch(point: CGPoint(x: x, y: clampY(.random(in: (visible.minY + 60)...(visible.maxY - 120)))), rest: 3...6)
        }
        if roll < 0.85 {
            let side: CGFloat = Bool.random() ? 1 : -1
            let point = CGPoint(x: clampX(world.cursor.x + side * .random(in: 70...110) - size.width / 2), y: clampY(world.cursor.y - size.height / 2 + .random(in: -30...30)))
            return Perch(point: point, rest: 2...4)
        }
        return Perch(point: CGPoint(x: clampX(.random(in: visible.minX...visible.maxX)), y: clampY(.random(in: visible.minY...visible.maxY))), rest: 1.5...3.5)
    }

    func toggleBubble() {
        toast = nil
        greeting = nil
        pendingToast = nil
        bubbleOpen.toggle()
        if bubbleOpen {
            markAllSeen()
            if mode == .sleep || mode == .travel { rest(for: 2...4) }
            velocity = .zero
        } else {
            rest(for: 1...2)
        }
    }

    func grab() {
        bubbleOpen = false
        toast = nil
        greeting = nil
        perch = nil
        target = nil
        velocity = .zero
        mode = .held
    }

    func drop(world: World) {
        let size = Self.size
        if let window = world.windows.first(where: { w in
            abs(position.y - (w.frame.maxY - 5)) < 28 && position.x > w.frame.minX - 10 && position.x + size.width < w.frame.maxX + 10
        }) {
            let offset = min(max(position.x - window.frame.minX, 0), window.frame.width - size.width)
            perch = Perch(point: .zero, windowID: window.id, windowOffsetX: offset, rest: 6...12)
            position = CGPoint(x: window.frame.minX + offset, y: window.frame.maxY - 5)
        }
        rest(for: 5...10)
    }

    func refresh(force: Bool = false) {
        guard !refreshing else { return }
        refreshing = true
        Task {
            do {
                let next = try await Daemon.digest(refresh: force)
                apply(next)
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
            refreshing = false
        }
    }

    private func apply(_ next: Digest) {
        digest = next
        let fresh = next.insights.filter { $0.priority <= 2 && !seen.contains($0.id) }
        let top = bubbleOpen ? nil : fresh.min(by: { $0.priority < $1.priority })
        if let top {
            seen.insert(top.id)
            saveSeen()
        }

        let today = ISO8601DateFormatter.string(from: Date(), timeZone: .current, formatOptions: [.withFullDate])
        if UserDefaults.standard.string(forKey: Self.greetingKey) != today && !bubbleOpen && mode != .held {
            UserDefaults.standard.set(today, forKey: Self.greetingKey)
            let name = NSFullUserName().split(separator: " ").first.map(String.init) ?? "Neo"
            greeting = "Wake up, \(name)…"
            greetingStart = Date()
            toastStart = Date()
            pendingToast = top
            stopForAttention()
            return
        }
        if let top { show(top) }
    }

    private func show(_ insight: Insight) {
        toast = insight
        toastUntil = Date().addingTimeInterval(insight.priority == 1 ? 14 : 8)
        toastStart = Date()
        stopForAttention()
    }

    private func stopForAttention() {
        guard mode != .held else { return }
        velocity = .zero
        target = nil
        mode = .alert
    }

    private func markAllSeen() {
        guard let digest else { return }
        seen.formUnion(digest.insights.map(\.id))
        saveSeen()
    }

    private func saveSeen() {
        UserDefaults.standard.set(Array(seen.suffix(400)), forKey: Self.seenKey)
    }
}
