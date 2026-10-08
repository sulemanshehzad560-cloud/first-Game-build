# Jade Rush on the Apple App Store: TestFlight and review checklist

The iOS app is built from the same game as Android (Capacitor 8, iOS 15+). GitHub Actions builds it on a Mac, tests it on the iPhone simulator, and, once you add the secrets below, signs it and uploads it to App Store Connect (TestFlight) on every push.

## 1. App identity

| Field | Value |
| --- | --- |
| Name | Jade Rush |
| Bundle ID (permanent) | `com.jaderush.app` (same as the Android package) |
| SKU | `JADERUSH001` |
| Apple ID (App Store Connect) | `6820185655` |
| Version | 1.0.0 (build number = 200 + GitHub build number) |
| Primary language | English (U.S.) |
| Category | Games → Board (secondary: Games → Puzzle) |
| Price | Free |
| Devices | iPhone (runs on iPad in iPhone mode), iOS 15 or later: about 99% of active iPhones |
| Contains ads | Yes (Google AdMob interstitials between boards) |

## 2. What you create at Apple (once)

1. **Bundle ID**: <https://developer.apple.com/account/resources/identifiers/list> → **+** → App IDs → App → Description `Jade Rush`, Explicit Bundle ID `com.jaderush.app`. No extra capabilities are needed.
2. **App record**: <https://appstoreconnect.apple.com/apps> → **+** → New App → iOS, name **Jade Rush**, the bundle ID above, SKU `JADERUSH001`, Full Access.
3. **App Store Connect API key** (lets GitHub sign and upload): App Store Connect → **Users and Access → Integrations → App Store Connect API → Team Keys → +**. Name `GitHub builds`, access **Admin** (needed so Xcode can create the distribution certificate and profile for you). Download the `.p8` file (you can only download it once) and note the **Key ID** and **Issuer ID**.
4. **Team ID**: <https://developer.apple.com/account> → Membership details → Team ID (10 characters).

## 3. Give GitHub the keys

GitHub repository → **Settings → Secrets and variables → Actions**.

**Secrets** (private):

| Name | Value |
| --- | --- |
| `ASC_KEY_ID` | the API key's Key ID |
| `ASC_ISSUER_ID` | the Issuer ID |
| `ASC_KEY_P8` | the full text of the `.p8` file, including the BEGIN/END lines |

**Variables**:

| Name | Value |
| --- | --- |
| `APPLE_TEAM_ID` | your Team ID |
| `ADMOB_IOS_APP_ID` | optional override; built in: `ca-app-pub-4940350948200557~7108831181` |
| `ADMOB_IOS_INTERSTITIAL_ID` | optional override; built in: `ca-app-pub-4940350948200557/3701078370` |

Then push any change (or Actions → App builds → Run workflow). The **iOS build and simulator test** job archives a Release build, signs it, uploads it to App Store Connect, and puts the `.ipa` on the `ci-builds` branch. Processing in App Store Connect takes 10–30 minutes, after which the build appears under **TestFlight**.

The iOS AdMob app ID and interstitial unit are already built into the project, so the variables are only needed to change them. Debug builds always use Google's test ads.

## 4. AdMob for iOS

1. Done: iOS app `ca-app-pub-4940350948200557~7108831181` with interstitial unit `ca-app-pub-4940350948200557/3701078370` (in `Info.plist` via build settings and in `js/ads.js`).
2. After the app is live, link it to the App Store listing in AdMob (App settings → Add store info).
3. **Privacy & messaging**: publish the **GDPR** message (also covers Android) and create an **IDFA explainer** message for iOS. The app shows Google's consent form first, then Apple's tracking permission prompt.
4. `app-ads.txt` on your developer website (same line as Android): `google.com, pub-4940350948200557, DIRECT, f08c47fec0942fa0`

The app already includes Google's `GADApplicationIdentifier`, the SKAdNetwork list and the tracking permission text ("Allowing tracking lets us show ads that are more relevant to you. Jade Rush stays free either way.").

## 5. App Store listing

**Subtitle** (30 characters): `Wooden Mahjong. Beat the clock`

**Promotional text** (170): `5,000 Mahjong levels, combo slams and online duels with friends. A new board every day.`

**Description**: use the full description from `docs/PLAY_STORE_GUIDE.md`, removing the line about Facebook (Facebook sign-in is Android-only for now).

**Keywords** (100 characters, comma-separated, no spaces):

```
mahjong,solitaire,tiles,matching,board,puzzle,brain,classic,shanghai,duel,daily,relax,offline
```

**Screenshots**: `store/app-store-screenshots/` contains six 1290 × 2796 PNGs. Upload them to the **6.9" iPhone** slot (App Store Connect scales them for smaller iPhones). No iPad screenshots are needed because the app is iPhone-only.

**App icon**: comes from the build (1024 × 1024, no transparency).

**Support URL**: `https://github.com/sulemanshehzad560-cloud/first-Game-build` (or your own site). **Marketing URL**: optional. **Privacy policy URL**: `https://sulemanshehzad560-cloud.github.io/first-Game-build/privacy.html` (turn on GitHub Pages and add your contact email first).

**Copyright**: `2026 Suleman Shehzad` (use the name or company on your developer account).

## 6. App Privacy ("nutrition label")

Data used to track you: **Yes** (AdMob, only when the user allows tracking).

| Data type | Linked to user | Used for tracking | Purposes |
| --- | --- | --- | --- |
| Identifiers → Device ID (IDFA) | No | Yes | Third-party advertising |
| Usage data → Advertising data | No | Yes | Third-party advertising, Analytics |
| Usage data → Product interaction | No | No | Analytics |
| Diagnostics → Crash data, Performance data | No | No | Analytics |
| Location → Coarse location (from IP) | No | Yes | Third-party advertising |

Progress, settings and scores stay on the device and are not collected. Online duels connect players directly and only exchange moves.

## 7. Age rating

Answer **None** to every content question (no violence, gambling, horror, mature themes, user-generated content or unrestricted web access). Mahjong solitaire is a matching game, not simulated gambling. Result: **4+**. Online duels exchange five fixed emotes only, so no chat moderation is needed.

## 8. Export compliance

The app only uses standard HTTPS/TLS. `ITSAppUsesNonExemptEncryption` is already set to `NO`, so App Store Connect won't ask on each build.

## 9. TestFlight

* **Internal testing**: up to 100 people on your App Store Connect team, available as soon as the build finishes processing.
* **External testing**: up to 10,000 testers by email or public link. The first build needs a quick Beta App Review (usually under a day). Fill in Test Information: feedback email, and "What to test": `Play a few levels, try a duel against the computer and an online room code duel. Report anything confusing or broken.`

## 10. App Review notes

Paste into **App Review Information → Notes**:

```
Jade Rush is a single-player Mahjong solitaire game with optional duels.
No account or login is required. All features are available immediately.
Online duels: tap Online, create a room on one device and join it with the 5-letter code on another.
Ads: Google AdMob interstitials appear only between boards, at most every two boards and two minutes, starting at level 3.
The app asks for consent (Google UMP) and then shows Apple's App Tracking Transparency prompt.
```

Sign-in required: **No**.

## Notes on review rules

* **Facebook sign-in is not in the iOS build.** App Review guideline 4.8 expects Sign in with Apple wherever a third-party login is offered. It can be added later together with Sign in with Apple.
* **Guideline 4.2 (minimum functionality)**: the app is a full native-feeling game with offline play, haptics and 5,000 levels, which is fine.
* Ads never appear during play or before level 3, which keeps it within guideline 3.1/5.6 expectations for ad placement.
