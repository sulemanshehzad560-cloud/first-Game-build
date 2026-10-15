/*
 * AdMob for the Android and iPhone apps (no-op on the web). Debug builds always use Google's test ads.
 *
 * Between levels (from level 2, after every finished board, at least 40 s apart):
 *   1. a rewarded interstitial, announced first by the game's own intro card with a countdown and a
 *      "No thanks" button, as AdMob requires for this format; watching it earns a bonus hint;
 *   2. otherwise (declined, or none loaded) a plain interstitial.
 * Rewarded videos are opened by the player (more hints/shuffles, revive, designs, coins).
 * Every format is fetched ahead of time and retried with back-off after a failed load, so one is
 * usually ready. Ads are loaded while the player sits on a result screen, never while a board is starting.
 * Consent (GDPR/UMP) is requested on launch and can be changed later from Settings.
 */
(function (global) {
  'use strict';
  var CONFIG = {
    // Android: app ID lives in AndroidManifest.xml (ca-app-pub-4940350948200557~7159308786).
    android: {
      interstitialId: 'ca-app-pub-4940350948200557/7070755437', testInterstitialId: 'ca-app-pub-3940256099942544/1033173712',
      rewardedId: 'ca-app-pub-4940350948200557/8399647962', testRewardedId: 'ca-app-pub-3940256099942544/5224354917',
      rewardedInterstitialId: 'ca-app-pub-4940350948200557/3955331454', testRewardedInterstitialId: 'ca-app-pub-3940256099942544/5354046379'
    },
    // iOS: app ID comes from Info.plist (ca-app-pub-4940350948200557~7108831181).
    ios: {
      interstitialId: 'ca-app-pub-4940350948200557/9897482338', testInterstitialId: 'ca-app-pub-3940256099942544/4411468910',
      rewardedId: 'ca-app-pub-4940350948200557/4373692913', testRewardedId: 'ca-app-pub-3940256099942544/1712485313',
      rewardedInterstitialId: 'ca-app-pub-4940350948200557/6605545523', testRewardedInterstitialId: 'ca-app-pub-3940256099942544/6978759866'
    },
    boardsBetweenAds: 1,
    minGapMs: 40000,
    firstLevelWithAds: 2
  };
  var Shell = global.NativeShell, AdMob = null, ready = false, testing = true, ios = false, demo = false;
  var boardsSinceAd = 0, lastAdAt = 0, privacyRequired = false;

  /** One ad format: load ahead, retry with back-off (10 s, 20 s, 40 s ... up to 3 min), reload after showing. */
  function Slot(name, prepare) {
    this.name = name; this.prepare = prepare; this.unit = '';
    this.loaded = false; this.loading = false; this.fails = 0; this.timer = 0;
  }
  Slot.prototype.load = function () {
    var self = this;
    if (!ready || !this.unit || this.loaded || this.loading) return;
    this.loading = true; clearTimeout(this.timer);
    this.prepare({ adId: this.unit, isTesting: testing, immersiveMode: true }).then(function () {
      self.loaded = true; self.loading = false; self.fails = 0;
    }, function () {
      self.loading = false; self.fails++;
      self.timer = setTimeout(function () { self.load(); }, Math.min(180000, 10000 * Math.pow(2, self.fails - 1)));
    });
  };
  Slot.prototype.used = function (delay) { var self = this; this.loaded = false; setTimeout(function () { self.load(); }, delay || 1500); };
  /** Wait up to ms for a load in flight (or a fresh one) to finish. */
  Slot.prototype.waitReady = function (ms) {
    var self = this;
    if (this.loaded) return Promise.resolve(true);
    this.fails = 0; this.load();
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() {
        if (self.loaded) return resolve(true);
        if (Date.now() - t0 > ms) return resolve(false);
        setTimeout(poll, 250);
      })();
    });
  };

  var inter = new Slot('interstitial', function (o) { return AdMob.prepareInterstitial(o); });
  var rewarded = new Slot('rewarded', function (o) { return AdMob.prepareRewardVideoAd(o); });
  var rewInter = new Slot('rewarded-interstitial', function (o) { return AdMob.prepareRewardInterstitialAd(o); });

  // What happens when the ad on screen closes: set by whoever opened it.
  var onClose = null, earned = false;
  function closed() { var fn = onClose; onClose = null; if (fn) fn(earned); }

  function init() {
    if (!Shell || !Shell.isNative) return;
    try { AdMob = global.Capacitor.registerPlugin('AdMob'); } catch (e) { return; }
    Shell.buildInfo().then(function (bi) {
      testing = bi.debug; ios = bi.platform === 'ios'; demo = !!bi.demo;
      var cfg = ios ? CONFIG.ios : CONFIG.android;
      inter.unit = testing ? cfg.testInterstitialId : cfg.interstitialId;
      rewarded.unit = testing ? cfg.testRewardedId : cfg.rewardedId;
      rewInter.unit = testing ? cfg.testRewardedInterstitialId : cfg.rewardedInterstitialId;
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
      AdMob.addListener('interstitialAdDismissed', function () { inter.used(); closed(); });
      AdMob.addListener('interstitialAdFailedToShow', function () { inter.used(); closed(); });
      AdMob.addListener('onRewardedVideoAdReward', function () { earned = true; });
      AdMob.addListener('onRewardedVideoAdDismissed', function () { rewarded.used(); closed(); });
      AdMob.addListener('onRewardedVideoAdFailedToShow', function () { rewarded.used(); closed(); });
      AdMob.addListener('onRewardedInterstitialAdReward', function () { earned = true; });
      AdMob.addListener('onRewardedInterstitialAdDismissed', function () { rewInter.used(); closed(); });
      AdMob.addListener('onRewardedInterstitialAdFailedToShow', function () { rewInter.used(); closed(); });
      // Stagger the first loads so they do not compete with the first board on slow phones.
      setTimeout(function () { rewInter.load(); }, 3000);
      setTimeout(function () { inter.load(); }, 6000);
      setTimeout(function () { rewarded.load(); }, 9000);
      // Coming back to the app is a good moment to retry anything that failed while offline.
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') [inter, rewarded, rewInter].forEach(function (s) { if (!s.loaded) { s.fails = 0; s.load(); } });
      });
    }).catch(function () { /* ads are optional; the game never depends on them */ });
  }

  /** Show something full-screen; resolve when it closes (true if a reward was earned). */
  function present(slot, show) {
    return new Promise(function (resolve) {
      earned = false; lastAdAt = Date.now(); boardsSinceAd = 0;
      var done = function (ok) { clearTimeout(guard); resolve(ok); };
      onClose = done;
      show().catch(function () { slot.used(); if (onClose === done) closed(); });
      var guard = setTimeout(function () { if (onClose === done) closed(); }, 120000);   // safety net if no event arrives
    });
  }

  global.GameAds = {
    /** Count a finished board (win or loss). */
    boardFinished: function () { boardsSinceAd++; [inter, rewInter].forEach(function (s) { if (!s.loaded) s.load(); }); },
    /**
     * Run next() after the between-levels ad, if one is due.
     * opts.intro(cb): show the reward intro card; cb(true) to watch, cb(false) to decline.
     * opts.onReward(): called when the rewarded interstitial was watched to the end.
     */
    between: function (level, next, opts) {
      opts = opts || {};
      var due = ready && boardsSinceAd >= CONFIG.boardsBetweenAds && Date.now() - lastAdAt > CONFIG.minGapMs && (level || 99) >= CONFIG.firstLevelWithAds;
      if (!due) { next(); return; }
      var plain = function () {
        if (!inter.loaded) { next(); return; }
        present(inter, function () { return AdMob.showInterstitial(); }).then(function () { next(); });
      };
      if (rewInter.loaded && opts.intro) {
        opts.intro(function (watch) {
          if (!watch) { plain(); return; }
          present(rewInter, function () { return AdMob.showRewardInterstitialAd(); }).then(function (ok) {
            if (ok && opts.onReward) opts.onReward();
            next();
          });
        });
        return;
      }
      plain();
    },
    /** True when a rewarded video can be shown right now. */
    rewardedReady: function () { return ready && rewarded.loaded; },
    /** True when ads work at all on this device (native app, initialized). */
    available: function () { return ready; },
    /** Show a rewarded video, waiting up to 8 s for one to load; resolves true only if the reward was earned. */
    showRewarded: function () {
      if (!ready) return Promise.resolve(false);
      return rewarded.waitReady(8000).then(function (ok) {
        if (!ok) return false;
        return present(rewarded, function () { return AdMob.showRewardVideoAd(); });
      });
    },
    hasPrivacyOptions: function () { return ready && privacyRequired; },
    showPrivacyOptions: function () { return AdMob ? AdMob.showPrivacyOptionsForm() : Promise.resolve(); },
    config: CONFIG
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(this);
