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

private struct Spot {
    let surface: Surface
    let offset: CGFloat?
    let preferred: CGFloat
    var tolerance: CGFloat = 6
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
    private var exploreSpot: Spot?
    private var nextExplore = Date.distantPast
    private var toastUntil = Date.distantPast
    private var toastStart = Date.distantPast
    private var greetingStart = Date.distantPast
    private var pendingToast: Insight?
    private var seen: Set<String>

    private let walkSpeed: CGFloat = 80
    private let sleepAfter: TimeInterval = 600
    private let typingPause: TimeInterval = 2.5
    private let exploreAfter: TimeInterval = 30
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
        offset = ledge.clamp(offset)
        position = ledge.point(offset)
        walking = { if case .walk = motion { return true } else { return false } }()

        guard !bubbleOpen else { look = 0; return }
        decide(now, world, ledge)

        if case .still = motion {
            let dx = world.cursor.x - (position.x + Self.size.width / 2)
            if case .side(_, let right) = surface { look = right ? -1 : 1 } else { look = mode == .alert ? 0 : dx > 70 ? 1 : dx < -70 ? -1 : 0 }
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
        guard let spot = desiredSpot(world, now) else { return }

        if spot.surface != surface {
            if mode != .alert && (typing || now < placedUntil) { return }
            jump(to: spot, world)
            return
        }
        if let want = spot.offset.map(ledge.clamp), abs(want - offset) > spot.tolerance, !typing || mode == .alert {
            motion = .walk(to: want)
            return
        }
        if mode == .rest && !typing && now >= nextPace && now >= placedUntil {
            nextPace = now.addingTimeInterval(.random(in: 18...40))
            motion = .walk(to: ledge.clamp(offset + CGFloat.random(in: 30...90) * (Bool.random() ? 1 : -1)))
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
            return Ledge(start: CGPoint(x: x, y: v.minY + 40), vertical: true, length: v.height - size.height - 80)
        }
    }

    private func attentionSpot(_ world: World, screen index: Int) -> Spot {
        let size = Self.size
        let v = world.screens[index].visibleFrame
        let c = CGPoint(x: min(max(world.cursor.x, v.minX), v.maxX), y: min(max(world.cursor.y, v.minY), v.maxY))
        let along = c.y - v.minY - 40 - size.height / 2
        let across = c.x - v.minX - size.width / 2
        var options: [(Surface, CGFloat, CGFloat)] = [
            (.side(index, right: false), c.x - v.minX, along),
            (.side(index, right: true), v.maxX - c.x, along),
            (.floor(index), c.y - v.minY, across),
        ]
        if let current = surface, let i = options.firstIndex(where: { $0.0 == current }) {
            options[i].1 -= 220
        }
        let best = options.min(by: { $0.1 < $1.1 })!
        return Spot(surface: best.0, offset: best.2, preferred: best.2, tolerance: 110)
    }

    private func exploreTarget(_ world: World) -> Spot {
        let index = screenIndex(containing: position, world)
        let v = world.screens[index].visibleFrame
        let windows = world.windows.filter { perchable($0, world) && $0.id != { if case .window(let id) = surface { return id } else { return -1 } }() }
        let roll = Double.random(in: 0...1)
        if roll < 0.45, let w = windows.prefix(6).randomElement() {
            let (minX, maxX, _) = span(w, world)
            return Spot(surface: .window(w.id), offset: .random(in: 0...max(0, maxX - minX - Self.size.width)), preferred: 0)
        }
        if roll < 0.75 {
            return Spot(surface: .floor(index), offset: .random(in: 0...max(0, v.width - Self.size.width)), preferred: 0)
        }
        return Spot(surface: .side(index, right: Bool.random()), offset: .random(in: 0...max(0, v.height - Self.size.height - 80)), preferred: 0)
    }

    private func desiredSpot(_ world: World, _ now: Date = Date()) -> Spot? {
        let size = Self.size
        let front = world.frontPID.flatMap { pid in world.windows.first(where: { $0.pid == pid }) }
        let cursorScreen = screenIndex(containing: world.cursor, world)

        if mode != .rest || world.userIdle < exploreAfter { exploreSpot = nil }

        switch mode {
        case .sleep:
            let index = screenIndex(containing: position, world)
            let corner = world.screens[index].visibleFrame.width - size.width - 24
            return Spot(surface: .floor(index), offset: corner, preferred: corner)
        case .alert:
            if let front, perchable(front, world) {
                let (minX, maxX, _) = span(front, world)
                if minX...maxX ~= world.cursor.x {
                    let near = world.cursor.x - minX - size.width / 2
                    return Spot(surface: .window(front.id), offset: near, preferred: near)
                }
            }
            return attentionSpot(world, screen: cursorScreen)
        default:
            if world.userIdle >= exploreAfter {
                if exploreSpot == nil || now >= nextExplore {
                    exploreSpot = exploreTarget(world)
                    nextExplore = now.addingTimeInterval(.random(in: 7...14))
                }
                return exploreSpot
            }
            if let front, perchable(front, world) {
                let (minX, maxX, _) = span(front, world)
                return Spot(surface: .window(front.id), offset: nil, preferred: maxX - minX - size.width - 72)
            }
            return attentionSpot(world, screen: cursorScreen)
        }
    }

    private func jump(to spot: Spot, _ world: World) {
        guard let ledge = ledge(for: spot.surface, world) else { return }
        let target = ledge.clamp(spot.offset ?? spot.preferred)
        let to = ledge.point(target)
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
        let end = ledge.point(ledge.clamp(target))
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
            offset = position.x - span(window, world).minX
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
