# Portfoliobeast — Vishnu AS · AI/ML Engineer

A cinematic, scroll-driven portfolio rendered like a film: 472 hand-rendered 4K
WebP frames paint onto a fixed canvas while a 900vh scroll track scrubs through
six narrative acts. Every act has its own choreography, physics language, and
telemetry dock — all inside dynamically calibrated letterbox bars.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # production build → dist/
npm run preview  # serve the production build
```

## Tests

Puppeteer-core regression suites live in `tests/`. They expect the dev server
on `:5173`:

```bash
npm run dev      # terminal 1
npm test         # terminal 2 — runs every suite + roll-up
```

Individual suites: `node tests/papers-test.mjs`, `tests/xp-test.mjs`,
`tests/github-test.mjs`, `tests/reel-test.mjs`, `tests/reel-drill.mjs`,
`tests/contact-test.mjs`, `tests/act1-baseline.mjs`. Screenshot helpers:
`tests/papers-shots.mjs`, `tests/xp-shots.mjs`, `tests/github-shots.mjs`
(shots land in `.reeltest/shots/`).

## The acts

| # | Act | Scroll window | Feature |
|---|-----|---------------|---------|
| 0 | Hero | before track | full-bleed landing, scroll cue |
| 1 | Distributed Systems | 0.02 – 0.20 | headline reveal, system badges |
| 2 | Technical Expertise | 0.22 – 0.46 | Matter.js physics pool of real brand icons |
| 2.5 | Project Reel | 0.46 – 0.88 | scroll-scrubbed scene gallery (6 projects) |
| 3 | Experience & Education | 0.88 – 0.925 | timeline dossier, count-up telemetry |
| 3.4 | The Pulse | 0.925 – 0.945 | live GitHub heatmap, streaks, event feed |
| 3.5 | Knowledge Sharing | 0.945 – 0.97 | publications & certifications ledger |
| 4 | Connect | 0.97 – 1.0 | transmission terminal, copy-email, replay |

## Architecture

- **`index.html`** — document structure: letterbox nav + telemetry docks, hero,
  scroll track, one `.stage-view` per act, SEO/meta, JSON-LD.
- **`style.css`** — design system (Google Sans, Google palette), letterbox
  safe-area layout via runtime `--film-top/--film-bottom` vars, per-act
  choreography CSS, reduced-motion blocks, responsive breakpoints (900px/600px).
- **`main.js`** — film engine: frame loader (12 concurrent, 24-frame initial
  buffer, LCP-prioritized frame 1), Lenis smooth scroll, letterbox calibration,
  act gating + telemetry sync, physics controllers for acts 1–4 (magnets,
  tilt springs, count-ups, spotlight, sparks).
- **`projects.js`** — reel data + scene builder + drag/keyboard navigation.
  `tests/projects.baseline.js` is its pristine snapshot (used by the drill test).
- **`github.js`** — Act 3.4 controller: one-shot count-ups, contribution heatmap,
  event feed/chips, tooltip, pointer spotlight, magnetic springs. Fetches the
  GitHub REST + jogruber contribution APIs (unauthenticated, CORS-open) and
  falls back per source to the committed `github-snapshot.json`.
- **`scripts/fetch-github.mjs`** — refreshes `github-snapshot.json` (runs on
  `prebuild`; failure-tolerant: keeps the last good snapshot, writes a stub on
  first failure, never breaks the build).

### Frame assets

`public/frames/frame_0001.webp … frame_0472.webp` — 4K, full quality by design
(≈916 MB total). They are intentionally **not** compressed, resized, or
downgraded; quality is the product. Keep Vite's copy-as-is behavior.

## Accessibility

- Skip link, global `:focus-visible` ring, `aria-current` nav state.
- Inactive acts are `visibility: hidden` — out of tab order and AT tree.
- `prefers-reduced-motion`: smooth-scroll, physics impulses, staggers, springs,
  and stage drift all collapse to instant state changes.
- Copy interactions announce through `aria-live` labels.

## Commands cheat-sheet

| Command | Purpose |
|---------|---------|
| `npm run dev` | dev server with HMR |
| `npm run build` | refresh GitHub snapshot, then production build |
| `npm run snapshot` | only refresh `github-snapshot.json` |
| `npm run preview` | serve `dist/` |
| `npm test` | full regression roll-up (dev server required) |
