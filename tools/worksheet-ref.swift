import Foundation
import CoreGraphics
// The app's own worksheet code, run for the site (tools/worksheet-ref.py compiles it with Coordigo's sources and the
// WorksheetPage part of Print.swift, unchanged):
//   faces <Mystery folder> <id>...                → each picture's colour faces as the app fills them (JSON)
// (The pages mode, for the pixel parity with the app's sheet, went with the site's own design on 2026-11-07.)
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
default: fatalError("faces")
}
