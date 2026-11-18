// The web turn player's object against the app's own (Coordigo/Docs/PROTOCOL-TURN-v1.md §5).
//   node tools/turn-check.mjs <reference.json> <Coordigo library.json>
// reference.json: Coordigo/scripts/web-turn-reference.sh. Every point to 1e-6, every view, chain and angle.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const T = require('../turn/turn.js');
const M = require('../mystery/engine.js');
const [refPath, libPath] = process.argv.slice(2);
const ref = JSON.parse(readFileSync(refPath));
const lib = new Map(JSON.parse(readFileSync(libPath)).map(e => [e.id, e]));

let failures = 0, checked = 0;
const fail = what => { failures++; if (failures <= 20) console.log('FAIL', what); };
const near = (a, b, eps = 2e-6) => Math.abs(a - b) <= eps;

for (const r of ref) {
  const link = T.readLink(r.payload);
  const p = T.build(link, link.pictures.map(id => T.shape(M.parseCode(lib.get(id).d))));
  const tag = `${r.payload.slice(0, 24)}… stage ${r.stage}`;
  if (!p) { fail(`${tag}: no object`); continue; }
  if (p.object.points.length !== r.points.length) { fail(`${tag}: ${p.object.points.length} points vs ${r.points.length}`); continue; }
  const off = p.object.points.findIndex((q, i) => !q.every((v, k) => near(v, r.points[i][k])));
  if (off >= 0) fail(`${tag}: point ${off} ${p.object.points[off]} vs ${r.points[off]}`);
  if (JSON.stringify(p.object.views.map(v => [Math.round(v.yaw * 1e6) / 1e6 || 0, v.shift])) !==
      JSON.stringify(r.views.map(v => [v.yaw || 0, v.shift]))) fail(`${tag}: views ${JSON.stringify(p.object.views)} vs ${JSON.stringify(r.views)}`);
  if (JSON.stringify(p.object.chains) !== JSON.stringify(r.chains)) fail(`${tag}: guide chains differ`);
  if (![p.start.yaw, p.start.pitch, p.start.roll].every((v, k) => near(v, r.start[k]))) fail(`${tag}: start ${JSON.stringify(p.start)} vs ${r.start}`);
  r.poses.forEach((pose, i) => {
    const got = p.object.views.map(v => T.angle({ yaw: pose[0], pitch: pose[1], roll: pose[2] }, T.showing(v)));
    if (!got.every((a, k) => near(a, r.angles[i][k], 5e-6))) fail(`${tag}: pose ${i} angles ${got} vs ${r.angles[i]}`);
  });
  checked++;
}
// Links the app refuses are refused here too (TurnLinkTests.testRefusesWhatTheAppCannotPlay).
const b64 = s => Buffer.from(s).toString('base64url');
const kind = s => { try { T.readLink(s); return 'read'; } catch (e) { return e.kind; } };
for (const [json, want, why] of [
  ['{"v":2,"s":1,"p":["genre-tulips"],"k":1,"o":[0,0,0]}', 'newer', 'a higher version'],
  ['{"v":1,"s":9,"p":["genre-tulips"],"k":1,"o":[0,0,0]}', 'broken', 'stage 9'],
  ['{"v":1,"s":3,"p":["genre-tulips"],"k":1,"o":[0,0,0]}', 'broken', 'stage 3 with one picture'],
  ['{"v":1,"s":3,"p":["genre-tulips","genre-dog"],"k":1,"t":300,"o":[0,0,0]}', 'broken', '30° between views'],
  ['{"v":1,"s":3,"p":["genre-dog","genre-dog"],"k":1,"t":900,"o":[0,0,0]}', 'broken', 'the same picture twice'],
  ['{"v":1,"s":1,"p":["genre-tulips"],"k":1,"o":[0,0]}', 'broken', 'a start of two numbers'],
  ['{"v":1,"s":1,"p":["genre-tulips"],"k":68,"o":[600,0,0]}', 'read', 'a plain one-picture link'],
  ['{"v":1,"s":1,"p":["genre-tulips"],"k":68,"o":[600,0,0],"m":"Look!","f":"Jun"}', 'read', 'a link with words and a name'],
]) if (kind(b64(json)) !== want) fail(`${why}: ${kind(b64(json))}, want ${want}`);
if (kind('A'.repeat(1300)) !== 'broken') fail('a 1,300-character payload');
{ const l = T.readLink(b64('{"v":1,"s":1,"p":["genre-tulips"],"k":68,"o":[600,0,0],"m":"  Look!\\u0007 ","f":"Jun"}'));
  if (l.message !== 'Look!' || l.from !== 'Jun') fail(`words read as ${l.message} / ${l.from}`); }

console.log(failures ? `${failures} failed (${checked}/${ref.length} puzzles built)` : `all passed (${checked}/${ref.length} app puzzles)`);
process.exit(failures ? 1 : 0);
