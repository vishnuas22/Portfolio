// Extensibility drill: append a 7th project (with intentionally missing photo
// + missing icon to simulate future user mistakes), verify the reel scales,
// then restore the original data. Idempotent: always rebuilds projects.js
// from the pristine baseline first. Usage: node tests/reel-drill.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const EXEC = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const FILE = 'projects.js';
const BASELINE = 'tests/projects.baseline.js';
const REEL = { start: 0.48, end: 0.86 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- always start from a pristine, single-dose state ---
let original = fs.readFileSync(BASELINE, 'utf8');
fs.writeFileSync(FILE, original);
if (fs.readFileSync(FILE, 'utf8').split('drilltest').length - 1 !== 0) {
  // baseline itself was polluted — hard reset
  original = original.replace(/,\n  \{\n    id: 'drilltest'[\s\S]*?\n  \}/, '');
  fs.writeFileSync(FILE, original);
}
console.log(`[drill pid=${process.pid}] file doses:`, fs.readFileSync(FILE, 'utf8').split('drilltest').length - 1);

const seventh = `
  {
    id: 'drilltest',
    title: 'Drill Test 7',
    subtitle: 'Extensibility Probe',
    period: 'The Future',
    hue: '#f28b82',
    blurb: 'A temporary probe proving the reel scales to any project count.',
    highlights: ['Scene seven exists', 'Fallbacks behave'],
    metrics: [{ value: 42, suffix: '%', label: 'Drill metric' }],
    skills: [
      { name: 'PyTorch', icon: 'pytorch.svg' },
      { name: 'Ghost Icon (typo)', icon: 'does-not-exist.svg' },
      { name: 'Glyph Only', glyph: '⌘', tint: '#8ab4f8' },
    ],
    image: 'missing-photo.png',
  }`;

fs.writeFileSync(FILE, original.replace('];\n\nfunction skillChip', seventh + '\n];\n\nfunction skillChip'));

const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: EXEC,
    headless: 'new',
    args: ['--hide-scrollbars'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
  await sleep(1200);

  const struct = await page.evaluate(() => {
    const stage = document.getElementById('stage-act2-5');
    return {
      scenes: stage.querySelectorAll('.reel-scene').length,
      dots: stage.querySelectorAll('.reel-dot').length,
      total: stage.querySelector('.reel-counter-total')?.textContent,
      titles: [...stage.querySelectorAll('.scene-title')].map((t) => t.textContent),
      tracks: document.querySelectorAll('.reel-track').length,
      projectsFetches: performance.getEntriesByType('resource').filter((r) => r.name.includes('projects.js')).length,
      probeN: window.__reelProbe ? window.__reelProbe().n : null,
      counterEls: document.querySelectorAll('.reel-counter-total').length,
      counterTexts: [...document.querySelectorAll('.reel-counter-cur, .reel-counter-total')].map((e) => e.textContent),
    };
  });
  console.log('[diag]', JSON.stringify(struct));
  if (pageErrors.length) console.log('[pageerrors]', pageErrors.slice(0, 3).join(' | '));
  check('7 scenes built from data alone', struct.scenes === 7, `got ${struct.scenes}`);
  check('7 dots built', struct.dots === 7, `got ${struct.dots}`);
  check('counter total = 07', struct.total === '07', struct.total);

  // jump to scene 7 via its dot, then WAIT for real convergence
  await page.evaluate(() => document.querySelectorAll('.reel-dot')[6].click());
  await page
    .waitForFunction(
      () => document.querySelector('.reel-counter-cur')?.textContent === '07' &&
        window.__reelProbe() && Math.abs(window.__reelProbe().pos - 6) < 0.02,
      { timeout: 9000, polling: 120 }
    )
    .catch(() => {});
  const s7 = await page.evaluate(() => {
    const stage = document.getElementById('stage-act2-5');
    const active = stage.querySelector('.reel-scene.is-active');
    const idx = [...stage.querySelectorAll('.reel-scene')].indexOf(active);
    return {
      idx,
      counter: stage.querySelector('.reel-counter-cur')?.textContent,
      title: active.querySelector('.scene-title')?.textContent,
      opacity: Number(getComputedStyle(active).opacity),
      fallback: !!active.querySelector('.still-fallback'),
      ghostChipOpacity: getComputedStyle(active.querySelectorAll('.mini-bead')[1]).opacity,
    };
  });
  check('scene 7 active via dot click', s7.idx === 6, `idx ${s7.idx}`);
  check('scene 7 counter = 07', s7.counter === '07', s7.counter);
  check('scene 7 title', s7.title === 'Drill Test 7', s7.title);
  check('scene 7 fully visible (no collapse)', s7.opacity > 0.95, `op ${s7.opacity}`);
  check('missing photo -> graceful fallback panel (not broken img)', s7.fallback);
  check('typo icon -> chip dims quietly (no broken img)', Number(s7.ghostChipOpacity) < 0.3, s7.ghostChipOpacity);

  // keyboard still works at the new last scene
  await page.keyboard.press('ArrowLeft');
  await page
    .waitForFunction(
      () => document.querySelector('.reel-counter-cur')?.textContent === '06',
      { timeout: 9000, polling: 120 }
    )
    .catch(() => {});
  await sleep(400);
  const back = await page.evaluate(() => document.querySelector('.reel-counter-cur')?.textContent);
  check('ArrowLeft from new last scene -> 06', back === '06', back);

  await page.screenshot({ path: '.reeltest/shots/09-seventh-project.png' });
} catch (err) {
  console.log('DRILL ERROR:', err.message);
  results.push(false);
} finally {
  if (browser) await browser.close();
  fs.writeFileSync(FILE, original); // restore real data
  console.log('projects.js restored to the 6 real projects');
}
const fails = results.filter((r) => !r).length;
console.log(`\n${results.length - fails}/${results.length} drill checks passed${fails ? ' — FAILURES' : ' — ALL GREEN'}`);
process.exit(fails ? 1 : 0);