import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
// The app's own worksheet code, run for the site (tools/worksheet-ref.py compiles it with Coordigo's sources and the
// WorksheetPage part of Print.swift, unchanged):
//   faces <Mystery folder> <id>...                → each picture's colour faces as the app fills them (JSON)
//   pages <Mystery folder> <out> <id> <letter|a4> <note> <words> <answer 0|1> <label>
//                                                 → the pages as the app draws them, PNG at 3x (for the parity check)
let args = CommandLine.arguments
let folder = URL(fileURLWithPath: args[2])
func picture(_ id: String) -> MysteryPicture {
    let drawn = try! MysteryPicture(drawingJSON: Data(contentsOf: folder.appendingPathComponent(id + ".json")))
    return id.hasPrefix("game-") ? drawn.asPenPaths() : drawn
}
func rings(_ path: CGPath) -> [[[Double]]] {
    var out: [[[Double]]] = [], cur: [[Double]] = []
    path.applyWithBlock { e in
        let pt = e.pointee.points
        switch e.pointee.type {
        case .moveToPoint: if !cur.isEmpty { out.append(cur) }; cur = [[Double(pt[0].x), Double(pt[0].y)]]
        case .addLineToPoint: cur.append([Double(pt[0].x), Double(pt[0].y)])
        case .closeSubpath: if !cur.isEmpty { out.append(cur) }; cur = []
        default: break
        }
    }
    if !cur.isEmpty { out.append(cur) }
    return out.map { $0.map { $0.map { ($0 * 1000).rounded() / 1000 } } }
}
switch args[1] {
case "faces":
    var out: [String: Any] = [:]
    for id in args.dropFirst(3) {
        let p = picture(id), r = MysteryRegions.cached(p)
        out[id] = r.shapes(Set(r.regions.map(\.id))).map { s -> [Any] in
            [String(format: "#%02x%02x%02x", Int((s.r * 255).rounded()), Int((s.g * 255).rounded()), Int((s.b * 255).rounded())), rings(s.path)]
        }
    }
    let data = try! JSONSerialization.data(withJSONObject: out, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
case "pages":
    let outDir = URL(fileURLWithPath: args[3]), id = args[4]
    let p = picture(id)
    var o = PrintOptions()
    o.paper = args[5] == "a4" ? .a4 : .letter
    o.note = args[6]; o.words = args[7]; o.answer = args[8] == "1"; o.label = args[9]
    let size = o.paper.size, scale: CGFloat = 3
    for (i, kind) in WorksheetPage.kinds(o).enumerated() {
        let w = Int(size.width * scale), h = Int(size.height * scale)
        let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.translateBy(x: 0, y: CGFloat(h)); ctx.scaleBy(x: scale, y: -scale)
        WorksheetPage.draw(p, o, kind, in: ctx)
        let url = outDir.appendingPathComponent("\(id)-\(i + 1).png") as CFURL
        let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(dest, ctx.makeImage()!, nil); CGImageDestinationFinalize(dest)
    }
default: fatalError("faces | pages")
}
