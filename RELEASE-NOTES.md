Jade Rush 1.1.0 (version code 1068)

- jade-rush-*-debug.apk: install directly on a phone for testing (shows Google test ads).
- jade-rush-*.aab: the release bundle for Google Play.
- emulator-test-results.zip: screenshots, logcat and the test report.

Emulator tests: failure

```
PASS Capacitor native bridge detected
PASS BuildInfo plugin: {"debug":true,"facebook":false,"ramMb":2475,"lowRam":false}
PASS Facebook not configured: Friends entry hidden
PASS Safe-area inset top: 0px
PASS Battery saver auto-detected: true
PASS Bundled fonts loaded
PASS Settings rows: Sound effects | Music | Nature sounds | Vibration | Battery saver | How to play› | Privacy policy›
PASS Level 1 cleared, result screen: Flawless · new best
PASS Progress saved
PASS Journey boards are untimed (no clock)
PASS Quit from pause returns home
PASS Duel: human and computer both scored (1-2)
PASS Leaving the duel returns home
PASS Shop screen open
PASS Back button returns home from the Shop
PASS App survives background/foreground (pid 5001)
PASS No crashes or ANRs in logcat
FAIL No JavaScript errors: console: {message: load failed: adUnitId: gc07ub49uhc3va35 errorCode:509, errorMessage:Mediation No fill} / console: {message: load failed: adUnitId: y9qvb7kulzine8sx errorCode:509, errorMessage:Mediation No fill} / console: {message: load failed: adUnitId: gc07ub49uhc3va35 errorCode:509, errorMessage:Mediation No fill} / console: {message: load failed: adUnitId: y9qvb7kulzine8sx errorCode:509, errorMessage:Mediation No fill} / console: {message: load failed: adUnitId: gc07ub49uhc3va35 errorCode:509, errorMessage:Mediation No fill}
PASS release build (from AAB) installs, launches and stays up (pid 8279)
```

iOS simulator tests: success

```
Simulator: CE12A219-9F8C-4450-97EA-8C58715BECFC iPhone Air iOS-26-5
PASS Running on iOS native shell
PASS Debug build (test ads only)
PASS Bundled tile font loaded
PASS Haptics plugin available
PASS AdMob plugin available
PASS Game Center plugin answers
PASS Facebook excluded on iOS, Friends entry hidden
PASS Safe area: max(68px, 0px)
PASS Level 1 cleared: Flawless · new best
PASS Progress saved
PASS Journey boards are untimed (no clock)
PASS Quit from pause
PASS Back on the home screen
PASS Duel: both players scored (1-2)
PASS Shop shows the 6 classic tile sets
PASS Shop lists the board designs
PASS Rush Hour tab opens
PASS Home tab returns home
DONE pass=18 fail=0
NOTE AdMob consent message not set up in the AdMob account yet (Privacy & messaging)
PASS iOS simulator self-test, no crashes, no JS errors (0 checkpoint screenshots)
```

App Store / TestFlight upload: success
PASS Game Center entitlement present
PASS signed build 1068 uploaded to App Store Connect (TestFlight)
