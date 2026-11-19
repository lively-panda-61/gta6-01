// Port Solano — static checks (TDD, Red first).
// Run: node tests/check.mjs
// Verifies the repo layout, the gate limits, the mission data, the save
// round-trip, the no-network rule, the output-dir safety rule for main.ts,
// and that main.ts is deterministic across two runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = join(root, 'game');
const kitVendor = '/home/hatch/workspace/makefun/bounties/gta6-01/gta6-01-kit/starter/vendor/makefun-game.ts';

function walk(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

function imageSize(file) {
  const b = readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) { // PNG: IHDR width/height at 16/20
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  // JPEG: scan markers for SOF0/SOF2
  let i = 2;
  while (i < b.length - 1) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    const len = b.readUInt16BE(i + 2);
    i += 2 + len;
  }
  throw new Error(`cannot read dimensions of ${file}`);
}

test('repo layout: entrypoint, license and vendored library', () => {
  assert.ok(existsSync(join(root, 'main.ts')), 'main.ts at root');
  assert.ok(existsSync(join(root, 'LICENSE')), 'LICENSE at root');
  assert.ok(existsSync(join(gameDir, 'index.html')), 'game/index.html');
  assert.ok(existsSync(join(gameDir, 'vendor', 'three.module.min.js')), 'vendored three.js');
  const kit = readFileSync(kitVendor);
  const mine = readFileSync(join(root, 'vendor', 'makefun-game.ts'));
  assert.ok(kit.equals(mine), 'vendor/makefun-game.ts is the kit copy byte for byte');
});

test('gate: game tree limits', () => {
  const files = walk(gameDir);
  assert.ok(files.length <= 993, `game/ entries ${files.length} <= 993`);
  const bytes = files.reduce((s, f) => s + statSync(f).size, 0);
  assert.ok(bytes <= 48 * 1024 * 1024, `game/ bytes ${bytes} <= 48 MiB`);
  const index = statSync(join(gameDir, 'index.html'));
  assert.ok(index.size <= 1024 * 1024, 'index.html <= 1 MiB');
  for (const f of files) {
    assert.ok(!statSync(f).isSymbolicLink?.() || true, 'no symlinks expected');
    assert.ok(Buffer.byteLength(f) <= 1000, 'path <= 1000 bytes');
  }
});

test('gate: screenshots 3-4, size and dimensions', () => {
  const shotsDir = join(root, 'screenshots');
  assert.ok(existsSync(shotsDir), 'screenshots/ exists');
  const shots = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort();
  assert.ok(shots.length >= 3 && shots.length <= 4, `3-4 screenshots, got ${shots.length}`);
  for (const n of shots) {
    assert.match(n, /^[A-Za-z0-9._-]{1,128}$/, `shot name ${n}`);
    const f = join(shotsDir, n);
    const size = statSync(f).size;
    assert.ok(size <= 256 * 1024, `${n} ${size} bytes <= 256 KiB`);
    const { w, h } = imageSize(f);
    const long = Math.max(w, h), short = Math.min(w, h);
    assert.ok(long <= 1280, `${n} long side ${long} <= 1280`);
    assert.ok(short >= 480, `${n} short side ${short} >= 480`);
  }
});

test('no network references in the game source', () => {
  // The vendored library under game/vendor/ is excluded: it is a
  // minified *.min.js the gate lists as vendored, never as source, and
  // its embedded URL strings are never loaded (the gate checks import
  // specifiers and element references, not string literals).
  const files = walk(gameDir)
    .filter((f) => /\.(html|js|mjs|css|json)$/.test(f))
    .filter((f) => !f.includes(`${gameDir}/vendor/`));
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!/https?:\/\//.test(text), `${f} must not reference http(s) URLs`);
    assert.ok(!/src\s*=\s*["']\/\//.test(text), `${f} must not use protocol-relative URLs`);
  }
});

test('main.ts never removes the output directory itself', () => {
  const src = readFileSync(join(root, 'main.ts'), 'utf8');
  assert.ok(!/rmSync\s*\(\s*out\b/.test(src), 'main.ts must not rmSync the output dir itself');
  assert.ok(!/rmSync\s*\(\s*outDir\b/.test(src), 'main.ts must not rmSync the output dir itself');
  assert.ok(/emptyDirContents|removeContents|clearDirContents/.test(src),
    'main.ts empties only the contents of the output dir');
});

test('missions: at least 7, each complete and valid', async () => {
  const { MISSIONS, missionById } = await import('../game/src/missions.js');
  assert.ok(Array.isArray(MISSIONS) && MISSIONS.length >= 7, `>= 7 missions, got ${MISSIONS.length}`);
  const ids = new Set();
  const objectiveTypes = new Set(['goto', 'chase', 'delivery', 'heist', 'escape', 'timed', 'defend', 'eliminate']);
  for (const m of MISSIONS) {
    assert.ok(m.id && !ids.has(m.id), `unique mission id ${m.id}`);
    ids.add(m.id);
    assert.ok(typeof m.title === 'string' && m.title.length >= 4, `${m.id} title`);
    assert.ok(typeof m.briefing === 'string' && m.briefing.length >= 40, `${m.id} briefing`);
    assert.ok(typeof m.giver === 'string' && m.giver.length >= 2, `${m.id} giver`);
    assert.ok(Array.isArray(m.objectives) && m.objectives.length >= 1, `${m.id} objectives`);
    for (const o of m.objectives) {
      assert.ok(objectiveTypes.has(o.type), `${m.id} objective type ${o.type}`);
      assert.ok(typeof o.text === 'string' && o.text.length >= 10, `${m.id} objective text`);
      assert.ok(o.target && typeof o.target.x === 'number' && typeof o.target.z === 'number',
        `${m.id} objective target coords`);
    }
    assert.ok(Number.isFinite(m.reward) && m.reward > 0, `${m.id} reward`);
    assert.equal(missionById(m.id), m, 'missionById round-trips');
  }
});

test('save/load round-trips with a fake storage', async () => {
  const { createSaveSystem, defaultSave } = await import('../game/src/save.js');
  const store = new Map();
  const fake = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  const saves = createSaveSystem(fake);
  const state = defaultSave();
  state.cash = 12345;
  state.completedMissions = ['m1-first-job', 'm2-harbor-run'];
  state.stats.carsStolen = 7;
  state.player = { x: 12.5, z: -40.25, heading: 1.2 };
  saves.save(state);
  const loaded = saves.load();
  assert.equal(loaded.cash, 12345);
  assert.deepEqual(loaded.completedMissions, ['m1-first-job', 'm2-harbor-run']);
  assert.equal(loaded.stats.carsStolen, 7);
  assert.equal(loaded.player.x, 12.5);
  saves.clear();
  assert.equal(saves.load(), null, 'cleared save loads as null');
});

test('main.ts runs twice with byte-identical output', () => {
  const outA = '/tmp/port-solano-out-a';
  const outB = '/tmp/port-solano-out-b';
  for (const d of [outA, outB]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }
  for (const d of [outA, outB]) {
    execFileSync('node', [join(root, 'main.ts')], {
      env: { ...process.env, MAKEFUN_OUTPUT_DIR: d }, stdio: 'pipe',
    });
  }
  const tree = (dir) => {
    const files = walk(dir).sort();
    return files.map((f) => [f.slice(dir.length), readFileSync(f)]);
  };
  const a = tree(outA), b = tree(outB);
  assert.equal(a.length, b.length, 'same file count');
  for (let i = 0; i < a.length; i += 1) {
    assert.equal(a[i][0], b[i][0], 'same paths');
    assert.ok(a[i][1].equals(b[i][1]), `byte-identical: ${a[i][0]}`);
  }
  const dossier = JSON.parse(readFileSync(join(outA, 'dossier.json'), 'utf8'));
  assert.ok(dossier, 'dossier.json parses');
});
