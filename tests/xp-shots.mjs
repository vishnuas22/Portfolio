// After-screenshot + probe capture for ACT 3 (Experience & Education).
// usage: node tests/xp-shots.mjs   (dev server on :5173)
import puppeteer from 'puppeteer-core';

const EXEC = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: 'new',
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(2500);

async function jumpTo(p) {
  // Retry-hardened jump: the stale-lenis clamp can land immediate scrolls
  // short of target — re-fire resize + scroll until the probe converges.
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.evaluate((prog) => {
      window.dispatchEvent(new Event('resize'));
      const hero = document.getElementById('hero');
      const wrap = document.getElementById('scroll-wrapper');
      const max = wrap.offsetHeight - window.innerHeight;
      window.__lenis.scrollTo(hero.offsetHeight + max * prog, { immediate: true });
    }, p);
    const ok = await page
      .waitForFunction(
        (exp) => {
          const pr = window.__progressProbe();
          return Math.abs(pr.current - pr.target) < 0.002 && Math.abs(pr.target - exp) < 0.01;
        },
        { timeout: 2000, polling: 100 },
        p
      )
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }
  await sleep(1600);
}

await jumpTo(0.915);
await page.screenshot({ path: '.reeltest/shots/32-xp-after-mid.png' });
console.log('probe:', JSON.stringify(await page.evaluate(() => (window.__xpProbe ? window.__xpProbe() : null))));

await jumpTo(0.945);
await page.screenshot({ path: '.reeltest/shots/33-xp-after-exit.png' });

await page.setViewport({ width: 390, height: 844 });
await jumpTo(0.915);
await page.screenshot({ path: '.reeltest/shots/34-xp-after-mobile.png' });
console.log('after shots saved');
await browser.close();
process.exit(0);
