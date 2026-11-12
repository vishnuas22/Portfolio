import puppeteer from 'puppeteer-core';
const EXEC = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await puppeteer.launch({executablePath:EXEC, headless:'new', args:['--no-sandbox','--disable-gpu']});
const page = await browser.newPage();
await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
await page.setRequestInterception(true);
page.on('request', r => {
  const u=r.url();
  if (u.includes('/frames/') || u.includes('/audio/')) r.abort(); else r.continue();
});
await page.goto('http://127.0.0.1:5173/', {waitUntil:'domcontentloaded'});
await page.evaluate(()=>document.body.classList.add('is-ready'));
await new Promise(r=>setTimeout(r,800));
const positions = [0.08,0.32,0.49,0.56,0.915,0.935,0.955,0.985];
for (const p of positions) {
  await page.evaluate((p)=>{
    const hero=document.getElementById('hero'); const track=document.getElementById('scroll-wrapper');
    const y=hero.offsetHeight + (track.offsetHeight - innerHeight)*p;
    window.scrollTo(0,y);
  }, p);
  await new Promise(r=>setTimeout(r,1300));
  const data = await page.evaluate(()=>{
    const active=[...document.querySelectorAll('.stage-view.stage-active')].map(s=>({id:s.id, rect:s.getBoundingClientRect().toJSON(), scrollW:s.scrollWidth, scrollH:s.scrollHeight, clientH:s.clientHeight}));
    const els=[...document.querySelectorAll('.stage-view.stage-active .pl-desc, .stage-view.stage-active .xr-desc, .stage-view.stage-active .kp-desc, .stage-view.stage-active .kp-certs, .stage-view.stage-active .scene-copy, .stage-view.stage-active .still-frame, .stage-view.stage-active .reel-scene.is-active')].map(e=>({sel:e.className, rect:e.getBoundingClientRect().toJSON(), display:getComputedStyle(e).display, overflow:getComputedStyle(e).overflow, clientH:e.clientHeight, scrollH:e.scrollHeight}));
    const nav=document.querySelector('.nav-pill-group'); const brand=document.querySelector('.nav-brand'); const status=document.querySelector('.nav-status');
    return {scrollY:innerHeight, active, els, nav:nav.getBoundingClientRect().toJSON(), brand:brand.getBoundingClientRect().toJSON(), status:status.getBoundingClientRect().toJSON(), docW:document.documentElement.scrollWidth};
  });
  console.log('\nP',p, JSON.stringify(data,null,1));
  await page.screenshot({path:`/private/var/folders/zr/xhd5gptd36zgdy5mmcv4gjfc0000gp/T/opencode/pb-mobile-${String(p).replace('.','_')}.png`});
}
await browser.close();
