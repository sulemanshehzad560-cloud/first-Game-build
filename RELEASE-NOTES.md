Jade Rush 1.0.0 (version code 217)

- jade-rush-*-debug.apk: install directly on a phone for testing (shows Google test ads).
- jade-rush-*.aab: the release bundle for Google Play.
- emulator-test-results.zip: screenshots, logcat and the test report.

Emulator tests: failure

```
PASS Capacitor native bridge detected
PASS BuildInfo plugin: {"debug":true,"facebook":false}
PASS Facebook not configured: Friends entry hidden
PASS Safe-area inset top: 0px
PASS Battery saver auto-detected: true
PASS Bundled fonts loaded
PASS Settings rows: Sound effects | Vibration | Battery saver (fewer effects) | Tile sets› | How to play› | Privacy policy›
FAIL play level 1 threw: page.evaluate: Target page, context or browser has been closed
FAIL pause threw: page.evaluate: Target page, context or browser has been closed
FAIL vs computer threw: page.evaluate: Target page, context or browser has been closed
FAIL tile sets and back button threw: page.evaluate: Target page, context or browser has been closed
FAIL background and resume threw: androidDevice.shell: Device is closed
PASS No crashes or ANRs in logcat
PASS NOTE AdMob consent message not set up in the AdMob account yet (Privacy & messaging → GDPR)
PASS No JavaScript errors
```

iOS simulator tests: failure
