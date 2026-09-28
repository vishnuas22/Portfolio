// ==========================================================================
// THE PROJECT REEL — data, scene builder & controller (scroll-driven)
// ==========================================================================
// To add a project: append an object here and drop a poster at
// /public/projects/<id>.svg (or set `image: '<file>'`). Scenes, dots,
// counter, keyboard nav and drag physics all derive automatically.
// Skill chips: `icon` = file in /public/icons, or `glyph` + `tint` for
// technologies with no official brand mark.

export const REEL_RANGE = { start: 0.48, end: 0.86 };

const PROJECTS_DATA = [
  {
    id: 'cogni',
    title: 'Cogni',
    subtitle: 'The Second Brain',
    period: 'Aug 2026 — Sep 2026',
    hue: '#8ab4f8',
    blurb: 'Cogni shows you what you already knew but forgot you knew — a personal knowledge engine that captures what you read, think, and create, then uses AI to surface the connections you\'d miss.',
    highlights: [
      'Captures everything you read, think and create',
      'AI surfaces connections you\'d miss on your own',
      'Local-first capture, privacy by design',
    ],
    metrics: [],
    skills: [
      { name: 'Next.js 16', icon: 'nextjs.svg' },
      { name: 'Turbopack', glyph: '⬢', tint: '#fdd663' },
      { name: 'Tailwind CSS', icon: 'tailwind.svg' },
      { name: 'shadcn/ui', icon: 'shadcn.svg' },
      { name: 'Prisma', icon: 'prisma-tint.svg' },
      { name: 'SQLite', icon: 'sqlite-tint.svg' },
      { name: 'PostgreSQL', icon: 'postgresql.svg' },
      { name: 'NextAuth.js', glyph: '✪', tint: '#8ab4f8' },
    ],
  },
  {
    id: 'masterx',
    title: 'MasterX',
    subtitle: 'Adaptive Personalized Learning AI Engine',
    period: 'Emotion-Aware · RAG · Multi-Agent',
    hue: '#c58af9',
    blurb: 'A sophisticated emotion-aware learning platform with custom ML models — real-time cognitive-load detection prevents overwhelm while adaptive difficulty keeps every learner in flow.',
    highlights: [
      'Real-time emotion & cognitive-load detection',
      'Semantic memory, RAG engine & dual-process reasoning',
      'Multi-AI provider routing that intelligently cuts costs',
      'Synthetic Classroom of autonomous AI agents',
    ],
    metrics: [],
    skills: [
      { name: 'RAG', glyph: '⌘', tint: '#8ab4f8' },
      { name: 'LangGraph', icon: 'langgraph.svg' },
      { name: 'Qdrant', icon: 'qdrant.svg' },
      { name: 'LLMs', icon: 'googlegemini.svg' },
      { name: 'Docker', icon: 'docker.svg' },
      { name: 'MongoDB', icon: 'mongodb.svg' },
      { name: 'React', icon: 'react-brand.svg' },
      { name: 'FastAPI', icon: 'fastapi.svg' },
      { name: 'TypeScript', icon: 'typescript.svg' },
      { name: 'WebSocket', glyph: '⇌', tint: '#78d9ec' },
      { name: 'Vite', icon: 'vite.svg' },
      { name: 'BERT', icon: 'huggingface.svg' },
      { name: 'Redis', icon: 'redis.svg' },
      { name: 'PyTorch', icon: 'pytorch.svg' },
      { name: 'Scikit-learn', icon: 'scikitlearn.svg' },
    ],
  },
  {
    id: 'visible',
    title: 'VISIBLE',
    subtitle: 'Expert-Persona Candidate Evaluation',
    period: 'Jun 2024 — Aug 2024',
    hue: '#f28b82',
    blurb: 'Candidate evaluations based on their social profiles, conducted through expert personas — deployed Fireworks models for predictive analysis and documentation.',
    highlights: [
      'Cut execution latency by up to 20% via optimized code',
      'Deployed Fireworks models for predictive analysis',
      '20% lift in decision-making efficiency with cross-functional teams',
    ],
    metrics: [
      { value: 20, suffix: '%', label: 'Faster execution' },
      { value: 20, suffix: '%', label: 'Decision efficiency' },
    ],
    skills: [
      { name: 'Fireworks Models', glyph: '✸', tint: '#fdd663' },
      { name: 'RAG', glyph: '⌘', tint: '#8ab4f8' },
      { name: 'BERT', icon: 'huggingface.svg' },
      { name: 'GPT', icon: 'openai.svg' },
      { name: 'Llama-3-8B', icon: 'meta-white.svg' },
      { name: 'Vector DBs', glyph: '▤', tint: '#f28b82' },
      { name: 'PostgreSQL', icon: 'postgresql.svg' },
      { name: 'Prisma', icon: 'prisma-tint.svg' },
      { name: 'Google Colab A100', icon: 'googlecolab.svg' },
      { name: 'Python', icon: 'python.svg' },
    ],
  },
  {
    id: 'radgen',
    title: 'RAD-GEN1',
    subtitle: 'AI-Powered Art Generation Platform',
    period: 'Jun 2024 — Jul 2024',
    hue: '#fdd663',
    blurb: 'A Stable Diffusion art platform built on PyTorch, Hugging Face and Transformers — text-to-image, image-to-image and inpainting, with encoder-decoder and UNet pipelines for image quality.',
    highlights: [
      '95% user satisfaction across generation modes',
      'Encoder-decoder + UNet pipelines, +20% model performance',
      'Flask front-end integration, +50% user engagement',
    ],
    metrics: [
      { value: 95, suffix: '%', label: 'User satisfaction' },
      { value: 50, suffix: '%', label: 'Engagement lift' },
      { value: 20, suffix: '%', label: 'Model performance' },
    ],
    skills: [
      { name: 'PyTorch', icon: 'pytorch.svg' },
      { name: 'Transformers', icon: 'huggingface.svg' },
      { name: 'Stable Diffusion', glyph: '✫', tint: '#fdd663' },
      { name: 'HTML5', icon: 'html5.svg' },
      { name: 'CSS', icon: 'css.svg' },
      { name: 'Flask', icon: 'flask-white.svg' },
    ],
  },
  {
    id: 'trends',
    title: 'Google Trends Analysis',
    subtitle: 'Strategic Market Intelligence',
    period: 'May 2024 — Jun 2024',
    hue: '#81c995',
    blurb: 'Real-time and historical search behavior from 2004 to today — 80+ keywords across 60+ countries, turned into dashboards that drive strategic business decisions.',
    highlights: [
      '80+ keywords, 60+ countries, two decades of Trends data',
      'Interactive Power BI dashboards designed in Figma',
      'Competitive assessments defending market share',
    ],
    metrics: [
      { value: 80, suffix: '+', label: 'Keywords tracked' },
      { value: 60, suffix: '+', label: 'Countries' },
      { value: 40, suffix: '%', label: 'Engagement lift' },
      { value: 30, suffix: '%', label: 'Market-share impact' },
    ],
    skills: [
      { name: 'Google Trends APIs', glyph: '∿', tint: '#81c995' },
      { name: 'Power BI', icon: 'powerbi.svg' },
      { name: 'Figma', icon: 'figma.svg' },
      { name: 'Data Visualization', glyph: '▦', tint: '#78d9ec' },
      { name: 'REST APIs', glyph: '⇄', tint: '#8ab4f8' },
    ],
  },
  {
    id: 'segmentation',
    title: 'Customer Segmentation & CLV',
    subtitle: 'E-commerce Intelligence at Scale',
    period: 'Feb 2024 — Apr 2024',
    hue: '#78d9ec',
    blurb: 'A million synthetic e-commerce shoppers, segmented with RFM, PCA and K-Means — then valued with an ensemble that lifted prediction accuracy to 94.6%.',
    highlights: [
      '1,000,000-user dataset curated from GPT, Kaggle & public sources',
      'RFM + PCA + K-Means behavioral segmentation, +30% customer experience',
      '94.6% prediction accuracy after rigorous hyperparameter tuning',
    ],
    metrics: [
      { value: 1, suffix: 'M', label: 'Users analyzed' },
      { value: 94.6, suffix: '%', label: 'Prediction accuracy' },
      { value: 40, suffix: '%', label: 'CLV prediction lift' },
    ],
    skills: [
      { name: 'K-Means Clustering', glyph: '◉', tint: '#4ec9d4' },
      { name: 'RFM', glyph: '▤', tint: '#8ab4f8' },
      { name: 'PCA', glyph: '⊹', tint: '#c58af9' },
      { name: 'Naive Bayes', glyph: '∷', tint: '#81c995' },
      { name: 'Random Forest', glyph: '⧉', tint: '#34a853' },
      { name: 'KNN', glyph: '⌖', tint: '#f28b82' },
      { name: 'AdaBoost', glyph: '⚡', tint: '#fdd663' },
      { name: 'GPT', icon: 'openai.svg' },
      { name: 'Kaggle', icon: 'kaggle.svg' },
      { name: 'Python', icon: 'python.svg' },
    ],
  },
];

function skillChip(skill, j) {
  const delay = `--d:${(0.5 + j * 0.05).toFixed(2)}s`;
  if (skill.icon) {
    return `<span class="mini-bead" style="${delay}" title="${skill.name}" aria-label="${skill.name}"><img src="/icons/${skill.icon}" alt="${skill.name}" loading="lazy" draggable="false" onerror="this.parentNode.style.opacity='0.25';this.onerror=null;"></span>`;
  }
  return `<span class="mini-bead mini-glyph" style="${delay};color:${skill.tint}" title="${skill.name}" aria-label="${skill.name}">${skill.glyph}</span>`;
}

export function initProjectReel({ stage, scrollToProgress }) {
  if (!stage) return { update() {}, setActive() {} };

  const track = stage.querySelector('.reel-track');
  const dotsWrap = stage.querySelector('.reel-dots');
  const counterCur = stage.querySelector('.reel-counter-cur');
  const counterTotal = stage.querySelector('.reel-counter-total');
  const progressFill = stage.querySelector('.reel-progress-fill');
  const hint = stage.querySelector('.reel-hint');
  const prevBtn = stage.querySelector('.reel-arrow.prev');
  const nextBtn = stage.querySelector('.reel-arrow.next');

  const N = PROJECTS_DATA.length;
  if (counterTotal) counterTotal.textContent = String(N).padStart(2, '0');

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ----- build scenes -----
  const scenes = PROJECTS_DATA.map((p, i) => {
    const el = document.createElement('article');
    el.className = 'reel-scene';
    el.style.setProperty('--sc-hue', p.hue);
    el.style.left = `${i * 100}%`; // park each scene in its own reel slot

    const num = String(i + 1).padStart(2, '0');
    const poster = `/projects/${p.id}.svg`;
    const stillSrc = p.image ? `/projects/${p.image}` : poster;

    const metricsHTML = p.metrics && p.metrics.length
      ? `<div class="scene-metrics">${p.metrics.map((m, j) => `
          <div class="scene-metric" style="--d:${(0.42 + j * 0.07).toFixed(2)}s">
            <span class="metric-count" data-val="${m.value}" data-suffix="${m.suffix || ''}">0${m.suffix || ''}</span>
            <span class="metric-lbl">${m.label}</span>
          </div>`).join('')}</div>`
      : '';

    el.innerHTML = `
      <div class="scene-copy">
        <div class="scene-eyebrow"><span class="scene-num">SCENE ${num}</span><span class="scene-period">${p.period}</span></div>
        <h3 class="scene-title">${p.title}</h3>
        <p class="scene-subtitle">${p.subtitle}</p>
        <p class="scene-blurb">${p.blurb}</p>
        <ul class="scene-highlights">${p.highlights.map((h) => `<li>${h}</li>`).join('')}</ul>
        ${metricsHTML}
        <div class="scene-skills">${p.skills.map((s, j) => skillChip(s, j)).join('')}</div>
      </div>
      <div class="scene-visual">
        <div class="still-wrap">
          <div class="still-tilt">
            <img class="still-img" src="${stillSrc}" alt="${p.title} — project still" loading="lazy" draggable="false"
              onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src='${poster}';}else{const f=document.createElement('div');f.className='still-fallback';f.textContent='${p.title.charAt(0)}';f.style.background='radial-gradient(circle at 40% 30%, color-mix(in srgb, var(--sc-hue, #8ab4f8) 30%, #0b0d12), #0b0d12)';this.replaceWith(f);}">
            <span class="still-glow" style="background: radial-gradient(circle at 50% 50%, ${p.hue}, transparent 70%)"></span>
          </div>
          <div class="still-caption"><span>${p.title} · ${p.subtitle}</span><span class="still-frame-tag">SCENE ${num}</span></div>
        </div>
      </div>`;

    track.appendChild(el);
    return { el, tiltEl: el.querySelector('.still-tilt'), stillWrap: el.querySelector('.still-wrap') };
  });

  // ----- dots -----
  const dots = PROJECTS_DATA.map((p, i) => {
    const d = document.createElement('button');
    d.className = 'reel-dot';
    d.setAttribute('aria-label', `Go to ${p.title}`);
    d.addEventListener('click', () => goToScene(i));
    dotsWrap.appendChild(d);
    return d;
  });

  // ----- state -----
  let active = false;
  let sub = 0;
  let displayPos = 0;
  let curIdx = -1;
  let dragPx = 0;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let tiltRaf = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function goToScene(i) {
    const c = clamp(i, 0, N - 1);
    const span = Math.max(1, N - 1); // guard: never divide by zero
    scrollToProgress(REEL_RANGE.start + (c / span) * (REEL_RANGE.end - REEL_RANGE.start));
    if (hint) hint.classList.add('seen');
  }

  function runCountUp(root) {
    root.querySelectorAll('.metric-count').forEach((el) => {
      const val = parseFloat(el.dataset.val);
      const suffix = el.dataset.suffix || '';
      const decimals = (String(el.dataset.val).split('.')[1] || '').length;
      const t0 = performance.now();
      const dur = 900;
      function step(t) {
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = (val * e).toFixed(decimals) + suffix;
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function setActiveScene(i) {
    if (i === curIdx) return;
    curIdx = i;
    scenes.forEach(({ el }, j) => el.classList.toggle('is-active', j === i));
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
    if (counterCur) counterCur.textContent = String(i + 1).padStart(2, '0');
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === N - 1;
    runCountUp(scenes[i].el);
  }

  // ----- render: reel pan + per-scene fade/parallax -----
  function render() {
    track.style.transform = `translate3d(${(-displayPos * 100).toFixed(4)}%,0,0)`;
    scenes.forEach(({ el, stillWrap }, i) => {
      const d = i - displayPos;
      const ad = Math.abs(d);
      const vis = ad < 0.85;
      el.style.visibility = vis ? 'visible' : 'hidden';
      if (vis) {
        el.style.opacity = String(clamp(1 - ad * 1.25, 0, 1));
        stillWrap.style.transform = `translateX(${(d * -34).toFixed(2)}px)`;
      }
    });
    setActiveScene(Math.round(displayPos));
  }

  function update(s) {
    sub = clamp(s, 0, 1);
    const stageW = track.clientWidth || stage.clientWidth || window.innerWidth;
    const target = sub * (N - 1) + dragPx / stageW;
    displayPos += (target - displayPos) * 0.16;
    if (Math.abs(target - displayPos) < 0.0004) displayPos = target;
    render();
    if (progressFill) progressFill.style.width = `${(sub * 100).toFixed(2)}%`;
  }

  function setActive(on) {
    if (on === active) return;
    active = on;
    stage.classList.toggle('reel-live', on);
    if (on) {
      displayPos = sub * (N - 1);
      render();
      startTilt();
    } else {
      stopTilt();
    }
  }

  // ----- tilt physics on THE STILL (spring-damped 3D) -----
  function tiltLoop() {
    tilt.x += (tilt.tx - tilt.x) * 0.08;
    tilt.y += (tilt.ty - tilt.y) * 0.08;
    const s = scenes[curIdx];
    if (s && s.tiltEl && !reduceMotion) {
      s.tiltEl.style.transform = `rotateX(${(tilt.y * -5).toFixed(3)}deg) rotateY(${(tilt.x * 6).toFixed(3)}deg)`;
    }
    tiltRaf = requestAnimationFrame(tiltLoop);
  }

  function startTilt() {
    if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltLoop);
  }

  function stopTilt() {
    if (tiltRaf) { cancelAnimationFrame(tiltRaf); tiltRaf = null; }
  }

  // ----- drag-to-scrub with momentum snap -----
  let pointerId = null;
  let startX = 0;
  let lastX = 0;
  let lastT = 0;
  let vel = 0;

  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !active) return;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    lastT = performance.now();
    vel = 0;
    track.setPointerCapture(pointerId);
    if (hint) hint.classList.add('seen');
  });

  track.addEventListener('pointermove', (e) => {
    if (pointerId !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    vel = (e.clientX - lastX) / dt;
    lastX = e.clientX;
    lastT = now;
    dragPx = clamp(e.clientX - startX, -180, 180);
  });

  function endDrag(e) {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    const flung = Math.abs(vel) > 0.55;
    if (dragPx < -70 || (flung && vel < 0)) goToScene(curIdx + 1);
    else if (dragPx > 70 || (flung && vel > 0)) goToScene(curIdx - 1);
    dragPx = 0; // lerp springs the reel back
  }

  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  // ----- keyboard navigation (while the reel is live) -----
  window.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goToScene(curIdx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goToScene(curIdx - 1); }
  });

  // ----- arrows + magnetic pull + tilt targets -----
  prevBtn.addEventListener('click', () => goToScene(curIdx - 1));
  nextBtn.addEventListener('click', () => goToScene(curIdx + 1));

  stage.addEventListener('pointermove', (e) => {
    const s = scenes[curIdx];
    if (s && s.tiltEl) {
      const r = s.tiltEl.getBoundingClientRect();
      if (r.width && r.height) {
        tilt.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
        tilt.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
      }
    }
    [prevBtn, nextBtn].forEach((btn) => {
      const r = btn.getBoundingClientRect();
      if (!r.width) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);
      const pull = dist < 90 ? (1 - dist / 90) * 8 : 0;
      btn.style.transform = dist ? `translate(${(dx / dist) * pull}px, ${(dy / dist) * pull}px)` : '';
    });
  });

  stage.addEventListener('pointerleave', () => {
    tilt.tx = 0;
    tilt.ty = 0;
    [prevBtn, nextBtn].forEach((b) => { b.style.transform = ''; });
  });

  render();

  window.__reelProbe = () => ({ pos: displayPos, sub, n: N });
  return { update, setActive };
}