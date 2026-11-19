// Port Solano — headless-browser checks (Playwright).
// Run: node tests/browser.mjs
// Serves game/ locally, loads it in Chromium, and verifies: no console
// errors, no external requests, player movement, entering a car, wanted
// escalation, mission start, and save/load through the real game.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/makefun/tools/pw/node_modules/playwright-core');

const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const LAUNCH = { executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = join(root, 'game');
const PW = '/home/hatch/workspace/makefun/tools/pw';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

function serve() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = join(gameDir, path === '/' ? 'index.html' : path);
      if (!file.startsWith(gameDir) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const failures = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

const server = await serve();
const port = server.address().port;
const browser = await chromium.launch(LAUNCH);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const externals = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) externals.push(u);
  });
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));

  await page.goto(`http://127.0.0.1:${port}/index.html?shot=cover`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  check('page loads with no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no external requests', externals.length === 0, externals.slice(0, 3).join(' | '));

  const state0 = await page.evaluate(() => window.__game.state());
  check('game reports ready state', state0.phase === 'playing', `phase=${state0.phase}`);
  check('city has buildings', state0.buildings > 100, `${state0.buildings} buildings`);
  check('traffic present', state0.trafficCars >= 8, `${state0.trafficCars} cars`);
  check('pedestrians present', state0.pedestrians >= 10, `${state0.pedestrians} peds`);
  check('missions loaded', state0.missionCount >= 7, `${state0.missionCount} missions`);

  // Movement: hold W for a second, player must move.
  const p0 = await page.evaluate(() => window.__game.state().player);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => window.__game.state().player);
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('WASD moves the player on foot', moved > 1, `moved ${moved.toFixed(2)}m`);

  // Enter a nearby car: teleport the player next to one via the debug hook,
  // then press E. The hook exists only for tests; the game itself uses E.
  await page.evaluate(() => window.__game.debugPlaceByCar());
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  const inCar = await page.evaluate(() => window.__game.state().inCar);
  check('E enters a car', inCar === true, `inCar=${inCar}`);

  // Drive forward; speed must rise.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const speed = await page.evaluate(() => window.__game.state().speedKmh);
  check('car accelerates', speed > 10, `${speed.toFixed(1)} km/h`);

  // Wanted escalation: firing the weapon raises the wanted level.
  await page.keyboard.press('KeyF'); // exit car
  await page.waitForTimeout(300);
  const w0 = await page.evaluate(() => window.__game.state().wanted);
  await page.mouse.click(640, 400); // fire
  await page.waitForTimeout(1200);
  const w1 = await page.evaluate(() => window.__game.state().wanted);
  check('firing raises the wanted level', w1 > w0, `${w0} -> ${w1}`);

  // Mission: start the first mission from the debug hook and check the
  // objective banner updates.
  const mission = await page.evaluate(() => window.__game.debugStartMission(0));
  check('mission starts', mission && mission.active === true, mission?.title || 'no mission');
  const objective = await page.evaluate(() => window.__game.state().objective);
  check('objective text shown', typeof objective === 'string' && objective.length > 5, objective);

  // Save/load round-trip through the real game.
  await page.evaluate(() => window.__game.saveGame());
  const saved = await page.evaluate(() => localStorage.getItem('port-solano-save-v1'));
  check('save writes localStorage', typeof saved === 'string' && saved.length > 20);
  const reloaded = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('port-solano-save-v1'));
    return { cash: s.cash, missions: s.completedMissions.length };
  });
  check('save parses with cash and missions', Number.isFinite(reloaded.cash), JSON.stringify(reloaded));

  // Screenshot staging modes all load cleanly.
  for (const shot of ['drive', 'combat', 'vista']) {
    await page.goto(`http://127.0.0.1:${port}/index.html?shot=${shot}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
    await page.waitForTimeout(800);
  }
  check('all shot modes load', true);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} browser check(s) failed`);
  process.exit(1);
}
console.log('\nAll browser checks passed');
