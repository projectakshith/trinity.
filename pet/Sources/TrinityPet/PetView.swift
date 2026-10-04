import AppKit
import CoreText
import SwiftUI

enum Theme {
    static let surface = Color(red: 0.122, green: 0.118, blue: 0.114)
    static let raised = Color(red: 0.161, green: 0.157, blue: 0.149)
    static let line = Color.white.opacity(0.08)
    static let text = Color(red: 0.925, green: 0.922, blue: 0.906)
    static let text2 = Color(red: 0.667, green: 0.651, blue: 0.624)
    static let text3 = Color(red: 0.459, green: 0.447, blue: 0.424)
    static let signal = Color(red: 0.56, green: 0.81, blue: 0.54)
    static let code = Color(red: 0.36, green: 1.0, blue: 0.45)
    static let ember = Color(red: 1.0, green: 0.48, blue: 0.32)
    static let blue = Color(red: 0.45, green: 0.66, blue: 1.0)
    static let red = Color(red: 0.94, green: 0.49, blue: 0.41)

    static func serif(_ size: CGFloat, italic: Bool = false) -> Font {
        .custom(italic ? "InstrumentSerif-Italic" : "InstrumentSerif-Regular", size: size)
    }

    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom("Afacad", size: size).weight(weight)
    }

    static func registerFonts() {
        guard let urls = Bundle.module.urls(forResourcesWithExtension: "ttf", subdirectory: "Fonts") else { return }
        for url in urls { CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil) }
    }
}

private struct HeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

enum BubbleKind: Equatable {
    case greeting
    case quip
    case toast
    case ask
    case full
}

struct PetBubble: View {
    @ObservedObject var model: PetModel
    @ObservedObject var layout: PetLayout
    let kind: BubbleKind

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Group {
                switch kind {
                case .greeting:
                    greeting(model.greeting ?? layout.frozenText)
                case .quip:
                    Text(model.quip ?? layout.frozenText).font(Theme.serif(21, italic: true)).foregroundStyle(Theme.text)
                case .toast:
                    if let toast = model.toast ?? layout.frozenToast { InsightRow(insight: toast) }
                case .ask:
                    if let item = model.question ?? layout.frozenQuestion { ask(item) }
                case .full:
                    content
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, kind == .full ? 0 : 16)
            if kind == .full { footer }
        }
        .frame(width: 320, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.line))
        .shadow(color: .black.opacity(0.35), radius: 22, y: 10)
        .environment(\.colorScheme, .dark)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("Trinity").font(Theme.serif(22)).foregroundStyle(Theme.text)
            Text(stamp).font(Theme.sans(12)).foregroundStyle(Theme.text3)
            Spacer()
            Button { model.dismissBubble() } label: {
                Image(systemName: "minus")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.text2)
                    .frame(width: 24, height: 24)
                    .background(Theme.raised, in: Circle())
            }
            .buttonStyle(.plain)
            .alignmentGuide(.firstTextBaseline) { d in d[VerticalAlignment.center] + 4 }
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 8)
    }

    private func ask(_ item: Upcoming) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Want a reminder?").font(Theme.serif(21, italic: true)).foregroundStyle(Theme.text)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(item.label).font(Theme.sans(12.5, .medium)).foregroundStyle(Theme.signal)
                Text(item.what + (item.who.map { " · \($0)" } ?? "")).font(Theme.sans(15, .medium)).foregroundStyle(Theme.text).lineLimit(2)
            }
            HStack(spacing: 8) {
                Button { model.answer(remind: true) } label: { Text("Remind me") }.buttonStyle(PillButton(primary: true))
                Button { model.answer(remind: false) } label: { Text("Nah") }.buttonStyle(PillButton())
            }
        }
    }

    private var stamp: String {
        if model.refreshing { return "syncing…" }
        if model.toast != nil { return "new" }
        guard let digest = model.digest, model.greeting == nil, model.quip == nil else { return "" }
        let date = Date(timeIntervalSince1970: digest.generatedAt / 1000)
        return RelativeDateTimeFormatter().localizedString(for: date, relativeTo: Date())
    }

    private func greeting(_ line: String) -> some View {
        let shown = String(line.prefix(model.greetingProgress))
        let caret = model.greetingProgress < line.count || Int(model.phase * 2) % 2 == 0
        return HStack(alignment: .lastTextBaseline, spacing: 2) {
            Text(shown).font(Theme.serif(24, italic: true)).foregroundStyle(Theme.text)
            Rectangle().fill(Theme.code).frame(width: 2, height: 20).opacity(caret ? 1 : 0)
        }
    }

    @ViewBuilder
    private var content: some View {
        if let error = model.error, model.digest == nil {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("✖").font(Theme.sans(13)).foregroundStyle(Theme.red)
                Text(error).font(Theme.sans(14)).foregroundStyle(Theme.text2).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.bottom, 12)
        } else if let digest = model.digest {
            Text(digest.headline)
                .font(Theme.serif(21))
                .foregroundStyle(Theme.text)
                .lineSpacing(1)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 10)
            ScrollView(.vertical, showsIndicators: true) {
                list(digest).background(GeometryReader { g in Color.clear.preference(key: HeightKey.self, value: g.size.height) })
            }
            .frame(height: min(max(layout.listHeight, 1), layout.listCap))
            .onPreferenceChange(HeightKey.self) { value in DispatchQueue.main.async { layout.listHeight = value } }
        } else {
            Text("Gathering…").font(Theme.serif(19, italic: true)).foregroundStyle(Theme.text2).padding(.bottom, 12)
        }
    }

    private func list(_ digest: Digest) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(digest.insights) { insight in
                Rectangle().fill(Theme.line).frame(height: 1)
                InsightRow(insight: insight).padding(.vertical, 11)
            }
            if let upcoming = digest.upcoming, !upcoming.isEmpty {
                Rectangle().fill(Theme.line).frame(height: 1)
                VStack(alignment: .leading, spacing: 7) {
                    Text("Coming up").font(Theme.sans(12, .semibold)).foregroundStyle(Theme.text3)
                    ForEach(upcoming.prefix(5)) { u in
                        let reminding = u.status == "remind"
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text((reminding ? "◈ " : "◇ ") + u.label).font(Theme.sans(12.5, .medium)).foregroundStyle(reminding ? Theme.signal : Theme.text3).frame(width: 110, alignment: .leading)
                            Text(u.what + (u.who.map { " · \($0)" } ?? "")).font(Theme.sans(14)).foregroundStyle(Theme.text).lineLimit(2)
                        }
                    }
                }
                .padding(.vertical, 11)
            }
            let off = digest.sources.filter { !$0.ok }
            if !off.isEmpty {
                Rectangle().fill(Theme.line).frame(height: 1)
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(off, id: \.source) { s in
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("◌").font(Theme.sans(12)).foregroundStyle(Theme.text3)
                            Text("\(s.source.capitalized) off").font(Theme.sans(12.5, .medium)).foregroundStyle(Theme.text2)
                            Text(s.error ?? "").font(Theme.sans(12)).foregroundStyle(Theme.text3).lineLimit(1)
                        }
                    }
                }
                .padding(.vertical, 10)
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 8) {
            Button { model.refresh(force: true) } label: {
                Text(model.refreshing ? "Refreshing…" : "Refresh")
            }
            .disabled(model.refreshing)
            Button { open("http://localhost:6070/brief/") } label: { Text("Open Trinity") }
            Spacer()
        }
        .buttonStyle(PillButton())
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }
}

struct PillButton: ButtonStyle {
    var primary = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.sans(13.5, .medium))
            .foregroundStyle(primary ? Theme.surface : Theme.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background((primary ? Theme.text : Theme.raised).opacity(configuration.isPressed ? 0.7 : 1), in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.line))
    }
}

struct InsightRow: View {
    let insight: Insight

    private var tone: (glyph: String, color: Color) {
        switch insight.priority {
        case 1: return ("◈", Theme.ember)
        case 2: return ("◇", Theme.blue)
        default: return ("⬡", Theme.text3)
        }
    }

    private var place: String {
        let source = ["whatsapp": "WhatsApp", "mail": "Mail", "calendar": "Calendar"][insight.source] ?? insight.source.capitalized
        let chat = insight.chat ?? insight.from
        var parts = [source]
        if let chat, !chat.isEmpty { parts.append(chat) }
        if let sender = insight.from, !sender.isEmpty, sender != chat { parts.append(sender) }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        Button {
            if let url = insight.url { open(url) } else if insight.source == "whatsapp" { open("whatsapp://") }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(tone.glyph).font(Theme.sans(13)).foregroundStyle(tone.color).frame(width: 14)
                VStack(alignment: .leading, spacing: 2) {
                    Text(insight.title)
                        .font(Theme.sans(15.5, .medium))
                        .foregroundStyle(Theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(place)
                        .font(Theme.sans(12.5, .medium))
                        .foregroundStyle(Theme.text3)
                        .lineLimit(1)
                    if !insight.detail.isEmpty {
                        Text(insight.detail)
                            .font(Theme.sans(13.5))
                            .foregroundStyle(Theme.text2)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 2)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

func open(_ link: String) {
    if let url = URL(string: link) { NSWorkspace.shared.open(url) }
}

@MainActor
final class PetLayout: ObservableObject {
    @Published var creature = CGPoint.zero
    @Published var bubbleX: CGFloat = 0
    @Published var above = true
    @Published var listHeight: CGFloat = 0
    @Published var listCap: CGFloat = 300
    @Published var lastKind: BubbleKind = .full
    var frozenText = ""
    var frozenToast: Insight?
    var frozenQuestion: Upcoming?
}

struct PetScene: View {
    @ObservedObject var model: PetModel
    @ObservedObject var layout: PetLayout
    let height: CGFloat

    var body: some View {
        let size = PetModel.size
        ZStack(alignment: .bottomLeading) {
            Color.clear.frame(maxWidth: .infinity, maxHeight: .infinity)
            if let kind = model.bubbleKind {
                PetBubble(model: model, layout: layout, kind: kind)
                    .padding(.leading, layout.bubbleX)
                    .padding(layout.above ? .bottom : .top, layout.above ? layout.creature.y + size.height + 4 : height - layout.creature.y + 4)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: layout.above ? .bottomLeading : .topLeading)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .scale(scale: 0.96, anchor: layout.above ? .bottom : .top)),
                        removal: .opacity.animation(.easeOut(duration: 0.14))
                    ))
            }
            PixelHead(expression: model.expression, phase: model.phase, look: model.look, badge: model.attention > 0)
                .offset(x: (model.lookX * 1.5).rounded(), y: -model.hop - (sin(model.phase * 1.3) > 0.4 ? 1 : 0) - (model.lookY * 1.5).rounded() - (model.walking ? (sin(model.phase * 8) > 0 ? 1 : 0) : 0))
                .opacity(model.opacity)
                .padding(.leading, layout.creature.x)
                .padding(.bottom, layout.creature.y)
        }
        .frame(width: 360, height: height, alignment: .bottomLeading)
        .clipped()
        .animation(.spring(response: 0.28, dampingFraction: 0.9), value: model.bubbleKind)
    }
}
