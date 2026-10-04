// Functional test for the Soundscape (scroll-linked score + auto-tour)
// usage: node tests/audio-test.mjs   (dev server on :5173 must be running)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const EXEC = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const URL_ = 'http://localhost:5173/';
const SHOTS = '.reeltest/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 3000, every = 60) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await sleep(every);
  }
  return false;
}

// Deterministic "score went quiet" wait: idle grace (700ms) + fade-out
// (350ms) + margin, polled instead of a fixed sleep so glides can't eat it.
const waitPaused = () => waitFor(async () => {
  const p = await probe();
  return p.playing === false && p.volume === 0;
}, 5000);

// no-user-gesture flag: CI can't produce "real" gestures for autoplay policy,
// so we test the state machine itself (scroll→play, idle→pause, resume).
const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: 'new',
  args: [
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--autoplay-policy=no-user-gesture-required',
  ],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
const consoleErrors = [];
const failed404 = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('response', (r) => { if (r.status() === 404) failed404.push(r.url()); });

const probe = () => page.evaluate(() => window.__audioProbe());
const scrollTo = (y, opts = {}) =>
  page.evaluate((y, opts) => window.__lenis.scrollTo(y, opts), y, opts);

await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
await sleep(1200);

// ---------- 1. boot state ----------
{
  const p = await probe();
  check('random pick is one of the two tracks',
    p.src === '/audio/aura-farming-1.m4a' || p.src === '/audio/aura-farming-2.m4a', p.src);
  check('audio element usable (no decode error)', p.audioOk === true);
  check('starts unmuted', p.muted === false);
  check('starts paused (idle, no scroll yet)', p.playing === false);
  check('tour idle at boot', p.touring === false);
  const btn = await page.evaluate(() => {
    const b = document.getElementById('hero-tour');
    const cs = getComputedStyle(b);
    return { visible: cs.display !== 'none' && cs.opacity === '1', label: b.textContent.trim() };
  });
  check('tour button visible after entrance', btn.visible === true);
  check('tour button label', btn.label.includes('Take the tour'), btn.label);
}

// ---------- 2. audio files served ----------
{
  const statuses = await page.evaluate(async (src) => {
    const other = src.includes('-1') ? '/audio/aura-farming-2.m4a' : '/audio/aura-farming-1.m4a';
    const s = async (u) => { try { const r = await fetch(u, { method: 'HEAD' }); return r.status; } catch { return 0; } };
    return [await s(src), await s(other)];
  }, (await probe()).src);
  check('both audio files return 200', statuses.every((s) => s === 200), statuses.join(','));
}

// ---------- 3. scroll starts the score ----------
{
  await scrollTo(1800, { duration: 1.0 }); // smooth 1s glide
  const playing = await waitFor(async () => (await probe()).playing, 3000);
  const p = await probe();
  check('scroll starts playback', playing === true, `vol=${p.volume} unlocked=${p.unlocked}`);
}

// ---------- 4. idle pauses (grace 700ms + fade 350ms + margin) ----------
{
  const settled = await waitPaused();
  const p = await probe();
  check('idle stops scrolling -> paused', settled === true && p.playing === false, `idleMs=${p.idleMs}`);
  check('volume faded to 0 before pause', p.volume === 0, `vol=${p.volume}`);
}

// ---------- 5. resume continues position (never restarts) ----------
{
  const t1 = (await probe()).currentTime;
  await scrollTo(3400, { duration: 1.0 });
  const playing = await waitFor(async () => (await probe()).playing, 3000);
  await sleep(700);
  const t2 = (await probe()).currentTime;
  check('scroll resumes playback', playing === true);
  check('first pass accumulated time', t1 > 0.5, `t1=${t1}s`);
  check('resume CONTINUES (no restart)', t2 > t1, `t1=${t1}s -> t2=${t2}s`);
  await waitPaused(); // settle back to paused before the toggle tests
}

// ---------- 6. mute toggle: blocks playback + persists ----------
{
  await page.click('#sound-toggle');
  let p = await probe();
  check('toggle mutes', p.muted === true);
  const ui = await page.evaluate(() => ({
    cls: document.getElementById('sound-toggle').classList.contains('is-muted'),
    pressed: document.getElementById('sound-toggle').getAttribute('aria-pressed'),
    stored: localStorage.getItem('pb-sound'),
  }));
  check('muted visual + aria state', ui.cls === true && ui.pressed === 'false', JSON.stringify(ui));
  check('mute persisted', ui.stored === 'off', String(ui.stored));

  await scrollTo(5000, { duration: 1.0 });
  await sleep(1900);
  p = await probe();
  check('muted: no playback on scroll', p.playing === false);

  await page.click('#sound-toggle'); // unmute (page is idle — sound waits for scroll)
  p = await probe();
  check('unmute restores', p.muted === false);
  await scrollTo(6500, { duration: 1.0 }); // explicit new scroll
  const playing = await waitFor(async () => (await probe()).playing, 3000);
  check('unmute + scroll resumes sound', playing === true);
  await waitPaused(); // settle
}

// ---------- 7. auto-tour: runs, plays, wheel cancels ----------
{
  await scrollTo(0, { immediate: true });
  await sleep(700);
  await waitFor(async () => (await probe()).trackDuration != null, 5000);
  await page.click('#hero-tour');
  await sleep(1900);
  let p = await probe();
  const y = await page.evaluate(() => window.scrollY);
  const label = await page.evaluate(() => document.querySelector('.tour-btn-label').textContent);
  check('tour starts', p.touring === true);
  check('tour scrolls the page', y > 100, `scrollY=${Math.round(y)}`);
  check('tour keeps the score playing', p.playing === true, `vol=${p.volume}`);
  check('tour button label swaps to Stop', label.includes('Stop tour'), label);

  // Pacing regression: the old 75s pace let the ~30s BGM "complete" long
  // before frame 472 — the tour must fit inside one playthrough of the score.
  check(
    'tour paced shorter than the score',
    p.tourDuration > 0 && p.trackDuration != null &&
      p.tourDuration <= p.trackDuration - 1,
    `tour=${p.tourDuration}s track=${p.trackDuration}s`
  );

  await page.mouse.move(720, 450);
  await page.mouse.wheel({ deltaY: 500 });
  await sleep(500);
  p = await probe();
  const label2 = await page.evaluate(() => document.querySelector('.tour-btn-label').textContent);
  check('wheel cancels the tour', p.touring === false);
  check('tour label restored', label2.includes('Take the tour'), label2);
}

// ---------- 7b. full tour run: 472 frames finish before the BGM completes ------
{
  await scrollTo(0, { immediate: true });
  await sleep(700);
  await page.click('#hero-tour');
  await sleep(300);
  const p0 = await probe();
  check('full-run tour starts', p0.touring === true);

  const t0 = Date.now();
  let sawEnd = false;
  let sawWrap = false;
  let lastTime = 0;
  while (Date.now() - t0 < 45000) {
    const p = await probe();
    // The score "completing" = its track wrapped to the start (both loop).
    if (p.playing && p.currentTime + 0.6 < lastTime) sawWrap = true;
    lastTime = p.currentTime;
    if (!p.touring) { sawEnd = true; break; }
    await sleep(500);
  }
  check('full tour completes on its own', sawEnd,
    `${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // The last frame + progress lerp need a beat after the scroll lands.
  const reached472 = await waitFor(async () => {
    const t = await page.evaluate(() =>
      document.getElementById('telemetry-frame').textContent);
    return /^Frame 472 \/ 472$/.test(t);
  }, 6000);
  const finalFrame = await page.evaluate(() =>
    document.getElementById('telemetry-frame').textContent);
  check('all 472 frames shown by tour end', reached472, finalFrame);
  check('BGM never completed before frames finished', sawWrap === false);
}

// ---------- 8. mute preference survives a reload ----------
{
  await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
  await sleep(800);
  const p = await probe();
  const stored = await page.evaluate(() => localStorage.getItem('pb-sound'));
  check('preference persisted across reload', stored === 'on' && p.muted === false, `${stored}`);
}

// ---------- 9. deterministic random pick (both branches) ----------
for (const [rnd, expect] of [[0.01, 'aura-farming-1.m4a'], [0.99, 'aura-farming-2.m4a']]) {
  const pg = await browser.newPage();
  await pg.evaluateOnNewDocument((r) => {
    // Force every Math.random() until the soundscape probe exists (which is
    // assigned right after the track pick) — then real randomness returns.
    const orig = Math.random;
    Math.random = function () {
      if (window.__audioProbe) {
        Math.random = orig;
        return orig();
      }
      return r;
    };
  }, rnd);
  await pg.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForFunction(() => !!window.__audioProbe, { timeout: 15000 }).catch(() => {});
  const p = await pg.evaluate(() => window.__audioProbe());
  check(`random pick ${expect}`, p.src.endsWith(expect), p.src);
  await pg.close();
}

// ---------- 10. reduced motion: tour hidden, sound toggle stays ----------
{
  const pg = await browser.newPage();
  await pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await pg.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await pg.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
  await sleep(600);
  const state = await pg.evaluate(() => ({
    tour: getComputedStyle(document.getElementById('hero-tour')).display,
    toggle: getComputedStyle(document.getElementById('sound-toggle')).display,
  }));
  check('reduced motion hides tour button', state.tour === 'none', state.tour);
  check('reduced motion keeps sound toggle', state.toggle !== 'none', state.toggle);
  await pg.close();
}

// ---------- hygiene ----------
check('no console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
check('no 404s (audio included)', failed404.length === 0, JSON.stringify(failed404.slice(0, 3)));

await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

