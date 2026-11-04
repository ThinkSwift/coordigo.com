// The Library's pictures as data for tools/library-pages.py: each picture read with the site's own engine
// (mystery/engine.js, the app's rules), its fills as a raster and its lines as points.
// Run: node tools/library-data.mjs [library.js] — default the site's own; the app's full Library comes from Coordigo scripts/web-library.py
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('..', import.meta.url).pathname;
const ctx = { window: {}, atob, Blob, DecompressionStream, Response, TextDecoder, TextEncoder, Uint8Array, Uint8ClampedArray, console };
ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(root + 'mystery/engine.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync(process.argv[2] || root + 'library.js', 'utf8'), ctx);
const M = ctx.Mystery || ctx.window.Mystery, L = ctx.CO_LIBRARY || ctx.window.CO_LIBRARY;
const out = [];
for (const item of L) {
  let p;
  try { p = await M.readPayload(item.payload); } catch (e) { console.error(item.id, e.message); continue; }
  const regions = M.regionsOf(p), px = M.pixels ? M.pixels(regions, new Set(regions.map(r => r.id))) : null;   // the fills come from the app's faces now
  out.push({ id: item.id, number: item.number || 0, theme: item.theme, payload: item.payload, title: p.title || '', message: p.message || '',
             segments: p.segments.map(s => s.map(q => [q.x, q.y])), w: M.W, h: M.H,
             pixels: px ? Buffer.from(px.buffer).toString('base64') : null, code: p.segments.map(s => s.map(M.pair).join(' ')) });
}
process.stdout.write(JSON.stringify(out));
