import AppKit
import SwiftUI

enum Theme {
    static let card = Color(red: 0.075, green: 0.075, blue: 0.08)
    static let line = Color.white.opacity(0.08)
    static let text = Color(red: 0.93, green: 0.93, blue: 0.92)
    static let dim = Color(red: 0.56, green: 0.56, blue: 0.56)
    static let faint = Color(red: 0.36, green: 0.36, blue: 0.37)
    static let code = Color(red: 0.36, green: 1.0, blue: 0.45)
    static let ember = Color(red: 1.0, green: 0.42, blue: 0.24)
    static let blue = Color(red: 0.33, green: 0.62, blue: 1.0)
    static let red = Color(red: 0.96, green: 0.42, blue: 0.4)

    static func mono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

struct PixelGlyph: View {
    let rows: [String]
    let color: Color
    var scale: CGFloat = 1.5

    var body: some View {
        Canvas { ctx, _ in
            var path = Path()
            for (y, row) in rows.enumerated() {
                for (x, c) in row.enumerated() where c == "#" {
                    path.addRect(CGRect(x: CGFloat(x) * scale, y: CGFloat(y) * scale, width: scale, height: scale))
                }
            }
            ctx.fill(path, with: .color(color))
        }
        .frame(width: CGFloat(rows.first?.count ?? 0) * scale, height: CGFloat(rows.count) * scale)
    }

    static let mark = ["..#..", ".#.#.", "#.#.#", ".#.#.", "..#.."]
    static let urgent = ["..#..", "..#..", "..#..", ".....", "..#.."]
    static let soon = [".#.#.", "#...#", ".....", "#...#", ".#.#."]
    static let fyi = [".###.", "#...#", "#.#.#", "#...#", ".###."]
    static let off = ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"]
}

struct StatusPill: View {
    let label: String
    let glyph: [String]
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            PixelGlyph(rows: glyph, color: color, scale: 1.4)
            Text(label.uppercased()).font(Theme.mono(9.5, .semibold)).tracking(0.6)
        }
        .foregroundStyle(color)
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(color.opacity(0.18)))
    }

    static func priority(_ p: Int) -> StatusPill {
        switch p {
        case 1: return StatusPill(label: "Needs you", glyph: PixelGlyph.urgent, color: Theme.ember)
        case 2: return StatusPill(label: "Worth a look", glyph: PixelGlyph.soon, color: Theme.blue)
        default: return StatusPill(label: "FYI", glyph: PixelGlyph.fyi, color: Theme.dim)
        }
    }
}

struct PetBubble: View {
    @ObservedObject var model: PetModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if let line = model.greeting {
                greeting(line)
            } else if let line = model.quip {
                Text(line).font(Theme.mono(13)).foregroundStyle(Theme.text).fixedSize(horizontal: false, vertical: true)
            } else if let toast = model.toast {
                InsightRow(insight: toast)
            } else {
                content
                footer
            }
        }
        .padding(14)
        .frame(width: 300, alignment: .leading)
        .background(Theme.card.opacity(0.97), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.line))
        .shadow(color: .black.opacity(0.4), radius: 18, y: 8)
        .environment(\.colorScheme, .dark)
        .contentShape(Rectangle())
        .onTapGesture { if model.toast != nil || model.greeting != nil || model.quip != nil { model.toggleBubble() } }
    }

    private var header: some View {
        HStack(spacing: 7) {
            PixelGlyph(rows: PixelGlyph.mark, color: Theme.code, scale: 1.6)
            Text("TRINITY").font(Theme.mono(10, .semibold)).tracking(2).foregroundStyle(Theme.text)
            Spacer()
            Text(stamp).font(Theme.mono(9.5)).foregroundStyle(Theme.faint)
        }
    }

    private var stamp: String {
        if model.refreshing { return "SYNCING" }
        if model.toast != nil { return "NEW" }
        guard let digest = model.digest else { return "" }
        let date = Date(timeIntervalSince1970: digest.generatedAt / 1000)
        return RelativeDateTimeFormatter().localizedString(for: date, relativeTo: Date()).uppercased()
    }

    private func greeting(_ line: String) -> some View {
        let shown = String(line.prefix(model.greetingProgress))
        let cursor = model.greetingProgress < line.count || Int(model.phase * 2) % 2 == 0
        return HStack(spacing: 2) {
            Text(shown).font(Theme.mono(15)).foregroundStyle(Theme.text)
            Rectangle().fill(Theme.code).frame(width: 7, height: 15).opacity(cursor ? 1 : 0)
        }
    }

    @ViewBuilder
    private var content: some View {
        if let error = model.error, model.digest == nil {
            HStack(alignment: .top, spacing: 8) {
                StatusPill(label: "Offline", glyph: PixelGlyph.off, color: Theme.red)
                Text(error).font(.system(size: 12)).foregroundStyle(Theme.dim).fixedSize(horizontal: false, vertical: true)
            }
        } else if let digest = model.digest {
            Text(digest.headline)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
            if !digest.insights.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(digest.insights.prefix(5).enumerated()), id: \.element.id) { index, insight in
                        if index > 0 { Rectangle().fill(Theme.line).frame(height: 1) }
                        InsightRow(insight: insight).padding(.vertical, 9)
                    }
                }
            }
            let off = digest.sources.filter { !$0.ok }
            if !off.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(off, id: \.source) { s in
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(s.source.uppercased()).font(Theme.mono(9, .semibold)).foregroundStyle(Theme.faint)
                            Text(s.error ?? "off").font(.system(size: 10.5)).foregroundStyle(Theme.faint).lineLimit(2)
                        }
                    }
                }
            }
        } else {
            Text("Gathering…").font(Theme.mono(12)).foregroundStyle(Theme.dim)
        }
    }

    private var footer: some View {
        HStack(spacing: 16) {
            Button(model.refreshing ? "SYNCING" : "REFRESH") { model.refresh(force: true) }.disabled(model.refreshing)
            Button("OPEN") { open("http://localhost:6070/") }
            Spacer()
            Button("CLOSE") { model.toggleBubble() }
        }
        .buttonStyle(.plain)
        .font(Theme.mono(9.5, .semibold))
        .tracking(1)
        .foregroundStyle(Theme.dim)
    }
}

struct InsightRow: View {
    let insight: Insight

    var body: some View {
        Button {
            if let url = insight.url { open(url) } else if insight.source == "whatsapp" { open("whatsapp://") }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    StatusPill.priority(insight.priority)
                    Text([insight.source, insight.from].compactMap { $0 }.joined(separator: " · ").uppercased())
                        .font(Theme.mono(9))
                        .foregroundStyle(Theme.faint)
                        .lineLimit(1)
                }
                Text(insight.title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text(insight.detail)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.dim)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
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
}

struct PetScene: View {
    @ObservedObject var model: PetModel
    @ObservedObject var layout: PetLayout
    let height: CGFloat

    var body: some View {
        let size = PetModel.size
        ZStack(alignment: .bottomLeading) {
            Color.clear
            if model.bubbleOpen || model.toast != nil || model.greeting != nil || model.quip != nil {
                PetBubble(model: model)
                    .padding(.leading, layout.bubbleX)
                    .padding(layout.above ? .bottom : .top, layout.above ? layout.creature.y + size.height + 4 : height - layout.creature.y + 4)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: layout.above ? .bottomLeading : .topLeading)
                    .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.95, anchor: layout.above ? .bottom : .top)), removal: .identity))
            }
            PixelHead(expression: model.expression, phase: model.phase, look: model.look, badge: model.attention > 0)
                .offset(x: (model.lookX * 1.5).rounded(), y: -model.hop - (sin(model.phase * 1.3) > 0.4 ? 1 : 0) - (model.lookY * 1.5).rounded() - (model.walking ? (sin(model.phase * 8) > 0 ? 1 : 0) : 0))
                .opacity(model.opacity)
                .padding(.leading, layout.creature.x)
                .padding(.bottom, layout.creature.y)
        }
        .animation(.spring(response: 0.26, dampingFraction: 0.85), value: model.bubbleOpen)
        .animation(.spring(response: 0.26, dampingFraction: 0.85), value: model.toast)
        .animation(.spring(response: 0.26, dampingFraction: 0.85), value: model.greeting)
        .animation(.spring(response: 0.26, dampingFraction: 0.85), value: model.quip)
    }
}
