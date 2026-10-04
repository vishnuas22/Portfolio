// Visual shot harness for the Soundscape (tour button + sound toggle)
// usage: node tests/audio-shots.mjs   (dev server on :5173 must be running)
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
  args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1440, height: 900 },
});

// 1) Desktop hero — tour button + sound toggle visible after entrance
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
  await sleep(1600);
  await page.screenshot({ path: `${SHOTS}/65-hero-tour.png` });
  console.log('desktop:', JSON.stringify(await page.evaluate(() => ({
    ready: document.body.classList.contains('is-ready'),
    tourLabel: document.querySelector('.tour-btn-label').textContent.trim(),
    soundPressed: document.getElementById('sound-toggle').getAttribute('aria-pressed'),
    probe: window.__audioProbe(),
  }))));

  // 2) Tour engaged — scrolled, label swapped, score playing
  await page.click('#hero-tour');
  await sleep(2600);
  await page.screenshot({ path: `${SHOTS}/66-tour-active.png` });
  console.log('tour:', JSON.stringify(await page.evaluate(() => ({
    y: Math.round(window.scrollY),
    label: document.querySelector('.tour-btn-label').textContent.trim(),
    probe: window.__audioProbe(),
  }))));

  // 3) Muted toggle state (top, fresh load so the hero is on screen)
  await page.evaluate(() => { if (window.__audioProbe().touring) document.getElementById('hero-tour').click(); });
  await page.evaluate(() => window.__lenis.scrollTo(0, { immediate: true }));
  await sleep(600);
  await page.click('#sound-toggle');
  await sleep(400);
  await page.screenshot({ path: `${SHOTS}/67-sound-muted.png` });
  console.log('muted:', JSON.stringify(await page.evaluate(() => ({
    muted: window.__audioProbe().muted,
    cls: document.getElementById('sound-toggle').className,
  }))));
  console.log('desktop errors:', errors.length ? JSON.stringify(errors) : 'none');
  await page.close();
}

// 4) Phone (390×844)
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
  await sleep(1600);
  await page.screenshot({ path: `${SHOTS}/68-hero-tour-mobile.png` });
  await page.close();
}

// 5) Reduced motion — tour button hidden, sound toggle stays
{
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
  await sleep(1000);
  await page.screenshot({ path: `${SHOTS}/69-hero-reduced-no-tour.png` });
  console.log('reduced:', JSON.stringify(await page.evaluate(() => ({
    tour: getComputedStyle(document.getElementById('hero-tour')).display,
    toggle: getComputedStyle(document.getElementById('sound-toggle')).display,
  }))));
  await page.close();
}

await browser.close();
console.log('shots saved');
