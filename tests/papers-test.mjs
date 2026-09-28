// Functional test for ACT 3.5 (Knowledge Sharing — Publications & Credentials)
// usage: node tests/papers-test.mjs   (dev server on :5173 must be running)
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

const stageOn = () => page.evaluate(() => document.getElementById('stage-act35').classList.contains('stage-active'));

// ---------- 1. act window gating ----------
await jumpTo(0.915);
check('act3.5 inactive while act3 owns 0.915', !(await stageOn()));

await jumpTo(0.955);
check('act3.5 stage activates at 0.955', await stageOn());

// ---------- 2. structure ----------
const structure = await page.evaluate(() => {
  const stage = document.getElementById('stage-act35');
  return {
    papers: stage.querySelectorAll('.kp-paper').length,
    certs: stage.querySelectorAll('.kp-cert-row').length,
    stats: stage.querySelectorAll('.kp-stat').length,
    nodes: stage.querySelectorAll('.kp-node').length,
    magnets: stage.querySelectorAll('[data-magnetic]').length,
    cites: stage.querySelectorAll('.kp-cite').length,
    links: [...stage.querySelectorAll('.kp-link')].map((a) => a.getAttribute('href')),
    certIds: [...stage.querySelectorAll('.kp-cert-id')].map((s) => s.textContent.trim()),
    words: stage.querySelectorAll('#kp-headline .kp-word').length,
  };
});
check('2 publication cards', structure.papers === 2, `${structure.papers}`);
check('2 NPTEL credential rows', structure.certs === 2, `${structure.certs}`);
check('3 telemetry stat tiles', structure.stats === 3, `${structure.stats}`);
check('rail node per paper card', structure.nodes === structure.papers, `${structure.nodes}`);
check('magnetic targets wired (3 stats + 2 chips + 3 actions + 2 papers)', structure.magnets === 10, `${structure.magnets}`);
check('2 copy-citation buttons', structure.cites === 2, `${structure.cites}`);
check('cert credential IDs present', structure.certIds.join(',').includes('NPTEL23CS42S54770810') && structure.certIds.join(',').includes('NPTEL22CS122S5490238'), structure.certIds.join(','));
check('headline word split present', structure.words === 1, `${structure.words}`);
check('read-paper link present (href pending real URL)', structure.links.length === 1 && structure.links[0] === '#', structure.links.join(','));

// ---------- 3. count-up settles at finals, one-shot ----------
await sleep(1600); // count-up duration 1150ms + stagger
const finals = await page.evaluate(() => [...document.querySelectorAll('.kp-stat-val')].map((el) => el.textContent));
check('count-up settles at finals (zero-padded)', finals.join(',') === '02,02,2022', finals.join(','));

await jumpTo(0.915);
await jumpTo(0.955);
await sleep(700);
const reentry = await page.evaluate(() => [...document.querySelectorAll('.kp-stat-val')].map((el) => el.textContent));
check('count-up is one-shot (no reset on re-entry)', reentry.join(',') === '02,02,2022', reentry.join(','));

// ---------- 4. choreography var + rail draw ----------
const p35val = await page.evaluate(() => parseFloat(document.getElementById('stage-act35').style.getPropertyValue('--act35-p')));
check('--act35-p eased to 1.0 at scroll 0.955', p35val > 0.9 && p35val <= 1, `p35=${p35val}`);

const railScale = await page.evaluate(() => {
  const m = getComputedStyle(document.querySelector('#stage-act35 .kp-ledger'), '::before').transform;
  const match = m.match(/matrix\(([^)]+)\)/);
  return match ? parseFloat(match[1].split(',')[3]) : -1;
});
check('ledger rail draw follows --act35-p', Math.abs(railScale - p35val) < 0.05, `scaleY=${railScale}`);

// ---------- 5. reveal states while active ----------
const revealed = await page.evaluate(() => {
  const stage = document.getElementById('stage-act35');
  const op = (sel) => getComputedStyle(stage.querySelector(sel)).opacity;
  return { copy: op('.kp-copy'), paper: op('.kp-paper'), cert: op('.kp-cert-row'), node: op('.kp-node') };
});
check('copy/papers/certs revealed when active', Object.values(revealed).every((v) => parseFloat(v) > 0.9), JSON.stringify(revealed));

// ---------- 6. pointer spotlight ----------
await page.mouse.move(400, 450);
await page.mouse.move(1000, 250, { steps: 8 });
await sleep(400);
const spot = await page.evaluate(() => document.getElementById('stage-act35').style.getPropertyValue('--kp-spot-x'));
check('pointer spotlight tracks cursor', Boolean(spot) && spot !== '30.00%', `--kp-spot-x=${spot}`);

// ---------- 7. paper tilt physics (3D spring on citation cards) ----------
await page.mouse.move(720, 480);
await sleep(120);
const tiltBefore = await page.evaluate(() => document.querySelector('.kp-paper').style.transform);
await page.mouse.move(400, 300, { steps: 6 });
await sleep(150);
const tiltAfter = await page.evaluate(() => document.querySelector('.kp-paper').style.transform);
check('paper tilt spring engages (rotateX/rotateY in transform)', Boolean(tiltAfter) && tiltAfter !== tiltBefore && tiltAfter.includes('rotateX'), tiltAfter);

// ---------- 8. magnetic pull on a credential chip ----------
const magBefore = await page.evaluate(() => document.querySelector('.kp-cert-row').style.transform);
const box = await (await page.$('.kp-cert-row')).boundingBox();
await page.mouse.move(box.x + box.width / 2 + 26, box.y + box.height / 2, { steps: 6 });
await sleep(350);
const magAfter = await page.evaluate(() => document.querySelector('.kp-cert-row').style.transform);
check('magnetic spring engages on credential chip', Boolean(magAfter) && magAfter !== magBefore, magAfter);

await page.screenshot({ path: `${SHOTS}/15-papers-desktop.png` });

// ---------- 9. copy-citation micro-interaction ----------
const citeBox = await (await page.$('.kp-cite')).boundingBox();
await page.mouse.move(720, 200); // park pointer away first
await sleep(120);
await page.click('.kp-cite');
await sleep(500);
const clip = await page.evaluate(() => navigator.clipboard.readText());
const citeState = await page.evaluate(() => ({
  on: document.querySelector('.kp-cite').classList.contains('copied'),
  label: document.querySelector('.kp-cite .kp-cite-label').textContent,
  sparks: document.querySelectorAll('#fx-layer .fx-spark').length,
}));
check('clipboard contains citation text', clip.startsWith('Brain Machine Interface'), clip.slice(0, 60));
check('copied state + label morph', citeState.on && citeState.label === 'Copied ✓', citeState.label);
check('spark burst on copy', citeState.sparks > 0, `${citeState.sparks} sparks`);

// ---------- 10. desktop fits viewport ----------
const desktopFit = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#stage-act35 .kp-cert-row')];
  const last = rows[rows.length - 1].getBoundingClientRect();
  return last.bottom <= window.innerHeight && last.top >= 0;
});
check('desktop ledger fully inside viewport', desktopFit);

// ---------- 11. handoff to act 4 ----------
await jumpTo(0.985);
const handoff = await page.evaluate(() => ({
  a3: document.getElementById('stage-act3').classList.contains('stage-active'),
  a35: document.getElementById('stage-act35').classList.contains('stage-active'),
  a4: document.getElementById('stage-act4').classList.contains('stage-active'),
}));
check('act3.5 hands off to act4 at 0.985', !handoff.a3 && !handoff.a35 && handoff.a4, JSON.stringify(handoff));

// ---------- 12. mobile 390px — the ledger must fit ----------
await page.setViewport({ width: 390, height: 844 });
await sleep(700);
await jumpTo(0.955);
await sleep(900);
const mobile = await page.evaluate(() => {
  const stage = document.getElementById('stage-act35');
  const grid = stage.querySelector('.kp-grid');
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const rows = [...stage.querySelectorAll('.kp-cert-row')];
  const last = rows[rows.length - 1].getBoundingClientRect();
  const papers = [...stage.querySelectorAll('.kp-paper')];
  const lastPaper = papers[papers.length - 1].getBoundingClientRect();
  return {
    active: stage.classList.contains('stage-active'),
    cols,
    lastCertBottom: last.bottom,
    lastPaperBottom: lastPaper.bottom,
    vh: window.innerHeight,
    descHidden: getComputedStyle(stage.querySelector('.kp-desc')).display === 'none',
  };
});
check('mobile act3.5 activates', mobile.active);
check('mobile grid collapses to single column', mobile.cols === 1, `${mobile.cols} cols`);
check('mobile intro copy folds away', mobile.descHidden);
check('mobile credential rows inside viewport', mobile.lastCertBottom <= mobile.vh && mobile.lastCertBottom > 0, `bottom=${Math.round(mobile.lastCertBottom)}/${mobile.vh}`);
check('mobile paper cards inside viewport', mobile.lastPaperBottom <= mobile.vh, `bottom=${Math.round(mobile.lastPaperBottom)}/${mobile.vh}`);
await page.screenshot({ path: `${SHOTS}/16-papers-mobile.png` });

// ---------- hygiene ----------
check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
check('no 404s', failed404.length === 0, failed404.slice(0, 2).join(' | '));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
