// End-to-end test of the debug APK on an Android emulator (run inside android-emulator-runner).
// Drives the game's WebView with Playwright, plays a level, and checks for JS errors and crashes.
import { _android as android } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const PKG = 'com.sulemanshehzad.jaderush';
const APK = process.env.DEBUG_APK;
const OUT = 'e2e-out';
mkdirSync(OUT, { recursive: true });
const report = [];
const log = (ok, msg) => { report.push((ok ? 'PASS ' : 'FAIL ') + msg); console.log((ok ? '✅ ' : '❌ ') + msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const [device] = await android.devices();
console.log('Device:', device.model(), device.serial());
await device.shell(`pm uninstall ${PKG}`).catch(() => {});
await device.installApk(APK);
execSync('adb logcat -c');
await device.shell(`am start -W -n ${PKG}/.MainActivity`);

const webview = await device.webView({ pkg: PKG }, { timeout: 60000 });
const page = await webview.page();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.waitForFunction(() => window.JadeRush && document.getElementById('home') && !document.getElementById('home').hidden, null, { timeout: 30000 });
await page.evaluate(() => { localStorage.setItem('jaderush.v1', JSON.stringify({ seenHowto: true, level: 1 })); setTimeout(() => location.reload(), 100); });
await sleep(1500);
await page.waitForFunction(() => window.JadeRush && !document.getElementById('home').hidden, null, { timeout: 30000 });
await sleep(2500);
const shot = async name => writeFileSync(`${OUT}/${name}.png`, await device.screenshot());
await shot('01-home');

const isNative = await page.evaluate(() => !!(window.NativeShell && window.NativeShell.isNative));
log(isNative, 'Capacitor native bridge detected');
const debugFlag = await page.evaluate(() => window.NativeShell.isDebug());
log(debugFlag === true, 'BuildInfo plugin reports a debug build (test ads only)');
const insets = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top'));
log(true, 'Safe-area inset top from Capacitor: ' + (insets || '(none)'));
const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 20px "Noto Serif SC"', '中') && document.fonts.check('800 20px "Bricolage Grotesque"', 'Jade'); });
log(fontsOk, 'Bundled fonts loaded');

// Settings screen.
await page.evaluate(() => document.getElementById('btn-settings').click());
await sleep(700); await shot('02-settings');
const rows = await page.evaluate(() => [...document.querySelectorAll('.setting-row')].map(r => r.textContent.trim()));
log(rows.length >= 5, 'Settings rows: ' + rows.join(' | '));
await page.evaluate(() => document.querySelector('#modal-actions .primary').click());

// Play level 1 to the end by tapping each solution pair.
await page.evaluate(() => document.getElementById('btn-continue').click());
await sleep(2500); await shot('03-level-start');
const tap = i => page.evaluate(i => {
  const b = JadeRush.board, r = b.rect(i), c = b.c.getBoundingClientRect();
  const x = c.left + r.x + r.w / 2, y = c.top + r.y + r.h / 2;
  b.c.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
}, i);
const sol = await page.evaluate(() => JadeRush.state().gen.solution);
for (let k = 0; k < sol.length; k++) {
  await tap(sol[k][0]); await sleep(120); await tap(sol[k][1]);
  if (k === 2) { await sleep(180); await shot('04-slam'); }
  await sleep(450);
}
await sleep(1500); await shot('05-level-cleared');
const title = await page.evaluate(() => document.getElementById('modal-title').textContent);
log(/cleared|Flawless/i.test(title), 'Level 1 cleared, result screen: ' + title);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jaderush.v1')).level);
log(saved === 2, 'Progress saved (next level = ' + saved + ')');

// Pause freezes the clock.
await page.evaluate(() => document.querySelector('#modal-actions .primary').click());
await sleep(2500);
await page.evaluate(() => document.getElementById('btn-quit').click());
await sleep(500); await shot('06-paused');
const t1 = await page.evaluate(() => JadeRush.state().timeLeft); await sleep(2000);
const t2 = await page.evaluate(() => JadeRush.state().timeLeft);
log(Math.abs(t1 - t2) < 50, 'Pause stops the clock');
await page.evaluate(() => [...document.querySelectorAll('#modal-actions button')].find(b => b.textContent === 'Quit').click());
await sleep(800);

// Vs computer duel: one human turn, then the AI must reply.
await page.evaluate(() => document.getElementById('btn-ai').click());
await sleep(500);
await page.evaluate(() => document.querySelector('#modal-actions .primary').click());
await sleep(2500);
const pair = await page.evaluate(() => { const G = JadeRush.state(); return Mahjong.freePairs(G.lay, G.present, G.kinds)[0]; });
await tap(pair[0]); await sleep(150); await tap(pair[1]);
await sleep(4500); await shot('07-vs-computer');
const scores = await page.evaluate(() => JadeRush.state().scores);
log(scores[0] > 0 && scores[1] > 0, 'Duel: human and computer both scored (' + scores.join('-') + ')');

// Tile sets screen.
await page.evaluate(() => { document.getElementById('btn-quit').click(); });
await sleep(400);
await page.evaluate(() => [...document.querySelectorAll('#modal-actions button')].find(b => b.textContent === 'Quit').click());
await sleep(600);
await page.evaluate(() => document.getElementById('btn-themes').click());
await sleep(900); await shot('08-tile-sets');

// Android back button closes the dialog instead of exiting.
await device.shell('input keyevent 4'); await sleep(800);
const modalClosed = await page.evaluate(() => document.getElementById('modal').hidden);
log(modalClosed, 'Back button closes dialogs');

// Background / foreground round trip.
await device.shell('input keyevent 3'); await sleep(1500);
await device.shell(`am start -n ${PKG}/.MainActivity`); await sleep(2000);
const alive = (await device.shell(`pidof ${PKG}`)).toString().trim();
log(!!alive, 'App survives background/foreground (pid ' + alive + ')');

const logcat = execSync('adb logcat -d', { maxBuffer: 64 * 1024 * 1024 }).toString();
writeFileSync(`${OUT}/logcat-debug.txt`, logcat);
const fatal = logcat.split('\n').filter(l => /FATAL EXCEPTION|AndroidRuntime: Process: com\.sulemanshehzad|ANR in com\.sulemanshehzad/.test(l));
log(fatal.length === 0, 'No crashes or ANRs in logcat' + (fatal.length ? ': ' + fatal.join(' / ') : ''));
const ads = logcat.split('\n').filter(l => /Ads\s*:|AdMob|UserMessagingPlatform/i.test(l)).slice(0, 40);
writeFileSync(`${OUT}/admob-log.txt`, ads.join('\n'));
const jsErrors = errors.filter(e => !/net::ERR|Failed to load resource|peerjs/i.test(e));
log(jsErrors.length === 0, 'No JavaScript errors' + (jsErrors.length ? ': ' + jsErrors.slice(0, 5).join(' / ') : ''));

writeFileSync(`${OUT}/report.txt`, report.join('\n') + '\n');
await device.close();
if (report.some(l => l.startsWith('FAIL'))) { console.error('E2E failures'); process.exit(1); }
