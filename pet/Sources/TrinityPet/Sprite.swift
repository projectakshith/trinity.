import SwiftUI

enum Expression: Equatable {
    case neutral
    case chill
    case focused
    case alert
    case thinking
    case talking
    case flustered
    case asleep
    case glitch
}

struct Pixel: Hashable {
    let x: Int
    let y: Int
}

enum Sprite {
    static let pixel: CGFloat = 2.5
    static let columns = 24
    static let rows = 26
    static let size = CGSize(width: CGFloat(columns) * pixel, height: CGFloat(rows) * pixel)

    static let ink = Color(red: 0.05, green: 0.05, blue: 0.05)
    static let paper = Color(red: 0.95, green: 0.95, blue: 0.93)
    static let hairLit = Color(red: 0.0, green: 0.56, blue: 0.067)
    static let hairShade = Color(red: 0.0, green: 0.33, blue: 0.05)
    static let halo = Color.white.opacity(0.9)
    static let code = Color(red: 0.36, green: 1.0, blue: 0.45)
    static let ember = Color(red: 1.0, green: 0.42, blue: 0.24)

    private static let head = [
        "........######........",
        ".....############.....",
        "....##############....",
        "...################...",
        "..##################..",
        "..##################..",
        ".####################.",
        ".################oo##.",
        ".##############oooo##.",
        ".############oooooo##.",
        ".##########oooooooo##.",
        ".########oooooooooo##.",
        ".######oooooooooooo##.",
        ".####oooooooooooooo##.",
        ".###ooooooooooooooo##.",
        ".###ooooooooooooooo##.",
        ".###ooooooooooooooo##.",
        ".###ooooooooooooooo##.",
        ".###ooooooooooooooo##.",
        ".##.ooooooooooooooo.#.",
        ".#...ooooooooooooo..#.",
        ".....ooooooooooooo....",
        "......ooooooooooo.....",
        "........ooooooo.......",
    ]

    private static let strand: [Pixel] = [(16, 4), (15, 4), (14, 5), (13, 5), (12, 6), (11, 6), (10, 7), (9, 7), (8, 8), (7, 8), (6, 9), (5, 9)].map { Pixel(x: $0.0, y: $0.1) }

    static let hair: [Pixel] = cells("#")
    static let face: [Pixel] = cells("o") + strand
    static let outline: [Pixel] = {
        let filled = Set(hair + cells("o"))
        var ring = Set<Pixel>()
        for p in filled {
            for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                let n = Pixel(x: p.x + dx, y: p.y + dy)
                if !filled.contains(n) { ring.insert(n) }
            }
        }
        return Array(ring)
    }()

    private static func cells(_ mark: Character) -> [Pixel] {
        var out: [Pixel] = []
        for (y, row) in head.enumerated() {
            for (x, c) in row.enumerated() where c == mark { out.append(Pixel(x: x, y: y)) }
        }
        return out
    }

    static func run(_ y: Int, _ x0: Int, _ x1: Int) -> [Pixel] {
        (x0...x1).map { Pixel(x: $0, y: y) }
    }

    static func lens(_ x0: Int, _ y0: Int) -> [Pixel] {
        run(y0, x0, x0 + 4) + run(y0 + 1, x0 + 1, x0 + 3)
    }

    struct Layers {
        var ink: [Pixel] = []
        var paper: [Pixel] = []
        var code: [Pixel] = []
        var ember: [Pixel] = []
        var showHead = true
    }

    static func layers(for expression: Expression, phase: Double, look: Int, badge: Bool) -> Layers {
        var l = Layers()
        let glasses = { (dx: Int, gy: Int) -> [Pixel] in
            lens(5 + dx, gy) + lens(13 + dx, gy) + run(gy, 10 + dx, 12 + dx) + [Pixel(x: 4 + dx, y: gy), Pixel(x: 18 + dx, y: gy)]
        }
        let glint = { (dx: Int, gy: Int) -> [Pixel] in
            let t = phase.truncatingRemainder(dividingBy: 5)
            guard t < 0.45 else { return [] }
            let k = Int(t / 0.15)
            return [Pixel(x: 6 + dx + k, y: gy), Pixel(x: 14 + dx + k, y: gy)]
        }

        switch expression {
        case .neutral:
            l.ink = glasses(look, 14)
            l.paper = glint(look, 14)
        case .talking:
            l.ink = glasses(0, 14) + run(20, 10, 12) + (Int(phase * 8) % 2 == 0 ? run(21, 10, 12) : [])
            l.paper = glint(0, 14)
        case .alert:
            l.ink = glasses(0, 16) + [Pixel(x: 7, y: 13), Pixel(x: 7, y: 14), Pixel(x: 15, y: 13), Pixel(x: 15, y: 14)] + run(20, 10, 12) + run(21, 10, 12)
        case .thinking:
            l.ink = glasses(0, 14)
            let i = Int(phase * 12) % 10
            l.code = [Pixel(x: i < 5 ? 5 + i : 13 + i - 5, y: 14)]
        case .chill:
            l.ink = run(14, 6, 8) + [Pixel(x: 5, y: 15), Pixel(x: 9, y: 15)] + run(14, 14, 16) + [Pixel(x: 13, y: 15), Pixel(x: 17, y: 15)]
                + [Pixel(x: 9, y: 20), Pixel(x: 13, y: 20)] + run(21, 10, 12)
        case .focused:
            l.ink = lens(5, 15) + lens(13, 14) + [Pixel(x: 10, y: 15), Pixel(x: 11, y: 14), Pixel(x: 12, y: 14), Pixel(x: 4, y: 15), Pixel(x: 18, y: 14)]
                + run(20, 10, 12) + [Pixel(x: 13, y: 19)]
            l.paper = glint(0, 14).filter { $0.x >= 13 }
        case .flustered:
            l.ink = lens(4, 14) + lens(12, 16) + [Pixel(x: 9, y: 15), Pixel(x: 10, y: 15), Pixel(x: 11, y: 16), Pixel(x: 3, y: 14)]
                + [Pixel(x: 9, y: 21), Pixel(x: 10, y: 20), Pixel(x: 11, y: 21), Pixel(x: 12, y: 20), Pixel(x: 13, y: 21)]
        case .asleep:
            l.ink = run(15, 5, 8) + run(15, 14, 17) + run(20, 10, 12)
            let rise = Int((phase * 3).truncatingRemainder(dividingBy: 6))
            l.code = run(2 - rise + 6, 19, 21) + [Pixel(x: 20, y: 3 - rise + 6)] + run(4 - rise + 6, 19, 21)
        case .glitch:
            let jolt = Int(phase * 14) % 3 - 1
            l.ink = run(14, 5 + jolt, 9 + jolt) + run(14, 13 + jolt, 17 + jolt) + run(15, 6 - jolt, 8 - jolt) + run(15, 14 - jolt, 16 - jolt) + run(14, 10, 12) + run(20, 10, 12)
            l.code = [Pixel(x: 8 + jolt, y: 13)]
            l.ember = [Pixel(x: 14 - jolt, y: 16)]
        }

        if badge && expression != .asleep {
            l.ember += [(20, -1), (19, 0), (21, 0), (18, 1), (20, 1), (22, 1), (19, 2), (21, 2), (20, 3)].map { Pixel(x: $0.0, y: $0.1) }
        }
        return l
    }
}

struct PixelHead: View {
    let expression: Expression
    let phase: Double
    let look: Int
    let badge: Bool

    var body: some View {
        let layers = Sprite.layers(for: expression, phase: phase, look: look, badge: badge)
        Canvas { ctx, _ in
            let p = Sprite.pixel
            func paint(_ pixels: [Pixel], _ color: Color) {
                var path = Path()
                for px in pixels { path.addRect(CGRect(x: CGFloat(px.x + 1) * p, y: CGFloat(px.y + 1) * p, width: p, height: p)) }
                ctx.fill(path, with: .color(color))
            }
            paint(Sprite.outline, Sprite.halo)
            paint(Sprite.hair.filter { $0.y < 14 }, Sprite.hairLit)
            paint(Sprite.hair.filter { $0.y >= 14 }, Sprite.hairShade)
            paint(Sprite.face, Sprite.paper)
            paint(layers.ink, Sprite.ink)
            paint(layers.paper, Sprite.paper)
            paint(layers.code, Sprite.code)
            paint(layers.ember, Sprite.ember)
        }
        .frame(width: Sprite.size.width, height: Sprite.size.height)
        .shadow(color: .black.opacity(0.22), radius: 3, y: 2)
    }
}
