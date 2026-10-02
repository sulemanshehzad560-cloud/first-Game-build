// End-to-end test of the debug APK on an Android emulator (run inside android-emulator-runner).
// Drives the game's WebView with Playwright, plays a level, and checks for JS errors and crashes.
// Every step is isolated: a failure is recorded and the run continues so the report shows everything.
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
const adb = cmd => execSync('adb ' + cmd, { maxBuffer: 64 * 1024 * 1024 }).toString();

const [device] = await android.devices();
console.log('Device:', device.model(), device.serial());
await device.shell(`pm uninstall ${PKG}`).catch(() => {});
console.log('… installing', APK);
await device.installApk(APK);
adb('logcat -c');
console.log('… launching');
await device.shell(`am start -W -n ${PKG}/.MainActivity`);
console.log('… launched');

let page;
const errors = [];
async function connect() {
  const webview = await device.webView({ pkg: PKG }, { timeout: 60000 });
  page = await webview.page();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.waitForFunction(() => window.JadeRush && !document.getElementById('home').hidden, null, { timeout: 30000 });
}
// Each step gets two minutes; a stalled WebView or emulator fails the step instead of hanging the job.
async function step(name, fn) {
  console.log('… ' + name);
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('step timed out after 120 s')), 120000); });
  try { await Promise.race([fn(), limit]); }
  catch (e) {
    log(false, name + ' threw: ' + String(e.message || e).split('\n')[0]);
    const pid = (await device.shell(`pidof ${PKG}`).catch(() => Buffer.from(''))).toString().trim();
    console.log('   app pid after failure: ' + (pid || 'none'));
    const tail = adb('logcat -d -t 400').split('\n').filter(l => /chromium|crash|FATAL|AndroidRuntime|Capacitor|jaderush|lowmemorykiller|Renderer/i.test(l)).slice(-40);
    console.log('   logcat:\n   ' + tail.join('\n   '));
    try { if (!pid) { await device.shell(`am start -W -n ${PKG}/.MainActivity`); } await Promise.race([connect(), new Promise((_, r) => setTimeout(() => r(new Error('reconnect timed out')), 90000))]); } catch (e2) { console.log('   reconnect failed: ' + e2.message); }
  } finally { clearTimeout(timer); }
}
const shot = async name => { try { writeFileSync(`${OUT}/${name}.png`, await device.screenshot()); } catch (e) { /* ignore */ } };
const tap = i => page.evaluate(i => {
  const b = JadeRush.board, r = b.rect(i), c = b.c.getBoundingClientRect();
  const x = c.left + r.x + r.w / 2, y = c.top + r.y + r.h / 2;
  b.c.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
}, i);
const clickText = text => page.evaluate(t => { const b = [...document.querySelectorAll('#modal-actions button')].find(x => x.textContent === t); if (!b) throw new Error('no button ' + t); b.click(); }, text);

await step('launch', async () => {
  await connect();
  await page.evaluate(() => { localStorage.setItem('jaderush.v1', JSON.stringify({ seenHowto: true, level: 1 })); setTimeout(() => location.reload(), 100); });
  await sleep(1500);
  await page.waitForFunction(() => window.JadeRush && !document.getElementById('home').hidden, null, { timeout: 30000 });
  await sleep(2500); await shot('01-home');
});

await step('native checks', async () => {
  log(await page.evaluate(() => !!(window.NativeShell && window.NativeShell.isNative)), 'Capacitor native bridge detected');
  const bi = await page.evaluate(async () => {
    try { return JSON.stringify(await window.Capacitor.registerPlugin('BuildInfo').isDebug()); }
    catch (e) { return 'ERR ' + e.message + ' | plugins: ' + (window.Capacitor.PluginHeaders || []).map(h => h.name).join(','); }
  });
  log(/"debug":true/.test(bi), 'BuildInfo plugin: ' + bi);
  const fb = /"facebook":true/.test(bi);
  const fbHidden = await page.evaluate(() => document.getElementById('btn-lobby-friends').hidden);
  log(fb ? !fbHidden : fbHidden, fb ? 'Facebook configured: Friends entry shown' : 'Facebook not configured: Friends entry hidden');
  log(true, 'Safe-area inset top: ' + await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top') || '(none)'));
  log(true, 'Battery saver auto-detected: ' + await page.evaluate(() => window.JadeLite));
  log(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 20px "Noto Serif SC"', '中') && document.fonts.check('800 20px "Bricolage Grotesque"', 'Jade'); }), 'Bundled fonts loaded');
});

await step('settings', async () => {
  await page.evaluate(() => document.getElementById('btn-settings').click());
  await sleep(700); await shot('02-settings');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.setting-row')].map(r => r.textContent.trim()));
  log(rows.length >= 6, 'Settings rows: ' + rows.join(' | '));
  await page.evaluate(() => document.querySelector('#modal-actions .primary').click());
});

await step('play level 1', async () => {
  await page.evaluate(() => document.getElementById('btn-continue').click());
  await sleep(2500); await shot('03-level-start');
  const sol = await page.evaluate(() => JadeRush.state().gen.solution);
  for (let k = 0; k < sol.length; k++) {
    await tap(sol[k][0]); await sleep(120); await tap(sol[k][1]);
    if (k === 2) { await sleep(180); await shot('04-slam'); }
    await sleep(450);
  }
  await sleep(1500); await shot('05-level-cleared');
  const title = await page.evaluate(() => document.getElementById('modal-title').textContent);
  log(/cleared|Flawless/i.test(title), 'Level 1 cleared, result screen: ' + title);
  log(await page.evaluate(() => JSON.parse(localStorage.getItem('jaderush.v1')).level) === 2, 'Progress saved');
});

await step('pause', async () => {
  await page.evaluate(() => document.querySelector('#modal-actions .primary').click());
  await sleep(2500);
  await page.evaluate(() => document.getElementById('btn-quit').click());
  await sleep(600); await shot('06-paused');
  const t1 = await page.evaluate(() => JadeRush.state().timeLeft); await sleep(2000);
  const t2 = await page.evaluate(() => JadeRush.state().timeLeft);
  log(Math.abs(t1 - t2) < 50, 'Pause stops the clock');
  await clickText('Quit'); await sleep(800);
  log(await page.evaluate(() => !document.getElementById('home').hidden), 'Quit from pause returns home');
});

await step('vs computer', async () => {
  await page.evaluate(() => document.getElementById('btn-ai').click());
  await sleep(500);
  await page.evaluate(() => document.querySelector('#modal-actions .primary').click());
  await sleep(2500);
  const pair = await page.evaluate(() => { const G = JadeRush.state(); return Mahjong.freePairs(G.lay, G.present, G.kinds)[0]; });
  await tap(pair[0]); await sleep(150); await tap(pair[1]);
  await sleep(4500); await shot('07-vs-computer');
  const scores = await page.evaluate(() => JadeRush.state().scores);
  log(scores[0] > 0 && scores[1] > 0, 'Duel: human and computer both scored (' + scores.join('-') + ')');
  await page.evaluate(() => document.getElementById('btn-quit').click());
  await sleep(600); await shot('07b-duel-paused');
  await clickText('Quit'); await sleep(900);
  log(await page.evaluate(() => !document.getElementById('home').hidden), 'Leaving the duel returns home');
});

await step('tile sets and back button', async () => {
  await page.evaluate(() => document.getElementById('btn-themes').click());
  await sleep(900); await shot('08-tile-sets');
  await device.shell('input keyevent 4'); await sleep(900);
  log(await page.evaluate(() => document.getElementById('modal').hidden), 'Back button closes dialogs');
});

await step('background and resume', async () => {
  await device.shell('input keyevent 3'); await sleep(1500);
  await device.shell(`am start -n ${PKG}/.MainActivity`); await sleep(2500);
  const alive = (await device.shell(`pidof ${PKG}`)).toString().trim();
  log(!!alive, 'App survives background/foreground (pid ' + alive + ')');
});

const logcat = adb('logcat -d');
writeFileSync(`${OUT}/logcat-debug.txt`, logcat);
const fatal = logcat.split('\n').filter(l => /FATAL EXCEPTION|ANR in com\.sulemanshehzad|Renderer process .* (crashed|killed)/.test(l));
log(fatal.length === 0, 'No crashes or ANRs in logcat' + (fatal.length ? ': ' + fatal.slice(0, 3).join(' / ') : ''));
writeFileSync(`${OUT}/admob-log.txt`, logcat.split('\n').filter(l => /Ads\s*:|AdMob|UserMessagingPlatform/i.test(l)).slice(0, 60).join('\n'));
const consentSetup = errors.filter(e => /Publisher misconfiguration/i.test(e));
if (consentSetup.length) log(true, 'NOTE AdMob consent message not set up in the AdMob account yet (Privacy & messaging → GDPR)');
const jsErrors = errors.filter(e => !/net::ERR|Failed to load resource|peerjs|Publisher misconfiguration/i.test(e));
log(jsErrors.length === 0, 'No JavaScript errors' + (jsErrors.length ? ': ' + jsErrors.slice(0, 5).join(' / ') : ''));

writeFileSync(`${OUT}/report.txt`, report.join('\n') + '\n');
await device.close();
if (report.some(l => l.startsWith('FAIL'))) { console.error('E2E failures'); process.exit(1); }
