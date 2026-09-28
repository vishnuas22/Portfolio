// Visual shot harness for ACT 3.5 (Knowledge Sharing — Publications Ledger)
// usage: node tests/papers-shots.mjs   (dev server on :5173 must be running)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const EXEC = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const URL_ = 'http://localhost:5173/';
const SHOTS = '.reeltest/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: 'new',
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
await sleep(1200);

async function jumpTo(p) {
  // retry-hardened convergence: resize + immediate re-scroll until the probe
  // settles on the expected progress (stale-lenis clamp protection)
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
  await sleep(1800); // let springs/count-up settle
}

// mid-act: cards landed, rail drawn, count-up settled
await jumpTo(0.955);
console.log('probe:', JSON.stringify(await page.evaluate(() => window.__papersProbe())));
await page.screenshot({ path: `${SHOTS}/40-papers-mid.png` });

// act exit: handoff edge toward Act 4
await jumpTo(0.968);
await page.screenshot({ path: `${SHOTS}/41-papers-exit.png` });

// mobile — the ledger must fit one phone viewport
await page.setViewport({ width: 390, height: 844 });
await sleep(700);
await jumpTo(0.955);
await page.screenshot({ path: `${SHOTS}/42-papers-mobile.png` });

console.log('shots saved');
await browser.close();
