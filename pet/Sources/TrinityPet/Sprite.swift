import SwiftUI

enum Expression: Equatable {
    case neutral
    case chill
    case focused
    case alert
    case thinking
    case talking
    case annoyed
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

    static let ink = Color(red: 0.03, green: 0.07, blue: 0.05)
    static let paper = Color(red: 0.6, green: 1.0, blue: 0.7)
    static let halo = Color(red: 0.12, green: 0.85, blue: 0.36).opacity(0.4)
    static let hair = Color(red: 0.04, green: 0.1, blue: 0.07)
    static let rim = Color(red: 0.13, green: 0.62, blue: 0.3)
    static let sheen = Color(red: 0.08, green: 0.26, blue: 0.15)
    static let skin = Color(red: 0.47, green: 0.6, blue: 0.53)
    static let skinShade = Color(red: 0.27, green: 0.38, blue: 0.32)
    static let lens = Color(red: 0.04, green: 0.08, blue: 0.06)
    static let frame = Color(red: 0.24, green: 0.95, blue: 0.45)
    static let lip = Color(red: 0.52, green: 0.23, blue: 0.2)
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

    static let hairCells: [Pixel] = cells("#")
    static let faceCells: [Pixel] = cells("o")
    static let strandCells: [Pixel] = strand
    static let hairRim: [Pixel] = {
        let filled = Set(cells("#") + cells("o"))
        return cells("#").filter { p in !filled.contains(Pixel(x: p.x + 1, y: p.y)) || !filled.contains(Pixel(x: p.x, y: p.y - 1)) }
    }()
    static let shadowed: [Pixel] = {
        let hair = Set(cells("#"))
        return cells("o").filter { p in p.x <= 6 || hair.contains(Pixel(x: p.x, y: p.y - 1)) || hair.contains(Pixel(x: p.x, y: p.y - 2)) || hair.contains(Pixel(x: p.x - 1, y: p.y)) }
    }()
    static let outline: [Pixel] = {
        let filled = Set(cells("#") + cells("o"))
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
        var brow: [Pixel] = []
        var paper: [Pixel] = []
        var code: [Pixel] = []
        var ember: [Pixel] = []
    }

    private static func px(_ list: [(Int, Int)]) -> [Pixel] {
        list.map { Pixel(x: $0.0, y: $0.1) }
    }

    static func layers(for expression: Expression, phase: Double, look: Int, badge: Bool) -> Layers {
        var l = Layers()
        let glasses = { (dx: Int, gy: Int) -> [Pixel] in
            lens(5 + dx, gy) + lens(13 + dx, gy) + run(gy, 10 + dx, 12 + dx) + [Pixel(x: 4 + dx, y: gy), Pixel(x: 18 + dx, y: gy)]
        }
        let sideEye = { (dx: Int) -> [Pixel] in
            run(13, 7 + dx, 8 + dx) + run(13, 15 + dx, 16 + dx)
        }
        let squint = { (dx: Int) -> [Pixel] in
            [Pixel(x: 8 + dx, y: 13), Pixel(x: 16 + dx, y: 13)]
        }
        let glint = { (dx: Int, gy: Int) -> [Pixel] in
            let t = phase.truncatingRemainder(dividingBy: 6)
            guard t < 0.45 else { return [] }
            let k = Int(t / 0.15)
            return [Pixel(x: 6 + dx + k, y: gy), Pixel(x: 14 + dx + k, y: gy)]
        }
        let flatBrows = run(11, 7, 9) + run(11, 13, 16)
        let archBrow = run(11, 7, 9) + px([(13, 11), (14, 10), (15, 10), (16, 10)])
        let angryBrows = px([(7, 11), (8, 11), (9, 12), (13, 12), (14, 11), (15, 11), (16, 11)])
        let raisedBrows = run(10, 7, 9) + run(10, 13, 16)
        let smirk = px([(10, 20), (11, 20), (12, 20), (13, 19)])
        let frown = px([(10, 21), (11, 20), (12, 20), (13, 21)])
        let pout = run(20, 10, 12) + [Pixel(x: 11, y: 21)]

        switch expression {
        case .neutral:
            l.ink = glasses(look, 15) + sideEye(look) + smirk
            l.brow = archBrow
            l.paper = glint(look, 15)
        case .annoyed:
            l.ink = glasses(look, 15) + squint(look) + frown
            l.brow = angryBrows
        case .talking:
            l.ink = glasses(look, 15) + sideEye(look) + run(20, 10, 12) + (Int(phase * 8) % 2 == 0 ? run(21, 10, 12) : [])
            l.brow = archBrow
        case .alert:
            l.ink = glasses(0, 16) + px([(7, 13), (7, 14), (8, 14), (15, 13), (15, 14), (16, 14)]) + run(20, 10, 12) + run(21, 10, 12)
            l.brow = raisedBrows
        case .thinking:
            l.ink = glasses(look, 14) + pout
            l.brow = archBrow
            let i = Int(phase * 12) % 10
            l.code = [Pixel(x: i < 5 ? 5 + i : 13 + i - 5, y: 14)]
        case .chill:
            l.ink = glasses(look, 15) + squint(look) + smirk
            l.brow = flatBrows
            l.paper = glint(look, 15)
        case .focused:
            l.ink = glasses(look, 14) + run(20, 10, 12)
            l.brow = angryBrows
            l.paper = glint(look, 14)
        case .flustered:
            l.ink = lens(4, 14) + lens(12, 16) + px([(9, 15), (10, 15), (11, 16), (3, 14)]) + run(20, 9, 13) + run(21, 10, 12)
            l.brow = angryBrows
        case .asleep:
            l.ink = run(15, 5, 8) + run(15, 14, 17) + run(20, 10, 12)
            l.brow = flatBrows
            let rise = Int((phase * 3).truncatingRemainder(dividingBy: 6))
            l.code = run(8 - rise, 19, 21) + [Pixel(x: 20, y: 9 - rise)] + run(10 - rise, 19, 21)
        case .glitch:
            let jolt = Int(phase * 14) % 3 - 1
            l.ink = run(14, 5 + jolt, 9 + jolt) + run(14, 13 + jolt, 17 + jolt) + run(15, 6 - jolt, 8 - jolt) + run(15, 14 - jolt, 16 - jolt) + run(14, 10, 12) + run(20, 10, 12)
            l.brow = angryBrows
            l.code = [Pixel(x: 8 + jolt, y: 13)]
            l.ember = [Pixel(x: 14 - jolt, y: 16)]
        }

        if badge && expression != .asleep {
            l.ember += px([(20, -1), (19, 0), (21, 0), (18, 1), (20, 1), (22, 1), (19, 2), (21, 2), (20, 3)])
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
            paint(Sprite.hairCells, Sprite.hair)
            paint(Sprite.hairRim, Sprite.rim)
            paint(Sprite.strandCells, Sprite.sheen)
            paint(Sprite.faceCells, Sprite.skin)
            paint(Sprite.shadowed, Sprite.skinShade)
            paint(layers.brow, Sprite.hair)
            paint(layers.ink.filter { $0.y >= 19 }, Sprite.lip)
            paint(layers.ink.filter { $0.y < 19 && [3, 4, 10, 11, 12, 18, 19].contains($0.x) }, Sprite.frame)
            paint(layers.ink.filter { $0.y < 19 && ![3, 4, 10, 11, 12, 18, 19].contains($0.x) }, Sprite.lens)
            paint(layers.paper, Sprite.paper)
            paint(layers.code, Sprite.code)
            paint(layers.ember, Sprite.ember)
        }
        .frame(width: Sprite.size.width, height: Sprite.size.height)
        .shadow(color: .black.opacity(0.22), radius: 3, y: 2)
    }
}
