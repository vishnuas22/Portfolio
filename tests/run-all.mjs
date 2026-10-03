// Runs every assertion suite in sequence and prints a roll-up.
// Requires the dev server: `npm run dev` first, then `npm test`.
import { spawnSync } from 'node:child_process';

const suites = [
  ['Act 1 baseline shots', 'tests/act1-baseline.mjs'],
  ['Project reel (Act 2.5)', 'tests/reel-test.mjs'],
  ['Project reel drill', 'tests/reel-drill.mjs'],
  ['Experience (Act 3)', 'tests/xp-test.mjs'],
  ['Knowledge (Act 3.5)', 'tests/papers-test.mjs'],
  ['Contact (Act 4)', 'tests/contact-test.mjs'],
];

const results = [];
for (const [name, file] of suites) {
  console.log(`\n\x1b[1m━━━ ${name} (${file}) ━━━\x1b[0m`);
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  const ok = r.status === 0;
  results.push({ name, ok });
  console.log(ok ? `\x1b[32m✓ ${name}\x1b[0m` : `\x1b[31m✗ ${name}\x1b[0m`);
}

console.log('\n\x1b[1m━━━ roll-up ━━━\x1b[0m');
for (const { name, ok } of results) {
  console.log(`${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${name}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} suites green`);
process.exit(failed ? 1 : 0);