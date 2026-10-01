// Renders launcher icons, splash art, the Play Store icon and feature graphic with Playwright.
// Usage: node tools/gen-assets.mjs   (needs the playwright package and a Chromium build)
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve('.');
const res = path.join(root, 'android/app/src/main/res');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(root, 'tools/art.html')).href);

async function shot(mode, w, h, file, round) {
  await page.evaluate(([m, w, h]) => window.render(m, w, h), [mode, w, h]);
  let data = await page.evaluate((round) => {
    const c = document.getElementById('c');
    if (!round) return c.toDataURL('image/png');
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
    const g = o.getContext('2d'); g.beginPath(); g.arc(o.width / 2, o.height / 2, o.width / 2, 0, 6.283); g.clip(); g.drawImage(c, 0, 0);
    return o.toDataURL('image/png');
  }, round);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
}

const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, s] of Object.entries(dens)) {
  await shot('icon-full', 48 * s, 48 * s, `${res}/mipmap-${d}/ic_launcher.png`);
  await shot('icon-full', 48 * s, 48 * s, `${res}/mipmap-${d}/ic_launcher_round.png`, true);
  await shot('icon-fg', 108 * s, 108 * s, `${res}/mipmap-${d}/ic_launcher_foreground.png`);
  await shot('icon-bg', 108 * s, 108 * s, `${res}/mipmap-${d}/ic_launcher_background.png`);
  await shot('splash', 160 * s, 160 * s, `${res}/drawable-${d}/splash_logo.png`);
}
// Old Capacitor splash bitmaps are replaced by a layer-list (res/drawable/splash.xml).
for (const dir of readdirSync(res)) if (/^drawable-(port|land)-/.test(dir)) rmSync(`${res}/${dir}`, { recursive: true, force: true });
rmSync(`${res}/drawable/splash.png`, { force: true });

await shot('icon-full', 512, 512, `${root}/store/icon-512.png`);
await shot('feature', 1024, 500, `${root}/store/feature-graphic-1024x500.png`);
await shot('favicon', 192, 192, `${root}/favicon.png`);
await browser.close();
console.log('assets written');
