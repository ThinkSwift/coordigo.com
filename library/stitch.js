// A picture's counted cross stitch pattern on coordigo.com/library/<id>/ (founder 2026-11-07, RDM-co-site-free-printables):
// two print pages drawn in the reader's browser, Letter or A4, in the reader's language or English, beside the worksheet
// in the same menu. Page 1: the title, the picture's message, facts, the stitched hoop, the floss key, what you need, the
// finished size and how to stitch it. Page 2: the 30 x 30 chart (a symbol per colour, backstitch, couching ticks, bold
// lines every 10, centre arrows), its legend and a stitch guide. Every page: coordigo.com, "Free to download" and the stamp.
// The pattern (library/stitch/<id>.json), the hoop and the chart drawing and the DMC key (library/stitch-draw.js) come from
// coordigo-engine tools/cross_stitch/export_web.py; the type, the surfaces, the foot and the PDF are the worksheet's
// (window.CoSheet, library/worksheet.js); the words are library/stitch-words.js. tools/stitch-check.py checks every page fits.
(() => {
  'use strict';
  const C = window.CoSheet, D = window.CoStitchDraw, $ = id => document.getElementById(id);
  if (!C || !D || !C.page) return;
  const WORDS = window.CO_STITCH_WORDS || {};
  const st = (lang, key, ...args) => {
    const v = (WORDS[lang] || {})[key] != null ? WORDS[lang][key] : (WORDS.en || {})[key];
    if (typeof v !== 'string') return v;
    let i = 0; return v.replace(/%(?:(\d)\$)?@/g, (_, n) => String(args[n ? +n - 1 : i++]));
  };
  // offered once the founder has looked at the patterns; until then only with ?stitch=preview
  const offered = window.CO_STITCH === true || /[?&]stitch=preview/.test(location.search);
  if (offered && $('kindSet')) { $('kindSet').hidden = false; if ($('menuTitle')) $('menuTitle').hidden = true; }
  for (const el of document.querySelectorAll('[data-st]')) el.textContent = st(C.readerLang, el.dataset.st);

  let pattern = null;
  const load = () => pattern || (pattern = fetch('/library/stitch/' + C.page.dataset.picture + '.json')
    .then(r => { if (!r.ok) throw new Error('no pattern'); return r.json(); }));

  // MARK: Counts and sizes, as the engine's sheet counts them (build_pdf.py)
  function stats(d) {
    const full = {}, three = {}, quarter = {};
    for (const [, , kind, a, b] of d.cells) {
      if (kind === 'F') { full[a] = (full[a] || 0) + 1; continue; }
      const f = a != null ? a : b, other = a != null ? b : null;
      three[f] = (three[f] || 0) + 1; if (other != null) quarter[other] = (quarter[other] || 0) + 1;
    }
    const gcd = (p, q) => { p = Math.abs(p); q = Math.abs(q); while (q) [p, q] = [q, p % q]; return p || 1; };
    let bs = 0, couched = 0;
    for (const s of d.lines) for (let k = 1; k < s.length; k++) {
      const [ax, ay] = s[k - 1], [bx, by] = s[k], g = gcd(bx - ax, by - ay), step = Math.hypot((bx - ax) / g, (by - ay) / g);
      bs += step * g; if (step > 3.2) couched += g;
    }
    let x0 = d.size, y0 = d.size, x1 = 0, y1 = 0;
    for (const c of d.cells) { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0] + 1); y1 = Math.max(y1, c[1] + 1); }
    for (const s of d.lines) for (const [a, b] of s) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
    return { full, three, quarter, bs, couched, W: x1 - x0, H: y1 - y0, x0, y0 };
  }
  // numbers in the sheet's language with Latin digits (the chart is numbered 0, 10, 20, 30)
  const num = (lang, v, dp = 0) => new Intl.NumberFormat(lang + '-u-nu-latn', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(v);
  const dims = (lang, w, h, ct, unit) => {
    const f = unit === 'in' ? v => v / ct : v => v / ct * 2.54;
    return num(lang, f(w), 1) + ' × ' + num(lang, f(h), 1) + ' ' + unit;
  };

  // MARK: Drawings as SVG: the chart framed as the engine's sheet frames it, a key swatch, a legend mark, the stitch guide
  const INK_LINE = '#2c2a2c';
  const ink = k => D.lum(D.HEX[k]) < 0.6 ? '#ffffff' : D.shade(D.HEX[k], -0.55);
  // the start arrows point at the middle of the design (where the stitcher starts), not the middle of the 30 x 30 chart
  function chartSVG(d, sx) {
    const N = d.size, Q = 26, M = 30, sz = N * Q, out = [`<rect x="${M}" y="${M}" width="${sz}" height="${sz}" fill="#fff"/>`];
    out.push(`<g transform="translate(${M} ${M}) scale(${Q / 20})">${D.chart(d).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`);
    let g = ''; for (let k = 0; k <= N; k++) g += `M${M + k * Q} ${M}V${M + sz}M${M} ${M + k * Q}H${M + sz}`;
    out.push(`<path d="${g}" stroke="#000" stroke-opacity=".14" stroke-width=".7" fill="none"/>`);
    let b = ''; for (let k = 0; k <= N; k += 10) b += `M${M + k * Q} ${M}V${M + sz}M${M} ${M + k * Q}H${M + sz}`;
    out.push(`<path d="${b}" stroke="#000" stroke-opacity=".5" stroke-width="1.3" fill="none"/>`);
    for (let k = 0; k <= N; k += 10) out.push(`<text x="${M + k * Q}" y="${M - 8}" font-size="11" text-anchor="middle" fill="#6b6d63" font-family="Helvetica, Arial, sans-serif">${k}</text>`
      + `<text x="${M - 8}" y="${M + k * Q + 4}" font-size="11" text-anchor="end" fill="#6b6d63" font-family="Helvetica, Arial, sans-serif">${k}</text>`);
    const cx = M + (sx.x0 + sx.W / 2) * Q, cy = M + (sx.y0 + sx.H / 2) * Q;
    out.push(`<path d="M${cx - 7} ${M - 24}L${cx + 7} ${M - 24}L${cx} ${M - 13}Z M${M - 24} ${cy - 7}L${M - 24} ${cy + 7}L${M - 13} ${cy}Z" fill="#a3202f"/>`);
    const v = sz + M * 1.6;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v} ${v}" width="${v}" height="${v}">${out.join('')}</svg>`;
  }
  const swatch = k => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 24" width="30" height="24"><rect x=".5" y=".5" width="29" height="23" fill="${D.HEX[k]}" stroke="rgba(0,0,0,.18)"/>${D.symbol(k, 15, 12, 13, ink(k))}</svg>`;
  const backSwatch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 24" width="30" height="24"><line x1="4" y1="12" x2="26" y2="12" stroke="${INK_LINE}" stroke-width="3" stroke-linecap="round"/></svg>`;
  const MARKS = {
    back: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 14" width="22" height="14"><line x1="2" y1="7" x2="20" y2="7" stroke="${INK_LINE}" stroke-width="3" stroke-linecap="round"/></svg>`,
    tack: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 14" width="22" height="14"><line x1="2" y1="7" x2="20" y2="7" stroke="${INK_LINE}" stroke-width="3"/><line x1="11" y1="1" x2="11" y2="13" stroke="${INK_LINE}" stroke-width="2"/></svg>`,
    tri: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 14" width="22" height="14"><path d="M4 0H18L4 14Z" fill="#c9c9c2"/></svg>`,
    empty: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 14" width="22" height="14"><rect x="4.5" y=".5" width="13" height="13" fill="#fff" stroke="#c9c9c2"/></svg>`,
  };
  const G = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect x="8" y="8" width="48" height="48" fill="none" stroke="#d9dad3"/>${inner}</svg>`;
  const L = (a, b, c, d, w = 7, col = '#d9303e') => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  const GUIDE = [
    ['gFull', G(L(12, 52, 52, 12) + L(12, 12, 52, 52))], ['gThree', G(L(12, 52, 52, 12) + L(12, 12, 32, 32))], ['gQuarter', G(L(52, 52, 32, 32))],
    ['gBack', G(L(8, 40, 24, 24, 4, INK_LINE) + L(26, 22, 40, 8, 4, INK_LINE))], ['gCouch', G(L(6, 50, 58, 14, 4, INK_LINE) + L(26, 24, 38, 40, 3, INK_LINE))],
  ];

  // MARK: Type helpers on top of the worksheet's
  const { face, F_SERIF, F_SANS, F_PIX, D_INK, SOFT, RULE, CAP } = C;
  const caps = (s, lang) => C.LATIN(s) ? s.toUpperCase() : s.toLocaleUpperCase(lang);
  // A paragraph whose first words are bold (a step's lead): words laid one by one, lines broken where they no longer fit
  function rich(S, parts, x, y, w, lang, lh, rtl) {
    if (rtl) {
      for (const [s, font] of parts) if (s.trim()) y = C.block(S, s.trim(), font, D_INK, x, y, w, lang, lh, 'right');
      return y;
    }
    const toks = [];
    for (const [s, font] of parts) for (const p of C.pieces(s, lang)) toks.push({ s: p, font });
    const rows = [[]]; let used = 0;
    for (const t of toks) {
      const tw = C.width(t.s, t.font), row = rows[rows.length - 1];
      if (row.length && used + C.width(t.s.trimEnd(), t.font) > w) { rows.push([]); used = 0; if (!t.s.trim()) continue; }
      rows[rows.length - 1].push(t); used += tw;
    }
    const size = parseFloat(/([\d.]+)px/.exec(parts[0][1])[1]), base = (lh - size) / 2 + size * 0.8;
    for (const row of rows) if (row.reduce((n, t) => n + C.width(t.s, t.font), 0) > w + 1 + C.width(' ', parts[0][1])) C.note('overflow: a step line is wider than its column');
    if (S) S.words([x - 4, y - 2, w + 8, rows.length * lh + 6], ctx => {
      ctx.textBaseline = 'alphabetic'; ctx.fillStyle = D_INK; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
      rows.forEach((row, i) => {
        let cx = rtl ? x + w : x;
        for (const t of row) {
          const tw = C.width(t.s, t.font); ctx.font = t.font;
          ctx.fillText(t.s, cx, y + base + i * lh); cx += rtl ? -tw : tw;
        }
      });
    });
    return y + rows.length * lh;
  }
  const fitSize = (s, fam, max, min, w, lang, maxLines) => {
    for (let z = max; z >= min; z -= 1) if (C.lines(s, face(fam, z), w, lang).length <= maxLines) return z;
    C.note('title: smaller than ' + min + 'pt would be needed'); return min;
  };
  const FOOT_ROOM = 34;                                          // the foot below the last line, as the worksheet keeps it

  // MARK: Page 1 — title, message, facts, hoop; floss key | what you need, finished size; how to stitch it
  async function page1(S, pg, d, o, hoop, z) {
    const m = C.MARGINS[o.paper], W = pg.w - 2 * m, lang = o.lang, rtl = C.RTL_LANG(lang), A = rtl ? 'right' : 'left';
    const X = (x, w) => rtl ? pg.w - x - w : x;
    const sx = stats(d);
    S.rect(0, 0, pg.w, pg.h, '#ffffff');
    const hw = Math.round(W * z.hoop), hh = hw * 1.08, gap = 18, lw = W - hw - gap;
    if (hoop) S.picture(hoop, X(m + lw + gap, hw), m - 4, hw, hh);
    let y = m;
    y = C.block(S, caps(st(lang, 'kicker'), lang), face(F_PIX, 8), CAP, X(m, lw), y, lw, lang, 11, A) + 4;
    const title = C.pick(C.OWN.t, lang) || d.title;
    const tz = fitSize(title, F_SERIF, 34, 22, lw, lang, 2);
    y = C.block(S, title, face(F_SERIF, tz), D_INK, X(m, lw), y, lw, lang, tz * 1.08, A) + 6;
    const msg = C.noEmoji(C.pick(C.OWN.m, lang));
    if (msg) y = C.block(S, msg, face(F_SANS, 12), SOFT, X(m, lw), y, lw, lang, 16, A) + 12;
    // facts, two by two under a hairline
    S.lines([[[X(m, lw), y], [X(m, lw) + lw, y]]], { color: RULE, width: 0.75 }); y += 10;
    const facts = [[st(lang, 'design'), st(lang, 'designVal', num(lang, sx.W), num(lang, sx.H))],
      [st(lang, 'on14'), dims(lang, sx.W, sx.H, 14, 'cm')],
      [st(lang, 'colours'), st(lang, 'coloursVal', num(lang, d.colors.length))],
      [st(lang, 'stitches'), st(lang, 'stitchesVal', num(lang, d.cells.length))]];
    const fw = (lw - 16) / 2;
    let rowY = y;
    for (let r = 0; r < 2; r++) {
      let h = 0;
      for (let c = 0; c < 2; c++) {
        const [k, v] = facts[r * 2 + c], fx = X(m + c * (fw + 16), fw);
        let yy = C.block(S, k, face(F_SANS, 8.5), SOFT, fx, rowY, fw, lang, 11, A);
        yy = C.block(S, v, face(F_SANS, 11, 700), D_INK, fx, yy + 1, fw, lang, 14, A);
        h = Math.max(h, yy - rowY);
      }
      rowY += h + 7;
    }
    y = Math.max(rowY, m - 4 + hh) + 16;

    // the floss key (left) and what you need with the finished size (right)
    const colGap = 22, kw = (W - colGap) * 1.35 / 2.35, rw = W - colGap - kw;
    const kx = m, rx = m + kw + colGap;
    const KX = (x, w) => X(kx + x, w), RX = (x, w) => X(rx + x, w);
    const NUM_A = rtl ? 'left' : 'right';
    let ky = C.block(S, st(lang, 'key'), face(F_SERIF, 15), D_INK, KX(0, kw), y, kw, lang, 19, A) + 4;
    const th = face(F_PIX, 6.5), nW = 30, nameX = 70, nameW = kw - nameX - 3 * nW - 4;
    const head = [[st(lang, 'thDMC'), 30, 36, A], [st(lang, 'thName'), nameX, nameW, A],
      [st(lang, 'thFull'), kw - 3 * nW, nW, NUM_A], [st(lang, 'thThree'), kw - 2 * nW, nW, NUM_A], [st(lang, 'thQuarter'), kw - nW, nW, NUM_A]];
    for (const [s, x, w, a] of head) C.block(S, caps(s, lang), th, SOFT, KX(x, w), ky, w, lang, 9, a);
    ky += 11; S.lines([[[KX(0, kw), ky], [KX(0, kw) + kw, ky]]], { color: RULE, width: 0.75 });
    const names = WORDS[lang] && WORDS[lang].floss;
    const rows = d.colors.map(k => ({ sw: swatch(k), dmc: D.FLOSS[k][0], name: (lang === 'en' || !names) ? D.FLOSS[k][1] : (names[k] || D.FLOSS[k][1]),
      n: [num(lang, sx.full[k] || 0), sx.three[k] ? num(lang, sx.three[k]) : '–', sx.quarter[k] ? num(lang, sx.quarter[k]) : '–'] }));
    const cm = sx.bs / 14 * 2.54;
    const lineWords = st(lang, 'lineLen', num(lang, cm, 0) + ' cm') + (sx.couched ? ' · ' + st(lang, 'couched', num(lang, sx.couched)) : '');
    rows.push({ sw: backSwatch, dmc: '310', name: st(lang, 'backRow'), span: lineWords });
    for (const r of rows) {
      const nf = face(F_SANS, 9), nameLines = C.lines(r.name, nf, nameW, lang).length, rh = Math.max(20, 6 + nameLines * 11.5);
      await S.svg(r.sw, KX(0, 24), ky + (rh - 18) / 2, 24, 18);
      C.block(S, r.dmc, face(F_SANS, 9.5, 700), D_INK, KX(30, 36), ky + (rh - 12) / 2, 36, lang, 12, A);
      C.block(S, r.name, nf, D_INK, KX(nameX, nameW), ky + (rh - nameLines * 11.5) / 2, nameW, lang, 11.5, A);
      if (r.span) C.block(S, r.span, face(F_SANS, 8), SOFT, KX(kw - 3 * nW - 30, 3 * nW + 30), ky + (rh - 10) / 2, 3 * nW + 30, lang, 10, NUM_A);
      else r.n.forEach((v, i) => C.block(S, v, face(F_SANS, 9.5), D_INK, KX(kw - (3 - i) * nW, nW), ky + (rh - 12) / 2, nW, lang, 12, NUM_A));
      ky += rh; S.lines([[[KX(0, kw), ky], [KX(0, kw) + kw, ky]]], { color: RULE, width: 0.75 });
    }
    ky = C.block(S, st(lang, 'dmcNote'), face(F_SANS, 7.5), SOFT, KX(0, kw), ky + 5, kw, lang, 10, A);

    let ry = C.block(S, st(lang, 'need'), face(F_SERIF, 12.5), D_INK, RX(0, rw), y + 3, rw, lang, 16, A) + 3;
    const fabric = Math.ceil(sx.W / 14 * 2.54 + 15) + ' × ' + Math.ceil(sx.H / 14 * 2.54 + 15) + ' cm';
    const needs = st(lang, 'needs').map((s, i) => i === 0 ? s.replace('%@', fabric) : s);
    for (const s of needs) {
      C.text(S, '•', face(F_SANS, 9.5), SOFT, rtl ? RX(0, rw) + rw : RX(0, rw), ry + 9.5, A);
      ry = C.block(S, s, face(F_SANS, 9.5), D_INK, RX(10, rw - 10), ry, rw - 10, lang, 13, A) + 2;
    }
    ry = C.block(S, st(lang, 'size'), face(F_SERIF, 12.5), D_INK, RX(0, rw), ry + 8, rw, lang, 16, A) + 3;
    const c1 = rw * 0.36, c2 = (rw - c1) / 2;
    C.block(S, caps(st(lang, 'fabric'), lang), th, SOFT, RX(0, c1), ry, c1, lang, 9, A);
    C.block(S, 'CM', th, SOFT, RX(c1, c2), ry, c2, lang, 9, NUM_A);
    C.block(S, 'IN', th, SOFT, RX(c1 + c2, c2), ry, c2, lang, 9, NUM_A);
    ry += 11; S.lines([[[RX(0, rw), ry], [RX(0, rw) + rw, ry]]], { color: RULE, width: 0.75 });
    for (const ct of [14, 16, 18]) {
      const label = st(lang, 'aida', ct), lf = face(F_SANS, 9), ll = C.lines(label, lf, c1, lang).length, rh = Math.max(18, 6 + ll * 12), yy = ry + (rh - 12) / 2;
      C.block(S, label, lf, D_INK, RX(0, c1), ry + (rh - ll * 12) / 2, c1, lang, 12, A);
      C.block(S, dims(lang, sx.W, sx.H, ct, 'cm').replace(' cm', ''), lf, D_INK, RX(c1, c2), yy, c2, lang, 12, NUM_A);
      C.block(S, dims(lang, sx.W, sx.H, ct, 'in').replace(' in', ''), lf, D_INK, RX(c1 + c2, c2), yy, c2, lang, 12, NUM_A);
      ry += rh; S.lines([[[RX(0, rw), ry], [RX(0, rw) + rw, ry]]], { color: RULE, width: 0.75 });
    }

    // how to stitch it, in two balanced columns
    y = Math.max(ky, ry) + 16;
    y = C.block(S, st(lang, 'how'), face(F_SERIF, 15), D_INK, X(m, W), y, W, lang, 19, A) + 6;
    const sg = 22, sw = (W - sg) / 2, sz = z.steps, slh = sz * 1.4, numW = 14;
    const steps = st(lang, 'steps').map(([lead, rest]) => [[lead + ' ', face(F_SANS, sz, 700)], [rest, face(F_SANS, sz)]]);
    const hs = steps.map(p => rich(null, p, 0, 0, sw - numW, lang, slh, rtl) + 5);
    let split = 1, best = Infinity;
    for (let k = 1; k < steps.length; k++) {
      const h = Math.max(hs.slice(0, k).reduce((a, b) => a + b, 0), hs.slice(k).reduce((a, b) => a + b, 0));
      if (h < best) { best = h; split = k; }
    }
    let bottom = y;
    [steps.slice(0, split), steps.slice(split)].forEach((col, ci) => {
      let yy = y; const cx = m + ci * (sw + sg);
      col.forEach((p, i) => {
        const n = ci ? split + i + 1 : i + 1, base = (slh - sz) / 2 + sz * 0.8;
        C.text(S, num(lang, n) + '.', face(F_SANS, sz, 700), CAP, rtl ? X(cx, sw) + sw : X(cx, sw), yy + base, A);
        yy = rich(S, p, X(cx + numW, sw - numW), yy, sw - numW, lang, slh, rtl) + 5;
      });
      bottom = Math.max(bottom, yy);
    });
    C.foot(S, pg, 1, 2, o);
    return { bottom, limit: pg.h - m - FOOT_ROOM };
  }

  // MARK: Page 2 — the chart, its legend and the stitch guide
  async function page2(S, pg, d, o) {
    const m = C.MARGINS[o.paper], W = pg.w - 2 * m, lang = o.lang, rtl = C.RTL_LANG(lang), A = rtl ? 'right' : 'left';
    const sx = stats(d);
    S.rect(0, 0, pg.w, pg.h, '#ffffff');
    const hf = face(F_SERIF, 20), title = st(lang, 'chart'), tw = C.width(title, hf);
    C.text(S, title, hf, D_INK, rtl ? pg.w - m : m, m + 18, A);
    const note = st(lang, 'designVal', num(lang, sx.W), num(lang, sx.H)) + ' · ' + st(lang, 'chartNote'), nf = face(F_SANS, 9);
    let y;
    if (C.width(note, nf) <= W - tw - 24) { C.text(S, note, nf, SOFT, rtl ? m : pg.w - m, m + 18, rtl ? 'left' : 'right'); y = m + 26; }
    else y = C.block(S, note, nf, SOFT, m, m + 26, W, lang, 12, A) + 2;
    S.lines([[[m, y], [pg.w - m, y]]], { color: RULE, width: 0.75 }); y += 14;
    // legend: four marks in a centred row (two rows when they do not fit); the chart takes all the height left
    const lf = face(F_SANS, 8.5), items = [['back', st(lang, 'legendBack')], ['tack', st(lang, 'legendTack')], ['tri', st(lang, 'legendTri')], ['empty', st(lang, 'legendEmpty')]];
    const iw = items.map(([, s]) => 22 + 4 + C.width(s, lf)), total = iw.reduce((a, b) => a + b, 0) + 14 * 3;
    const rowsOf = total <= W ? [items.map((it, i) => [it, iw[i]])] : [items.slice(0, 2).map((it, i) => [it, iw[i]]), items.slice(2).map((it, i) => [it, iw[i + 2]])];
    const legendH = 18, fwid = 46, below = 6 + legendH * rowsOf.length + 12 + 18 + fwid + 12;
    const cs = Math.min(W, pg.h - m - FOOT_ROOM - y - below);
    if (cs < 380) C.note('chart: only ' + Math.round(cs) + 'pt left for the chart');
    await S.svg(chartSVG(d, sx), (pg.w - cs) / 2, y, cs, cs);
    y += cs + 6;
    for (const row of rowsOf) {
      const rwid = row.reduce((a, [, w]) => a + w, 0) + 14 * (row.length - 1);
      if (rwid > W) C.note('overflow: the legend is wider than the page');
      let x = rtl ? (pg.w + rwid) / 2 : (pg.w - rwid) / 2;
      for (const [[mark, s], w] of row) {
        const ix = rtl ? x - 22 : x;
        await S.svg(MARKS[mark], ix, y + 1, 22, 14);
        C.text(S, s, lf, SOFT, rtl ? ix - 4 : ix + 26, y + 11, A);
        x += rtl ? -(w + 14) : w + 14;
      }
      y += legendH;
    }
    y += 12;
    C.block(S, st(lang, 'guide'), face(F_SERIF, 12.5), D_INK, m, y, W, lang, 16, 'center');
    y += 18;
    const fg = 22, gw = GUIDE.length * fwid + (GUIDE.length - 1) * fg;
    let gx = (pg.w - gw) / 2;
    const order = rtl ? [...GUIDE].reverse() : GUIDE;
    for (const [key, svg] of order) {
      await S.svg(svg, gx, y, fwid, fwid);
      const cap = st(lang, key);
      if (C.width(cap, face(F_SANS, 8)) > fwid + fg - 4) C.note('overflow: guide caption "' + cap + '" is wider than its place');
      C.text(S, cap, face(F_SANS, 8), SOFT, gx + fwid / 2, y + fwid + 9, 'center');
      gx += fwid + fg;
    }
    const bottom = y + fwid + 12;
    C.foot(S, pg, 2, 2, o);
    return { bottom, limit: pg.h - m - FOOT_ROOM };
  }

  // MARK: The pages at a size that fits: step type and hoop come down a little before anything runs into the foot
  const SIZES = [{ steps: 9, hoop: 0.36 }, { steps: 8.5, hoop: 0.34 }, { steps: 8, hoop: 0.32 }, { steps: 7.5, hoop: 0.3 }];
  async function layout(d, o) {
    const pg = C.PAPER[o.paper];
    for (const z of SIZES) {
      C.collect(true);
      const r = await page1(C.nothing, pg, d, o, null, z);
      C.collect(false);
      if (r.bottom <= r.limit) return z;
    }
    return SIZES[SIZES.length - 1];
  }
  const hoopCache = new Map();
  function hoopCanvas(d, o, z, dpr) {
    const pg = C.PAPER[o.paper], m = C.MARGINS[o.paper], w = Math.round((pg.w - 2 * m) * z.hoop), key = w + '/' + dpr;
    if (!hoopCache.has(key)) { const cv = document.createElement('canvas'); cv._w = w; cv._dpr = dpr; D.draw(cv, d); hoopCache.set(key, cv); }
    return hoopCache.get(key);
  }
  async function pagesOf(o, dpr) {
    const [d] = await Promise.all([load(), C.ready()]);
    const z = await layout(d, o), pg = C.PAPER[o.paper];
    return [S => page1(S, pg, d, o, hoopCanvas(d, o, z, dpr), z), S => page2(S, pg, d, o)];
  }
  async function canvasOf(pg, draw, scale) {
    const c = document.createElement('canvas'); c.width = Math.round(pg.w * scale); c.height = Math.round(pg.h * scale);
    const ctx = c.getContext('2d'); ctx.scale(scale, scale); await draw(C.canvasSurface(ctx)); return c;
  }

  window.CoStitch = {
    async preview(box, o, stale) {
      const pages = await pagesOf(o, 3), pg = C.PAPER[o.paper], cs = [];
      for (const [i, draw] of pages.entries()) {
        const c = await canvasOf(pg, draw, 2); c.setAttribute('role', 'img');
        c.setAttribute('aria-label', i ? st(o.lang, 'chart') : st(o.lang, 'kicker'));
        cs.push(c);
      }
      if (!stale()) box.replaceChildren(...cs);
    },
    async pdf(o) {
      const [j] = await Promise.all([C.loadPDF(), C.loadSVG()]);
      const pg = C.PAPER[o.paper], doc = new j.jsPDF({ unit: 'pt', format: [pg.w, pg.h], compress: true });
      const pages = await pagesOf(o, 4);
      for (const [i, draw] of pages.entries()) { if (i) doc.addPage([pg.w, pg.h]); await draw(C.pdfSurface(doc)); }
      return doc;
    },
    // for tools/stitch-check.py: each page's fit and the notes it raised, and the pages as PNG
    async check(o) {
      const [d] = await Promise.all([load(), C.ready()]);
      const z = await layout(d, o), pg = C.PAPER[o.paper], out = [];
      for (const draw of [S => page1(S, pg, d, o, null, z), S => page2(S, pg, d, o)]) {
        C.collect(true); const fit = await draw(C.nothing); const notes = C.collect(false);
        if (fit.bottom > fit.limit) notes.push('runs ' + Math.round(fit.bottom - fit.limit) + 'pt into the foot');
        out.push({ bottom: Math.round(fit.bottom), limit: Math.round(fit.limit), notes, z });
      }
      return out;
    },
    async pages(o, scale = 2) {
      const pages = await pagesOf(o, 3), pg = C.PAPER[o.paper], out = [];
      for (const draw of pages) out.push((await canvasOf(pg, draw, scale)).toDataURL('image/png'));
      return out;
    },
  };
})();
