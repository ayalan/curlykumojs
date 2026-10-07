// Smoothness check. One parameter moves across its range in 4000 small steps. The total visible curl
// length of each mass is a single number that must change gradually. A change of more than a quarter of
// the lobe radius between two adjacent steps counts as a jump.
// Run:  node test/smooth.js            (2 seeds per parameter, about 2 minutes)
//       node test/smooth.js --full     (12 seeds per parameter, several minutes)
//       node test/smooth.js growth     (only the named parameters)
const path = require('path');
const CurlyKumo = require(path.join(__dirname, '..', 'curlykumo.js'));

const FULL = process.argv.includes('--full');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SEEDS = FULL ? 12 : 2, STEPS = 4000, LIMIT = CurlyKumo.DEFAULTS.lobe / 4;
let failed = 0;

function length(d) {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
  let len = 0;
  for (let i = 2; i + 1 < n.length; i += 2) len += Math.hypot(n[i] - n[i - 2], n[i + 1] - n[i - 1]);
  return len;
}
function sweep(key, base, lo, hi) {
  let jumps = 0, worst = 0, steps = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    let prev = null;
    for (let t = 0; t <= STEPS; t++) {
      const fr = CurlyKumo.generate(Object.assign({ seed }, base, { [key]: lo + ((hi - lo) * t) / STEPS }));
      const cur = new Map(fr.masses.map((m) => [m.id, m.curls.reduce((a, d) => a + length(d), 0)]));
      if (prev) {
        steps++;
        let hit = false;
        cur.forEach((len, id) => { const d = Math.abs(len - (prev.get(id) || 0)); if (d > worst) worst = d; if (d > LIMIT) hit = true; });
        if (hit) jumps++;
      }
      prev = cur;
    }
  }
  if (jumps) failed++;
  console.log((jumps ? 'FAIL' : 'PASS').padEnd(5), key.padEnd(10), '|', jumps, 'jumps in', steps, 'steps | largest change in one step', worst.toFixed(1), 'units (limit ' + LIMIT + ')');
}
for (const [key, base, lo, hi] of [['growth', {}, 0, 1], ['masses', {}, 1, 5], ['length', {}, 4, 16], ['sizeVar', {}, 0, 0.8],
  ['thickness', {}, 0.9, 1.8], ['overlap', {}, 0.15, 0.4], ['turns', {}, 0.3, 1.8], ['phase', { sway: 1 }, 0, 12]]) {
  if (only.length && !only.includes(key)) continue;
  sweep(key, base, lo, hi);
}
process.exit(failed ? 1 : 0);
