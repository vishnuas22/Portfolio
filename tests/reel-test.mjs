// Visual + functional test for THE PROJECT REEL — usage: node tests/reel-test.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const EXEC = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const URL_ = 'http://localhost:5173/';
const SHOTS = '.reeltest/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const REEL = { start: 0.48, end: 0.86 };
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ---------- browser boot ----------
const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: 'new',
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const consoleErrors = [];
const failed404 = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('response', (r) => { if (r.status() === 404) failed404.push(r.url()); });

await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
await sleep(1500);

async function jumpTo(p) {
  await page.evaluate((prog) => {
    const hero = document.getElementById('hero');
    const wrap = document.getElementById('scroll-wrapper');
    const max = wrap.offsetHeight - window.innerHeight;
    window.__lenis.scrollTo(hero.offsetHeight + max * prog, { immediate: true });
  }, p);
  // poll until the whole chain (targetProgress -> currentProgress -> reel
  // displayPos) has converged, instead of guessing a fixed delay
  const expectedPos = ((p - REEL.start) / (REEL.end - REEL.start)) * 5;
  await page
    .waitForFunction(
      (exp) => {
        const pr = window.__progressProbe();
        const rp = window.__reelProbe ? window.__reelProbe() : { pos: -99 };
        return (
          Math.abs(pr.current - pr.target) < 0.002 &&
          Math.abs(rp.pos - exp) < 0.01
        );
      },
      { timeout: 6000, polling: 100 },
      expectedPos
    )
    .catch(() => {});
  const probe = await page.evaluate(() => ({
    ...window.__progressProbe(),
    reel: window.__reelProbe ? window.__reelProbe() : null,
  }));
  if (Math.abs(probe.reel.pos - expectedPos) > 0.01) {
    console.log(`  [probe] p=${p.toFixed(3)} target=${probe.target.toFixed(3)} current=${probe.current.toFixed(3)} reelPos=${probe.reel.pos.toFixed(3)} expected=${expectedPos.toFixed(3)}`);
  }
}

// ---------- structural ----------
const struct = await page.evaluate(() => {
  const stage = document.getElementById('stage-act2-5');
  return {
    sceneCount: stage.querySelectorAll('.reel-scene').length,
    dotCount: stage.querySelectorAll('.reel-dot').length,
    counterTotal: stage.querySelector('.reel-counter-total')?.textContent,
    stills: [...stage.querySelectorAll('.still-img')],
    beads: [...stage.querySelectorAll('.mini-bead img')],
  };
});
check('6 scenes built', struct.sceneCount === 6, `got ${struct.sceneCount}`);
check('6 dots built', struct.dotCount === 6, `got ${struct.dotCount}`);
check('counter total = 06', struct.counterTotal === '06', struct.counterTotal);
check('no 404s so far', failed404.length === 0, failed404.join(', '));
// ---------- walk every scene ----------
for (let i = 0; i < 6; i++) {
  const p = REEL.start + (i / 5) * (REEL.end - REEL.start);
  await jumpTo(p);
  const s = await page.evaluate(() => {
    const stage = document.getElementById('stage-act2-5');
    const active = stage.querySelector('.reel-scene.is-active');
    const idx = [...stage.querySelectorAll('.reel-scene')].indexOf(active);
    return {
      idx,
      counter: stage.querySelector('.reel-counter-cur')?.textContent,
      title: active.querySelector('.scene-title')?.textContent,
      opacity: Number(getComputedStyle(active).opacity),
      visible: getComputedStyle(active).visibility === 'visible',
      titleShown: Number(getComputedStyle(active.querySelector('.scene-title')).opacity) === 1,
      dotsOn: [...stage.querySelectorAll('.reel-dot')].findIndex((d) => d.classList.contains('on')),
    };
  });
  check(`scene ${i + 1} active at its scroll point`, s.idx === i, `idx ${s.idx}`);
  check(`scene ${i + 1} counter`, s.counter === String(i + 1).padStart(2, '0'), s.counter);
  check(`scene ${i + 1} title "${s.title}"`, !!s.title);
  check(`scene ${i + 1} fully visible`, s.visible && s.opacity > 0.95, `op ${s.opacity}`);
  check(`scene ${i + 1} copy revealed`, s.titleShown);
  check(`scene ${i + 1} dot on`, s.dotsOn === i);
  await page.screenshot({ path: `${SHOTS}/${String(i + 1).padStart(2, '0')}-scene.png` });
}
// ---------- interactions ----------
await jumpTo(REEL.start);
await page.click('.reel-arrow.next');
await sleep(1800);
let nav = await page.evaluate(() => document.querySelector('.reel-counter-cur')?.textContent);
check('next arrow -> 02', nav === '02', nav);

await page.evaluate(() => document.querySelectorAll('.reel-dot')[4].click());
await sleep(3200);
nav = await page.evaluate(() => document.querySelector('.reel-counter-cur')?.textContent);
check('dot click -> 05', nav === '05', nav);

await page.keyboard.press('ArrowRight');
await sleep(3200);
nav = await page.evaluate(() => document.querySelector('.reel-counter-cur')?.textContent);
check('ArrowRight -> 06', nav === '06', nav);

await page.keyboard.press('ArrowLeft');
await sleep(3200);
nav = await page.evaluate(() => document.querySelector('.reel-counter-cur')?.textContent);
check('ArrowLeft -> 05', nav === '05', nav);

// drag-to-scrub: fling left = next scene
await jumpTo(REEL.start);
await sleep(400);
const vp = await page.evaluate(() => {
  const r = document.querySelector('.reel-viewport').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(vp.x, vp.y);
await page.mouse.down();
for (let k = 1; k <= 10; k++) {
  await page.mouse.move(vp.x - k * 25, vp.y);
  await sleep(16);
}
await page.mouse.up();
await sleep(2200);
nav = await page.evaluate(() => document.querySelector('.reel-counter-cur')?.textContent);
check('drag fling -> 02', nav === '02', nav);
await page.screenshot({ path: `${SHOTS}/07-after-drag.png` });
// ---------- layout safety ----------
const layout = await page.evaluate(() => {
  const stage = document.getElementById('stage-act2-5').getBoundingClientRect();
  const root = document.documentElement;
  const filmTop = parseFloat(getComputedStyle(root).getPropertyValue('--film-top'));
  const filmBottom = parseFloat(getComputedStyle(root).getPropertyValue('--film-bottom'));
  const de = document.scrollingElement;
  return {
    stageTop: stage.top, stageBottom: stage.bottom,
    filmTop, filmBottom, vh: window.innerHeight,
    hOverflow: de.scrollWidth - de.clientWidth,
  };
});
check('stage inside film top edge', layout.stageTop >= layout.filmTop - 3, `${layout.stageTop.toFixed(0)} vs ${layout.filmTop.toFixed(0)}`);
check('stage inside film bottom edge', layout.stageBottom <= layout.vh - layout.filmBottom + 3, `${layout.stageBottom.toFixed(0)} vs ${(layout.vh - layout.filmBottom).toFixed(0)}`);
check('no horizontal page overflow', layout.hOverflow === 0, `${layout.hOverflow}px`);

// ---------- mobile ----------
await page.setViewport({ width: 390, height: 844 });
await jumpTo(REEL.start + (3 / 5) * (REEL.end - REEL.start));
await sleep(600);
const mob = await page.evaluate(() => {
  const de = document.scrollingElement;
  const r = document.querySelector('.reel-scene.is-active').getBoundingClientRect();
  return { hOverflow: de.scrollWidth - de.clientWidth, sceneH: r.height, vh: window.innerHeight };
});
check('mobile: no horizontal overflow', mob.hOverflow === 0, `${mob.hOverflow}px`);
check('mobile: scene fits viewport', mob.sceneH <= mob.vh, `${mob.sceneH.toFixed(0)}px vs ${mob.vh}px`);
await page.screenshot({ path: `${SHOTS}/08-mobile.png` });

// ---------- image decoding (after every scene has been visited) ----------
const decode = await page.evaluate(() => {
  const stills = [...document.querySelectorAll('.still-img')];
  const beads = [...document.querySelectorAll('.mini-bead img')];
  return {
    stillsOK: stills.every((i) => i.complete && i.naturalWidth > 0),
    beadsOK: beads.every((i) => i.complete && i.naturalWidth > 0),
    stillCount: stills.length,
    beadCount: beads.length,
  };
});
check(`all ${decode.stillCount} stills decoded`, decode.stillsOK);
check(`all ${decode.beadCount} skill chip icons decoded`, decode.beadsOK);

// ---------- console ----------
check('no 404 responses', failed404.length === 0, failed404.slice(0, 3).join(', '));
check('no console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed${fails ? ` — ${fails} FAILURES` : ' — ALL GREEN'}`);
process.exit(fails ? 1 : 0);