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
    case side(Int, right: Bool)
    case free(CGPoint)
}

private struct Ledge {
    let start: CGPoint
    let vertical: Bool
    let length: CGFloat

    func point(_ offset: CGFloat) -> CGPoint {
        vertical ? CGPoint(x: start.x, y: start.y + offset) : CGPoint(x: start.x + offset, y: start.y)
    }

    func clamp(_ offset: CGFloat) -> CGFloat {
        min(max(offset, 0), max(0, length))
    }
}

@MainActor
final class PetModel: ObservableObject {
    static let size = Sprite.size

    @Published var mode: PetMode = .rest
    @Published var phase: Double = 0
    @Published var look: CGFloat = 0
    @Published var hop: CGFloat = 0
    @Published var walking = false
    @Published var opacity: Double = 1
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
    private var shuffleTo: CGFloat?
    private var nextShuffle = Date().addingTimeInterval(30)
    private var nextGlance = Date().addingTimeInterval(4)
    private var glanceUntil = Date.distantPast
    private var relocateStart: Date?
    private var toastUntil = Date.distantPast
    private var toastStart = Date.distantPast
    private var greetingStart = Date.distantPast
    private var pendingToast: Insight?
    private var seen: Set<String>

    private let shuffleSpeed: CGFloat = 20
    private let sleepAfter: TimeInterval = 600
    private static let seenKey = "seenInsights"
    private static let greetingKey = "lastGreeting"
    private static let homeKey = "home"

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
        updateTimers(now)
        if mode == .held { return }

        if mode != .alert && !bubbleOpen {
            if world.userIdle > sleepAfter && mode != .sleep { mode = .sleep }
            else if mode == .sleep && world.userIdle < 2 { mode = .rest }
        }

        if let start = relocateStart {
            relocate(now, start, world)
            return
        }

        guard let current = surface, let ledge = ledge(for: current, world) else {
            relocateStart = now
            return
        }

        if let to = shuffleTo {
            let step = shuffleSpeed * CGFloat(dt)
            let delta = to - offset
            if abs(delta) <= step {
                offset = to
                shuffleTo = nil
            } else {
                offset += delta > 0 ? step : -step
                if !ledge.vertical { look = delta > 0 ? 1 : -1 }
            }
        }
        offset = ledge.clamp(offset)
        position = ledge.point(offset)
        walking = shuffleTo != nil

        if bubbleOpen || mode == .alert { look = 0; return }
        if mode == .sleep { return }

        let typing = world.keyIdle < 3
        if shuffleTo == nil && !typing && now >= nextShuffle && ledge.length > 8 {
            nextShuffle = now.addingTimeInterval(.random(in: 35...80))
            shuffleTo = ledge.clamp(offset + CGFloat.random(in: 8...26) * (Bool.random() ? 1 : -1))
        }

        if shuffleTo == nil {
            if now >= nextGlance {
                nextGlance = now.addingTimeInterval(.random(in: 6...14))
                glanceUntil = now.addingTimeInterval(.random(in: 1.2...2.5))
            }
            if case .side(_, let right) = current {
                look = right ? -1 : 1
            } else if now < glanceUntil {
                let dx = world.cursor.x - (position.x + Self.size.width / 2)
                look = dx > 40 ? 1 : dx < -40 ? -1 : 0
            } else {
                look = 0
            }
        }
    }

    private func updateTimers(_ now: Date) {
        if let line = greeting, now.timeIntervalSince(greetingStart) > Double(line.count) * 0.07 + 3 {
            greeting = nil
            if let next = pendingToast { pendingToast = nil; show(next) } else { mode = .rest }
        }
        if toast != nil && now >= toastUntil {
            toast = nil
            if mode == .alert { mode = .rest }
        }
        let sinceToast = now.timeIntervalSince(toastStart)
        if (toast != nil || greeting != nil) && sinceToast < 1.6 {
            let cycle = sinceToast.truncatingRemainder(dividingBy: 0.8)
            hop = cycle < 0.32 ? CGFloat(sin(cycle / 0.32 * .pi)) * 5 : 0
        } else if hop != 0 {
            hop = 0
        }
    }

    private func relocate(_ now: Date, _ start: Date, _ world: World) {
        let t = now.timeIntervalSince(start)
        if t < 0.35 {
            opacity = 1 - t / 0.35
        } else if surface == nil || ledge(for: surface!, world) == nil {
            surface = nil
            settle(at: home(world), world)
            opacity = 0
        } else if t < 0.8 {
            opacity = (t - 0.35) / 0.45
        } else {
            opacity = 1
            relocateStart = nil
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
        return maxX - minX > Self.size.width + 20
            && window.frame.maxY + Self.size.height + 4 < screen.frame.maxY - max(menuBar, 24)
            && window.frame.maxY > screen.visibleFrame.minY + 40
    }

    private func ledge(for surface: Surface, _ world: World) -> Ledge? {
        let size = Self.size
        switch surface {
        case .window(let id):
            guard let w = world.windows.first(where: { $0.id == id }), perchable(w, world) else { return nil }
            let (minX, maxX, _) = span(w, world)
            return Ledge(start: CGPoint(x: minX, y: w.frame.maxY - 2), vertical: false, length: maxX - minX - size.width)
        case .floor(let index):
            guard world.screens.indices.contains(index) else { return nil }
            let v = world.screens[index].visibleFrame
            return Ledge(start: CGPoint(x: v.minX, y: v.minY), vertical: false, length: v.width - size.width)
        case .side(let index, let right):
            guard world.screens.indices.contains(index) else { return nil }
            let v = world.screens[index].visibleFrame
            let x = right ? v.maxX - size.width * 0.55 : v.minX - size.width * 0.45
            return Ledge(start: CGPoint(x: x, y: v.minY + 20), vertical: true, length: v.height - size.height - 40)
        case .free(let p):
            guard world.screens.contains(where: { $0.frame.insetBy(dx: -size.width, dy: -size.height).contains(p) }) else { return nil }
            return Ledge(start: CGPoint(x: p.x - 14, y: p.y), vertical: false, length: 28)
        }
    }

    private func home(_ world: World) -> CGPoint {
        if let saved = UserDefaults.standard.array(forKey: Self.homeKey) as? [Double], saved.count == 2 {
            let p = CGPoint(x: saved[0], y: saved[1])
            if world.screens.contains(where: { $0.frame.contains(CGPoint(x: p.x + Self.size.width / 2, y: p.y + 1)) }) { return p }
        }
        let v = (world.screens.first ?? NSScreen.main!).visibleFrame
        return CGPoint(x: v.maxX - Self.size.width * 0.55, y: v.minY + v.height * 0.3)
    }

    private func settle(at point: CGPoint, _ world: World) {
        let size = Self.size
        let snap: CGFloat = 36
        let index = screenIndex(containing: CGPoint(x: point.x + size.width / 2, y: point.y + size.height / 2), world)
        let v = world.screens[index].visibleFrame

        if let w = world.windows.first(where: { w in
            perchable(w, world) && abs(point.y - (w.frame.maxY - 2)) < snap && point.x + size.width / 2 > w.frame.minX && point.x + size.width / 2 < w.frame.maxX
        }) {
            surface = .window(w.id)
            offset = point.x - span(w, world).minX
        } else if point.x + size.width * 0.5 > v.maxX - snap {
            surface = .side(index, right: true)
            offset = point.y - v.minY - 20
        } else if point.x + size.width * 0.5 < v.minX + snap {
            surface = .side(index, right: false)
            offset = point.y - v.minY - 20
        } else if point.y < v.minY + snap {
            surface = .floor(index)
            offset = point.x - v.minX
        } else {
            surface = .free(point)
            offset = 14
        }
        shuffleTo = nil
        if let ledge = ledge(for: surface!, world) {
            offset = ledge.clamp(offset)
            position = ledge.point(offset)
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
            shuffleTo = nil
        } else if mode == .alert {
            mode = .rest
        }
    }

    func grab() {
        bubbleOpen = false
        toast = nil
        greeting = nil
        shuffleTo = nil
        walking = false
        relocateStart = nil
        opacity = 1
        mode = .held
    }

    func drop(world: World) {
        mode = .rest
        settle(at: position, world)
        UserDefaults.standard.set([Double(position.x), Double(position.y)], forKey: Self.homeKey)
        nextShuffle = Date().addingTimeInterval(.random(in: 35...80))
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
