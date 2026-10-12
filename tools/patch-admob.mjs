// @capacitor-community/admob 8.1.0 (iOS) links its consent helper to the plugin only inside initialize(),
// but Google's flow asks for consent before initializing, so showConsentForm / showPrivacyOptionsForm
// found no view controller ("No ViewController") and the GDPR form never appeared. Link it first.
// Runs after npm install / npm ci; safe to run more than once.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const file = 'node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/AdMobPlugin.swift';
if (!existsSync(file)) process.exit(0);
let src = readFileSync(file, 'utf8');
if (src.includes('JADE-PATCH consent')) process.exit(0);
let n = 0;
src = src.replace(/(@objc func (requestConsentInfo|showConsentForm|showPrivacyOptionsForm)\(_ call: CAPPluginCall\) \{\n)/g, (m) => {
  n++;
  return m + '        self.consentExecutor.plugin = self   // JADE-PATCH consent\n';
});
if (n !== 3) { console.error('patch-admob: expected 3 consent methods, found ' + n); process.exit(1); }
writeFileSync(file, src);
console.log('patch-admob: consent helper linked before initialize');
