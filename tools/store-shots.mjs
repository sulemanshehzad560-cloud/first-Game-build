// Store screenshots for Google Play (1080x1920) and the App Store (1290x2796, 6.9" iPhone).
// Run: node tools/store-shots.mjs   (needs Playwright; set PLAYWRIGHT=/path/to/playwright/index.mjs if it is not installed here)
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(path.join(root, 'index.html')).href;
const stars = {}; for (let i = 1; i < 37; i++) stars[i] = i % 4 ? 3 : 2;
const save = { level: 37, stars, seenHowto: true, theme: 'jade' };
const targets = [
  { dir: 'store/screenshots', w: 405, h: 720, px: 1080 },
  { dir: 'store/app-store-screenshots', w: 430, h: 932, px: 1290 }
];

const browser = await chromium.launch();
for (const t of targets) {
  const out = path.join(root, t.dir); mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: t.px / t.w, hasTouch: true });
  const open = async (state) => {
    await page.goto(url); await page.evaluate(s => localStorage.setItem('jaderush.v1', JSON.stringify(s)), state || save);
    await page.goto(url); await page.waitForTimeout(1800);
  };
  const play = (from, to, gap) => page.evaluate(async ([a0, a1, ms]) => {
    const J = window.JadeRush, b = J.board, sol = J.state().gen.solution.slice(a0, a1);
    const tap = i => { const r = b.rect(i), c = b.c.getBoundingClientRect(); b.c.dispatchEvent(new PointerEvent('pointerdown', { clientX: c.left + r.x + r.w / 2, clientY: c.top + r.y + r.h / 2, bubbles: true, pointerType: 'touch' })); };
    for (const [x, y] of sol) { tap(x); await new Promise(r => setTimeout(r, 80)); tap(y); await new Promise(r => setTimeout(r, ms)); }
  }, [from, to, gap]);
  const shot = name => page.screenshot({ path: path.join(out, name) });

  await open(); await shot('01-home.png');
  await page.click('#btn-continue'); await page.waitForTimeout(2800);
  await play(0, 3, 900); await page.evaluate(() => { const J = window.JadeRush, s = J.state(); J.board.sel = s.gen.solution[3][0]; J.board.invalidate && J.board.invalidate(); });
  await page.waitForTimeout(500); await shot('02-gameplay.png');
  await play(3, 9, 260); await page.waitForTimeout(180); await shot('03-combo.png');
  await play(9, 999, 60); await page.waitForTimeout(2600); await shot('04-cleared.png');
  await open(); await page.click('#btn-themes'); await page.waitForTimeout(900); await shot('05-tile-sets.png');
  await open(); await page.click('#btn-ai'); await page.waitForTimeout(500);
  await page.click('#modal-actions .primary'); await page.waitForTimeout(2800);
  await play(0, 1, 300); await page.waitForTimeout(3500); await play(0, 0, 0); await shot('06-duel.png');
  await page.close();
  console.log('wrote', t.dir);
}
await browser.close();
