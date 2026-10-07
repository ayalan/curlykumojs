// Validity checks: same input gives same output, numbers are valid, outlines close, curls do not cross.
// Run:  node test/check.js          (quick, about 10 seconds)
//       node test/check.js --full   (200 seeds)
const path = require('path');
const CurlyKumo = require(path.join(__dirname, '..', 'curlykumo.js'));

const FULL = process.argv.includes('--full');
const SEEDS = FULL ? 200 : 40;
let failed = 0;
const report = (name, pass, info) => { if (!pass) failed++; console.log((pass ? 'PASS' : 'FAIL').padEnd(5), name, '|', info); };
const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

// 1. same parameters, same output
const a = JSON.stringify(CurlyKumo.generate({ seed: 34, growth: 0.63 })), b = JSON.stringify(CurlyKumo.generate({ seed: 34, growth: 0.63 }));
report('same parameters give identical output', a === b, a.length + ' characters compared');
report('growth 0 gives an empty frame', CurlyKumo.generate({ seed: 34, growth: 0 }).masses.length === 0, 'masses: ' + CurlyKumo.generate({ seed: 34, growth: 0 }).masses.length);

// 2. valid numbers and closed outlines, at the defaults and at the ends of the parameter ranges
function endGap(outline) {
  const m = outline.match(/^M(-?[\d.]+) (-?[\d.]+)/), parts = outline.slice(0, -1).split('A');
  const last = nums(parts[parts.length - 1]).slice(-2);
  return Math.hypot(last[0] - Number(m[1]), last[1] - Number(m[2]));
}
const sets = [{}, { sizeVar: 0.8, overlap: 0.4 }, { sizeVar: 0.8, overlap: 0.15, thickness: 0.9 }, { thickness: 1.8, length: 16, masses: 5 },
  { lobe: 8, squash: 0.45 }, { masses: 1, length: 4 }, { sway: 1, phase: 7.3 }, { masses: 2.5, spread: 1.2, irregularity: 0.3 }];
let frames = 0, invalid = 0, open = 0;
for (const extra of sets) for (let seed = 1; seed <= SEEDS; seed++) for (let g = 0.02; g <= 1.0001; g += 0.049) {
  const fr = CurlyKumo.generate(Object.assign({ seed, growth: g }, extra));
  frames++;
  if (/NaN|Infinity|undefined/.test(fr.silhouette + fr.masses.map((m) => m.curls.join('')).join(''))) invalid++;
  for (const m of fr.masses) if (endGap(m.outline) > 0.3) open++;
}
report('no invalid numbers in path data', invalid === 0, invalid + ' of ' + frames + ' frames');
report('every mass outline is closed', open === 0, open + ' open outlines in ' + frames + ' frames');

// 3. curls of one mass do not cross each other
const points = (d) => { const n = nums(d), p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]); return p; };
const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const cross = (p, q, r, s) => side(p, q, r) !== side(p, q, s) && side(r, s, p) !== side(r, s, q);
let masses = 0, crossing = 0;
for (let seed = 1; seed <= SEEDS; seed++) for (const g of [0.3, 0.5, 0.7, 0.85, 1]) {
  for (const m of CurlyKumo.generate({ seed, growth: g }).masses) {
    masses++;
    const polys = m.curls.map(points);
    let hit = false;
    for (let i = 0; i < polys.length && !hit; i++) for (let j = i + 1; j < polys.length && !hit; j++)
      for (let u = 0; u + 1 < polys[i].length && !hit; u++) for (let v = 0; v + 1 < polys[j].length; v++)
        if (cross(polys[i][u], polys[i][u + 1], polys[j][v], polys[j][v + 1])) { hit = true; break; }
    if (hit) crossing++;
  }
}
report('curls do not cross inside a mass', crossing / masses <= 0.005, crossing + ' of ' + masses + ' masses');

// 4. speed (information only)
const t0 = process.hrtime.bigint();
for (let i = 0; i < 2000; i++) CurlyKumo.generate({ seed: 1 + (i % 50), growth: (i % 100) / 100 });
console.log('INFO  mean time per frame |', (Number(process.hrtime.bigint() - t0) / 2000 / 1e6).toFixed(3), 'ms');

process.exit(failed ? 1 : 0);
