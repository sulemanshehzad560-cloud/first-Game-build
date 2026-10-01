# Jade Rush on Google Play: closed-testing checklist

Everything Play Console asks for, in the order it asks. Copy-paste the text blocks.

## 1. App identity

| Field | Value |
| --- | --- |
| App name | Jade Rush |
| Package name (permanent) | `com.sulemanshehzad.jaderush` |
| Version | 1.0.0 (version code = 100 + GitHub build number) |
| Default language | English (United States), en-US |
| App or game | Game |
| Free or paid | Free |
| Category | Board (alternative: Puzzle) |
| Tags | Mahjong, Tile matching, Board, Puzzle, Brain games |
| Contains ads | Yes (Google AdMob interstitials) |
| Min / target Android | Android 7.0 (API 24) / Android 16 (API 36) |

## 2. Store listing

**Short description** (80 characters max):

```
Match wooden Mahjong tiles against the clock. Endless levels, online duels.
```

**Full description** (4000 characters max):

```
Jade Rush is Mahjong solitaire with a pulse. Match free tiles in pairs, chain combos before the clock runs out, and watch every pair slam together in a burst of wood chips and sparks.

ENDLESS LEVELS
Every level is generated for you and checked to be solvable, so the journey never ends. Boards grow taller, the clock gets tighter, and from level 13 the game stops highlighting free tiles. Pick the wrong copy of a tile and you can bury the one you need, so think ahead.

COMBOS AND STARS
Match within five seconds of your last pair to build a combo, up to ×12. Clear fast without hints for three stars. Hints cost ten seconds and shuffles are limited.

BEAUTIFUL WOODEN TILES
Carved and painted tiles in six woods: Maple, Cherry, Birch, Teak, Rosewood and Ebony. Earn stars to unlock them all.

DUEL YOUR FRIENDS
• Online Race: both players get the same board. First to clear it wins.
• Online Take Turns: one shared board, one match per turn. Winds and dragons score double.
• Pass & Play on one phone, or play the computer on Easy, Normal or Hard.
Share a five-letter room code and start playing. No account needed.

A NEW DAILY BOARD
One fresh board every day. Keep your streak alive.

FEATURES
• Traditional tiles: dots, bamboo, characters, winds and dragons
• Chapters with their own colors, from Bamboo Grove to Cloud Palace
• Pause any time; the clock stops
• Sound effects and vibration you can switch off
• Works offline (online duels need a connection)
```

**Graphics** (all in the `store/` folder):

| Asset | File | Play requirement |
| --- | --- | --- |
| App icon | `store/icon-512.png` | 512 × 512 PNG |
| Feature graphic | `store/feature-graphic-1024x500.png` | 1024 × 500 PNG/JPG |
| Phone screenshots | `store/screenshots/01-home.png` … `06-duel.png` | 2–8 images, 1080 × 1920 |

Contact details: an email address is required and is shown publicly on the listing.

## 3. App content (Policy → App content)

**Privacy policy.** Turn on GitHub Pages for this repository (Settings → Pages → Deploy from a branch → `ccr-61d5e997-33280i`, folder `/root`). Before you do, replace `CONTACT_EMAIL_HERE` in `privacy.html` with your contact email. The URL will be:

```
https://sulemanshehzad560-cloud.github.io/first-Game-build/privacy.html
```

The same link is in the app under Settings → Privacy policy.

**App access.** All functionality is available without special access.

**Ads.** Yes, the app contains ads.

**Content rating** (IARC questionnaire). Category: Game. Answer **No** to violence, fear, sexuality, gambling (no real or simulated gambling: Mahjong solitaire is a matching game), drugs, crude humour and language. User interaction: users can interact (online duels exchange moves and five fixed emotes only; there is no chat, no user-generated content and no location sharing). Expected rating: Everyone / PEGI 3 or similar.

**Target audience and content.** Choose **13–15, 16–17 and 18+**. Do not include ages under 13: that would put the app under the Families policy and require child-safe ad settings. Answer **No** to "Could your store listing unintentionally appeal to children?" only if you agree it doesn't.

**News app.** No. **Government app.** No. **Financial features.** None. **Health.** None.

**Advertising ID.** Yes, the app uses advertising ID, for **Advertising or marketing** (Google Mobile Ads SDK adds the `AD_ID` permission automatically).

**Data safety.** The app itself sends nothing to you; the Google Mobile Ads SDK does. Declare:

| Question | Answer |
| --- | --- |
| Does your app collect or share user data? | Yes |
| Is all data encrypted in transit? | Yes |
| Can users request data deletion? | No (no accounts; progress lives only on the device) |
| Location → Approximate location | Collected and shared; Advertising or marketing, Analytics, Fraud prevention; not required (users can't opt out of IP-based location, so tick "required" if Console insists) |
| Device or other IDs | Collected and shared; Advertising or marketing, Analytics, Fraud prevention |
| App activity → App interactions | Collected and shared; Advertising or marketing, Analytics |
| App info and performance → Crash logs, Diagnostics | Collected and shared; Analytics, Fraud prevention |

Online duels connect players directly (peer to peer) and only exchange game moves; nothing is stored, so it is not declared as collection.

## 4. Closed testing

1. Testing → **Closed testing** → Create track (or use "Alpha") → **Testers**: add an email list (or a Google Group) with your testers' Google accounts.
2. **Create new release.** On first upload, accept **Play App Signing** (Google keeps the app signing key; you keep the *upload* key).
3. Upload `jade-rush-1.0.0-<code>-release.aab` (the signed bundle, not the unsigned one).
4. Release name: `1.0.0 (<code>)`. Release notes:

```
<en-US>
First closed test of Jade Rush: endless Mahjong levels, combos, six wooden tile sets, a daily board and online duels. Please report anything that feels too hard, too easy or broken.
</en-US>
```

5. Review → **Start rollout to Closed testing**. Share the opt-in link from the Testers tab.
6. Personal developer accounts created after November 2023 must run a closed test with **at least 12 testers opted in for 14 days in a row** before they can apply for production access.
7. Check **Pre-launch report** (Release → Testing → Pre-launch report) after each upload for crashes and accessibility warnings.

## 5. AdMob

* App ID `ca-app-pub-4940350948200557~7159308786` is in `android/app/src/main/AndroidManifest.xml`.
* Ad unit `ca-app-pub-4940350948200557/7070755437` is used as an **interstitial** in `js/ads.js`. In AdMob → Apps → Ad units, check that this unit's format is *Interstitial*. If it is a banner or rewarded unit, tell me and the placement will be switched.
* Ads appear only between boards (never during play): at most one per two finished boards, two minutes apart, starting at level 3. Debug APKs always use Google's test ads, so you can tap them safely.
* Do not tap real ads on your own release build. To test the release build, add your phone as a test device in AdMob → Settings → Test devices.
* After the app is on Play, link it in AdMob (Apps → App settings → Link to app store) and publish an `app-ads.txt` on your developer website containing:

```
google.com, pub-4940350948200557, DIRECT, f08c47fec0942fa0
```

* The consent form for the EEA/UK comes from AdMob → Privacy & messaging → GDPR. Create and publish a GDPR message there; the app already requests consent on launch and offers "Ad privacy choices" in Settings.

## 6. Future releases

Every push to the branch builds a new version code. To have GitHub sign bundles automatically, add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `JADE_KEYSTORE_BASE64` | `base64 -w0 jade-rush-upload.jks` |
| `JADE_KEYSTORE_PASSWORD` | the store password |
| `JADE_KEY_ALIAS` | `jade-rush-upload` |
| `JADE_KEY_PASSWORD` | the key password |

Without them, the workflow produces an unsigned bundle that you sign with:

```
jarsigner -keystore jade-rush-upload.jks -sigalg SHA256withRSA -digestalg SHA-256 \
  jade-rush-1.0.0-<code>-release-unsigned.aab jade-rush-upload
```
