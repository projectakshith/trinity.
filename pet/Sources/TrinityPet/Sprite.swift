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
    static let columns = 28
    static let rows = 31
    static let origin = Pixel(x: 3, y: 4)
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
    static let codeDim = Color(red: 0.2, green: 0.62, blue: 0.3)
    static let blush = Color(red: 0.86, green: 0.46, blue: 0.5)
    static let mug = Color(red: 0.86, green: 0.84, blue: 0.8)
    static let mugShade = Color(red: 0.62, green: 0.6, blue: 0.57)
    static let steam = Color.white.opacity(0.55)
    static let hood = Color(red: 0.09, green: 0.13, blue: 0.11)
    static let hoodRim = Color(red: 0.16, green: 0.4, blue: 0.24)
    static let key = Color(red: 0.32, green: 0.36, blue: 0.34)
    static let popRed = Color(red: 0.86, green: 0.25, blue: 0.22)
    static let popKernel = Color(red: 0.98, green: 0.9, blue: 0.6)
    static let star = Color(red: 1.0, green: 0.92, blue: 0.5)

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

enum Bit: Equatable {
    case pushShades
    case hairFlick
    case yawn
    case lookAround
    case phone
    case coffee
    case eyeRoll
    case codeFlicker
    case popcorn
    case typing
    case dizzy
    case blush
    case pose
    case tired

    var duration: Double {
        switch self {
        case .pushShades, .hairFlick, .eyeRoll: return 1.4
        case .yawn: return 2.2
        case .lookAround: return 3
        case .codeFlicker: return 1.8
        case .phone: return 6
        case .coffee: return 5
        case .popcorn, .typing: return 8
        case .dizzy: return 3.5
        case .blush: return 2.5
        case .pose: return 3
        case .tired: return 6
        }
    }
}

struct Attire: Equatable {
    var hood = false
    var headphones = false
    var dim = false
}

struct Decor {
    var under: [(Pixel, Color)] = []
    var over: [(Pixel, Color)] = []
    var shiftGlasses = 0
    var lookOverride: Int?
    var hideEyes = false
}

extension Sprite {
    static func box(_ x0: Int, _ y0: Int, _ x1: Int, _ y1: Int, _ color: Color) -> [(Pixel, Color)] {
        var out: [(Pixel, Color)] = []
        for y in y0...y1 { for x in x0...x1 { out.append((Pixel(x: x, y: y), color)) } }
        return out
    }

    static func decor(bit: Bit?, t: Double, phase: Double, attire: Attire) -> Decor {
        var d = Decor()
        let wave = sin(t * .pi)

        if attire.hood {
            let ring = Set(outline)
            let outer = Set(outline.flatMap { p in [(-1, 0), (1, 0), (0, -1)].map { Pixel(x: p.x + $0.0, y: p.y + $0.1) } })
            for p in ring.union(outer) where p.y < 21 && !Set(hairCells + faceCells).contains(p) {
                d.under.append((p, ring.contains(p) ? hood : hoodRim))
            }
        }
        if attire.headphones {
            d.over += [(-1, 9), (0, 6), (1, 4), (2, 2), (4, 0), (6, -1), (8, -2), (13, -2), (15, -1), (17, 0), (19, 2), (20, 4), (21, 6), (22, 9)].map { (Pixel(x: $0.0, y: $0.1), hood) }
            d.over += [(9, -2), (10, -2), (11, -2), (12, -2)].map { (Pixel(x: $0.0, y: $0.1), hood) }
            d.over += box(-2, 10, 0, 15, hood) + box(21, 10, 23, 15, hood)
            d.over += [(Pixel(x: -1, y: 12), code), (Pixel(x: 22, y: 12), code)]
        }

        guard let bit else { return d }
        switch bit {
        case .pushShades:
            d.shiftGlasses = -Int((wave * 3.2).rounded())
            if d.shiftGlasses <= -2 {
                d.hideEyes = true
                d.over += [(7, 15), (8, 15), (15, 15), (16, 15)].map { (Pixel(x: $0.0, y: $0.1), lens) }
                d.over += [(Pixel(x: 8, y: 14), paper), (Pixel(x: 16, y: 14), paper)].map { ($0.0, $0.1.opacity(0.0)) }
            }
        case .hairFlick:
            let lift = Int((wave * 3).rounded())
            let tips = [(0, 12), (-1, 13), (-1, 14), (-2, 15), (0, 13), (0, 14), (-1, 15), (0, 15), (0, 16), (-2, 16)]
            d.over += tips.map { (Pixel(x: $0.0, y: $0.1 - lift), hair) }
            d.over += [(Pixel(x: -2, y: 15 - lift), rim), (Pixel(x: -1, y: 13 - lift), rim), (Pixel(x: -2, y: 16 - lift), rim)]
            d.over += [(21, 9), (22, 10), (22, 11)].map { (Pixel(x: $0.0, y: $0.1 - lift / 2), hair) }
        case .yawn:
            d.hideEyes = true
            d.over += box(10, 19, 12, 21, lens) + [(Pixel(x: 9, y: 20), lip), (Pixel(x: 13, y: 20), lip)]
            d.over += [(7, 14), (8, 14), (15, 14), (16, 14)].map { (Pixel(x: $0.0, y: $0.1), lens) }
            d.shiftGlasses = -1
        case .lookAround:
            d.lookOverride = t < 0.33 ? -1 : t < 0.66 ? 1 : 0
        case .phone:
            d.shiftGlasses = 1
            d.lookOverride = 0
            d.over += box(14, 20, 18, 26, lens) + box(15, 21, 17, 25, codeDim)
            if Int(phase * 3) % 2 == 0 { d.over.append((Pixel(x: 16, y: 22), code)) }
            d.over += [(Pixel(x: 7, y: 16), codeDim), (Pixel(x: 15, y: 16), codeDim)]
        case .coffee:
            let sip = t > 0.35 && t < 0.7
            let x0 = sip ? 8 : 1
            let y0 = sip ? 19 : 21
            d.over += box(x0, y0, x0 + 3, y0 + 4, mug) + box(x0 + 3, y0, x0 + 3, y0 + 4, mugShade) + [(Pixel(x: x0 + 4, y: y0 + 1), mug), (Pixel(x: x0 + 4, y: y0 + 2), mug)]
            if !sip {
                let rise = Int((phase * 4).truncatingRemainder(dividingBy: 4))
                d.over += [(Pixel(x: x0 + 1, y: y0 - 2 - rise), steam), (Pixel(x: x0 + 2, y: y0 - 3 - rise), steam)]
            } else {
                d.hideEyes = true
            }
        case .eyeRoll:
            d.hideEyes = true
            let dx = t < 0.5 ? -1 : 1
            d.over += [(7 + dx, 12), (8 + dx, 12), (15 + dx, 12), (16 + dx, 12)].map { (Pixel(x: $0.0, y: $0.1), lens) }
            d.shiftGlasses = 1
        case .codeFlicker:
            for k in 0..<4 {
                let x = [5, 7, 13, 16][k] + (Int(phase * 7) + k) % 2
                d.over.append((Pixel(x: x, y: 15 + (Int(phase * 10) + k) % 2), k % 2 == 0 ? code : codeDim))
            }
        case .popcorn:
            d.over += box(15, 21, 19, 26, popRed) + [(15, 22), (17, 22), (19, 22), (16, 24), (18, 24)].map { (Pixel(x: $0.0, y: $0.1), mug) }
            d.over += [(15, 20), (16, 19), (17, 20), (18, 19), (19, 20), (16, 20), (18, 20)].map { (Pixel(x: $0.0, y: $0.1), popKernel) }
            if Int(phase * 1.5) % 3 == 0 { d.over.append((Pixel(x: 12, y: 20), popKernel)) }
        case .typing:
            d.shiftGlasses = 1
            d.over += box(1, 25, 21, 26, key)
            for k in 0..<3 { d.over.append((Pixel(x: 2 + (Int(phase * 9) * 7 + k * 5) % 19, y: 25 + k % 2), code)) }
            d.over += [(Pixel(x: 6, y: 15), codeDim), (Pixel(x: 14, y: 15), codeDim)]
        case .dizzy:
            d.hideEyes = true
            d.shiftGlasses = 3
            let spin = Int(phase * 8) % 4
            for (cx, cy) in [(7, 13), (15, 13)] {
                let ring = [(0, -1), (1, 0), (0, 1), (-1, 0)]
                d.over.append((Pixel(x: cx + ring[spin].0, y: cy + ring[spin].1), lens))
                d.over.append((Pixel(x: cx, y: cy), lens))
            }
            for k in 0..<3 {
                let a = phase * 4 + Double(k) * 2.1
                d.over.append((Pixel(x: 11 + Int((cos(a) * 9).rounded()), y: -2 + Int((sin(a) * 1.5).rounded())), star))
            }
        case .blush:
            d.over += [(6, 18), (7, 18), (15, 18), (16, 18)].map { (Pixel(x: $0.0, y: $0.1), blush) }
            d.lookOverride = 1
        case .pose:
            d.shiftGlasses = t > 0.3 && t < 0.7 ? -2 : 0
            for c in 0..<7 {
                let x = [-3, -2, 0, 22, 23, 25, 24][c]
                let head = Int((phase * 14 + Double(c * 5)).truncatingRemainder(dividingBy: 34)) - 4
                for k in 0..<4 where (0...29).contains(head - k) {
                    d.under.append((Pixel(x: x, y: head - k), k == 0 ? code : codeDim))
                }
            }
        case .tired:
            d.hideEyes = true
            d.shiftGlasses = 2
            d.over += [(7, 15), (8, 15), (15, 15), (16, 15)].map { (Pixel(x: $0.0, y: $0.1), lens) }
            d.over += box(18, -3, 22, -3, mugShade) + box(18, -1, 22, -1, mugShade) + [(Pixel(x: 18, y: -2), mugShade), (Pixel(x: 22, y: -2), mugShade), (Pixel(x: 23, y: -2), mugShade), (Pixel(x: 19, y: -2), ember)]
        }
        return d
    }
}

struct PixelHead: View {
    let expression: Expression
    let phase: Double
    let look: Int
    let badge: Bool
    var bit: Bit?
    var bitProgress: Double = 0
    var attire = Attire()

    var body: some View {
        let decor = Sprite.decor(bit: bit, t: bitProgress, phase: phase, attire: attire)
        var layers = Sprite.layers(for: expression, phase: phase, look: decor.lookOverride ?? look, badge: badge)
        if decor.hideEyes { layers.ink.removeAll { $0.y == 13 } }
        if decor.shiftGlasses != 0 {
            layers.ink = layers.ink.map { $0.y >= 14 && $0.y <= 17 ? Pixel(x: $0.x, y: $0.y + decor.shiftGlasses) : $0 }
            layers.paper = layers.paper.map { Pixel(x: $0.x, y: $0.y + decor.shiftGlasses) }
        }
        return Canvas { ctx, _ in
            let p = Sprite.pixel
            let o = Sprite.origin
            func rect(_ px: Pixel) -> CGRect {
                CGRect(x: CGFloat(px.x + o.x) * p, y: CGFloat(px.y + o.y) * p, width: p, height: p)
            }
            func paint(_ pixels: [Pixel], _ color: Color) {
                var path = Path()
                for px in pixels { path.addRect(rect(px)) }
                ctx.fill(path, with: .color(color))
            }
            func paint(_ colored: [(Pixel, Color)]) {
                for (px, color) in colored { ctx.fill(Path(rect(px)), with: .color(color)) }
            }
            paint(decor.under)
            paint(attire.hood ? [] : Sprite.outline, Sprite.halo)
            paint(Sprite.hairCells, Sprite.hair)
            paint(Sprite.hairRim, attire.hood ? Sprite.hoodRim : Sprite.rim)
            paint(Sprite.strandCells, Sprite.sheen)
            paint(Sprite.faceCells, Sprite.skin)
            paint(Sprite.shadowed, Sprite.skinShade)
            paint(layers.brow, Sprite.hair)
            paint(layers.ink.filter { $0.y >= 19 }, Sprite.lip)
            paint(layers.ink.filter { $0.y < 19 && [3, 4, 10, 11, 12, 18, 19].contains($0.x) }, Sprite.frame)
            paint(layers.ink.filter { $0.y < 19 && ![3, 4, 10, 11, 12, 18, 19].contains($0.x) }, Sprite.lens)
            paint(layers.paper, Sprite.paper)
            paint(layers.code, Sprite.code)
            paint(decor.over)
            paint(layers.ember, Sprite.ember)
            if attire.dim { paint(Sprite.hairCells + Sprite.faceCells, Color.black.opacity(0.22)) }
        }
        .frame(width: Sprite.size.width, height: Sprite.size.height)
        .shadow(color: .black.opacity(0.22), radius: 3, y: 2)
    }
}
