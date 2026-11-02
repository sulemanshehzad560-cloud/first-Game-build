package com.sulemanshehzad.jaderush;

import android.app.Activity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.unity3d.mediation.LevelPlay;
import com.unity3d.mediation.LevelPlayAdError;
import com.unity3d.mediation.LevelPlayAdInfo;
import com.unity3d.mediation.LevelPlayConfiguration;
import com.unity3d.mediation.LevelPlayInitError;
import com.unity3d.mediation.LevelPlayInitListener;
import com.unity3d.mediation.LevelPlayInitRequest;
import com.unity3d.mediation.interstitial.LevelPlayInterstitialAd;
import com.unity3d.mediation.interstitial.LevelPlayInterstitialAdListener;
import com.unity3d.mediation.rewarded.LevelPlayReward;
import com.unity3d.mediation.rewarded.LevelPlayRewardedAd;
import com.unity3d.mediation.rewarded.LevelPlayRewardedAdListener;

/**
 * Unity LevelPlay (ironSource) mediation for Android: one interstitial and one rewarded ad unit.
 * The networks that bid (Unity Ads, Meta Audience Network, ...) are chosen in the LevelPlay dashboard;
 * their adapters are bundled in build.gradle.
 *
 * Calls: init({appKey, interstitialId, rewardedId, consent, debug}), loadInterstitial(), showInterstitial(),
 * loadRewarded(), showRewarded(), setConsent({consent}). load* resolve once an ad is ready (reject on failure);
 * show* resolve as soon as the ad starts. Events: "interstitialClosed", "rewardedClosed", "rewardEarned".
 */
@CapacitorPlugin(name = "LevelPlayAds")
public class LevelPlayPlugin extends Plugin {
    private LevelPlayInterstitialAd interstitial;
    private LevelPlayRewardedAd rewarded;
    private PluginCall interstitialLoad;
    private PluginCall rewardedLoad;
    private boolean initialized = false;

    private void onUi(Runnable r) {
        Activity a = getActivity();
        if (a != null) a.runOnUiThread(r); else r.run();
    }

    @PluginMethod
    public void init(PluginCall call) {
        final String appKey = call.getString("appKey");
        final String interstitialId = call.getString("interstitialId");
        final String rewardedId = call.getString("rewardedId");
        final boolean consent = Boolean.TRUE.equals(call.getBoolean("consent", true));
        final boolean debug = Boolean.TRUE.equals(call.getBoolean("debug", false));
        if (appKey == null || interstitialId == null || rewardedId == null) {
            call.reject("appKey, interstitialId and rewardedId are required");
            return;
        }
        if (initialized) {
            call.resolve();
            return;
        }
        onUi(() -> {
            try {
                LevelPlay.setConsent(consent);
                if (debug) LevelPlay.setAdaptersDebug(true);
                LevelPlayInitRequest request = new LevelPlayInitRequest.Builder(appKey).build();
                LevelPlay.init(getContext(), request, new LevelPlayInitListener() {
                    @Override
                    public void onInitSuccess(LevelPlayConfiguration configuration) {
                        onUi(() -> {
                            interstitial = new LevelPlayInterstitialAd(interstitialId);
                            interstitial.setListener(interstitialListener);
                            rewarded = new LevelPlayRewardedAd(rewardedId);
                            rewarded.setListener(rewardedListener);
                            initialized = true;
                            call.resolve();
                        });
                    }

                    @Override
                    public void onInitFailed(LevelPlayInitError error) {
                        call.reject("LevelPlay init failed: " + error);
                    }
                });
            } catch (Exception e) {
                call.reject("LevelPlay init failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void setConsent(PluginCall call) {
        LevelPlay.setConsent(Boolean.TRUE.equals(call.getBoolean("consent", true)));
        call.resolve();
    }

    // ---------------------------------------------------------------- interstitial
    @PluginMethod
    public void loadInterstitial(PluginCall call) {
        if (interstitial == null) { call.reject("not initialized"); return; }
        onUi(() -> {
            if (interstitial.isAdReady()) { call.resolve(); return; }
            if (interstitialLoad != null) interstitialLoad.reject("superseded");
            interstitialLoad = call;
            interstitial.loadAd();
        });
    }

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        if (interstitial == null) { call.reject("not initialized"); return; }
        onUi(() -> {
            if (!interstitial.isAdReady() || getActivity() == null) { call.reject("not ready"); return; }
            interstitial.showAd(getActivity());
            call.resolve();
        });
    }

    private final LevelPlayInterstitialAdListener interstitialListener = new LevelPlayInterstitialAdListener() {
        @Override
        public void onAdLoaded(LevelPlayAdInfo info) {
            PluginCall c = interstitialLoad; interstitialLoad = null;
            if (c != null) c.resolve();
        }

        @Override
        public void onAdLoadFailed(LevelPlayAdError error) {
            PluginCall c = interstitialLoad; interstitialLoad = null;
            if (c != null) c.reject("load failed: " + error);
        }

        @Override
        public void onAdDisplayed(LevelPlayAdInfo info) { }

        @Override
        public void onAdDisplayFailed(LevelPlayAdError error, LevelPlayAdInfo info) {
            JSObject d = new JSObject(); d.put("failed", true);
            notifyListeners("interstitialClosed", d);
        }

        @Override
        public void onAdClosed(LevelPlayAdInfo info) {
            notifyListeners("interstitialClosed", new JSObject());
        }
    };

    // ---------------------------------------------------------------- rewarded
    @PluginMethod
    public void loadRewarded(PluginCall call) {
        if (rewarded == null) { call.reject("not initialized"); return; }
        onUi(() -> {
            if (rewarded.isAdReady()) { call.resolve(); return; }
            if (rewardedLoad != null) rewardedLoad.reject("superseded");
            rewardedLoad = call;
            rewarded.loadAd();
        });
    }

    @PluginMethod
    public void showRewarded(PluginCall call) {
        if (rewarded == null) { call.reject("not initialized"); return; }
        onUi(() -> {
            if (!rewarded.isAdReady() || getActivity() == null) { call.reject("not ready"); return; }
            rewarded.showAd(getActivity());
            call.resolve();
        });
    }

    private final LevelPlayRewardedAdListener rewardedListener = new LevelPlayRewardedAdListener() {
        @Override
        public void onAdLoaded(LevelPlayAdInfo info) {
            PluginCall c = rewardedLoad; rewardedLoad = null;
            if (c != null) c.resolve();
        }

        @Override
        public void onAdLoadFailed(LevelPlayAdError error) {
            PluginCall c = rewardedLoad; rewardedLoad = null;
            if (c != null) c.reject("load failed: " + error);
        }

        @Override
        public void onAdDisplayed(LevelPlayAdInfo info) { }

        @Override
        public void onAdRewarded(LevelPlayReward reward, LevelPlayAdInfo info) {
            notifyListeners("rewardEarned", new JSObject());
        }

        @Override
        public void onAdDisplayFailed(LevelPlayAdError error, LevelPlayAdInfo info) {
            JSObject d = new JSObject(); d.put("failed", true);
            notifyListeners("rewardedClosed", d);
        }

        @Override
        public void onAdClosed(LevelPlayAdInfo info) {
            notifyListeners("rewardedClosed", new JSObject());
        }
    };
}
