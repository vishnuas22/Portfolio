// Visual shot harness for ACT 0 (Hero title card) — desktop / rotation / phone / reduced-motion
// usage: node tests/hero-shots.mjs   (dev server on :5173 must be running)
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

// 1) Desktop — entrance settled
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
  await sleep(1400);
  const state = await page.evaluate(() => ({
    ready: document.body.classList.contains('is-ready'),
    kickerOpacity: getComputedStyle(document.querySelector('.hero-kicker')).opacity,
    taglineOpacity: getComputedStyle(document.querySelector('.hero-tagline')).opacity,
    cueOpacity: getComputedStyle(document.querySelector('.hero-scroll-cue')).opacity,
    viewportClip: getComputedStyle(document.querySelector('.role-viewport')).overflow,
    trackRect: document.querySelector('.role-track').getBoundingClientRect().height,
  }));
  console.log('desktop:', JSON.stringify(state));
  await page.screenshot({ path: `${SHOTS}/50-hero-desktop.png` });

  // rotation check: sample the track transform across a swap window
  const t1 = await page.evaluate(() => getComputedStyle(document.querySelector('.role-track')).transform);
  await sleep(3400);
  const t2 = await page.evaluate(() => getComputedStyle(document.querySelector('.role-track')).transform);
  console.log('rotation:', t1, '->', t2, t1 !== t2 ? '(SWAPPED ✓)' : '(NO CHANGE ✗)');
  await page.screenshot({ path: `${SHOTS}/51-hero-desktop-rotated.png` });
  console.log('desktop errors:', errors.length ? JSON.stringify(errors) : 'none');
  await page.close();
}

// 2) Phone (390×844)
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
  await sleep(1400);
  await page.screenshot({ path: `${SHOTS}/52-hero-mobile.png` });
  await page.close();
}

// 3) Reduced motion — must render a static, fully-visible composition
{
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
  await sleep(1400);
  const state = await page.evaluate(() => ({
    ready: document.body.classList.contains('is-ready'),
    trackAnim: getComputedStyle(document.querySelector('.role-track')).animationName,
    kickerOpacity: getComputedStyle(document.querySelector('.hero-kicker')).opacity,
    roleText: document.querySelector('.role-item').textContent,
  }));
  console.log('reduced-motion:', JSON.stringify(state));
  await page.screenshot({ path: `${SHOTS}/53-hero-reduced.png` });
  await page.close();
}

// 4) hero-past pause: scrolling past the hero must freeze the ambient loops
{
  const page = await browser.newPage();
  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#loader.hidden', { timeout: 30000 }).catch(() => {});
  await sleep(1400);
  await page.evaluate(() => {
    const hero = document.getElementById('hero');
    window.__lenis.scrollTo(hero.offsetHeight * 2, { immediate: true });
  });
  await sleep(600);
  const state = await page.evaluate(() => ({
    heroPast: document.getElementById('hero').classList.contains('hero-past'),
    trackPlay: getComputedStyle(document.querySelector('.role-track')).animationPlayState,
    grainPlay: getComputedStyle(document.querySelector('.hero-grain')).animationPlayState,
  }));
  console.log('hero-past:', JSON.stringify(state));
  await page.screenshot({ path: `${SHOTS}/54-hero-past-paused.png` });
  await page.close();
}

await browser.close();
console.log('hero shots done');
