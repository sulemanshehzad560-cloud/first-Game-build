# Sign-in and leaderboards (Google Play Games and Game Center)

Jade Rush 1.1 signs players in on launch and has two leaderboards:

| Leaderboard | Score | Used for |
|---|---|---|
| **Journey** | highest level cleared | the Leaderboards screen (trophy button on the home screen) |
| **Rush Hour** | best Rush Hour run score | today's Rush Hour ranking (players around your rank) |

The game finds leaderboards **by name**, so their names must contain "Journey" and "Rush".
Until the setup below is done the game still works: scores stay on the phone and the
Leaderboards screen says the service is not set up.

## Android: Google Play Games Services (about 15 minutes)

1. In Play Console, open **Jade Rush → Grow users → Play Games Services → Setup and management → Configuration**.
2. Pick **"No, my game doesn't use Google APIs"**, then **Create**.
3. Under **Credentials → Add credential → Android**, create the OAuth client the page links to in Google Cloud.
   Package name `com.jaderush.app`. For the SHA-1, use the **App signing key certificate** SHA-1 from
   **Test and release → App integrity → Play app signing**. Add a second Android credential with the
   **Upload key certificate** SHA-1 so builds you install yourself can sign in too.
4. **Leaderboards → Create leaderboard**, twice:
   - Name `Journey`, format Numeric, ordering *Larger is better*.
   - Name `Rush Hour`, format Numeric, ordering *Larger is better*.
5. **Testers**: add your Google account (until you publish, only testers can sign in).
6. **Review and publish** the Play Games Services configuration.
7. Copy the **Project ID**, the long number at the top of the Configuration page.
   In GitHub open **Settings → Secrets and variables → Actions → Variables** and add a variable named
   `PGS_APP_ID` set to that number (or send it to Claude). The next build turns Play Games on.
   It is not a secret.

## iPhone: Game Center (about 5 minutes)

1. In App Store Connect, open **Jade Rush → Services (or Features) → Game Center** and add two
   **Classic leaderboards**, both type *Integer*, sort *High to low*, score range 0 to 100000000:
   - Reference name `Journey`, Leaderboard ID **`jaderush.journey`**.
   - Reference name `Rush Hour`, Leaderboard ID **`jaderush.rush`**.
   Each needs one localization (English): display name and a score format such as "Integer".
2. On the version page for 1.1, in the **Game Center** section, turn Game Center on and add both leaderboards.
3. Nothing to rebuild: the app already includes the Game Center entitlement.

## How Rush Hour works

- Opens once a player has cleared level 30.
- Every day the same 7 boards go to everyone, each harder than the last. Clear them in a row; one fail ends
  the run. A player gets one rewarded-video revive per run.
- Score = board scores, plus a speed bonus for fast clears. The best run of the day goes on the Rush Hour
  leaderboard, and the Rush Hour screen lists the players ranked around you (about 50 on iPhone, 25 on Android,
  which is Google's page size).
- Finishing all 7 boards pays 150 coins on top of the coins for each board.
- The day turns over at 08:00 UTC (midnight Pacific), in step with Google Play's daily leaderboards.
