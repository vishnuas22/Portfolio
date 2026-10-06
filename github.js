// ============================================================================
// ACT 3.4 — THE PULSE: live GitHub activity controller
// ============================================================================
// Borderless cinematic session in the site's established physics language:
// JS-eased --act34-p scroll choreography, one-shot easeOutExpo count-up,
// damped-spring magnets, pointer spotlight — plus a 366-cell contribution
// heatmap with a column cascade and a live event feed.
//
// Data layers (each falls back independently, the act never breaks):
//   1. github-snapshot.json — embedded at build (prebuild script), renders 100% offline
//   2. sessionStorage cache — 15-minute TTL, skips the network entirely when fresh
//   3. live fetch on first act approach — 4s timeout per source, Promise.allSettled
// Tests (and rate-limit emergencies) set `window.__GH_OFFLINE__ = true` before the
// first activation to stay on the embedded snapshot.
import snapshot from './github-snapshot.json';

const CACHE_KEY = 'pb-gh:v1';
const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;

const EVENT_KEEP = new Set([
  'PushEvent', 'CreateEvent', 'WatchEvent', 'ForkEvent',
  'PullRequestEvent', 'ReleaseEvent', 'IssuesEvent',
]);

// ----- small helpers --------------------------------------------------------
const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');

function computeStreaks(days) {
  // Today's cell is still open — a 0 right now must not break the streak
  // (matches how GitHub counts a current streak mid-day).
  let end = days.length - 1;
  if (end >= 0 && days[end].count === 0) end--;
  let current = 0;
  for (let i = end; i >= 0 && days[i].count > 0; i--) current++;
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return { current, longest };
}

function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function eventVerb(ev) {
  const ref = String(ev.ref || '').replace(/^refs\/heads\//, '');
  switch (ev.type) {
    case 'PushEvent': return `pushed to ${ref || 'main'}`;
    case 'CreateEvent': return ref ? `created ${ref}` : 'created repository';
    case 'WatchEvent': return 'starred';
    case 'ForkEvent': return 'forked';
    case 'PullRequestEvent': return 'opened a pull request';
    case 'ReleaseEvent': return 'published a release';
    case 'IssuesEvent': return 'opened an issue';
    default: return 'activity';
  }
}

const GLYPH = {
  PushEvent: '↑',
  CreateEvent: '＋',
  WatchEvent: '★',
  ForkEvent: '⑂',
  PullRequestEvent: '⑂',
  ReleaseEvent: '⌂',
  IssuesEvent: '●',
};

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || Date.now() - cached.t > CACHE_TTL_MS) return null;
    return cached.data;
  } catch { return null; }
}

function writeCache(data) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data })); } catch { /* private mode */ }
}

// ============================================================================
export function initGithubAct({ stage, user, getProgress }) {
  if (!stage) return { setActive() {} };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const magneticOn = finePointer && !reduceMotion;

  // ----- hydrate static GitHub links from the single username constant -----
  document.querySelectorAll('a[data-github-user]').forEach((a) => {
    a.href = `https://github.com/${user}`;
  });

  const statEls = Array.from(stage.querySelectorAll('.pl-stat-val'));
  const heatEl = stage.querySelector('#pl-heat');
  const heatTotalEl = stage.querySelector('#pl-heat-total');
  const feedEl = stage.querySelector('#pl-feed');
  const recentEl = stage.querySelector('#pl-recent');
  const statusWrap = stage.querySelector('.xmit-status');
  const statusText = stage.querySelector('#pl-status-text');
  const tip = stage.querySelector('#pl-tip');

  // ----- data state: embedded snapshot renders first, live layers on top ----
  const initial = snapshot && Array.isArray(snapshot.contributions)
    ? snapshot
    : { contributions: [], events: [], repos: [], stats: {}, fetchedAt: null };
  let data = initial;
  let source = 'snapshot';
  let fetched = false; // one live attempt per page session

  function setSource(next, fetchedAt) {
    source = next;
    if (!statusText || !statusWrap) return;
    if (next === 'live') {
      statusWrap.classList.add('is-live');
      statusWrap.classList.remove('is-cached');
      statusText.textContent = 'Live from GitHub';
    } else {
      statusWrap.classList.remove('is-live');
      statusWrap.classList.add('is-cached');
      const d = fetchedAt ? new Date(fetchedAt) : null;
      statusText.textContent = d
        ? `Cached · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'Cached snapshot';
    }
  }

  // ----- stats (count-up reads data-count each step, so live data arriving
  //         mid-flight simply retargets the animation) ----------------------
  let countedOnce = false;
  let countRaf = 0;
  const setStatFinals = () => statEls.forEach((el) => { el.textContent = fmtNum(el.dataset.count); });
  const setStatsZero = () => statEls.forEach((el) => { el.textContent = '0'; });

  function applyStats(stats) {
    const s = stats || {};
    const values = {
      contrib: s.contributions || 0,
      cur: s.currentStreak || 0,
      best: s.longestStreak || 0,
      days: s.activeDays || 0,
    };
    statEls.forEach((el) => {
      const v = values[el.dataset.key] ?? 0;
      el.dataset.count = String(v);
      if (countedOnce) el.textContent = fmtNum(v); // landed already — no replay
    });
    if (heatTotalEl) heatTotalEl.textContent = `${fmtNum(values.contrib)} contributions in the last year`;
  }

  function runCountUp() {
    if (countedOnce || !statEls.length) return;
    countedOnce = true;
    if (reduceMotion) { setStatFinals(); return; }
    const t0 = performance.now();
    const DUR = 1150;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / DUR);
      statEls.forEach((el, i) => {
        const delay = i * 0.12;
        const local = Math.min(1, Math.max(0, (t - delay) / (1 - delay)));
        const eased = local >= 1 ? 1 : 1 - Math.pow(2, -10 * local);
        el.textContent = fmtNum(Math.round(Number(el.dataset.count || 0) * eased));
      });
      if (t < 1) countRaf = requestAnimationFrame(step);
      else { setStatFinals(); countRaf = 0; }
    };
    countRaf = requestAnimationFrame(step);
  }

  // ----- heatmap (366 cells, explicit grid placement, column cascade) -------
  let cells = [];

  function buildHeatmap(days) {
    if (!heatEl) return;
    const frag = document.createDocumentFragment();
    cells = [];
    const firstDow = days.length ? new Date(`${days[0].date}T00:00:00`).getDay() : 0;
    days.forEach((d, i) => {
      const dow = new Date(`${d.date}T00:00:00`).getDay();
      const week = Math.floor((i + firstDow) / 7);
      const cell = document.createElement('span');
      cell.className = `pl-cell gh-l${Math.min(4, Math.max(0, d.level || 0))}`;
      cell.style.gridRow = String(dow + 1);
      cell.style.gridColumn = String(week + 1);
      cell.style.setProperty('--gc', String(week));
      cell.dataset.date = d.date;
      cell.dataset.count = String(d.count);
      frag.appendChild(cell);
      cells.push(cell);
    });
    heatEl.replaceChildren(frag);
  }

  function updateHeatmapLevels(days) {
    if (days.length !== cells.length) { buildHeatmap(days); return; }
    days.forEach((d, i) => {
      cells[i].className = `pl-cell gh-l${Math.min(4, Math.max(0, d.level || 0))}`;
      cells[i].dataset.count = String(d.count);
    });
  }


  // ----- live feed ----------------------------------------------------------
  function renderFeed(events) {
    if (!feedEl) return;
    const rows = (events || []).filter((e) => EVENT_KEEP.has(e.type)).slice(0, 7);
    const frag = document.createDocumentFragment();
    rows.forEach((ev, i) => {
      const li = document.createElement('li');
      li.className = 'pl-row';
      li.style.setProperty('--rd', String(i));
      const glyph = document.createElement('span');
      glyph.className = 'pl-row-glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = GLYPH[ev.type] || '●';
      const repo = document.createElement('span');
      repo.className = 'pl-row-repo';
      repo.textContent = ev.repo || '';
      const verb = document.createElement('span');
      verb.className = 'pl-row-verb';
      verb.textContent = eventVerb(ev);
      const time = document.createElement('time');
      time.className = 'pl-row-time';
      time.dateTime = ev.createdAt || '';
      time.textContent = relTime(ev.createdAt || '');
      li.append(glyph, repo, verb, time);
      frag.appendChild(li);
    });
    feedEl.replaceChildren(frag);
  }

  // ----- recently-pushed repo chips ----------------------------------------
  function renderRecent(repos) {
    if (!recentEl) return;
    const rows = (repos || []).slice(0, 3);
    const frag = document.createDocumentFragment();
    rows.forEach((r, i) => {
      const a = document.createElement('a');
      a.className = 'pl-chip';
      a.href = `https://github.com/${user}/${encodeURIComponent(r.name)}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.dataset.magnetic = '';
      a.style.setProperty('--rd', String(i));
      const dot = document.createElement('span');
      dot.className = 'pl-chip-dot';
      dot.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'pl-chip-name';
      name.textContent = r.name;
      const meta = document.createElement('span');
      meta.className = 'pl-chip-meta';
      meta.textContent = `${r.language || '·'} · ${relTime(r.pushedAt || '')}`;
      a.append(dot, name, meta);
      frag.appendChild(a);
    });
    recentEl.replaceChildren(frag);
    collectMagnets(); // re-bind springs to freshly built chips
    if (active) cacheRects();
  }

  // ----- unified apply: every data layer lands through here -----------------
  function apply(next, nextSource) {
    data = next;
    applyStats(next.stats);
    updateHeatmapLevels(next.contributions || []);
    renderFeed(next.events);
    renderRecent(next.repos);
    setSource(nextSource, next.fetchedAt);
  }

  async function refresh() {
    if (fetched || window.__GH_OFFLINE__ || navigator.onLine === false) return;
    fetched = true;

    const cached = readCache();
    if (cached) { apply(cached, 'live'); return; }

    const [c, p, e, r] = await Promise.allSettled([
      getJSON(`https://github-contributions-api.jogruber.de/v4/${user}?y=last`),
      getJSON(`https://api.github.com/users/${user}`),
      getJSON(`https://api.github.com/users/${user}/events/public?per_page=30`),
      getJSON(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`),
    ]);

    const days = c.status === 'fulfilled' && Array.isArray(c.value.contributions) ? c.value.contributions : null;
    if (!days || !days.length) return; // calendar down → stay on snapshot

    const streaks = computeStreaks(days);
    const merged = {
      fetchedAt: new Date().toISOString(),
      user,
      profile: p.status === 'fulfilled'
        ? { public_repos: p.value.public_repos ?? 0, followers: p.value.followers ?? 0 }
        : (data.profile || {}),
      stats: {
        contributions: c.status === 'fulfilled'
          ? ((c.value.total && (c.value.total.lastYear ?? c.value.total[Object.keys(c.value.total).pop()])) || 0)
          : ((data.stats && data.stats.contributions) || 0),
        activeDays: days.filter((d) => d.count > 0).length,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
      },
      contributions: days,
      events: e.status === 'fulfilled' && Array.isArray(e.value)
        ? e.value.filter((ev) => EVENT_KEEP.has(ev.type)).slice(0, 8).map((ev) => ({
          type: ev.type,
          repo: (ev.repo && ev.repo.name) || '',
          ref: (ev.payload && ev.payload.ref) || (ev.payload && ev.payload.ref_type) || '',
          createdAt: ev.created_at,
        }))
        : (data.events || []),
      repos: r.status === 'fulfilled' && Array.isArray(r.value)
        ? r.value.filter((x) => !x.fork).slice(0, 3).map((x) => ({ name: x.name, language: x.language || '', pushedAt: x.pushed_at }))
        : (data.repos || []),
    };
    apply(merged, 'live');
    writeCache(merged);
  }

  // ----- heatmap tooltip (delegated — one listener for 366 cells) -----------
  function onHeatOver(e) {
    const cell = e.target && e.target.closest ? e.target.closest('.pl-cell') : null;
    if (!cell || !tip) return;
    const n = Number(cell.dataset.count || 0);
    const d = new Date(`${cell.dataset.date}T00:00:00`);
    tip.textContent = `${fmtNum(n)} contribution${n === 1 ? '' : 's'} · ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
    const r = cell.getBoundingClientRect();
    const host = tip.offsetParent || stage;
    const hr = host.getBoundingClientRect();
    tip.style.left = `${r.left - hr.left + r.width / 2}px`;
    tip.style.top = `${r.top - hr.top - 8}px`;
    tip.classList.add('on');
  }
  function onHeatOut() { if (tip) tip.classList.remove('on'); }


  // ----- pointer spotlight + magnets (same spring constants as Act 3.5) -----
  let pointerX = -1e4;
  let pointerY = -1e4;
  let spotX = 30; let spotY = 45;
  let spotTX = 30; let spotTY = 45;

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

  const magnets = [];
  function collectMagnets() {
    magnets.length = 0;
    if (!magneticOn) return;
    stage.querySelectorAll('.pl-stat, .pl-link, .pl-chip').forEach((el) => {
      if (magnets.some((m) => m.el === el)) return;
      magnets.push({ el, rect: null, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, moved: false, maxShift: 5 });
    });
  }

  function cacheRects() {
    magnets.forEach((m) => { m.rect = m.el.getBoundingClientRect(); });
  }

  function updatePhysics() {
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
      } else { m.tx = 0; m.ty = 0; }
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

  // ----- act loop (gated to on-screen frames) ------------------------------
  let active = false;
  let rafId = 0;
  let p34 = 0;

  function loop() {
    if (!active) return;
    if (!reduceMotion) {
      // Choreography completes at scroll 0.935 (mid-act dwell tail).
      const t = typeof getProgress === 'function' ? getProgress() : 0;
      const pT = Math.min(1, Math.max(0, (t - 0.925) / 0.010));
      p34 += (pT - p34) * 0.09;
      if (Math.abs(pT - p34) < 0.001) p34 = pT;
      stage.style.setProperty('--act34-p', p34.toFixed(4));

      spotX += (spotTX - spotX) * 0.14;
      spotY += (spotTY - spotY) * 0.14;
      stage.style.setProperty('--pl-spot-x', `${spotX.toFixed(2)}%`);
      stage.style.setProperty('--pl-spot-y', `${spotY.toFixed(2)}%`);

      updatePhysics();
    }
    rafId = requestAnimationFrame(loop);
  }

  function resetVisuals() {
    stage.style.setProperty('--act34-p', '0');
    p34 = 0;
    spotX = spotTX = 30;
    spotY = spotTY = 45;
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
      refresh();
      scrollHeatToNow();
      if (finePointer && !reduceMotion) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        stage.addEventListener('pointerleave', onPointerOut);
      }
      if (heatEl && finePointer) {
        heatEl.addEventListener('mouseover', onHeatOver);
        heatEl.addEventListener('mouseleave', onHeatOut);
      }
      rafId = requestAnimationFrame(loop);
    } else {
      window.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerleave', onPointerOut);
      if (heatEl) {
        heatEl.removeEventListener('mouseover', onHeatOver);
        heatEl.removeEventListener('mouseleave', onHeatOut);
      }
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (countRaf) { cancelAnimationFrame(countRaf); countRaf = 0; }
      resetVisuals();
    }
  }

  // Phone: the calendar scrolls sideways — park it on the most recent weeks.
  function scrollHeatToNow() {
    const scroller = stage.querySelector('.pl-heat-scroll');
    if (scroller && scroller.scrollWidth > scroller.clientWidth) {
      requestAnimationFrame(() => { scroller.scrollLeft = scroller.scrollWidth; });
    }
  }
  window.addEventListener('resize', scrollHeatToNow);

  // ----- boot: snapshot renders immediately (offline-first) -----------------
  collectMagnets();
  apply(initial, 'snapshot');

  // Test-harness probe
  window.__pulseProbe = () => ({
    active,
    p34,
    counted: countedOnce,
    source,
    cells: cells.length,
    rows: feedEl ? feedEl.children.length : 0,
    chips: recentEl ? recentEl.children.length : 0,
    magnets: magnets.length,
    statText: statEls.map((el) => el.textContent),
  });

  return { setActive };
}

