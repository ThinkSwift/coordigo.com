// A picture's page on coordigo.com/library/<id>/: its worksheet as the app makes it (founder 2026-11-04,
// RDM-co-site-worksheet-app-words). The layout is the app's WorksheetPage (Coordigo Print.swift) step for step; the words
// are the app's own in its 19 languages (worksheet-words.js, from the app's string catalog); the colours of the answer are
// the app's exact faces (the page's #faces, from the app's code). The page is drawn once for the preview (a canvas) and
// once for the PDF, where every line and fill is a vector and the words are set at 432 dpi. tools/worksheet-parity.py
// checks it against the app's own pages.
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

  // MARK: Settings — the app's Settings › Worksheets, with its defaults; Letter in the Americas, A4 elsewhere.
  const LETTER = ['US', 'CA', 'MX', 'PH', 'PR', 'CL', 'CO', 'VE', 'GT', 'CR', 'PA', 'DO', 'SV', 'NI', 'HN', 'BZ'];
  const PAPER = { letter: { w: 612, h: 792 }, a4: { w: 595.28, h: 841.89 } };
  const region = ((navigator.language || 'en-US').split('-')[1] || 'US').toUpperCase();
  const form = $('sheetForm');
  if (form && !form.dataset.ready) {
    form.elements.paper.value = LETTER.includes(region) ? 'letter' : 'a4';
    const pick = form.elements.lang;
    if (pick) {
      for (const l of Object.keys(NAMES).filter(l => WORDS[l])) pick.add(new Option(NAMES[l], l));
      pick.value = readerLang;
    }
    form.dataset.ready = '1';
  }
  const options = () => ({
    paper: form.elements.paper.value, answer: form.elements.answer.checked, name: form.elements.name.checked,
    title: form.elements.title.checked, words: !!(form.elements.words && form.elements.words.checked),
    lang: (form.elements.lang && form.elements.lang.value) || readerLang,
  });

  // MARK: Ink and type (Print.swift Ink): the system font and its monospace, the app's three inks
  const INK = '#1f1e1c', MUTED = '#5f5e5a';
  const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Thai", "Noto Sans Devanagari", "Noto Sans Arabic", sans-serif';
  const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
  const sans = (size, weight = 400, italic = false) => (italic ? 'italic ' : '') + weight + ' ' + size + 'px ' + SANS;
  const mono = (size, weight = 400) => weight + ' ' + size + 'px ' + MONO;
  const meter = document.createElement('canvas').getContext('2d');
  // Lines are spaced as Core Text spaces them for the app's fonts (measured with the app's NSFont/CTFramesetter: the first
  // baseline, the line pitch, and one line's frame height), so a paragraph takes the same room in every browser; the
  // code's pairs are laid out at SF Mono's advance.
  const sizeOf = font => parseFloat(/([\d.]+)px/.exec(font)[1]);
  const CORE_TEXT = { '9.5': [9, 11, 12], '10': [10, 12, 13], '15': [15, 18, 19], '19': [18, 22, 23], '22': [21, 26, 26] };
  const metrics = font => {
    const z = sizeOf(font), [base, pitch, one] = CORE_TEXT[z] || [Math.round(0.9668 * z), Math.round(0.9668 * z) + Math.round(0.2109 * z), Math.ceil(1.1777 * z)];
    return { asc: base, pitch, one };
  };
  const ADVANCE = 1266 / 2048;                  // SF Mono
  const width = (s, font) => { meter.font = font; return meter.measureText(s).width; };
  // Where a line may break: at spaces, and between letters in the scripts that do not use them (the app's Core Text does the same)
  const pieces = (s, lang) => {
    if (window.Intl && Intl.Segmenter) return [...new Intl.Segmenter(lang, { granularity: 'word' }).segment(s)].map(x => x.segment);
    return s.split(/(\s+)/);
  };
  const lines = (s, font, w, lang) => {
    const out = []; let line = '';
    for (const p of pieces(s, lang)) {
      if (line && width((line + p).trimEnd(), font) > w) { out.push(line.trim()); line = p.trimStart(); } else line += p;
    }
    if (line.trim()) out.push(line.trim());
    return out;
  };
  // Core Text's natural alignment: a paragraph runs the way its first strong letter does, whatever the page's language
  const RTL = s => { const m = /[A-Za-z\u00C0-\u024F\u0370-\u1FFF\u3040-\uFFEF]|[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.exec(s); return !!m && /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(m[0]); };

  // MARK: The two surfaces: a canvas (the preview) and a PDF (vectors; words as fine images)
  function canvasSurface(ctx) {
    const stroke = (o) => { ctx.strokeStyle = o.color || INK; ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.lineWidth = o.width || 1;
      ctx.lineCap = o.cap || 'butt'; ctx.lineJoin = o.cap === 'round' ? 'round' : 'miter'; ctx.setLineDash(o.dash || []); };
    return {
      lines(segs, o) { ctx.save(); stroke(o); ctx.beginPath(); for (const s of segs) { ctx.moveTo(s[0][0], s[0][1]); for (const q of s.slice(1)) ctx.lineTo(q[0], q[1]); } ctx.stroke(); ctx.restore(); },
      rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); },
      frame(x, y, w, h, o) { ctx.save(); stroke(o); ctx.strokeRect(x, y, w, h); ctx.restore(); },
      shape(rings, color) { ctx.fillStyle = color; ctx.beginPath(); for (const r of rings) { ctx.moveTo(r[0][0], r[0][1]); for (const q of r.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath(); } ctx.fill('evenodd'); },
      dot(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); },
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
      rect(x, y, w, h, color) { doc.setFillColor(...rgb(color)); doc.rect(x, y, w, h, 'F'); },
      frame(x, y, w, h, o) { stroke(o); doc.rect(x, y, w, h, 'S'); },
      shape(rings, color) { doc.setFillColor(...rgb(color)); for (const r of rings) { doc.moveTo(r[0][0], r[0][1]); for (const q of r.slice(1)) doc.lineTo(q[0], q[1]); doc.close(); } doc.fillEvenOdd(); },
      dot(x, y, r, color) { doc.setFillColor(...rgb(color)); doc.circle(x, y, r, 'F'); },
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
    S.words([x - 4, y - m.asc * 1.5, w + 8, m.pitch * 2], ctx => { ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y); });
    return w;
  }
  function paragraphHeight(s, font, w, lang) { const m = metrics(font), n = lines(s, font, w, lang).length; return n ? (n - 1) * m.pitch + m.one : 0; }
  function paragraph(S, s, font, color, x, y, w, lang, center = false) {
    const m = metrics(font), ls = lines(s, font, w, lang), lh = m.pitch, h = ls.length ? (ls.length - 1) * lh + m.one : 0, rtl = RTL(s);
    S.words([x - 6, y - m.asc * 0.5, w + 12, h + m.asc], ctx => {
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.direction = rtl ? 'rtl' : 'ltr';
      ctx.textAlign = center ? 'center' : rtl ? 'right' : 'left';
      ls.forEach((t, i) => ctx.fillText(t, center ? x + w / 2 : rtl ? x + w : x, y + m.asc + i * lh));
    });
    return y + h;
  }

  // MARK: The page (WorksheetPage.puzzle / .answer), y down, in page points
  const MARGIN = 42, SHARE = 0.7;
  function tokens(segs) { const out = []; segs.forEach((s, i) => s.forEach((q, j) => out.push({ text: M.pair(q), lift: i > 0 && j === 0 }))); return out; }
  function layout(toks, font, size, w) {
    const gap = size * 0.6; let x = 0, row = 0; const out = [];
    for (const t of toks) { const tw = t.text.length * size * ADVANCE + (t.lift ? size * 1.1 : 0); if (x > 0 && x + tw > w) { x = 0; row++; } out.push({ t, x, row }); x += tw + gap; }
    return out;
  }
  function codeHeight(toks, size, w) { const p = layout(toks, mono(size), size, w); return ((p.length ? p[p.length - 1].row : -1) + 1) * size * 1.9; }
  function code(S, toks, size, x, y, w) {
    const font = mono(size), lh = size * 1.9, placed = layout(toks, font, size, w), bars = [];
    for (const p of placed) if (p.t.lift) { const base = y + p.row * lh + lh * 0.68, bx = x + p.x + size * 0.3; bars.push([[bx, base - size * 0.9], [bx, base + size * 0.22]]); }
    if (bars.length) S.lines(bars, { color: MUTED, width: Math.max(0.6, size * 0.07) });
    const rows = (placed.length ? placed[placed.length - 1].row : -1) + 1;
    S.words([x - 2, y, w + 4, rows * lh + 2], ctx => {
      ctx.font = font; ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr'; ctx.textAlign = 'left';
      for (const p of placed) ctx.fillText(p.t.text, x + p.x + (p.t.lift ? size * 1.1 : 0), y + p.row * lh + lh * 0.68);
    });
    return y + rows * lh;
  }
  function grid(S, ox, oy, side) {
    const u = side / 15, minor = [], major = [];
    for (let k = 0; k <= 15; k++) {
      const v = k * u, two = [[[ox + v, oy], [ox + v, oy + side]], [[ox, oy + v], [ox + side, oy + v]]];
      (k % 4 === 0 || k === 15 ? major : minor).push(...two);
    }
    S.lines(minor, { color: INK, alpha: 0.12, width: 0.45 });
    S.lines(major, { color: INK, alpha: 0.32, width: 0.8 });
    const font = mono(7.5, 500), m = metrics(font);
    S.words([ox - 20, oy - 6 - m.asc, side + 30, side + m.asc + 16], ctx => {
      ctx.font = font; ctx.fillStyle = MUTED; ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr'; ctx.textAlign = 'left';
      for (let k = 0; k <= 15; k++) {
        const d = M.DIGITS[k], w = ctx.measureText(d).width, v = k * u;
        ctx.fillText(d, ox + v - w / 2, oy - 4); ctx.fillText(d, ox - 6 - w, oy + v + 2.6);
      }
    });
  }
  function fold(S, pg, words, height, lang) {
    const top = pg.h - height;
    S.lines([[[0, top], [pg.w, top]]], { color: '#888780', width: 0.8, dash: [4, 3] });
    const lf = sans(9), label = say(lang, 'fold'), lw = width(label, lf);
    S.rect((pg.w - lw) / 2 - 8, top - 7, lw + 16, 14, '#ffffff');
    line(S, label, lf, MUTED, (pg.w - lw) / 2, top + 3);
    const w = pg.w - 2 * MARGIN, font = sans(19, 600), h = paragraphHeight(words, font, w, lang), cx = pg.w / 2, cy = top + height / 2 + 4;
    const m = metrics(font), ls = lines(words, font, w, lang), lh = m.pitch;
    // upside down about the fold's middle, as the app turns it
    S.words([cx - w / 2 - 6, cy - h / 2 - m.asc * 0.5, w + 12, h + m.asc], ctx => {
      ctx.translate(cx, cy); ctx.rotate(Math.PI);
      ctx.font = font; ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center'; ctx.direction = RTL(words) ? 'rtl' : 'ltr';
      ls.forEach((t, i) => ctx.fillText(t, 0, -h / 2 + m.asc + i * lh));
    });
  }
  function puzzlePage(S, pg, p, o) {
    const m = MARGIN, w = pg.w - 2 * m; let y = m;
    S.rect(0, 0, pg.w, pg.h, '#ffffff');
    const mark = 'coordigo.com', mf = mono(10);                     // the app prints "coordigo"; the site's sheet carries its address
    line(S, mark, mf, MUTED, pg.w - m - width(mark, mf), y + 14);
    if (o.title) y = paragraph(S, heading, sans(22, 600), INK, m, y, w - 90, o.lang); else y += 18;
    if (o.name) {
      const nf = sans(10), lx = pg.w - m - 150, lw = line(S, say(o.lang, 'name'), nf, MUTED, lx, y + 10);
      S.lines([[[lx + lw + 4, y + 11], [pg.w - m, y + 11]]], { color: MUTED, width: 0.7 });
      y += 16;
    }
    y = paragraph(S, say(o.lang, 'key'), sans(9.5), MUTED, m, y + 6, w, o.lang) + 6;
    const words = o.words && p.message ? p.message.trim() : '';
    const foldH = words ? 108 : 0, bottom = pg.h - m * 0.6 - foldH;
    const toks = tokens(p.segments);
    let side = w * SHARE, size = 11.5;
    const fixed = y + 14 + 16 + 18;
    while (fixed + side + codeHeight(toks, size, w) > bottom) { if (size > 8) size -= 0.5; else if (side > w * 0.45) side -= 8; else break; }
    const ox = (pg.w - side) / 2, oy = y + 12;
    grid(S, ox, oy, side);
    y = oy + side + 10;
    line(S, say(o.lang, 'counts', p.segments.length, p.segments.reduce((n, s) => n + s.length, 0)), sans(9.5), MUTED, m, y + 9);
    y += 18;
    code(S, toks, size, m, y, w);
    if (words) fold(S, pg, words, foldH, o.lang);
  }
  function answerPage(S, pg, p, o) {
    const m = MARGIN, w = pg.w - 2 * m; let y = m;
    S.rect(0, 0, pg.w, pg.h, '#ffffff');
    y = paragraph(S, say(o.lang, 'answer').toLocaleUpperCase(o.lang), sans(10, 600), MUTED, m, y, w, o.lang) + 4;
    y = paragraph(S, heading, sans(22, 600), INK, m, y, w, o.lang) + 6;
    const side = w * 0.86, ox = (pg.w - side) / 2, oy = y + 8, u = side / 15;
    for (const [color, rings] of FACES || []) S.shape(rings.map(r => r.map(([x, yy]) => [ox + x * u, oy + yy * u])), color);
    const strokes = p.segments.filter(s => s.length > 1).map(s => s.map(q => [ox + q.x * u, oy + q.y * u]));
    if (strokes.length) S.lines(strokes, { color: INK, width: 0.12 * u, cap: 'round' });
    for (const s of p.segments) if (s.length === 1) S.dot(ox + s[0].x * u, oy + s[0].y * u, 0.12 * u, INK);
    S.frame(ox, oy, side, side, { color: INK, alpha: 0.25, width: 0.7 });
    y += side + 22;
    if (p.message) paragraph(S, '“' + p.message + '”', sans(15, 400, true), INK, m, y, w, o.lang);
  }
  function pageCanvas(pg, draw, scale = 3) {
    const c = document.createElement('canvas'); c.width = Math.round(pg.w * scale); c.height = Math.round(pg.h * scale);
    const ctx = c.getContext('2d'); ctx.scale(scale, scale); draw(canvasSurface(ctx)); return c;
  }

  // MARK: The preview and the PDF
  let pic = null;
  const read = () => pic || (pic = M.readPayload(item.payload));
  const pagesOf = (p, o) => [S => puzzlePage(S, PAPER[o.paper], p, o)].concat(o.answer ? [S => answerPage(S, PAPER[o.paper], p, o)] : []);
  async function preview() {
    const box = $('sheetPreview'); if (!box) return;
    const p = await read(), o = options();
    const c = pageCanvas(PAPER[o.paper], pagesOf(p, o)[0]);
    c.style.width = '100%'; c.style.height = 'auto'; box.replaceChildren(c);
  }
  let lib = null;
  const loadPDF = () => lib || (lib = new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => ok(window.jspdf); s.onerror = fail; document.head.appendChild(s);
  }));
  async function pdf(o) {
    const [j, p] = await Promise.all([loadPDF(), read()]);
    const pg = PAPER[o.paper], doc = new j.jsPDF({ unit: 'pt', format: [pg.w, pg.h], compress: true });
    pagesOf(p, o).forEach((draw, i) => { if (i) doc.addPage([pg.w, pg.h]); draw(pdfSurface(doc)); });
    return doc;
  }
  async function download() {
    const btn = $('sheetPDF'); btn.disabled = true;
    try { const o = options(); (await pdf(o)).save(page.dataset.file + '-worksheet' + (o.lang === 'en' ? '' : '-' + o.lang) + '.pdf'); }
    finally { btn.disabled = false; }
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
  // for tools/worksheet-parity.py: the pages at 3x with given settings
  window.CoWorksheet = { pages: async o => { const p = await read(); return pagesOf(p, o).map(d => pageCanvas(PAPER[o.paper], d).toDataURL('image/png')); }, pdf };
  preview();
})();
