// Browser tests for the <curly-kumo> tag. Needs Playwright:  npm install  then  npx playwright install chromium
// Run:  node test/tag.js
const path = require('path');
const { chromium } = require('playwright');
const url = 'file://' + path.resolve(__dirname, 'tag.html');
const results = [];
const ok = (name, pass, info) => { results.push(pass); console.log((pass ? 'PASS' : 'FAIL').padEnd(5), name, info !== undefined ? '| ' + info : ''); };

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const pg = await b.newPage({ viewport: { width: 900, height: 700 } });
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(url);
  await pg.waitForTimeout(300);

  // 1. the tag reserves the box of the fully grown cloud
  const boxes = await pg.evaluate(() => ['zero', 'full'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  ok('box at growth 0 equals box at growth 100', boxes[0][1] > 20 && boxes[0][0] === boxes[1][0] && boxes[0][1] === boxes[1][1], JSON.stringify(boxes));
  const drawn = await pg.evaluate(() => ['zero', 'full'].map((id) => document.getElementById(id).shadowRoot.querySelectorAll('path').length));
  ok('growth 0 draws nothing, growth 100 draws paths', drawn[0] === 0 && drawn[1] > 10, JSON.stringify(drawn));

  // 2. timed grow-in
  const timed = await pg.evaluate(async () => {
    const el = document.getElementById('timed'); let ended = 0;
    el.addEventListener('curlykumo-growend', (e) => { ended = e.detail.growth; });
    const t0 = performance.now(); const done = await el.growIn({ duration: 0.6 });
    return { done, ms: Math.round(performance.now() - t0), value: el.value, ended };
  });
  ok('growIn reaches 100 in the set duration and fires curlykumo-growend', timed.done === true && timed.value === 100 && timed.ended === 100 && Math.abs(timed.ms - 600) < 120, JSON.stringify(timed));

  // 3. reversing mid-way: no jump, first promise reports it was replaced
  const rev = await pg.evaluate(async () => {
    const el = document.getElementById('timed'); await el.growTo(0, { duration: 0.01 });
    const samples = []; let run = true;
    (function s() { samples.push(el.value); if (run) requestAnimationFrame(s); })();
    const first = el.growIn({ duration: 1 });
    await new Promise((r) => setTimeout(r, 450));
    const mid = el.value; const second = el.growOut({ duration: 1 });
    const a = await first, c = await second; run = false;
    let maxStep = 0; for (let i = 1; i < samples.length; i++) maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]));
    return { firstResolved: a, secondResolved: c, mid: Math.round(mid), end: el.value, maxStep: +maxStep.toFixed(2), peak: Math.round(Math.max(...samples)) };
  });
  ok('grow-out during grow-in reverses from the current value without a jump', rev.firstResolved === false && rev.secondResolved === true && rev.end === 0 && rev.maxStep < 6 && Math.abs(rev.peak - rev.mid) < 6, JSON.stringify(rev));

  // 4. fed from JavaScript (progress updates)
  const fed = await pg.evaluate(async () => {
    const el = document.getElementById('fed'); const samples = []; let run = true, end = null;
    el.addEventListener('curlykumo-growend', (e) => { if (e.detail.growth === 100) end = performance.now(); });
    (function s() { samples.push(el.value); if (run) requestAnimationFrame(s); })();
    const t0 = performance.now();
    for (let p = 0; p <= 100; p += 4) { el.growth = p; await new Promise((r) => setTimeout(r, 40)); }
    const fedDone = performance.now();
    await new Promise((r) => setTimeout(r, 900)); run = false;
    let mono = true, maxStep = 0; for (let i = 1; i < samples.length; i++) { if (samples[i] < samples[i - 1] - 1e-9) mono = false; maxStep = Math.max(maxStep, samples[i] - samples[i - 1]); }
    return { mono, maxStep: +maxStep.toFixed(2), value: el.value, target: el.growth, lagMs: end ? Math.round(end - fedDone) : null };
  });
  ok('fed values 0 to 100: cloud follows, never goes backward, signals arrival at 100', fed.mono && fed.value === 100 && fed.target === 100 && fed.lagMs !== null && fed.maxStep < 8, JSON.stringify(fed));

  // 5. enter / leave inside a scrolling box
  const hook = await pg.evaluate(async () => {
    const el = document.getElementById('hook'), box = document.getElementById('box1'); const log = [];
    el.addEventListener('curlykumo-enter', () => log.push('enter')); el.addEventListener('curlykumo-leave', () => log.push('leave'));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const before = el.value;
    box.scrollTop = 600 - (300 - el.offsetHeight) / 2; await wait(900); const inside = el.value;
    box.scrollTop = 0; await wait(900); const after = el.value;
    return { before, inside, after, log };
  });
  ok('scroll box: grows in on entering view, grows out on leaving', hook.before === 0 && hook.inside === 100 && hook.after === 0 && hook.log.join() === 'enter,leave', JSON.stringify(hook));

  // 6. scroll-linked growth
  const link = await pg.evaluate(async () => {
    const el = document.getElementById('link'), box = document.getElementById('box2'); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const expect = () => { const r = el.getBoundingClientRect(), t = box.getBoundingClientRect().top; const c = (r.top + r.height / 2 - t) / box.clientHeight; return Math.max(0, Math.min(1, (1 - c) / 0.5)) * 100; };
    const out = [];
    for (const top of [380, 430, 480, 600, 430]) { box.scrollTop = top; await wait(700); const v1 = el.value; await wait(300); out.push({ top, value: +v1.toFixed(1), expected: +expect().toFixed(1), still: Math.abs(el.value - v1) < 0.01 }); }
    return out;
  });
  ok('scroll-link: growth matches scroll position and stops when scrolling stops', link.every((o) => Math.abs(o.value - o.expected) < 0.5 && o.still) && link[0].value < link[1].value && link[1].value < link[2].value, JSON.stringify(link.map((o) => [o.top, o.value, o.expected])));

  // 7. enter / leave with the window as the scroller, and no drawing while off screen
  const win = await pg.evaluate(async () => {
    const el = document.getElementById('win'); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let writes = 0; new MutationObserver((m) => { writes += m.length; }).observe(el.shadowRoot.querySelector('g'), { childList: true });
    const before = el.value;
    el.growTo(50, { duration: 0.3 }); await wait(500); const offscreenWrites = writes, offValue = el.value;
    el.growTo(0, { duration: 0.01 }); await wait(100);
    el.scrollIntoView({ block: 'center' }); await wait(900); const inside = el.value;
    window.scrollTo(0, 0); await wait(900);
    return { before, offscreenWrites, offValue, inside, after: el.value };
  });
  ok('window scroll: enter and leave work; nothing is drawn while off screen', win.before === 0 && win.offscreenWrites === 0 && win.offValue === 50 && win.inside === 100 && win.after === 0, JSON.stringify(win));

  // 8. attributes reach the generator and the style
  const attrs = await pg.evaluate(() => {
    const el = document.getElementById('full'); const g = el.shadowRoot.querySelector('g');
    const a = g.innerHTML.length; el.setAttribute('masses', '1'); const b2 = g.innerHTML.length;
    el.setAttribute('stroke-width', '5'); el.setAttribute('fill', '#3b3562');
    const sw = g.querySelector('g[stroke-width]').getAttribute('stroke-width'), fill = g.querySelector('path[fill]').getAttribute('fill');
    el.setParams({ masses: 3 }); const c = g.innerHTML.length;
    return { full: a, oneMass: b2, threeMasses: c, sw, fill };
  });
  ok('attributes and setParams change the cloud; style attributes are applied', attrs.oneMass < attrs.threeMasses && attrs.threeMasses < attrs.full && attrs.sw === '5' && attrs.fill === '#3b3562', JSON.stringify(attrs));
  await pg.close();

  // 9. reduced motion
  const rm = await b.newPage({ viewport: { width: 900, height: 700 }, reducedMotion: 'reduce' });
  await rm.goto(url); await rm.waitForTimeout(300);
  const red = await rm.evaluate(async () => {
    const hook = document.getElementById('hook'), link = document.getElementById('link'), t = document.getElementById('timed');
    const t0 = performance.now(); await t.growIn({ duration: 2 }); const ms = performance.now() - t0;
    return { hookShown: hook.value, linkShown: link.value, timedValue: t.value, timedMs: Math.round(ms) };
  });
  ok('reduced motion: clouds are shown grown and growIn completes at once', red.hookShown === 100 && red.linkShown === 100 && red.timedValue === 100 && red.timedMs < 50, JSON.stringify(red));

  console.log('\npage errors:', JSON.stringify(errs), '|', results.filter(Boolean).length + ' of ' + results.length + ' passed');
  await b.close();
  process.exit(errs.length || results.includes(false) ? 1 : 0);
})();
