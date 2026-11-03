// A picture's page on coordigo.com/library/<id>/: its worksheet with the app's settings (paper, answer page, name line,
// title, words under a fold), the worksheet as a PDF, and solving it here. The page is the app's own (Coordigo
// Print.swift, WorksheetPage): the title, a one-line key, the empty grid at 70 % of the printable width with its 0–F
// axes, the count, the code as one run with a bar where the pen lifts, the words upside down under a fold; then the
// answer in colour. Drawn on a canvas, so every script prints, and put in a PDF (jsPDF, loaded on the first tap).
(() => {
  'use strict';
  const M = window.Mystery, $ = id => document.getElementById(id);
  const page = document.querySelector('[data-picture]');
  if (!M || !page) return;
  // the page carries its picture's code; the site's own list (library.js) is the fallback
  const item = page.dataset.payload ? { id: page.dataset.picture, payload: page.dataset.payload }
    : (window.CO_LIBRARY || []).find(i => i.id === page.dataset.picture);
  if (!item) return;
  const NUMBER = +page.dataset.number || 0, TITLE = page.dataset.title || '';
  const heading = (NUMBER ? '#' + NUMBER + ' ' : '') + TITLE;

  // MARK: Settings — the app's Settings › Worksheets, with its defaults; Letter in the Americas, A4 elsewhere.
  const LETTER = ['US', 'CA', 'MX', 'PH', 'PR', 'CL', 'CO', 'VE', 'GT', 'CR', 'PA', 'DO', 'SV', 'NI', 'HN', 'BZ'];
  const PAPER = { letter: { w: 612, h: 792 }, a4: { w: 595.28, h: 841.89 } };
  const region = ((navigator.language || 'en-US').split('-')[1] || 'US').toUpperCase();
  const form = $('sheetForm');
  if (form && !form.dataset.ready) {
    form.elements.paper.value = LETTER.includes(region) ? 'letter' : 'a4';
    form.dataset.ready = '1';
  }
  const options = () => ({
    paper: form.elements.paper.value, answer: form.elements.answer.checked, name: form.elements.name.checked,
    title: form.elements.title.checked, words: !!(form.elements.words && form.elements.words.checked),
  });

  // MARK: Drawing (y down, in page points)
  const INK = '#1f1e1c', MUTED = '#5f5e5a';
  const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  function wrap(ctx, text, x, y, width, size, lh, center) {
    const words = String(text).split(/(\s+)/); let line = '', out = y;
    const flush = () => { const s = line.trim(); ctx.fillText(s, center ? x + (width - ctx.measureText(s).width) / 2 : x, out + size); out += lh; line = ''; };
    for (const w of words) { if (line && ctx.measureText(line + w).width > width) flush(); line += w; }
    if (line.trim()) flush();
    return out;
  }
  function grid(ctx, ox, oy, side) {
    const u = side / 15;
    for (let k = 0; k <= 15; k++) {
      const major = k % 4 === 0 || k === 15;
      ctx.strokeStyle = major ? 'rgba(31,30,28,.32)' : 'rgba(31,30,28,.12)'; ctx.lineWidth = major ? 0.8 : 0.45;
      ctx.beginPath(); ctx.moveTo(ox + k * u, oy); ctx.lineTo(ox + k * u, oy + side); ctx.moveTo(ox, oy + k * u); ctx.lineTo(ox + side, oy + k * u); ctx.stroke();
    }
    ctx.fillStyle = MUTED; ctx.font = '500 7.5px ' + MONO;
    for (let k = 0; k <= 15; k++) {
      const d = M.DIGITS[k], w = ctx.measureText(d).width;
      ctx.fillText(d, ox + k * u - w / 2, oy - 4); ctx.fillText(d, ox - 6 - w, oy + k * u + 2.6);
    }
  }
  function flow(ctx, segs, x, y, width, size, draw) {
    ctx.font = size + 'px ' + MONO;
    const gap = size * 0.6, bar = size * 1.1, lh = size * 1.9;
    let cx = 0, row = 0;
    segs.forEach((s, i) => s.forEach((q, j) => {
      const text = M.pair(q), lift = i > 0 && j === 0, w = ctx.measureText(text).width + (lift ? bar : 0);
      if (cx > 0 && cx + w > width) { cx = 0; row++; }
      if (draw) {
        const base = y + row * lh + lh * 0.68; let tx = x + cx;
        if (lift) { ctx.strokeStyle = MUTED; ctx.lineWidth = Math.max(0.6, size * 0.07); ctx.beginPath(); ctx.moveTo(tx + size * 0.3, base - size * 0.9); ctx.lineTo(tx + size * 0.3, base + size * 0.22); ctx.stroke(); tx += bar; }
        ctx.fillStyle = INK; ctx.fillText(text, tx, base);
      }
      cx += w + gap;
    }));
    return (row + 1) * lh;
  }
  function fold(ctx, pg, words, height) {
    const top = pg.h - height, m = 42;
    ctx.save(); ctx.strokeStyle = '#888780'; ctx.lineWidth = 0.8; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(pg.w, top); ctx.stroke(); ctx.restore();
    ctx.font = '9px ' + SANS; const label = '✂ fold under · open when the picture is done', lw = ctx.measureText(label).width;
    ctx.fillStyle = '#fff'; ctx.fillRect((pg.w - lw) / 2 - 8, top - 7, lw + 16, 14);
    ctx.fillStyle = MUTED; ctx.fillText(label, (pg.w - lw) / 2, top + 3);
    ctx.save(); ctx.translate(pg.w / 2, top + height / 2 + 4); ctx.rotate(Math.PI);
    ctx.font = '600 19px ' + SANS; ctx.fillStyle = INK; wrap(ctx, words, -(pg.w - 2 * m) / 2, -14, pg.w - 2 * m, 19, 24, true);
    ctx.restore();
  }
  function raster(p) {
    const regions = M.regionsOf(p), px = M.pixels(regions, new Set(regions.map(r => r.id)));
    if (!px) return null;
    const c = document.createElement('canvas'); c.width = M.W; c.height = M.H;
    c.getContext('2d').putImageData(new ImageData(px, M.W, M.H), 0, 0);
    return c;
  }
  function puzzlePage(ctx, pg, p, o) {
    const m = 42, width = pg.w - 2 * m; let y = m;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pg.w, pg.h);
    ctx.font = '10px ' + MONO; ctx.fillStyle = MUTED;
    ctx.fillText('coordigo.com', pg.w - m - ctx.measureText('coordigo.com').width, y + 14);
    if (o.title) { ctx.font = '600 22px ' + SANS; ctx.fillStyle = INK; y = wrap(ctx, heading, m, y, width - 110, 22, 28); } else y += 18;
    if (o.name) {
      ctx.font = '10px ' + SANS; ctx.fillStyle = MUTED; const lx = pg.w - m - 150; ctx.fillText('Name', lx, y + 10);
      ctx.strokeStyle = MUTED; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(lx + ctx.measureText('Name').width + 4, y + 11); ctx.lineTo(pg.w - m, y + 11); ctx.stroke();
      y += 16;
    }
    ctx.font = '9.5px ' + SANS; ctx.fillStyle = MUTED;
    y = wrap(ctx, 'Join the points in order: first digit across, second down. At | lift the pen and start a new line.', m, y + 6, width, 9.5, 13) + 6;
    const words = o.words && p.message ? p.message : '';
    const foldH = words ? 108 : 0, bottom = pg.h - m * 0.6 - foldH;
    let side = width * 0.7, size = 11.5;
    const fixed = y + 14 + 16 + 18;
    while (fixed + side + flow(ctx, p.segments, m, 0, width, size, false) > bottom) { if (size > 8) size -= 0.5; else if (side > width * 0.45) side -= 8; else break; }
    const ox = (pg.w - side) / 2, oy = y + 12;
    grid(ctx, ox, oy, side);
    y = oy + side + 10;
    ctx.font = '9.5px ' + SANS; ctx.fillStyle = MUTED;
    ctx.fillText(p.segments.length + ' lines · ' + p.segments.reduce((n, s) => n + s.length, 0) + ' points', m, y + 9);
    flow(ctx, p.segments, m, y + 18, width, size, true);
    if (words) fold(ctx, pg, words, foldH);
  }
  function answerPage(ctx, pg, p) {
    const m = 42, width = pg.w - 2 * m; let y = m;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pg.w, pg.h);
    ctx.font = '600 10px ' + SANS; ctx.fillStyle = MUTED; y = wrap(ctx, 'ANSWER', m, y, width, 10, 14) + 4;
    ctx.font = '600 22px ' + SANS; ctx.fillStyle = INK; y = wrap(ctx, heading, m, y, width, 22, 28) + 6;
    const side = width * 0.86, ox = (pg.w - side) / 2, oy = y + 8, u = side / 15;
    const c = raster(p); if (c) { ctx.imageSmoothingEnabled = false; ctx.drawImage(c, ox, oy, side, side); }
    ctx.strokeStyle = INK; ctx.lineWidth = 0.12 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of p.segments) {
      if (s.length === 1) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ox + s[0].x * u, oy + s[0].y * u, 0.12 * u, 0, 7); ctx.fill(); continue; }
      ctx.beginPath(); ctx.moveTo(ox + s[0].x * u, oy + s[0].y * u); for (const q of s.slice(1)) ctx.lineTo(ox + q.x * u, oy + q.y * u); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(31,30,28,.25)'; ctx.lineWidth = 0.7; ctx.strokeRect(ox, oy, side, side);
    if (p.message) { ctx.font = 'italic 15px ' + SANS; ctx.fillStyle = INK; wrap(ctx, '“' + p.message + '”', m, oy + side + 22, width, 15, 20); }
  }
  function pageCanvas(pg, draw) {
    const S = 3, c = document.createElement('canvas'); c.width = Math.round(pg.w * S); c.height = Math.round(pg.h * S);
    const ctx = c.getContext('2d'); ctx.scale(S, S); draw(ctx); return c;
  }

  // MARK: The preview and the PDF
  let picture = null;
  const read = async () => picture || (picture = await M.readPayload(item.payload));
  async function preview() {
    const box = $('sheetPreview'); if (!box) return;
    const p = await read(), o = options(), pg = PAPER[o.paper];
    const c = pageCanvas(pg, ctx => puzzlePage(ctx, pg, p, o));
    c.style.width = '100%'; c.style.height = 'auto'; box.replaceChildren(c);
  }
  let lib = null;
  const loadPDF = () => lib || (lib = new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => ok(window.jspdf); s.onerror = fail; document.head.appendChild(s);
  }));
  async function download() {
    const btn = $('sheetPDF'); btn.disabled = true;
    try {
      const [j, p] = await Promise.all([loadPDF(), read()]);
      const o = options(), pg = PAPER[o.paper], doc = new j.jsPDF({ unit: 'pt', format: o.paper });
      const pages = [ctx => puzzlePage(ctx, pg, p, o)];
      if (o.answer) pages.push(ctx => answerPage(ctx, pg, p));
      pages.forEach((draw, i) => { if (i) doc.addPage(o.paper); doc.addImage(pageCanvas(pg, draw).toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pg.w, pg.h); });
      doc.save(page.dataset.file + '-worksheet.pdf');
    } finally { btn.disabled = false; }
  }
  form.addEventListener('change', preview);
  $('sheetPDF').addEventListener('click', download);
  const solve = $('solveHere'), player = $('player');
  solve.addEventListener('click', () => {
    player.hidden = false;
    player.src = '/mystery/?embed#' + item.payload;
    player.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  addEventListener('message', e => {
    if (e.source !== player.contentWindow || !e.data || !e.data.co) return;
    if (e.data.co === 'height') player.style.height = Math.max(420, e.data.h + 8) + 'px';
  });
  preview();
})();
