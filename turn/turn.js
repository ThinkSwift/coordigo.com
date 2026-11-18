// Coordigo turn puzzle — the link and the object, for the web player.
// A line-by-line port of the app (Coordigo: CoordigoKit/Turn — TurnLink, TurnShape, TurnRandom, TurnObject, TurnPose),
// so a link builds the same cloud of points on the web as in the app. Docs: Coordigo/Docs/PROTOCOL-TURN-v1.md.
// Checked against the app's own output by tools/turn-check.mjs (reference from Coordigo/scripts/web-turn-reference.sh).
(function (root) {
  'use strict';

  const VERSION = 1;
  const DEG = Math.PI / 180;
  // Coordigo Docs/TURN-PUZZLE-6.3.md — the app's TurnTuning.
  const TUNING = {
    lock: 1 * DEG, hold: 2.0, guideFrom: 42 * DEG, rearm: 22 * DEG, ring: 0.36, dragGain: 0.009, shiftTwistGain: 0.012,
    pitchLimit: 80 * DEG, pairAngle: [65 * DEG, 115 * DEG], maxRowShift: 3, depth: 7.0, snap: 0.28,
  };
  // Stage 1…8: pictures × twist × guide lines (TurnStage.all).
  const STAGES = [false, true].flatMap(noGuide => [[1, false], [1, true], [2, false], [2, true]].map(([pictures, twist]) =>
    ({ index: (noGuide ? 4 : 0) + (pictures - 1) * 2 + (twist ? 1 : 0), pictures, twist, guide: !noGuide })))
    .sort((a, b) => a.index - b.index);

  class Problem extends Error { constructor(kind) { super(kind); this.kind = kind; } }

  // MARK: The link (TurnLink)

  function b64urlBytes(s) {
    let b = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const bin = atob(b);
    return Uint8Array.from(bin, ch => ch.charCodeAt(0));
  }

  // Raw DEFLATE (a link with a drawing of one's own is compressed, as a Mystery link): at most 16 KB out.
  async function inflateRaw(bytes) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) { reader.cancel(); throw new Problem('broken'); }
      chunks.push(value);
    }
    const out = new Uint8Array(size); let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  // Either form: plain JSON (Library puzzles) or deflated (a drawing). `inflate` is swappable for node.
  async function readLinkAsync(payload, inflate = inflateRaw) {
    try { return readLink(payload); } catch (e) { if (e.kind !== 'broken' || typeof payload !== 'string' || payload.length > 1200) throw e; }
    let bytes;
    try { bytes = await inflate(b64urlBytes(payload)); } catch (e) { throw new Problem('broken'); }
    return readBody(bytes);
  }

  // → { stage (0…7), pictures: [ids], seed, theta (tenths of a degree, signed), start: [yaw, pitch, roll] tenths,
  //     message, from, own: null | { d, c, n } }
  function readLink(payload) {
    let bytes;
    try {
      if (typeof payload !== 'string' || payload.length > 1200) throw 0;
      bytes = b64urlBytes(payload);
    } catch (e) { throw new Problem('broken'); }
    return readBody(bytes);
  }

  function readBody(bytes) {
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new Problem('broken'); }
    const int = v => Number.isInteger(v);
    if (!body || !int(body.v)) throw new Problem('broken');
    if (body.v > VERSION) throw new Problem('newer');
    const clip = (s, n) => {
      if (typeof s !== 'string') return null;
      const t = s.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, '').trim();
      if (!t) return null;
      const chars = typeof Intl !== 'undefined' && Intl.Segmenter ? Array.from(new Intl.Segmenter().segment(t), g => g.segment) : Array.from(t);
      return chars.slice(0, n).join('');
    };
    if (typeof body.d === 'string') {
      // A drawing of the sender's own: one picture; its code and colours are read by the Mystery engine.
      const ok = int(body.s) && body.s >= 1 && body.s <= 8 && STAGES[body.s - 1].pictures === 1 &&
        (body.p === undefined || (Array.isArray(body.p) && body.p.length === 0)) && Array.isArray(body.o) && body.o.length === 3 &&
        body.o.every(v => int(v) && Math.abs(v) <= 3600) && int(body.k) && body.k >= 0 && body.k <= 0xFFFFFFFF &&
        body.d.length <= 1500 && (body.c === undefined || (typeof body.c === 'string' && body.c.length <= 2600));
      if (!ok) throw new Problem('broken');
      return { stage: body.s - 1, pictures: [], seed: body.k, theta: 0, start: body.o, message: clip(body.m, 120),
               from: clip(body.f, 30), own: { d: body.d, c: body.c || '', n: clip(body.n, 40) } };
    }
    const lo = Math.round(TUNING.pairAngle[0] / DEG * 10), hi = Math.round(TUNING.pairAngle[1] / DEG * 10);
    const ok = int(body.s) && body.s >= 1 && body.s <= 8 && Array.isArray(body.o) && body.o.length === 3 &&
      body.o.every(v => int(v) && Math.abs(v) <= 3600) && Array.isArray(body.p) &&
      body.p.length === STAGES[body.s - 1].pictures && body.p.every(id => typeof id === 'string' && id.length >= 1 && id.length <= 80) &&
      new Set(body.p).size === body.p.length && int(body.k) && body.k >= 0 && body.k <= 0xFFFFFFFF;
    if (!ok) throw new Problem('broken');
    if (body.p.length === 2 && !(int(body.t) && Math.abs(body.t) >= lo && Math.abs(body.t) <= hi)) throw new Problem('broken');
    return { stage: body.s - 1, pictures: body.p, seed: body.k, theta: body.p.length === 2 ? body.t : 0, start: body.o,
             message: clip(body.m, 120), from: clip(body.f, 30), own: null };
  }

  // MARK: A picture's dots (TurnShape) — every dot exactly on a line of the picture

  // A place rounded to 1e-6 (as the app's TurnShape.Dot), so one place reached from two lines is one dot.
  const r6 = v => Math.round(v * 1e6) / 1e6;
  const key = (x, y) => r6(x) + ',' + r6(y);

  // Dense (one-picture objects): n + 1 evenly spaced dots, n = the longer side. Rows (two-picture objects): a dot where
  // the line crosses each whole row; a level line, a dot at every whole x.
  function line(p, q, rowsOnly = false) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const n = rowsOnly ? (dy === 0 ? Math.max(Math.abs(dx), 1) : Math.abs(dy)) : Math.max(Math.abs(dx), Math.abs(dy), 1);
    const out = [];
    for (let i = 0; i <= n; i++) out.push({ x: r6(p.x + dx * i / n), y: r6(p.y + dy * i / n) });
    return out;
  }

  function walk(seg, rowsOnly = false) {
    if (seg.length < 2) return seg.map(p => ({ x: p.x, y: p.y }));
    const out = [];
    for (let k = 0; k < seg.length - 1; k++) out.push(...line(seg[k], seg[k + 1], rowsOnly).slice(k === 0 ? 0 : 1));
    return out;
  }

  // segments: [[{x, y}]] (Mystery.parseCode) → { segments, rowsOnly, points, rows: Map(row → [x]) }
  function shape(segments, rowsOnly = false) {
    const seen = new Set(), points = [];
    const add = d => { const k = key(d.x, d.y); if (!seen.has(k)) { seen.add(k); points.push(d); } };
    for (const seg of segments) {
      if (seg.length === 1) add({ x: seg[0].x, y: seg[0].y });
      for (let k = 0; k < seg.length - 1; k++) for (const d of line(seg[k], seg[k + 1], rowsOnly)) add(d);
    }
    const rows = new Map();
    for (const p of points) if (p.y === Math.round(p.y)) { if (!rows.has(p.y)) rows.set(p.y, []); rows.get(p.y).push(p.x); }
    return { segments, rowsOnly, points, rows };
  }

  // The row shift (−3…3) at which b hides in the same object as a; null when none fits.
  function rowShift(a, b) {
    for (let s = -TUNING.maxRowShift; s <= TUNING.maxRowShift; s++) {
      const aFits = [...a.rows.keys()].every(y => b.rows.has(y - s));
      const bFits = [...b.rows.keys()].every(y => { const t = y + s; return t >= 0 && t <= 15 && a.rows.has(t); });
      if (aFits && bFits) return s;
    }
    return null;
  }

  // MARK: The object (TurnRandom, TurnObject)

  function random(seed) {
    let s = seed >>> 0;
    const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const shuffled = arr => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    return { next, shuffled };
  }

  function chains(sh, index) {
    const out = [];
    for (const seg of sh.segments) {
      if (seg.length < 2) continue;
      const c = walk(seg, sh.rowsOnly).map(l => index.get(key(l.x, l.y))).filter(i => i !== undefined);
      if (c.length > 1) out.push(c);
    }
    return out;
  }

  function single(a, seed) {
    const r = random(seed), index = new Map(), points = [];
    for (const p of a.points) {
      index.set(key(p.x, p.y), points.length);
      points.push([p.x - 7.5, 7.5 - p.y, (r.next() * 2 - 1) * TUNING.depth]);
    }
    return { points, views: [{ yaw: 0, shift: 0 }], chains: [chains(a, index)] };
  }

  function pair(a, b, s, theta, seed) {
    const r = random(seed), ia = new Map(), ib = new Map(), points = [];
    for (const y of [...a.rows.keys()].sort((p, q) => p - q)) {
      const ax = a.rows.get(y), bx = b.rows.get(y - s);
      if (!ax || !bx) continue;
      const xa = r.shuffled(ax), xb = r.shuffled(bx), n = Math.max(xa.length, xb.length);
      for (let i = 0; i < n; i++) {
        const x = xa[i % xa.length], bv = xb[i % xb.length];
        const X = x - 7.5, B = bv - 7.5, ka = key(x, y), kb = key(bv, y - s);
        if (!ia.has(ka)) ia.set(ka, points.length);
        if (!ib.has(kb)) ib.set(kb, points.length);
        points.push([X, 7.5 - y, (X * Math.cos(theta) - B) / Math.sin(theta)]);
      }
    }
    return { points, views: [{ yaw: 0, shift: 0 }, { yaw: -theta, shift: s }], chains: [chains(a, ia), chains(b, ib)] };
  }

  // A link + its pictures' segments → the puzzle (TurnLink.puzzle / TurnPuzzle.build); null if they do not fit.
  // One picture: dense dots; two: whole-row dots (the app's shape / rowShape).
  function build(link, segmentsList) {
    const stage = STAGES[link.stage], theta = link.theta / 10 * DEG;
    let object;
    if (segmentsList.length === 1) object = single(shape(segmentsList[0]), link.seed);
    else {
      const shapes = segmentsList.map(s => shape(s, true));
      const s = rowShift(shapes[0], shapes[1]);
      if (s === null || !(Math.sin(Math.abs(theta)) > 0.5)) return null;
      object = pair(shapes[0], shapes[1], s, theta, link.seed);
    }
    const start = {
      yaw: link.start[0] / 10 * DEG,
      pitch: Math.min(TUNING.pitchLimit, Math.max(-TUNING.pitchLimit, link.start[1] / 10 * DEG)),
      roll: stage.twist ? link.start[2] / 10 * DEG : 0,
    };
    const radius = Math.max(0, ...object.points.map(p => Math.hypot(p[0], p[1], p[2])));
    return { stage, object, theta: segmentsList.length === 2 ? theta : 0, start, half: Math.max(10.5, radius + 1.2) };
  }

  // MARK: Poses (TurnPose: yaw, then pitch, then roll — Euler ZXY)

  // Quaternions as [x, y, z, w], Hamilton product as simd_quatd.
  const axisAngle = (ax, ay, az, a) => [ax * Math.sin(a / 2), ay * Math.sin(a / 2), az * Math.sin(a / 2), Math.cos(a / 2)];
  function mul(p, q) {
    return [
      p[3] * q[0] + p[0] * q[3] + p[1] * q[2] - p[2] * q[1],
      p[3] * q[1] - p[0] * q[2] + p[1] * q[3] + p[2] * q[0],
      p[3] * q[2] + p[0] * q[1] - p[1] * q[0] + p[2] * q[3],
      p[3] * q[3] - p[0] * q[0] - p[1] * q[1] - p[2] * q[2],
    ];
  }
  const rotation = pose => mul(mul(axisAngle(0, 0, 1, pose.roll), axisAngle(1, 0, 0, pose.pitch)), axisAngle(0, 1, 0, pose.yaw));
  function angle(a, b) {
    const p = rotation(a), q = rotation(b);
    const d = Math.abs(p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3]);
    return 2 * Math.acos(Math.min(1, d));
  }
  // A point turned by a pose (q v q*), for drawing.
  function turnPoint(pose, v) {
    const q = rotation(pose), [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  }
  const showing = view => ({ yaw: view.yaw, pitch: 0, roll: 0 });

  const api = { VERSION, DEG, TUNING, STAGES, Problem, readLink, readLinkAsync, inflateRaw, line, walk, shape, rowShift, random, single, pair, build,
                rotation, angle, turnPoint, showing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Turn = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
