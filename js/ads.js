/*
 * AdMob interstitials and rewarded videos for the Android and iPhone apps (no-op on the web).
 * Ads only appear between boards, never during play: at most one every 2 finished boards,
 * at least 2 minutes apart, and never before level 3. Debug builds always use Google's test ads.
 * Consent (GDPR/UMP) is requested on launch and can be changed later from Settings.
 * The ad itself is fetched while the player sits on a result screen, never while a board is starting:
 * an ad loads into its own WebView, and doing that during the board's opening animation makes budget
 * phones stutter. An ad is only shown after two finished boards, so loading after the first is in time.
 */
(function (global) {
  'use strict';
  var CONFIG = {
    // Android: app ID lives in AndroidManifest.xml. iOS: app ID and unit come from Info.plist build settings.
    android: {
      interstitialId: 'ca-app-pub-4940350948200557/7070755437', testInterstitialId: 'ca-app-pub-3940256099942544/1033173712',
      rewardedId: 'ca-app-pub-4940350948200557/8399647962', testRewardedId: 'ca-app-pub-3940256099942544/5224354917'
    },
    ios: {
      interstitialId: 'ca-app-pub-4940350948200557/9897482338', testInterstitialId: 'ca-app-pub-3940256099942544/4411468910',
      rewardedId: 'ca-app-pub-4940350948200557/4373692913', testRewardedId: 'ca-app-pub-3940256099942544/1712485313'
    },
    boardsBetweenAds: 2,
    minGapMs: 120000,
    firstLevelWithAds: 3
  };
  var Shell = global.NativeShell, AdMob = null, ready = false, loaded = false, loading = false, testing = true, unit = '', ios = false;
  var boardsSinceAd = 0, lastAdAt = 0, privacyRequired = false, onDismiss = null;
  // Rewarded video: the player chooses to watch one for a reward (more shuffles, a hint, a design, coins).
  var rwUnit = '', rwLoaded = false, rwLoading = false, rwEarned = false, rwDone = null;

  function loadRewarded() {
    if (!ready || rwLoaded || rwLoading || !rwUnit) return;
    rwLoading = true;
    AdMob.prepareRewardVideoAd({ adId: rwUnit, isTesting: testing, immersiveMode: true })
      .then(function () { rwLoaded = true; rwLoading = false; }, function () { rwLoading = false; setTimeout(loadRewarded, 30000); });
  }
  function rewardedClosed() {
    rwLoaded = false;
    var fn = rwDone; rwDone = null;
    if (fn) fn(rwEarned);
    setTimeout(loadRewarded, 1500);
  }

  function load() {
    if (!ready || loaded || loading) return;
    loading = true;
    AdMob.prepareInterstitial({ adId: unit, isTesting: testing, immersiveMode: true })
      .then(function () { loaded = true; loading = false; }, function () { loading = false; });   // retried after the next board
  }

  var demo = false;
  function init() {
    if (!Shell || !Shell.isNative) return;
    try { AdMob = global.Capacitor.registerPlugin('AdMob'); } catch (e) { return; }
    Shell.buildInfo().then(function (bi) {
      testing = bi.debug; ios = bi.platform === 'ios'; demo = !!bi.demo;
      var cfg = bi.platform === 'ios' ? CONFIG.ios : CONFIG.android;
      unit = testing ? cfg.testInterstitialId : cfg.interstitialId;
      rwUnit = testing ? cfg.testRewardedId : cfg.rewardedId;
      if (!unit) throw new Error('no ad unit configured for this build');
      return AdMob.requestConsentInfo().then(function (info) {
        privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
        if (info.status === 'REQUIRED' && info.isConsentFormAvailable) return AdMob.showConsentForm();
        return info;
      }, function () { return null; });
    }).then(function () {
      // iOS: Apple's App Tracking Transparency prompt, after the consent form.
      if (!ios) return null;
      // The recorded demo (debug builds only) asks at the end of its tour, so the prompt does not cover the video.
      var after = demo ? new Promise(function (r) { global.addEventListener('jade-demo-done', r, { once: true }); }) : Promise.resolve();
      return after.then(function () { return AdMob.trackingAuthorizationStatus(); }).then(function (r) {
        if (r && r.status === 'notDetermined') return AdMob.requestTrackingAuthorization();
      }, function () { /* Android: not applicable */ });
    }).then(function () {
      return AdMob.initialize({ initializeForTesting: testing });
    }).then(function () {
      ready = true;
      AdMob.addListener('interstitialAdDismissed', function () { finish(); });
      AdMob.addListener('interstitialAdFailedToShow', function () { finish(); });
      AdMob.addListener('onRewardedVideoAdReward', function () { rwEarned = true; });
      AdMob.addListener('onRewardedVideoAdDismissed', rewardedClosed);
      AdMob.addListener('onRewardedVideoAdFailedToShow', rewardedClosed);
      if (boardsSinceAd > 0) load();
      setTimeout(loadRewarded, 4000);
    }).catch(function () { /* ads are optional; the game never depends on them */ });
  }

  function finish() {
    loaded = false;
    var fn = onDismiss; onDismiss = null;
    if (fn) fn();   // the next ad loads after the next finished board
  }

  global.GameAds = {
    /** Count a finished board (win, loss or duel). */
    boardFinished: function () { boardsSinceAd++; load(); },
    /** Run next(), showing an interstitial first if one is due. */
    between: function (level, next) {
      var due = ready && loaded && boardsSinceAd >= CONFIG.boardsBetweenAds && Date.now() - lastAdAt > CONFIG.minGapMs && (level || 99) >= CONFIG.firstLevelWithAds;
      if (!due) { next(); return; }
      boardsSinceAd = 0; lastAdAt = Date.now(); onDismiss = next;
      AdMob.showInterstitial().catch(function () { finish(); });
      setTimeout(function () { if (onDismiss === next) finish(); }, 90000); // safety net if no event arrives
    },
    /** True when a rewarded video is loaded and can be shown right now. */
    rewardedReady: function () { return ready && rwLoaded; },
    /** Show a rewarded video; resolves true only if the player watched it to the reward. */
    showRewarded: function () {
      if (!ready || !rwLoaded) { loadRewarded(); return Promise.resolve(false); }
      return new Promise(function (resolve) {
        rwEarned = false; rwDone = resolve; lastAdAt = Date.now();
        AdMob.showRewardVideoAd().then(function () { rwEarned = true; }, function () { rewardedClosed(); });
        setTimeout(function () { if (rwDone === resolve) rewardedClosed(); }, 120000);   // safety net
      });
    },
    hasPrivacyOptions: function () { return ready && privacyRequired; },
    showPrivacyOptions: function () { return AdMob ? AdMob.showPrivacyOptionsForm() : Promise.resolve(); },
    config: CONFIG
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(this);
