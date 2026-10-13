// Trace a picture — "Bell at Night" (intro-10001), all twelve tiles, with the app's rules (core.js).
import * as C from "/trace/core.js";
import { track } from "/trace/track.js";

const PIC = "intro-10001";
const KEY = "co_trace_" + PIC;
const SHARE_URL = "https://coordigo.com/trace/";
const M = 0.6;                                   // paper margin around the tile, grid units (border lines stay whole and reachable)
const PAPER = [251, 249, 244], INK = "rgb(31,28,31)", GOLD = [204, 148, 15];
const GLOW = 700, FLASH = 550, FADE = 300, BLOOM = 1000;

const $ = (id) => document.getElementById(id);
const reduceQ = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const reduce = () => reduceQ.matches;
const now = () => performance.now();

let scene, models = [], ink = [], dotsDone = [], done = [];
let cur = -1, secs = 0, lastInkAt = 0, startedHere = false, saveTimer = 0;
let revealedSet = new Set(), revealAt = new Map(), recent = new Map(), bloomAt = 0, busy = false;
let finger = null, hover = null, chainState = { chain: null }, lastTouch = null, downAt = null;

// ── data ────────────────────────────────────────────────────────────
function model(k) { return models[k] || (models[k] = C.buildTile(scene.tiles[k])); }
function buildAll() { for (let k = 0; k < scene.tiles.length; k++) model(k); }
const label = (k) => String.fromCharCode(65 + scene.tiles[k].i) + (scene.tiles[k].j + 1);
const totalLines = () => models.reduce((s, m) => s + m.atoms.length, 0);
const doneLines = () => ink.reduce((s, a) => s + a.reduce((x, v) => x + v, 0), 0);
const allDone = () => done.length && done.every(Boolean);

function restore() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}
  scene.tiles.forEach((t, k) => {
    const m = model(k);
    ink[k] = new Uint8Array(m.atoms.length);
    dotsDone[k] = new Uint8Array(m.dots.length);
    if (s && s.v === 1) {
      (s.t?.[k] || []).forEach((i) => { if (i >= 0 && i < m.atoms.length) ink[k][i] = 1; });
      (s.d?.[k] || []).forEach((i) => { if (i >= 0 && i < m.dots.length) dotsDone[k][i] = 1; });
    }
    done[k] = C.tileDone(m, ink[k], dotsDone[k]);
  });
  secs = (s && s.v === 1 && Number.isFinite(s.s)) ? s.s : 0;
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
  clearTimeout(saveTimer);
  const t = {}, d = {};
  ink.forEach((a, k) => { const l = []; a.forEach((v, i) => v && l.push(i)); if (l.length) t[k] = l; });
  dotsDone.forEach((a, k) => { const l = []; a.forEach((v, i) => v && l.push(i)); if (l.length) d[k] = l; });
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, t, d, s: Math.round(secs) })); } catch (_) {}
}
function clearSaved() { try { localStorage.removeItem(KEY); } catch (_) {} }

// ── colours ─────────────────────────────────────────────────────────
const rgb = (c) => scene.palette[c] || PAPER;
function pale(c) {                                   // Landscape.pale
  const [r, g, b] = rgb(c);
  if (r > 247 && g > 247 && b > 247) return [236, 233, 228];
  return [r * 0.42 + 251 * 0.58, g * 0.42 + 249 * 0.58, b * 0.42 + 244 * 0.58];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Region colours of one tile into a 240×240 image. colourOf(region) → [r,g,b] or null (paper).
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
// Finished tiles are drawn often (map, picture, card) — keep one image each.
const fullImages = [];
function fullImage(k) {
  if (fullImages[k]) return fullImages[k];
  const c = document.createElement("canvas");
  c.width = c.height = C.RES;
  c.getContext("2d").drawImage(regionImage(model(k), (r) => rgb(r.color)), 0, 0);
  return (fullImages[k] = c);
}

function strokeShapes(ctx, shapes, unit, width) {
  ctx.beginPath();
  for (const s of shapes) {
    const line = s.t === "stroke" ? s.p : s.t === "poly" ? s.p.concat([s.p[0]]) : null;
    if (!line || line.length < 2) continue;
    ctx.moveTo(line[0][0] * unit, line[0][1] * unit);
    for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0] * unit, line[i][1] * unit);
  }
  ctx.strokeStyle = INK; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
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

/** A finished tile in the pixel rectangle that `tileRect` gives (whole pixels, so no seams show between tiles). */
function tileRect(x, y, side, t) {
  const x0 = Math.round(x + t.i * side), y0 = Math.round(y + t.j * side);
  return [x0, y0, Math.round(x + (t.i + 1) * side) - x0, Math.round(y + (t.j + 1) * side) - y0];
}
function drawFinishedTile(ctx, k, [x, y, w, h], lineScale = 0.16) {
  const m = model(k), unit = w / C.GRID;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fullImage(k), -0.5, -0.5, w + 1, h + 1);
  paintCells(ctx, m, unit, null);
  strokeShapes(ctx, m.shapes, unit, Math.max(0.7, unit * lineScale));
  ctx.restore();
}
/** The whole finished picture into a rectangle. */
function drawPicture(ctx, x, y, w) {
  buildAll();
  const side = w / scene.cols;
  ctx.fillStyle = `rgb(${PAPER})`;
  ctx.fillRect(x, y, w, side * scene.rows);
  scene.tiles.forEach((t, k) => drawFinishedTile(ctx, k, tileRect(x, y, side, t)));
}

// ── the tile being traced ───────────────────────────────────────────
const tileCv = $("tile"), tileCtx = tileCv.getContext("2d");
let raf = 0;
function redraw() { if (!raf) raf = requestAnimationFrame(frame); }

function tileGeom() {
  const W = tileCv.width, unit = W / (C.GRID + 2 * M);
  return { W, unit, o: M * unit, side: C.GRID * unit };
}

function frame() {
  raf = 0;
  if (cur < 0 || !scene) return;
  const t = now(), m = model(cur), inked = ink[cur], isDone = done[cur];
  const { W, unit, o, side } = tileGeom();
  const ctx = tileCtx;
  let animating = !!finger;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgb(${PAPER})`;
  ctx.fillRect(0, 0, W, W);
  ctx.translate(o, o);

  // shapes — pale, filling a little with every edge line, clear when the edge is closed, a short flash
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
      for (const ai of r.boundary) n += inked[ai];
      if (n) c = mix(c, rgb(r.color), 0.5 * n / r.boundary.length);
    }
    return c;
  });
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, side, side); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, side, side);
  paintCells(ctx, m, unit, (rid) => isDone || revealedSet.has(rid));
  // grid — thin every unit, a little darker every four
  for (const [step, a, lw] of [[1, 0.05, 0.5], [4, 0.11, 0.8]]) {
    ctx.beginPath();
    for (let k = 0; k <= C.GRID; k += step) {
      const v = Math.round(k * unit) + 0.5;
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
  // clues — one step ahead
  if (!isDone) {
    const clue = C.hints(m, inked, finger || hover);
    ctx.beginPath();
    for (const ai of clue) { const a = m.atoms[ai]; ctx.moveTo(a.x1 * unit, a.y1 * unit); ctx.lineTo(a.x2 * unit, a.y2 * unit); }
    ctx.setLineDash([w * 1.2, w * 1.4]);
    ctx.strokeStyle = "rgba(31,28,31,.32)"; ctx.lineWidth = w * 0.8;
    ctx.stroke();
    ctx.setLineDash([]);
    const rr = Math.max(2, unit * 0.2);
    m.dots.forEach((d, di) => {
      if (dotsDone[cur][di]) return;
      ctx.beginPath(); ctx.arc(d.x * unit, d.y * unit, rr, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(31,28,31,.36)"; ctx.lineWidth = 1; ctx.stroke();
    });
  }
  // cleared lines
  ctx.beginPath();
  m.atoms.forEach((a, ai) => { if (inked[ai]) { ctx.moveTo(a.x1 * unit, a.y1 * unit); ctx.lineTo(a.x2 * unit, a.y2 * unit); } });
  ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.stroke();
  // just cleared — a gold glow that fades
  if (!reduce()) {
    for (const [ai, at] of recent) {
      const age = (t - at) / GLOW;
      if (age >= 1) { recent.delete(ai); continue; }
      animating = true;
      const a = m.atoms[ai], k = 1 - age;
      ctx.beginPath(); ctx.moveTo(a.x1 * unit, a.y1 * unit); ctx.lineTo(a.x2 * unit, a.y2 * unit);
      ctx.shadowColor = `rgba(${GOLD},${0.9 * k})`; ctx.shadowBlur = w * 1.8;
      ctx.strokeStyle = `rgba(${GOLD},${0.85 * k})`; ctx.lineWidth = w * 1.1; ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
  } else recent.clear();
  m.dots.forEach((d, di) => {
    if (!dotsDone[cur][di]) return;
    ctx.beginPath(); ctx.arc(d.x * unit, d.y * unit, Math.max(2, unit * 0.2), 0, Math.PI * 2);
    ctx.fillStyle = INK; ctx.fill();
  });
  ctx.restore();

  // the finger — a faint gold halo
  if (finger && !isDone) {
    const cx = finger[0] * unit, cy = finger[1] * unit, cr = C.CORRIDOR * unit * 1.9;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    g.addColorStop(0, `rgba(${GOLD},.22)`); g.addColorStop(0.5, `rgba(${GOLD},.06)`); g.addColorStop(1, `rgba(${GOLD},0)`);
    ctx.fillStyle = g; ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
  }
  // tile finished — light passes once
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
  const w = Math.round(tileCv.getBoundingClientRect().width) || 340;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  tileCv.width = tileCv.height = Math.round(w * dpr);
  redraw();
  sizeMap();
}

// ── the map (whole picture) ─────────────────────────────────────────
const mapCv = $("map"), mapCtx = mapCv.getContext("2d");
function sizeMap() {
  const r = mapCv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  mapCv.width = Math.round((r.width || 148) * dpr);
  mapCv.height = Math.round((r.height || 111) * dpr);
  drawMap();
}
function drawMap() {
  if (!scene) return;
  const W = mapCv.width, side = W / scene.cols, ctx = mapCtx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgb(${PAPER})`;
  ctx.fillRect(0, 0, W, mapCv.height);
  scene.tiles.forEach((t, k) => {
    const x = t.i * side, y = t.j * side;
    if (done[k]) { drawFinishedTile(ctx, k, tileRect(0, 0, side, t), 0.14); return; }
    const m = models[k];
    if (!m || !ink[k] || !ink[k].some(Boolean)) return;
    const open = C.revealed(m, ink[k]), unit = side / C.GRID;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath(); ctx.rect(0, 0, side, side); ctx.clip();
    ctx.drawImage(regionImage(m, (r) => open.has(r.id) ? rgb(r.color) : null), 0, 0, side, side);
    paintCells(ctx, m, unit, (rid) => open.has(rid));
    ctx.beginPath();
    m.atoms.forEach((a, ai) => { if (ink[k][ai]) { ctx.moveTo(a.x1 * unit, a.y1 * unit); ctx.lineTo(a.x2 * unit, a.y2 * unit); } });
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.7, unit * 0.14); ctx.lineCap = "round"; ctx.stroke();
    ctx.restore();
  });
  // tile seams
  ctx.beginPath();
  for (let i = 1; i < scene.cols; i++) { ctx.moveTo(Math.round(i * side) + 0.5, 0); ctx.lineTo(Math.round(i * side) + 0.5, mapCv.height); }
  for (let j = 1; j < scene.rows; j++) { ctx.moveTo(0, Math.round(j * side) + 0.5); ctx.lineTo(W, Math.round(j * side) + 0.5); }
  ctx.strokeStyle = "rgba(31,28,31,.16)"; ctx.lineWidth = 1; ctx.stroke();
  if (cur >= 0) {
    const t = scene.tiles[cur], lw = Math.max(1.5, W / 100);
    ctx.strokeStyle = `rgb(${GOLD})`; ctx.lineWidth = lw;
    ctx.strokeRect(t.i * side + lw / 2, t.j * side + lw / 2, side - lw, side - lw);
  }
}
let mapQueued = false;
function queueMap() { if (!mapQueued) { mapQueued = true; requestAnimationFrame(() => { mapQueued = false; drawMap(); }); } }

function progress() {
  const total = totalLines();
  $("progLines").textContent = doneLines().toLocaleString("en") + " / " + total.toLocaleString("en");
  $("progTiles").textContent = "lines · " + done.filter(Boolean).length + " / " + scene.tiles.length + " tiles";
  $("tileName").textContent = cur >= 0 ? "Tile " + label(cur) + (done[cur] ? " · done" : "") : "";
}

// ── tracing ─────────────────────────────────────────────────────────
function open(k, fade = true) {
  if (k < 0) return;
  model(k);
  const go = () => {
    cur = k;
    finger = null; hover = null; chainState = { chain: null };
    recent.clear(); revealAt.clear(); bloomAt = 0;
    revealedSet = C.revealed(models[k], ink[k]);
    tileCv.classList.remove("swap");
    progress(); drawMap(); redraw();
  };
  if (fade && !reduce() && cur >= 0) { tileCv.classList.add("swap"); setTimeout(go, 220); } else go();
}

function gridPoint(e) {
  const r = tileCv.getBoundingClientRect(), span = C.GRID + 2 * M;
  return [(e.clientX - r.left) / r.width * span - M, (e.clientY - r.top) / r.height * span - M];
}

function touch(from, to) {
  if (cur < 0 || done[cur] || busy) return;
  const R = C.CORRIDOR;
  if (to[0] < -R || to[0] > C.GRID + R || to[1] < -R || to[1] > C.GRID + R) { chainState = { chain: null }; return; }
  const m = models[cur], inked = ink[cur];
  const found = C.advance(m, chainState, from, to, inked);
  const gaps = C.bridge(m, from, to, inked, found);
  const all = found.concat(gaps.filter((g) => !found.includes(g)));
  const dots = C.dotsNear(m, to[0], to[1], dotsDone[cur]);
  lastTouch = to;
  if (!all.length && !dots.length) return;
  const t = now();
  for (const ai of all) { inked[ai] = 1; recent.set(ai, t); }
  for (const di of dots) dotsDone[cur][di] = 1;
  // time spent tracing: gaps longer than 30 s are a pause, not work
  if (lastInkAt) secs += Math.min((t - lastInkAt) / 1000, 30);
  lastInkAt = t;
  if (!startedHere) {
    startedHere = true;
    track("trace_start", { pic: PIC }, { onlyOnce: true });
    $("guide").classList.add("off");
    try { localStorage.setItem("co_trace_stroked", "1"); } catch (_) {}
  }
  const nowOpen = C.revealed(m, inked);
  for (const id of nowOpen) if (!revealedSet.has(id)) revealAt.set(id, t);
  revealedSet = nowOpen;
  if (C.tileDone(m, inked, dotsDone[cur])) finishTile();
  save(); progress(); queueMap(); redraw();
}

function finishTile() {
  done[cur] = true;
  bloomAt = now();
  finger = null;
  busy = true;
  saveNow();
  const k = cur;
  setTimeout(() => {
    busy = false;
    if (cur !== k) return;
    if (allDone()) { finishPicture(true); return; }
    const t = scene.tiles[k], lt = lastTouch || [7.5, 7.5];
    const near = [t.i + Math.min(Math.max(lt[0] / C.GRID, 0), 1), t.j + Math.min(Math.max(lt[1] / C.GRID, 0), 1)];
    open(C.nextTile(scene, done, near));
  }, reduce() ? 500 : BLOOM + 250);
}

tileCv.addEventListener("pointerdown", (e) => {
  if (e.button > 0) return;
  e.preventDefault();
  try { tileCv.setPointerCapture(e.pointerId); } catch (_) {}
  const p = gridPoint(e);
  downAt = p; finger = p; chainState = { chain: null };
  touch(p, p);
  redraw();
});
tileCv.addEventListener("pointermove", (e) => {
  if (!finger) {
    if (e.pointerType === "mouse") { hover = gridPoint(e); redraw(); }
    return;
  }
  e.preventDefault();
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of (list.length ? list : [e])) {
    const p = gridPoint(ev);
    touch(finger, p);
    if (finger) finger = p;
  }
  redraw();
});
function release(e) {
  if (finger && e && e.type === "pointerup") touch(finger, gridPoint(e));
  finger = null; downAt = null; chainState = { chain: null };
  redraw();
}
tileCv.addEventListener("pointerup", release);
tileCv.addEventListener("pointercancel", release);
tileCv.addEventListener("pointerleave", () => { if (!finger) { hover = null; redraw(); } });

mapCv.addEventListener("click", (e) => {
  if (busy) return;
  const r = mapCv.getBoundingClientRect();
  const i = Math.floor((e.clientX - r.left) / r.width * scene.cols), j = Math.floor((e.clientY - r.top) / r.height * scene.rows);
  if (i < 0 || j < 0 || i >= scene.cols || j >= scene.rows) return;
  const k = j * scene.cols + i;
  if (k !== cur) open(k);
});

$("restart").addEventListener("click", () => {
  if (!doneLines()) return;
  if (!confirm("Clear every line and start again?")) return;
  restart();
});
function restart() {
  ink.forEach((a) => a.fill(0)); dotsDone.forEach((a) => a.fill(0)); done.fill(false);
  secs = 0; lastInkAt = 0; startedHere = false;
  clearSaved();
  cur = -1;
  startTracing();
}

// ── finished ────────────────────────────────────────────────────────
function minutes(s) {
  if (!s || s < 60) return "under a minute";
  const mm = Math.round(s / 60);
  return mm < 90 ? mm + " min" : Math.floor(mm / 60) + " h " + (mm % 60) + " min";
}

function renderPicture(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(320, Math.round((r.width || 540) * dpr));
  cv.width = w; cv.height = Math.round(w * scene.rows / scene.cols);
  drawPicture(cv.getContext("2d"), 0, 0, w);
}

function finishPicture(fresh) {
  saveNow();
  show("done");
  const total = totalLines();
  $("stat").textContent = total.toLocaleString("en") + " lines · " + scene.tiles.length + " tiles" + (secs ? " · " + minutes(secs) : "");
  $("verse").textContent = scene.verse || "";
  renderPicture($("finalCanvas"));
  $("sent").textContent = ""; $("linkBox").hidden = true;
  const frameEl = document.querySelector("#done .glow");
  frameEl.classList.remove("play");
  ["verse", "stat"].forEach((id) => $(id).classList.remove("rise", "d1", "d2"));
  if (fresh) {
    track("trace_done", { pic: PIC, secs: Math.round(secs) });
    if (!reduce()) {
      void frameEl.offsetWidth;
      frameEl.classList.add("play");
      $("verse").classList.add("rise", "d1");
      $("stat").classList.add("rise", "d2");
    }
  }
  if (fresh) $("done").scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" });
}

async function card() {
  try { await Promise.all([document.fonts.load('600 54px "Source Serif 4"'), document.fonts.load('italic 30px "Source Serif 4"')]); } catch (_) {}
  const W = 1200, H = 1200, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#f7f4ec"; ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  for (let v = 0; v <= W; v += 24) { ctx.moveTo(v + 0.5, 0); ctx.lineTo(v + 0.5, H); ctx.moveTo(0, v + 0.5); ctx.lineTo(W, v + 0.5); }
  ctx.strokeStyle = "rgba(27,25,23,.055)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.save();
  ctx.shadowColor = "rgba(27,25,23,.14)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#fffdf8"; ctx.fillRect(48, 48, 1104, 834);
  ctx.restore();
  drawPicture(ctx, 60, 60, 1080);
  const serif = '"Source Serif 4", Georgia, serif', mono = 'ui-monospace, Menlo, monospace';
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#1b1917"; ctx.font = "600 54px " + serif; ctx.textAlign = "left";
  ctx.fillText(scene.title, 60, 960);
  ctx.fillStyle = "#6d6557"; ctx.font = "italic 30px " + serif;
  (scene.verse || "").split("\n").forEach((l, i) => ctx.fillText(l, 60, 1010 + i * 40));
  if (secs) {
    ctx.fillStyle = "#a8761a"; ctx.font = "24px " + mono; ctx.textAlign = "right";
    ctx.fillText("traced in " + minutes(secs), 1140, 960);
  }
  ctx.fillStyle = "#d02670"; ctx.fillRect(60, 1100, 44, 44);
  ctx.fillStyle = "#fff"; ctx.font = "600 19px " + serif; ctx.textAlign = "center";
  ctx.fillText("Co", 82, 1129);
  ctx.fillStyle = "#1b1917"; ctx.font = "600 30px " + serif; ctx.textAlign = "left";
  ctx.fillText("Coordigo", 118, 1132);
  ctx.fillStyle = "#6d6557"; ctx.font = "22px " + mono; ctx.textAlign = "right";
  ctx.fillText("coordigo.com/trace", 1140, 1130);
  return cv;
}

$("save").addEventListener("click", async () => {
  const cv = await card();
  cv.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "bell-at-night-coordigo.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    track("trace_save", { pic: PIC });
  }, "image/png");
});

function shareLink() {
  return SHARE_URL + "#done=" + PIC + (secs >= 1 ? "&t=" + Math.round(secs) : "");
}
$("send").addEventListener("click", async () => {
  const url = shareLink(), say = (s) => { $("sent").textContent = s; };
  if (navigator.share) {
    try {
      await navigator.share({ title: scene.title + " · Coordigo", text: "I traced " + scene.title + ". Trace one yourself:", url });
      track("trace_share", { pic: PIC, method: "share" });
      return;
    } catch (err) { if (err && err.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    say("Link copied.");
    track("trace_share", { pic: PIC, method: "copy" });
  } catch (_) {
    const box = $("linkBox");
    box.value = url; box.hidden = false; box.focus(); box.select();
    say("Copy this link.");
    track("trace_share", { pic: PIC, method: "manual" });
  }
});

$("again").addEventListener("click", () => {
  if (!confirm("Clear the picture and trace it again?")) return;
  restart();
  $("stage").scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" });
});

// ── opened from a sent link ────────────────────────────────────────
function received() {
  let q;
  try { q = new URLSearchParams(location.hash.slice(1)); } catch (_) { return false; }
  if (q.get("done") !== PIC) return false;
  const t = parseInt(q.get("t") || "", 10);
  const ok = Number.isFinite(t) && t > 0 && t < 86400 * 7;
  show("received");
  $("recLine").textContent = ok ? "Traced line by line in " + minutes(t) + ", until every colour came up." : "Traced line by line, until every colour came up.";
  $("recVerse").textContent = scene.verse || "";
  renderPicture($("recCanvas"));
  track("trace_received", { pic: PIC, t: ok ? t : 0 });
  return true;
}
$("recGo").addEventListener("click", () => {
  try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
  startTracing();
  window.scrollTo({ top: 0, behavior: "auto" });
});

// ── views ───────────────────────────────────────────────────────────
function show(id) {
  ["received", "stage", "done"].forEach((v) => { $(v).hidden = v !== id; });
  document.documentElement.classList.remove("rcv");
}

function startTracing() {
  if (allDone()) { finishPicture(false); return; }
  show("stage");
  let seen = false;
  try { seen = localStorage.getItem("co_trace_stroked") === "1"; } catch (_) {}
  if (seen || doneLines()) $("guide").classList.add("off");
  sizeTile();
  // Begin where the home page's demo tile is (B2), or carry on from the first unfinished tile near it.
  open(done[5] ? C.nextTile(scene, done, [1.5, 1.5]) : 5, false);
}

async function main() {
  try {
    const res = await fetch("/trace/bell-at-night.json");
    scene = await res.json();
  } catch (_) {
    $("stage").hidden = false;
    $("progLines").textContent = "The picture did not load. Try again in a moment.";
    return;
  }
  restore();
  progress();
  if (!received()) startTracing();
  window.addEventListener("resize", () => {
    if (!$("stage").hidden) sizeTile();
    if (!$("done").hidden) renderPicture($("finalCanvas"));
    if (!$("received").hidden) renderPicture($("recCanvas"));
  });
  addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveNow(); lastInkAt = 0; });
}
main();
