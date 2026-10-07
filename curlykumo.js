/*
 * curlykumo.js: procedural generator for one hanafuda-style cloud (kumo).
 * No dependencies. Browser global `CurlyKumo`, or `require('./curlykumo.js')` in Node.
 * Version 2.3.0. MIT License. Copyright (c) 2026 Aya Walraven.
 *
 *   const frame = CurlyKumo.generate({ seed: 34, growth: 0.6 });
 *   frame.masses      -> back-to-front list; each has `outline` (closed path) and `curls` (open paths)
 *   frame.silhouette  -> every mass outline in one path string (the whole cloud shape)
 *   frame.bounds      -> { x, y, width, height }
 *
 * Output is geometry only (SVG path data). The caller chooses stroke width, colours and so on.
 * `CurlyKumo.toSVG` and `CurlyKumo.draw` are optional helpers that apply a style you pass in.
 * In a browser the file also defines the <curly-kumo> HTML tag (see the comment above defineElement).
 *
 * Model
 *   cloud = 1 to 5 masses that overlap; later masses sit in front of earlier ones
 *   mass  = a ring of circular lobes around a thin guide ellipse; its outline is the outer
 *           boundary of those lobes, traced as one closed path
 *   curl  = a spiral that starts at a cusp of its mass outline and winds into its own lobe
 *   growth: the first mass appears and lengthens by adding lobes at fixed growth points;
 *           further masses emerge from its edge, from zero size
 *
 * Guarantees
 *   - Same parameters give the same output (the seed fixes which lobes and masses exist).
 *   - A small change in any numeric parameter gives a small change in the shape, so every
 *     parameter can be animated. Nothing is re-drawn at random between frames.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CurlyKumo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };   // smoothstep

  const DEFAULTS = {
    seed: 34,          // integer; fixes the identity of the cloud
    growth: 1,         // 0 = nothing, 1 = fully grown
    lobe: 26,          // mean lobe radius in output units; every length scales with it
    sizeVar: 0.6,      // lobe size variation, 0..0.8
    overlap: 0.28,     // neighbour overlap, 0.15..0.4 (higher = shallower cusps)
    squash: 0.7,       // vertical squash, 0.45..1 (1 = round lobes)
    thickness: 1.15,   // half-thickness of a mass in lobe radii, 0.9..1.8 (low keeps curls reaching the middle)
    length: 9,         // lobes in the first mass at full growth, 4..16
    masses: 4,         // masses at full growth, 1..5 (fractional values are allowed)
    spread: 0.5,       // how far a new mass sits outside the mass it emerges from, 0..1.2
    irregularity: 0.12,// unevenness of each mass body, 0..0.3
    curl: 1,           // share of eligible lobes that carry a spiral, 0..1
    turns: 1,          // mean spiral length in turns, 0.3..1.8
    tight: 0.2,        // spiral decay per radian, 0.1..0.4 (higher = smaller spiral)
    curlVar: 0.6,      // variation of spiral length and tightness between lobes, 0..1
    sway: 0,           // amount of idle variation, 0..1 (0 = none)
    phase: 0,          // position in the idle variation; advance it slowly over time
  };

  const MAX_MASSES = 5, LOBES_PER_MASS = 40, BIG_SHARE = 0.35;

  /* Seeded PRNG (mulberry32). */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Everything random about a cloud, drawn once per seed. Parameters never re-draw it. */
  const cache = new Map();
  function identity(seed) {
    seed = Math.round(Number(seed)) || 0;
    if (cache.has(seed)) return cache.get(seed);
    const R = rng(seed), X = rng((seed ^ 0x9e3779b9) >>> 0), masses = [];
    const base = R() * TAU;
    for (let j = 0; j <= MAX_MASSES; j++) {
      const m = {
        j,
        parent: j === 0 ? -1 : (R() < 0.7 ? 0 : Math.floor(R() * j)),   // the mass it emerges from
        alpha: base + j * TAU * 0.382 + (R() - 0.5) * 0.9,               // where on the parent it emerges
        q0: j === 0 ? 1.7 + 0.6 * R() : 1.2 + 0.5 * R(),                 // starting length : thickness
        lobeRel: j === 0 ? 1 : 0.7 + 0.35 * R(),
        lenRel: j === 0 ? 1 : 0.45 + 0.35 * R(),
        ph: [R() * TAU, R() * TAU],
        start: R(),
        spare: R(),
        lobes: [],
      };
      for (let k = 0; k < LOBES_PER_MASS; k++) {
        // k = birth rank. Ranks 0 and 1 are the two separator lobes; they are always present and carry no curl.
        // Later lobes join one of two sectors on the S side or the E side of that sector's growth point.
        const side = k < 2 ? 'N' : (R() < 0.5 ? 'S' : 'E');
        m.lobes.push({ k, sector: k % 2, side, big: R(), w: R(), turns: R(), kk: R(), curlAt: X(), swayPh: X() * TAU, swayRate: 0.6 + 0.8 * X() });
      }
      masses.push(m);
    }
    const id = { masses };
    if (cache.size > 256) cache.clear();
    cache.set(seed, id);
    return id;
  }

  /* Perimeter of an ellipse with semi-axes q and 1 (Ramanujan). */
  const ellPer = (q) => Math.PI * (3 * (q + 1) - Math.sqrt((3 * q + 1) * (q + 3)));

  /* Lobes of one mass in its own coordinates (origin at the mass centre, before squash). */
  function massGeom(m, gj, presence, p) {
    const rb = p.lobe * m.lobeRel, ov = clamp(p.overlap, 0.15, 0.4);
    const nCap = Math.max(4, p.length * m.lenRel), n = 2.6 + (nCap - 2.6) * gj;
    const emerge = sm(gj * 4) * presence;
    const alive = m.lobes.map((L) => ({ L, mat: L.k < 2 ? 1 : sm((n - L.k) / 1.5) })).filter((o) => o.mat > 0);

    // ring order: separator, S lobes oldest first, E lobes youngest first, separator, ...
    // New lobes therefore always appear between the S block and the E block of a sector.
    const order = [];
    for (let s = 0; s < 2; s++) {
      order.push(alive[s]);
      const mine = alive.filter((o) => o.L.k >= 2 && o.L.sector === s);
      mine.filter((o) => o.L.side === 'S').sort((a, b) => a.L.k - b.L.k).forEach((o) => order.push(o));
      mine.filter((o) => o.L.side === 'E').sort((a, b) => b.L.k - a.L.k).forEach((o) => order.push(o));
    }
    const sv = clamp(p.sizeVar, 0, 0.8), sway = clamp(p.sway, 0, 1);
    let sum = 0;
    for (const o of order) {
      const L = o.L;
      let W = L.big > 1 - BIG_SHARE ? 1 + sv * (0.4 + 0.6 * L.w) : 1 - sv * 0.5 * L.w;
      if (sway > 0) W *= 1 + 0.22 * sway * Math.sin(p.phase * L.swayRate + L.swayPh);
      o.w = W * o.mat * emerge;
      sum += o.w;
    }
    // each lobe takes a share of the guide perimeter in proportion to its weight
    const per = sum * 2 * rb * (1 - ov);
    let q = m.q0, B = per / ellPer(q);
    const Bmax = clamp(p.thickness, 0.6, 3) * rb * emerge;
    if (B > Bmax && Bmax > 0) {   // too thick: keep the thickness and lengthen the mass instead
      let lo = q, hi = 60;
      for (let it = 0; it < 32; it++) { const mid = (lo + hi) / 2; if (Bmax * ellPer(mid) < per) lo = mid; else hi = mid; }
      q = (lo + hi) / 2; B = Bmax;
    }
    const A = q * B, M = 200, gx = [], gy = [], cum = [0];
    const irr = clamp(p.irregularity, 0, 0.3), wob = sway > 0 ? p.phase * 0.35 * sway : 0;
    for (let i = 0; i <= M; i++) {
      const t = (i / M) * TAU;
      const k = 1 + irr * (0.5 * Math.sin(2 * t + m.ph[0] + wob) + 0.4 * Math.sin(3 * t + m.ph[1] - wob));
      gx.push(A * k * Math.cos(t)); gy.push(B * k * Math.sin(t));
      if (i) cum.push(cum[i - 1] + Math.hypot(gx[i] - gx[i - 1], gy[i] - gy[i - 1]));
    }
    const gper = cum[M] || 1;
    const at = (s) => {
      s = mod(s, 1) * gper;
      let i = 1;
      while (i < M && cum[i] < s) i++;
      const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      return [gx[i - 1] + (gx[i] - gx[i - 1]) * t, gy[i - 1] + (gy[i] - gy[i - 1]) * t];
    };
    let s = m.start;
    for (const o of order) {
      const share = sum ? o.w / sum : 0, c = at(s + share / 2);
      o.x = c[0]; o.y = c[1]; o.r = o.w * rb;
      s += share;
    }
    return { order, B, at, emerge };
  }

  /* Outer boundary of a union of discs, as a loop of arcs { i, a0, a1 } with a1 > a0. */
  function unionOuter(discs) {
    const arcs = [];
    let rmax = 0;
    discs.forEach((a, i) => {
      if (!(a.r > 0)) return;
      rmax = Math.max(rmax, a.r);
      const iv = [];
      let dead = false;
      discs.forEach((b, j) => {
        if (i === j || dead || !(b.r > 0)) return;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= a.r + b.r) return;                 // apart
        if (d + a.r <= b.r) { dead = true; return; } // a is inside b
        if (d + b.r <= a.r) return;                 // b is inside a
        const c = Math.atan2(dy, dx), h = Math.acos(clamp((d * d + a.r * a.r - b.r * b.r) / (2 * d * a.r), -1, 1));
        const st = mod(c - h, TAU);
        iv.push([st, st + 2 * h, j]);
      });
      if (dead) return;
      if (!iv.length) { arcs.push({ i, a0: 0, a1: TAU, into: i, full: true }); return; }
      iv.sort((u, v) => u[0] - v[0]);
      const all = iv.map((v) => [v[0] - TAU, v[1] - TAU, v[2]]).concat(iv, iv.map((v) => [v[0] + TAU, v[1] + TAU, v[2]]));
      const merged = [];
      for (const v of all) {
        const last = merged[merged.length - 1];
        if (last && v[0] <= last[1] + 1e-9) { if (v[1] > last[1]) last[1] = v[1]; } else merged.push([v[0], v[1], v[2]]);
      }
      for (let t = 0; t + 1 < merged.length; t++) {
        const g0 = merged[t][1], g1 = merged[t + 1][0];
        if (g0 >= 0 && g0 < TAU && g1 - g0 > 1e-7) arcs.push({ i, a0: g0, a1: g1, into: merged[t + 1][2] });
      }
    });
    const P = (arc, ang) => { const d = discs[arc.i]; return [d.x + d.r * Math.cos(ang), d.y + d.r * Math.sin(ang)]; };
    const tol = Math.max(1e-6, rmax * 0.02), loops = [], used = new Set();
    for (let s = 0; s < arcs.length; s++) {
      if (used.has(s)) continue;
      const loop = [];
      let cur = s;
      while (cur >= 0 && !used.has(cur)) {
        used.add(cur); loop.push(arcs[cur]);
        if (arcs[cur].full) break;
        const e = P(arcs[cur], arcs[cur].a1);
        let best = -1, bd = Infinity;
        for (let t = 0; t < arcs.length; t++) {
          if (arcs[t].i !== arcs[cur].into) continue;
          const q = P(arcs[t], arcs[t].a0), dd = Math.hypot(q[0] - e[0], q[1] - e[1]);
          if (dd < bd) { bd = dd; best = t; }
        }
        cur = bd < tol ? best : -1;
      }
      loops.push(loop);
    }
    let outer = [], bestSpan = -1;
    for (const loop of loops) {
      let x0 = Infinity, x1 = -Infinity;
      for (const a of loop) for (const ang of [a.a0, (a.a0 + a.a1) / 2, a.a1]) { const q = P(a, ang); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); }
      if (x1 - x0 > bestSpan) { bestSpan = x1 - x0; outer = loop; }
    }
    return outer;
  }

  function generate(opts) {
    const p = Object.assign({}, DEFAULTS, opts);
    const id = identity(p.seed);
    const g = clamp(p.growth, 0, 1), nm = clamp(p.masses, 1, MAX_MASSES), sq = clamp(p.squash, 0.2, 1);
    const dec = p.lobe < 12 ? 1000 : 100;
    const f = (v) => String(Math.round(v * dec) / dec);
    const pt = (x, y) => f(x) + ' ' + f(y * sq);

    // place the masses; each later mass is centred on the edge of the mass it emerges from
    const placed = [];
    for (let j = 0; j < Math.min(MAX_MASSES, Math.ceil(nm)); j++) {
      const m = id.masses[j];
      const born = j === 0 ? 0 : 0.18 + (0.62 * (j - 1)) / Math.max(1, nm - 1);
      const gj = clamp((g - born) / (j === 0 ? 0.7 : 0.38), 0, 1);
      const presence = j === 0 ? 1 : sm(nm - j);
      if (gj <= 0 || presence <= 0) continue;
      const geo = massGeom(m, gj, presence, p);
      let cx = 0, cy = 0;
      if (m.parent >= 0) {
        const par = placed.find((o) => o.j === m.parent) || placed[0];
        const q = par.geo.at(m.alpha / TAU), len = Math.hypot(q[0], q[1]) || 1;
        cx = par.cx + q[0] + (q[0] / len) * geo.B * p.spread;
        cy = par.cy + q[1] + (q[1] / len) * geo.B * p.spread;
      }
      placed.push({ j, geo, cx, cy });
    }

    const masses = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, silhouette = '';
    const cv = clamp(p.curlVar, 0, 1);
    for (const ms of placed) {
      const discs = ms.geo.order.map((o) => ({ x: ms.cx + o.x, y: ms.cy + o.y, r: o.r, o }));
      const loop = unionOuter(discs);
      if (!loop.length) continue;
      const on = (a, ang) => { const d = discs[a.i]; return pt(d.x + d.r * Math.cos(ang), d.y + d.r * Math.sin(ang)); };

      let outline = 'M' + on(loop[0], loop[0].a0);
      for (const a of loop) {
        const r = discs[a.i].r, rr = f(r) + ' ' + f(r * sq);
        // Emit each arc in pieces of at most a quarter turn. A browser rebuilds an arc from its rounded
        // end points; for a long arc that rebuild is unstable and the lobe visibly twitches.
        const a0 = a.full ? 0 : a.a0, span = a.full ? TAU : a.a1 - a.a0, pieces = Math.max(1, Math.ceil(span / (Math.PI / 2) - 1e-9));
        for (let t = 1; t <= pieces; t++) outline += `A${rr} 0 0 1 ${on(a, a0 + (span * t) / pieces)}`;
      }
      outline += 'Z';

      // one curl per eligible lobe, starting where that lobe's outline arc ends on its own side
      const byDisc = new Map();
      for (const a of loop) { if (!byDisc.has(a.i)) byDisc.set(a.i, []); byDisc.get(a.i).push(a); }
      const curls = [], nd = discs.length;
      byDisc.forEach((list, i) => {
        const d = discs[i], L = d.o.L;
        if (L.side === 'N' || list[0].full) return;
        // Pick the outline arc of this lobe that ends at the cusp with its older ring neighbour.
        // If that cusp is covered by a third lobe, take the arc that ends nearest to where it would be.
        const nb = discs[L.side === 'E' ? (i + 1) % nd : (i - 1 + nd) % nd];
        const dn = Math.hypot(nb.x - d.x, nb.y - d.y);
        let a = list[0];
        if (list.length > 1) {
          if (nb.r > 0 && dn < d.r + nb.r && dn > Math.abs(d.r - nb.r)) {
            const c = Math.atan2(nb.y - d.y, nb.x - d.x), h = Math.acos(clamp((dn * dn + d.r * d.r - nb.r * nb.r) / (2 * dn * d.r), -1, 1));
            const target = L.side === 'E' ? c - h : c + h;
            let best = Infinity;
            for (const arc of list) { const off = Math.abs(mod((L.side === 'E' ? arc.a1 : arc.a0) - target + Math.PI, TAU) - Math.PI); if (off < best) { best = off; a = arc; } }
          } else for (const arc of list) if (arc.a1 - arc.a0 > a.a1 - a.a0) a = arc;
        }
        const want = sm((p.curl * 1.15 - L.curlAt) / 0.15);
        const exposed = sm((a.a1 - a.a0) / 1.1);
        const phi = TAU * p.turns * (1 + cv * 1.5 * (L.turns - 0.5)) * exposed * d.o.mat * d.o.mat * want;
        if (!(phi > 0.05)) return;
        const kk = p.tight * (1 + cv * (5 / 6) * (L.kk - 0.5));
        const a0 = L.side === 'E' ? a.a1 : a.a0, sg = L.side === 'E' ? 1 : -1;
        const at = (ph) => { const rr = d.r * Math.exp(-kk * ph); return [d.x + rr * Math.cos(a0 + sg * ph), d.y + rr * Math.sin(a0 + sg * ph)]; };
        // A curl is hidden where it passes under a younger lobe of the same mass, so curls never cross.
        const front = discs.filter((o) => o.o.L.k > L.k && o.r > 0 && Math.hypot(o.x - d.x, o.y - d.y) < o.r + d.r);
        const hidden = (ph) => { const q = at(ph); for (const o of front) if (Math.hypot(q[0] - o.x, q[1] - o.y) < o.r) return true; return false; };
        const edge = (lo, hi, loHidden) => { for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (hidden(mid) === loHidden) lo = mid; else hi = mid; } return (lo + hi) / 2; };
        const fine = Math.max(4, Math.ceil(phi / 0.04)), runs = [];
        let open = null, prevPh = 0, prevHid = front.length ? hidden(0.002) : false;
        if (!prevHid) open = 0;
        for (let t = 1; t <= fine; t++) {
          const ph = (phi * t) / fine, hid = front.length ? hidden(ph) : false;
          if (hid !== prevHid) {
            const e = edge(prevPh, ph, prevHid);
            if (hid) { runs.push([open, e]); open = null; } else open = e;
          }
          prevPh = ph; prevHid = hid;
        }
        if (open !== null) runs.push([open, phi]);
        for (const run of runs) {
          const span = run[1] - run[0];
          if (span * d.r * Math.exp(-kk * run[0]) < 0.06 * p.lobe && run[0] > 0) continue;
          const N = Math.max(2, Math.ceil(span / 0.16)), q = [];
          for (let t = 0; t <= N; t++) q.push(at(run[0] + (span * t) / N));
          let s = 'M' + pt(q[0][0], q[0][1]) + 'L' + pt((q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2);
          for (let t = 1; t < N; t++) s += `Q${pt(q[t][0], q[t][1])} ${pt((q[t][0] + q[t + 1][0]) / 2, (q[t][1] + q[t + 1][1]) / 2)}`;
          curls.push({ d: s + 'L' + pt(q[N][0], q[N][1]), lobe: L.k, from: run[0] });
        }
      });
      curls.sort((u, v) => u.lobe - v.lobe || u.from - v.from);

      const lobes = [];
      for (const d of discs) {
        if (!(d.r > 0)) continue;
        lobes.push({ id: d.o.L.k, x: d.x, y: d.y * sq, rx: d.r, ry: d.r * sq });
        x0 = Math.min(x0, d.x - d.r); x1 = Math.max(x1, d.x + d.r);
        y0 = Math.min(y0, (d.y - d.r) * sq); y1 = Math.max(y1, (d.y + d.r) * sq);
      }
      silhouette += outline;
      masses.push({ id: ms.j, presence: ms.geo.emerge, outline, curls: curls.map((c) => c.d), curlLobes: curls.map((c) => c.lobe), lobes });
    }
    const bounds = masses.length ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : { x: 0, y: 0, width: 0, height: 0 };
    return { params: p, masses, silhouette, bounds };
  }

  /*
   * Optional helper: SVG markup for a frame with the caller's style.
   *   fill, stroke         colours
   *   strokeWidth          line width in the same units as the geometry
   *   margin               how far the fill extends past the outline (0 = none)
   *   nonScalingStroke     true keeps line widths constant on screen when the SVG is scaled
   * The line width is the same for every mass at every growth value.
   */
  function toSVG(frame, style) {
    const st = Object.assign({ fill: '#dd3a2c', stroke: '#1a1210', strokeWidth: 2.4, margin: 3.2, nonScalingStroke: false }, style);
    if (!frame.masses.length) return '';
    const ve = st.nonScalingStroke ? ' vector-effect="non-scaling-stroke"' : '';
    let out = '<g class="curlykumo">';
    if (st.margin > 0) out += `<path class="curlykumo-margin" d="${frame.silhouette}" fill="${st.fill}" stroke="${st.fill}" stroke-width="${st.margin * 2}" stroke-linejoin="round"${ve}/>`;
    for (const m of frame.masses) {
      out += `<g class="curlykumo-mass" data-mass="${m.id}"><path d="${m.outline}" fill="${st.fill}"/>`;
      out += `<g fill="none" stroke="${st.stroke}" stroke-width="${st.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="${m.outline}"${ve}/>`;
      for (const d of m.curls) out += `<path d="${d}"${ve}/>`;
      out += '</g></g>';
    }
    return out + '</g>';
  }

  /* Optional helper: draw a frame on a canvas 2D context with the caller's style. */
  function draw(ctx, frame, style) {
    const st = Object.assign({ fill: '#dd3a2c', stroke: '#1a1210', strokeWidth: 2.4, margin: 3.2 }, style);
    if (!frame.masses.length) return;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (st.margin > 0) { const s = new Path2D(frame.silhouette); ctx.fillStyle = st.fill; ctx.strokeStyle = st.fill; ctx.lineWidth = st.margin * 2; ctx.fill(s); ctx.stroke(s); }
    for (const m of frame.masses) {
      const o = new Path2D(m.outline);
      ctx.fillStyle = st.fill; ctx.fill(o);
      ctx.strokeStyle = st.stroke; ctx.lineWidth = st.strokeWidth;
      ctx.stroke(o);
      for (const d of m.curls) ctx.stroke(new Path2D(d));
    }
    ctx.restore();
  }

  /*
   * <curly-kumo>: an HTML tag that places one cloud and animates its growth. Browser only.
   *
   *   <curly-kumo seed="34" enter="grow-in" leave="grow-out" duration="1.5s"></curly-kumo>
   *
   * Growth on the tag runs from 0 to 100. Three ways to drive it:
   *   timed     grow="in" | grow="out", or cloud.growIn(), cloud.growOut(), cloud.growTo(60)
   *   fed       cloud.growth = 37 (or the growth attribute); the cloud follows each new value
   *   scroll    enter="grow-in" leave="grow-out" (timed, when it scrolls into or out of view),
   *             or the scroll-link attribute (growth follows the scroll position)
   * Every driver only sets a target. The cloud moves toward it from its current value, so a
   * change of direction never causes a jump.
   * The tag reserves the box of the fully grown cloud, so the page layout does not shift.
   */
  function defineElement() {
    if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined' || customElements.get('curly-kumo')) return;
    const PARAMS = { seed: 'seed', lobe: 'lobe', 'size-var': 'sizeVar', overlap: 'overlap', squash: 'squash', thickness: 'thickness', length: 'length',
      masses: 'masses', spread: 'spread', irregularity: 'irregularity', curl: 'curl', turns: 'turns', tight: 'tight', 'curl-var': 'curlVar', sway: 'sway' };
    const EASE = {
      linear: (t) => t,
      'ease-in': (t) => t * t,
      'ease-out': (t) => 1 - (1 - t) * (1 - t),
      'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    };
    const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
    const seconds = (v, d) => { if (v == null || v === '') return d; const n = parseFloat(v); return isFinite(n) ? (/ms\s*$/.test(String(v)) ? n / 1000 : n) : d; };

    class CurlyKumoElement extends HTMLElement {
      static get observedAttributes() {
        return Object.keys(PARAMS).concat(['fill', 'stroke', 'stroke-width', 'margin', 'non-scaling-stroke', 'growth', 'grow', 'scroll-link', 'scroll-from', 'scroll-to']);
      }
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = '<style>:host{display:block}svg{display:block;width:100%;height:auto;overflow:visible}</style>' +
          '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cloud"><g></g></svg>';
        this._svg = root.querySelector('svg'); this._g = root.querySelector('g');
        this._extra = {}; this._styleExtra = {};
        this._value = 100; this._target = 100; this._tween = null; this._phase = 0;
        this._raf = 0; this._last = 0; this._ready = false; this._visible = true; this._inView = undefined; this._dirty = false; this._grown = false;
        this._tick = this._tick.bind(this);
      }

      connectedCallback() {
        this._reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const grow = this.getAttribute('grow'), enterIn = this.getAttribute('enter') === 'grow-in';
        // starting value; with reduced motion the cloud is shown fully grown instead of animating in
        if (this.hasAttribute('scroll-link') || grow === 'in' || enterIn) this._value = this._reduced ? 100 : 0;
        else if (grow !== 'out' && this.hasAttribute('growth')) this._value = clamp(num(this.getAttribute('growth'), 100), 0, 100);
        else if (grow !== 'out' && this._preset) this._value = this._target;   // growth was assigned from JavaScript before the tag was placed
        else this._value = 100;
        this._target = this._value;
        this._ready = true;
        this._layout(); this._paint();
        this._root = null;
        for (let n = this.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
          const o = getComputedStyle(n).overflowY;
          if (o === 'auto' || o === 'scroll') { this._root = n; break; }
        }
        if (typeof IntersectionObserver !== 'undefined') {
          const steps = []; for (let i = 0; i <= 20; i++) steps.push(i / 20);
          this._io = new IntersectionObserver((e) => this._seen(e), { root: this._root, threshold: steps });
          this._io.observe(this);
        } else this._seen([{ isIntersecting: true, full: true }]);
        if (grow === 'in') this.growIn(); else if (grow === 'out') this.growOut();
        this._loop();
      }
      disconnectedCallback() {
        if (this._io) this._io.disconnect();
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0; this._last = 0; this._ready = false; this._inView = undefined; this._endTween(false);
      }
      attributeChangedCallback(name, was, now) {
        if (!this._ready || was === now) return;
        if (name === 'growth') { if (now !== null) this.growth = now; }
        else if (name === 'grow') { if (now === 'in') this.growIn(); else if (now === 'out') this.growOut(); }
        else if (name === 'scroll-link' || name === 'scroll-from' || name === 'scroll-to') this._loop();
        else { this._layout(); this._paint(); }
      }

      /* Timed growth. Each returns a promise: true when the value is reached, false if another call replaced it. */
      growIn(options) { return this.growTo(100, options); }
      growOut(options) { return this.growTo(0, options); }
      growTo(value, options) {
        const v = clamp(num(value, 0), 0, 100), o = options || {};
        const full = seconds(o.duration != null ? o.duration : this.getAttribute('duration'), 1.5);
        const ease = EASE[o.easing || this.getAttribute('easing')] || EASE['ease-in-out'];
        this._endTween(false);
        this._target = v;
        return new Promise((resolve) => {
          const time = (full * Math.abs(v - this._value)) / 100;   // a shorter distance takes proportionally less time
          if (!this._ready || this._reduced || time < 0.001) { this._value = v; this._paint(); this._arrive(); resolve(true); return; }
          this._tween = { from: this._value, to: v, start: null, time: Math.max(0.12, time), ease, resolve };
          this._loop();
        });
      }
      /* Fed growth. Assign a number from 0 to 100 as often as needed; the cloud follows it. */
      get growth() { return this._target; }
      set growth(v) {
        this._endTween(false);
        this._target = clamp(num(v, 0), 0, 100);
        if (!this._ready) { this._value = this._target; this._preset = true; }
        this._loop();
      }
      /* The growth value currently drawn, 0 to 100. */
      get value() { return this._value; }
      /* Generator parameters and style from JavaScript; these take priority over attributes. */
      setParams(params) { Object.assign(this._extra, params); if (this._ready) { this._layout(); this._paint(); this._loop(); } }
      setStyle(style) { Object.assign(this._styleExtra, style); if (this._ready) { this._layout(); this._paint(); } }

      _params() {
        const p = {};
        for (const k in PARAMS) if (this.hasAttribute(k)) { const n = num(this.getAttribute(k), NaN); if (isFinite(n)) p[PARAMS[k]] = n; }
        return Object.assign(p, this._extra);
      }
      _style() {
        const st = { fill: '#dd3a2c', stroke: '#1a1210', strokeWidth: 2.4, margin: 3.2, nonScalingStroke: this.hasAttribute('non-scaling-stroke') };
        if (this.hasAttribute('fill')) st.fill = this.getAttribute('fill');
        if (this.hasAttribute('stroke')) st.stroke = this.getAttribute('stroke');
        st.strokeWidth = num(this.getAttribute('stroke-width'), st.strokeWidth);
        st.margin = num(this.getAttribute('margin'), st.margin);
        return Object.assign(st, this._styleExtra);
      }
      _layout() {
        const p = this._params(), st = this._style();
        const b = generate(Object.assign({}, p, { growth: 1 })).bounds;
        const pad = st.margin + st.strokeWidth + 2 + b.width * (p.sway > 0 ? 0.08 : 0.02);
        this._svg.setAttribute('viewBox', [b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad].map((v) => Math.round(v * 10) / 10).join(' '));
      }
      _paint() {
        if (!this._ready) return;
        if (!this._visible) { this._dirty = true; return; }   // nothing is drawn while the tag is off screen
        this._dirty = false;
        const p = Object.assign(this._params(), { growth: this._value / 100, phase: this._phase });
        this._g.innerHTML = toSVG(generate(p), this._style());
      }
      _fire(type) { this.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { growth: this._value, target: this._target } })); }
      _arrive() { this._fire('curlykumo-growend'); }
      _endTween(done) { const t = this._tween; if (t) { this._tween = null; t.resolve(done); } }

      _seen(entries) {
        const e = entries[entries.length - 1];
        let share = 1;
        if (!e.full) {
          const rw = e.rootBounds ? e.rootBounds.width : window.innerWidth, rh = e.rootBounds ? e.rootBounds.height : window.innerHeight;
          const w = Math.min(e.boundingClientRect.width, rw), h = Math.min(e.boundingClientRect.height, rh);
          share = w > 0 && h > 0 ? (e.intersectionRect.width * e.intersectionRect.height) / (w * h) : 0;
        }
        const wasVisible = this._visible;
        this._visible = !!e.isIntersecting;
        if (this._visible && !wasVisible && this._dirty) this._paint();
        const inView = this._visible && share >= clamp(num(this.getAttribute('threshold'), 0.5), 0.01, 1) - 1e-6;
        if (inView !== this._inView) {
          const first = this._inView === undefined;
          this._inView = inView;
          if (inView) { this._fire('curlykumo-enter'); this._act(this.getAttribute('enter')); }
          else if (!first) { this._fire('curlykumo-leave'); this._act(this.getAttribute('leave')); }
        }
        this._loop();
      }
      _act(what) {
        if (this._reduced || (this.hasAttribute('once') && this._grown)) return;
        if (what === 'grow-in') { this._grown = true; this.growIn(); }
        else if (what === 'grow-out') this.growOut();
      }
      _scrollTarget() {
        const r = this.getBoundingClientRect();
        const top = this._root ? this._root.getBoundingClientRect().top : 0, height = this._root ? this._root.clientHeight : window.innerHeight;
        if (!(height > 0)) return null;
        const from = num(this.getAttribute('scroll-from'), 1), to = num(this.getAttribute('scroll-to'), 0.5);
        if (from === to) return null;
        return clamp((from - (r.top + r.height / 2 - top) / height) / (from - to), 0, 1) * 100;
      }
      _wants() {
        const link = this.hasAttribute('scroll-link') && !this._reduced;
        const sway = !this._reduced && this._visible && this._params().sway > 0;
        return { link, sway, any: !!this._tween || this._value !== this._target || (link && this._visible) || sway };
      }
      _loop() {
        if (this._raf || !this._ready) return;
        if (this._wants().any) this._raf = requestAnimationFrame(this._tick); else this._last = 0;
      }
      _tick(ts) {
        this._raf = 0;
        const dt = this._last ? Math.min(0.1, (ts - this._last) / 1000) : 0;
        this._last = ts;
        const w = this._wants();
        let changed = false;
        if (w.link && this._visible && !this._tween) { const t = this._scrollTarget(); if (t !== null) this._target = t; }
        if (this._tween) {
          const tw = this._tween;
          if (tw.start === null) tw.start = ts;
          const k = clamp((ts - tw.start) / 1000 / tw.time, 0, 1);
          this._value = k >= 1 ? tw.to : tw.from + (tw.to - tw.from) * tw.ease(k);
          changed = true;
          if (k >= 1) { this._endTween(true); this._arrive(); }
        } else if (this._value !== this._target) {
          const tau = seconds(this.getAttribute('smoothing'), w.link ? 0.12 : 0.25) / 3, d = this._target - this._value;
          this._value = this._reduced || tau <= 0 || Math.abs(d) < 0.05 ? this._target : this._value + d * (1 - Math.exp(-dt / tau));
          changed = true;
          if (this._value === this._target) this._arrive();
        }
        if (w.sway) { this._phase += dt * num(this.getAttribute('sway-speed'), 0.9); changed = true; }
        if (changed) this._paint();
        this._loop();
      }
    }
    customElements.define('curly-kumo', CurlyKumoElement);
  }
  defineElement();

  return { DEFAULTS, generate, toSVG, draw, defineElement, version: '2.3.0' };
});
