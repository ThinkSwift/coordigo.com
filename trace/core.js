// Tracing rules for the web, ported from the Coordigo app (no DOM here, so node can test it).
//   Walls  = every line of the tile (Rasterizer.drawSegment).
//   Paint  = fills in declared order; a cell already painted is not touched (Rasterizer / TileAnatomy).
//   Atom   = the shortest piece of a line between two lattice points (Atoms.swift).
//   A region's colour comes up when every atom on its edge is cleared (TileAnatomy.revealed).
//   A tile is done when every atom and dot is cleared (DigView.afterInk).
//   The finger clears one line at a time (Corridor.advance) and fills a missed piece (Corridor.bridge).

export const GRID = 15;          // a tile is 15 grid units (lattice 0…15)
export const RES = 240;          // colour map resolution per tile
export const SC = 16;            // cells per grid unit
export const CORRIDOR = 0.55;    // finger radius in grid units (DigView.corridor)

const WALL = -2, EMPTY = -1;

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function isLattice(p) { return p[0] === Math.round(p[0]) && p[1] === Math.round(p[1]); }

export function atomKey(ax, ay, bx, by) {
  return (ax < bx || (ax === bx && ay < by)) ? ax + "," + ay + "," + bx + "," + by : bx + "," + by + "," + ax + "," + ay;
}

function polyline(s) {
  if (s.t === "poly") return s.p.length ? s.p.concat([s.p[0]]) : null;
  if (s.t === "stroke") return s.p;
  return null;
}

// Walls only — one cell wide, always 4-connected (Rasterizer.drawSegment).
function walls(shapes) {
  const map = new Int16Array(RES * RES).fill(EMPTY);
  const cell = (v) => Math.min(Math.max(Math.round(v), 0), RES - 1);
  for (const s of shapes) {
    const line = polyline(s);
    if (!line) continue;
    for (let i = 0; i < line.length - 1; i++) {
      const ax = line[i][0] * SC, ay = line[i][1] * SC, bx = line[i + 1][0] * SC, by = line[i + 1][1] * SC;
      const steps = Math.max(Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))) * 4, 1);
      let px = cell(ax), py = cell(ay);
      map[py * RES + px] = WALL;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, nx = cell(ax + t * (bx - ax)), ny = cell(ay + t * (by - ay));
        if (nx !== px && ny !== py) map[ny * RES + px] = WALL;
        px = nx; py = ny;
        map[py * RES + px] = WALL;
      }
    }
  }
  return map;
}

// The cells of the region an anchor sits in (Rasterizer.regionMask), as a list. null when the anchor is on a wall.
function regionCells(anchor, wallMap, seen) {
  const sx = Math.min(Math.max(Math.round(anchor[0] * SC), 0), RES - 1);
  const sy = Math.min(Math.max(Math.round(anchor[1] * SC), 0), RES - 1);
  const k0 = sy * RES + sx;
  if (wallMap[k0] === WALL) return null;
  seen.fill(0);
  const out = [], stack = [k0];
  seen[k0] = 1;
  while (stack.length) {
    const k = stack.pop(), x = k % RES;
    out.push(k);
    if (x > 0) push(k - 1); if (x < RES - 1) push(k + 1);
    if (k >= RES) push(k - RES); if (k < RES * (RES - 1)) push(k + RES);
  }
  function push(n) { if (!seen[n] && wallMap[n] !== WALL) { seen[n] = 1; stack.push(n); } }
  return out;
}

/** Everything a tile needs: regions, atoms, dots, light cells, and a paint map with the walls filled in. */
export function buildTile(tile) {
  const shapes = tile.shapes;
  const wallMap = walls(shapes);
  const map = Int16Array.from(wallMap);            // cell → region id (1…), EMPTY (paper) or WALL
  const colors = [], seen = new Uint8Array(RES * RES);
  for (const s of shapes) {
    if (s.t !== "fill" || colors.length >= 120) continue;
    const cells = regionCells(s.p, wallMap, seen);
    if (!cells) continue;
    const id = colors.length + 1;
    let any = false;
    for (const k of cells) if (map[k] === EMPTY) { map[k] = id; any = true; }
    if (any) colors.push(s.c);
  }

  // Atoms and dots (Atomizer.ghost)
  const atoms = [], index = new Map(), dots = [], dotIndex = new Map();
  for (const s of shapes) {
    if (s.t === "dot") {
      if (isLattice(s.p)) { const k = s.p[0] + "," + s.p[1]; if (!dotIndex.has(k)) { dotIndex.set(k, dots.length); dots.push({ x: s.p[0], y: s.p[1] }); } }
      continue;
    }
    const line = polyline(s);
    if (!line) continue;
    for (let i = 0; i < line.length - 1; i++) {
      const p = line[i], q = line[i + 1];
      if (!isLattice(p) || !isLattice(q)) continue;
      const dx = q[0] - p[0], dy = q[1] - p[1], g = gcd(Math.abs(dx), Math.abs(dy));
      if (!g) continue;
      const ux = dx / g, uy = dy / g;
      for (let k = 0; k < g; k++) {
        const ax = p[0] + ux * k, ay = p[1] + uy * k, bx = ax + ux, by = ay + uy;
        const key = atomKey(ax, ay, bx, by);
        if (index.has(key)) continue;
        const [x1, y1, x2, y2] = key.split(",").map(Number);
        index.set(key, atoms.length);
        atoms.push({ x1, y1, x2, y2, key });
      }
    }
  }

  // Edge atoms: the colours on its two sides differ (TileAnatomy.compute)
  function regionAt(px, py) {
    const x = Math.round(px), y = Math.round(py);
    if (x < 0 || x >= RES || y < 0 || y >= RES) return 0;
    const c = map[y * RES + x];
    if (c === WALL) return null;
    return c === EMPTY ? 0 : c;
  }
  const boundary = colors.map(() => []);
  const free = [];
  atoms.forEach((a, ai) => {
    const ax = a.x1 * SC, ay = a.y1 * SC, dx = a.x2 * SC - ax, dy = a.y2 * SC - ay;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    let edge = false;
    const touched = new Set();
    for (const t of [0.25, 0.5, 0.75]) {
      const px = ax + dx * t, py = ay + dy * t;
      const l = regionAt(px + nx * 3, py + ny * 3), r = regionAt(px - nx * 3, py - ny * 3);
      if (l === null || r === null) continue;
      const cl = l > 0 ? colors[l - 1] : -1, cr = r > 0 ? colors[r - 1] : -1;
      if (cl !== cr) { edge = true; if (l > 0) touched.add(l); if (r > 0) touched.add(r); }
    }
    if (edge) touched.forEach((id) => boundary[id - 1].push(ai)); else free.push(ai);
  });

  // Paint map: walls take a neighbouring region's colour so no paper seams show between shapes.
  const paint = Int16Array.from(map);
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    const prev = Int16Array.from(paint);
    for (let k = 0; k < RES * RES; k++) {
      if (prev[k] !== WALL) continue;
      const x = k % RES, y = (k / RES) | 0;
      const nb = [x > 0 ? prev[k - 1] : WALL, x < RES - 1 ? prev[k + 1] : WALL, y > 0 ? prev[k - RES] : WALL, y < RES - 1 ? prev[k + RES] : WALL];
      let v = WALL;
      for (const n of nb) if (n > 0) { v = n; break; }
      if (v === WALL) for (const n of nb) if (n === EMPTY) { v = EMPTY; break; }
      if (v !== WALL) { paint[k] = v; changed = true; }
    }
    if (!changed) break;
  }
  const pixels = colors.map(() => []);
  for (let k = 0; k < RES * RES; k++) if (paint[k] > 0) pixels[paint[k] - 1].push(k);

  // Light cells (v2): painted over a region once that region is clear.
  const cells = (tile.cells || []).filter((c) => c.length === 3).map(([x, y, c]) => {
    const k = Math.min(RES - 1, Math.round((y + 0.5) * SC)) * RES + Math.min(RES - 1, Math.round((x + 0.5) * SC));
    return { x, y, c, region: map[k] > 0 ? map[k] : 0 };
  });

  const at = new Map();
  atoms.forEach((a, ai) => {
    for (const p of [a.x1 + "," + a.y1, a.x2 + "," + a.y2]) { if (!at.has(p)) at.set(p, []); at.get(p).push(ai); }
  });
  // Clues from the start: lines on the tile's edge (the app), and on the web also the lines that start at the edge —
  // some tiles have no line on the edge at all, and a first visitor needs somewhere to begin.
  const edge = (x, y) => x === 0 || y === 0 || x === GRID || y === GRID;
  const border = [];
  atoms.forEach((a, ai) => { if (edge(a.x1, a.y1) || edge(a.x2, a.y2)) border.push(ai); });

  const regions = colors.map((c, i) => ({ id: i + 1, color: c, boundary: boundary[i], pixels: Int32Array.from(pixels[i]) }));
  return { i: tile.i, j: tile.j, shapes, atoms, dots, regions, free, cells, at, border };
}

/** Region ids whose whole edge is cleared. `inked` is a Uint8Array over atoms. */
export function revealed(model, inked) {
  const out = new Set();
  for (const r of model.regions) if (r.boundary.every((ai) => inked[ai])) out.add(r.id);
  return out;
}

export function tileDone(model, inked, dotsDone) {
  for (let i = 0; i < model.atoms.length; i++) if (!inked[i]) return false;
  for (let i = 0; i < model.dots.length; i++) if (!dotsDone[i]) return false;
  return true;
}

export function distance(px, py, a) {
  const dx = a.x2 - a.x1, dy = a.y2 - a.y1, L2 = dx * dx + dy * dy;
  if (!L2) return Math.hypot(px - a.x1, py - a.y1);
  const t = Math.max(0, Math.min(1, ((px - a.x1) * dx + (py - a.y1) * dy) / L2));
  return Math.hypot(px - (a.x1 + dx * t), py - (a.y1 + dy * t));
}

/**
 * One line at a time (Corridor.advance). `state.chain` is the head of the line being drawn:
 * null before a line is caught, then the lattice points ("x,y") it may continue from.
 * Returns the atom indices cleared on the way from → to.
 */
export function advance(model, state, from, to, inked, radius = CORRIDOR) {
  const pool = new Set();
  model.atoms.forEach((_, ai) => { if (!inked[ai]) pool.add(ai); });
  if (!pool.size) return [];
  const follow = radius * 1.8;
  const out = [];
  const mx = to[0] - from[0], my = to[1] - from[1], motion = Math.hypot(mx, my);
  const steps = Math.max(1, Math.ceil(motion / 0.25));
  const atoms = model.atoms;
  const score = (a, px, py) => {
    let s = distance(px, py, a);
    if (motion > 0.05) {
      const ax = a.x2 - a.x1, ay = a.y2 - a.y1, al = Math.hypot(ax, ay);
      if (al > 0) s -= 0.3 * Math.abs(ax * mx + ay * my) / (al * motion);
    }
    return s;
  };
  const ahead = (a) => (a.x2 * mx + a.y2 * my > a.x1 * mx + a.y1 * my) ? a.x2 + "," + a.y2 : a.x1 + "," + a.y1;
  const xy = (k) => k.split(",").map(Number);

  for (let k = 0; k <= steps; k++) {
    const t = k / steps, px = from[0] + mx * t, py = from[1] + my * t;
    if (state.chain && state.chain.length &&
        state.chain.every((e) => { const [ex, ey] = xy(e); return Math.hypot(px - ex, py - ey) > 2.5; })) state.chain = null;
    if (state.chain && state.chain.length === 2 && motion > 0.05) {
      const [a, b] = state.chain.map(xy);
      state.chain = [(b[0] * mx + b[1] * my > a[0] * mx + a[1] * my) ? state.chain[1] : state.chain[0]];
    }
    const firstPick = !state.chain;
    let best = -1, bestScore = Infinity;
    if (state.chain) {
      for (const e of state.chain) for (const ai of model.at.get(e) || []) {
        if (!pool.has(ai)) continue;
        const s = score(atoms[ai], px, py);
        if (s < bestScore) { bestScore = s; best = ai; }
      }
    } else {
      for (const ai of pool) { const s = score(atoms[ai], px, py); if (s < bestScore) { bestScore = s; best = ai; } }
    }
    if (best < 0 || distance(px, py, atoms[best]) > (firstPick ? radius : follow)) continue;
    out.push(best);
    pool.delete(best);
    const a = atoms[best], ea = a.x1 + "," + a.y1, eb = a.x2 + "," + a.y2;
    if (state.chain) state.chain = [state.chain.includes(ea) ? eb : ea];
    else if (motion > 0.05) state.chain = [ahead(a)];
    else state.chain = [ea, eb];
  }
  return out;
}

/** Fill a missed piece: an atom near the path whose both ends already touch cleared lines (Corridor.bridge). */
export function bridge(model, from, to, inked, extra, radius = CORRIDOR * 1.8) {
  const ends = new Set();
  const lit = (ai) => inked[ai] || extra.includes(ai);
  model.atoms.forEach((a, ai) => { if (lit(ai)) { ends.add(a.x1 + "," + a.y1); ends.add(a.x2 + "," + a.y2); } });
  if (!ends.size) return [];
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.25));
  const out = [];
  model.atoms.forEach((a, ai) => {
    if (lit(ai)) return;
    if (!ends.has(a.x1 + "," + a.y1) || !ends.has(a.x2 + "," + a.y2)) return;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      if (distance(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, a) <= radius) { out.push(ai); return; }
    }
  });
  return out;
}

/** Dots within reach of a point. */
export function dotsNear(model, px, py, dotsDone, radius = CORRIDOR) {
  const out = [];
  model.dots.forEach((d, di) => { if (!dotsDone[di] && Math.hypot(px - d.x, py - d.y) <= radius) out.push(di); });
  return out;
}

/** Clues one step ahead (DigView.hints): lines at the tile's edge, lines joining what is cleared, and lines under the finger. */
export function hints(model, inked, finger) {
  const out = new Set();
  for (const ai of model.border) if (!inked[ai]) out.add(ai);
  model.atoms.forEach((a, ai) => {
    if (!inked[ai]) return;
    for (const e of [a.x1 + "," + a.y1, a.x2 + "," + a.y2]) for (const n of model.at.get(e) || []) if (!inked[n]) out.add(n);
  });
  if (finger) {
    const reach = CORRIDOR * 2;
    model.atoms.forEach((a, ai) => { if (!inked[ai] && distance(finger[0], finger[1], a) <= reach) out.add(ai); });
  }
  return out;
}

/** The next tile: the unfinished one nearest to where the hand last was (tile units), ties to the lower index. */
export function nextTile(scene, done, near) {
  let best = -1, bd = Infinity;
  scene.tiles.forEach((t, k) => {
    if (done[k]) return;
    const d = Math.hypot(t.i + 0.5 - near[0], t.j + 0.5 - near[1]);
    if (d < bd - 0.001) { bd = d; best = k; }
  });
  return best;
}
