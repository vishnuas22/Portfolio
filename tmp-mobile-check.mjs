import puppeteer from 'puppeteer-core';
const EXEC = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await puppeteer.launch({executablePath:EXEC, headless:'new', args:['--no-sandbox','--disable-gpu']});
const page = await browser.newPage();
await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
await page.setRequestInterception(true);
page.on('request', r => { const u=r.url(); if (u.includes('/frames/') || u.includes('/audio/')) r.abort(); else r.continue(); });
page.on('console', m => { if (m.type()==='error') console.log('PAGE ERROR', m.text()); });
await page.goto('http://127.0.0.1:5173/', {waitUntil:'domcontentloaded'});
await page.evaluate(()=>document.body.classList.add('is-ready'));
await new Promise(r=>setTimeout(r,1000));

// nav open state
await page.click('#nav-menu-toggle');
await new Promise(r=>setTimeout(r,300));
let nav = await page.evaluate(()=>{
  const g=document.querySelector('.nav-pill-group'); const h=document.querySelector('.top-nav-bar');
  return {expanded:document.querySelector('#nav-menu-toggle').getAttribute('aria-expanded'), classes:h.className, display:getComputedStyle(g).display, rect:g.getBoundingClientRect().toJSON(), docW:document.documentElement.scrollWidth};
});
console.log('NAV OPEN', nav);
await page.screenshot({path:'/private/var/folders/zr/xhd5gptd36zgdy5mmcv4gjfc0000gp/T/opencode/pb-mobile-nav-open.png'});
await page.keyboard.press('Escape');
await new Promise(r=>setTimeout(r,200));
console.log('NAV CLOSED', await page.evaluate(()=>({expanded:document.querySelector('#nav-menu-toggle').getAttribute('aria-expanded'), display:getComputedStyle(document.querySelector('.nav-pill-group')).display})));

const positions = [0.49,0.50,0.56,0.60,0.72,0.915,0.935,0.955,0.985];
for (const p of positions) {
  await page.evaluate((p)=>{
    const hero=document.getElementById('hero'); const track=document.getElementById('scroll-wrapper');
    window.scrollTo(0, hero.offsetHeight + (track.offsetHeight - innerHeight)*p);
  }, p);
  await new Promise(r=>setTimeout(r,1200));
  const data = await page.evaluate(()=>{
    const active=[...document.querySelectorAll('.stage-view.stage-active')].map(s=>({id:s.id, rect:s.getBoundingClientRect().toJSON(), scrollW:s.scrollWidth, scrollH:s.scrollHeight, clientH:s.clientHeight}));
    const els=[...document.querySelectorAll('.stage-view.stage-active .pl-desc, .stage-view.stage-active .xr-desc, .stage-view.stage-active .kp-desc, .stage-view.stage-active .kp-certs, .stage-view.stage-active .scene-copy, .stage-view.stage-active .scene-blurb, .stage-view.stage-active .still-frame, .stage-view.stage-active .reel-scene.is-active, .stage-view.stage-active .xmit-frame, .stage-view.stage-active .xmit-grid')].map(e=>({sel:e.className, rect:e.getBoundingClientRect().toJSON(), display:getComputedStyle(e).display, overflow:getComputedStyle(e).overflow, clientH:e.clientHeight, scrollH:e.scrollHeight, clientW:e.clientWidth, scrollW:e.scrollWidth}));
    return {active, els, docW:document.documentElement.scrollWidth};
  });
  console.log('\nP',p, JSON.stringify(data));
  await page.screenshot({path:`/private/var/folders/zr/xhd5gptd36zgdy5mmcv4gjfc0000gp/T/opencode/pb2-mobile-${String(p).replace('.','_')}.png`});
}
await browser.close();
