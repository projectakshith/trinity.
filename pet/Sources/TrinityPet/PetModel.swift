import AppKit
import Combine

enum PetMode: Equatable {
    case rest
    case sleep
    case alert
    case held
}

struct WindowInfo {
    let id: Int
    let pid: pid_t
    let frame: CGRect
}

struct World {
    var screens: [NSScreen]
    var windows: [WindowInfo]
    var cursor: CGPoint
    var userIdle: TimeInterval
    var keyIdle: TimeInterval
    var frontPID: pid_t?
}

enum Surface: Equatable {
    case window(Int)
    case floor(Int)
    case edge(Int)
}

private struct Ledge {
    let origin: CGFloat
    let top: CGFloat
    let width: CGFloat
}

private struct Spot {
    let surface: Surface
    let offset: CGFloat?
    let preferred: CGFloat
}

private enum Motion {
    case still
    case walk(to: CGFloat)
    case jump(from: CGPoint, to: Surface, offset: CGFloat, start: Date, duration: Double, apex: CGFloat)
}

@MainActor
final class PetModel: ObservableObject {
    static let size = Sprite.size

    @Published var mode: PetMode = .rest
    @Published var phase: Double = 0
    @Published var look: CGFloat = 0
    @Published var hop: CGFloat = 0
    @Published var blinking = false
    @Published var walking = false
    @Published var airborne = false
    @Published var bubbleOpen = false
    @Published var toast: Insight?
    @Published var greeting: String?
    @Published var digest: Digest?
    @Published var error: String?
    @Published var refreshing = false
    @Published var hidden = false

    var position = CGPoint(x: 400, y: 0)
    private var surface: Surface?
    private var offset: CGFloat = 0
    private var motion = Motion.still
    private var nextPace = Date().addingTimeInterval(20)
    private var nextBlink = Date().addingTimeInterval(2)
    private var placedUntil = Date.distantPast
    private var toastUntil = Date.distantPast
    private var toastStart = Date.distantPast
    private var greetingStart = Date.distantPast
    private var pendingToast: Insight?
    private var seen: Set<String>

    private let walkSpeed: CGFloat = 80
    private let sleepAfter: TimeInterval = 600
    private let typingPause: TimeInterval = 2.5
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
        if mode == .sleep && !airborne { return .asleep }
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
        updateTimers(now)
        if mode == .held { return }

        if mode != .alert && !bubbleOpen {
            if world.userIdle > sleepAfter && mode != .sleep {
                mode = .sleep
            } else if mode == .sleep && world.userIdle < 2 {
                mode = .rest
                placedUntil = .distantPast
            }
        }

        if case .jump = motion {
            advanceJump(now, world)
            return
        }

        guard let ledge = surface.flatMap({ ledge(for: $0, world) }) else {
            surface = nil
            if let spot = desiredSpot(world) { jump(to: spot, world) }
            return
        }

        if case .walk(let to) = motion {
            let step = walkSpeed * CGFloat(dt)
            let delta = to - offset
            if abs(delta) <= step {
                offset = to
                motion = .still
            } else {
                offset += delta > 0 ? step : -step
                look = delta > 0 ? 1 : -1
            }
        }
        offset = min(max(offset, 0), max(0, ledge.width - Self.size.width))
        position = CGPoint(x: ledge.origin + offset, y: ledge.top)
        walking = { if case .walk = motion { return true } else { return false } }()

        guard !bubbleOpen else { look = 0; return }
        decide(now, world, ledge)

        if case .still = motion {
            let dx = world.cursor.x - (position.x + Self.size.width / 2)
            if case .edge = surface { look = -1 } else { look = mode == .alert ? 0 : dx > 70 ? 1 : dx < -70 ? -1 : 0 }
        }
    }

    private func updateTimers(_ now: Date) {
        if now >= nextBlink {
            blinking = true
            nextBlink = now.addingTimeInterval(.random(in: 2.5...6))
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.13) { [weak self] in self?.blinking = false }
        }
        if let line = greeting, now.timeIntervalSince(greetingStart) > Double(line.count) * 0.07 + 3 {
            greeting = nil
            if let next = pendingToast { pendingToast = nil; show(next) } else { mode = .rest }
        }
        if toast != nil && now >= toastUntil {
            toast = nil
            if mode == .alert { mode = .rest }
        }
        let sinceToast = now.timeIntervalSince(toastStart)
        if (toast != nil || greeting != nil) && !airborne && sinceToast < 3.3 {
            let cycle = sinceToast.truncatingRemainder(dividingBy: 1.1)
            hop = cycle < 0.4 ? CGFloat(sin(cycle / 0.4 * .pi)) * 10 : 0
        } else if hop != 0 {
            hop = 0
        }
    }

    private func decide(_ now: Date, _ world: World, _ ledge: Ledge) {
        guard case .still = motion else { return }
        let typing = world.keyIdle < typingPause
        guard let spot = desiredSpot(world) else { return }

        if spot.surface != surface {
            if mode != .alert && (typing || now < placedUntil) { return }
            jump(to: spot, world)
            return
        }
        if let want = spot.offset, abs(want - offset) > 6, !typing || mode == .alert {
            motion = .walk(to: want)
            return
        }
        if mode == .rest && !typing && now >= nextPace && now >= placedUntil {
            nextPace = now.addingTimeInterval(.random(in: 18...40))
            let span = max(0, ledge.width - Self.size.width)
            let target = min(max(offset + CGFloat.random(in: 30...90) * (Bool.random() ? 1 : -1), 0), span)
            motion = .walk(to: target)
        }
    }

    private func screenIndex(containing point: CGPoint, _ world: World) -> Int {
        world.screens.firstIndex(where: { $0.frame.contains(point) }) ?? 0
    }

    private func span(_ window: WindowInfo, _ world: World) -> (minX: CGFloat, maxX: CGFloat, screen: NSScreen) {
        let screen = world.screens[screenIndex(containing: CGPoint(x: window.frame.midX, y: window.frame.midY), world)]
        let v = screen.visibleFrame
        return (max(window.frame.minX, v.minX + 4), min(window.frame.maxX, v.maxX - 4), screen)
    }

    private func perchable(_ window: WindowInfo, _ world: World) -> Bool {
        let (minX, maxX, screen) = span(window, world)
        let menuBar = screen.frame.maxY - screen.visibleFrame.maxY
        return maxX - minX > Self.size.width + 60
            && window.frame.maxY + Self.size.height + 4 < screen.frame.maxY - max(menuBar, 24)
            && window.frame.maxY > screen.visibleFrame.minY + 40
    }

    private func ledge(for surface: Surface, _ world: World) -> Ledge? {
        switch surface {
        case .window(let id):
            guard let w = world.windows.first(where: { $0.id == id }), perchable(w, world) else { return nil }
            let (minX, maxX, _) = span(w, world)
            return Ledge(origin: minX, top: w.frame.maxY - 2, width: maxX - minX)
        case .floor(let index):
            guard world.screens.indices.contains(index) else { return nil }
            let v = world.screens[index].visibleFrame
            return Ledge(origin: v.minX, top: v.minY, width: v.width)
        case .edge(let index):
            guard world.screens.indices.contains(index) else { return nil }
            let v = world.screens[index].visibleFrame
            return Ledge(origin: v.maxX - Self.size.width * 0.55, top: v.minY + v.height * 0.45, width: Self.size.width)
        }
    }

    private func desiredSpot(_ world: World) -> Spot? {
        let size = Self.size
        let front = world.frontPID.flatMap { pid in world.windows.first(where: { $0.pid == pid }) }
        let cursorScreen = screenIndex(containing: world.cursor, world)

        switch mode {
        case .sleep:
            let index = screenIndex(containing: position, world)
            let width = world.screens[index].visibleFrame.width
            let corner = width - size.width - 24
            return Spot(surface: .floor(index), offset: corner, preferred: corner)
        case .alert:
            if let front, perchable(front, world) {
                let (minX, maxX, _) = span(front, world)
                if minX...maxX ~= world.cursor.x {
                    let near = world.cursor.x - minX - size.width / 2
                    return Spot(surface: .window(front.id), offset: min(max(near, 0), maxX - minX - size.width), preferred: near)
                }
            }
            return Spot(surface: .edge(cursorScreen), offset: 0, preferred: 0)
        default:
            if let front, perchable(front, world) {
                let (minX, maxX, _) = span(front, world)
                return Spot(surface: .window(front.id), offset: nil, preferred: maxX - minX - size.width - 72)
            }
            let index = front.map { screenIndex(containing: CGPoint(x: $0.frame.midX, y: $0.frame.midY), world) } ?? cursorScreen
            return Spot(surface: .edge(index), offset: 0, preferred: 0)
        }
    }

    private func jump(to spot: Spot, _ world: World) {
        guard let ledge = ledge(for: spot.surface, world) else { return }
        let target = min(max(spot.offset ?? spot.preferred, 0), max(0, ledge.width - Self.size.width))
        let to = CGPoint(x: ledge.origin + target, y: ledge.top)
        let dist = hypot(to.x - position.x, to.y - position.y)
        if dist < 2 {
            surface = spot.surface
            offset = target
            return
        }
        look = to.x > position.x ? 1 : -1
        let screen = world.screens[screenIndex(containing: to, world)].visibleFrame
        let room = screen.maxY - Self.size.height - max(position.y, to.y)
        let apex = max(0, min(26 + dist * 0.12, room))
        motion = .jump(from: position, to: spot.surface, offset: target, start: Date(), duration: min(max(Double(dist) / 650 + 0.35, 0.45), 1.05), apex: apex)
        airborne = true
        walking = false
    }

    private func advanceJump(_ now: Date, _ world: World) {
        guard case let .jump(from, to, target, start, duration, apex) = motion else { return }
        guard let ledge = ledge(for: to, world) else {
            motion = .still
            airborne = false
            surface = nil
            return
        }
        let end = CGPoint(x: ledge.origin + target, y: ledge.top)
        let t = min(1, now.timeIntervalSince(start) / duration)
        let e = CGFloat(t)
        position = CGPoint(x: from.x + (end.x - from.x) * e, y: from.y + (end.y - from.y) * e + apex * 4 * e * (1 - e))
        if t >= 1 {
            motion = .still
            airborne = false
            surface = to
            offset = target
            nextPace = now.addingTimeInterval(.random(in: 18...40))
        }
    }

    func toggleBubble() {
        toast = nil
        greeting = nil
        pendingToast = nil
        bubbleOpen.toggle()
        if bubbleOpen {
            markAllSeen()
            if mode == .sleep || mode == .alert { mode = .rest }
            if case .walk = motion { motion = .still }
        } else if mode == .alert {
            mode = .rest
        }
    }

    func grab() {
        bubbleOpen = false
        toast = nil
        greeting = nil
        motion = .still
        airborne = false
        walking = false
        surface = nil
        mode = .held
    }

    func drop(world: World) {
        mode = .rest
        placedUntil = Date().addingTimeInterval(25)
        let size = Self.size
        if let window = world.windows.first(where: { w in
            perchable(w, world) && abs(position.y - (w.frame.maxY - 2)) < 30 && position.x > w.frame.minX - 10 && position.x + size.width < w.frame.maxX + 10
        }) {
            surface = .window(window.id)
            offset = position.x - window.frame.minX
            return
        }
        let index = screenIndex(containing: CGPoint(x: position.x + size.width / 2, y: position.y), world)
        let v = world.screens[index].visibleFrame
        jump(to: Spot(surface: .floor(index), offset: position.x - v.minX, preferred: 0), world)
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
            mode = .alert
            return
        }
        if let top { show(top) }
    }

    private func show(_ insight: Insight) {
        toast = insight
        toastUntil = Date().addingTimeInterval(insight.priority == 1 ? 14 : 8)
        toastStart = Date()
        if mode != .held { mode = .alert }
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
