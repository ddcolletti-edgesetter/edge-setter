const { chromium } = require('playwright');
const { writeFileSync, mkdirSync } = require('fs');

const BASE = 'http://localhost:5000';
const ROUTES = [
  { path: '/#/',             name: 'landing'     },
  { path: '/#/dashboard',   name: 'dashboard'   },
  { path: '/#/draft',       name: 'draftboard'  },
  { path: '/#/leaderboard', name: 'leaderboard' },
  { path: '/#/alerts',      name: 'alerts'      },
  { path: '/#/admin',       name: 'admin'       },
  { path: '/#/logs',        name: 'logs'        },
];

mkdirSync('/tmp/edge-qa', { recursive: true });

async function runViewport(browser, width, height, label, results) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  
  for (const route of ROUTES) {
    const url = `${BASE}${route.path}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(800);

    const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    const bgColor = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    
    const coolBgCheck = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      const cool = [];
      for (const el of all) {
        const bg = window.getComputedStyle(el).backgroundColor;
        const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (m) {
          const [, r, g, b] = m.map(Number);
          const lightness = (Math.max(r,g,b) + Math.min(r,g,b)) / 2;
          if (lightness < 80 && lightness > 5 && b > r + 15 && b > 20) {
            cool.push({ bg, tag: el.tagName, cls: (el.className||'').slice(0,60) });
            if (cool.length >= 3) break;
          }
        }
      }
      return cool;
    });
    
    await page.screenshot({ path: `/tmp/edge-qa/${label}-${route.name}.png`, fullPage: false });
    results.push({ viewport: label, page: route.name, hasDark, bgColor, coolViolations: coolBgCheck.length, coolDetails: coolBgCheck });
  }
  
  await ctx.close();
}

(async () => {
  const results = [];
  const browser = await chromium.launch();
  await runViewport(browser, 1440, 900, 'desktop', results);
  await runViewport(browser, 390,  844, 'mobile',  results);
  await browser.close();

  let pass = 0, fail = 0;
  console.log('\n=== EDGE SETTER — DARK + WARM PALETTE QA ===\n');
  for (const r of results) {
    const darkOk = r.hasDark ? '✓ DARK' : '✗ LIGHT';
    const warmOk = r.coolViolations === 0 ? '✓ WARM' : `✗ COOL(${r.coolViolations})`;
    const status = (r.hasDark && r.coolViolations === 0) ? 'PASS' : 'FAIL';
    if (status === 'PASS') pass++; else fail++;
    console.log(`[${status}] ${label_pad(r.viewport,8)} ${label_pad(r.page,12)} ${darkOk}  ${warmOk}  body-bg=${r.bgColor}`);
    if (r.coolDetails.length) r.coolDetails.forEach(d => console.log(`         COOL: ${d.bg} <${d.tag}> ${d.cls}`));
  }
  console.log(`\nResult: ${pass} PASS  ${fail} FAIL  (${results.length} checks)`);
  writeFileSync('/tmp/edge-qa/results.json', JSON.stringify(results, null, 2));
})();

function label_pad(s, n) { return (s + ' '.repeat(n)).slice(0,n); }
