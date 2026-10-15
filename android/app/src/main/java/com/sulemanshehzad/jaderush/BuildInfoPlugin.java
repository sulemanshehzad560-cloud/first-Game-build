package com.sulemanshehzad.jaderush;

import android.app.ActivityManager;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the web layer the build type (debug builds only request test ads), whether Facebook Login is
 * configured, and how much memory the phone has (low-memory phones get the lighter graphics).
 */
@CapacitorPlugin(name = "BuildInfo")
public class BuildInfoPlugin extends Plugin {

    @PluginMethod
    public void isDebug(PluginCall call) {
        JSObject result = new JSObject();
        result.put("debug", BuildConfig.DEBUG);
        result.put("facebook", BuildConfig.FACEBOOK_ENABLED);
        try {
            ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            result.put("ramMb", (int) (mi.totalMem / (1024 * 1024)));
            result.put("lowRam", am.isLowRamDevice());
        } catch (Exception e) {
            // memory info is optional
        }
        call.resolve(result);
    }
}
