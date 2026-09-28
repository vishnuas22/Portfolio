// Baseline screenshots for ACT 1 (Distributed Systems) — planning reference.
// usage: node tests/act1-baseline.mjs   (dev server on :5173)
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
await sleep(1500);

async function jumpTo(p) {
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
  await sleep(600);
}

await jumpTo(0.06);
await page.screenshot({ path: `${SHOTS}/20-act1-baseline-entry.png` });
await jumpTo(0.10);
await page.screenshot({ path: `${SHOTS}/21-act1-baseline-mid.png` });
await jumpTo(0.18);
await page.screenshot({ path: `${SHOTS}/22-act1-baseline-exit.png` });
await page.setViewport({ width: 390, height: 844 });
await jumpTo(0.10);
await page.screenshot({ path: `${SHOTS}/23-act1-baseline-mobile.png` });
console.log('baseline shots saved');
await browser.close();
process.exit(0);
