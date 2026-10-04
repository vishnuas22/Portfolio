// ==========================================================================
// SOUNDSCAPE — scroll-linked background score + auto-tour (Act 0 → finale)
// ==========================================================================
// One of two OST candidates is chosen at random per page load and loops while
// the visitor scrolls: scrolling fades the score up, stopping fades it down
// and pauses it (resume continues from the same position, never restarts).
//
// Browsers require a real user gesture to start audible media (wheel/scroll
// does NOT count), so playback attempts are optimistic on scroll and re-armed
// through one-shot gesture listeners until an interaction — the sound toggle,
// the tour button, a tap — unlocks the element for the session.
//
// The auto-tour drives one long linear lenis.scrollTo across the whole page,
// paced to land ~2s before the score's track ends: the ~30s OST tracks used to
// "complete" mid-tour at the old 75s pace while frames were still scrubbing.
// A tour start also seeks the score back to 0, so tour and music always begin
// together and all 472 frames always finish first. It cancels on any user
// input: wheel/touch (`virtual-scroll`), clicks on any other control, tab-hide,
// and a per-frame deviation guard that catches keyboard jumps and anchor
// scrolls. Hidden under prefers-reduced-motion.
//
// Everything motion/state related runs off `frame()`, which main.js's tick
// loop calls every rAF — no extra timers, fades included.
// ==========================================================================

const TRACKS = [
  '/audio/aura-farming-1.m4a',
  '/audio/aura-farming-2.m4a',
];

const IDLE_GRACE_MS = 700;   // scroll must stay quiet this long before fading out
const FADE_OUT_MS = 350;     // fade-down ramp before pause()
const FADE_IN_MS = 400;      // fade-up ramp on play
const TARGET_VOLUME = 0.3;   // background level — never full blast
const UNLOCK_RETRY_MS = 1200; // throttle for optimistic play() attempts while blocked
const TOUR_TAIL_S = 2;       // land the tour this long before the score's end
const TOUR_FALLBACK_S = 27;  // pace when metadata isn't ready — safe under
                             // both tracks (the shorter one is 30.28s)
const TOUR_DEVIATION_VH = 1.5; // cancel tour when scroll drifts this far from plan

export function initSoundscape({ lenis, prefersReducedMotion }) {
  const toggle = document.getElementById('sound-toggle');
  const tourBtn = document.getElementById('hero-tour');
  const hero = document.getElementById('hero');
  const scrollWrapper = document.getElementById('scroll-wrapper');

  // --- Track selection: random per page load; only this file is fetched.
  const src = TRACKS[Math.floor(Math.random() * TRACKS.length)];
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;

  let audioOk = true;
  // AAC-less platforms (some Linux Firefox builds) fail silently — no music,
  // but the rest of the experience stays coherent (toggle hides).
  audio.addEventListener('error', () => {
    audioOk = false;
    toggle?.classList.add('is-unavailable');
  });

  // --- Persisted mute preference. Default: on — unless Save-Data is asking
  //     us to be polite, in which case start muted for the session only.
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const saveData = !!navigator.connection?.saveData;
  const stored = store.get('pb-sound');
  let muted = stored !== null ? stored === 'off' : saveData;

  // --- Runtime state
  let unlocked = false;        // a play() has been allowed this session
  let playPending = false;     // play() promise in flight (no double-calls)
  let lastAttemptAt = 0;       // optimistic-retry throttle
  let gestureArmed = false;    // one-shot gesture listeners installed
  let lastScrollY = window.scrollY;
  let lastMoveAt = performance.now();
  let fade = null;             // { dir: 1|-1, from, t0, dur } | null
  let hidden = document.hidden;
  let tourActive = false;
  let tourT0 = 0;
  let tourFrom = 0;
  let tourTo = 0;
  let tourDurationS = 0;      // seconds — the same value feeds scrollTo + guard
  let now = performance.now(); // latest frame clock (rAF time)

  const isReady = () => document.body.classList.contains('is-ready');
  const moving = () => now - lastMoveAt < IDLE_GRACE_MS;
  // May sound be audible right now? (independent of `unlocked` — that gates
  // the attempt itself, not the wish)
  const eligible = () =>
    audioOk && !muted && !hidden && isReady() && (moving() || tourActive);

  // --- UI sync -----------------------------------------------------------
  function syncToggleUI() {
    if (!toggle) return;
    toggle.classList.toggle('is-muted', muted);
    toggle.setAttribute('aria-pressed', String(!muted));
  }

  function syncTourUI() {
    if (!tourBtn) return;
    const label = tourBtn.querySelector('.tour-btn-label');
    const glyph = tourBtn.querySelector('.tour-btn-glyph');
    tourBtn.classList.toggle('is-touring', tourActive);
    if (label) label.textContent = tourActive ? 'Stop tour' : 'Take the tour';
    if (glyph) glyph.textContent = tourActive ? '■' : '▶';
    tourBtn.setAttribute(
      'aria-label',
      tourActive
        ? 'Stop automatic guided tour'
        : 'Start automatic guided tour of the portfolio'
    );
  }

  // --- Playback ----------------------------------------------------------
  function kick() {
    if (playPending || !audioOk || muted || hidden) return;
    playPending = true;
    lastAttemptAt = performance.now();
    audio.play()
      .then(() => {
        playPending = false;
        unlocked = true;
        if (eligible()) {
          beginFade(1);
        } else {
          // Unlock registered from a gesture while idle: stay inaudible
          // (volume is 0) and paused — playback waits for the next scroll.
          audio.pause();
        }
      })
      .catch(() => {
        // Autoplay blocked (no gesture yet) — retry via gesture listeners.
        playPending = false;
        armGestures();
      });
  }

  function beginFade(dir) {
    fade = {
      dir,
      from: audio.volume,
      t0: performance.now(),
      dur: dir > 0 ? FADE_IN_MS : FADE_OUT_MS,
    };
  }

  function stepFade(t) {
    if (!fade) return;
    // Clamp to [0,1]: t is an rAF timestamp which can precede the fade's
    // performance.now() t0 (promise callbacks), yielding a negative k.
    const k = Math.max(0, Math.min(1, (t - fade.t0) / fade.dur));
    audio.volume = fade.dir > 0
      ? fade.from + (TARGET_VOLUME - fade.from) * k
      : fade.from * (1 - k);
    if (k >= 1) {
      if (fade.dir > 0) {
        audio.volume = TARGET_VOLUME;
      } else {
        audio.volume = 0;
        audio.pause();
      }
      fade = null;
    }
  }

  // One-shot unlock listeners for visitors who only wheel-scroll (wheel is
  // not a gesture) — the next tap/key grants playback permission.
  function armGestures() {
    if (gestureArmed) return;
    gestureArmed = true;
    const onGesture = () => {
      document.removeEventListener('pointerdown', onGesture, true);
      document.removeEventListener('touchend', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
      gestureArmed = false;
      kick();
    };
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('touchend', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
  }

  // --- Auto-tour ---------------------------------------------------------
  function endTour() {
    if (!tourActive) return;
    tourActive = false;
    tourT0 = 0;
    syncTourUI();
  }

  function startTour() {
    if (prefersReducedMotion || tourActive) return;
    const trackH = scrollWrapper ? scrollWrapper.offsetHeight : 0;
    const maxTrackScroll = trackH - window.innerHeight;
    if (maxTrackScroll <= 0) return;
    tourActive = true;
    tourFrom = window.scrollY;
    tourTo = (hero ? hero.offsetHeight : window.innerHeight) + maxTrackScroll;
    tourT0 = performance.now();
    // Pace the scrub to the live track: every frame must finish before the
    // score reaches its end (TOUR_TAIL_S of the final bars still to play).
    tourDurationS =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.max(12, audio.duration - TOUR_TAIL_S)
        : TOUR_FALLBACK_S;
    // Restart the score so a mid-track start can't eat the tour's budget —
    // tour and music always begin together (explicit tour gesture = fresh cue).
    if (Number.isFinite(audio.currentTime) && audio.currentTime > 0.25) {
      audio.currentTime = 0;
    }
    syncTourUI();
    kick(); // click = gesture → audible immediately, the whole way down
    lenis.scrollTo(tourTo, {
      duration: tourDurationS,
      easing: (t) => t, // linear — the deviation guard can predict positions
      onStart: () => {
        tourFrom = window.scrollY;
        tourT0 = performance.now();
      },
      onComplete: endTour,
    });
  }

  // Wheel/touch during the tour: Lenis already replaced our animation, so
  // just stop claiming we're touring.
  lenis.on('virtual-scroll', () => {
    if (tourActive) endTour();
  });

  // Any other control (nav pills, reel, replay, brand link…) also replaces
  // the programmatic scroll — cancel on click, before its own handler runs.
  document.addEventListener('click', (e) => {
    if (!tourActive) return;
    const ctl = e.target && e.target.closest ? e.target.closest('button, a') : null;
    if (ctl && ctl !== tourBtn) endTour();
  }, true);

  // Deviation guard: keyboard/native scrolls and anchor jumps emit neither
  // virtual-scroll nor clicks — catch them by predicted-position drift.
  function guardTour(y) {
    if (!tourActive || !tourT0) return;
    const k = Math.min(1, (now - tourT0) / (tourDurationS * 1000));
    const expected = tourFrom + (tourTo - tourFrom) * k;
    if (Math.abs(y - expected) > window.innerHeight * TOUR_DEVIATION_VH) endTour();
  }

  tourBtn?.addEventListener('click', () => {
    if (tourActive) endTour();
    else startTour();
  });

  // --- Controls ----------------------------------------------------------
  toggle?.addEventListener('click', () => {
    muted = !muted;
    store.set('pb-sound', muted ? 'off' : 'on');
    syncToggleUI();
    if (muted) {
      // Hard cut — muting should feel immediate.
      fade = null;
      audio.volume = 0;
      audio.pause();
    } else {
      // Explicit gesture: unlocks + plays if scroll/tour is active.
      kick();
    }
  });

  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden) {
      fade = null;
      audio.volume = 0;
      audio.pause();
      endTour();
    }
  });

  // --- Frame hook (called from main.js's tick loop) ----------------------
  function frame(scrollY, t) {
    now = t;

    if (scrollY !== lastScrollY) {
      lastScrollY = scrollY;
      lastMoveAt = t;
    }
    if (tourActive) guardTour(scrollY);

    const wants = eligible();

    if (wants && audio.paused) {
      // Start (or resume) — throttled while still locked out of autoplay.
      if (!playPending && (unlocked || t - lastAttemptAt > UNLOCK_RETRY_MS)) {
        kick();
      }
    } else if (!wants && !audio.paused) {
      if (!fade || fade.dir > 0) beginFade(-1);
    }

    if (fade) stepFade(t);
  }

  // --- Boot --------------------------------------------------------------
  syncToggleUI();
  syncTourUI();

  window.__audioProbe = () => ({
    src,
    muted,
    unlocked,
    playing: !audio.paused,
    volume: Math.round(audio.volume * 100) / 100,
    touring: tourActive,
    audioOk,
    idleMs: Math.round(performance.now() - lastMoveAt),
    currentTime: Math.round(audio.currentTime * 100) / 100,
    tourDuration: tourDurationS,
    trackDuration:
      Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.round(audio.duration * 100) / 100
        : null,
  });

  return { frame };
}
