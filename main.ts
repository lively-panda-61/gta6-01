// Port Solano — the program that hands the game in (Node 22, standard
// library only). It assembles /output from this repository: a fresh copy
// of game/ and screenshots/, then the dossier the judge reads, written by
// the vendored make.fun library from vendor/makefun-game.ts.
//
// Usage:
//   MAKEFUN_OUTPUT_DIR=out node main.ts        (the grader leaves it unset,
//                                               so /output is used there)
//   node main.ts --out <dir>                   (local runs and the test suite)
//
// The output directory itself is NEVER removed: on the grader /output is a
// mounted volume, and removing the mount point fails the run. Only its
// contents are emptied, then rebuilt. The copy is done file by file (not
// one recursive cp) so the log can name every file it carries, and the
// dossier step runs last, on the finished tree — the gate compares
// dossier.json against exactly these bytes.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outDir = outFlag === -1 ? (process.env.MAKEFUN_OUTPUT_DIR ?? '/output') : args[outFlag + 1];
if (!outDir) {
  console.error('[port-solano] --out needs a directory');
  process.exit(2);
}
const out = resolve(outDir);

// Empty a directory's contents without ever removing the directory itself.
function emptyDirContents(dir) {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    rmSync(join(dir, entry.name), { recursive: true, force: true });
  }
}

function listFiles(dir, base = dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(path, base));
    else if (entry.isFile()) found.push(relative(base, path));
  }
  return found.sort();
}

function copyTree(srcDir, destDir, label) {
  const files = existsSync(srcDir) ? listFiles(srcDir) : [];
  let bytes = 0;
  for (const rel of files) {
    const src = join(srcDir, rel);
    const dest = join(destDir, rel);
    mkdirSync(join(dest, '..'), { recursive: true });
    cpSync(src, dest);
    bytes += statSync(src).size;
  }
  console.log(`[port-solano] ${label}: ${files.length} files, ${bytes} bytes -> ${destDir}`);
  return { files: files.length, bytes };
}

emptyDirContents(out);
const game = copyTree(join(here, 'game'), join(out, 'game'), 'game');
const shots = copyTree(join(here, 'screenshots'), join(out, 'screenshots'), 'screenshots');
if (game.files === 0) {
  console.error('[port-solano] game/ is empty — nothing to hand in');
  process.exit(1);
}
if (shots.files < 3 || shots.files > 4) {
  console.error(`[port-solano] screenshots/ must hold 3 or 4 images, found ${shots.files}`);
  process.exit(1);
}

// The scorer's caps for this competition (gate.json): text budget for the
// dossier, screenshot count/size, and the game tree limits.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`[port-solano] dossier.json: ${dossier.length} bytes — entry ready in ${out}`);
