// Plays the recordings of the original game back and checks that they end
// the same way as in it: node tests/drf.mjs [dir with *.drf, *.edrf, *.out]
//
// The .out files are those of the tests of the original (tests/results),
// one for a DRF and the eDRF made of it. An eDRF has to be checked against
// all the game state hashes in it, too.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dg } from '../web/js/state.js';
import { parse } from '../web/js/record.js';
import { playback } from '../web/js/main.js';

const dir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), 'data');

dg.ftime = 0; // as fast as it goes

let failed = 0;
for (const name of readdirSync(dir).filter((f) => /\.e?drf$/.test(f)).sort()) {
  const drf = parse(readFileSync(join(dir, name), 'utf8'));
  const want = readFileSync(join(dir, name.replace(/\.e?drf$/, '.out')), 'utf8').trim();
  const start = performance.now();
  const r = await playback(drf);
  const secs = ((performance.now() - start) / 1000).toFixed(1);
  const got = drf.nplayers === 2 || drf.diggers === 2
    ? `score=${r.score} score2=${r.score2} level=${r.level} ticks=${r.ticks}`
    : `score=${r.score} level=${r.level} ticks=${r.ticks}`;
  if (got !== want) {
    console.log(`FAIL ${name}\n  want ${want}\n  got  ${got}`);
    failed++;
  } else if (r.check !== null && r.check.status !== 'checked') {
    console.log(`FAIL ${name}: ${r.check.status}: ${r.check.message}`);
    failed++;
  } else {
    console.log(`PASS ${name} (${secs}s)`);
  }
}
process.exit(failed === 0 ? 0 : 1);
