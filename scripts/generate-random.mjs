#!/usr/bin/env node
/**
 * Regenerate the shuffled pointer index that backs `random.json`.
 *
 * A static file cannot return a different verse to each caller, so instead we
 * bake a uniformly-shuffled list of every verse in the version as compact
 * [book, chapter, verse] pointers. A client picks a random index into that list
 * and then fetches the chapter file for the text — two tiny requests, both
 * cached forever at the edge, and uniform over every verse in the Bible.
 *
 * Keeping pointers rather than text keeps the file ~10x smaller than an inline
 * verse list, and the chapter files it points at are already cached.
 *
 * Run with a different --seed to reshuffle for a new release:
 *
 *   node scripts/generate-random.mjs            # default seed, deterministic
 *   node scripts/generate-random.mjs --seed 7   # new shuffle for a release
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SEED = 1611;

const seedArg = process.argv.indexOf('--seed');
const SEED = seedArg === -1 ? DEFAULT_SEED : Number(process.argv[seedArg + 1]);

if (!Number.isInteger(SEED)) {
  console.error('--seed must be an integer');
  process.exit(1);
}

/** Deterministic PRNG (mulberry32) so a given seed always yields the same file. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const versions = JSON.parse(readFileSync(join(ROOT, 'bible/versions.json'), 'utf-8'));
const summary = [];

for (const version of versions) {
  const books = JSON.parse(readFileSync(join(ROOT, version.books_url), 'utf-8'));

  const pointers = [];
  for (const book of books) {
    const data = JSON.parse(readFileSync(join(ROOT, book.book_url), 'utf-8'));
    for (const chapter of data.chapters) {
      for (const verse of chapter.verses) {
        pointers.push([book.id, chapter.chapter, verse.verse]);
      }
    }
  }

  // Fisher-Yates, so the order carries no information about reading order and
  // a client cannot bias its sample by looking at the file.
  const random = mulberry32(SEED);
  for (let i = pointers.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pointers[i], pointers[j]] = [pointers[j], pointers[i]];
  }

  const out = {
    version: version.id,
    description:
      'Uniformly shuffled index of every verse in this version. Pick a random ' +
      'index into "pointers", then fetch the chapter file for its text. ' +
      'This file is static: it is a shuffled list, not a per-request random result.',
    entry_count: pointers.length,
    shuffled: true,
    seed: SEED,
    regenerate: 'node scripts/generate-random.mjs --seed <n>',
    pointer_format: '[book, chapter, verse]',
    chapter_url_template: version.chapter_url_template,
    how_to_use: [
      'const i = Math.floor(Math.random() * data.entry_count);',
      'const [book, chapter, verse] = data.pointers[i];',
      'const res = await fetch(`${BASE}/bible/${data.version}/${book}/${chapter}.json`);',
      'const text = res.verses.find(v => v.verse === verse).text;'
    ].join('\n'),
    pointers
  };

  const file = join(ROOT, `bible/${version.id}/random.json`);
  writeFileSync(file, JSON.stringify(out) + '\n');
  summary.push(`${version.id}: ${pointers.length} pointers, seed ${SEED}`);
}

console.log(summary.join('\n'));