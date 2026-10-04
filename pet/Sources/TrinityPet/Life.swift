import AppKit
import CoreAudio
import IOKit.ps
import Network

enum AppKind: Equatable {
    case coding
    case video
    case chat
    case browser
    case other
}

struct Context: Equatable {
    var app: AppKind = .other
    var appName = ""
    var appSince = Date()
    var audio = false
    var battery: Int?
    var charging = true
    var online = true
    var sessionStart: Date?

    var hour: Int { Calendar.current.component(.hour, from: Date()) }
    var lateNight: Bool { (0..<5).contains(hour) }
    var evening: Bool { hour >= 19 || hour < 5 }
    var morning: Bool { (6..<11).contains(hour) }
    var lowBattery: Bool { (battery ?? 100) < 15 && !charging }
}

@MainActor
final class ContextSampler {
    private(set) var context = Context()
    private var lastSample = Date.distantPast
    private let monitor = NWPathMonitor()
    private var online = true

    private static let coding: Set<String> = [
        "com.mitchellh.ghostty", "com.apple.Terminal", "com.googlecode.iterm2", "com.microsoft.VSCode",
        "com.todesktop.230313mzl4w4u92", "dev.zed.Zed", "com.apple.dt.Xcode", "dev.warp.Warp-Stable", "com.exafunction.windsurf",
    ]
    private static let video: Set<String> = ["org.videolan.vlc", "com.colliderli.iina", "com.apple.QuickTimePlayerX", "com.apple.TV", "com.netflix.Netflix"]
    private static let chat: Set<String> = ["net.whatsapp.WhatsApp", "com.tinyspeck.slackmacgap", "com.hnc.Discord", "ru.keepcoder.Telegram", "com.apple.MobileSMS"]
    private static let browsers: Set<String> = ["com.google.Chrome", "com.apple.Safari", "company.thebrowser.Browser", "org.mozilla.firefox", "com.brave.Browser", "com.microsoft.edgemac"]

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let up = path.status == .satisfied
            DispatchQueue.main.async { self?.online = up }
        }
        monitor.start(queue: DispatchQueue(label: "trinity.net"))
    }

    func sample(userIdle: TimeInterval) -> Context {
        let now = Date()
        guard now.timeIntervalSince(lastSample) > 2 else { return context }
        lastSample = now
        var next = context

        let front = NSWorkspace.shared.frontmostApplication
        let id = front?.bundleIdentifier ?? ""
        let kind: AppKind = Self.coding.contains(id) || id.hasPrefix("com.jetbrains") ? .coding
            : Self.video.contains(id) ? .video
            : Self.chat.contains(id) ? .chat
            : Self.browsers.contains(id) ? .browser
            : .other
        let name = front?.localizedName ?? ""
        if name != next.appName { next.appSince = now }
        next.app = kind
        next.appName = name
        next.audio = Self.audioPlaying()
        (next.battery, next.charging) = Self.battery()
        next.online = online
        if userIdle > 300 { next.sessionStart = nil } else if next.sessionStart == nil { next.sessionStart = now }
        context = next
        return next
    }

    private static func audioPlaying() -> Bool {
        var device = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDefaultOutputDevice, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device) == noErr else { return false }
        var running = UInt32(0)
        size = UInt32(MemoryLayout<UInt32>.size)
        address.mSelector = kAudioDevicePropertyDeviceIsRunningSomewhere
        guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &running) == noErr else { return false }
        return running != 0
    }

    private static func battery() -> (Int?, Bool) {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef] else { return (nil, true) }
        for source in list {
            guard let d = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any] else { continue }
            let level = d[kIOPSCurrentCapacityKey] as? Int
            let charging = (d[kIOPSPowerSourceStateKey] as? String) == kIOPSACPowerValue
            return (level, charging)
        }
        return (nil, true)
    }
}

enum Lines {
    static func ambient(context: Context, digest: Digest?, grump: Int, now: Date = Date()) -> [String] {
        var out: [String] = []
        let hour = context.hour
        let appHours = now.timeIntervalSince(context.appSince) / 3600
        let sessionHours = context.sessionStart.map { now.timeIntervalSince($0) / 3600 } ?? 0

        if context.lateNight {
            out += ["It's \(hour == 0 ? 12 : hour)am. Bold.", "Go to sleep. The bugs will still be there tomorrow.", "Night owl mode. Noted."]
        }
        if context.morning { out += ["Morning. Coffee first, then chaos.", "You're up. Good. Things need doing."] }
        if context.app == .coding && appHours > 1.5 {
            out.append("\(Int(appHours))h in \(context.appName). Impressive. Concerning.")
        }
        if sessionHours > 3 { out += ["Three hours straight. Water. Now.", "Stand up. Stretch. I'll wait."] }
        if context.app == .chat && appHours > 0.5 { out.append("Still on \(context.appName)? Riveting.") }
        if context.audio { out += ["Nice track. Probably.", "Turn it up. Or don't."] }
        if context.lowBattery, let b = context.battery { out.append("\(b)% battery. Plug in or perish.") }
        if !context.online { out.append("Wi-Fi's dead. Don't look at me.") }
        if Calendar.current.component(.weekday, from: now) == 6 && hour >= 18 { out.append("Friday night and you're here. Respect.") }

        if let digest {
            if let urgent = digest.insights.first(where: { $0.priority == 1 }), let who = urgent.from, urgent.group != true {
                out.append("\(who)'s still waiting on you.")
            }
            for item in digest.upcoming ?? [] where item.status == "remind" {
                guard let date = item.date else { continue }
                if Calendar.current.isDateInTomorrow(date) { out.append("\(item.what) is tomorrow. Ready?") }
                if Calendar.current.isDateInToday(date) && date > now { out.append("\(item.what) today. Don't forget.") }
            }
            if digest.insights.isEmpty { out.append("Nothing's on fire. Enjoy it.") }
        }
        if grump >= 2 { out += ["Still ignoring me? Cool.", "I see how it is."] }
        if out.isEmpty { out = ["I'm watching. Casually.", "Carry on.", "Hm."] }
        return out
    }
}
