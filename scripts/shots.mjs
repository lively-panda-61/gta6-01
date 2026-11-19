// Port Solano — screenshot capture (Playwright).
// Run: node scripts/shots.mjs
// Renders the game in headless Chromium at 1280x800 and writes 4 JPEGs to
// screenshots/: 1-cover (police chase with HUD), 2-drive (city vista from
// the car), 3-combat (on-foot firefight), 4-vista (downtown skyline).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/makefun/tools/pw/node_modules/playwright-core');

const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const LAUNCH = { executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = join(root, 'game');
const shotsDir = join(root, 'screenshots');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

const SHOTS = [
  { name: '1-cover.jpg', shot: 'cover' },
  { name: '2-drive.jpg', shot: 'drive' },
  { name: '3-combat.jpg', shot: 'combat' },
  { name: '4-vista.jpg', shot: 'vista' },
];

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(gameDir, path === '/' ? 'index.html' : path);
  if (!file.startsWith(gameDir) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const browser = await chromium.launch(LAUNCH);
try {
  mkdirSync(shotsDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.error('pageerror:', String(e)));
  for (const s of SHOTS) {
    await page.goto(`http://127.0.0.1:${port}/index.html?shot=${s.shot}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
    await page.waitForTimeout(1800);
    const buf = await page.screenshot({ type: 'jpeg', quality: 82 });
    writeFileSync(join(shotsDir, s.name), buf);
    console.log(`${s.name}: ${(buf.length / 1024).toFixed(1)} KiB`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log('screenshots done');
