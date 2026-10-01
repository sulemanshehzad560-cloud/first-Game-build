// Copies the static game into www/ for Capacitor. No bundler: the game is plain HTML/CSS/JS.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
const out = 'www';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of ['index.html', 'privacy.html', 'data-deletion.html', 'webview-update.html', 'favicon.png', 'css', 'js', 'fonts', 'vendor']) {
  if (existsSync(p)) cpSync(p, `${out}/${p}`, { recursive: true });
}
// Keep the bundled Capacitor runtime in step with the installed @capacitor/core.
cpSync('node_modules/@capacitor/core/dist/capacitor.js', `${out}/vendor/capacitor.js`);
console.log('www/ ready');
