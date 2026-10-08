# Facebook Login setup for Jade Rush

Facebook sign-in is built into the app and switches itself on once the app has a Facebook App ID and Client Token. Until then the Friends screen stays hidden and room codes work as before.

## What players get

* **Continue with Facebook** in Online → Play with Facebook friends.
* A list of Facebook friends who also play Jade Rush, with a live **Online** badge when their app is open.
* **Invite** sends a Race or Take-turns duel straight to that friend's screen; they tap **Play** and the match starts.
* Nothing is posted to Facebook and there is no server: the profile stays on the phone and invites travel peer to peer.

Facebook only lists friends who **also** use Jade Rush **and** granted the friends permission. A brand-new app shows no friends until other players sign in.

## 1. Create the Meta app (10 minutes)

1. Go to <https://developers.facebook.com/apps> → **Create app**.
2. Use case: **Authenticate and request data from users with Facebook Login**. App name: **Jade Rush**.
3. **App settings → Basic**:
   * Privacy Policy URL: `https://sulemanshehzad560-cloud.github.io/first-Game-build/privacy.html`
   * User data deletion → Data deletion instructions URL: `https://sulemanshehzad560-cloud.github.io/first-Game-build/data-deletion.html`
   * Category: **Games**. App icon: `store/icon-512.png`.
   * Copy the **App ID**.
4. **App settings → Advanced → Security**: copy the **Client token**.
5. **Use cases → Authenticate… → Customize → Permissions**: add **public_profile** and **user_friends**.
6. **App settings → Basic → Add platform → Android**:
   * Package name: `com.jaderush.app`
   * Default activity class: `com.sulemanshehzad.jaderush.MainActivity`
   * Key hashes: add all three:

| Key | Hash |
| --- | --- |
| Debug APKs built by GitHub Actions | `xLZJXYRITsb5Z05PkCdWmY1/gjQ=` |
| Your upload key (sideloaded release builds) | `QBcnjXHpPdzyWLgv+m6cwKlgFuU=` |
| Google Play app signing key | copy the SHA-1 from Play Console → Setup → App signing, then convert it (below) |

   Convert a SHA-1 like `AB:CD:…` to a Facebook key hash with:

   ```
   echo AB:CD:...:EF | xxd -r -p | openssl base64
   ```

   Turn on **Single Sign On**.

## 2. Give the IDs to the build

In GitHub: repository **Settings → Secrets and variables → Actions → Variables → New repository variable**:

| Name | Value |
| --- | --- |
| `FB_APP_ID` | your App ID |
| `FB_CLIENT_TOKEN` | your Client token |

These are variables, not secrets: both values end up inside the app anyway. The next push (or **Actions → Android build → Run workflow**) builds an app with Facebook sign-in switched on.

## 3. Testing before App Review

While the Meta app is in **Development** mode, only people with a role on it can sign in. Add your closed testers under **App roles → Roles → Testers** (they accept the invite on facebook.com). Everything works for them, including the friends list among testers.

## 4. Going public

1. Switch the Meta app to **Live** (needs the privacy policy and data deletion URLs above).
2. **App Review → Permissions and features**: request **Advanced access** for `user_friends`. Meta asks for a short screen recording: sign in, show the friends list, send an invite. Explain: "Shows which Facebook friends also play Jade Rush so players can invite each other to a duel."
3. Meta may ask for **Business verification** for advanced access.

`public_profile` needs no review. Without `user_friends` approval the app still signs in, but the friends list is empty for people without a role on the Meta app.

## Limits worth knowing

* Friends must have Jade Rush open to appear online and receive invites (there are no push notifications without a server).
* Signing in on two phones with the same account: only the first one receives invites.
* Invites use the public PeerJS signalling service, which sees the app-scoped Facebook ID inside the connection address.
