// Functional test for ACT 3 (Experience & Education — The Service Record)
// usage: node tests/xp-test.mjs   (dev server on :5173 must be running)
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
// Act 3.4 (The Pulse) fetches live GitHub data on first approach — keep this
// suite on the embedded snapshot: zero external requests, zero rate-limit burn.
await page.evaluate(() => { window.__GH_OFFLINE__ = true; });
await sleep(1200);


async function jumpTo(p) {
  // Retry loop: lenis's cached scroll limit can be stale after viewport
  // switches and clamp `immediate` scrolls short. Nudge with a resize event
  // and re-scroll until the probe actually converges.
  for (let attempt = 0; attempt < 6; attempt++) {
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

const stageOn = () => page.evaluate(() => document.getElementById('stage-act3').classList.contains('stage-active'));

// ---------- 1. act window gating ----------
await jumpTo(0.5);
check('act3 stage inactive mid-reel (0.5)', !(await stageOn()));

await jumpTo(0.915);
check('act3 stage activates at 0.915', await stageOn());

// ---------- 2. structure ----------
const structure = await page.evaluate(() => {
  const stage = document.getElementById('stage-act3');
  return {
    entries: stage.querySelectorAll('.xr-entry').length,
    bullets: stage.querySelectorAll('.xr-bullets li').length,
    stats: stage.querySelectorAll('.xr-stat').length,
    eduRows: stage.querySelectorAll('.xr-edu-row').length,
    words: stage.querySelectorAll('#xp-headline .xr-word').length,
    nodes: stage.querySelectorAll('.xr-node').length,
    magnets: stage.querySelectorAll('[data-magnetic]').length,
    stamps: [...stage.querySelectorAll('.xr-stamp')].map((s) => s.textContent.trim()),
    degrees: [...stage.querySelectorAll('.xr-edu-degree')].map((s) => s.textContent.trim()),
  };
});
check('2 career entries on the spine', structure.entries === 2, `${structure.entries}`);
check('6 achievement bullets total', structure.bullets === 6, `${structure.bullets}`);
check('4 telemetry stat tiles', structure.stats === 4, `${structure.stats}`);
check('2 education credential rows', structure.eduRows === 2, `${structure.eduRows}`);
check('headline word split present', structure.words === 1, `${structure.words}`);
check('spine node per entry', structure.nodes === structure.entries, `${structure.nodes}`);
check('6 magnetic targets (4 stats + 2 credentials)', structure.magnets === 6, `${structure.magnets}`);
check('CV dates in stamps', structure.stamps.join('|').includes('May 2026') && structure.stamps.join('|').includes('Sep 2023'), structure.stamps.join(' / '));
check('CV degrees MCA + BCA', structure.degrees.join(',') === 'MCA,BCA', structure.degrees.join(','));


// ---------- 3. count-up settles at finals, one-shot ----------
await sleep(1600); // count-up duration 1150ms + stagger
const finals = await page.evaluate(() => [...document.querySelectorAll('.xr-stat-val')].map((el) => el.textContent));
check('count-up settles at finals', finals.join(',') === '30+,100+,20%,15+', finals.join(','));

// leave the act, re-enter: one-shot counter must NOT reset to zero
await jumpTo(0.5);
await jumpTo(0.915);
await sleep(700);
const reentry = await page.evaluate(() => [...document.querySelectorAll('.xr-stat-val')].map((el) => el.textContent));
check('count-up is one-shot (no reset on re-entry)', reentry.join(',') === '30+,100+,20%,15+', reentry.join(','));

// ---------- 4. choreography var + spine draw ----------
const p3val = await page.evaluate(() => parseFloat(document.getElementById('stage-act3').style.getPropertyValue('--act3-p')));
check('--act3-p eased toward 0.5 at scroll 0.915', p3val > 0.4 && p3val <= 1, `p3=${p3val}`);

const spineScale = await page.evaluate(() => {
  const m = getComputedStyle(document.querySelector('#stage-act3 .xr-spine'), '::before').transform;
  const match = m.match(/matrix\(([^)]+)\)/);
  return match ? parseFloat(match[1].split(',')[3]) : -1;
});
check('spine line draw follows --act3-p', Math.abs(spineScale - p3val) < 0.05, `scaleY=${spineScale}`);

// ---------- 5. reveal states while active ----------
const revealed = await page.evaluate(() => {
  const stage = document.getElementById('stage-act3');
  const op = (sel) => getComputedStyle(stage.querySelector(sel)).opacity;
  return { copy: op('.xr-copy'), entry: op('.xr-entry'), eduRow: op('.xr-edu-row'), bullet: op('.xr-bullets li') };
});
check('copy/entries/edu revealed when active', Object.values(revealed).every((v) => parseFloat(v) > 0.9), JSON.stringify(revealed));


// ---------- 6. pointer spotlight ----------
await page.mouse.move(400, 450);
await page.mouse.move(1000, 250, { steps: 8 });
await sleep(400);
const spot = await page.evaluate(() => document.getElementById('stage-act3').style.getPropertyValue('--xp-spot-x'));
check('pointer spotlight tracks cursor', Boolean(spot) && spot !== '30.00%', `--xp-spot-x=${spot}`);

// ---------- 7. magnetic pull on a stat tile ----------
const statSel = '.xr-stat';
const magBefore = await page.evaluate((sel) => document.querySelector(sel).style.transform, statSel);
const box = await (await page.$(statSel)).boundingBox();
await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 6 });
await sleep(350);
const magAfter = await page.evaluate((sel) => document.querySelector(sel).style.transform, statSel);
check('magnetic spring engages on stat tile', Boolean(magAfter) && magAfter !== magBefore, magAfter);

await page.screenshot({ path: `${SHOTS}/13-xp-desktop.png` });

// ---------- 8. desktop fits viewport (no clipped dossier) ----------
const desktopFit = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#stage-act3 .xr-edu-row')];
  const last = rows[rows.length - 1].getBoundingClientRect();
  return last.bottom <= window.innerHeight && last.top >= 0;
});
check('desktop dossier fully inside viewport', desktopFit);

// ---------- 9. handoff to act 4 ----------
await jumpTo(0.985);
const handoff = await page.evaluate(() => ({
  a3: document.getElementById('stage-act3').classList.contains('stage-active'),
  a35: document.getElementById('stage-act35').classList.contains('stage-active'),
  a4: document.getElementById('stage-act4').classList.contains('stage-active'),
}));
check('act3/3.5 hand off to act4 at 0.985', !handoff.a3 && !handoff.a35 && handoff.a4, JSON.stringify(handoff));


// ---------- 10. mobile 390px — the dossier must fit ----------
await page.setViewport({ width: 390, height: 844 });
await sleep(700);
await jumpTo(0.915);
await sleep(900);
const mobile = await page.evaluate(() => {
  const stage = document.getElementById('stage-act3');
  const grid = stage.querySelector('.xr-grid');
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const rows = [...stage.querySelectorAll('.xr-edu-row')];
  const last = rows[rows.length - 1].getBoundingClientRect();
  const bullets = [...stage.querySelectorAll('.xr-bullets li')];
  const lastBullet = bullets[bullets.length - 1].getBoundingClientRect();
  return {
    active: stage.classList.contains('stage-active'),
    cols,
    lastEduBottom: last.bottom,
    lastBulletBottom: lastBullet.bottom,
    vh: window.innerHeight,
    descHidden: getComputedStyle(stage.querySelector('.xr-desc')).display === 'none',
  };
});
check('mobile act3 activates', mobile.active);
check('mobile grid collapses to single column', mobile.cols === 1, `${mobile.cols} cols`);
check('mobile intro copy folds away', mobile.descHidden);
check('mobile education rows inside viewport', mobile.lastEduBottom <= mobile.vh && mobile.lastEduBottom > 0, `bottom=${Math.round(mobile.lastEduBottom)}/${mobile.vh}`);
check('mobile last bullet inside viewport', mobile.lastBulletBottom <= mobile.vh, `bottom=${Math.round(mobile.lastBulletBottom)}/${mobile.vh}`);
await page.screenshot({ path: `${SHOTS}/14-xp-mobile.png` });

// ---------- hygiene ----------
check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
check('no 404s', failed404.length === 0, failed404.slice(0, 2).join(' | '));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);

