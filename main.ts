// TRADEWIND RUN — hand-in program (Node 22, standard library only).
//
// The game lives in game/ as plain static files a desktop browser loads offline,
// and its screenshots live in screenshots/. This program hands both in: it copies
// them beside this file into /output and writes /output/dossier.json, the summary
// the judge reads, built by the vendored make.fun library from the files as copied.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program runs twice and both runs must write the same bytes: copying files
// and building the dossier from them is deterministic, so they do.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh output directory, then the game and its screenshots, copied whole.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The dossier, built from the copied files with the scorer's own caps:
// at most 160 KiB of source text, 4 screenshots of at most 256 KiB each,
// game/ at most 993 files and 48 MiB, paths at most 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
