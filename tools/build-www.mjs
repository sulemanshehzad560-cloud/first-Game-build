// Copies the static game into www/ for Capacitor. No bundler: the game is plain HTML/CSS/JS.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
const out = 'www';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of ['index.html', 'privacy.html', 'favicon.png', 'css', 'js', 'fonts', 'vendor']) {
  if (existsSync(p)) cpSync(p, `${out}/${p}`, { recursive: true });
}
console.log('www/ ready');
