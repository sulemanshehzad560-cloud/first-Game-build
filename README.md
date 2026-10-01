# Jade Rush

A Mahjong tile-matching game with **endless levels**, a clock to beat, and **two-player duels**, including online play.
It's plain HTML, CSS and JavaScript, with no build step and no server to run.

## How it plays

Tap two matching tiles to remove them. You can only use **free** tiles: nothing stacked on top, and an open left or right side.
Most kinds have four copies, so taking the wrong pair can bury the tile you need later. Every board is dealt by simulating a full clear, so each one can always be solved, but only if you play it right.

| Mode | Goal |
| --- | --- |
| **Journey** | Clear the board before the clock runs out. Levels are generated from their number, so they never end. Boards get bigger and taller, the clock gets tighter, hints and shuffles get scarcer, and from level 13 free tiles are no longer highlighted. Clear fast without hints for 3 ★. |
| **Daily board** | One shared board per calendar day, with a streak counter. |
| **Online: Race** | Both players get the same board. You can see your rival's progress live. First to clear wins; if both run out, fewer tiles left wins. |
| **Online: Take turns** | One shared board. Each turn you make one match, with 15 seconds per turn. Winds and dragons are worth 2 points. Highest score wins. |
| **Pass & play / Vs computer** | Take-turns duel on one device, or against an AI (Easy, Normal, Hard). Hard also avoids leaving you high-value pairs. |

Look and feel: a top-down view of realistic wooden tiles (varnished grain with knots, unique per tile, carved and painted symbols, a dyed base strip, and shadows cast onto lower layers), six unlockable woods (Maple, Cherry, Birch, Teak, Rosewood, Ebony) that change the tiles and the animated table, chapters of 10 levels, tiles that lift on hover and selection, matched pairs that slam together with a hit-stop, screen shake, sparks, flying chips and a heavy clack, flip animations on shuffle, combo banners, confetti, and haptics on phones.

What keeps it challenging: combo multipliers for matching within 5 seconds, hints that cost 10 seconds, limited shuffles, a time bonus, and per-level best scores.

## Run it

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

To publish it, push to GitHub and turn on **Settings → Pages → Deploy from branch** for this branch. Any static host works too.

Online play uses [PeerJS](https://peerjs.com/) (bundled in `vendor/`) and its free public signaling server. Only moves travel between the players; both browsers build the same board from a shared seed.
To use your own PeerServer, set `window.NOVA_PEER_OPTIONS = { host, port, path, secure }` before `js/net.js` loads.

## Android app

The game ships as an Android app built with [Capacitor](https://capacitorjs.com/) (package `com.sulemanshehzad.jaderush`, target API 36).

* **Builds:** every push runs `.github/workflows/android.yml`. It runs the engine tests and Android lint, builds the debug APK and the release bundle (AAB), tests both on an Android 14 emulator, and attaches everything to a GitHub release. The emulator test drives the game with Playwright: it clears a level, checks pause, a duel, the back button and the logs.
* **Ads:** Google AdMob interstitials between boards (`js/ads.js`), with the consent form and an "Ad privacy choices" entry in Settings. Debug builds only request Google's test ads.
* **Facebook friends:** optional Facebook Login shows which friends play, who is online, and sends duel invites peer to peer (`js/social.js`). It switches on when the build has a Facebook App ID; see [`docs/FACEBOOK_SETUP.md`](docs/FACEBOOK_SETUP.md).
* **Device reach:** Android 7.0+ (about 99% of active devices), phones, tablets and Chromebooks, a battery saver mode for low-end phones, and an update prompt for outdated WebViews.
* **Signing:** the release bundle is signed with an upload key that is never committed. Add it as repository secrets to sign in CI (see `docs/PLAY_STORE_GUIDE.md`).
* **Local build:** `npm ci && npm run android:sync`, then open `android/` in Android Studio or run `./gradlew bundleRelease`.
* **Store assets:** `store/` (icon, feature graphic, phone screenshots), regenerated with `npm run assets`.
* **Publishing:** the full Play Console checklist is in [`docs/PLAY_STORE_GUIDE.md`](docs/PLAY_STORE_GUIDE.md).

## Code map

| File | Purpose |
| --- | --- |
| `js/mahjong.js` | Rules, free-tile logic, layout generator, solvable dealing, reshuffle, duel AI. No DOM, so it also runs in Node. |
| `js/tiles.js` | Tile faces (dots, bamboo, characters, winds, dragons) drawn with canvas. |
| `js/board.js` | 3D board renderer, hit testing, hints, match effects. |
| `js/main.js` | Screens, timed play, duels, saved progress (`localStorage`), online protocol, home demo. |
| `js/net.js` | PeerJS room hosting and joining. |
| `js/native.js` | Android integration: back button, status bar, pause on background, build type. |
| `js/ads.js` | AdMob interstitials and consent (no-op on the web). |
| `js/social.js` | Facebook sign-in, profile and friends list (Android app only). |
| `js/audio.js` | WebAudio tile clacks and combo chimes. |

## Tests

```bash
node tests/mahjong.test.js
```

The test generates levels 1 to 150 and replays each solution to prove every board is clearable. It also checks determinism and reshuffles, and plays AI duels to the end.
