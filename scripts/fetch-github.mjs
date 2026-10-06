#!/usr/bin/env node
// ============================================================================
// GitHub snapshot generator — feeds github-snapshot.json (Act 3.4 "The Pulse")
// ============================================================================
// Run automatically via `prebuild` (and manually: `node scripts/fetch-github.mjs`).
// Failure-tolerant by design: if any network call fails, the previous snapshot
// is kept (or a minimal stub is written when none exists) so `npm run build`
// can never break — Vercel/offline builds included.
//
// Sources (all CORS-open, no token required):
//   1. github-contributions-api.jogruber.de — contribution calendar (1h server cache)
//   2. api.github.com/users/{u}             — profile (60 req/hr unauthenticated)
//   3. api.github.com/users/{u}/events      — recent public activity
//   4. api.github.com/users/{u}/repos       — recently pushed repositories

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER = process.env.GITHUB_USER || 'vishnuas22';
const OUT = join(dirname(dirname(fileURLToPath(import.meta.url))), 'github-snapshot.json');
const TIMEOUT_MS = 8000;

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'portfoliobeast-snapshot', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Streak maths mirror what github.js computes client-side (kept in sync).
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

function stub() {
  return {
    fetchedAt: new Date().toISOString(),
    user: USER,
    profile: { public_repos: 0, followers: 0 },
    stats: { contributions: 0, activeDays: 0, currentStreak: 0, longestStreak: 0 },
    contributions: [],
    events: [],
    repos: [],
    stub: true,
  };
}

async function build() {
  const [contr, profile, events, repos] = await Promise.all([
    getJSON(`https://github-contributions-api.jogruber.de/v4/${USER}?y=last`),
    getJSON(`https://api.github.com/users/${USER}`),
    getJSON(`https://api.github.com/users/${USER}/events/public?per_page=30`),
    getJSON(`https://api.github.com/users/${USER}/repos?per_page=100&sort=updated`),
  ]);

  const days = Array.isArray(contr.contributions) ? contr.contributions : [];
  const { current, longest } = computeStreaks(days);
  const activeDays = days.filter((d) => d.count > 0).length;

  const keep = new Set(['PushEvent', 'CreateEvent', 'WatchEvent', 'ForkEvent', 'PullRequestEvent', 'ReleaseEvent', 'IssuesEvent']);
  const eventRows = (Array.isArray(events) ? events : [])
    .filter((e) => keep.has(e.type))
    .slice(0, 8)
    .map((e) => ({
      type: e.type,
      repo: (e.repo && e.repo.name) || '',
      ref: (e.payload && e.payload.ref) || (e.payload && e.payload.ref_type) || '',
      createdAt: e.created_at,
    }));

  const repoRows = (Array.isArray(repos) ? repos : [])
    .filter((r) => !r.fork)
    .slice(0, 3)
    .map((r) => ({ name: r.name, language: r.language || '', pushedAt: r.pushed_at }));

  return {
    fetchedAt: new Date().toISOString(),
    user: USER,
    profile: { public_repos: profile.public_repos ?? 0, followers: profile.followers ?? 0 },
    stats: {
      contributions: (contr.total && (contr.total.lastYear ?? contr.total[Object.keys(contr.total).pop()])) || 0,
      activeDays,
      currentStreak: current,
      longestStreak: longest,
    },
    contributions: days,
    events: eventRows,
    repos: repoRows,
  };
}

try {
  const data = await build();
  if (!data.contributions.length) throw new Error('empty contribution calendar');
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data) + '\n');
  console.log(
    `[snapshot] ${data.stats.contributions} contributions · ${data.stats.activeDays} active days · ` +
      `${data.events.length} events · ${data.repos.length} repos → github-snapshot.json`
  );
} catch (err) {
  console.warn(`[snapshot] fetch failed (${err.message}) — keeping previous snapshot`);
  if (!existsSync(OUT)) {
    writeFileSync(OUT, JSON.stringify(stub()) + '\n');
    console.warn('[snapshot] wrote minimal stub so the build can resolve the import');
  }
  process.exit(0); // never fail the build
}
