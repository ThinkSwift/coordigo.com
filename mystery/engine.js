// Coordigo Mystery Pictures — the protocol and the solving rules, for the web player.
// A line-by-line port of the app (Coordigo: CoordigoKit/Mystery, SheetRaster in Paper.swift, Atomizer in Atoms.swift),
// so a region colors on the web at the same point it colors in the app. Docs: Coordigo/Docs/PROTOCOL-MYSTERY-v2.md.
// Checked against the app's own output by Coordigo/scripts/web-engine-check.sh (run it after changing either side).
(function (root) {
  'use strict';

  const DIGITS = '0123456789ABCDEF';
  const VERSION = 2;
  const SIDE = 15;                    // squares per side (16 points: 0–F)
  const K = 10;                       // raster cells per unit
  const W = SIDE * K, H = SIDE * K;
  const LIMITS = { m: 120, t: 40, f: 30 };
  const SIZE = { code: 1500, colorText: 2600, segments: 300, points: 600, fills: 256 };   // MysteryLink.Limits
  const HEARTS = 3;

  // 0 ink · 1 grey · 2 white · 3 red · 4 orange · 5 yellow · 6 peach · 7 tan · 8 dark grey · 9 light green ·
  // A green · B dark green · C light cyan · D blue · E indigo · F purple — the app's MysteryPalette.rgb.
  const PALETTE = [
    [0.12, 0.11, 0.12], [0.62, 0.64, 0.66], [1.00, 1.00, 1.00], [1.00, 0.23, 0.19],
    [1.00, 0.58, 0.00], [1.00, 0.84, 0.04], [1.00, 0.77, 0.51], [0.64, 0.44, 0.27],
    [0.40, 0.42, 0.44], [0.54, 0.98, 0.60], [0.20, 0.78, 0.35], [0.04, 0.40, 0.14],
    [0.79, 0.96, 1.00], [0.00, 0.48, 1.00], [0.35, 0.32, 0.87], [0.75, 0.35, 0.95],
  ].map(c => c.map(v => Math.trunc(v * 255)));           // UInt8(v * 255) truncates, as in the app

  class Problem extends Error { constructor(kind) { super(kind); this.kind = kind; } }

  // MARK: The code

  const pair = p => DIGITS[p.x] + DIGITS[p.y];
  const codeString = segments => segments.map(s => s.map(pair).join('')).join(' ');

  function parseCode(code) {
    const words = code.toUpperCase().split(/[ \n\t]+/).filter(Boolean);
    if (!words.length) throw new Problem('empty');
    return words.map(w => {
      if (w.length % 2) throw new Problem('oddLength');
      const out = [];
      for (let k = 0; k < w.length; k += 2) {
        const x = DIGITS.indexOf(w[k]), y = DIGITS.indexOf(w[k + 1]);
        if (x < 0 || y < 0) throw new Problem('badCharacter');
        out.push({ x, y });
      }
      return out;
    });
  }

  // Colors beside the code: `x,y,C`, one space between; x and y 0–15 with at most one decimal. Kept in tenths.
  function parseColors(s) {
    return (s || '').split(/\s+/).filter(Boolean).map(entry => {
      const parts = entry.split(',');
      // `7`, `12` or `7.5` — exactly what the app writes; no signs, exponents or hex (the app reads the same).
      const num = t => (/^[0-9]{1,2}(\.[0-9])?$/.test(t) ? Number(t) : NaN);
      const x = parts.length === 3 ? num(parts[0]) : NaN, y = parts.length === 3 ? num(parts[1]) : NaN;
      const c = parts.length === 3 && parts[2].length === 1 ? DIGITS.indexOf(parts[2].toUpperCase()) : -1;
      if (!(parts[0] !== '' && parts[1] !== '' && isFinite(x) && isFinite(y) && c >= 0 && x >= 0 && x <= 15 && y >= 0 && y <= 15)) {
        throw new Problem('badCharacter');
      }
      const tenth = v => Math.min(Math.max(Math.round(v * 10), 0), 150);
      return { x10: tenth(x), y10: tenth(y), color: c };
    });
  }

  // MARK: The link

  function b64urlBytes(s) {
    let b = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const bin = atob(b);
    return Uint8Array.from(bin, ch => ch.charCodeAt(0));
  }

  async function inflateRaw(bytes) {
    // At most 16 KB out (MysteryLink.Limits.inflated): a crafted link cannot balloon in the page.
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) { reader.cancel(); throw new Problem('broken'); }
      chunks.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  const clip = (s, n) => {
    if (typeof s !== 'string') return null;
    const t = s.trim();
    if (!t) return null;
    // The app counts characters as people see them (grapheme clusters).
    const chars = typeof Intl !== 'undefined' && Intl.Segmenter
      ? Array.from(new Intl.Segmenter().segment(t), g => g.segment) : Array.from(t);
    return chars.slice(0, n).join('');
  };

  // The JSON inside a link → a picture. `inflate` is swappable for tests.
  async function readPayload(payload, inflate = inflateRaw) {
    let json;
    try {
      const packed = b64urlBytes(payload);
      let bytes;
      try { bytes = await inflate(packed); } catch (e) { bytes = packed; }
      json = JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { throw new Problem('broken'); }
    // The app's rules: v a whole number; the texts strings when present; a 16 × 16 picture's worth, no more.
    const text = k => json[k] === undefined || json[k] === null || typeof json[k] === 'string';
    if (!json || !Number.isInteger(json.v) || typeof json.d !== 'string' || !['c', 'm', 't', 'f', 'ct'].every(text)) {
      throw new Problem('broken');
    }
    if (json.v > VERSION) throw new Problem('newer');
    let segments, colors;
    if (json.d.length > SIZE.code || (json.c || '').length > SIZE.colorText) throw new Problem('broken');
    try { segments = parseCode(json.d); colors = parseColors(json.c); } catch (e) { throw new Problem('broken'); }
    if (segments.length > SIZE.segments || segments.reduce((n, s) => n + s.length, 0) > SIZE.points ||
        colors.length > SIZE.fills) throw new Problem('broken');
    return { segments, colors, message: clip(json.m, LIMITS.m), title: clip(json.t, LIMITS.t),
             from: clip(json.f, LIMITS.f), campaign: typeof json.ct === 'string' ? json.ct : null };
  }

  // MARK: Lines → walls → regions (SheetRaster, edge is a wall)

  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

  // p→q split at every lattice point it passes; each atom ordered (x, y) ascending, as the app keys them.
  function atoms(p, q) {
    const dx = q.x - p.x, dy = q.y - p.y, g = gcd(Math.abs(dx), Math.abs(dy));
    if (g === 0) return [];
    const sx = dx / g, sy = dy / g, out = [];
    for (let k = 0; k < g; k++) {
      let a = { x: p.x + sx * k, y: p.y + sy * k }, b = { x: p.x + sx * (k + 1), y: p.y + sy * (k + 1) };
      if (!(a.x < b.x || (a.x === b.x && a.y < b.y))) [a, b] = [b, a];
      out.push(a.x + ',' + a.y + ',' + b.x + ',' + b.y);
    }
    return out;
  }

  function pictureAtoms(segments) {
    const set = new Set();
    for (const s of segments) for (let k = 0; k + 1 < s.length; k++) for (const a of atoms(s[k], s[k + 1])) set.add(a);
    return set;
  }

  function raster(atomSet) {
    const cells = new Int32Array(W * H).fill(-1);
    const cx = v => Math.min(Math.max(Math.trunc(v), 0), W - 1), cy = v => Math.min(Math.max(Math.trunc(v), 0), H - 1);
    for (const key of atomSet) {
      const [x1, y1, x2, y2] = key.split(',').map(Number);
      const ax = x1 * K, ay = y1 * K, bx = x2 * K, by = y2 * K;
      const steps = Math.max(Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))) * 3, 1);
      let px = cx(ax), py = cy(ay);
      cells[py * W + px] = 0;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const nx = cx(ax + t * (bx - ax)), ny = cy(ay + t * (by - ay));
        if (nx !== px && ny !== py) cells[ny * W + px] = 0;            // keep walls 4-connected so fills never leak
        px = nx; py = ny;
        cells[py * W + px] = 0;
      }
    }
    const sizes = new Map();
    let next = 1;
    const stack = [];
    for (let start = 0; start < cells.length; start++) {
      if (cells[start] !== -1) continue;
      const id = next++;
      cells[start] = id; stack.push(start);
      while (stack.length) {
        const c = stack.pop(), x = c % W, y = (c / W) | 0;
        if (x > 0 && cells[c - 1] === -1) { cells[c - 1] = id; stack.push(c - 1); }
        if (x < W - 1 && cells[c + 1] === -1) { cells[c + 1] = id; stack.push(c + 1); }
        if (y > 0 && cells[c - W] === -1) { cells[c - W] = id; stack.push(c - W); }
        if (y < H - 1 && cells[c + W] === -1) { cells[c + W] = id; stack.push(c + W); }
      }
    }
    for (const c of cells) if (c > 0) sizes.set(c, (sizes.get(c) || 0) + 1);
    return { cells, sizes };
  }

  // The region holding a fill's point; a point on a line takes the nearest region beside it.
  function regionAt(f, r) {
    const cx = Math.min(Math.max(f.x10, 0), W - 1), cy = Math.min(Math.max(f.y10, 0), H - 1);
    const id = r.cells[cy * W + cx];
    if (id > 0) return id;
    for (let d = 1; d <= 3; d++) {
      for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const n = r.cells[y * W + x];
        if (n > 0) return n;
      }
    }
    return 0;
  }

  // The finished picture's colored regions: the sender's, or (no colors sent) the default palette by place and size.
  function regionsOf(picture) {
    const r = raster(pictureAtoms(picture.segments));
    const ids = [...r.sizes.keys()].sort((a, b) => a - b);
    const members = new Map(ids.map(id => [id, []]));
    for (let i = 0; i < r.cells.length; i++) if (r.cells[i] > 0) members.get(r.cells[i]).push(i);
    if (picture.colors.length) {
      const chosen = new Map();
      for (const f of picture.colors) { const id = regionAt(f, r); if (id > 0) chosen.set(id, f.color); }
      return ids.filter(id => chosen.has(id)).map(id => ({ id, cells: members.get(id), color: chosen.get(id), fromSender: true }));
    }
    const cycle = [5, 3, 0xD, 4, 0xA, 0xF, 6, 0xE];
    let k = 0;
    return ids.slice().sort((a, b) => members.get(b).length - members.get(a).length).map(id => {
      const cells = members.get(id);
      const top = cells.some(c => ((c / W) | 0) === 0), bottom = cells.some(c => ((c / W) | 0) === H - 1);
      let color;
      if (top && !bottom) color = 0xC;
      else if (bottom && !top) color = 9;
      else if (top && bottom) color = 2;
      else { color = cycle[k % cycle.length]; k++; }
      return { id, cells, color, fromSender: false };
    });
  }

  // Regions whose outline is exactly complete with these lines.
  function earned(regions, atomSet) {
    const now = raster(atomSet);
    return regions.filter(reg => {
      const id = now.cells[reg.cells[0]];
      if (!(id > 0) || now.sizes.get(id) !== reg.cells.length) return false;
      for (const c of reg.cells) if (now.cells[c] !== id) return false;
      return true;
    });
  }

  // MARK: Exact fills — each region drawn as the faces of its lines, so a fill meets the ink exactly and the ink on top
  // covers the seam (INC-2026-10-31-co-fill-edges: raster cells stair-stepped past the lines, and wall cells took one
  // neighbour's colour). A port of the app's Faces.swift and SheetRaster.faces(); the raster still names the region.

  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const area = ring => { let s = 0; for (let k = 0; k < ring.length; k++) { const p = ring[k], q = ring[(k + 1) % ring.length]; s += p.x * q.y - q.x * p.y; } return s / 2; };
  function contains(ring, p) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  const containsRings = (rings, p) => rings.reduce((acc, r) => acc !== contains(r, p), false);
  function distance(p, a, b) {
    const rx = b.x - a.x, ry = b.y - a.y, len2 = rx * rx + ry * ry;
    const t = len2 > 0 ? Math.min(Math.max(((p.x - a.x) * rx + (p.y - a.y) * ry) / len2, 0), 1) : 0;
    return Math.hypot(p.x - a.x - rx * t, p.y - a.y - ry * t);
  }
  function clearance(rings, p) {
    let best = Infinity;
    for (const r of rings) for (let k = 0; k < r.length; k++) best = Math.min(best, distance(p, r[k], r[(k + 1) % r.length]));
    return best;
  }

  // Every segment cut where another crosses or touches it; overlapping pieces become one edge.
  function split(segs) {
    const cuts = segs.map(() => [0, 1]);
    const on = (e, p, r) => {
      const len2 = r.x * r.x + r.y * r.y;
      if (!(len2 > 0)) return null;
      const t = ((e.x - p.x) * r.x + (e.y - p.y) * r.y) / len2;
      return t > -1e-9 && t < 1 + 1e-9 ? Math.min(Math.max(t, 0), 1) : null;
    };
    for (let i = 0; i < segs.length; i++) {
      const [p, p2] = segs[i], r = { x: p2.x - p.x, y: p2.y - p.y };
      for (let j = i + 1; j < segs.length; j++) {
        const [q, q2] = segs[j], s = { x: q2.x - q.x, y: q2.y - q.y };
        const d = cross(r, s), qp = { x: q.x - p.x, y: q.y - p.y };
        if (Math.abs(d) < 1e-12) {
          if (Math.abs(cross(qp, r)) >= 1e-9) continue;
          for (const e of [q, q2]) { const t = on(e, p, r); if (t !== null) cuts[i].push(t); }
          for (const e of [p, p2]) { const u = on(e, q, s); if (u !== null) cuts[j].push(u); }
          continue;
        }
        const t = cross(qp, s) / d, u = cross(qp, r) / d;
        if (!(t > -1e-9 && t < 1 + 1e-9 && u > -1e-9 && u < 1 + 1e-9)) continue;
        cuts[i].push(Math.min(Math.max(t, 0), 1)); cuts[j].push(Math.min(Math.max(u, 0), 1));
      }
    }
    const index = new Map(), points = [], seen = new Set(), edges = [];
    const vertex = p => {
      const k = Math.round(p.x * 1e7) + ',' + Math.round(p.y * 1e7);
      if (!index.has(k)) { index.set(k, points.length); points.push(p); }
      return index.get(k);
    };
    segs.forEach(([p, p2], i) => {
      let last = null;
      for (const t of cuts[i].slice().sort((a, b) => a - b)) {
        const v = vertex({ x: p.x + (p2.x - p.x) * t, y: p.y + (p2.y - p.y) * t });
        if (last !== null && last !== v) {
          const a = Math.min(last, v), b = Math.max(last, v), key = a + ',' + b;
          if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
        }
        last = v;
      }
    });
    return { points, edges };
  }

  // Walks every face with the face on the left: bounded faces come out with positive area, each drawing's outside negative.
  function traverse(points, edges) {
    const out = points.map(() => []);
    for (const [a, b] of edges) { out[a].push(b); out[b].push(a); }
    out.forEach((list, v) => {
      const o = points[v];
      list.sort((m, n) => Math.atan2(points[m].y - o.y, points[m].x - o.x) - Math.atan2(points[n].y - o.y, points[n].x - o.x));
    });
    const used = new Set(), cycles = [];
    for (const [a, b] of edges) {
      for (const [sa, sb] of [[a, b], [b, a]]) {
        if (used.has(sa + '>' + sb)) continue;
        const ring = [];
        let ha = sa, hb = sb;
        while (!used.has(ha + '>' + hb)) {
          used.add(ha + '>' + hb);
          ring.push(points[ha]);
          const around = out[hb], k = around.indexOf(ha);
          const next = around[(k - 1 + around.length) % around.length];
          ha = hb; hb = next;
        }
        cycles.push(ring);
      }
    }
    return cycles;
  }

  // The clearest of a few points stepped in from each edge's middle (then a quarter-step grid): well inside the face.
  function insidePoint(rings) {
    let best = null;
    const consider = p => {
      if (!containsRings(rings, p)) return;
      const c = clearance(rings, p);
      if (!best || c > best.c) best = { p, c };
    };
    const o = rings[0];
    for (let k = 0; k < o.length; k++) {
      const a = o[k], b = o[(k + 1) % o.length], len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(len > 1e-9)) continue;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
      for (const d of [0.05, 0.15, 0.3, 0.5, 1.0]) consider({ x: m.x + n.x * d, y: m.y + n.y * d });
    }
    if (best && best.c >= 0.2) return best.p;
    const xs = o.map(p => p.x), ys = o.map(p => p.y);
    for (let y = Math.floor(Math.min(...ys) * 4) / 4; y <= Math.max(...ys); y += 0.25) {
      for (let x = Math.floor(Math.min(...xs) * 4) / 4; x <= Math.max(...xs); x += 0.25) consider({ x: x + 0.125, y: y + 0.125 });
    }
    return best ? best.p : null;
  }

  // The bounded faces of the lines with the paper's edge as a wall, each with the raster region it is.
  function faces(atomSet, r) {
    const segs = [];
    for (const key of atomSet) { const [x1, y1, x2, y2] = key.split(',').map(Number); segs.push([{ x: x1, y: y1 }, { x: x2, y: y2 }]); }
    const c = [{ x: 0, y: 0 }, { x: SIDE, y: 0 }, { x: SIDE, y: SIDE }, { x: 0, y: SIDE }];
    for (let k = 0; k < 4; k++) segs.push([c[k], c[(k + 1) % 4]]);
    const { points, edges } = split(segs);
    const cycles = traverse(points, edges);
    const outer = cycles.filter(c => area(c) > 1e-9), holes = cycles.filter(c => area(c) < -1e-9);
    const rings = outer.map(o => [o]), areas = outer.map(area);
    for (const h of holes) {
      const left = h.reduce((m, p) => (p.x < m.x || (p.x === m.x && p.y < m.y) ? p : m));
      const probe = { x: left.x - 1e-4, y: left.y };
      let best = -1;
      outer.forEach((o, k) => { if (contains(o, probe) && (best < 0 || areas[k] < areas[best])) best = k; });
      if (best >= 0) rings[best].push(h);
    }
    const idNear = p => {
      const cx = Math.min(Math.max(Math.trunc(p.x * K), 0), W - 1), cy = Math.min(Math.max(Math.trunc(p.y * K), 0), H - 1);
      if (r.cells[cy * W + cx] > 0) return r.cells[cy * W + cx];
      for (let d = 1; d <= 3; d++) {
        for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= W || y >= H || !(r.cells[y * W + x] > 0)) continue;
          return r.cells[y * W + x];
        }
      }
      return 0;
    };
    const list = [];
    for (const rs of rings) {
      const p = insidePoint(rs);
      if (!p) continue;
      const id = idNear(p);
      if (id > 0) list.push({ id, rings: rs });
    }
    return list;
  }

  const regionArea = (faceList, id) => faceList.filter(f => f.id === id).reduce((s, f) => s + f.rings.reduce((t, r) => t + area(r), 0), 0);

  // The shown regions as SVG paths in board units (fill-rule evenodd) with their colors.
  function fillPaths(regions, shownIds, faceList) {
    const color = new Map(regions.filter(g => shownIds.has(g.id)).map(g => [g.id, g.color]));
    const fmt = v => +v.toFixed(4);
    return faceList.filter(f => color.has(f.id)).map(f => ({
      d: f.rings.map(r => 'M' + r.map(p => fmt(p.x) + ' ' + fmt(p.y)).join('L') + 'Z').join(''),
      color: PALETTE[Math.min(Math.max(color.get(f.id), 0), 15)],
    }));
  }

  // MARK: Solving by hand

  class Solve {
    constructor(picture) {
      this.picture = picture;
      this.regions = regionsOf(picture);
      const all = pictureAtoms(picture.segments);
      this.faces = faces(all, raster(all));
      this.segment = 0; this.point = 0; this.wrongTotal = 0;
      this.drawn = new Set(); this.dots = []; this.colored = new Set();
      this.pointCount = picture.segments.reduce((n, s) => n + s.length, 0);
    }
    get isFinished() { return this.segment >= this.picture.segments.length; }
    get target() { return this.isFinished ? null : this.picture.segments[this.segment][this.point]; }
    get heartsLeft() { return Math.max(0, HEARTS - this.wrongTotal); }
    get burned() { return this.heartsLeft === 0; }
    get burnsColors() { return !this.picture.message && !this.picture.title; }
    get perfect() { return this.isFinished && this.wrongTotal === 0; }
    get done() { return this.picture.segments.slice(0, this.segment).reduce((n, s) => n + s.length, 0) + this.point; }

    // → { outcome: 'penDown'|'line'|'dot'|'wrong'|'ignored', tapped, wanted, from, newlyColored, finished }
    tap(l) {
      const want = this.target;
      if (!want) return { outcome: 'ignored', newlyColored: [], finished: true };
      if (l.x !== want.x || l.y !== want.y) {
        this.wrongTotal += 1;
        return { outcome: 'wrong', tapped: l, wanted: want, heartsLeft: this.heartsLeft, newlyColored: [], finished: false };
      }
      const seg = this.picture.segments[this.segment];
      let outcome, from = null;
      if (seg.length === 1) { this.dots.push(l); outcome = 'dot'; }
      else if (this.point === 0) outcome = 'penDown';
      else { from = seg[this.point - 1]; for (const a of atoms(from, l)) this.drawn.add(a); outcome = 'line'; }
      this.point += 1;
      if (this.point >= seg.length) { this.segment += 1; this.point = 0; }
      let fresh = [];
      if (outcome === 'line') {
        fresh = earned(this.regions, this.drawn).filter(r => !this.colored.has(r.id));
        for (const r of fresh) this.colored.add(r.id);
      }
      return { outcome, tapped: l, from, newlyColored: fresh, finished: this.isFinished };
    }

    get saved() { return { segment: this.segment, point: this.point, wrongTotal: this.wrongTotal }; }

    // Picks up where it was left: the right points are replayed, the count of wrong ones restored.
    resume(p) {
      let guard = 0;
      while ((this.segment < p.segment || (this.segment === p.segment && this.point < p.point)) && this.target && guard++ < 10000) {
        this.tap(this.target);
      }
      this.wrongTotal = Math.max(0, p.wrongTotal | 0);
      return this;
    }
  }

  const length = pointCount => (pointCount < 40 ? 'quick' : pointCount < 90 ? 'medium' : 'long');

  const api = { DIGITS, VERSION, SIDE, K, W, H, HEARTS, PALETTE, Problem, pair, codeString, parseCode, parseColors,
                readPayload, atoms, pictureAtoms, raster, regionAt, regionsOf, earned, faces, regionArea, fillPaths, Solve, length };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Mystery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
