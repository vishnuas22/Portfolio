// Functional test for ACT 3.4 (The Pulse — live GitHub activity session)
// usage: node tests/github-test.mjs   (dev server on :5173 must be running)
//
// All GitHub endpoints are answered from deterministic fixtures via request
// interception: zero real network calls, zero rate-limit burn, no flake from
// third-party outages. The offline path (window.__GH_OFFLINE__ → embedded
// github-snapshot.json) is asserted on a second page.
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
const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');

// ----- deterministic fixtures ------------------------------------------------
const contribDays = Array.from({ length: 366 }, (_, i) => {
  const date = new Date(Date.now() - (365 - i) * 86400000);
  const count = i % 10 === 9 ? 0 : (i % 5) + 1; // zero every 10th day → predictable streaks
  const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count === 5 ? 4 : 3;
  return { date: date.toISOString().slice(0, 10), count, level };
});
const sumContrib = contribDays.reduce((a, d) => a + d.count, 0);
const activeDays = contribDays.filter((d) => d.count > 0).length;
let longest = 0;
{
  let run = 0;
  for (const d of contribDays) { run = d.count > 0 ? run + 1 : 0; if (run > longest) longest = run; }
}
let current = 0;
for (let i = contribDays.length - 1; i >= 0 && contribDays[i].count > 0; i--) current++;

const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const FIX = {
  contrib: { total: { lastYear: sumContrib }, contributions: contribDays },
  profile: { public_repos: 42, followers: 7 },
  events: [
    { type: 'PushEvent', repo: { name: 'vishnuas22/Portfolio' }, payload: { ref: 'refs/heads/main' }, created_at: hoursAgo(3) },
    { type: 'WatchEvent', repo: { name: 'vishnuas22/Deep-Learning' }, payload: {}, created_at: hoursAgo(26) },
    { type: 'CreateEvent', repo: { name: 'vishnuas22/Machine-Learning' }, payload: { ref: 'v1.0', ref_type: 'tag' }, created_at: hoursAgo(74) },
  ],
  repos: [
    { name: 'Portfolio', language: 'JavaScript', pushed_at: hoursAgo(4), fork: false },
    { name: 'Deep-Learning', language: 'Jupyter Notebook', pushed_at: hoursAgo(80), fork: false },
    { name: 'Machine-Learning', language: 'Jupyter Notebook', pushed_at: hoursAgo(120), fork: false },
    { name: 'some-forked-repo', language: 'Go', pushed_at: hoursAgo(200), fork: true },
  ],
};

const snapshot = JSON.parse(fs.readFileSync('github-snapshot.json', 'utf8'));

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: 'new',
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1440, height: 900 },
});

async function newInstrumentedPage() {
  const p = await browser.newPage();
  const consoleErrors = [];
  const failed404 = [];
  const external = [];
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  p.on('pageerror', (e) => consoleErrors.push(String(e)));
  p.on('response', (r) => {
    if (r.status() === 404 && r.url().startsWith(URL_)) failed404.push(r.url());
  });
  p.on('request', (req) => {
    if (!req.url().startsWith(URL_) && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) {
      external.push(req.url());
    }
  });
  return { p, consoleErrors, failed404, external };
}

// fixture interception — served before any live call can escape.
// Cross-origin responses need an explicit ACAO header or the browser's CORS
// check rejects the fixture exactly like a real missing header.
async function interceptFixtures(p) {
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    const u = req.url();
    const json = (obj) => req.respond({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(obj),
    });
    if (u.includes('github-contributions-api.jogruber.de')) return json(FIX.contrib);
    if (u.includes('api.github.com/users/vishnuas22/repos')) return json(FIX.repos);
    if (u.includes('api.github.com/users/vishnuas22/events')) return json(FIX.events);
    if (/api\.github\.com\/users\/vishnuas22$/.test(u)) return json(FIX.profile);
    if (u.includes('github.com')) return req.respond({
      status: 200,
      contentType: 'text/html',
      headers: { 'access-control-allow-origin': '*' },
      body: '<html></html>',
    });
    return req.continue();
  });
}

async function jumpTo(p, prog) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await p.evaluate((x) => {
      window.dispatchEvent(new Event('resize'));
      const hero = document.getElementById('hero');
      const wrap = document.getElementById('scroll-wrapper');
      const max = wrap.offsetHeight - window.innerHeight;
      window.__lenis.scrollTo(hero.offsetHeight + max * x, { immediate: true });
    }, prog);
    await p.waitForFunction(
      (exp) => {
        const pr = window.__progressProbe();
        return Math.abs(pr.current - pr.target) < 0.002 && Math.abs(pr.target - exp) < 0.01;
      },
      { timeout: 3000, polling: 100 },
      prog
    ).catch(() => {});
    const ok = await p.evaluate((exp) => {
      const pr = window.__progressProbe();
      return Math.abs(pr.target - exp) < 0.01 && Math.abs(pr.current - pr.target) < 0.002;
    }, prog);
    if (ok) break;
    await sleep(350);
  }
  await sleep(400);
}

const stageOn = (p, id) => p.evaluate((sel) => document.getElementById(sel).classList.contains('stage-active'), id);

// ============================================================================
// PAGE 1 — live path with fixture interception (deterministic)
// ============================================================================
const page1 = await newInstrumentedPage();
const { p, consoleErrors, failed404, external } = page1;
await interceptFixtures(p);
await p.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
await p.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
await sleep(1200);

// ---------- 1. act window gating + hard anchors ----------
await jumpTo(p, 0.915);
const a34At915 = await stageOn(p, 'stage-act34');
const a3At915 = await stageOn(p, 'stage-act3');
check('act3.4 inactive while act3 owns 0.915 (anchor held)', !a34At915 && a3At915, `a34=${a34At915} a3=${a3At915}`);

await jumpTo(p, 0.935);
check('act3.4 stage activates at 0.935', await stageOn(p, 'stage-act34'));

await jumpTo(p, 0.955);
const [a34At955, a35At955] = [await stageOn(p, 'stage-act34'), await stageOn(p, 'stage-act35')];
check('act3.5 owns 0.955, act3.4 handed off (anchor held)', !a34At955 && a35At955, `a34=${a34At955} a35=${a35At955}`);

await jumpTo(p, 0.985);
const handoff = {
  a3: await stageOn(p, 'stage-act3'),
  a34: await stageOn(p, 'stage-act34'),
  a35: await stageOn(p, 'stage-act35'),
  a4: await stageOn(p, 'stage-act4'),
};
check('act3/3.4/3.5 all hand off to act4 at 0.985', !handoff.a3 && !handoff.a34 && !handoff.a35 && handoff.a4, JSON.stringify(handoff));

// ---------- 2. structure ----------
await jumpTo(p, 0.935);
const structure = await p.evaluate(() => {
  const stage = document.getElementById('stage-act34');
  return {
    headlineWords: stage.querySelectorAll('#pl-headline .pl-word').length,
    stats: stage.querySelectorAll('.pl-stat').length,
    legend: stage.querySelectorAll('.pl-legend i').length,
    feed: stage.querySelector('#pl-feed').tagName,
    hasHeat: Boolean(stage.querySelector('#pl-heat')),
    hasTip: Boolean(stage.querySelector('#pl-tip')),
    ctaHref: stage.querySelector('.pl-link').getAttribute('href'),
    socialHref: document.querySelector('.xmit-social').getAttribute('href'),
  };
});
check('structure: 1 headline word, 4 stats, 5 legend swatches', structure.headlineWords === 1 && structure.stats === 4 && structure.legend === 5, JSON.stringify(structure));
check('feed + heatmap + tooltip nodes present', structure.feed === 'UL' && structure.hasHeat && structure.hasTip);
check('Pulse CTA + Act4 social hydrated to GITHUB_USER', structure.ctaHref === 'https://github.com/vishnuas22' && structure.socialHref === 'https://github.com/vishnuas22', `${structure.ctaHref} | ${structure.socialHref}`);

// ---------- 3. live data lands through fixture fetch ----------
await p.waitForFunction(() => window.__pulseProbe && window.__pulseProbe().source === 'live', { timeout: 8000, polling: 150 })
  .catch(() => {});
const live = await p.evaluate(() => window.__pulseProbe());
check('fixture fetch flips status to live', live.source === 'live', `source=${live.source}`);
check('heatmap renders exactly 366 cells', live.cells === 366, `${live.cells}`);

const cellsL4 = await p.evaluate(() => document.querySelectorAll('#stage-act34 .pl-cell.gh-l4').length);
const expectedL4 = contribDays.filter((d) => d.level === 4).length;
check('level-4 cell count matches fixture distribution', cellsL4 === expectedL4, `${cellsL4}/${expectedL4}`);

check('feed rows = 3 fixture events', live.rows === 3, `${live.rows}`);
check('repo chips = 3 (fork excluded)', live.chips === 3, `${live.chips}`);
check('magnetic targets wired (4 stats + CTA + 3 chips)', live.magnets === 8, `${live.magnets}`);

const feedBits = await p.evaluate(() => {
  const row = document.querySelector('#pl-feed .pl-row');
  return {
    repo: row.querySelector('.pl-row-repo').textContent,
    verb: row.querySelector('.pl-row-verb').textContent,
    time: Boolean(row.querySelector('time.pl-row-time')),
    glyph: row.querySelector('.pl-row-glyph').textContent,
    chipHrefs: [...document.querySelectorAll('#pl-recent .pl-chip')].map((a) => a.getAttribute('href')),
  };
});
check('feed row shape: repo + verb + <time> + glyph', feedBits.repo === 'vishnuas22/Portfolio' && feedBits.verb === 'pushed to main' && feedBits.time && feedBits.glyph === '↑', JSON.stringify(feedBits));
check('chip hrefs point at the three repos', feedBits.chipHrefs[0] === 'https://github.com/vishnuas22/Portfolio', feedBits.chipHrefs.join(','));

const status = await p.evaluate(() => {
  const s = document.querySelector('#stage-act34 .xmit-status');
  return { text: s.querySelector('#pl-status-text').textContent, live: s.classList.contains('is-live') };
});
check('status chip reads "Live from GitHub"', status.live && status.text === 'Live from GitHub', JSON.stringify(status));

// ---------- 4. count-up settles at fixture finals, one-shot ----------
await sleep(1700);
const finals = await p.evaluate(() => [...document.querySelectorAll('#stage-act34 .pl-stat-val')].map((el) => el.textContent));
const expectedFinals = [fmtNum(sumContrib), fmtNum(current), fmtNum(longest), fmtNum(activeDays)];
check('count-up settles at fixture finals', finals.join(',') === expectedFinals.join(','), `${finals} vs ${expectedFinals}`);

await jumpTo(p, 0.5);
await jumpTo(p, 0.935);
await sleep(600);
const reentry = await p.evaluate(() => [...document.querySelectorAll('#stage-act34 .pl-stat-val')].map((el) => el.textContent));
check('count-up is one-shot (no reset on re-entry)', reentry.join(',') === expectedFinals.join(','), reentry.join(','));


// ---------- 5. choreography var + pointer spotlight ----------
const p34 = await p.evaluate(() => window.__pulseProbe().p34);
check('--act34-p eased toward 1.0 at scroll 0.935', p34 > 0.4 && p34 <= 1, `p34=${p34}`);

await p.mouse.move(400, 450);
await p.mouse.move(1000, 250, { steps: 8 });
await sleep(450);
const spot = await p.evaluate(() => document.getElementById('stage-act34').style.getPropertyValue('--pl-spot-x'));
check('pointer spotlight tracks cursor', Boolean(spot) && spot !== '30.00%', `--pl-spot-x=${spot}`);

// ---------- 6. magnetic pull on a stat tile ----------
const magBefore = await p.evaluate(() => document.querySelector('#stage-act34 .pl-stat').style.transform);
const box = await (await p.$('#stage-act34 .pl-stat')).boundingBox();
await p.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 6 });
await sleep(450);
const magAfter = await p.evaluate(() => document.querySelector('#stage-act34 .pl-stat').style.transform);
check('magnetic spring engages on stat tile', Boolean(magAfter) && magAfter !== magBefore, magAfter);

// ---------- 7. heatmap hover tooltip ----------
await p.mouse.move(100, 100); // park away first
await sleep(150);
const cellBox = await (await p.$('#stage-act34 .pl-cell:nth-child(200)')).boundingBox();
await p.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2, { steps: 4 });
await sleep(300);
const tipState = await p.evaluate(() => {
  const t = document.querySelector('#pl-tip');
  return { on: t.classList.contains('on'), text: t.textContent };
});
check('hover tooltip opens with count + date', tipState.on && /contribution/.test(tipState.text), JSON.stringify(tipState));

// ---------- 8. phase label + nav sync ----------
const phase = await p.evaluate(() => ({
  label: document.getElementById('telemetry-phase').textContent,
  pill: [...document.querySelectorAll('.nav-item-pill')].findIndex((b) => b.getAttribute('aria-current') === 'true'),
  pillCount: document.querySelectorAll('.nav-item-pill').length,
}));
check('telemetry phase reads "Pulse — Live GitHub"', phase.label === 'Pulse — Live GitHub', phase.label);
check('nav rail has 7 pills, Pulse (idx 4) is current', phase.pillCount === 7 && phase.pill === 4, JSON.stringify(phase));

// ---------- 9. desktop fits viewport ----------
const desktopFit = await p.evaluate(() => {
  const stage = document.getElementById('stage-act34');
  const chips = [...stage.querySelectorAll('.pl-chip')];
  const last = chips[chips.length - 1].getBoundingClientRect();
  const heat = stage.querySelector('.pl-heat-scroll');
  return { bottom: last.bottom, vh: window.innerHeight, heatOverflow: heat.scrollWidth - heat.clientWidth };
});
check('desktop panel fully inside viewport', desktopFit.bottom <= desktopFit.vh && desktopFit.bottom > 0, `bottom=${Math.round(desktopFit.bottom)}/${desktopFit.vh}`);
check('desktop calendar needs no horizontal scroll', desktopFit.heatOverflow <= 0, `overflow=${desktopFit.heatOverflow}px`);

// ---------- 10. nav pill jump lands in the act ----------
await jumpTo(p, 0.5);
await p.evaluate(() => [...document.querySelectorAll('.nav-item-pill')].find((b) => b.textContent === 'Pulse').click());
// lenis glides for 1.4s, then currentProgress lerps — poll instead of guessing
const pillLanded = await p.waitForFunction(
  () => document.getElementById('stage-act34').classList.contains('stage-active'),
  { timeout: 7000, polling: 150 }
).then(() => true).catch(() => false);
check('"Pulse" nav pill lands inside the act', pillLanded);

// ---------- 11. mobile 390px ----------
await p.setViewport({ width: 390, height: 844 });
await sleep(700);
await jumpTo(p, 0.935);
await sleep(900);
const mobile = await p.evaluate(() => {
  const stage = document.getElementById('stage-act34');
  const grid = stage.querySelector('.pl-grid');
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const rows = [...stage.querySelectorAll('.pl-row')];
  const visibleRows = rows.filter((r) => getComputedStyle(r).display !== 'none').length;
  const totalRows = rows.length;
  const chips = [...stage.querySelectorAll('.pl-chip')];
  const lastChip = chips[chips.length - 1].getBoundingClientRect();
  const heat = stage.querySelector('.pl-heat-scroll');
  return {
    active: stage.classList.contains('stage-active'),
    cols, visibleRows, totalRows,
    lastChipBottom: lastChip.bottom,
    vh: window.innerHeight,
    heatScrolled: heat.scrollLeft > 0,
    descHidden: getComputedStyle(stage.querySelector('.pl-desc')).display === 'none',
  };
});
check('mobile act3.4 activates', mobile.active);
check('mobile grid collapses to single column', mobile.cols === 1, `${mobile.cols} cols`);
check('mobile intro copy folds away', mobile.descHidden);
check('mobile feed capped at 5 rows', mobile.visibleRows === Math.min(5, mobile.totalRows), `${mobile.visibleRows}/${mobile.totalRows}`);
check('mobile calendar auto-scrolled to recent weeks', mobile.heatScrolled);
check('mobile chips inside viewport', mobile.lastChipBottom <= mobile.vh && mobile.lastChipBottom > 0, `bottom=${Math.round(mobile.lastChipBottom)}/${mobile.vh}`);

// ---------- 12. hygiene gates ----------
check('no console errors (page 1)', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
check('no same-origin 404s (page 1)', failed404.length === 0, failed404.slice(0, 2).join(' | '));


// ============================================================================
// PAGE 2 — offline path: __GH_OFFLINE__ → embedded snapshot, zero requests
// ============================================================================
const page2 = await newInstrumentedPage();
await page2.p.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
await page2.p.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
await page2.p.evaluate(() => { window.__GH_OFFLINE__ = true; });
await sleep(600);
await jumpTo(page2.p, 0.935);
await sleep(1700);

const offline = await page2.p.evaluate(() => {
  const probe = window.__pulseProbe();
  const status = document.querySelector('#stage-act34 .xmit-status').textContent.trim();
  const stats = [...document.querySelectorAll('#stage-act34 .pl-stat-val')].map((el) => el.textContent);
  return { probe, status, stats };
});
const snapFinals = [
  fmtNum(snapshot.stats.contributions),
  fmtNum(snapshot.stats.currentStreak),
  fmtNum(snapshot.stats.longestStreak),
  fmtNum(snapshot.stats.activeDays),
];
check('offline: status stays on cached snapshot', offline.probe.source === 'snapshot' && offline.status.startsWith('Cached'), `${offline.probe.source} / ${offline.status}`);
check('offline: snapshot cells render', offline.probe.cells === snapshot.contributions.length, `${offline.probe.cells}/${snapshot.contributions.length}`);
check('offline: count-up settles at snapshot stats', offline.stats.join(',') === snapFinals.join(','), `${offline.stats} vs ${snapFinals}`);
check('offline: snapshot feed + chips render', offline.probe.rows === 7 && offline.probe.chips === 3, `rows=${offline.probe.rows} chips=${offline.probe.chips}`);
check('offline: zero external requests fired', page2.external.length === 0, page2.external.slice(0, 2).join(' | '));
check('offline: no console errors', page2.consoleErrors.length === 0, page2.consoleErrors.slice(0, 2).join(' | '));
check('offline: no same-origin 404s', page2.failed404.length === 0, page2.failed404.slice(0, 2).join(' | '));

// ============================================================================
// PAGE 3 — prefers-reduced-motion: everything lands instantly
// ============================================================================
const page3 = await newInstrumentedPage();
await page3.p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page3.p.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
await page3.p.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
await page3.p.evaluate(() => { window.__GH_OFFLINE__ = true; });
await sleep(600);
await jumpTo(page3.p, 0.935);
await sleep(400); // count-up duration is bypassed entirely under reduce

const reduced = await page3.p.evaluate(() => {
  const stage = document.getElementById('stage-act34');
  const cell = stage.querySelector('.pl-cell');
  const stat = stage.querySelector('.pl-stat-val');
  return {
    counted: window.__pulseProbe().counted,
    statText: [...stage.querySelectorAll('.pl-stat-val')].map((el) => el.textContent),
    cellOpacity: getComputedStyle(cell).opacity,
    cellTransition: getComputedStyle(cell).transitionDuration,
  };
});
const snapVals = snapFinals;
check('reduced-motion: stats land instantly at finals', reduced.counted && reduced.statText.join(',') === snapVals.join(','), reduced.statText.join(','));
check('reduced-motion: heatmap cells land instantly', reduced.cellOpacity === '1' && parseFloat(reduced.cellTransition) <= 0.05, `opacity=${reduced.cellOpacity} dur=${reduced.cellTransition}`);
check('reduced-motion: no console errors', page3.consoleErrors.length === 0, page3.consoleErrors.slice(0, 2).join(' | '));

// ============================================================================
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('failed:');
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}

