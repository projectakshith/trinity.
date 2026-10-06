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
    var context: Context
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
    case flight(CGVector)
}

private enum Quips {
    static let poked = ["Stop poking me.", "Seriously?", "Hands off.", "One more and I'm muting you.", "Tch."]
    static let crowded = ["Personal space.", "Can I help you?", "You're hovering.", "Back off a little."]
    static let dropped = ["Fine. I'll sit here.", "Rude.", "Don't do that again.", "Whatever. Here then."]
    static let thrown = ["Rude.", "Nice throw. Idiot.", "I will remember this.", "Ow. Dramatically."]
    static let shaken = ["I hate you.", "Everything's spinning. Thanks.", "Never. Again."]
    static let trick = ["Watch this.", "Obviously.", "You're welcome.", "Free show. Once."]
}

struct ChatLine: Identifiable, Equatable {
    let id = UUID()
    let mine: Bool
    let text: String
    let at: Date
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
    @Published var question: Upcoming?
    @Published var digest: Digest?
    @Published var error: String?
    @Published var refreshing = false
    @Published var hidden = false
    @Published var bit: Bit?
    @Published var bitProgress: Double = 0
    @Published var attire = Attire()
    @Published var beat: CGFloat = 0
    @Published var flying = false
    @Published var chatting = false
    @Published var chatLog: [ChatLine] = []
    @Published var draft = ""
    @Published var asking = false
    @Published var checkingIn: Plan?
    @Published var checks: [Bool] = []

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
    private static let askedKey = "askedUpcoming"
    private static let planShownKey = "planShown"
    private static let nudgedKey = "nudged"
    private var questionUntil = Date.distantPast
    private var bitStart = Date()
    private var nextBit = Date().addingTimeInterval(.random(in: 8...20))
    private var nextLine = Date().addingTimeInterval(.random(in: 300...600))
    private var recentLines: [String] = []
    private var bond = Bond.load()
    private var bondSaved = Date()
    private var grump: Int {
        get { bond.grump }
        set { bond.grump = newValue }
    }
    private var away = false
    private var lastApp = ""
    private var lastKind = AppKind.other
    private var switches: [Date] = []
    private var lastEvent = Date.distantPast
    private var cooldowns: [String: Date] = [:]
    private var wasLowBattery = false
    private var wasOnline = true
    private var lastPlanCheck = Date.distantPast
    private var lastCheckinAsk = Date.distantPast
    private var lastWarmth = Date.distantPast
    private var grumpDecay = Date().addingTimeInterval(1800)
    private var lastBlush = Date.distantPast
    private var toastOpened = false
    private var context = Context()

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
        if chatting { return .chat }
        if greeting != nil { return .greeting }
        if quip != nil { return .quip }
        if toast != nil { return .toast }
        if question != nil { return .ask }
        if checkingIn != nil { return .checkin }
        if bubbleOpen { return .full }
        return nil
    }

    var look: Int {
        lookX > 0.4 ? 1 : lookX < -0.4 ? -1 : 0
    }

    var expression: Expression {
        if mode == .held || flying { return .flustered }
        if mode == .sleep { return .asleep }
        if chatting && asking { return .thinking }
        if error != nil && digest == nil { return .glitch }
        if toast != nil || greeting != nil || mode == .alert { return .alert }
        if Date() < annoyedUntil { return .annoyed }
        if refreshing { return .thinking }
        if bubbleOpen || chatting || quip != nil || question != nil || checkingIn != nil { return .talking }
        if attention > 0 { return .focused }
        if let digest, digest.insights.isEmpty, digest.sources.contains(where: \.ok) { return .chill }
        return grump >= 2 ? .annoyed : .neutral
    }

    func tick(dt: Double, world: World) {
        let now = Date()
        phase += dt
        context = world.context
        updateTimers(now)
        updateLife(now, world, dt)
        if mode == .held { return }

        if case .flight(let v) = motion {
            fly(v, dt, world)
            return
        }

        if mode != .alert && !bubbleOpen && !chatting {
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
        if bubbleOpen || chatting || checkingIn != nil || mode != .rest { return }

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
            let hovered = now.timeIntervalSince(hoverSince!)
            if hovered > 0.8 && hovered < 2.6 && bit == nil && now.timeIntervalSince(lastBlush) > (bond.affection >= 6 ? 240 : 600) {
                lastBlush = now
                play(.blush, now)
            }
            if hovered > 2.6 {
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
            if toast?.priority == 1 && !toastOpened { grump = min(3, grump + 1) }
            toast = nil
            if mode == .alert { mode = .rest }
        }
        if quip != nil && now >= quipUntil { quip = nil }
        if question != nil && now >= questionUntil { question = nil }
        let sinceToast = now.timeIntervalSince(toastStart)
        if (toast != nil || greeting != nil) && sinceToast < 1.6 {
            let cycle = sinceToast.truncatingRemainder(dividingBy: 0.8)
            hop = cycle < 0.32 ? CGFloat(sin(cycle / 0.32 * .pi)) * 5 : 0
        } else if hop != 0 {
            hop = 0
        }
    }

    private func updateLife(_ now: Date, _ world: World, _ dt: Double) {
        let next = Attire(hood: context.evening, headphones: context.audio, dim: context.lateNight)
        if attire != next { attire = next }
        let pulse: CGFloat = context.audio && mode == .rest && bubbleKind == nil ? (sin(phase * 2 * .pi * 1.9) > 0.3 ? 1 : 0) : 0
        if beat != pulse { beat = pulse }

        if now >= grumpDecay {
            grumpDecay = now.addingTimeInterval(1800)
            grump = max(0, grump - 1)
        }

        if let current = bit {
            bitProgress = now.timeIntervalSince(bitStart) / current.duration
            if bitProgress >= 1 { bit = nil; bitProgress = 0 }
        }

        let calm = mode == .rest && bubbleKind == nil && !flying && { if case .still = motion { return true } else { return false } }()
        if bit == nil && calm && now >= nextBit {
            nextBit = now.addingTimeInterval(.random(in: 18...45))
            play(pickBit(world), now)
        }
        if context.app == .coding && world.userIdle < 60 { bond.coding[Bond.day(), default: 0] += dt }
        if now.timeIntervalSince(bondSaved) > 30 {
            bondSaved = now
            bond.save()
        }
        events(now, world)
        planDuties(now, world)

        if calm && now >= nextLine && world.keyIdle > 5 {
            nextLine = now.addingTimeInterval(.random(in: 480...900))
            let options = Lines.ambient(context: context, digest: digest, grump: grump, bond: bond).filter { !recentLines.contains($0) }
            if let line = options.randomElement() {
                recentLines = Array((recentLines + [line]).suffix(8))
                say(line, for: 3.5)
            }
        }
    }

    private func events(_ now: Date, _ world: World) {
        if world.userIdle > 900 {
            away = true
        } else if away && world.userIdle < 2 {
            away = false
            react("back", ["Oh. You're back.", "Took you long enough.", "Missed me? Don't answer."], cooldown: 1800, now)
        }
        if context.appName != lastApp {
            if !lastApp.isEmpty {
                switches = switches.filter { now.timeIntervalSince($0) < 180 } + [now]
                if context.app == .video && lastKind == .coding { react("break", ["Break? Ten minutes. I'm counting.", "Oh, we're watching stuff now."], cooldown: 2400, now) }
                if switches.count >= 12 {
                    switches = []
                    react("switch", ["Pick one app. Any app.", "Focus. Look it up."], cooldown: 1200, now)
                }
            }
            lastApp = context.appName
            lastKind = context.app
        }
        if wasLowBattery && context.charging { react("charge", ["Better.", "Finally. Power."], cooldown: 1800, now) }
        wasLowBattery = context.lowBattery
        if !wasOnline && context.online { react("online", ["Wi-Fi's back. You're welcome."], cooldown: 900, now) }
        wasOnline = context.online
    }

    private func react(_ id: String, _ lines: [String], cooldown: TimeInterval, _ now: Date) {
        guard now.timeIntervalSince(lastEvent) > 60, now >= cooldowns[id, default: .distantPast], bubbleKind == nil, mode != .held, !flying else { return }
        lastEvent = now
        cooldowns[id] = now.addingTimeInterval(cooldown)
        say(lines.randomElement()!, for: 2.8)
    }

    private func planDuties(_ now: Date, _ world: World) {
        guard now.timeIntervalSince(lastPlanCheck) > 15 else { return }
        lastPlanCheck = now
        guard let plan = digest?.plan, plan.date == Bond.day(), bubbleKind == nil, mode == .rest, !flying, world.userIdle < 120 else { return }
        var nudged = Set(UserDefaults.standard.stringArray(forKey: Self.nudgedKey) ?? [])
        for nudge in plan.nudges {
            guard let at = plan.time(nudge.at), now >= at, now.timeIntervalSince(at) < 1200 else { continue }
            let key = "\(plan.date) \(nudge.at)"
            guard !nudged.contains(key) else { continue }
            nudged.insert(key)
            UserDefaults.standard.set(Array(nudged.suffix(60)), forKey: Self.nudgedKey)
            say(nudge.text, for: 6)
            return
        }
        if plan.done == nil, let at = plan.time(plan.checkinAt), now >= at, now.timeIntervalSince(lastCheckinAsk) > 3600 {
            lastCheckinAsk = now
            checks = plan.focus.map { _ in false }
            checkingIn = plan
            motion = .still
        }
    }

    func submitCheckin() {
        guard let plan = checkingIn else { return }
        let done = plan.focus.indices.map { checks.indices.contains($0) && checks[$0] }
        checkingIn = nil
        let count = done.filter { $0 }.count
        bond.affection = min(10, bond.affection + (count == done.count ? 2 : count > 0 ? 1 : 0))
        grump = max(0, grump - 1)
        bond.save()
        let line: String
        if count == done.count { line = ["Look at you. Proud. Slightly.", "All of it. Who are you.", "Fine. Impressive."].randomElement()! }
        else if count == 0 { line = ["Zero. Bold. Tomorrow you're mine.", "Nothing? Noted. Tomorrow.", "Wow. Okay. Tomorrow, then."].randomElement()! }
        else { line = "\(count) of \(done.count). Tomorrow, the rest." }
        say(line, for: 3)
        Task {
            if let next = try? await Daemon.checkin(done) { digest = next }
        }
    }

    func openChat() {
        pendingToast = nil
        toast = nil
        greeting = nil
        quip = nil
        question = nil
        checkingIn = nil
        bubbleOpen = false
        bit = nil
        motion = .still
        if mode == .sleep || mode == .alert { mode = .rest }
        if let last = chatLog.last, Date().timeIntervalSince(last.at) > 3 * 3600 { chatLog = [] }
        chatting = true
    }

    func closeChat() {
        chatting = false
    }

    func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !asking else { return }
        if !chatting { openChat() }
        draft = ""
        chatLog.append(ChatLine(mine: true, text: text, at: Date()))
        asking = true
        if Date().timeIntervalSince(lastWarmth) > 600 {
            lastWarmth = Date()
            bond.affection = min(10, bond.affection + 1)
            grump = max(0, grump - 1)
        }
        let laptop = laptopSummary()
        Task {
            do {
                let (reply, next) = try await Daemon.ask(text, laptop: laptop)
                chatLog.append(ChatLine(mine: false, text: reply, at: Date()))
                if let next { digest = next }
            } catch {
                chatLog.append(ChatLine(mine: false, text: "Brain's offline. \(error.localizedDescription)", at: Date()))
            }
            asking = false
        }
    }

    func replan() {
        say("Fine. Rethinking your day.", for: 2.5)
        Task {
            if let next = try? await Daemon.replan() {
                digest = next
                if let plan = next.plan, !plan.focus.isEmpty { UserDefaults.standard.removeObject(forKey: Self.planShownKey); apply(next) }
            }
        }
    }

    private func laptopSummary() -> String {
        let now = Date()
        var parts: [String] = []
        if !context.appName.isEmpty { parts.append("In \(context.appName) for \(Int(now.timeIntervalSince(context.appSince) / 60)) min") }
        let coded = bond.codingToday
        if coded > 300 { parts.append("Coded \(Int(coded / 3600))h \(Int(coded.truncatingRemainder(dividingBy: 3600) / 60))m today") }
        if let start = context.sessionStart { parts.append("At the laptop \(Int(now.timeIntervalSince(start) / 60)) min straight") }
        if let battery = context.battery { parts.append("Battery \(battery)%\(context.charging ? " charging" : "")") }
        if context.audio { parts.append("Audio playing") }
        if !context.online { parts.append("Offline") }
        return parts.joined(separator: ". ")
    }

    private func pickBit(_ world: World) -> Bit {
        var pool: [(Bit, Double)] = [
            (.pushShades, 3), (.hairFlick, 3), (.lookAround, 3), (.codeFlicker, 2), (.phone, 1.5),
            (.eyeRoll, grump >= 1 ? 3 : 1.5), (.yawn, context.lateNight ? 4 : 0.8), (.coffee, context.morning ? 4 : 0.6),
        ]
        if context.app == .coding && world.keyIdle < 10 { pool.append((.typing, 7)) }
        if context.app == .video { pool.append((.popcorn, 7)) }
        if context.app == .chat { pool.append((.phone, 5)) }
        if context.lowBattery { pool.append((.tired, 6)) }
        let total = pool.reduce(0) { $0 + $1.1 }
        var roll = Double.random(in: 0..<total)
        for (bit, weight) in pool {
            roll -= weight
            if roll < 0 { return bit }
        }
        return .lookAround
    }

    private func play(_ next: Bit, _ now: Date) {
        bit = next
        bitStart = now
        bitProgress = 0
    }

    func trick() {
        guard mode != .held else { return }
        play(.pose, Date())
        say(Quips.trick.randomElement()!, for: 2)
    }

    private func fly(_ velocity: CGVector, _ dt: Double, _ world: World) {
        var v = velocity
        let size = Self.size
        let index = screenIndex(containing: CGPoint(x: position.x + size.width / 2, y: position.y + size.height / 2), world)
        let frame = world.screens[index].visibleFrame
        let old = position
        v.dy -= 2000 * CGFloat(dt)
        position.x += v.dx * CGFloat(dt)
        position.y += v.dy * CGFloat(dt)
        if position.x < frame.minX { position.x = frame.minX; v.dx = -v.dx * 0.55 }
        if position.x > frame.maxX - size.width { position.x = frame.maxX - size.width; v.dx = -v.dx * 0.55 }
        if position.y > frame.maxY - size.height { position.y = frame.maxY - size.height; v.dy = -v.dy * 0.4 }

        if v.dy < 0, let w = world.windows.first(where: { w in
            perchable(w, world) && old.y >= w.frame.maxY - 2 && position.y < w.frame.maxY - 2
                && position.x + size.width / 2 > w.frame.minX && position.x + size.width / 2 < w.frame.maxX
        }), abs(v.dy) < 700 {
            position.y = w.frame.maxY - 2
            land(world)
            return
        }
        if position.y <= frame.minY {
            position.y = frame.minY
            if abs(v.dy) > 320 {
                v.dy = -v.dy * 0.38
                v.dx *= 0.75
            } else {
                land(world)
                return
            }
        }
        motion = .flight(v)
    }

    private func land(_ world: World) {
        motion = .still
        flying = false
        settle(at: position, world)
        UserDefaults.standard.set([Double(position.x), Double(position.y)], forKey: Self.homeKey)
        placedUntil = Date().addingTimeInterval(600)
        annoyedUntil = Date().addingTimeInterval(2.5)
        say(Quips.thrown.randomElement()!, for: 2.2)
    }

    private func say(_ line: String, for seconds: TimeInterval) {
        guard greeting == nil, toast == nil, question == nil, checkingIn == nil, !bubbleOpen, !chatting else { return }
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
        if chatting {
            closeChat()
            return
        }
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
        toggleBubble()
    }

    func dismissBubble() {
        if chatting {
            closeChat()
            return
        }
        if checkingIn != nil {
            checkingIn = nil
            return
        }
        if bubbleOpen {
            toggleBubble()
            return
        }
        question = nil
        toast = nil
        greeting = nil
        quip = nil
        pendingToast = nil
        if mode == .alert { mode = .rest }
    }

    func toggleBubble() {
        chatting = false
        checkingIn = nil
        question = nil
        toast = nil
        greeting = nil
        quip = nil
        pendingToast = nil
        bubbleOpen.toggle()
        if bubbleOpen {
            grump = max(0, grump - 1)
            bit = nil
            markAllSeen()
            if mode == .sleep || mode == .alert { mode = .rest }
            motion = .still
        } else if mode == .alert {
            mode = .rest
        }
    }

    func grab() {
        chatting = false
        checkingIn = nil
        bubbleOpen = false
        toast = nil
        greeting = nil
        quip = nil
        motion = .still
        walking = false
        relocateStart = nil
        opacity = 1
        flying = false
        bit = nil
        mode = .held
    }

    func drop(world: World, velocity: CGVector = .zero, shaken: Bool = false) {
        mode = .rest
        if shaken {
            play(.dizzy, Date())
            annoyedUntil = Date().addingTimeInterval(4)
        }
        if hypot(velocity.dx, velocity.dy) > 650 {
            flying = true
            motion = .flight(CGVector(dx: max(-2400, min(2400, velocity.dx)), dy: max(-2400, min(2400, velocity.dy))))
            return
        }
        if shaken {
            settle(at: position, world)
            say(Quips.shaken.randomElement()!, for: 2.4)
            return
        }
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
        let busy = bubbleOpen || chatting || checkingIn != nil
        let top = busy ? nil : fresh.min(by: { $0.priority < $1.priority })
        let plan = busy ? nil : freshPlan(next)
        if let top {
            seen.insert(top.id)
            saveSeen()
        }

        let today = ISO8601DateFormatter.string(from: Date(), timeZone: .current, formatOptions: [.withFullDate])
        if UserDefaults.standard.string(forKey: Self.greetingKey) != today && !busy && mode != .held {
            UserDefaults.standard.set(today, forKey: Self.greetingKey)
            let name = NSFullUserName().split(separator: " ").first.map(String.init) ?? "Neo"
            let day = Bond.day()
            let gap = bond.lastDay.isEmpty ? nil : Bond.gap(from: bond.lastDay, to: day)
            if bond.lastDay != day {
                bond.streak = gap == 1 ? bond.streak + 1 : 1
                bond.lastDay = day
                bond.save()
            }
            greeting = Lines.greeting(name: name, streak: bond.streak, gap: gap, hour: Calendar.current.component(.hour, from: Date()))
            greetingStart = Date()
            toastStart = Date()
            if top == nil, let plan {
                markShown(plan)
                pendingToast = planInsight(plan)
            } else {
                pendingToast = top
            }
            mode = .alert
            return
        }
        if let top { show(top); return }
        if let plan {
            markShown(plan)
            show(planInsight(plan))
            return
        }
        if !bubbleOpen, let due = dueReminder(next) { show(due); return }
        if !bubbleOpen, question == nil, toast == nil, let ask = nextQuestion(next) { question = ask; questionUntil = Date().addingTimeInterval(30) }
    }

    private func freshPlan(_ digest: Digest) -> Plan? {
        guard let plan = digest.plan, plan.date == Bond.day(), !plan.focus.isEmpty, UserDefaults.standard.string(forKey: Self.planShownKey) != plan.date else { return nil }
        return plan
    }

    private func markShown(_ plan: Plan) {
        UserDefaults.standard.set(plan.date, forKey: Self.planShownKey)
    }

    private func planInsight(_ plan: Plan) -> Insight {
        Insight(id: "plan:\(plan.date)", source: "trinity", priority: 2, title: "Today: \(plan.focus[0])", detail: plan.focus.dropFirst().joined(separator: " · "), from: nil, chat: nil, group: nil, url: nil)
    }

    private func nextQuestion(_ digest: Digest) -> Upcoming? {
        var asked = UserDefaults.standard.dictionary(forKey: Self.askedKey) as? [String: Double] ?? [:]
        let now = Date().timeIntervalSince1970
        guard let item = (digest.upcoming ?? []).first(where: { ($0.status ?? "pending") == "pending" && now - (asked[$0.id] ?? 0) > 6 * 3600 }) else { return nil }
        asked[item.id] = now
        UserDefaults.standard.set(asked.filter { now - $0.value < 14 * 86400 }, forKey: Self.askedKey)
        return item
    }

    func answer(remind: Bool) {
        guard let item = question else { return }
        question = nil
        grump = max(0, grump - 1)
        say(remind ? ["Noted. I'll remind you.", "Fine. I'll nag you.", "Got it."].randomElement()! : ["Forgotten.", "Whatever you say.", "Gone."].randomElement()!, for: 2)
        Task {
            if let next = try? await Daemon.setUpcoming(item.id, status: remind ? "remind" : "skip") { digest = next }
        }
    }

    private func dueReminder(_ digest: Digest) -> Insight? {
        let now = Date()
        var reminded = Set(UserDefaults.standard.stringArray(forKey: Self.remindedKey) ?? [])
        for item in digest.upcoming ?? [] where item.status == "remind" {
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
        toastOpened = false
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
