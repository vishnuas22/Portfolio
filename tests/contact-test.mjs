// Visual + functional test for ACT 4 (Contact / Transmission Terminal)
// usage: node tests/contact-test.mjs   (dev server on :5173 must be running)
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

// ---------- browser boot ----------
const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: 'new',
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1440, height: 900 },
});
await browser.defaultBrowserContext().overridePermissions(URL_, [
  'clipboard-read',
  'clipboard-write',
  'clipboard-sanitized-write',
]);
const page = await browser.newPage();
const consoleErrors = [];
const failed404 = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('response', (r) => { if (r.status() === 404) failed404.push(r.url()); });

await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
// Act 3.4 (The Pulse) fetches live GitHub data on first approach — keep this
// suite on the embedded snapshot: zero external requests, zero rate-limit burn.
await page.evaluate(() => { window.__GH_OFFLINE__ = true; });
await sleep(1200);

async function jumpTo(p) {
  // Retry loop: after viewport switches, lenis's cached scroll limit can be
  // stale and clamp `immediate` scrolls short (e.g. 0.97 → 0.93). Nudge with
  // a resize event and re-scroll until the probe actually converges.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.evaluate((prog) => {
      window.dispatchEvent(new Event('resize'));
      const hero = document.getElementById('hero');
      const wrap = document.getElementById('scroll-wrapper');
      const max = wrap.offsetHeight - window.innerHeight;
      window.__lenis.scrollTo(hero.offsetHeight + max * prog, { immediate: true });
    }, p);
    await page.waitForFunction(
      (exp) => {
        const pr = window.__progressProbe();
        return Math.abs(pr.current - pr.target) < 0.002 && Math.abs(pr.target - exp) < 0.01;
      },
      { timeout: 3000, polling: 100 },
      p
    ).catch(() => {});
    const ok = await page.evaluate((exp) => {
      const pr = window.__progressProbe();
      return Math.abs(pr.target - exp) < 0.01 && Math.abs(pr.current - pr.target) < 0.002;
    }, p);
    if (ok) break;
    await sleep(350);
  }
  await sleep(400);
}

// ---------- 1. act activation ----------
await jumpTo(0.985);
const actOn = await page.evaluate(() => document.getElementById('stage-act4').classList.contains('stage-active'));
check('act4 stage activates at 0.985', actOn);

// ---------- 2. structure ----------
const structure = await page.evaluate(() => ({
  emailChars: document.querySelectorAll('#xmit-email-chars .xmit-char').length,
  consoleLines: document.querySelectorAll('#console-lines .console-line').length,
  words: document.querySelectorAll('#xmit-headline .xmit-word').length,
  magnets: document.querySelectorAll('#stage-act4 [data-magnetic]').length,
  socials: document.querySelectorAll('#stage-act4 .xmit-social').length,
}));
check('email split into 23 chars', structure.emailChars === 23, `got ${structure.emailChars}`);
check('console has 5 lines', structure.consoleLines === 5, `got ${structure.consoleLines}`);
check('headline has 7 words', structure.words === 7, `got ${structure.words}`);
check('magnetic elements wired (5)', structure.magnets === 5, `got ${structure.magnets}`);
check('GitHub + LinkedIn socials present', structure.socials === 2, `got ${structure.socials}`);

// ---------- 3. typewriter completes ----------
await page.waitForFunction(
  () => window.__connectProbe().typedLines === 5,
  { timeout: 8000, polling: 200 }
).catch(() => {});
const probe1 = await page.evaluate(() => window.__connectProbe());
check('console typewriter completes (5/5 lines)', probe1.typedLines === 5, `got ${probe1.typedLines}`);

// ---------- 4. live Bengaluru clock ----------
const clockA = await page.evaluate(() => window.__connectProbe().clock);
await sleep(1300);
const clockB = await page.evaluate(() => window.__connectProbe().clock);
const clockFmtOk = /^\d{2}:\d{2}:\d{2} IST$/.test(clockB || '');
check('clock ticks in IST format', clockFmtOk && clockA !== clockB, `${clockA} → ${clockB}`);

// ---------- 5. scroll choreography var ----------
const p4val = await page.evaluate(() => window.__connectProbe().p4);
check('--act4-p choreography var easing (0 < p4 <= 1)', p4val > 0 && p4val <= 1, `p4=${p4val}`);

// ---------- 6. spotlight follows pointer ----------
await page.mouse.move(720, 450);
await page.mouse.move(900, 300, { steps: 8 });
await sleep(300);
const spot = await page.evaluate(() => document.getElementById('stage-act4').style.getPropertyValue('--spot-x'));
check('pointer spotlight tracks cursor', Boolean(spot) && spot !== '50.00%', `--spot-x=${spot}`);

// ---------- 7. magnetic pull ----------
const magBefore = await page.evaluate(() => document.getElementById('copy-email-button').style.transform);
const emailBox = await (await page.$('#copy-email-button')).boundingBox();
await page.mouse.move(emailBox.x + emailBox.width / 2 + 30, emailBox.y + emailBox.height / 2, { steps: 6 });
await sleep(350);
const magAfter = await page.evaluate(() => document.getElementById('copy-email-button').style.transform);
check('magnetic spring engages on email', Boolean(magAfter) && magAfter !== magBefore, magAfter);

// ---------- 8. copy interaction + celebration ----------
await page.click('#copy-email-button');
await sleep(500);
const clip = await page.evaluate(() => navigator.clipboard.readText());
const copiedState = await page.evaluate(() => ({
  on: document.getElementById('copy-email-button').classList.contains('copied'),
  hint: document.querySelector('#copy-email-button .xmit-hint-label').textContent,
  sparks: document.querySelectorAll('#fx-layer .fx-spark').length,
}));
check('clipboard contains email', clip === 'thedataghost8@gmail.com', clip);
check('copied state + label morph', copiedState.on && copiedState.hint === 'Copied to clipboard', copiedState.hint);
check('spark burst on copy', copiedState.sparks > 0, `${copiedState.sparks} sparks`);

await page.screenshot({ path: `${SHOTS}/10-contact-desktop.png` });

// ---------- 9. end-of-scroll state ----------
await jumpTo(1.0);
await sleep(600);
const p4end = await page.evaluate(() => window.__connectProbe().p4);
check('choreography settles to 1.0 at end', p4end > 0.95, `p4=${p4end}`);
await page.screenshot({ path: `${SHOTS}/11-contact-end.png` });

// ---------- 10. mobile 390px ----------
await page.setViewport({ width: 390, height: 844 });
await sleep(700);
await jumpTo(0.985);
await sleep(800);
const mobileOk = await page.evaluate(() => {
  const stage = document.getElementById('stage-act4');
  const grid = stage.querySelector('.xmit-grid');
  return stage.classList.contains('stage-active') && grid.offsetWidth > 0 && grid.offsetWidth < 390;
});
check('mobile layout renders inside viewport', mobileOk);
await page.screenshot({ path: `${SHOTS}/12-contact-mobile.png` });

// ---------- 11. replay rewind label ----------
await page.setViewport({ width: 1440, height: 900 });
await jumpTo(0.985);
await page.click('#xmit-replay');
await sleep(250); // let the next rAF tick apply the rewind phase label
const phase = await page.evaluate(() => document.getElementById('telemetry-phase').textContent);
check('replay triggers rewind phase label', phase.includes('Rewinding'), phase);
await sleep(3000); // let the scroll replay finish before teardown

// ---------- hygiene ----------
check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
check('no 404s', failed404.length === 0, failed404.slice(0, 2).join(' | '));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);