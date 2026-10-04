import AppKit
import SwiftUI

final class PetPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}

final class PetHostingView: NSHostingView<PetScene> {
    weak var controller: PetController?

    override func mouseDown(with event: NSEvent) {
        if controller?.handleMouseDown() != true { super.mouseDown(with: event) }
    }

    override func mouseDragged(with event: NSEvent) {
        if controller?.handleMouseDragged(event) != true { super.mouseDragged(with: event) }
    }

    override func mouseUp(with event: NSEvent) {
        if controller?.handleMouseUp() != true { super.mouseUp(with: event) }
    }

    override func rightMouseDown(with event: NSEvent) {
        if controller?.handleRightMouseDown(event, in: self) != true { super.rightMouseDown(with: event) }
    }
}

@MainActor
final class PetController: NSObject {
    private let windowSize = CGSize(width: 340, height: 440)
    private let model = PetModel()
    private let layout = PetLayout()
    private let panel: PetPanel
    private let host: PetHostingView
    private var timer: Timer?
    private var poll: Timer?
    private var lastTick = Date()
    private var windows: [WindowInfo] = []
    private var windowsAt = Date.distantPast
    private var grabOffset = CGPoint.zero
    private var dragDistance: CGFloat = 0
    private var pressing = false
    private var activity: NSObjectProtocol?

    override init() {
        panel = PetPanel(contentRect: NSRect(origin: .zero, size: windowSize), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        host = PetHostingView(rootView: PetScene(model: model, layout: layout, height: windowSize.height))
        super.init()
        host.controller = self
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        panel.isMovable = false
        panel.hidesOnDeactivate = false
        panel.contentView = host

        let visible = (NSScreen.screens.first ?? NSScreen.main!).visibleFrame
        model.position = CGPoint(x: visible.midX, y: visible.minY)
    }

    func start() {
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiatedAllowingIdleSystemSleep, .latencyCritical], reason: "Trinity pet animation")
        panel.orderFrontRegardless()
        timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(timer!, forMode: .common)
        poll = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.model.refresh() }
        }
        model.refresh()
    }

    private var creatureRect: CGRect {
        CGRect(origin: model.position, size: PetModel.size).insetBy(dx: -2, dy: -2)
    }

    private func world() -> World {
        if Date().timeIntervalSince(windowsAt) > 0.25 {
            windows = Self.visibleWindows()
            windowsAt = Date()
        }
        let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
        return World(screens: NSScreen.screens, windows: windows, cursor: NSEvent.mouseLocation, userIdle: idle)
    }

    private static func visibleWindows() -> [WindowInfo] {
        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
        let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
        let me = ProcessInfo.processInfo.processIdentifier
        return list.compactMap { info in
            guard (info[kCGWindowLayer as String] as? Int) == 0,
                  (info[kCGWindowOwnerPID as String] as? Int32) != me,
                  (info[kCGWindowAlpha as String] as? Double ?? 1) > 0.1,
                  let id = info[kCGWindowNumber as String] as? Int,
                  let bounds = info[kCGWindowBounds as String] as? [String: CGFloat],
                  let x = bounds["X"], let y = bounds["Y"], let w = bounds["Width"], let h = bounds["Height"],
                  w > 160, h > 100
            else { return nil }
            return WindowInfo(id: id, frame: CGRect(x: x, y: primaryHeight - y - h, width: w, height: h))
        }
    }

    private func tick() {
        let now = Date()
        let dt = min(now.timeIntervalSince(lastTick), 0.1)
        lastTick = now

        if model.hidden {
            if panel.isVisible { panel.orderOut(nil) }
            return
        }
        if !panel.isVisible { panel.orderFrontRegardless() }

        model.tick(dt: dt, world: world())

        let size = PetModel.size
        let center = CGPoint(x: model.position.x + size.width / 2, y: model.position.y + size.height / 2)
        let screen = NSScreen.screens.first(where: { $0.frame.contains(center) }) ?? NSScreen.screens.first ?? NSScreen.main!
        let full = screen.frame
        let above = full.maxY - (model.position.y + size.height) > 300
        let x = min(max(model.position.x + size.width / 2 - windowSize.width / 2, full.minX), full.maxX - windowSize.width)
        let y = above ? model.position.y - 14 : model.position.y + size.height + 14 - windowSize.height
        let frame = NSRect(x: x, y: y, width: windowSize.width, height: windowSize.height)
        if panel.frame != frame { panel.setFrame(frame, display: false) }

        let creature = CGPoint(x: model.position.x - x, y: model.position.y - y)
        if layout.creature != creature { layout.creature = creature }
        if layout.above != above { layout.above = above }
        let bubbleX = min(max(creature.x + size.width / 2 - 150, 8), windowSize.width - 308)
        if layout.bubbleX != bubbleX { layout.bubbleX = bubbleX }

        let showingBubble = model.bubbleOpen || model.toast != nil || model.greeting != nil
        let ignore = !(showingBubble || pressing || creatureRect.contains(NSEvent.mouseLocation))
        if panel.ignoresMouseEvents != ignore { panel.ignoresMouseEvents = ignore }
    }

    func handleMouseDown() -> Bool {
        let point = NSEvent.mouseLocation
        guard creatureRect.contains(point) else { return false }
        pressing = true
        dragDistance = 0
        grabOffset = CGPoint(x: point.x - model.position.x, y: point.y - model.position.y)
        return true
    }

    func handleMouseDragged(_ event: NSEvent) -> Bool {
        guard pressing else { return false }
        let point = NSEvent.mouseLocation
        dragDistance += abs(event.deltaX) + abs(event.deltaY)
        if dragDistance > 4 && model.mode != .held { model.grab() }
        if model.mode == .held {
            model.position = CGPoint(x: point.x - grabOffset.x, y: point.y - grabOffset.y)
        }
        return true
    }

    func handleMouseUp() -> Bool {
        guard pressing else { return false }
        pressing = false
        if model.mode == .held {
            windowsAt = .distantPast
            model.drop(world: world())
        } else {
            model.toggleBubble()
            if model.digest == nil { model.refresh() }
        }
        return true
    }

    func handleRightMouseDown(_ event: NSEvent, in view: NSView) -> Bool {
        guard creatureRect.contains(NSEvent.mouseLocation) else { return false }
        let menu = NSMenu()
        menu.addItem(item("Refresh insights", #selector(refreshNow)))
        menu.addItem(item("Open Trinity", #selector(openTrinity)))
        menu.addItem(item("Hide for an hour", #selector(hideForAnHour)))
        menu.addItem(.separator())
        menu.addItem(item("Quit", #selector(quit)))
        NSMenu.popUpContextMenu(menu, with: event, for: view)
        return true
    }

    private func item(_ title: String, _ action: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        return item
    }

    @objc private func refreshNow() { model.refresh(force: true) }

    @objc private func openTrinity() { open("http://localhost:6070/") }

    @objc private func hideForAnHour() {
        model.hidden = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 3600) { [weak self] in self?.model.hidden = false }
    }

    @objc private func quit() { NSApp.terminate(nil) }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controller: PetController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        MainActor.assumeIsolated {
            let controller = PetController()
            controller.start()
            self.controller = controller
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
