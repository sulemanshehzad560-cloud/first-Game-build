package com.sulemanshehzad.jaderush;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Tells the web layer the build type (debug builds only request test ads) and whether Facebook Login is configured. */
@CapacitorPlugin(name = "BuildInfo")
public class BuildInfoPlugin extends Plugin {

    @PluginMethod
    public void isDebug(PluginCall call) {
        JSObject result = new JSObject();
        result.put("debug", BuildConfig.DEBUG);
        result.put("facebook", BuildConfig.FACEBOOK_ENABLED);
        call.resolve(result);
    }
}
