import Lenis from 'lenis';
import Matter from 'matter-js';
import { initProjectReel } from './projects.js';
import { initSoundscape } from './audio.js';
import { initGithubAct } from './github.js';

const TOTAL_FRAMES = 472;
const MAX_CONCURRENT = 12;
const INITIAL_BUFFER_COUNT = 24;
// Scoped warm-up + release window: first visits only stream frames near the
// playhead (not all 472 ≈ 916MB), and far-from-playhead Image references are
// dropped so a session can't pin the whole film in memory. Eviction band is
// wider than the prefetch band on purpose — hysteresis, no evict/refetch
// thrash. Bytes on disk/CDN are untouched (frames stay 4K).
const PREFETCH_AHEAD = 90;  // warm frames ahead of the playhead
const PREFETCH_BEHIND = 40; // …and a short trail behind (priority loops cover 40/20 first)
const EVICT_AHEAD = 130;    // release band: [idx-EVICT_BEHIND, idx+EVICT_AHEAD]
const EVICT_BEHIND = 50;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const hero = document.getElementById('hero');
const scrollWrapper = document.getElementById('scroll-wrapper');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');

// Safety: if the frame buffer ever stalls, never strand the hero copy invisible.
setTimeout(() => document.body.classList.add('is-ready'), 5000);

// Telemetry DOM elements
const telemetryFrame = document.getElementById('telemetry-frame');
const telemetryPct = document.getElementById('telemetry-pct');
const telemetryProgressFill = document.getElementById('telemetry-progress-fill');
const telemetryPhase = document.getElementById('telemetry-phase');
const navItemPills = document.querySelectorAll('.nav-item-pill');

// --- Contact mailbox — one constant, stamped everywhere at boot -------------
// When the temporary address is replaced: change this + the static mirrors
// flagged "CONTACT EMAIL" in index.html (JSON-LD + copy-button text node).
const CONTACT_EMAIL = 'thedataghost8@gmail.com';

// --- GitHub identity — one constant, stamped everywhere at boot -------------
// When the handle is replaced: change this + the static mirrors flagged
// "GITHUB USER" in index.html (Pulse CTA + Act 4 social icon).
const GITHUB_USER = 'vishnuas22';

function hydrateContactEmail() {
  document.querySelectorAll('[data-email]').forEach((el) => {
    el.dataset.email = CONTACT_EMAIL;
    if ((el.getAttribute('aria-label') || '').includes('@')) {
      el.setAttribute('aria-label', `Copy email address ${CONTACT_EMAIL}`);
    }
  });
  document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
    const query = a.getAttribute('href').split('?')[1] || '';
    a.href = `mailto:${CONTACT_EMAIL}${query ? '?' + query : ''}`;
  });
  const chars = document.getElementById('xmit-email-chars');
  // initConnectAct() does the per-char split later — only refresh plain text.
  if (chars && !chars.dataset.split) chars.textContent = CONTACT_EMAIL;
}
hydrateContactEmail();

// --- Hero résumé CTA — graceful until public/resume.pdf is uploaded ---------
function initResumeCta() {
  const btn = document.getElementById('hero-resume');
  const status = document.getElementById('resume-status');
  if (!btn) return;
  let pending = false;
  let statusTimer = 0;

  const showStatus = (msg) => {
    if (!status) return;
    status.textContent = msg;
    status.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => status.classList.remove('show'), 2600);
  };

  // HEAD probe must verify the response really is a PDF: dev servers may
  // answer SPA fallbacks with 200 text/html, which would break the download.
  fetch('/resume.pdf', { method: 'HEAD' })
    .then((r) => {
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || !ct.includes('pdf')) throw new Error(`HEAD ${r.status} ${ct}`);
    })
    .catch(() => {
      pending = true;
      btn.classList.add('is-pending');
      btn.setAttribute('aria-disabled', 'true');
      btn.removeAttribute('download');
    });

  btn.addEventListener('click', (e) => {
    if (pending) {
      e.preventDefault();
      showStatus('Résumé PDF coming soon — email me for a copy');
    }
  });
}
initResumeCta();

// Narrative Stage DOM elements
const stageAct1 = document.getElementById('stage-act1');
const stageAct2 = document.getElementById('stage-act2');
const stageAct3 = document.getElementById('stage-act3');
const stageAct35 = document.getElementById('stage-act35');
const stageAct34 = document.getElementById('stage-act34');
const stageAct4 = document.getElementById('stage-act4');
const stageAct25 = document.getElementById('stage-act2-5');

// State
const images = new Array(TOTAL_FRAMES).fill(null);
const loaded = new Array(TOTAL_FRAMES).fill(false);
const loading = new Array(TOTAL_FRAMES).fill(false);

let loadedCount = 0;
let isInitialReady = false;
let currentProgress = 0;
let targetProgress = 0;
let currentlyDisplayedIndex = -1;
let activeDownloads = 0;
let progressVel = 0;         // per-frame delta of targetProgress (scroll velocity)
let prevTargetProgress = 0;
let rewindPhaseUntil = 0;    // while future-dated: telemetry phase reads "⏪ Rewinding…"
let connectAct = null;       // Act 4 controller, assigned during init
let papersAct = null;        // Act 3.5 controller, assigned during init
let pulseAct = null;         // Act 3.4 controller, assigned during init
let xpAct = null;            // Act 3 controller, assigned during init
let lastNavIndex = -1;       // last nav pill index written (aria/current sync)

// Path helper
function getFramePath(index) {
  const padded = String(index + 1).padStart(4, '0');
  return `/frames/frame_${padded}.webp`;
}

// prefers-reduced-motion is honored from the very first frame: smooth-scroll
// easing and auto-impulses are motion features, so they opt out at construction.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Lenis smooth scroll
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: !prefersReducedMotion,
  touchMultiplier: 1.5,
});

// Update scroll progress relative to hero and scroll track
function updateScrollProgress(scrollPos = window.scrollY) {
  const heroHeight = hero ? hero.offsetHeight : window.innerHeight;
  // Pause hero ambient motion (role cycle, grain, drift) once scrolled offscreen
  if (hero) hero.classList.toggle('hero-past', scrollPos > heroHeight * 0.9);
  const trackHeight = scrollWrapper ? scrollWrapper.offsetHeight : 0;
  const maxTrackScroll = trackHeight - window.innerHeight;

  if (maxTrackScroll <= 0) {
    targetProgress = 0;
    return;
  }

  const current = scrollPos - heroHeight;
  targetProgress = Math.max(0, Math.min(1, current / maxTrackScroll));
}

lenis.on('scroll', (e) => {
  updateScrollProgress(e.scroll);
});
// Viewport changes can flip the nav rail between centered and overflow-scroll
// layouts — force the next sync to re-center the active pill.
window.addEventListener('resize', () => {
  lastNavIndex = -1;
});
window.__lenis = lenis; // exposed for deep-linking / test harness
window.__progressProbe = () => ({ target: targetProgress, current: currentProgress });

// ==========================================================================
// FILM SAFE AREA — dynamic letterbox calibration.
// The video frames have black letterbox bars baked in (~11% top/bottom).
// We scan a known-bright frame once at runtime to find the exact bar edges,
// then convert to on-screen pixels for the current cover-fit crop and expose
// them as --film-top / --film-bottom CSS vars. All UI lives inside those.
// ==========================================================================
const filmState = {
  top: 0.111,          // fraction of frame height that is black bar (top)
  bottom: 0.111,       // fraction of frame height that is black bar (bottom)
  frameW: 3840,
  frameH: 2160,
  calibrated: false,
};
const CALIBRATION_FRAME = 235; // frame_0236.webp — guaranteed bright content

function applyFilmRect() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.max(vw / filmState.frameW, vh / filmState.frameH);
  const renderedH = filmState.frameH * scale;
  const y0 = (vh - renderedH) / 2;

  const filmTop = y0 + renderedH * filmState.top;
  const filmBottomEdge = y0 + renderedH * (1 - filmState.bottom);

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--film-top', `${Math.max(0, filmTop).toFixed(1)}px`);
  rootStyle.setProperty('--film-bottom', `${Math.max(0, vh - filmBottomEdge).toFixed(1)}px`);
}

function calibrateFilmBounds(img) {
  try {
    const W = 128;
    const H = Math.max(24, Math.round(W * (img.naturalHeight / img.naturalWidth)));
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, 0, 0, W, H);
    const data = octx.getImageData(0, 0, W, H).data;

    const rowLum = new Array(H).fill(0);
    for (let y = 0; y < H; y++) {
      let sum = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      rowLum[y] = sum / W;
    }

    let first = 0;
    let last = H - 1;
    while (first < H && rowLum[first] < 12) first++;
    while (last >= 0 && rowLum[last] < 12) last--;

    if (first > 2 && last < H - 3 && first < last) {
      filmState.top = first / H;
      filmState.bottom = (H - 1 - last) / H;
      filmState.frameW = img.naturalWidth;
      filmState.frameH = img.naturalHeight;
      filmState.calibrated = true;
      applyFilmRect();
    }
  } catch (err) {
    // Cross-origin or decode issue — keep the sensible 11% defaults.
  }
}

// Resize canvas handling
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  applyFilmRect();
  updateScrollProgress();
  drawFrame(currentlyDisplayedIndex >= 0 ? currentlyDisplayedIndex : 0);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Find closest loaded frame in sequence
function getClosestLoadedFrame(index) {
  if (loaded[index] && images[index]) {
    return { img: images[index], index };
  }

  let closestDist = Infinity;
  let closestIdx = -1;

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    if (loaded[i] && images[i]) {
      const dist = Math.abs(i - index);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
        if (dist === 0) break;
      }
    }
  }

  if (closestIdx >= 0) {
    return { img: images[closestIdx], index: closestIdx };
  }

  return null;
}

// Draw frame to canvas
function drawFrame(index) {
  const result = getClosestLoadedFrame(index);
  if (!result || !result.img) return;

  const { img, index: actualIndex } = result;

  const cw = canvas.width;
  const ch = canvas.height;
  const iw = img.naturalWidth || 3840;
  const ih = img.naturalHeight || 2160;

  // Cover aspect ratio
  const imgRatio = iw / ih;
  const canvasRatio = cw / ch;

  let dw, dh, dx, dy;

  if (canvasRatio > imgRatio) {
    dw = cw;
    dh = cw / imgRatio;
    dx = 0;
    dy = (ch - dh) / 2;
  } else {
    dh = ch;
    dw = ch * imgRatio;
    dx = (cw - dw) / 2;
    dy = 0;
  }

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
  currentlyDisplayedIndex = actualIndex;
}

// Single image load trigger
function loadSingleFrame(index) {
  if (images[index] || loading[index] || loaded[index]) return;

  loading[index] = true;
  activeDownloads++;

  const img = new Image();
  img.decoding = 'async';

  img.onload = () => {
    loading[index] = false;
    loaded[index] = true;
    images[index] = img;
    activeDownloads--;
    loadedCount++;

    const pct = Math.round((loadedCount / TOTAL_FRAMES) * 100);
    if (loaderText) loaderText.textContent = `Loading ${pct}%`;

    // Calibrate the letterbox safe-area from a known-bright frame
    if (index === CALIBRATION_FRAME && !filmState.calibrated) {
      calibrateFilmBounds(img);
    }

    // Draw frame 0 immediately once ready
    if (index === 0 && currentlyDisplayedIndex === -1) {
      drawFrame(0);
    }

    // Hide loader once initial buffer is ready
    if (!isInitialReady && (loaded[0] || loadedCount >= INITIAL_BUFFER_COUNT)) {
      isInitialReady = true;
      // Kick off the hero title-card entrance (Act 0) in sync with the loader
      document.body.classList.add('is-ready');
      if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => {
          loader.style.display = 'none';
        }, 600);
      }
    }

    // Redraw if this newly loaded frame is closer to current target
    const currentTarget = Math.round(currentProgress * (TOTAL_FRAMES - 1));
    if (Math.abs(index - currentTarget) < Math.abs(currentlyDisplayedIndex - currentTarget)) {
      drawFrame(currentTarget);
    }

    pumpQueue();
  };

  img.onerror = () => {
    loading[index] = false;
    activeDownloads--;
    pumpQueue();
  };

  img.src = getFramePath(index);
}

// Priority queue for scrubbing
function pumpQueue() {
  if (activeDownloads >= MAX_CONCURRENT) return;

  const currentIdx = Math.round(currentProgress * (TOTAL_FRAMES - 1));
  const queue = [];
  const added = new Set();

  function addToQueue(idx) {
    if (idx >= 0 && idx < TOTAL_FRAMES && !loaded[idx] && !loading[idx] && !added.has(idx)) {
      added.add(idx);
      queue.push(idx);
    }
  }

  // Priority: playhead forward, then recent backward…
  for (let i = 0; i <= 40; i++) addToQueue(currentIdx + i);
  for (let i = 1; i <= 20; i++) addToQueue(currentIdx - i);
  // …then the rest of the warm window — deliberately NOT the whole film.
  for (let i = -PREFETCH_BEHIND; i <= PREFETCH_AHEAD; i++) addToQueue(currentIdx + i);

  while (activeDownloads < MAX_CONCURRENT && queue.length > 0) {
    const nextIdx = queue.shift();
    loadSingleFrame(nextIdx);
  }
}

// Release Image references far from the playhead (memory only — the frames
// themselves stay 4K on disk; scrolling back into a released zone simply
// re-queues them, and after the first visit the immutable cache serves them
// from disk). Runs at most once the playhead has moved ≥8 frames so idle
// frames never thrash. `loaded[]` must flip too, or addToQueue would treat a
// released frame as still cached and never re-fetch it.
let lastEvictIdx = -999;
function evictFarFrames() {
  if (!isInitialReady) return;
  const idx = Math.round(currentProgress * (TOTAL_FRAMES - 1));
  if (Math.abs(idx - lastEvictIdx) < 8) return;
  lastEvictIdx = idx;
  const lo = idx - EVICT_BEHIND;
  const hi = idx + EVICT_AHEAD;
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    if (!images[i]) continue;
    if (i === currentlyDisplayedIndex) continue; // the frame painted on canvas
    if (i === CALIBRATION_FRAME && !filmState.calibrated) continue; // letterbox needs it once
    if (i < lo || i > hi) {
      images[i] = null;
      loaded[i] = false;
    }
  }
}

// ==========================================================================
// NARRATIVE ACTS & TELEMETRY SYNCHRONIZATION
// ==========================================================================
function updateNarrativeLayers(progress, targetIndex) {
  if (telemetryFrame) {
    telemetryFrame.textContent = `Frame ${String(targetIndex + 1).padStart(3, '0')} / ${TOTAL_FRAMES}`;
  }
  if (telemetryPct) {
    telemetryPct.textContent = `${Math.round(progress * 100)}%`;
  }
  if (telemetryProgressFill) {
    telemetryProgressFill.style.width = `${progress * 100}%`;
  }

  let phaseName = 'Prologue';
  let activeNavIndex = 0;

  // Act 1: Systems (0.02 - 0.20)
  const isAct1 = progress >= 0.02 && progress < 0.20;
  if (stageAct1) stageAct1.classList.toggle('stage-active', isAct1);

  // Act 2: Technical Expertise Playground (0.22 - 0.46) — physics paused off-act
  const isAct2 = progress >= 0.22 && progress < 0.46;
  if (stageAct2) {
    const wasActive = stageAct2.classList.contains('stage-active');
    stageAct2.classList.toggle('stage-active', isAct2);
    if (isAct2 && !wasActive) {
      if (window.__setPlaygroundActive) window.__setPlaygroundActive(true);
      // Auto-impulse is decorative motion — skip it under prefers-reduced-motion.
      if (!prefersReducedMotion && window.triggerPhysicsImpulse) window.triggerPhysicsImpulse();
    }
    if (!isAct2 && wasActive && window.__setPlaygroundActive) {
      window.__setPlaygroundActive(false);
    }
  }

  // Act 2.5: The Project Reel — active window is wider than the scene-mapping
  // range (0.48–0.86) so the first/last scenes keep a dwell tail instead of
  // deactivating the stage the instant they settle into place.
  const isReel = progress >= 0.46 && progress < 0.88;
  if (stageAct25) {
    stageAct25.classList.toggle('stage-active', isReel);
    if (reel) {
      reel.setActive(isReel);
      if (isReel) reel.update(Math.min(1, Math.max(0, (progress - 0.48) / 0.38)));
    }
  }

  // Act 3: Experience & Education — The Service Record (0.88 - 0.925)
  const isAct3 = progress >= 0.88 && progress < 0.925;
  if (stageAct3) stageAct3.classList.toggle('stage-active', isAct3);
  if (xpAct) xpAct.setActive(isAct3);

  // Act 3.4: The Pulse — Live GitHub Activity (0.925 - 0.945)
  const isAct34 = progress >= 0.925 && progress < 0.945;
  if (stageAct34) stageAct34.classList.toggle('stage-active', isAct34);
  if (pulseAct) pulseAct.setActive(isAct34);

  // Act 3.5: Knowledge Sharing — Publications & Credentials (0.945 - 0.97)
  const isAct35 = progress >= 0.945 && progress < 0.97;
  if (stageAct35) stageAct35.classList.toggle('stage-active', isAct35);
  if (papersAct) papersAct.setActive(isAct35);

  // Act 4: The Handshake / Transmission Terminal (0.97 - 1.0)
  const isAct4 = progress >= 0.97;
  if (stageAct4) stageAct4.classList.toggle('stage-active', isAct4);
  if (connectAct) connectAct.setActive(isAct4);

  if (progress < 0.02) {
    phaseName = 'Prologue';
    activeNavIndex = 0;
  } else if (progress < 0.20) {
    phaseName = 'Distributed Systems';
    activeNavIndex = 0;
  } else if (progress < 0.46) {
    phaseName = 'Technical Expertise';
    activeNavIndex = 1;
  } else if (progress < 0.88) {
    phaseName = 'Project Reel';
    activeNavIndex = 2;
  } else if (progress < 0.925) {
    phaseName = 'Experience & Education';
    activeNavIndex = 3;
  } else if (progress < 0.945) {
    phaseName = 'Pulse — Live GitHub';
    activeNavIndex = 4;
  } else if (progress < 0.97) {
    phaseName = 'Knowledge Sharing';
    activeNavIndex = 5;
  } else {
    phaseName = 'Connect Terminal';
    activeNavIndex = 6;
  }

  // Cinematic rewind label overrides the phase readout until the scroll
  // replay finishes (self-expires; belt-and-braces via the Date.now check).
  if (Date.now() < rewindPhaseUntil) {
    phaseName = '⏪ Rewinding…';
  }

  if (telemetryPhase) {
    telemetryPhase.textContent = phaseName;
  }

  navItemPills.forEach((pill, idx) => {
    const on = idx === activeNavIndex;
    pill.classList.toggle('active', on);
    if (on) pill.setAttribute('aria-current', 'true');
    else pill.removeAttribute('aria-current');
  });

  // Keep the active pill visible in the mobile scrollable rail (never scrolls
  // the page itself — only the pill group's own overflow).
  if (activeNavIndex !== lastNavIndex) {
    lastNavIndex = activeNavIndex;
    const pill = navItemPills[activeNavIndex];
    if (pill) {
      const rail = pill.parentElement;
      if (rail && rail.scrollWidth > rail.clientWidth + 1) {
        const target = pill.offsetLeft - (rail.clientWidth - pill.offsetWidth) / 2;
        rail.scrollTo({ left: Math.max(0, target), behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }
    }
  }
}

// Main animation loop
function tick(time) {
  lenis.raf(time);

  // Belt & braces: derive target from actual scroll position every frame so
  // scrollbar drags, anchor jumps and immediate scrolls never go stale.
  updateScrollProgress(window.scrollY);

  // Soundscape: idle detection, fades and the auto-tour deviation guard all
  // ride this same rAF tick (audio.js).
  soundscape.frame(window.scrollY, time);

  const lerpFactor = 0.14;
  currentProgress += (targetProgress - currentProgress) * lerpFactor;

  if (Math.abs(targetProgress - currentProgress) < 0.0001) {
    currentProgress = targetProgress;
  }

  // Scroll velocity (per-frame target delta) — feeds the Act 4 headline skew.
  progressVel = targetProgress - prevTargetProgress;
  prevTargetProgress = targetProgress;

  const targetIndex = Math.min(
    TOTAL_FRAMES - 1,
    Math.max(0, Math.round(currentProgress * (TOTAL_FRAMES - 1)))
  );

  if (currentlyDisplayedIndex !== targetIndex) {
    drawFrame(targetIndex);
  }

  evictFarFrames();
  updateNarrativeLayers(currentProgress, targetIndex);
  pumpQueue();

  requestAnimationFrame(tick);
}

// ==========================================================================
// GAMIFIED TECHNICAL EXPERTISE — REAL-BRAND ICON PHYSICS POOL (MATTER.JS)
// ==========================================================================
// Icons are the official vendor logos, vendored locally in /public/icons.
// Skills without an official brand mark use a custom inline glyph (G:).
const CAT_COLORS = {
  'ai-llm': { color: '#4285f4', glow: 'rgba(66, 133, 244, 0.45)' },
  'frameworks': { color: '#a78bfa', glow: 'rgba(167, 139, 250, 0.45)' },
  'ml-dl': { color: '#f9ab00', glow: 'rgba(249, 171, 0, 0.45)' },
  'cloud-infra': { color: '#34a853', glow: 'rgba(52, 168, 83, 0.45)' },
  'backend': { color: '#ea4335', glow: 'rgba(234, 67, 53, 0.45)' },
};

const SKILLS_DATA = [
  // 1. AI & LLM Engineering
  { name: 'Python', cat: 'ai-llm', icon: 'python.svg', kind: 'img' },
  { name: 'LLMs', cat: 'ai-llm', icon: 'googlegemini.svg', kind: 'img' },
  { name: 'Generative AI', cat: 'ai-llm', glyph: '✦', tint: '#a78bfa' },
  { name: 'RAG Systems', cat: 'ai-llm', glyph: '⌘', tint: '#8ab4f8' },
  { name: 'Prompt Engineering', cat: 'ai-llm', glyph: '✎', tint: '#fdd663' },
  { name: 'LLM APIs', cat: 'ai-llm', icon: 'openai.svg', kind: 'img' },
  { name: 'Embeddings', cat: 'ai-llm', glyph: '⁂', tint: '#81c995' },

  // 2. LLM & Agent Frameworks
  { name: 'LangChain', cat: 'frameworks', icon: 'langchain.svg', kind: 'img' },
  { name: 'LangGraph', cat: 'frameworks', icon: 'langgraph.svg', kind: 'img' },
  { name: 'CrewAI', cat: 'frameworks', icon: 'crewai.svg', kind: 'img' },
  { name: 'LangSmith', cat: 'frameworks', glyph: '◈', tint: '#c5e1ff' },
  { name: 'HF Transformers', cat: 'frameworks', icon: 'huggingface.svg', kind: 'img' },
  { name: 'MCP', cat: 'frameworks', icon: 'mcp-white.svg', kind: 'img' },

  // 3. Machine Learning & Deep Learning
  { name: 'PyTorch', cat: 'ml-dl', icon: 'pytorch.svg', kind: 'img' },
  { name: 'TensorFlow', cat: 'ml-dl', icon: 'tensorflow.svg', kind: 'img' },
  { name: 'Scikit-learn', cat: 'ml-dl', icon: 'scikitlearn.svg', kind: 'img' },
  { name: 'Deep Learning', cat: 'ml-dl', glyph: '⌬', tint: '#a78bfa' },
  { name: 'Computer Vision', cat: 'ml-dl', icon: 'opencv.svg', kind: 'img' },
  { name: 'Fine-Tuning', cat: 'ml-dl', glyph: '⚡', tint: '#fdd663' },

  // 4. Cloud & Deployment
  { name: 'AWS EC2 · S3 · Lambda', cat: 'cloud-infra', icon: 'aws.svg', kind: 'img' },
  { name: 'Docker', cat: 'cloud-infra', icon: 'docker.svg', kind: 'img' },
  { name: 'Git', cat: 'cloud-infra', icon: 'git.svg', kind: 'img' },
  { name: 'CI / CD', cat: 'cloud-infra', glyph: '↻', tint: '#81c995' },
  { name: 'Observability', cat: 'cloud-infra', glyph: '◎', tint: '#4ec9d4' },
  { name: 'Monitoring', cat: 'cloud-infra', glyph: '∿', tint: '#8ab4f8' },

  // 5. AI Application & Backend Engineering
  { name: 'FastAPI', cat: 'backend', icon: 'fastapi.svg', kind: 'img' },
  { name: 'REST APIs', cat: 'backend', glyph: '⇄', tint: '#8ab4f8' },
  { name: 'Async Programming', cat: 'backend', glyph: '∞', tint: '#a78bfa' },
  { name: 'Vector DBs', cat: 'backend', glyph: '▤', tint: '#f28b82' },
  { name: 'Semantic Search', cat: 'backend', glyph: '⌕', tint: '#4ec9d4' },
  { name: 'SQL & Database', cat: 'backend', icon: 'mysql.svg', kind: 'img' },
];

const GOOGLE_CONFETTI = ['#4285f4', '#ea4335', '#fbbc05', '#34a853'];

// ---------- FX helpers (Web Animations API — no CSS keyframe plumbing) ----------
function spawnSparks(container, x, y, color, count = 9, spread = 46) {
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    dot.className = 'fx-spark';
    const c = GOOGLE_CONFETTI[i % GOOGLE_CONFETTI.length];
    dot.style.background = color || c;
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    container.appendChild(dot);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = spread * (0.5 + Math.random() * 0.8);
    dot.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95 },
        { transform: `translate(${Math.cos(angle) * dist - 3}px, ${Math.sin(angle) * dist - 3}px) scale(0.25)`, opacity: 0 },
      ],
      { duration: 480 + Math.random() * 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    ).finished.then(() => dot.remove()).catch(() => dot.remove());
  }
}

function spawnConfettiAt(clientX, clientY, count = 16) {
  const layer = document.getElementById('fx-layer');
  if (!layer) return;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'fx-confetti';
    piece.style.background = GOOGLE_CONFETTI[i % GOOGLE_CONFETTI.length];
    piece.style.left = `${clientX}px`;
    piece.style.top = `${clientY}px`;
    layer.appendChild(piece);

    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 90;
    piece.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist - 4}px, ${Math.sin(angle) * dist - 60}px) rotate(${(Math.random() - 0.5) * 540}deg) scale(0.4)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    ).finished.then(() => piece.remove()).catch(() => piece.remove());
  }
}

// ---------- The Pool: physics playground ----------
function initGamifiedPlayground() {
  const container = document.getElementById('physics-playground');
  if (!container) return;

  const { Engine, World, Bodies, Body, Mouse, MouseConstraint, Events, Runner } = Matter;

  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0.001 } });
  const world = engine.world;
  let isZeroG = true;
  let width = container.clientWidth || 900;
  let height = container.clientHeight || 520;
  let activeCat = 'all';
  let lastSparkAt = 0;

  // ----- Mastery state (persisted) -----
  const XP_KEY = 'vishnu.xp.v1';
  let xpState;
  try {
    xpState = JSON.parse(localStorage.getItem(XP_KEY)) || { discovered: {} };
  } catch (err) {
    xpState = { discovered: {} };
  }
  if (!xpState.discovered) xpState.discovered = {};

  // ----- Walls -----
  const wallThickness = 80;
  const ground = Bodies.rectangle(width / 2, height + wallThickness / 2, width * 2, wallThickness, { isStatic: true });
  const ceiling = Bodies.rectangle(width / 2, -wallThickness / 2, width * 2, wallThickness, { isStatic: true });
  const leftWall = Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height * 2, { isStatic: true });
  const rightWall = Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height * 2, { isStatic: true });
  World.add(world, [ground, ceiling, leftWall, rightWall]);

  // ----- Beads -----
  const BEAD = 66; // matches .skill-bead size
  const beads = [];

  function buildBead(skill, i) {
    const el = document.createElement('div');
    el.className = 'skill-bead';
    el.style.setProperty('--cat-color', CAT_COLORS[skill.cat].color);

    const visual = skill.kind === 'img'
      ? `<img src="/icons/${skill.icon}" alt="" draggable="false" />`
      : `<span class="bead-glyph" style="color:${skill.tint}">${skill.glyph}</span>`;

    el.innerHTML = `
      <div class="bead-core">
        <span class="bead-pulse"></span>
        <span class="bead-icon">${visual}</span>
        <span class="bead-tip">${skill.name}</span>
        <span class="bead-check">✓</span>
      </div>`;

    container.appendChild(el);

    const startX = 80 + Math.random() * Math.max(40, width - 160);
    const startY = 60 + Math.random() * Math.max(40, height - 140);

    const body = Bodies.circle(startX, startY, BEAD / 2, {
      restitution: 0.62,
      friction: 0.03,
      frictionAir: 0.02,
      density: 0.001,
    });

    Body.setVelocity(body, { x: (Math.random() - 0.5) * 2.4, y: (Math.random() - 0.5) * 2.4 });

    const rec = { skill, el, body, target: null, dragStart: null, dragStartT: 0 };
    if (xpState.discovered[skill.name]) el.classList.add('discovered');
    beads.push(rec);
    World.add(world, body);
    return rec;
  }

  SKILLS_DATA.forEach((skill, i) => buildBead(skill, i));

  const beadByBody = new Map(beads.map((r) => [r.body, r]));

  // ----- Mouse drag -----
  const mouse = Mouse.create(container);
  const mouseConstraint = MouseConstraint.create(engine, {
    mouse,
    constraint: { stiffness: 0.22, render: { visible: false } },
  });
  World.add(world, mouseConstraint);

  Events.on(mouseConstraint, 'startdrag', (e) => {
    const rec = beadByBody.get(e.body);
    if (!rec) return;
    rec.dragStart = { x: rec.body.position.x, y: rec.body.position.y };
    rec.dragStartT = performance.now();
    rec.el.classList.add('is-dragged');
  });

  Events.on(mouseConstraint, 'enddrag', (e) => {
    const rec = beadByBody.get(e.body);
    if (!rec) return;
    rec.el.classList.remove('is-dragged');
    if (!rec.dragStart) return;
    const dx = rec.body.position.x - rec.dragStart.x;
    const dy = rec.body.position.y - rec.dragStart.y;
    const moved = Math.sqrt(dx * dx + dy * dy);
    const dt = performance.now() - rec.dragStartT;
    rec.dragStart = null;
    // A tap (barely moved, quick) masters the skill
    if (moved < 14 && dt < 350) discoverSkill(rec);
  });

  // ----- Physics → DOM sync + behaviors -----
  Events.on(engine, 'afterUpdate', () => {
    const cx = width / 2;
    const cy = height * 0.55;
    const constellating = activeCat !== 'all';
    const springK = isZeroG ? 0.00045 : 0.0018;

    beads.forEach((rec) => {
      const { body, el } = rec;
      el.style.transform = `translate3d(${(body.position.x - BEAD / 2).toFixed(2)}px, ${(body.position.y - BEAD / 2).toFixed(2)}px, 0)`;

      if (constellating) {
        if (rec.skill.cat === activeCat && rec.target) {
          // Spring toward the constellation slot, damped so it settles
          Body.applyForce(body, body.position, {
            x: (rec.target.x - body.position.x) * springK,
            y: (rec.target.y - body.position.y) * springK,
          });
          Body.setVelocity(body, { x: body.velocity.x * 0.9, y: body.velocity.y * 0.9 });
        } else {
          // Drift the rest away from the spotlight
          const dx = body.position.x - cx;
          const dy = body.position.y - cy;
          const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          Body.applyForce(body, body.position, {
            x: (dx / len) * 0.00004,
            y: (dy / len) * 0.00004,
          });
        }
      } else if (isZeroG) {
        // Buoyant wander so beads never get stuck in zero-g
        if (Math.abs(body.velocity.x) < 0.12 && Math.abs(body.velocity.y) < 0.12) {
          Body.applyForce(body, body.position, {
            x: (Math.random() - 0.5) * 0.0004,
            y: (Math.random() - 0.5) * 0.0004,
          });
        }
      }
    });
  });

  // ----- Collision micro-effects -----
  Events.on(engine, 'collisionStart', (e) => {
    const now = performance.now();
    if (now - lastSparkAt < 90) return;
    for (const pair of e.pairs) {
      const relVx = (pair.bodyA.velocity.x || 0) - (pair.bodyB.velocity.x || 0);
      const relVy = (pair.bodyA.velocity.y || 0) - (pair.bodyB.velocity.y || 0);
      const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);
      if (relSpeed < 6) continue;

      const support = pair.collision && pair.collision.supports && pair.collision.supports[0];
      const sx = support ? support.x : (pair.bodyA.position.x + pair.bodyB.position.x) / 2;
      const sy = support ? support.y : (pair.bodyA.position.y + pair.bodyB.position.y) / 2;
      const recA = beadByBody.get(pair.bodyA);
      const recB = beadByBody.get(pair.bodyB);
      const color = (recA || recB) ? CAT_COLORS[(recA || recB).skill.cat].color : '#8ab4f8';
      spawnSparks(container, sx, sy, color, 6, 30);

      [recA, recB].forEach((rec) => {
        if (!rec) return;
        rec.el.classList.add('bead-impact');
        setTimeout(() => rec.el.classList.remove('bead-impact'), 110);
      });
      lastSparkAt = now;
      break;
    }
  });

  const runner = Runner.create();
  // Simulation only runs while Act 2 is on screen (perf win)
  window.__setPlaygroundActive = function (on) {
    if (on) Runner.run(runner, engine);
    else Runner.stop(runner);
  };
  window.__setPlaygroundActive(false);

  // ----- Mastery (gamification) -----
  const xpCountEl = document.getElementById('xp-count');
  const xpTotalEl = document.getElementById('xp-total');
  const xpRingEl = document.getElementById('xp-ring-fill');
  const RING_LEN = 113.1;

  function updateXPUI() {
    const total = SKILLS_DATA.length;
    const count = beads.filter((r) => xpState.discovered[r.skill.name]).length;
    if (xpCountEl) xpCountEl.textContent = String(count);
    if (xpTotalEl) xpTotalEl.textContent = String(total);
    if (xpRingEl) {
      xpRingEl.style.strokeDashoffset = String(RING_LEN * (1 - count / total));
      xpRingEl.style.stroke = count === total ? '#81c995' : '#8ab4f8';
    }
  }

  function updateChipProgress() {
    document.querySelectorAll('.chip-progress').forEach((span) => {
      const cat = span.getAttribute('data-progress-for');
      const inCat = beads.filter((r) => r.skill.cat === cat);
      const done = inCat.filter((r) => xpState.discovered[r.skill.name]).length;
      span.textContent = `${done}/${inCat.length}`;
      const chip = span.closest('.filter-chip');
      if (chip) chip.classList.toggle('cat-complete', done === inCat.length && done > 0);
    });
  }

  function discoverSkill(rec, silent = false) {
    const key = rec.skill.name;
    const isNew = !xpState.discovered[key];
    xpState.discovered[key] = true;
    try {
      localStorage.setItem(XP_KEY, JSON.stringify(xpState));
    } catch (err) { /* private mode — session-only mastery */ }

    rec.el.classList.add('discovered', 'pop');
    setTimeout(() => rec.el.classList.remove('pop'), 750);

    if (isNew && !silent) {
      const rect = rec.el.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      spawnSparks(
        container,
        rect.left - cRect.left + rect.width / 2,
        rect.top - cRect.top + rect.height / 2,
        CAT_COLORS[rec.skill.cat].color,
        10,
        52
      );
    }

    // Category complete? Celebrate on the chip.
    const inCat = beads.filter((r) => r.skill.cat === rec.skill.cat);
    const allDone = inCat.every((r) => xpState.discovered[r.skill.name]);
    if (isNew && allDone) {
      const chip = document.querySelector(`.chip-progress[data-progress-for="${rec.skill.cat}"]`);
      if (chip) {
        const cr = chip.getBoundingClientRect();
        spawnConfettiAt(cr.left + cr.width / 2, cr.top + cr.height / 2, 18);
      }
    }

    updateXPUI();
    updateChipProgress();
  }

  // Restore progress UI on load
  updateXPUI();
  updateChipProgress();

  // ----- Category constellation -----
  function arrangeConstellation(cat) {
    const members = beads.filter((r) => r.skill.cat === cat);
    const n = members.length;
    const cx = width / 2;
    const cy = height * 0.55;
    const radius = Math.min(width, height) * 0.34;
    members.forEach((rec, i) => {
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
      rec.target = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * 0.82 };
      rec.el.classList.remove('dimmed');
      rec.el.classList.add('in-constellation');
    });
    beads.forEach((rec) => {
      if (rec.skill.cat !== cat) {
        rec.target = null;
        rec.el.classList.add('dimmed');
        rec.el.classList.remove('in-constellation');
      }
    });
  }

  function releaseConstellation() {
    beads.forEach((rec) => {
      rec.target = null;
      rec.el.classList.remove('dimmed', 'in-constellation');
      Body.applyForce(rec.body, rec.body.position, {
        x: (Math.random() - 0.5) * 0.005,
        y: (Math.random() - 0.5) * 0.004 - 0.002,
      });
    });
  }

  const filterChips = document.querySelectorAll('.filter-chip');
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const cat = chip.getAttribute('data-category');
      if (cat === 'all') {
        activeCat = 'all';
        releaseConstellation();
      } else {
        activeCat = cat;
        arrangeConstellation(cat);
      }
    });
  });

  // ----- Gravity toggle: Zero-G vs Earth -----
  const gravityBtn = document.getElementById('gravity-toggle-btn');
  const gravityIcon = document.getElementById('gravity-icon');
  const gravityLabel = document.getElementById('gravity-label');

  if (gravityBtn) {
    gravityBtn.addEventListener('click', () => {
      isZeroG = !isZeroG;
      if (isZeroG) {
        engine.gravity.y = 0;
        if (gravityIcon) gravityIcon.textContent = '🪐';
        if (gravityLabel) gravityLabel.textContent = 'Zero-G';
        window.triggerPhysicsImpulse();
      } else {
        engine.gravity.y = 0.8;
        if (gravityIcon) gravityIcon.textContent = '🍎';
        if (gravityLabel) gravityLabel.textContent = 'Earth';
      }
    });
  }

  // ----- Regroup -----
  const resetBtn = document.getElementById('reset-physics-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      beads.forEach(({ body }) => {
        const dx = width / 2 - body.position.x;
        const dy = height / 2 - body.position.y;
        Body.applyForce(body, body.position, {
          x: dx * 0.00006 + (Math.random() - 0.5) * 0.005,
          y: dy * 0.00006 - 0.005,
        });
      });
    });
  }

  // ----- Act entrance impulse -----
  window.triggerPhysicsImpulse = function () {
    beads.forEach(({ body }) => {
      Body.applyForce(body, body.position, {
        x: (Math.random() - 0.5) * 0.004,
        y: -0.003 - Math.random() * 0.003,
      });
    });
  };

  // ----- Resize -----
  window.addEventListener('resize', () => {
    width = container.clientWidth || 900;
    height = container.clientHeight || 520;

    Body.setPosition(ground, { x: width / 2, y: height + wallThickness / 2 });
    Body.setPosition(ceiling, { x: width / 2, y: -wallThickness / 2 });
    Body.setPosition(leftWall, { x: -wallThickness / 2, y: height / 2 });
    Body.setPosition(rightWall, { x: width + wallThickness / 2, y: height / 2 });

    if (activeCat !== 'all') arrangeConstellation(activeCat);
  });
}

// ==========================================================================
// NAVIGATION & CONTACT INTERACTIONS
// ==========================================================================
function initNavPills() {
  navItemPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const targetP = parseFloat(pill.getAttribute('data-target') || '0');
      const heroHeight = hero ? hero.offsetHeight : window.innerHeight;
      const trackHeight = scrollWrapper ? scrollWrapper.offsetHeight : 0;
      const maxTrackScroll = trackHeight - window.innerHeight;

      const targetScroll = heroHeight + maxTrackScroll * targetP;
      lenis.scrollTo(targetScroll, { duration: 1.4 });
    });
  });
}

// ==========================================================================
// ACT 4: THE HANDSHAKE — TRANSMISSION TERMINAL
// Real physics (damped-spring magnetic elements, scroll-velocity skew),
// JS-eased scroll choreography (--act4-p), live Bengaluru clock and a
// console typewriter. Everything runs only while the act is on screen.
// ==========================================================================
// ==========================================================================
// ACT 3: EXPERIENCE & EDUCATION — "THE SERVICE RECORD" controller.
// Same lifecycle contract as the Transmission Terminal: setActive(true/false)
// gates a single rAF, so the act costs nothing off-screen. Real damped-spring
// magnets on stat tiles & credential rows, scroll-velocity headline skew,
// JS-eased --act3-p scroll choreography, and a one-shot easeOutExpo count-up
// of the telemetry stats.
// ==========================================================================
function initXpAct() {
  const stage = stageAct3;
  if (!stage) return { setActive() {} };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const headline = document.getElementById('xp-headline');
  const statEls = Array.from(stage.querySelectorAll('.xr-stat-val'));

  // ----- one-shot telemetry count-up (easeOutExpo, staggered per stat) -----
  let countedOnce = false;
  let countRaf = 0;

  const setStatFinal = () => {
    statEls.forEach((el) => {
      el.textContent = el.dataset.count + (el.dataset.suffix || '');
    });
  };

  const setStatsZero = () => {
    statEls.forEach((el) => {
      el.textContent = '0' + (el.dataset.suffix || '');
    });
  };

  function runCountUp() {
    if (countedOnce || !statEls.length) return;
    countedOnce = true;
    if (reduceMotion) { setStatFinal(); return; }
    const t0 = performance.now();
    const DUR = 1150;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / DUR);
      statEls.forEach((el, i) => {
        const delay = i * 0.12;
        const local = Math.min(1, Math.max(0, (t - delay) / (1 - delay)));
        const eased = local >= 1 ? 1 : 1 - Math.pow(2, -10 * local);
        el.textContent = Math.round(el.dataset.count * eased) + (el.dataset.suffix || '');
      });
      if (t < 1) {
        countRaf = requestAnimationFrame(step);
      } else {
        setStatFinal();
        countRaf = 0;
      }
    };
    countRaf = requestAnimationFrame(step);
  }

  // ----- magnetic elements (real damped springs, same constants as Act 4) --
  const magnets = [];
  if (finePointer && !reduceMotion) {
    stage.querySelectorAll('[data-magnetic]').forEach((el) => {
      magnets.push({
        el,
        rect: null,
        x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
        moved: false,
        maxShift: 5,
      });
    });
  }

  let pointerX = -1e4;
  let pointerY = -1e4;
  let spotX = 30;
  let spotY = 45;
  let spotTX = 30;
  let spotTY = 45;

  // ----- pointer tracking (spotlight + magnet field) -----
  function onPointerMove(e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
    const r = stage.getBoundingClientRect();
    spotTX = ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
    spotTY = ((e.clientY - r.top) / Math.max(1, r.height)) * 100;
  }

  function onPointerOut() {
    pointerX = -1e4;
    pointerY = -1e4;
    spotTX = 30;
    spotTY = 45;
  }

  function cacheRects() {
    magnets.forEach((m) => { m.rect = m.el.getBoundingClientRect(); });
  }

  function updateMagnets() {
    for (const m of magnets) {
      if (!m.rect || !m.rect.width) {
        m.rect = m.el.getBoundingClientRect();
        if (!m.rect.width) continue;
      }
      const cx = m.rect.left + m.rect.width / 2;
      const cy = m.rect.top + m.rect.height / 2;
      const dx = pointerX - cx;
      const dy = pointerY - cy;
      const dist = Math.hypot(dx, dy);
      const radius = 110 + Math.max(m.rect.width, m.rect.height) / 2;
      if (dist < radius && dist > 0.001) {
        const falloff = 1 - dist / radius;
        m.tx = Math.max(-m.maxShift, Math.min(m.maxShift, dx * 0.28 * falloff));
        m.ty = Math.max(-m.maxShift, Math.min(m.maxShift, dy * 0.28 * falloff));
      } else {
        m.tx = 0;
        m.ty = 0;
      }
      // semi-implicit Euler damped spring (slight overshoot, true settle)
      m.vx = (m.vx + (m.tx - m.x) * 0.16) * 0.74;
      m.vy = (m.vy + (m.ty - m.y) * 0.16) * 0.74;
      m.x += m.vx;
      m.y += m.vy;
      if (Math.abs(m.x) < 0.02 && Math.abs(m.y) < 0.02 && m.tx === 0 && m.ty === 0) {
        if (m.moved) {
          m.el.style.transform = '';
          m.moved = false;
        }
        m.x = 0; m.y = 0; m.vx = 0; m.vy = 0;
      } else {
        m.moved = true;
        m.el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`;
      }
    }
  }

  // ----- scroll-velocity headline skew (the reel's inertia language) -----
  let skew = 0;
  let skewed = false;

  function updateSkew() {
    if (!headline) return;
    const target = Math.max(-1.2, Math.min(1.2, progressVel * 220));
    skew += (target - skew) * 0.12;
    skew *= 0.86;
    if (Math.abs(skew) > 0.02) {
      skewed = true;
      headline.style.transform = `skewY(${skew.toFixed(3)}deg)`;
    } else if (skewed) {
      skewed = false;
      skew = 0;
      headline.style.transform = '';
    }
  }

  // ----- act loop (runs only while the act is on screen) -----
  let active = false;
  let rafId = 0;
  let p3 = 0;

  function loop() {
    if (!active) return;
    if (!reduceMotion) {
      // Choreography completes at scroll 0.92 (Act 3's window now ends 0.925,
      // where Act 3.4 The Pulse takes over); xp-test asserts p3 > 0.4 at 0.915.
      const p3Target = Math.min(1, Math.max(0, (targetProgress - 0.88) / 0.04));
      p3 += (p3Target - p3) * 0.09;
      if (Math.abs(p3Target - p3) < 0.001) p3 = p3Target;
      stage.style.setProperty('--act3-p', p3.toFixed(4));

      spotX += (spotTX - spotX) * 0.14;
      spotY += (spotTY - spotY) * 0.14;
      stage.style.setProperty('--xp-spot-x', `${spotX.toFixed(2)}%`);
      stage.style.setProperty('--xp-spot-y', `${spotY.toFixed(2)}%`);

      updateMagnets();
      updateSkew();
    }
    rafId = requestAnimationFrame(loop);
  }

  function resetVisuals() {
    stage.style.setProperty('--act3-p', '0');
    p3 = 0;
    spotX = spotTX = 30;
    spotY = spotTY = 45;
    if (headline) headline.style.transform = '';
    skewed = false;
    skew = 0;
    magnets.forEach((m) => {
      m.x = 0; m.y = 0; m.vx = 0; m.vy = 0;
      m.el.style.transform = '';
      m.moved = false;
    });
    if (!countedOnce && statEls.length) setStatsZero();
  }

  function setActive(on) {
    if (on === active) return;
    active = on;
    if (on) {
      cacheRects();
      runCountUp();
      if (finePointer && !reduceMotion) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        stage.addEventListener('pointerleave', onPointerOut);
      }
      rafId = requestAnimationFrame(loop);
    } else {
      window.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerleave', onPointerOut);
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (countRaf) { cancelAnimationFrame(countRaf); countRaf = 0; }
      resetVisuals();
    }
  }

  window.addEventListener('resize', cacheRects);

  // Test-harness probe
  window.__xpProbe = () => ({
    active,
    p3,
    counted: countedOnce,
    statText: statEls.map((el) => el.textContent),
    magnets: magnets.length,
  });


  return { setActive };
}

// ==========================================================================
// ACT 3.5 — KNOWLEDGE SHARING: PUBLICATIONS & CREDENTIALS LEDGER
// ==========================================================================
// Borderless cinematic archive. Same physics language as Act 3: JS-eased
// --act35-p scroll choreography, one-shot easeOutExpo count-up, damped-spring
// magnets — plus real 3D paper tilt (rotateX/rotateY springs) on the citation
// cards and spark-burst copy-citation micro-interaction.
// ==========================================================================
function initPapersAct() {
  const stage = stageAct35;
  if (!stage) return { setActive() {} };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const magneticOn = finePointer && !reduceMotion;
  const fxLayer = document.getElementById('fx-layer');

  const statEls = Array.from(stage.querySelectorAll('.kp-stat-val'));

  // ----- one-shot count-up (easeOutExpo, staggered, zero-padded) -----
  let countedOnce = false;
  let countRaf = 0;
  const fmt = (el, n) => {
    const s = String(n);
    return el.dataset.pad ? s.padStart(Number(el.dataset.pad), '0') : s;
  };
  const setStatFinal = () => statEls.forEach((el) => { el.textContent = fmt(el, el.dataset.count); });
  const setStatsZero = () => statEls.forEach((el) => { el.textContent = fmt(el, 0); });

  function runCountUp() {
    if (countedOnce || !statEls.length) return;
    countedOnce = true;
    if (reduceMotion) { setStatFinal(); return; }
    const t0 = performance.now();
    const DUR = 1150;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / DUR);
      statEls.forEach((el, i) => {
        const delay = i * 0.12;
        const local = Math.min(1, Math.max(0, (t - delay) / (1 - delay)));
        const eased = local >= 1 ? 1 : 1 - Math.pow(2, -10 * local);
        el.textContent = fmt(el, Math.round(el.dataset.count * eased));
      });
      if (t < 1) {
        countRaf = requestAnimationFrame(step);
      } else {
        setStatFinal();
        countRaf = 0;
      }
    };
    countRaf = requestAnimationFrame(step);
  }

  // ----- physics pools -----
  // papers: translate spring (lands from 26px with overshoot) + tilt springs
  const papers = Array.from(stage.querySelectorAll('.kp-paper')).map((el) => ({
    el, rect: null,
    x: 0, y: 26, vx: 0, vy: 0,
    rx: 0, ry: 0, vrx: 0, vry: 0,
    settled: false,
  }));

  // plain magnets: stats, chips, buttons — pure translate, same constants as Act 3/4.
  // Paper cards also carry data-magnetic but get their pull merged into the tilt
  // spring below (one transform writer per element) instead of this pool.
  const magnets = [];
  if (magneticOn) {
    stage.querySelectorAll('.kp-stat, .kp-cert-row, .kp-link, .kp-cite').forEach((el) => {
      magnets.push({ el, rect: null, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, moved: false, maxShift: 5 });
    });
  }

  let pointerX = -1e4;
  let pointerY = -1e4;
  let spotX = 30, spotY = 45, spotTX = 30, spotTY = 45;

  function onPointerMove(e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
    const r = stage.getBoundingClientRect();
    spotTX = ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
    spotTY = ((e.clientY - r.top) / Math.max(1, r.height)) * 100;
  }
  function onPointerOut() {
    pointerX = -1e4;
    pointerY = -1e4;
    spotTX = 30;
    spotTY = 45;
  }

  function cacheRects() {
    papers.forEach((p) => { p.rect = p.el.getBoundingClientRect(); });
    magnets.forEach((m) => { m.rect = m.el.getBoundingClientRect(); });
  }

  function updatePhysics() {
    // paper cards: land from 26px + pointer tilt (3D paper weight) + magnetic pull
    for (const p of papers) {
      if (!p.rect || !p.rect.width) { p.rect = p.el.getBoundingClientRect(); continue; }
      const cx = p.rect.left + p.rect.width / 2;
      const cy = p.rect.top + p.rect.height / 2;
      // magnetic rest target — same falloff constants as the plain magnets below
      let mtx = 0;
      let mty = 0;
      if (magneticOn) {
        const mdx = pointerX - cx;
        const mdy = pointerY - cy;
        const mdist = Math.hypot(mdx, mdy);
        const mrad = 110 + Math.max(p.rect.width, p.rect.height) / 2;
        if (mdist < mrad && mdist > 0.001) {
          const fall = 1 - mdist / mrad;
          mtx = Math.max(-5, Math.min(5, mdx * 0.28 * fall));
          mty = Math.max(-5, Math.min(5, mdy * 0.28 * fall));
        }
      }
      // translate spring toward the magnetic offset (0 when the pointer is away)
      p.vx = (p.vx + (mtx - p.x) * 0.16) * 0.74;
      p.vy = (p.vy + (mty - p.y) * 0.16) * 0.74;
      p.x += p.vx;
      p.y += p.vy;
      // tilt spring: normalized pointer offset drives rotateX/rotateY targets
      const nx = Math.max(-1.2, Math.min(1.2, (pointerX - cx) / (p.rect.width / 2)));
      const ny = Math.max(-1.2, Math.min(1.2, (pointerY - cy) / (p.rect.height / 2)));
      const off = pointerX === -1e4;
      const trx = off ? 0 : Math.max(-2.6, Math.min(2.6, -ny * 2.4));
      const tryD = off ? 0 : Math.max(-3.2, Math.min(3.2, nx * 2.8));
      p.vrx = (p.vrx + (trx - p.rx) * 0.16) * 0.74;
      p.vry = (p.vry + (tryD - p.ry) * 0.16) * 0.74;
      p.rx += p.vrx;
      p.ry += p.vry;
      const still =
        Math.abs(p.x) < 0.02 && Math.abs(p.y) < 0.02 &&
        Math.abs(p.rx) < 0.02 && Math.abs(p.ry) < 0.02 &&
        Math.abs(trx) < 0.01 && Math.abs(tryD) < 0.01 &&
        Math.abs(mtx) < 0.01 && Math.abs(mty) < 0.01;
      if (still) {
        if (!p.settled) {
          p.el.style.transform = '';
          p.settled = true;
        }
        p.x = 0; p.y = 0; p.vx = 0; p.vy = 0;
        p.rx = 0; p.ry = 0; p.vrx = 0; p.vry = 0;
      } else {
        p.settled = false;
        p.el.style.transform =
          `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0) ` +
          `perspective(720px) rotateX(${p.rx.toFixed(3)}deg) rotateY(${p.ry.toFixed(3)}deg)`;
      }
    }
    // plain magnets
    for (const m of magnets) {
      if (!m.rect || !m.rect.width) {
        m.rect = m.el.getBoundingClientRect();
        if (!m.rect.width) continue;
      }
      const cx = m.rect.left + m.rect.width / 2;
      const cy = m.rect.top + m.rect.height / 2;
      const dx = pointerX - cx;
      const dy = pointerY - cy;
      const dist = Math.hypot(dx, dy);
      const radius = 110 + Math.max(m.rect.width, m.rect.height) / 2;
      if (dist < radius && dist > 0.001) {
        const falloff = 1 - dist / radius;
        m.tx = Math.max(-m.maxShift, Math.min(m.maxShift, dx * 0.28 * falloff));
        m.ty = Math.max(-m.maxShift, Math.min(m.maxShift, dy * 0.28 * falloff));
      } else {
        m.tx = 0;
        m.ty = 0;
      }
      m.vx = (m.vx + (m.tx - m.x) * 0.16) * 0.74;
      m.vy = (m.vy + (m.ty - m.y) * 0.16) * 0.74;
      m.x += m.vx;
      m.y += m.vy;
      if (Math.abs(m.x) < 0.02 && Math.abs(m.y) < 0.02 && m.tx === 0 && m.ty === 0) {
        if (m.moved) { m.el.style.transform = ''; m.moved = false; }
        m.x = 0; m.y = 0; m.vx = 0; m.vy = 0;
      } else {
        m.moved = true;
        m.el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`;
      }
    }
  }

  // ----- act loop (gated to on-screen frames) -----
  let active = false;
  let rafId = 0;
  let p35 = 0;

  function loop() {
    if (!active) return;
    if (!reduceMotion) {
      // Choreography completes at scroll 0.955 (mid-act dwell tail, mirrors
      // Act 3's completion) — papers-test asserts p35 > 0.9 at 0.955.
      // Window starts at 0.945 (Act 3.4's exit edge).
      const p35Target = Math.min(1, Math.max(0, (targetProgress - 0.945) / 0.010));
      p35 += (p35Target - p35) * 0.09;
      if (Math.abs(p35Target - p35) < 0.001) p35 = p35Target;
      stage.style.setProperty('--act35-p', p35.toFixed(4));

      spotX += (spotTX - spotX) * 0.14;
      spotY += (spotTY - spotY) * 0.14;
      stage.style.setProperty('--kp-spot-x', `${spotX.toFixed(2)}%`);
      stage.style.setProperty('--kp-spot-y', `${spotY.toFixed(2)}%`);

      updatePhysics();
    }
    rafId = requestAnimationFrame(loop);
  }

  function resetVisuals() {
    stage.style.setProperty('--act35-p', '0');
    p35 = 0;
    spotX = spotTX = 30;
    spotY = spotTY = 45;
    papers.forEach((p) => {
      p.x = 0; p.y = 26; p.vx = 0; p.vy = 0;
      p.rx = 0; p.ry = 0; p.vrx = 0; p.vry = 0;
      p.el.style.transform = '';
    });
    magnets.forEach((m) => {
      m.x = 0; m.y = 0; m.vx = 0; m.vy = 0;
      m.el.style.transform = '';
      m.moved = false;
    });
    if (!countedOnce && statEls.length) setStatsZero();
  }

  function setActive(on) {
    if (on === active) return;
    active = on;
    if (on) {
      cacheRects();
      runCountUp();
      if (!reduceMotion) {
        papers.forEach((p) => { p.el.style.transform = 'translate3d(0px, 26px, 0)'; });
      }
      if (finePointer && !reduceMotion) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        stage.addEventListener('pointerleave', onPointerOut);
      }
      rafId = requestAnimationFrame(loop);
    } else {
      window.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerleave', onPointerOut);
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (countRaf) { cancelAnimationFrame(countRaf); countRaf = 0; }
      resetVisuals();
    }
  }

  // ----- copy-citation micro-interaction (sparks + label morph) -----
  stage.querySelectorAll('.kp-cite').forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    let timer = 0;
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(btn.dataset.cite || ''); } catch (err) { /* noop */ }
      btn.classList.add('copied');
      const label = btn.querySelector('.kp-cite-label');
      if (label) label.textContent = 'Copied ✓';
      const r = btn.getBoundingClientRect();
      spawnSparks(fxLayer || btn, r.left + r.width / 2, r.top + r.height / 2, null, 10, 46);
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.classList.remove('copied');
        if (label) label.textContent = 'Copy Citation';
      }, 2400);
    });
  });

  window.addEventListener('resize', cacheRects);

  // Test-harness probe
  window.__papersProbe = () => ({
    active,
    p35,
    counted: countedOnce,
    statText: statEls.map((el) => el.textContent),
    magnets: magnets.length + papers.length,
  });

  return { setActive };
}

function initConnectAct() {
  const stage = stageAct4;
  if (!stage) return { setActive() {} };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const EMAIL = CONTACT_EMAIL; // single source of truth — top of file
  const emailBtn = document.getElementById('copy-email-button');
  const emailCharsEl = document.getElementById('xmit-email-chars');
  const hintLabel = emailBtn ? emailBtn.querySelector('.xmit-hint-label') : null;
  const replayBtn = document.getElementById('xmit-replay');
  const headline = document.getElementById('xmit-headline');
  const consoleLinesEl = document.getElementById('console-lines');
  const fxLayer = document.getElementById('fx-layer');

  // ----- per-char email split (enables the wave micro-interaction) -----
  if (emailCharsEl && !emailCharsEl.dataset.split) {
    emailCharsEl.dataset.split = '1';
    emailCharsEl.textContent = '';
    for (const ch of EMAIL) {
      const s = document.createElement('span');
      s.className = 'xmit-char';
      s.textContent = ch;
      emailCharsEl.appendChild(s);
    }
  }

  // ----- console script (typed on activation) -----
  const CONSOLE_LINES = [
    'initializing handshake… ok',
    'availability: OPEN',
    'bengaluru, india · remote global',
    'local time — ',
    'transmission ready — awaiting yours',
  ];
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  let clockSpan = null;
  let clockTimer = null;
  let typeTimer = null;
  let typedOnce = false;
  let waving = false;
  let copiedTimer = null;

  const istTime = () => timeFmt.format(new Date());

  function buildConsole() {
    if (!consoleLinesEl || consoleLinesEl.childElementCount) return;
    CONSOLE_LINES.forEach((text) => {
      const line = document.createElement('div');
      line.className = 'console-line';
      const caret = document.createElement('span');
      caret.className = 'console-caret';
      caret.textContent = '›';
      const body = document.createElement('span');
      body.className = 'console-text';
      body.textContent = text;
      line.append(caret, body);
      if (text === 'local time — ') {
        clockSpan = document.createElement('span');
        clockSpan.className = 'console-clock';
        clockSpan.textContent = `${istTime()} IST`;
        line.append(clockSpan);
      }
      consoleLinesEl.appendChild(line);
    });
    Array.from(consoleLinesEl.children).forEach((line) => {
      line.dataset.full = line.querySelector('.console-text').textContent;
    });
  }

  function cancelTypewriter() {
    if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
    if (consoleLinesEl && !typedOnce) {
      Array.from(consoleLinesEl.children).forEach((line) => {
        line.classList.remove('on', 'typing', 'done');
        const body = line.querySelector('.console-text');
        if (body) body.textContent = line.dataset.full;
      });
    }
  }

  function typewriteAll() {
    if (!consoleLinesEl || typedOnce) return;
    const lines = Array.from(consoleLinesEl.children);
    if (reduceMotion) {
      lines.forEach((l) => l.classList.add('on', 'done'));
      typedOnce = true;
      return;
    }
    let li = 0;
    const typeLine = () => {
      if (li >= lines.length) {
        typedOnce = true;
        return;
      }
      const line = lines[li];
      const body = line.querySelector('.console-text');
      const full = line.dataset.full;
      line.classList.add('on', 'typing');
      let ci = 0;
      const step = () => {
        ci += 1;
        body.textContent = full.slice(0, ci);
        if (ci < full.length) {
          typeTimer = setTimeout(step, 10 + Math.random() * 18);
        } else {
          line.classList.remove('typing');
          line.classList.add('done');
          li += 1;
          typeTimer = setTimeout(typeLine, 140 + Math.random() * 140);
        }
      };
      step();
    };
    typeLine();
  }

  buildConsole();

  // ----- Bengaluru clock -----
  function startClock() {
    if (clockTimer) return;
    if (clockSpan) clockSpan.textContent = `${istTime()} IST`;
    clockTimer = setInterval(() => {
      if (clockSpan) clockSpan.textContent = `${istTime()} IST`;
    }, 1000);
  }

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  // ----- magnetic elements (real damped springs) -----
  const magnets = [];
  if (finePointer && !reduceMotion) {
    stage.querySelectorAll('[data-magnetic]').forEach((el) => {
      const isEmail = el.classList.contains('xmit-email');
      magnets.push({
        el,
        inner: el.querySelector('.xmit-btn-inner'),
        rect: null,
        x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
        moved: false,
        maxShift: isEmail ? 7 : 14,
      });
    });
  }

  let pointerX = -1e4;
  let pointerY = -1e4;
  let spotX = 50;
  let spotY = 40;
  let spotTX = 50;
  let spotTY = 40;

  function onPointerMove(e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
    const r = stage.getBoundingClientRect();
    spotTX = ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
    spotTY = ((e.clientY - r.top) / Math.max(1, r.height)) * 100;
  }

  function onPointerOut() {
    pointerX = -1e4;
    pointerY = -1e4;
    spotTX = 50;
    spotTY = 40;
  }

  function cacheRects() {
    magnets.forEach((m) => { m.rect = m.el.getBoundingClientRect(); });
  }

  function updateMagnets() {
    for (const m of magnets) {
      if (!m.rect || !m.rect.width) {
        m.rect = m.el.getBoundingClientRect();
        if (!m.rect.width) continue;
      }
      const cx = m.rect.left + m.rect.width / 2;
      const cy = m.rect.top + m.rect.height / 2;
      const dx = pointerX - cx;
      const dy = pointerY - cy;
      const dist = Math.hypot(dx, dy);
      const radius = 130 + Math.max(m.rect.width, m.rect.height) / 2;
      if (dist < radius && dist > 0.001) {
        const falloff = 1 - dist / radius;
        m.tx = Math.max(-m.maxShift, Math.min(m.maxShift, dx * 0.3 * falloff));
        m.ty = Math.max(-m.maxShift, Math.min(m.maxShift, dy * 0.3 * falloff));
      } else {
        m.tx = 0;
        m.ty = 0;
      }
      // semi-implicit Euler damped spring (slight overshoot, true settle)
      m.vx = (m.vx + (m.tx - m.x) * 0.16) * 0.74;
      m.vy = (m.vy + (m.ty - m.y) * 0.16) * 0.74;
      m.x += m.vx;
      m.y += m.vy;
      if (Math.abs(m.x) < 0.02 && Math.abs(m.y) < 0.02 && m.tx === 0 && m.ty === 0) {
        if (m.moved) {
          m.el.style.transform = '';
          if (m.inner) m.inner.style.transform = '';
          m.moved = false;
        }
        m.x = 0; m.y = 0; m.vx = 0; m.vy = 0;
      } else {
        m.moved = true;
        m.el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`;
        if (m.inner) {
          m.inner.style.transform = `translate3d(${(-m.x * 0.35).toFixed(2)}px, ${(-m.y * 0.35).toFixed(2)}px, 0)`;
        }
      }
    }
  }

  // ----- scroll-velocity headline skew (the reel's inertia language) -----
  let skew = 0;
  let skewed = false;

  function updateSkew() {
    if (!headline) return;
    const target = Math.max(-1.3, Math.min(1.3, progressVel * 220));
    skew += (target - skew) * 0.12;
    skew *= 0.86;
    if (Math.abs(skew) > 0.02) {
      skewed = true;
      headline.style.transform = `skewY(${skew.toFixed(3)}deg)`;
    } else if (skewed) {
      skewed = false;
      skew = 0;
      headline.style.transform = '';
    }
  }

  // ----- act loop (runs only while the act is on screen) -----
  let active = false;
  let rafId = 0;
  let p4 = 0;

  function loop() {
    if (!active) return;
    if (!reduceMotion) {
      const p4Target = Math.min(1, Math.max(0, (targetProgress - 0.97) / 0.03));
      p4 += (p4Target - p4) * 0.09;
      if (Math.abs(p4Target - p4) < 0.001) p4 = p4Target;
      stage.style.setProperty('--act4-p', p4.toFixed(4));

      spotX += (spotTX - spotX) * 0.14;
      spotY += (spotTY - spotY) * 0.14;
      stage.style.setProperty('--spot-x', `${spotX.toFixed(2)}%`);
      stage.style.setProperty('--spot-y', `${spotY.toFixed(2)}%`);

      updateMagnets();
      updateSkew();
    }
    rafId = requestAnimationFrame(loop);
  }

  function resetVisuals() {
    stage.style.setProperty('--act4-p', '0');
    p4 = 0;
    spotX = spotTX = 50;
    spotY = spotTY = 40;
    if (headline) headline.style.transform = '';
    skewed = false;
    skew = 0;
    magnets.forEach((m) => {
      m.x = 0; m.y = 0; m.vx = 0; m.vy = 0;
      m.el.style.transform = '';
      if (m.inner) m.inner.style.transform = '';
      m.moved = false;
    });
  }

  function setActive(on) {
    if (on === active) return;
    active = on;
    if (on) {
      cacheRects();
      startClock();
      if (!typedOnce) typeTimer = setTimeout(typewriteAll, 500);
      if (finePointer && !reduceMotion) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        stage.addEventListener('pointerleave', onPointerOut);
      }
      rafId = requestAnimationFrame(loop);
    } else {
      stopClock();
      cancelTypewriter();
      window.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerleave', onPointerOut);
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      resetVisuals();
    }
  }

  // ----- copy + celebration -----
  function waveChars(amp) {
    if (reduceMotion || !emailCharsEl || waving) return;
    waving = true;
    const chars = Array.from(emailCharsEl.children);
    chars.forEach((c, i) => {
      c.animate(
        [
          { transform: 'translateY(0) scale(1)' },
          { transform: `translateY(-${amp}px) scale(1.14)`, offset: 0.35 },
          { transform: 'translateY(0) scale(1)' },
        ],
        { duration: 440, delay: i * 12, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
    });
    setTimeout(() => { waving = false; }, 440 + chars.length * 12);
  }

  function onCopied() {
    if (!emailBtn) return;
    emailBtn.classList.add('copied');
    if (hintLabel) hintLabel.textContent = 'Copied to clipboard';
    const r = emailBtn.getBoundingClientRect();
    spawnSparks(fxLayer || emailBtn, r.left + r.width / 2, r.top + r.height / 2, null, 16, 70);
    waveChars(10);
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      emailBtn.classList.remove('copied');
      if (hintLabel) hintLabel.textContent = 'Click to copy';
    }, 2600);
  }

  if (emailBtn && !emailBtn.dataset.wired) {
    emailBtn.dataset.wired = '1';
    emailBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(EMAIL);
        onCopied();
      } catch (err) {
        window.location.href = `mailto:${EMAIL}`;
      }
    });
    emailBtn.addEventListener('mouseenter', () => waveChars(6));
  }

  // ----- cinematic replay -----
  if (replayBtn && !replayBtn.dataset.wired) {
    replayBtn.dataset.wired = '1';
    replayBtn.addEventListener('click', () => {
      rewindPhaseUntil = Date.now() + 2600;
      lenis.scrollTo(0, { duration: 2.4 });
    });
  }

  window.addEventListener('resize', cacheRects);

  // Test-harness probe
  window.__connectProbe = () => ({
    active,
    p4,
    typedOnce,
    typedLines: consoleLinesEl ? consoleLinesEl.querySelectorAll('.console-line.on').length : 0,
    clock: clockSpan ? clockSpan.textContent : null,
  });

  return { setActive };
}

window.scrollToTop = function () {
  lenis.scrollTo(0, { duration: 1.8 });
};

// Initialize systems
initGamifiedPlayground();
initNavPills();
connectAct = initConnectAct();
xpAct = initXpAct();
papersAct = initPapersAct();
pulseAct = initGithubAct({
  stage: stageAct34,
  user: GITHUB_USER,
  getProgress: () => targetProgress,
});

// The Project Reel — scroll-scrubbed scene gallery
function scrollToActProgress(p) {
  const heroHeight = hero ? hero.offsetHeight : window.innerHeight;
  const trackHeight = scrollWrapper ? scrollWrapper.offsetHeight : 0;
  const maxTrackScroll = trackHeight - window.innerHeight;
  lenis.scrollTo(heroHeight + maxTrackScroll * p, { duration: 1.4 });
}
const reel = initProjectReel({ stage: stageAct25, scrollToProgress: scrollToActProgress });

// Preload sequence
loadSingleFrame(0);
for (let i = 0; i < INITIAL_BUFFER_COUNT; i++) {
  loadSingleFrame(i);
}
// Letterbox calibration frame — scoped prefetch no longer guarantees the old
// global sweep ever passed #235 (e.g. nav-pill jumps), so pin its load;
// evictFarFrames protects it until filmState.calibrated flips.
loadSingleFrame(CALIBRATION_FRAME);

// Soundscape — scroll-linked score + auto-tour (frame() joins the tick below)
const soundscape = initSoundscape({ lenis, prefersReducedMotion });

updateScrollProgress();
requestAnimationFrame(tick);