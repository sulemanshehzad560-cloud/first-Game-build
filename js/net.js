/*
 * Peer-to-peer online play over WebRTC using PeerJS's free public broker.
 * The host gets a 5-letter room code; the guest joins with it. Both sides run
 * the same deterministic engine, so only moves travel over the wire.
 */
(function (global) {
  'use strict';
  var PREFIX = 'jaderush-room-';
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function randomCode() {
    var s = '';
    for (var i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }

  var Net = {
    peer: null, conn: null, isHost: false, code: null,
    onMessage: function () {}, onStatus: function () {},

    available: function () { return typeof global.Peer === 'function'; },

    host: function () {
      this.close();
      this.isHost = true;
      this.code = randomCode();
      var self = this, peer = new global.Peer(PREFIX + this.code, peerOptions());
      this.peer = peer;
      peer.on('open', function () { self.onStatus('hosting', self.code); });
      peer.on('connection', function (c) {
        if (self.conn && self.conn.open) { c.on('open', function () { c.send({ t: 'full' }); setTimeout(function () { c.close(); }, 300); }); return; }
        self.attach(c);
      });
      peer.on('error', function (e) {
        if (e.type === 'unavailable-id') { self.host(); return; }
        self.onStatus('error', describe(e));
      });
      peer.on('disconnected', function () { if (!peer.destroyed) peer.reconnect(); });
    },

    join: function (code) {
      this.close();
      this.isHost = false;
      this.code = code.toUpperCase();
      var self = this, peer = new global.Peer(peerOptions());
      this.peer = peer;
      peer.on('open', function () {
        self.onStatus('connecting', self.code);
        self.attach(peer.connect(PREFIX + self.code, { reliable: true }));
      });
      peer.on('error', function (e) { self.onStatus('error', describe(e)); });
    },

    attach: function (c) {
      var self = this;
      this.conn = c;
      c.on('open', function () { self.onStatus('connected', self.code); });
      c.on('data', function (m) { if (m && typeof m === 'object') self.onMessage(m); });
      c.on('close', function () { if (self.conn === c) { self.conn = null; self.onStatus('closed'); } });
      c.on('error', function () { self.onStatus('error', 'The connection dropped.'); });
    },

    /** Use an already-open connection (a friend invite) as the match connection. */
    adopt: function (c, isHost, label) {
      this.close();
      this.isHost = isHost; this.code = label;
      this.attach(c);
      if (c.open) this.onStatus('connected', label);
    },

    send: function (m) { if (this.conn && this.conn.open) this.conn.send(m); },

    close: function () {
      var c = this.conn, p = this.peer;
      this.conn = null; this.peer = null;
      try { if (c) c.close(); } catch (e) { /* already closed */ }
      try { if (p) p.destroy(); } catch (e) { /* already destroyed */ }
    }
  };

  /*
   * Friend presence. While signed in, the app listens as "jaderush-fb-<facebook id>".
   * A friend is online if a connection to their address opens. Invites travel over that
   * connection and, once accepted, the same connection carries the match.
   */
  var FRIEND_PREFIX = 'jaderush-fb-';
  var Presence = {
    peer: null, id: null, ready: false, pending: {},
    onInvite: function () {}, onStatus: function () {},

    start: function (id) {
      if (!Net.available() || (this.peer && this.id === id)) return;
      this.stop();
      this.id = id;
      var self = this, peer = new global.Peer(FRIEND_PREFIX + id, peerOptions());
      this.peer = peer;
      peer.on('open', function () { self.ready = true; self.onStatus('online'); });
      peer.on('connection', function (c) {
        var handler = function (m) {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'ping') c.send({ t: 'pong' });
          else if (m.t === 'invite') { c.off('data', handler); self.onInvite(c, m); }
        };
        c.on('data', handler);
      });
      peer.on('error', function (e) {
        if (e.type === 'peer-unavailable') {
          var m = /(jaderush-fb-[\w-]+)/.exec(e.message || ''), key = m && m[1];
          if (key && self.pending[key]) { self.pending[key](false); delete self.pending[key]; }
        } else if (e.type === 'unavailable-id') {
          self.onStatus('elsewhere');
        } else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') {
          self.ready = false; self.onStatus('offline');
        }
      });
      peer.on('disconnected', function () { if (!peer.destroyed) peer.reconnect(); });
    },

    stop: function () {
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* already gone */ }
      this.peer = null; this.id = null; this.ready = false; this.pending = {};
    },

    /** Resolves true when the friend's app is open and reachable. */
    probe: function (friendId) {
      var self = this, key = FRIEND_PREFIX + friendId;
      if (!this.peer || !this.ready) return Promise.resolve(false);
      return new Promise(function (resolve) {
        var done = false, finish = function (v) { if (!done) { done = true; delete self.pending[key]; resolve(v); } };
        self.pending[key] = finish;
        var c = self.peer.connect(key, { reliable: true });
        c.on('open', function () { c.send({ t: 'ping' }); finish(true); setTimeout(function () { try { c.close(); } catch (e) { /* closed */ } }, 400); });
        c.on('error', function () { finish(false); });
        setTimeout(function () { finish(false); try { c.close(); } catch (e) { /* closed */ } }, 7000);
      });
    },

    /** Opens a connection to a friend and sends an invite. Resolves with the open connection. */
    invite: function (friendId, payload) {
      var self = this, key = FRIEND_PREFIX + friendId;
      if (!this.peer || !this.ready) return Promise.reject(new Error('offline'));
      return new Promise(function (resolve, reject) {
        var done = false;
        self.pending[key] = function () { if (!done) { done = true; reject(new Error('unavailable')); } };
        var c = self.peer.connect(key, { reliable: true });
        c.on('open', function () { done = true; delete self.pending[key]; c.send(payload); resolve(c); });
        c.on('error', function () { if (!done) { done = true; reject(new Error('failed')); } });
        setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, 9000);
      });
    }
  };
  Net.presence = Presence;

  // Set window.NOVA_PEER_OPTIONS to use a self-hosted PeerServer instead of the public one.
  function peerOptions() { return Object.assign({ debug: 0 }, global.NOVA_PEER_OPTIONS || {}); }

  function describe(e) {
    switch (e && e.type) {
      case 'peer-unavailable': return 'No room with that code. Check the code and try again.';
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
        return 'Could not reach the matchmaking server. Check your connection.';
      case 'browser-incompatible': return 'This browser does not support online play.';
      default: return 'Online play hit an error (' + ((e && e.type) || 'unknown') + ').';
    }
  }

  global.NovaNet = Net;
})(this);
