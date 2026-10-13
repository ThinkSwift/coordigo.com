// The Thirteenth Bell — Coordigo's Halloween story on the web, one chapter at a time.
// Each chapter is one picture with something hidden in it: its tiles are left as faint lines, and tracing them
// (the app's rules, /trace/core.js) brings it up, then the chapter's line. The bells, the lanterns and the list of
// missing things are on screen the whole way (founder rule: progress is visible). Data: #story (story-coordigo.py).
import * as C from "/trace/core.js";
import { track } from "/trace/track.js";

const S = JSON.parse(document.getElementById("story").textContent);
const N = S.chapters.length, BELLS = 13;
const KEY = "co_story_bell";
const M = 0.6;
const PAPER = [251, 249, 244], INK = "rgb(31,28,31)", GOLD = [204, 148, 15];
const GLOW = 700, FLASH = 550, FADE = 300, BLOOM = 1000;
const ACTS = ["Act I", "Act II", "Act III"];

const $ = (id) => document.getElementById(id);
const reduceQ = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const reduce = () => reduceQ.matches;
const now = () => performance.now();

// ── progress (per browser) ──────────────────────────────────────────
let seen = new Set();
try { (JSON.parse(localStorage.getItem(KEY) || "{}").done || []).forEach((n) => seen.add(n)); } catch (_) {}
const saveSeen = () => { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, done: [...seen] })); } catch (_) {} };

// ── the chapter on screen ───────────────────────────────────────────
let ch = null, scene = null, models = [], hide = [], ti = 0;
let ink = null, dots = null, finished = false, revealedSet = new Set(), revealAt = new Map(), recent = new Map();
let bloomAt = 0, finger = null, hover = null, chainState = { chain: null }, busy = false, token = 0;
const cache = new Map();

const rgb = (c) => scene.palette[c] || PAPER;
function pale(c) {
  const [r, g, b] = rgb(c);
  if (r > 247 && g > 247 && b > 247) return [236, 233, 228];
  return [r * 0.42 + 251 * 0.58, g * 0.42 + 249 * 0.58, b * 0.42 + 244 * 0.58];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const model = (k) => models[k] || (models[k] = C.buildTile(scene.tiles[k]));

const imgCanvas = document.createElement("canvas");
imgCanvas.width = imgCanvas.height = C.RES;
const imgCtx = imgCanvas.getContext("2d");
const imgData = imgCtx.createImageData(C.RES, C.RES);
function regionImage(m, colourOf) {
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = PAPER[0]; d[i + 1] = PAPER[1]; d[i + 2] = PAPER[2]; d[i + 3] = 255; }
  for (const r of m.regions) {
    const c = colourOf(r);
    if (!c) continue;
    for (let n = 0; n < r.pixels.length; n++) { const o = r.pixels[n] * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; }
  }
  imgCtx.putImageData(imgData, 0, 0);
  return imgCanvas;
}
function strokeShapes(ctx, shapes, unit, width, style = INK) {
  ctx.beginPath();
  for (const s of shapes) {
    const line = s.t === "stroke" ? s.p : s.t === "poly" ? s.p.concat([s.p[0]]) : null;
    if (!line || line.length < 2) continue;
    ctx.moveTo(line[0][0] * unit, line[0][1] * unit);
    for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0] * unit, line[i][1] * unit);
  }
  ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.stroke();
}
function paintCells(ctx, m, unit, open) {
  for (const c of m.cells) {
    if (open && !open(c.region)) continue;
    const [r, g, b] = rgb(c.c);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(c.x * unit, c.y * unit, unit, unit);
  }
}

// ── the whole picture, hidden tiles left open ───────────────────────
const picCv = $("pic"), picCtx = picCv.getContext("2d");
function drawPicture() {
  if (!scene) return;
  const r = picCv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(320, Math.round((r.width || 640) * dpr));
  picCv.width = W; picCv.height = Math.round(W * scene.rows / scene.cols);
  const ctx = picCtx, side = W / scene.cols;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgb(${PAPER})`; ctx.fillRect(0, 0, W, picCv.height);
  scene.tiles.forEach((t, k) => {
    const x0 = Math.round(t.i * side), y0 = Math.round(t.j * side);
    const w = Math.round((t.i + 1) * side) - x0, h = Math.round((t.j + 1) * side) - y0, unit = w / C.GRID;
    const m = model(k), open = hide.indexOf(k);
    ctx.save(); ctx.translate(x0, y0); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    if (open < 0 || finished || open < ti) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(regionImage(m, (r) => rgb(r.color)), -0.5, -0.5, w + 1, h + 1);
      paintCells(ctx, m, unit, null);
      strokeShapes(ctx, m.shapes, unit, Math.max(0.7, unit * 0.14));
    } else {
      const inked = open === ti ? ink : null, rev = inked ? C.revealed(m, inked) : new Set();
      ctx.drawImage(regionImage(m, (r) => rev.has(r.id) ? rgb(r.color) : null), -0.5, -0.5, w + 1, h + 1);
      paintCells(ctx, m, unit, (rid) => rev.has(rid));
      strokeShapes(ctx, m.shapes, unit, Math.max(0.6, unit * 0.08), "rgba(31,28,31,.22)");
    }
    ctx.restore();
  });
  if (!finished && hide[ti] !== undefined) {
    const t = scene.tiles[hide[ti]], lw = Math.max(2, W / 260);
    ctx.setLineDash([lw * 2.5, lw * 1.8]);
    ctx.strokeStyle = `rgb(${GOLD})`; ctx.lineWidth = lw;
    ctx.strokeRect(t.i * side + lw / 2, t.j * side + lw / 2, side - lw, side - lw);
    ctx.setLineDash([]);
  }
}

// ── the tile being traced ───────────────────────────────────────────
const tileCv = $("tile"), tileCtx = tileCv.getContext("2d");
let raf = 0;
const redraw = () => { if (!raf) raf = requestAnimationFrame(frame); };
function frame() {
  raf = 0;
  if (!scene || hide[ti] === undefined) return;
  const t = now(), k = hide[ti], m = model(k), isDone = finished || C.tileDone(m, ink, dots);
  const W = tileCv.width, unit = W / (C.GRID + 2 * M), o = M * unit, side = C.GRID * unit, ctx = tileCtx;
  let animating = !!finger;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgb(${PAPER})`; ctx.fillRect(0, 0, W, W);
  ctx.translate(o, o);
  const img = regionImage(m, (r) => {
    if (isDone || revealedSet.has(r.id)) {
      const age = revealAt.has(r.id) ? t - revealAt.get(r.id) : 1e9;
      let c = age < FADE && !reduce() ? mix(pale(r.color), rgb(r.color), age / FADE) : rgb(r.color);
      if (age < FLASH && !reduce()) { c = mix(c, [255, 255, 255], 0.75 * (1 - age / FLASH)); animating = true; }
      return c;
    }
    let c = pale(r.color);
    if (r.boundary.length) {
      let n = 0;
      for (const ai of r.boundary) n += ink[ai];
      if (n) c = mix(c, rgb(r.color), 0.5 * n / r.boundary.length);
    }
    return c;
  });
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, side, side); ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, side, side);
  paintCells(ctx, m, unit, (rid) => isDone || revealedSet.has(rid));
  for (const [step, a, lw] of [[1, 0.05, 0.5], [4, 0.11, 0.8]]) {
    ctx.beginPath();
    for (let q = 0; q <= C.GRID; q += step) {
      const v = Math.round(q * unit) + 0.5;
      ctx.moveTo(v, 0); ctx.lineTo(v, side); ctx.moveTo(0, v); ctx.lineTo(side, v);
    }
    ctx.strokeStyle = `rgba(31,28,31,${a})`; ctx.lineWidth = lw * (window.devicePixelRatio || 1);
    ctx.stroke();
  }
  ctx.restore();
  const w = Math.max(1.6, unit * 0.16);
  ctx.save();
  ctx.beginPath(); ctx.rect(-w / 2, -w / 2, side + w, side + w); ctx.clip();
  ctx.lineCap = "round";
  if (!isDone) {
    const clue = C.hints(m, ink, finger || hover);
    ctx.beginPath();
    for (const ai of clue) { const a = m.atoms[ai]; ctx.moveTo(a.x1 * unit, a.y1 * unit); ctx.lineTo(a.x2 * unit, a.y2 * unit); }
    ctx.setLineDash([w * 1.2, w * 1.4]);
    ctx.strokeStyle = "rgba(31,28,31,.32)"; ctx.lineWidth = w * 0.8; ctx.stroke();
    ctx.setLineDash([]);
    m.dots.forEach((d, di) => {
      if (dots[di]) return;
      ctx.beginPath(); ctx.arc(d.x * unit, d.y * unit, Math.max(2, unit * 0.2), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(31,28,31,.36)"; ctx.lineWidth = 1; ctx.stroke();
    });
  }
  ctx.beginPath();
  m.atoms.forEach((a, ai) => { if (isDone || ink[ai]) { ctx.moveTo(a.x1 * unit, a.y1 * unit); ctx.lineTo(a.x2 * unit, a.y2 * unit); } });
  ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.stroke();
  if (!reduce()) {
    for (const [ai, at] of recent) {
      const age = (t - at) / GLOW;
      if (age >= 1) { recent.delete(ai); continue; }
      animating = true;
      const a = m.atoms[ai], q = 1 - age;
      ctx.beginPath(); ctx.moveTo(a.x1 * unit, a.y1 * unit); ctx.lineTo(a.x2 * unit, a.y2 * unit);
      ctx.shadowColor = `rgba(${GOLD},${0.9 * q})`; ctx.shadowBlur = w * 1.8;
      ctx.strokeStyle = `rgba(${GOLD},${0.85 * q})`; ctx.lineWidth = w * 1.1; ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
  } else recent.clear();
  m.dots.forEach((d, di) => {
    if (!isDone && !dots[di]) return;
    ctx.beginPath(); ctx.arc(d.x * unit, d.y * unit, Math.max(2, unit * 0.2), 0, Math.PI * 2);
    ctx.fillStyle = INK; ctx.fill();
  });
  ctx.restore();
  if (finger && !isDone) {
    const cx = finger[0] * unit, cy = finger[1] * unit, cr = C.CORRIDOR * unit * 1.9;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    g.addColorStop(0, `rgba(${GOLD},.22)`); g.addColorStop(0.5, `rgba(${GOLD},.06)`); g.addColorStop(1, `rgba(${GOLD},0)`);
    ctx.fillStyle = g; ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
  }
  if (bloomAt && !reduce()) {
    const age = (t - bloomAt) / BLOOM;
    if (age < 1) {
      animating = true;
      const g = ctx.createRadialGradient(side / 2, side / 2, 0, side / 2, side / 2, side * (0.2 + 1.2 * age));
      g.addColorStop(0, `rgba(255,255,255,${0.7 * (1 - age)})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, side, side);
    }
  }
  if (animating) redraw();
}
function sizeTile() {
  const w = Math.round(tileCv.getBoundingClientRect().width) || 340, dpr = Math.min(window.devicePixelRatio || 1, 2);
  tileCv.width = tileCv.height = Math.round(w * dpr);
  redraw();
}

function startTile() {
  const m = model(hide[ti]);
  ink = new Uint8Array(m.atoms.length); dots = new Uint8Array(m.dots.length);
  revealedSet = new Set(); revealAt.clear(); recent.clear(); bloomAt = 0;
  finger = null; hover = null; chainState = { chain: null };
  $("tileNote").textContent = hide.length > 1 ? `Square ${ti + 1} of ${hide.length}` : "";
  sizeTile(); drawPicture();
}

function gridPoint(e) {
  const r = tileCv.getBoundingClientRect(), span = C.GRID + 2 * M;
  return [(e.clientX - r.left) / r.width * span - M, (e.clientY - r.top) / r.height * span - M];
}
let started = false;
function touch(from, to) {
  if (finished || busy || hide[ti] === undefined) return;
  const R = C.CORRIDOR;
  if (to[0] < -R || to[0] > C.GRID + R || to[1] < -R || to[1] > C.GRID + R) { chainState = { chain: null }; return; }
  const m = model(hide[ti]);
  const found = C.advance(m, chainState, from, to, ink);
  const gaps = C.bridge(m, from, to, ink, found);
  const all = found.concat(gaps.filter((g) => !found.includes(g)));
  const near = C.dotsNear(m, to[0], to[1], dots);
  if (!all.length && !near.length) return;
  const t = now();
  for (const ai of all) { ink[ai] = 1; recent.set(ai, t); }
  for (const di of near) dots[di] = 1;
  if (!started) { started = true; track("story_start", { story: "bell" }, { onlyOnce: true }); }
  const open = C.revealed(m, ink);
  for (const id of open) if (!revealedSet.has(id)) revealAt.set(id, t);
  revealedSet = open;
  if (C.tileDone(m, ink, dots)) tileFinished();
  queuePic(); redraw();
}
let picQueued = false;
function queuePic() { if (!picQueued) { picQueued = true; requestAnimationFrame(() => { picQueued = false; drawPicture(); }); } }

function tileFinished() {
  bloomAt = now(); finger = null; busy = true;
  const tok = token;
  setTimeout(() => {
    busy = false;
    if (tok !== token) return;
    if (ti + 1 < hide.length) { ti++; startTile(); return; }
    reveal(true);
  }, reduce() ? 400 : BLOOM + 200);
}

tileCv.addEventListener("pointerdown", (e) => {
  if (e.button > 0) return;
  e.preventDefault();
  try { tileCv.setPointerCapture(e.pointerId); } catch (_) {}
  const p = gridPoint(e);
  finger = p; chainState = { chain: null };
  touch(p, p); redraw();
});
tileCv.addEventListener("pointermove", (e) => {
  if (!finger) { if (e.pointerType === "mouse") { hover = gridPoint(e); redraw(); } return; }
  e.preventDefault();
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of (list.length ? list : [e])) { const p = gridPoint(ev); touch(finger, p); if (finger) finger = p; }
  redraw();
});
const release = (e) => {
  if (finger && e && e.type === "pointerup") touch(finger, gridPoint(e));
  finger = null; chainState = { chain: null }; redraw();
};
tileCv.addEventListener("pointerup", release);
tileCv.addEventListener("pointercancel", release);
tileCv.addEventListener("pointerleave", () => { if (!finger) { hover = null; redraw(); } });

// ── bells, lanterns, the missing ────────────────────────────────────
// What has happened by the end of chapter n (rung bells, things missing, things found) — always computed from the
// story, so the meters match whatever chapter is open.
function stateAt(n) {
  let bell = 0; const missing = [], found = new Set();
  for (const c of S.chapters) {
    if (c.n > n) break;
    if (c.bell) bell = c.bell;
    (c.missing || []).forEach((x) => { if (!missing.includes(x)) missing.push(x); });
    (c.found || []).forEach((x) => found.add(x));
  }
  return { bell, missing, found };
}
const BELL = '<svg viewBox="0 0 20 22" aria-hidden="true"><path d="M10 2.5c-3.6 0-5.6 2.9-5.6 6.6v4.2L2.6 16.8h14.8l-1.8-3.5V9.1C15.6 5.4 13.6 2.5 10 2.5z"/><circle cx="10" cy="19" r="1.9"/></svg>';
function meters(n, ring) {
  const s = stateAt(n);
  $("bells").innerHTML = Array.from({ length: BELLS }, (_, i) =>
    `<span class="bell${i < s.bell ? " on" : ""}${ring && i === s.bell - 1 ? " ring" : ""}">${BELL}</span>`).join("");
  $("bellText").textContent = s.bell ? `Bell ${s.bell} of ${BELLS}` : `Bell 0 of ${BELLS}`;
  $("lanterns").innerHTML = S.chapters.map((c) =>
    `<a href="#${c.n}" class="lamp${seen.has(c.n) ? " lit" : ""}${c.n === ch.n ? " here" : ""}" aria-label="Chapter ${c.n}${seen.has(c.n) ? ", done" : ""}"></a>`).join("");
  $("missing").innerHTML = s.missing.length
    ? s.missing.map((x) => `<span class="gone${s.found.has(x) ? " back" : ""}">${x}</span>`).join("")
    : '<span class="none">nothing yet</span>';
}

// ── chapters ────────────────────────────────────────────────────────
async function loadScene(id) {
  if (cache.has(id)) return cache.get(id);
  const p = fetch(`/halloween/pics/${id}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  cache.set(id, p);
  return p;
}

function reveal(fresh) {
  finished = true;
  seen.add(ch.n); saveSeen();
  drawPicture(); redraw();
  $("trace").hidden = true;
  $("line").textContent = ch.line;
  $("after").hidden = false;
  const rung = fresh && ch.bell;
  meters(ch.n, rung);
  $("rang").textContent = ch.bell ? (fresh ? `The bell rings — ${ch.bell}.` : `Bell ${ch.bell}.`) : "";
  if (fresh) {
    track("story_chapter", { story: "bell", n: ch.n });
    if (ch.n === N) track("story_done", { story: "bell" });
    if (!reduce()) { $("after").classList.remove("rise"); void $("after").offsetWidth; $("after").classList.add("rise"); }
  }
}

async function open(n) {
  ch = S.chapters[Math.min(Math.max(n, 1), N) - 1];
  const tok = ++token;
  scene = null; models = []; finished = false; ti = 0; busy = false;
  $("act").textContent = `${ACTS[ch.act]} · ${S.acts[ch.act]} — chapter ${ch.n} of ${N}`;
  $("title").textContent = ch.title;
  $("after").hidden = true; $("trace").hidden = true; $("sketch").hidden = true; $("picFrame").hidden = true;
  $("prev").hidden = ch.n === 1;
  $("prev").href = `#${ch.n - 1}`;
  $("next").href = ch.n < N ? `#${ch.n + 1}` : "#end";
  $("next").textContent = ch.n < N ? `Chapter ${ch.n + 1} →` : "The end →";
  $("end").hidden = true; $("chapter").hidden = false;
  meters(ch.n - 1, false);
  if (!ch.pic) {                                   // the picture is still being drawn
    $("sketch").hidden = false;
    reveal(!seen.has(ch.n));
    return;
  }
  $("picFrame").hidden = false;
  try { scene = await loadScene(ch.pic); } catch (_) { if (tok === token) { $("sketch").hidden = false; reveal(false); } return; }
  if (tok !== token) return;
  hide = (scene.hide && scene.hide.length ? scene.hide : ch.hide).filter((k) => k >= 0 && k < scene.tiles.length);
  if (seen.has(ch.n) || !hide.length) { drawPicture(); reveal(false); return; }
  $("find").textContent = `Something is missing in the gold square. Trace it to find ${ch.find}.`;
  $("trace").hidden = false;
  startTile();
}

function showEnd() {
  token++;
  $("chapter").hidden = true; $("end").hidden = false;
  ch = S.chapters[N - 1];
  meters(N, false);
}

function route() {
  const h = location.hash.slice(1);
  if (h === "end") { showEnd(); window.scrollTo(0, 0); return; }
  let n = parseInt(h, 10);
  if (!Number.isFinite(n)) { n = 1; while (n < N && seen.has(n)) n++; }
  open(n);
  if (h) $("story-top").scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" });
}
$("skip").addEventListener("click", () => { if (!finished && scene) { token++; reveal(true); } });
$("restart").addEventListener("click", () => {
  if (!confirm("Start the story again from the first bell?")) return;
  seen = new Set(); saveSeen();
  if (location.hash === "#1") route(); else location.hash = "#1";
});
window.addEventListener("hashchange", route);
let rz = 0;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { drawPicture(); if (!$("trace").hidden) sizeTile(); }, 120); });
route();
