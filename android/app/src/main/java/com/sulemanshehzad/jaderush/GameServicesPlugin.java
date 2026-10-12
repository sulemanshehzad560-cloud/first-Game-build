package com.sulemanshehzad.jaderush;

import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.LeaderboardsClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.Player;
import com.google.android.gms.games.leaderboard.Leaderboard;
import com.google.android.gms.games.leaderboard.LeaderboardBuffer;
import com.google.android.gms.games.leaderboard.LeaderboardScore;
import com.google.android.gms.games.leaderboard.LeaderboardScoreBuffer;
import com.google.android.gms.games.leaderboard.LeaderboardVariant;
import com.google.android.gms.tasks.Task;

/**
 * Google Play Games Services v2: sign-in (automatic on launch for returning players) and leaderboards.
 * Only active when the build carries a Play Games project ID (PGS_APP_ID); otherwise every call reports
 * "not available" and the game keeps scores on the phone.
 */
@CapacitorPlugin(name = "GameServices")
public class GameServicesPlugin extends Plugin {
    private static final int RC_LEADERBOARD = 9004;
    private boolean ready = false;

    @Override
    public void load() {
        if (!BuildConfig.PLAY_GAMES_ENABLED) return;
        try {
            PlayGamesSdk.initialize(getContext());
            ready = true;
        } catch (Exception e) {
            ready = false;
        }
    }

    private JSObject status(boolean signedIn, Player player) {
        JSObject r = new JSObject();
        r.put("available", ready);
        r.put("platform", "playgames");
        r.put("signedIn", signedIn);
        r.put("name", player != null ? player.getDisplayName() : "");
        r.put("id", player != null ? player.getPlayerId() : "");
        return r;
    }

    private void finishSignIn(PluginCall call, boolean ok) {
        if (!ok) {
            call.resolve(status(false, null));
            return;
        }
        PlayGames.getPlayersClient(getActivity()).getCurrentPlayer()
            .addOnCompleteListener(t -> call.resolve(status(true, t.isSuccessful() ? t.getResult() : null)));
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        if (!ready) {
            call.resolve(status(false, null));
            return;
        }
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        GamesSignInClient client = PlayGames.getGamesSignInClient(getActivity());
        client.isAuthenticated().addOnCompleteListener(t -> {
            boolean ok = t.isSuccessful() && t.getResult() != null && t.getResult().isAuthenticated();
            if (ok || !interactive) {
                finishSignIn(call, ok);
                return;
            }
            client.signIn().addOnCompleteListener(t2 ->
                finishSignIn(call, t2.isSuccessful() && t2.getResult() != null && t2.getResult().isAuthenticated()));
        });
    }

    @PluginMethod
    public void leaderboards(PluginCall call) {
        JSObject r = new JSObject();
        JSArray out = new JSArray();
        if (!ready) {
            r.put("leaderboards", out);
            call.resolve(r);
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity()).loadLeaderboardMetadata(false).addOnCompleteListener(t -> {
            if (t.isSuccessful() && t.getResult() != null) {
                LeaderboardBuffer buf = t.getResult().get();
                if (buf != null) {
                    for (Leaderboard lb : buf) {
                        JSObject o = new JSObject();
                        o.put("id", lb.getLeaderboardId());
                        o.put("name", lb.getDisplayName());
                        out.put(o);
                    }
                    buf.release();
                }
            }
            r.put("leaderboards", out);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void submitScore(PluginCall call) {
        String id = call.getString("leaderboard");
        Double score = call.getDouble("score");
        if (!ready || id == null || score == null) {
            JSObject r = new JSObject();
            r.put("ok", false);
            call.resolve(r);
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity()).submitScoreImmediate(id, score.longValue()).addOnCompleteListener(t -> {
            JSObject r = new JSObject();
            r.put("ok", t.isSuccessful());
            call.resolve(r);
        });
    }

    @PluginMethod
    public void showLeaderboard(PluginCall call) {
        if (!ready) {
            call.reject("Play Games is not available");
            return;
        }
        LeaderboardsClient lc = PlayGames.getLeaderboardsClient(getActivity());
        String id = call.getString("leaderboard");
        Task<Intent> task = id != null ? lc.getLeaderboardIntent(id) : lc.getAllLeaderboardsIntent();
        task.addOnCompleteListener(t -> {
            if (t.isSuccessful() && t.getResult() != null) {
                getActivity().startActivityForResult(t.getResult(), RC_LEADERBOARD);
                call.resolve();
            } else {
                call.reject("Could not open the leaderboard");
            }
        });
    }

    /** The players ranked around this one (Play Games returns at most 25 per page). */
    @PluginMethod
    public void loadScores(PluginCall call) {
        String id = call.getString("leaderboard");
        String span = call.getString("span", "all");
        int timeSpan = "day".equals(span) ? LeaderboardVariant.TIME_SPAN_DAILY
            : "week".equals(span) ? LeaderboardVariant.TIME_SPAN_WEEKLY : LeaderboardVariant.TIME_SPAN_ALL_TIME;
        if (!ready || id == null) {
            JSObject r = new JSObject();
            r.put("ok", false);
            r.put("entries", new JSArray());
            call.resolve(r);
            return;
        }
        LeaderboardsClient lc = PlayGames.getLeaderboardsClient(getActivity());
        lc.loadPlayerCenteredScores(id, timeSpan, LeaderboardVariant.COLLECTION_PUBLIC, 25).addOnCompleteListener(t -> {
            if (!t.isSuccessful() || t.getResult() == null || t.getResult().get() == null) {
                JSObject r = new JSObject();
                r.put("ok", false);
                r.put("entries", new JSArray());
                call.resolve(r);
                return;
            }
            LeaderboardsClient.LeaderboardScores scores = t.getResult().get();
            resolveScores(call, scores.getScores());
            scores.release();
        });
    }

    private void resolveScores(PluginCall call, LeaderboardScoreBuffer buf) {
        JSArray out = new JSArray();
        for (LeaderboardScore e : buf) {
            JSObject o = new JSObject();
            o.put("rank", e.getRank());
            o.put("score", e.getRawScore());
            o.put("name", e.getScoreHolderDisplayName());
            o.put("id", e.getScoreHolder() != null ? e.getScoreHolder().getPlayerId() : "");
            out.put(o);
        }
        JSObject r = new JSObject();
        r.put("ok", true);
        r.put("entries", out);
        call.resolve(r);
    }
}
