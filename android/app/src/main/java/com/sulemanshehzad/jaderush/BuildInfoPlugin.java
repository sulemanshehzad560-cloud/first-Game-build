package com.sulemanshehzad.jaderush;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Tells the web layer whether this is a debug build, so debug builds only ever request test ads. */
@CapacitorPlugin(name = "BuildInfo")
public class BuildInfoPlugin extends Plugin {

    @PluginMethod
    public void isDebug(PluginCall call) {
        JSObject result = new JSObject();
        result.put("debug", BuildConfig.DEBUG);
        call.resolve(result);
    }
}
