// A picture's page on coordigo.com/library/<id>/: its worksheet (the site's own design since 2026-11-07,
// RDM-co-site-worksheet-redesign-19; the app's Print.swift follows in a later version). Puzzle page: Mystery Picture, the
// optional Name and Class lines, a two-sentence instruction, the 16 x 16 grid and the code as numbered lines; answer page:
// the picture's name as a kicker, the picture in the app's exact faces (the page's #faces), its message as the title and a
// few lines that carry it further (the page's #picture-words: m message, t title, d description, by language). Every page
// carries coordigo.com, "Free to download" and the stamp "coordigo #N · Tier". The words are in the site's 19 languages:
// the app's own (worksheet-words.js, from its string catalog) and the site's (worksheet-site-words.js); the menu speaks
// the reader's language; the sheet is in the reader's language or English. The settings: paper, answer page, Name and Class lines (renamable), the sheet's title and words.
// Drawn for the preview (canvases, both pages) and for the PDF (lines and fills as vectors, words at 432 dpi).
// tools/worksheet-check.py renders every picture in both papers and several languages and checks that everything fits.
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
  const json = id => { try { return JSON.parse(($(id) || {}).textContent || 'null'); } catch (e) { return null; } };
  const FACES = json('faces'), OWN = json('picture-words') || {};   // OWN: {m: locale → message, t: locale → title}

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
  // The picture's own message and title in a language, as the app picks them (MysteryLibrary.pick): the reader's own
  // region if it is that language, the language, its usual region, any region of it, then English
  const USUAL = { en: 'en-US', es: 'es-ES', ar: 'ar-SA', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL' };
  const pick = (byLocale, lang) => {
    if (!byLocale) return '';
    const own = (navigator.languages || []).find(t => t.split('-')[0] === lang.split('-')[0] && t.includes('-'));
    const keys = Object.keys(byLocale).sort();
    const tries = [own, lang, USUAL[lang], ...keys.filter(k => k.startsWith(lang + '-')), 'en-US', 'en'];
    for (const t of tries) if (t && byLocale[t]) return byLocale[t];
    return '';
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
    // Two sheets to choose from: the reader's own language and English; an English reader is not asked
    // (founder 2026-11-07, RDM-co-site-free-printables)
    const own = $('langOwn');
    if (own && readerLang !== 'en') {
      own.value = readerLang; $('langOwnName').textContent = NAMES[readerLang] || readerLang;
      $('langOwnName').lang = readerLang; $('langSet').hidden = false;
    }
    form.elements.lang.value = readerLang;
    form.dataset.ready = '1';
  }
  const options = () => ({
    paper: form.elements.paper.value, answer: form.elements.answer.checked, lang: form.elements.lang.value || readerLang,
    title: form.elements.title.value.trim(), words: form.elements.words.value.trim(), edited: !!form.elements.words.dataset.edited,
    fields: form.elements.fields.checked, label1: form.elements.label1.value.trim(), label2: form.elements.label2.value.trim(),
  });
  // Settings made whole: the picture's own message (no emoji on paper) unless the reader wrote their own, and its
  // description only under its own message
  const complete = o => {
    const own = noEmoji(pick(OWN.m, o.lang)), words = o.words == null || (!o.edited && !o.words) ? own : o.words;
    return { fields: false, title: '', ...o, words,
      label1: o.label1 == null ? sayS(o.lang, 'name') : o.label1, label2: o.label2 == null ? sayS(o.lang, 'klass') : o.label2,
      desc: words && words === own ? pick(OWN.d, o.lang) : '' };
  };
  // The menu in the worksheet's language (the app's own words for its sheet and settings)
  // The Words field starts as the picture's own message (the app's PrintOptions.for), in the worksheet's language, until
  // the reader writes their own
  function ownWords(lang) {
    const w = form.elements.words;
    if (w && !w.dataset.edited) w.value = noEmoji(pick(OWN.m, lang));
    // the line names start as Name and Class in the worksheet's language, until the reader renames them
    for (const [n, key] of [['label1', 'name'], ['label2', 'klass']]) {
      const f = form.elements[n]; if (f && !f.dataset.edited) f.value = sayS(lang, key);
    }
    const names = $('fieldNames'); if (names) names.hidden = !form.elements.fields.checked;
  }
  function speak(lang) {
    for (const el of document.querySelectorAll('[data-w]')) el.textContent = say(lang, el.dataset.w);
    for (const el of document.querySelectorAll('[data-ws]')) el.textContent = sayS(lang, el.dataset.ws);
    const ws = document.querySelector('.menu'); if (ws) { ws.lang = lang; ws.dir = RTL_LANG(lang) ? 'rtl' : 'ltr'; }
  }

  // MARK: Ink and type: the app's ink for the answer's lines; the system fonts behind the design's (see The pages)
  const INK = '#1f1e1c';
  const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Thai", "Noto Sans Devanagari", "Noto Sans Arabic", sans-serif';
  const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
  const meter = document.createElement('canvas').getContext('2d');
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
    // a piece wider than the whole measure (a long run of kana) breaks between its letters
    const all = pieces(s, lang).flatMap(p => width(p.trim(), font) > w && !/\s/.test(p.trim()) ? [...p] : [p]);
    for (const p of all) {
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
      ring(x, y, r, o) { ctx.save(); stroke(o); ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke(); ctx.restore(); },
      image(img, x, y, w, h, r) { ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip(); ctx.drawImage(img, x, y, w, h); ctx.restore(); },
      words(box, draw) { ctx.save(); draw(ctx); ctx.restore(); },
      picture(c, x, y, w, h) { ctx.drawImage(c, x, y, w, h); },
      async svg(str, x, y, w, h) { const img = await svgImage(str); ctx.drawImage(img, x, y, w, h); },
    };
  }
  // An SVG drawing (the cross stitch chart, its swatches and guide) as an image for the canvas, or a live element for the PDF
  const svgImage = str => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail;
    i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str); });
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
      ring(x, y, r, o) { stroke(o); doc.circle(x, y, r, 'S'); },
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
      // a drawn canvas (the stitched hoop) on white, as a fine JPEG
      picture(c, x, y, w, h) {
        const b = document.createElement('canvas'); b.width = c.width; b.height = c.height; const g = b.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, b.width, b.height); g.drawImage(c, 0, 0);
        doc.addImage(b.toDataURL('image/jpeg', 0.9), 'JPEG', x, y, w, h, undefined, 'FAST');
      },
      // SVG as vectors (svg2pdf.js); the element sits off screen while it is read
      async svg(str, x, y, w, h) {
        const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px;overflow:hidden';
        box.innerHTML = str; document.body.appendChild(box);
        try { await doc.svg(box.firstElementChild, { x, y, width: w, height: h }); } finally { box.remove(); }
      },
    };
  }

  const mark = new Image(); mark.src = '/library/printmark.png';
  const markReady = new Promise(ok => { mark.onload = ok; mark.onerror = ok; });

  // MARK: The pages, y down, in page points (the 2026-11-07 design, RDM-co-site-worksheet-redesign-19)
  // Puzzle: the title, optional Name and Class lines, the two-sentence instruction, the 16 × 16 grid without dots (heavy
  // lines at 0, 5, A, F as the app's isMajor; never every 4), and the code as numbered lines in two to four columns.
  // Answer: the picture's name as a small kicker, the picture, its message as the title and a few lines that carry the
  // message further. Every page: coordigo.com with "Free to download" and the stamp "coordigo #N · Tier" at the foot.
  // Latin text is set in Young Serif, Karla, JetBrains Mono and Silkscreen (Google Fonts, loaded with the page); other
  // scripts fall back to the reader's system fonts, as the words are drawn as fine images.
  const SITE_WORDS = window.CO_WORKSHEET_SITE_WORDS || {};
  const sayS = (lang, key) => (SITE_WORDS[lang] || {})[key] || (SITE_WORDS.en || {})[key] || '';
  const D_INK = '#22231f', SOFT = '#6b6d63', LIGHT = '#9a9c92', RULE = '#e2e3dc', CAP = '#a3202f';
  const F_SERIF = '"Young Serif", Georgia, "Noto Serif", serif';
  const F_SANS = '"Karla", "Helvetica Neue", Arial, ' + SANS;
  const F_MONO = '"JetBrains Mono", ' + MONO;
  const F_PIX = '"Silkscreen", "JetBrains Mono", ' + MONO;
  const face = (fam, size, weight = 400) => weight + ' ' + size + 'px ' + fam;
  const fontsReady = (document.fonts ? Promise.all(['400 34px "Young Serif"', '400 12px "Karla"', '700 12px "Karla"',
    '500 12px "JetBrains Mono"', '600 12px "JetBrains Mono"', '400 12px "Silkscreen"'].map(f => document.fonts.load(f).catch(() => null)))
    : Promise.resolve()).catch(() => null);
  const MARGINS = { letter: 39.6, a4: 39.69 };                 // 0.55 in · 14 mm
  const GRID_BOX = { letter: 331.2, a4: 360 };                 // 4.6 in · 5.0 in, the grid with its axis labels
  const FOOT_H = 24;
  const STEPS = [[2, 9.5, 3.2], [3, 9.5, 3], [3, 9, 2.6], [4, 9, 2.4], [4, 8.5, 2], [4, 8, 1.6], [4, 7.5, 1.2], [4, 7, 1]];
  const PX = 0.75;                                             // one CSS pixel in points
  const noEmoji = s => (s || '').replace(/[\u{1F000}-\u{1FFFF}☀-➿️‍]/gu, '').replace(/\s+/g, ' ').trim();
  const LATIN = s => /^[\x20-ɏ·–—’]*$/.test(s);
  let issues = null;                                          // the check's notes (CoWorksheet.check), else null
  const note = s => { if (issues) issues.push(s); };

  // One line with its baseline at y. Letter spacing (in em) only for Latin: a joined script keeps its shaping.
  function text(S, s, font, color, x, y, align = 'left', spacing = 0) {
    const size = parseFloat(/([\d.]+)px/.exec(font)[1]), sp = spacing && LATIN(s) ? spacing * size : 0, chars = [...s];
    const w = sp ? chars.reduce((n, c) => n + width(c, font), 0) + sp * (chars.length - 1) : width(s, font);
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    S.words([x0 - 4, y - size * 1.25, w + 8, size * 1.75], ctx => {
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.direction = RTL(s) ? 'rtl' : 'ltr';
      if (!sp) { if (ctx.direction === 'rtl') { ctx.textAlign = 'right'; ctx.fillText(s, x0 + w, y); } else ctx.fillText(s, x0, y); return; }
      let cx = x0; for (const c of chars) { ctx.fillText(c, cx, y); cx += width(c, font) + sp; }
    });
    return w;
  }
  // The narrowest measure that keeps the same number of lines (text-wrap: balance)
  function balanced(s, font, w, lang) {
    const n = lines(s, font, w, lang).length;
    // never narrower than the longest piece that cannot break (a Japanese phrase, a long word)
    let lo = Math.max(w * 0.4, ...pieces(s, lang).map(p => Math.min(w, width(p.trim(), font)))), hi = w;
    if (lo >= hi) return w;
    if (n < 2) return Math.min(w, width(s, font) + 2);
    while (hi - lo > 1) { const mid = (lo + hi) / 2; if (lines(s, font, mid, lang).length > n) lo = mid; else hi = mid; }
    return Math.ceil(hi) + 1;
  }
  // A paragraph from y down at a line height; returns the y under it. align: left | right | center
  function block(S, s, font, color, x, y, w, lang, lh, align) {
    const size = parseFloat(/([\d.]+)px/.exec(font)[1]), ls = lines(s, font, w, lang), rtl = RTL(s);
    const a = align || (rtl ? 'right' : 'left'), base = (lh - size) / 2 + size * 0.8;
    for (const t of ls) if (width(t, font) > w + 1) note('overflow: "' + t.slice(0, 24) + '" is wider than its box');
    if (S) S.words([x - 6, y - 2, w + 12, ls.length * lh + 6], ctx => {
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = a;
      ls.forEach((t, i) => ctx.fillText(t, a === 'center' ? x + w / 2 : a === 'right' ? x + w : x, y + base + i * lh));
    });
    return y + ls.length * lh;
  }
  const blockH = (s, font, w, lang, lh) => lines(s, font, w, lang).length * lh;

  // The foot of every page: coordigo.com over "Free to download", the page number, the stamp (mark, coordigo, #N · Tier)
  function foot(S, pg, k, n, o) {
    const m = MARGINS[o.paper], bottom = pg.h - 0.6 * m, rtl = RTL_LANG(o.lang);
    const left = m, right = pg.w - m;
    const siteX = rtl ? right : left, siteA = rtl ? 'right' : 'left';
    text(S, 'coordigo.com', face(F_SANS, 9), SOFT, siteX, bottom - 11, siteA);
    text(S, sayS(o.lang, 'free'), face(F_SANS, 7), LIGHT, siteX, bottom - 2.2, siteA);
    text(S, k + ' / ' + n, face(F_PIX, 7), LIGHT, pg.w / 2, bottom - 2.2, 'center', 0.08);
    const bf = face(F_SANS, 10, 700), bw = width('coordigo', bf), icon = 13, row = icon + 5 + bw;
    const sx = rtl ? left : right - row;
    if (mark.naturalWidth) S.image(mark, sx, bottom - 24, icon, icon, 3);
    text(S, 'coordigo', bf, D_INK, sx + icon + 5, bottom - 13.6);
    const lbl = label(o.lang);
    if (lbl) text(S, lbl, face(MONO, 7.5), SOFT, rtl ? left : right, bottom - 2.2, rtl ? 'left' : 'right');
  }

  // The grid as the design draws it: a box GW wide holding the 15 squares (390 of its 431.6 units, from 26 in), the
  // digits above and to the left
  function grid(S, x, y, GW) {
    const k = GW / 431.6, M0 = 26 * k, C = 26 * k, side = 15 * C, ox = x + M0, oy = y + M0, minor = [], major = [];
    for (let i = 0; i <= 15; i++) {
      const v = i * C, two = [[[ox + v, oy], [ox + v, oy + side]], [[ox, oy + v], [ox + side, oy + v]]];
      (i % 5 === 0 ? major : minor).push(...two);
    }
    S.lines(minor, { color: D_INK, alpha: 0.2, width: 0.55 * k });
    S.lines(major, { color: D_INK, alpha: 0.42, width: 1.1 * k });
    const font = face(F_MONO, 10 * k, 600);
    S.words([x, y, GW, GW], ctx => {
      ctx.font = font; ctx.fillStyle = SOFT; ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr';
      for (let i = 0; i <= 15; i++) {
        const d = M.DIGITS[i], v = i * C;
        ctx.textAlign = 'center'; ctx.fillText(d, ox + v, y + M0 - 10 * k);
        ctx.textAlign = 'right'; ctx.fillText(d, ox - 10 * k, oy + v + 4 * k);
      }
    });
  }

  // The code as numbered lines: each a ring to tick, its number and its pairs, wrapping inside its column; the columns are
  // balanced as CSS balances them (the shortest height that keeps every line whole and in order)
  function codeLayout(items, c, fz, pd, w) {
    const gap = c > 2 ? 14 : 22, colW = (w - gap * (c - 1)) / c, lead = 0.75 * fz + 7 + 12 + 7, room = colW - lead;
    const pf = face(F_MONO, fz, 500), ch = width('0', pf) + 0.04 * fz, pairW = 2 * ch, spaceW = ch + 0.18 * fz;
    const laid = items.map(it => {
      const rows = [[]]; let x = 0;
      for (const t of it.pairs) {
        if (rows[rows.length - 1].length && x + spaceW + pairW > room) { rows.push([]); x = 0; }
        const r = rows[rows.length - 1]; if (r.length) x += spaceW; r.push({ t, x }); x += pairW;
      }
      return { ...it, rows, h: rows.length * fz * 1.25 + 2 * pd + PX };
    });
    const fits = H => { let col = 0, used = 0; for (const it of laid) { if (used && used + it.h > H) { col++; used = 0; } used += it.h; } return col < c; };
    let lo = Math.max(...laid.map(i => i.h)), hi = laid.reduce((n, i) => n + i.h, 0);
    while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    const H = hi, cols = [[]]; let used = 0;
    for (const it of laid) { if (used && used + it.h > H) { cols.push([]); used = 0; } cols[cols.length - 1].push(it); used += it.h; }
    return { cols, colW, gap, lead, ch, pairW, spaceW, fz, pd, pf, h: Math.max(...cols.map(c => c.reduce((n, i) => n + i.h, 0))) };
  }
  function drawCode(S, L, x, y, w, rtl) {
    const { fz, pd, pf } = L, nf = face(F_PIX, 7), rings = [], dots = [];
    L.cols.forEach((col, ci) => {
      const cx = rtl ? x + w - (ci + 1) * L.colW - ci * L.gap : x + ci * (L.colW + L.gap);
      let cy = y;
      for (const it of col) {
        const b0 = cy + pd + (fz * 1.25 - fz) / 2 + fz * 0.8, r = 0.375 * fz;
        const ringX = rtl ? cx + L.colW - r : cx + r;
        rings.push([ringX, b0 - r + 1, r]);
        text(S, String(it.n), nf, LIGHT, rtl ? cx + L.colW - 0.75 * fz - 7 : cx + 0.75 * fz + 7, b0, rtl ? 'right' : 'left');
        const px = rtl ? cx : cx + L.lead, room = L.colW - L.lead;
        S.words([px - 2, cy, room + 4, it.h], ctx => {
          ctx.font = pf; ctx.fillStyle = D_INK; ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr'; ctx.textAlign = 'left';
          it.rows.forEach((row, ri) => {
            const rw = row.length ? row[row.length - 1].x + L.pairW : 0, off = rtl ? room - rw : 0;
            for (const p of row) for (let j = 0; j < 2; j++) ctx.fillText(p.t[j], px + off + p.x + j * L.ch, b0 + ri * fz * 1.25);
          });
        });
        cy += it.h;
        dots.push([[cx, cy - PX / 2], [cx + L.colW, cy - PX / 2]]);
      }
    });
    S.lines(dots, { color: RULE, width: PX, dash: [PX, PX * 1.6] });
    for (const [rx, ry, r] of rings) S.ring(rx, ry, r, { color: LIGHT, width: PX });
  }

  function puzzlePage(S, pg, p, o) {
    const m = MARGINS[o.paper], w = pg.w - 2 * m, rtl = RTL_LANG(o.lang), a = rtl ? 'right' : 'left';
    S.rect(0, 0, pg.w, pg.h, '#ffffff');
    let y = block(S, say(o.lang, 'heading'), face(F_SERIF, 34), D_INK, m, m, w, o.lang, 34 * 1.02, a);
    // the Name and Class lines: two of the same length; their room is kept when they are off
    y += 4;
    if (o.fields) {
      const cw = (w - 22) / 2, lf = face(F_SANS, 9.5);
      [o.label1, o.label2].forEach((t, i) => {
        const cx = rtl ? pg.w - m - (i + 1) * cw - i * 22 : m + i * (cw + 22), tw = t ? width(t, lf) : 0;
        if (t) text(S, t, lf, SOFT, rtl ? cx + cw : cx, y + 22 - 2.4, rtl ? 'right' : 'left');
        const l0 = rtl ? cx : cx + tw + (t ? 7 : 0), l1 = rtl ? cx + cw - tw - (t ? 7 : 0) : cx + cw;
        S.lines([[[l0, y + 22], [l1, y + 22]]], { color: LIGHT, width: PX });
      });
    }
    y += 22 + 8;
    const hf = face(F_SANS, 10.5), hw = Math.min(w, 60 * width('0', hf));
    y = block(S, sayS(o.lang, 'how'), hf, SOFT, rtl ? pg.w - m - hw : m, y, hw, o.lang, 10.5 * 1.45, a);
    // the grid, then the code under a rule; the code takes the first step that clears the foot, and only when none
    // does, the grid gives up a little room
    const items = p.segments.map((s, k) => ({ n: k + 1, pairs: s.map(q => M.pair(q)) }));
    const counts = say(o.lang, 'code') + ' · ' + say(o.lang, 'counts', p.segments.length, p.segments.reduce((n, s) => n + s.length, 0));
    const footTop = pg.h - 0.6 * m - FOOT_H, top = y + 12;
    let best = null;
    for (const g of [1, 0.94, 0.88, 0.82, 0.76, 0.7]) {
      const GW = GRID_BOX[o.paper] * g, codeTop = top + GW + 14 + 9 + 7.5 * 1.25 + 7;
      for (const [c, fz, pd] of STEPS) {
        const L = codeLayout(items, c, fz, pd, w);
        best = { GW, codeTop, L, g, c, fz };
        if (codeTop + L.h <= footTop - 8) break;
      }
      if (best.codeTop + best.L.h <= footTop - 8) break;
    }
    if (best.codeTop + best.L.h > footTop - 8) note('code: runs ' + Math.round(best.codeTop + best.L.h - footTop + 8) + ' pt into the foot');
    if (best.g < 1) note('grid: shrunk to ' + Math.round(best.g * 100) + '%');
    grid(S, (pg.w - best.GW) / 2, top, best.GW);
    const ry = top + best.GW + 14;
    S.lines([[[m, ry], [pg.w - m, ry]]], { color: RULE, width: PX });
    const cf = face(F_PIX, 7.5), cap = LATIN(counts) ? counts.toUpperCase() : counts.toLocaleUpperCase(o.lang);
    text(S, cap, cf, SOFT, rtl ? pg.w - m : m, ry + 9 + 7.5 * 0.95, a, 0.08);
    drawCode(S, best.L, m, best.codeTop, w, rtl);
    foot(S, pg, 1, o.answer ? 2 : 1, o);
    return { codeBottom: best.codeTop + best.L.h, footTop, columns: best.c, size: best.fz, grid: best.g };
  }

  function answerPage(S, pg, p, o) {
    const m = MARGINS[o.paper], w = pg.w - 2 * m, rtl = RTL_LANG(o.lang);
    S.rect(0, 0, pg.w, pg.h, '#ffffff');
    const kick = o.title || pick(OWN.t, o.lang) || TITLE || say(o.lang, 'yourPicture');
    const kf = face(F_PIX, 8), kcap = LATIN(kick) ? kick.toUpperCase() : kick.toLocaleUpperCase(o.lang);
    if (width(kcap, kf) + kcap.length * 0.8 > w) note('kicker: wider than the page');
    text(S, kcap, kf, CAP, rtl ? pg.w - m : m, m + 8 * 0.95, rtl ? 'right' : 'left', 0.1);
    const areaTop = m + 8 * 1.2 + 4 + 6, areaBottom = pg.h - m - 56, area = areaBottom - areaTop;
    const msg = o.words, desc = o.desc;
    // the design's sizes, then a step smaller at a time only if the words would not fit
    let side = 208.8, mz = 31, dz = 15, mf, df, mw, dw, mh, dh, total;
    for (let i = 0; i < 12; i++) {
      mf = face(F_SERIF, mz); df = face(F_SANS, dz);
      mw = msg ? balanced(msg, mf, Math.min(w, 26 * width('0', mf)), o.lang) : 0;
      dw = Math.min(w, 38 * width('0', df));
      mh = msg ? blockH(msg, mf, mw, o.lang, mz * 1.14) : 0;
      dh = desc ? blockH(desc, df, dw, o.lang, dz * 1.55) : 0;
      total = side + (msg ? 40 + mh : 0) + (desc ? 20 + dh : 0);
      if (total <= area) break;
      if (i === 11) { note('answer: runs ' + Math.round(total - area) + ' pt past its room'); break; }
      mz = Math.max(24, mz - 1.5); dz = Math.max(12.5, dz - 0.5); side = Math.max(170, side - 6);
    }
    if (mz < 31) note('answer: words set smaller (' + mz + ' / ' + dz + ' pt)');
    let y = areaTop + Math.max(0, (area - total) / 2);
    const ox = (pg.w - side) / 2, u = side / 15;
    for (const [color, rings] of FACES || []) S.shape(rings.map(r => r.map(([x, yy]) => [ox + x * u, y + yy * u])), color);
    const strokes = p.segments.filter(s => s.length > 1).map(s => s.map(q => [ox + q.x * u, y + q.y * u]));
    if (strokes.length) S.lines(strokes, { color: INK, width: 0.12 * u, cap: 'round' });
    for (const s of p.segments) if (s.length === 1) S.dot(ox + s[0].x * u, y + s[0].y * u, 0.16 * u, INK);
    S.frame(ox, y, side, side, { color: RULE, width: PX });
    y += side;
    if (msg) { y += 40; y = block(S, msg, mf, D_INK, (pg.w - mw) / 2, y, mw, o.lang, mz * 1.14, 'center'); }
    if (desc) { y += 20; y = block(S, desc, df, SOFT, (pg.w - dw) / 2, y, dw, o.lang, dz * 1.55, 'center'); }
    foot(S, pg, 2, 2, o);
    return { bottom: y, limit: areaBottom, message: mz, description: dz };
  }

  const nothing = { lines() {}, rect() {}, frame() {}, shape() {}, dot() {}, ring() {}, image() {}, words() {}, picture() {}, svg() { return Promise.resolve(); } };
  function pageCanvas(pg, draw, scale = 3) {
    const c = document.createElement('canvas'); c.width = Math.round(pg.w * scale); c.height = Math.round(pg.h * scale);
    const ctx = c.getContext('2d'); ctx.scale(scale, scale); draw(canvasSurface(ctx)); return c;
  }

  // MARK: The preview (both pages, as large as the page allows) and the PDF
  let pic = null;
  const read = () => pic || (pic = M.readPayload(item.payload));
  const pagesOf = (p, raw) => { const o = complete(raw); return [S => puzzlePage(S, PAPER[o.paper], p, o)].concat(o.answer ? [S => answerPage(S, PAPER[o.paper], p, o)] : []); };
  const ready = () => Promise.all([read(), markReady, fontsReady]);
  let drawing = 0;
  async function preview() {
    ownWords(form.elements.lang.value || readerLang);
    const box = $('sheetPreview'), o = options(), n = ++drawing;
    speak(readerLang);                                         // the menu stays in the reader's language; the sheet follows the choice
    const only = $('wsOnly'); if (only) only.hidden = !!stitch();
    if (!box) return;
    if (stitch()) { await window.CoStitch.preview(box, o, () => n !== drawing); return; }
    const [p] = await ready();
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
  let svgLib = null;
  const loadSVG = () => svgLib || (svgLib = loadPDF().then(() => new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.4/dist/svg2pdf.umd.min.js';
    s.onload = ok; s.onerror = fail; document.head.appendChild(s);
  })));
  const kind = () => (form.elements.kind && form.elements.kind.value) || 'worksheet';
  const stitch = () => kind() === 'stitch' && window.CoStitch;
  async function pdf(o) {
    if (stitch()) return window.CoStitch.pdf(o);
    const [j, [p]] = await Promise.all([loadPDF(), ready()]);
    const pg = PAPER[o.paper], doc = new j.jsPDF({ unit: 'pt', format: [pg.w, pg.h], compress: true });
    pagesOf(p, o).forEach((draw, i) => { if (i) doc.addPage([pg.w, pg.h]); draw(pdfSurface(doc)); });
    return doc;
  }
  const fileName = o => page.dataset.file + (stitch() ? '-cross-stitch' : '-worksheet') + (o.lang === 'en' ? '' : '-' + o.lang) + '-' + o.paper + '.pdf';
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
  form.elements.words.addEventListener('input', e => { e.target.dataset.edited = '1'; });
  for (const n of ['label1', 'label2']) form.elements[n].addEventListener('input', e => { e.target.dataset.edited = '1'; });
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
  // for tools/worksheet-check.py: the pages at 3x with given settings, and each page's fit with the notes it raised
  window.CoSheet = { PAPER, MARGINS, readerLang, say, sayS, pick, noEmoji, width, pieces, lines, block, blockH, balanced, text, face,
    F_SERIF, F_SANS, F_MONO, F_PIX, D_INK, SOFT, LIGHT, RULE, CAP, RTL, RTL_LANG, LATIN, foot, canvasSurface, pdfSurface, nothing,
    pageCanvas, loadPDF, loadSVG, ready, OWN, page, note: s => note(s), collect: on => { const n = issues; issues = on ? [] : null; return n; } };
  window.CoWorksheet = {
    pages: async (o, scale = 3) => { const [p] = await ready(); return pagesOf(p, o).map(d => pageCanvas(PAPER[o.paper], d, scale).toDataURL('image/png')); },
    check: async o => {
      const [p] = await ready();
      return pagesOf(p, o).map(d => { issues = []; const fit = d(nothing); const n = issues; issues = null; return { fit, notes: n }; });
    },
    pdf,
  };
  preview();
})();
