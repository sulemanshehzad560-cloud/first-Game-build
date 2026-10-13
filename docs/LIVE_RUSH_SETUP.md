# Live Rush Hour races: Firebase setup (about 10 minutes)

Rush Hour races between real players run on Firebase (Google), free plan. Until this is set up, races use
computer rivals only.

## 1. Add Firebase to the Jade Rush Google project
1. Open **console.firebase.google.com** and tap **Create a project** (or **Add project**).
2. At the name step, tap **"Add Firebase to Google Cloud project"** and pick **Jade Rush (jade-rush)**,
   the project you made for Play Games.
3. Turn **Google Analytics off** (not needed), then **Continue / Add Firebase**.

## 2. Turn on anonymous sign-in
1. Left menu: **Build -> Authentication -> Get started**.
2. **Sign-in method** tab -> **Anonymous** -> switch on **Enable** -> **Save**.
   (Players never see this: it gives each phone a private ID so it can only change its own race row.)

## 3. Create the database
1. Left menu: **Build -> Realtime Database -> Create database**.
2. Location: **United States (us-central1)**, or **Belgium (europe-west1)** if most players are in Europe.
3. Security rules: choose **Start in locked mode** -> **Enable**.
4. Open the **Rules** tab, delete everything there, paste the whole content of
   `firebase/database.rules.json` from this repository, and tap **Publish**.

## 4. Register the game and copy its config
1. Tap the **gear icon -> Project settings**, scroll to **Your apps**, tap the **web icon `</>`**.
2. App nickname: `Jade Rush`. Leave "Firebase Hosting" unticked. Tap **Register app**.
3. It shows a `firebaseConfig` block. Send these five values (they are public, not secrets):
   `apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`.
   They go into `js/live-config.js`; the next build has live races.

## How it works
- When the game starts a Rush Hour, the phone joins the open race for its level bracket
  (levels 30-99, 100-299, 300-999, 1000-2499, 2500+). A race takes joiners for its first 3 minutes or until
  25 players are in; then the next player opens a new race.
- Every win, loss and finish is sent instantly; everyone in the race sees the others move live.
- Empty seats are filled with computer rivals marked **CPU**, the same ones for everyone in that race.
- The rules let each phone change only its own row, only upwards (no un-losing, no more than 7 wins).

## Free plan limits
The free Spark plan allows **100 phones connected at the same time** (plus 1 GB stored, 10 GB/month
downloaded). That is plenty to start. When Rush Hour regularly has more than ~100 players online at once,
switch the project to the **Blaze** plan (pay as you go; Realtime Database costs a few dollars a month at
thousands of players) and the limit goes to 200,000.
