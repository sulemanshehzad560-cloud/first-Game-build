/*
 * Facebook sign-in and friends (Android app only).
 * Uses public_profile + user_friends. Facebook only returns friends who also use Jade Rush
 * and granted user_friends. Nothing is sent to our own servers (there are none): the profile
 * stays on the device, and presence/invites run peer to peer through js/net.js.
 */
(function (global) {
  'use strict';
  var Shell = global.NativeShell, Cap = global.Capacitor;
  var GRAPH = 'https://graph.facebook.com/v23.0';
  var FB = null, Http = null, enabled = null, token = null, KEY = 'jaderush.fb.v1';

  function plugins() {
    if (FB || !Shell || !Shell.isNative) return;
    try { FB = Cap.registerPlugin('FacebookLogin'); Http = Cap.registerPlugin('CapacitorHttp'); } catch (e) { FB = null; }
  }
  function graph(path, params) {
    var url = GRAPH + path + '?' + Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&') + '&access_token=' + encodeURIComponent(token);
    var req = Http ? Http.get({ url: url, responseType: 'json' }).then(function (r) { return typeof r.data === 'string' ? JSON.parse(r.data) : r.data; })
      : fetch(url).then(function (r) { return r.json(); });
    return req.then(function (d) { if (d && d.error) throw new Error(d.error.message || 'Facebook error'); return d; });
  }
  function picture(p) { return p && p.data && !p.data.is_silhouette ? p.data.url : null; }

  var Social = {
    user: null, friends: [],
    onChange: function () {},

    /** Resolves true when this build has Facebook Login configured. */
    available: function () {
      if (enabled !== null) return Promise.resolve(enabled);
      if (!Shell || !Shell.isNative) { enabled = false; return Promise.resolve(false); }
      return Shell.buildInfo().then(function (info) { enabled = !!info.facebook; plugins(); return enabled; });
    },

    cached: function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },

    /** Restores a previous session on launch. */
    restore: function () {
      var self = this;
      return this.available().then(function (ok) {
        if (!ok) return null;
        return FB.getCurrentAccessToken().then(function (r) {
          if (!r || !r.accessToken || r.accessToken.isExpired) { self.user = null; return null; }
          token = r.accessToken.token;
          self.user = self.cached();
          return self.refresh();
        }).catch(function () { return null; });
      });
    },

    login: function () {
      var self = this;
      return this.available().then(function (ok) {
        if (!ok) throw new Error('Facebook sign-in is not set up in this build.');
        return FB.login({ permissions: ['public_profile', 'user_friends'] });
      }).then(function (r) {
        if (!r || !r.accessToken) throw new Error('cancelled');
        token = r.accessToken.token;
        self.friendsDeclined = (r.recentlyDeniedPermissions || []).indexOf('user_friends') >= 0;
        return self.refresh();
      });
    },

    refresh: function () {
      var self = this;
      return graph('/me', { fields: 'id,name,first_name,picture.width(96).height(96)' }).then(function (me) {
        self.user = { id: me.id, name: me.name, first: me.first_name || me.name, picture: picture(me.picture) };
        try { localStorage.setItem(KEY, JSON.stringify(self.user)); } catch (e) { /* storage unavailable */ }
        return graph('/me/friends', { fields: 'id,name,first_name,picture.width(96).height(96)', limit: 200 });
      }).then(function (res) {
        self.friends = (res.data || []).map(function (f) { return { id: f.id, name: f.name, first: f.first_name || f.name, picture: picture(f.picture), status: 'checking' }; });
        self.friends.sort(function (a, b) { return a.name.localeCompare(b.name); });
        self.onChange();
        return self.user;
      });
    },

    logout: function () {
      this.user = null; this.friends = []; token = null;
      try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
      var p = FB ? FB.logout().catch(function () {}) : Promise.resolve();
      this.onChange();
      return p;
    }
  };

  global.Social = Social;
})(this);
