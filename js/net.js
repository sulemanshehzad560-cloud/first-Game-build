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

    send: function (m) { if (this.conn && this.conn.open) this.conn.send(m); },

    close: function () {
      var c = this.conn, p = this.peer;
      this.conn = null; this.peer = null;
      try { if (c) c.close(); } catch (e) { /* already closed */ }
      try { if (p) p.destroy(); } catch (e) { /* already destroyed */ }
    }
  };

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
