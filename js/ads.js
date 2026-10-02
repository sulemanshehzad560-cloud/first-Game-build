/*
 * AdMob interstitials for the Android app (no-op on the web).
 * Ads only appear between boards, never during play: at most one every 2 finished boards,
 * at least 2 minutes apart, and never before level 3. Debug builds always use Google's test ads.
 * Consent (GDPR/UMP) is requested on launch and can be changed later from Settings.
 */
(function (global) {
  'use strict';
  var CONFIG = {
    // Android: app ID lives in AndroidManifest.xml. iOS: app ID and unit come from Info.plist build settings.
    android: { interstitialId: 'ca-app-pub-4940350948200557/7070755437', testInterstitialId: 'ca-app-pub-3940256099942544/1033173712' },
    ios: { interstitialId: 'ca-app-pub-4940350948200557/3701078370', testInterstitialId: 'ca-app-pub-3940256099942544/4411468910' },
    boardsBetweenAds: 2,
    minGapMs: 120000,
    firstLevelWithAds: 3
  };
  var Shell = global.NativeShell, AdMob = null, ready = false, loaded = false, loading = false, testing = true, unit = '', ios = false;
  var boardsSinceAd = 0, lastAdAt = 0, privacyRequired = false, onDismiss = null;

  function load() {
    if (!ready || loaded || loading) return;
    loading = true;
    AdMob.prepareInterstitial({ adId: unit, isTesting: testing, immersiveMode: true })
      .then(function () { loaded = true; loading = false; }, function () { loading = false; setTimeout(load, 60000); });
  }

  function init() {
    if (!Shell || !Shell.isNative) return;
    try { AdMob = global.Capacitor.registerPlugin('AdMob'); } catch (e) { return; }
    Shell.buildInfo().then(function (bi) {
      testing = bi.debug; ios = bi.platform === 'ios';
      var cfg = bi.platform === 'ios' ? CONFIG.ios : CONFIG.android;
      unit = testing ? cfg.testInterstitialId : (bi.platform === 'ios' ? bi.interstitialId || cfg.interstitialId : cfg.interstitialId);
      if (!unit) throw new Error('no ad unit configured for this build');
      return AdMob.requestConsentInfo().then(function (info) {
        privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
        if (info.status === 'REQUIRED' && info.isConsentFormAvailable) return AdMob.showConsentForm();
        return info;
      }, function () { return null; });
    }).then(function () {
      // iOS: Apple's App Tracking Transparency prompt, after the consent form.
      if (!ios) return null;
      return AdMob.trackingAuthorizationStatus().then(function (r) {
        if (r && r.status === 'notDetermined') return AdMob.requestTrackingAuthorization();
      }, function () { /* Android: not applicable */ });
    }).then(function () {
      return AdMob.initialize({ initializeForTesting: testing });
    }).then(function () {
      ready = true;
      AdMob.addListener('interstitialAdDismissed', function () { finish(); });
      AdMob.addListener('interstitialAdFailedToShow', function () { finish(); });
      load();
    }).catch(function () { /* ads are optional; the game never depends on them */ });
  }

  function finish() {
    loaded = false;
    var fn = onDismiss; onDismiss = null;
    if (fn) fn();
    load();
  }

  global.GameAds = {
    /** Count a finished board (win, loss or duel). */
    boardFinished: function () { boardsSinceAd++; },
    /** Run next(), showing an interstitial first if one is due. */
    between: function (level, next) {
      var due = ready && loaded && boardsSinceAd >= CONFIG.boardsBetweenAds && Date.now() - lastAdAt > CONFIG.minGapMs && (level || 99) >= CONFIG.firstLevelWithAds;
      if (!due) { next(); return; }
      boardsSinceAd = 0; lastAdAt = Date.now(); onDismiss = next;
      AdMob.showInterstitial().catch(function () { finish(); });
      setTimeout(function () { if (onDismiss === next) finish(); }, 90000); // safety net if no event arrives
    },
    hasPrivacyOptions: function () { return ready && privacyRequired; },
    showPrivacyOptions: function () { return AdMob ? AdMob.showPrivacyOptionsForm() : Promise.resolve(); },
    config: CONFIG
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(this);
