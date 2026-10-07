// Renders docs/preview.png for the README: one seed at four growth values, and four other seeds.
// Needs Playwright:  npm install  then  npx playwright install chromium
// Run:  node tools/render-preview.js
const path = require('path');
const { chromium } = require('playwright');
const CurlyKumo = require(path.join(__dirname, '..', 'curlykumo.js'));

const cell = (seed, growth, label) =>
  `<figure><svg viewBox="-185 -110 370 220" width="240" height="143">${CurlyKumo.toSVG(CurlyKumo.generate({ seed, growth }))}</svg><figcaption>${label}</figcaption></figure>`;
const html = `<body><style>
body{margin:0;padding:20px 20px 12px;background:#fdfcf8;font:14px/1.3 Arial,Helvetica,sans-serif;color:#1a1210;width:1000px}
.row{display:flex;gap:8px;margin-bottom:10px}figure{margin:0;text-align:center}figcaption{font-size:13px;color:#5d596b}
</style>
<div class="row">${[0.1, 0.4, 0.7, 1].map((g) => cell(34, g, 'seed 34 · growth ' + g.toFixed(1))).join('')}</div>
<div class="row">${[8, 21, 5, 13].map((s) => cell(s, 1, 'seed ' + s)).join('')}</div>
</body>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1040, height: 300 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(__dirname, '..', 'docs', 'preview.png'), fullPage: true });
  await browser.close();
})();
