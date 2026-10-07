// Arc accuracy check. A browser rebuilds each outline arc from its rounded end points and radii.
// This test does the same rebuild (SVG arc rules) and measures how far the middle of each arc lands
// from the true lobe edge. Arcs that are drawn off the edge show up as lobes that twitch in slow motion.
// Run:  node test/twitch.js          (quick, about 15 seconds)
//       node test/twitch.js --full   (20 seeds, 4000 steps)
const path = require('path');
const CurlyKumo = require(path.join(__dirname, '..', 'curlykumo.js'));

const FULL = process.argv.includes('--full');
const SEEDS = FULL ? 20 : 4, STEPS = FULL ? 4000 : 1500;
let failed = 0;

function arcs(d) {
  const out = [], re = /([MAZ])([^MAZ]*)/g;
  let m, x = 0, y = 0;
  while ((m = re.exec(d))) {
    const n = (m[2].match(/-?\d+(\.\d+)?/g) || []).map(Number);
    if (m[1] === 'M') { x = n[0]; y = n[1]; }
    if (m[1] === 'A') {
      let [rx, ry, , fa, fs, x2, y2] = n;
      const px = (x - x2) / 2, py = (y - y2) / 2;
      const lam = (px * px) / (rx * rx) + (py * py) / (ry * ry);
      if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const num = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px, den = rx * rx * py * py + ry * ry * px * px;
      const co = (fa !== fs ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
      const cxp = (co * rx * py) / ry, cyp = (-co * ry * px) / rx;
      const cx = cxp + (x + x2) / 2, cy = cyp + (y + y2) / 2;
      const t1 = Math.atan2((py - cyp) / ry, (px - cxp) / rx), t2 = Math.atan2((-py - cyp) / ry, (-px - cxp) / rx);
      let dt = t2 - t1;
      if (fs && dt < 0) dt += 2 * Math.PI;
      if (!fs && dt > 0) dt -= 2 * Math.PI;
      out.push([cx + rx * Math.cos(t1 + dt / 2), cy + ry * Math.sin(t1 + dt / 2)]);
      x = x2; y = y2;
    }
  }
  return out;
}

function run(label, base, key, lo, hi) {
  let seen = 0, off = 0, worst = 0;
  for (let seed = 1; seed <= SEEDS; seed++) for (let t = 0; t <= STEPS; t++) {
    const fr = CurlyKumo.generate(Object.assign({ seed }, base, { [key]: lo + ((hi - lo) * t) / STEPS }));
    for (const m of fr.masses) for (const q of arcs(m.outline)) {
      let best = Infinity;
      for (const l of m.lobes) best = Math.min(best, Math.abs(Math.hypot((q[0] - l.x) / l.rx, (q[1] - l.y) / l.ry) - 1) * l.rx);
      seen++;
      if (best > worst) worst = best;
      if (best > 0.25) off++;
    }
  }
  if (off) failed++;
  console.log((off ? 'FAIL' : 'PASS').padEnd(5), label.padEnd(24), '|', off, 'of', seen, 'arcs drawn more than 0.25 units from the lobe edge | largest offset', worst.toFixed(3));
}
run('sway on, phase 0 to 8', { sway: 1 }, 'phase', 0, 8);
run('growth 0.02 to 1', {}, 'growth', 0.02, 1);
run('lobe size 20 to 40', {}, 'lobe', 20, 40);

process.exit(failed ? 1 : 0);
