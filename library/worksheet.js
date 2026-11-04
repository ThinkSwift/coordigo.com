// A picture's page on coordigo.com/library/<id>/: its worksheet as the app makes it (founder 2026-11-04,
// RDM-co-site-worksheet-app-words; the app's 11-04 redesign, RDM-co-site-worksheet-redesign). The layout is the app's
// WorksheetPage (Coordigo Print.swift) step for step: the puzzle with a header, the key, the grid and the code in a panel;
// the answer as a postcard with the picture, the words and the brand at its foot. The words are the app's own in its 19
// languages (worksheet-words.js, from the app's string catalog), and the menu speaks the language chosen; the settings are
// the app's (paper, answer page in color, the sheet's title and words); the answer's colours are the app's exact faces
// (the page's #faces). Drawn for the preview (canvases, both pages) and for the PDF (lines and fills as vectors, words at
// 432 dpi). tools/worksheet-parity.py checks it against the app's own pages.
(() => {
  'use strict';
  const M = window.Mystery, $ = id => document.getElementById(id);
  const page = document.querySelector('[data-picture]');
  if (!M || !page) return;
  // the page carries its picture's code; the site's own list (library.js) is the fallback
  const item = page.dataset.payload ? { id: page.dataset.picture, payload: page.dataset.payload }
    : (window.CO_LIBRARY || []).find(i => i.id === page.dataset.picture);
  if (!item) return;
  const NUMBER = +page.dataset.number || 0, TITLE = page.dataset.title || '', TIER = (page.dataset.tier || '').toLowerCase();
  const FACES = (() => { try { return JSON.parse(($('faces') || {}).textContent || 'null'); } catch (e) { return null; } })();

  // MARK: Words — the app's, in the reader's language unless they pick another
  const WORDS = window.CO_WORKSHEET_WORDS || {};
  const NAMES = { en: 'English', ar: 'العربية', de: 'Deutsch', es: 'Español', fr: 'Français', hi: 'हिन्दी', id: 'Bahasa Indonesia',
    it: 'Italiano', ja: '日本語', ko: '한국어', nl: 'Nederlands', 'pt-BR': 'Português', ru: 'Русский', sv: 'Svenska', th: 'ไทย',
    tr: 'Türkçe', vi: 'Tiếng Việt', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文' };
  const readerLang = (() => {
    for (const raw of navigator.languages || [navigator.language || 'en']) {
      const l = raw.toLowerCase();
      if (l.startsWith('zh')) return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
      if (l.startsWith('pt')) return 'pt-BR';
      if (WORDS[l.split('-')[0]]) return l.split('-')[0];
    }
    return 'en';
  })();
  const say = (lang, key, ...args) => {
    let i = 0;
    return ((WORDS[lang] || {})[key] || (WORDS.en || {})[key] || '').replace(/%(?:(\d)\$)?@/g, (_, n) => String(args[n ? +n - 1 : i++]));
  };
  // "#242 · Legendary", beside the brand (PrintOptions.label)
  const label = lang => NUMBER ? '#' + NUMBER + (TIER ? ' · ' + say(lang, TIER) : '') : '';

  // MARK: Settings — the app's: Settings › Worksheets (paper, answer page) and the worksheet sheet (title, words)
  const LETTER = ['US', 'CA', 'MX', 'PH', 'PR', 'CL', 'CO', 'VE', 'GT', 'CR', 'PA', 'DO', 'SV', 'NI', 'HN', 'BZ'];
  const PAPER = { letter: { w: 612, h: 792 }, a4: { w: 595.28, h: 841.89 } };
  const region = ((navigator.language || 'en-US').split('-')[1] || 'US').toUpperCase();
  const form = $('sheetForm');
  if (form && !form.dataset.ready) {
    form.elements.paper.value = LETTER.includes(region) ? 'letter' : 'a4';
    for (const l of Object.keys(NAMES).filter(l => WORDS[l])) form.elements.lang.add(new Option(NAMES[l], l));
    form.elements.lang.value = readerLang;
    form.dataset.ready = '1';
  }
  const options = () => ({
    paper: form.elements.paper.value, answer: form.elements.answer.checked, lang: form.elements.lang.value || readerLang,
    title: form.elements.title.value.trim(), words: form.elements.words.value.trim(),
  });
  // The menu in the worksheet's language (the app's own words for its sheet and settings)
  function speak(lang) {
    for (const el of document.querySelectorAll('[data-w]')) el.textContent = say(lang, el.dataset.w);
    const ws = document.querySelector('.menu'); if (ws) { ws.lang = lang; ws.dir = RTL_LANG(lang) ? 'rtl' : 'ltr'; }
  }

  // MARK: Ink and type (Print.swift Ink): the system font, its serif (New York) and its monospace; the app's inks
  const INK = '#1f1e1c', MUTED = '#5f5e5a', AMBER = '#ba7517';
  const FAINT = 0.12, PANEL = 0.045;
  const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Thai", "Noto Sans Devanagari", "Noto Sans Arabic", sans-serif';
  const SERIF = 'ui-serif, "New York", "Iowan Old Style", Georgia, "Noto Serif", serif';
  const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
  const sans = (size, weight = 400) => weight + ' ' + size + 'px ' + SANS;
  const serif = size => 'italic 400 ' + size + 'px ' + SERIF;
  const mono = (size, weight = 400) => weight + ' ' + size + 'px ' + MONO;
  const meter = document.createElement('canvas').getContext('2d');
  // Lines are spaced as Core Text spaces them for the app's fonts (measured with the app's NSFont/CTFramesetter: the first
  // baseline, the line pitch and one line's frame height), so a paragraph takes the same room in every browser; the code's
  // pairs are laid out at SF Mono's advance.
  const CORE_TEXT = { 'sans 11': [11, 13, 14], 'sans 12': [12, 15, 15], 'sans 22': [21, 26, 26], 'serif 18': [27.5, 31.5, 32] };
  const metrics = font => {
    const z = parseFloat(/([\d.]+)px/.exec(font)[1]), fam = font.includes(SERIF) ? 'serif' : 'sans';
    const [base, pitch, one] = CORE_TEXT[fam + ' ' + z] || [Math.round(0.9668 * z), Math.round(0.9668 * z) + Math.round(0.2109 * z), Math.ceil(1.1777 * z)];
    return { asc: base, pitch, one };
  };
  const ADVANCE = 1266 / 2048;                  // SF Mono
  const width = (s, font) => { meter.font = font; return meter.measureText(s).width; };
  // Where a line may break: at spaces, and between words in the scripts written without them; a Japanese run of
  // hiragana (a particle, an ending) or punctuation stays with the word before it (the app's Phrases.kept)
  const pieces = (s, lang) => {
    if (!(window.Intl && Intl.Segmenter)) return s.split(/(\s+)/);
    const out = [];
    for (const { segment: w } of new Intl.Segmenter(lang, { granularity: 'word' }).segment(s)) {
      if (out.length && !/\s$/.test(out[out.length - 1]) && /^[぀-ゟ\p{P}]+$/u.test(w)) out[out.length - 1] += w; else out.push(w);
    }
    return out;
  };
  const lines = (s, font, w, lang) => {
    const out = []; let line = '';
    for (const p of pieces(s, lang)) {
      if (line && width((line + p).trimEnd(), font) > w) { out.push(line.trim()); line = p.trimStart(); } else line += p;
    }
    if (line.trim()) out.push(line.trim());
    return out;
  };
  // Core Text's natural alignment: a paragraph runs the way its first strong letter does
  const RTL = s => { const m = /[A-Za-zÀ-ɏͰ-῿぀-￯]|[֐-ࣿיִ-﷿ﹰ-﻿]/.exec(s); return !!m && /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(m[0]); };
  // The page reads right to left in Arabic: the heading and the brand swap sides (WorksheetPage.rtl)
  const RTL_LANG = lang => lang === 'ar';

  // MARK: The two surfaces: a canvas (the preview) and a PDF (vectors; words as fine images)
  function canvasSurface(ctx) {
    const stroke = o => { ctx.strokeStyle = o.color || INK; ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.lineWidth = o.width || 1;
      ctx.lineCap = o.cap || 'butt'; ctx.lineJoin = o.cap === 'round' ? 'round' : 'miter'; ctx.setLineDash(o.dash || []); };
    return {
      lines(segs, o) { ctx.save(); stroke(o); ctx.beginPath(); for (const s of segs) { ctx.moveTo(s[0][0], s[0][1]); for (const q of s.slice(1)) ctx.lineTo(q[0], q[1]); } ctx.stroke(); ctx.restore(); },
      rect(x, y, w, h, color, alpha = 1, r = 0) { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); r ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill(); ctx.restore(); },
      frame(x, y, w, h, o) { ctx.save(); stroke(o); ctx.strokeRect(x, y, w, h); ctx.restore(); },
      shape(rings, color) { ctx.fillStyle = color; ctx.beginPath(); for (const r of rings) { ctx.moveTo(r[0][0], r[0][1]); for (const q of r.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath(); } ctx.fill('evenodd'); },
      dot(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); },
      image(img, x, y, w, h, r) { ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip(); ctx.drawImage(img, x, y, w, h); ctx.restore(); },
      words(box, draw) { ctx.save(); draw(ctx); ctx.restore(); },
    };
  }
  function pdfSurface(doc) {
    const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const stroke = o => { doc.setDrawColor(...rgb(o.color || INK)); doc.setLineWidth(o.width || 1); doc.setLineCap(o.cap === 'round' ? 'round' : 'butt');
      doc.setLineJoin(o.cap === 'round' ? 'round' : 'miter'); doc.setLineDashPattern(o.dash || [], 0);
      doc.setGState(new doc.GState({ 'stroke-opacity': o.alpha == null ? 1 : o.alpha, opacity: 1 })); };
    const S = 6;
    return {
      lines(segs, o) { stroke(o); for (const s of segs) { doc.moveTo(s[0][0], s[0][1]); for (const q of s.slice(1)) doc.lineTo(q[0], q[1]); } doc.stroke(); },
      rect(x, y, w, h, color, alpha = 1, r = 0) { doc.setGState(new doc.GState({ opacity: alpha })); doc.setFillColor(...rgb(color));
        r ? doc.roundedRect(x, y, w, h, r, r, 'F') : doc.rect(x, y, w, h, 'F'); doc.setGState(new doc.GState({ opacity: 1 })); },
      frame(x, y, w, h, o) { stroke(o); doc.rect(x, y, w, h, 'S'); },
      shape(rings, color) { doc.setFillColor(...rgb(color)); for (const r of rings) { doc.moveTo(r[0][0], r[0][1]); for (const q of r.slice(1)) doc.lineTo(q[0], q[1]); doc.close(); } doc.fillEvenOdd(); },
      dot(x, y, r, color) { doc.setFillColor(...rgb(color)); doc.circle(x, y, r, 'F'); },
      image(img, x, y, w, h, r) {
        const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
        g.beginPath(); g.roundRect(0, 0, 128, 128, 128 * r / w); g.clip(); g.drawImage(img, 0, 0, 128, 128);
        doc.addImage(c.toDataURL('image/png'), 'PNG', x, y, w, h, undefined, 'FAST');
      },
      words(box, draw) {
        const [x, y, w, h] = box, c = document.createElement('canvas');
        c.width = Math.ceil(w * S); c.height = Math.ceil(h * S);
        const ctx = c.getContext('2d'); ctx.scale(S, S); ctx.translate(-x, -y); draw(ctx);
        doc.addImage(c.toDataURL('image/png'), 'PNG', x, y, c.width / S, c.height / S, undefined, 'FAST');
      },
    };
  }

  // Ink.line drawn with its baseline at (x, y); Ink.paragraph from (x, y) down, returning the y under it.
  function line(S, s, font, color, x, y) {
    const m = metrics(font), w = width(s, font);
    S.words([x - 4, y - m.asc * 1.5, w + 8, m.pitch * 2], ctx => { ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.direction = RTL(s) ? 'rtl' : 'ltr'; ctx.textAlign = 'left'; ctx.fillText(s, x, y); });
    return w;
  }
  const blockHeight = (n, m) => n ? Math.ceil((n - 1) * m.pitch + m.one) : 0;
  function paragraphHeight(s, font, w, lang) { return blockHeight(lines(s, font, w, lang).length, metrics(font)); }
  // align: 'left' | 'right' | 'center' | undefined (natural: the text's own direction)
  function paragraph(S, s, font, color, x, y, w, lang, align) {
    const m = metrics(font), ls = lines(s, font, w, lang), h = blockHeight(ls.length, m), rtl = RTL(s);
    const a = align || (rtl ? 'right' : 'left');
    S.words([x - 6, y - m.asc * 0.5, w + 12, h + m.asc], ctx => {
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = a;
      ls.forEach((t, i) => ctx.fillText(t, a === 'center' ? x + w / 2 : a === 'right' ? x + w : x, y + m.asc + i * m.pitch));
    });
    return y + h;
  }

  // MARK: The page (WorksheetPage), y down, in page points
  const MARGIN = 48, SHARE = 0.66, AXIS = 14, PAD = 14, BRAND_H = 34;
  const mark = new Image(); mark.src = '/library/printmark.png';
  const markReady = new Promise(ok => { mark.onload = ok; mark.onerror = ok; });

  function tokens(segs) { const out = []; segs.forEach((s, i) => s.forEach((q, j) => out.push({ text: M.pair(q), lift: i > 0 && j === 0 }))); return out; }
  function layout(toks, size, w) {
    const gap = size * 0.6; let x = 0, row = 0; const out = [];
    for (const t of toks) { const tw = t.text.length * size * ADVANCE + (t.lift ? size * 1.1 : 0); if (x > 0 && x + tw > w) { x = 0; row++; } out.push({ t, x, row }); x += tw + gap; }
    return out;
  }
  function codeHeight(toks, size, w) { const p = layout(toks, size, w); return ((p.length ? p[p.length - 1].row : -1) + 1) * size * 1.75; }
  function code(S, toks, size, x, y, w) {
    const font = mono(size), lh = size * 1.75, placed = layout(toks, size, w), bars = [];
    for (const p of placed) if (p.t.lift) { const base = y + p.row * lh + lh * 0.68, bx = x + p.x + size * 0.3; bars.push([[bx, base - size * 0.9], [bx, base + size * 0.22]]); }
    if (bars.length) S.lines(bars, { color: AMBER, width: Math.max(0.8, size * 0.09) });
    const rows = (placed.length ? placed[placed.length - 1].row : -1) + 1;
    S.words([x - 2, y, w + 4, rows * lh + 2], ctx => {
      ctx.font = font; ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr'; ctx.textAlign = 'left';
      for (const p of placed) ctx.fillText(p.t.text, x + p.x + (p.t.lift ? size * 1.1 : 0), y + p.row * lh + lh * 0.68);
    });
    return y + rows * lh;
  }
  const panelHeight = c => PAD + 13 + 8 + c + PAD - 4;
  function panel(S, counts, toks, size, x, y, w, lang) {
    const inner = w - 2 * PAD, h = panelHeight(codeHeight(toks, size, inner));
    S.rect(x, y, w, h, INK, PANEL, 8);
    line(S, say(lang, 'code').toLocaleUpperCase(lang) + '  ·  ' + counts, sans(9.5, 600), MUTED, x + PAD, y + PAD + 9);
    code(S, toks, size, x + PAD, y + PAD + 13 + 8, inner);
    return y + h;
  }
  function grid(S, ox, oy, side) {
    const u = side / 15, minor = [], major = [];
    for (let k = 0; k <= 15; k++) {
      const v = k * u, two = [[[ox + v, oy], [ox + v, oy + side]], [[ox, oy + v], [ox + side, oy + v]]];
      (k % 5 === 0 ? major : minor).push(...two);
    }
    S.lines(minor, { color: INK, alpha: 0.12, width: 0.45 });
    S.lines(major, { color: INK, alpha: 0.32, width: 0.8 });
    const font = mono(8.5, 500);
    S.words([ox - 22, oy - 16, side + 34, side + 28], ctx => {
      ctx.font = font; ctx.fillStyle = MUTED; ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr'; ctx.textAlign = 'left';
      for (let k = 0; k <= 15; k++) {
        const d = M.DIGITS[k], w = 8.5 * ADVANCE, v = k * u;
        ctx.fillText(d, ox + v - w / 2, oy - 4); ctx.fillText(d, ox - 6 - w, oy + v + 2.6);
      }
    });
  }
  // The app's mark and "coordigo" with the picture's number and rarity under it (WorksheetPage.Brand); the site's sheet
  // carries its address, coordigo.com
  function brand(S, lbl, top, pg, lang) {
    const m = MARGIN, rtl = RTL_LANG(lang), word = 'coordigo.com', wf = sans(12, 600), icon = 16;
    const rowW = icon + 6 + width(word, wf), bx = rtl ? m : pg.w - m - rowW;
    if (mark.naturalWidth) S.image(mark, bx, top, icon, icon, icon * 0.23);
    line(S, word, wf, INK, bx + icon + 6, top + 12.5);
    if (lbl) { const lf = mono(10), lw = width(lbl, lf); line(S, lbl, lf, MUTED, rtl ? m : pg.w - m - lw, top + 30); }
  }
  function header(S, heading, sub, lbl, pg, lang) {
    const m = MARGIN, w = pg.w - 2 * m, rtl = RTL_LANG(lang);
    const bw = lbl == null ? 0 : 150, tw = w - bw - (lbl == null ? 0 : 16), tx = rtl ? m + w - tw : m, a = rtl ? 'right' : 'left';
    let y = paragraph(S, heading, sans(22, 600), INK, tx, m, tw, lang, a);
    if (sub) y = paragraph(S, sub, sans(12), MUTED, tx, y + 2, tw, lang, a);
    if (lbl != null) brand(S, lbl, m + 2, pg, lang);
    y = Math.max(y, m + (lbl == null ? 0 : 36)) + 12;
    S.lines([[[m, y], [pg.w - m, y]]], { color: INK, alpha: FAINT, width: 0.6 });
    return y;
  }
  function puzzlePage(S, pg, p, o) {
    const m = MARGIN, w = pg.w - 2 * m;
    S.rect(0, 0, pg.w, pg.h, '#ffffff');
    const hb = header(S, say(o.lang, 'heading'), null, label(o.lang), pg, o.lang);
    const bottom = pg.h - m;
    const top = paragraph(S, say(o.lang, 'key'), sans(11), INK, m, hb + 14, w, o.lang);
    const toks = tokens(p.segments), inner = w - 2 * PAD;
    let side = w * SHARE, size = 13;
    const block = (g, s) => AXIS + g + 24 + panelHeight(codeHeight(toks, s, inner));
    const room = bottom - top - 24;
    while (block(side, size) > room) { if (size > 9) size -= 0.5; else if (side > w * 0.45) side -= 6; else break; }
    const ox = (pg.w - side) / 2 + AXIS / 2, oy = top + 24 + Math.max(0, (room - block(side, size)) / 2) + AXIS;
    grid(S, ox, oy, side);
    panel(S, say(o.lang, 'counts', p.segments.length, p.segments.reduce((n, s) => n + s.length, 0)), toks, size, m, oy + side + 24, w, o.lang);
  }
  function answerPage(S, pg, p, o) {
    const m = MARGIN, w = pg.w - 2 * m;
    S.rect(0, 0, pg.w, pg.h, '#ffffff');
    const hb = header(S, TITLE || say(o.lang, 'yourPicture'), o.title, null, pg, o.lang);
    const brandTop = pg.h - m - BRAND_H;
    brand(S, label(o.lang), brandTop, pg, o.lang);
    const bottom = brandTop - 24, side = Math.round(w * 0.56), words = o.words, textWidth = Math.round(w * 0.74), poem = serif(18);
    // balanced lines, as a poem is set: the narrowest measure that keeps the same number of lines
    let pw = textWidth;
    if (words) {
      const full = paragraphHeight(words, poem, textWidth, o.lang);
      let lo = textWidth * 0.45, hi = textWidth;
      while (hi - lo > 2) { const mid = (lo + hi) / 2; if (paragraphHeight(words, poem, mid, o.lang) > full + 0.5) lo = mid; else hi = mid; }
      pw = Math.ceil(hi) + 2;
    }
    const wh = words ? paragraphHeight(words, poem, pw, o.lang) : 0, toWords = words ? 34 : 0;
    const top = hb + Math.max(28, (bottom - hb - (side + toWords + wh)) * 0.375), ox = (pg.w - side) / 2, u = side / 15;
    for (const [color, rings] of FACES || []) S.shape(rings.map(r => r.map(([x, y]) => [ox + x * u, top + y * u])), color);
    const strokes = p.segments.filter(s => s.length > 1).map(s => s.map(q => [ox + q.x * u, top + q.y * u]));
    if (strokes.length) S.lines(strokes, { color: INK, width: 0.12 * u, cap: 'round' });
    for (const s of p.segments) if (s.length === 1) S.dot(ox + s[0].x * u, top + s[0].y * u, 0.12 * u, INK);
    S.frame(ox, top, side, side, { color: INK, alpha: 0.25, width: 0.7 });
    if (words) paragraph(S, words, poem, INK, (pg.w - pw) / 2, top + side + toWords, pw, o.lang, 'center');
  }
  function pageCanvas(pg, draw, scale = 3) {
    const c = document.createElement('canvas'); c.width = Math.round(pg.w * scale); c.height = Math.round(pg.h * scale);
    const ctx = c.getContext('2d'); ctx.scale(scale, scale); draw(canvasSurface(ctx)); return c;
  }

  // MARK: The preview (both pages, as large as the page allows) and the PDF
  let pic = null;
  const read = () => pic || (pic = M.readPayload(item.payload));
  const pagesOf = (p, o) => [S => puzzlePage(S, PAPER[o.paper], p, o)].concat(o.answer ? [S => answerPage(S, PAPER[o.paper], p, o)] : []);
  let drawing = 0;
  async function preview() {
    const box = $('sheetPreview'), o = options(), n = ++drawing;
    speak(o.lang);
    if (!box) return;
    const [p] = await Promise.all([read(), markReady]);
    if (n !== drawing) return;                                 // a newer setting came in meanwhile
    box.replaceChildren(...pagesOf(p, o).map((d, i) => {
      const c = pageCanvas(PAPER[o.paper], d, 2); c.setAttribute('role', 'img');
      c.setAttribute('aria-label', i ? say(o.lang, 'answerPage') : say(o.lang, 'heading'));
      return c;
    }));
  }
  let lib = null;
  const loadPDF = () => lib || (lib = new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => ok(window.jspdf); s.onerror = fail; document.head.appendChild(s);
  }));
  async function pdf(o) {
    const [j, p] = await Promise.all([loadPDF(), read(), markReady]);
    const pg = PAPER[o.paper], doc = new j.jsPDF({ unit: 'pt', format: [pg.w, pg.h], compress: true });
    pagesOf(p, o).forEach((draw, i) => { if (i) doc.addPage([pg.w, pg.h]); draw(pdfSurface(doc)); });
    return doc;
  }
  const fileName = o => page.dataset.file + '-worksheet' + (o.lang === 'en' ? '' : '-' + o.lang) + '.pdf';
  async function busy(btn, work) { btn.disabled = true; try { await work(); } finally { btn.disabled = false; } }
  // Print: the PDF in the browser's own viewer, which prints it as it is (a tab opened at the tap, so no popup blocker)
  $('sheetPrint').addEventListener('click', e => {
    const tab = window.open('', '_blank');
    busy(e.currentTarget, async () => {
      const url = URL.createObjectURL((await pdf(options())).output('blob'));
      if (tab) tab.location.href = url; else location.href = url;
    });
  });
  // Share as PDF: the share sheet on a phone or tablet, a download elsewhere
  $('sheetPDF').addEventListener('click', e => busy(e.currentTarget, async () => {
    const o = options(), doc = await pdf(o);
    const file = new File([doc.output('blob')], fileName(o), { type: 'application/pdf' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    doc.save(fileName(o));
  }));
  let typing = 0;
  form.addEventListener('change', preview);
  form.elements.lang.addEventListener('change', preview);           // the language sits in the menu's head, outside the form
  form.addEventListener('input', e => { if (e.target.type === 'text' || e.target.tagName === 'TEXTAREA') { clearTimeout(typing); typing = setTimeout(preview, 250); } });
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
  // for tools/worksheet-parity.py: the pages at 3x with given settings
  window.CoWorksheet = {
    pages: async o => { const [p] = await Promise.all([read(), markReady]); return pagesOf(p, o).map(d => pageCanvas(PAPER[o.paper], d).toDataURL('image/png')); }, pdf,
  };
  preview();
})();
