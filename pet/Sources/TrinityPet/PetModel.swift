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

private enum Motion {
    case still
    case walk(to: CGFloat)
    case glide(from: CGPoint, to: Surface, offset: CGFloat, start: Date, duration: Double)
}

private enum Quips {
    static let poked = ["Stop poking me.", "Seriously?", "Hands off.", "One more and I'm muting you.", "Tch."]
    static let crowded = ["Personal space.", "Can I help you?", "You're hovering.", "Back off a little."]
    static let dropped = ["Fine. I'll sit here.", "Rude.", "Don't do that again.", "Whatever. Here then."]
    static let quiet = ["Nothing for you. Go build something.", "All quiet. Don't make it weird.", "I'm busy. You're fine.", "What do you want?"]
}

@MainActor
final class PetModel: ObservableObject {
    static let size = Sprite.size

    @Published var mode: PetMode = .rest
    @Published var phase: Double = 0
    @Published var lookX: CGFloat = 0
    @Published var lookY: CGFloat = 0
    @Published var hop: CGFloat = 0
    @Published var walking = false
    @Published var opacity: Double = 1
    @Published var bubbleOpen = false
    @Published var toast: Insight?
    @Published var greeting: String?
    @Published var quip: String?
    @Published var digest: Digest?
    @Published var error: String?
    @Published var refreshing = false
    @Published var hidden = false

    var position = CGPoint(x: 400, y: 0)
    private var surface: Surface?
    private var offset: CGFloat = 0
    private var motion = Motion.still
    private var nextStroll = Date().addingTimeInterval(.random(in: 40...80))
    private var nextWander = Date().addingTimeInterval(.random(in: 180...300))
    private var placedUntil = Date.distantPast
    private var annoyedUntil = Date.distantPast
    private var hoverSince: Date?
    private var lastCrowdQuip = Date.distantPast
    private var pokes: [Date] = []
    private var quipUntil = Date.distantPast
    private var relocateStart: Date?
    private var toastUntil = Date.distantPast
    private var toastStart = Date.distantPast
    private var greetingStart = Date.distantPast
    private var pendingToast: Insight?
    private var seen: Set<String>

    private let strollSpeed: CGFloat = 28
    private let sleepAfter: TimeInterval = 600
    private static let seenKey = "seenInsights"
    private static let greetingKey = "lastGreeting"
    private static let homeKey = "home"
    private static let remindedKey = "remindedUpcoming"

    init() {
        seen = Set(UserDefaults.standard.stringArray(forKey: Self.seenKey) ?? [])
    }

    var attention: Int {
        digest?.insights.filter { $0.priority == 1 }.count ?? 0
    }

    var greetingProgress: Int {
        Int(Date().timeIntervalSince(greetingStart) / 0.07)
    }

    var bubbleKind: BubbleKind? {
        if greeting != nil { return .greeting }
        if quip != nil { return .quip }
        if toast != nil { return .toast }
        if bubbleOpen { return .full }
        return nil
    }

    var look: Int {
        lookX > 0.4 ? 1 : lookX < -0.4 ? -1 : 0
    }

    var expression: Expression {
        if mode == .held { return .flustered }
        if mode == .sleep { return .asleep }
        if error != nil && digest == nil { return .glitch }
        if toast != nil || greeting != nil || mode == .alert { return .alert }
        if Date() < annoyedUntil { return .annoyed }
        if refreshing { return .thinking }
        if bubbleOpen || quip != nil { return .talking }
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

        if case let .glide(from, to, target, start, duration) = motion {
            glide(now, world, from, to, target, start, duration)
            track(world, now, dt)
            return
        }

        guard let current = surface, let ledge = ledge(for: current, world) else {
            relocateStart = now
            return
        }

        if case .walk(let to) = motion {
            let step = strollSpeed * CGFloat(dt)
            let delta = to - offset
            if abs(delta) <= step {
                offset = to
                motion = .still
            } else {
                offset += delta > 0 ? step : -step
            }
        }
        offset = ledge.clamp(offset)
        position = ledge.point(offset)
        walking = { if case .walk = motion { return true } else { return false } }()

        track(world, now, dt)
        if bubbleOpen || mode != .rest { return }

        let typing = world.keyIdle < 3
        guard case .still = motion, !typing, now >= placedUntil else { return }

        if now >= nextWander {
            nextWander = now.addingTimeInterval(.random(in: 180...360))
            if let spot = wanderSpot(world), spot.0 != current || abs(spot.1 - offset) > 60 {
                if spot.0 == current {
                    motion = .walk(to: ledge.clamp(spot.1))
                } else {
                    startGlide(to: spot.0, offset: spot.1, world)
                }
                return
            }
        }
        if now >= nextStroll && ledge.length > 20 {
            nextStroll = now.addingTimeInterval(.random(in: 40...90))
            motion = .walk(to: ledge.clamp(offset + CGFloat.random(in: 40...140) * (Bool.random() ? 1 : -1)))
        }
    }

    private func track(_ world: World, _ now: Date, _ dt: Double) {
        let center = CGPoint(x: position.x + Self.size.width / 2, y: position.y + Self.size.height / 2)
        let dx = world.cursor.x - center.x
        let dy = world.cursor.y - center.y
        let dist = hypot(dx, dy)

        var tx = max(-1, min(1, dx / 220))
        var ty = max(-1, min(1, dy / 220))

        if mode == .rest && !bubbleOpen && dist < 95 {
            if hoverSince == nil { hoverSince = now }
            if now.timeIntervalSince(hoverSince!) > 1.2 {
                annoyedUntil = now.addingTimeInterval(1.5)
                tx = -tx
                ty = 0
                if now.timeIntervalSince(lastCrowdQuip) > 240 {
                    lastCrowdQuip = now
                    say(Quips.crowded.randomElement()!, for: 2.2)
                }
            }
        } else {
            hoverSince = nil
        }

        if case let .glide(from, _, _, _, _) = motion {
            tx = position.x >= from.x ? 1 : -1
            ty = 0
        } else if case .walk(let to) = motion {
            tx = to > offset ? 1 : -1
        }
        if mode == .alert || mode == .sleep { tx = 0; ty = 0 }

        let k = CGFloat(min(1, dt * 6))
        lookX += (tx - lookX) * k
        lookY += (ty - lookY) * k
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
        if quip != nil && now >= quipUntil { quip = nil }
        let sinceToast = now.timeIntervalSince(toastStart)
        if (toast != nil || greeting != nil) && sinceToast < 1.6 {
            let cycle = sinceToast.truncatingRemainder(dividingBy: 0.8)
            hop = cycle < 0.32 ? CGFloat(sin(cycle / 0.32 * .pi)) * 5 : 0
        } else if hop != 0 {
            hop = 0
        }
    }

    private func say(_ line: String, for seconds: TimeInterval) {
        guard greeting == nil, toast == nil, !bubbleOpen else { return }
        quip = line
        quipUntil = Date().addingTimeInterval(seconds)
    }

    private func relocate(_ now: Date, _ start: Date, _ world: World) {
        let t = now.timeIntervalSince(start)
        if t < 0.35 {
            opacity = 1 - t / 0.35
        } else if surface.flatMap({ ledge(for: $0, world) }) == nil {
            surface = nil
            motion = .still
            settle(at: home(world), world)
            opacity = 0
        } else if t < 0.8 {
            opacity = (t - 0.35) / 0.45
        } else {
            opacity = 1
            relocateStart = nil
        }
    }

    private func startGlide(to surface: Surface, offset target: CGFloat, _ world: World) {
        guard let ledge = ledge(for: surface, world) else { return }
        let clamped = ledge.clamp(target)
        let dist = hypot(ledge.point(clamped).x - position.x, ledge.point(clamped).y - position.y)
        motion = .glide(from: position, to: surface, offset: clamped, start: Date(), duration: min(max(Double(dist) / 90, 1.6), 7))
        walking = true
    }

    private func glide(_ now: Date, _ world: World, _ from: CGPoint, _ to: Surface, _ target: CGFloat, _ start: Date, _ duration: Double) {
        guard let ledge = ledge(for: to, world) else {
            motion = .still
            walking = false
            relocateStart = now
            return
        }
        let end = ledge.point(ledge.clamp(target))
        let t = min(1, now.timeIntervalSince(start) / duration)
        let e = CGFloat(t * t * (3 - 2 * t))
        position = CGPoint(x: from.x + (end.x - from.x) * e, y: from.y + (end.y - from.y) * e)
        if t >= 1 {
            motion = .still
            walking = false
            surface = to
            offset = ledge.clamp(target)
            nextStroll = now.addingTimeInterval(.random(in: 40...90))
        }
    }

    private func wanderSpot(_ world: World) -> (Surface, CGFloat)? {
        let size = Self.size
        let index = screenIndex(containing: world.cursor, world)
        let v = world.screens[index].visibleFrame
        let near = world.cursor.x - v.minX - size.width / 2 + CGFloat.random(in: -90...90)
        let roll = Double.random(in: 0...1)
        if roll < 0.5 { return (.floor(index), near) }
        if roll < 0.75, let front = world.frontPID.flatMap({ pid in world.windows.first(where: { $0.pid == pid }) }), perchable(front, world) {
            let (minX, _, _) = span(front, world)
            return (.window(front.id), world.cursor.x - minX - size.width / 2 + CGFloat.random(in: -60...60))
        }
        let right = world.cursor.x > v.midX
        return (.side(index, right: right), world.cursor.y - v.minY - 20 - size.height / 2)
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
            return Ledge(start: CGPoint(x: p.x - 30, y: p.y), vertical: false, length: 60)
        }
    }

    private func home(_ world: World) -> CGPoint {
        if let saved = UserDefaults.standard.array(forKey: Self.homeKey) as? [Double], saved.count == 2 {
            let p = CGPoint(x: saved[0], y: saved[1])
            if world.screens.contains(where: { $0.frame.contains(CGPoint(x: p.x + Self.size.width / 2, y: p.y + 1)) }) { return p }
        }
        let v = (world.screens.first ?? NSScreen.main!).visibleFrame
        return CGPoint(x: v.maxX - Self.size.width - 80, y: v.minY)
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
            offset = 30
        }
        motion = .still
        if let ledge = ledge(for: surface!, world) {
            offset = ledge.clamp(offset)
            position = ledge.point(offset)
        }
    }

    func click() {
        let now = Date()
        pokes = pokes.filter { now.timeIntervalSince($0) < 4 } + [now]
        if pokes.count >= 3 {
            pokes = []
            bubbleOpen = false
            annoyedUntil = now.addingTimeInterval(3)
            quip = nil
            say(Quips.poked.randomElement()!, for: 2.4)
            return
        }
        if !bubbleOpen, toast == nil, greeting == nil, let digest, digest.insights.isEmpty, digest.sources.contains(where: \.ok) {
            say(Quips.quiet.randomElement()!, for: 2.6)
            return
        }
        toggleBubble()
    }

    func dismissBubble() {
        if bubbleOpen {
            toggleBubble()
            return
        }
        toast = nil
        greeting = nil
        quip = nil
        pendingToast = nil
        if mode == .alert { mode = .rest }
    }

    func toggleBubble() {
        toast = nil
        greeting = nil
        quip = nil
        pendingToast = nil
        bubbleOpen.toggle()
        if bubbleOpen {
            markAllSeen()
            if mode == .sleep || mode == .alert { mode = .rest }
            motion = .still
        } else if mode == .alert {
            mode = .rest
        }
    }

    func grab() {
        bubbleOpen = false
        toast = nil
        greeting = nil
        quip = nil
        motion = .still
        walking = false
        relocateStart = nil
        opacity = 1
        mode = .held
    }

    func drop(world: World) {
        mode = .rest
        settle(at: position, world)
        UserDefaults.standard.set([Double(position.x), Double(position.y)], forKey: Self.homeKey)
        placedUntil = Date().addingTimeInterval(600)
        annoyedUntil = Date().addingTimeInterval(2)
        say(Quips.dropped.randomElement()!, for: 2.2)
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
        if let top { show(top); return }
        if !bubbleOpen, let due = dueReminder(next) { show(due) }
    }

    private func dueReminder(_ digest: Digest) -> Insight? {
        let now = Date()
        var reminded = Set(UserDefaults.standard.stringArray(forKey: Self.remindedKey) ?? [])
        for item in digest.upcoming ?? [] {
            guard let date = item.date else { continue }
            let key: String
            if item.timed {
                let lead = date.timeIntervalSince(now)
                guard lead > 0, lead <= 3600 else { continue }
                key = "\(item.id):soon"
            } else {
                guard Calendar.current.isDateInToday(date) else { continue }
                key = "\(item.id):day"
            }
            guard !reminded.contains(key) else { continue }
            reminded.insert(key)
            UserDefaults.standard.set(Array(reminded.suffix(200)), forKey: Self.remindedKey)
            let minutes = Int(date.timeIntervalSince(now) / 60)
            let detail = item.timed ? "In \(minutes) min. Don't be late." : "It's today."
            return Insight(id: "up:\(key)", source: item.source, priority: 1, title: item.what, detail: detail, from: item.who, chat: item.chat ?? item.who, group: nil, url: nil)
        }
        return nil
    }

    private func show(_ insight: Insight) {
        quip = nil
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
