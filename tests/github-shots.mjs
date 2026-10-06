// Visual shot harness for ACT 3.4 (The Pulse — live GitHub activity)
// usage: node tests/github-shots.mjs   (dev server on :5173 must be running)
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
// Snapshot rendering = deterministic shots (real data, zero network).
await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
await page.evaluate(() => { window.__GH_OFFLINE__ = true; });
await sleep(1200);

async function jumpTo(prog) {
  // retry-hardened convergence (stale-lenis clamp protection) — see papers-shots
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.evaluate((x) => {
      window.dispatchEvent(new Event('resize'));
      const hero = document.getElementById('hero');
      const wrap = document.getElementById('scroll-wrapper');
      const max = wrap.offsetHeight - window.innerHeight;
      window.__lenis.scrollTo(hero.offsetHeight + max * x, { immediate: true });
    }, prog);
    await page.waitForFunction(
      (exp) => {
        const pr = window.__progressProbe();
        return Math.abs(pr.current - pr.target) < 0.002 && Math.abs(pr.target - exp) < 0.01;
      },
      { timeout: 3000, polling: 100 },
      prog
    ).catch(() => {});
    const ok = await page.evaluate((exp) => {
      const pr = window.__progressProbe();
      return Math.abs(pr.target - exp) < 0.01 && Math.abs(pr.current - pr.target) < 0.002;
    }, prog);
    if (ok) break;
    await sleep(350);
  }
  await sleep(1400); // entrance cascade + count-up settle
}

// act entry: cascade in progress
await jumpTo(0.928);
await page.screenshot({ path: `${SHOTS}/44-pulse-entry.png` });

// mid-act: fully settled
await jumpTo(0.935);
console.log('probe:', JSON.stringify(await page.evaluate(() => window.__pulseProbe())));
await page.screenshot({ path: `${SHOTS}/45-pulse-mid.png` });

// mobile
await page.setViewport({ width: 390, height: 844 });
await sleep(700);
await jumpTo(0.935);
await page.screenshot({ path: `${SHOTS}/46-pulse-mobile.png` });

console.log('pulse shots saved');
await browser.close();
