'use strict';
/* =====================================================================
   Hat Trick Moto — net.js
   Online multiplayer with PeerJS (WebRTC). One player hosts and runs the
   real race; everyone else sends their buttons and draws what the host
   reports, smoothed so it looks good.

   Messages (all JSON):
     client -> host : hello, ready, profile, in (inputs), ping, bye
     host -> client : welcome, full, lobby, start, s (snapshot), results, tolobby, bye
   ===================================================================== */

const PEER_PREFIX = 'hattrickmoto-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PLAYERS = 6;
const SNAP_EVERY = 3;            // physics steps between snapshots (60/3 = 20 per second)
const INTERP_DELAY = 0.1;        // seconds clients stay behind the host for smooth motion
const STATE_CODES = ['ride', 'stall', 'crash'];
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

const Net = {
  role: null, active: false, peer: null, code: '', myId: null,
  conns: new Map(),           // host: player id -> DataConnection
  conn: null,                 // client: connection to the host
  lobby: { players: [], track: 'meadow', laps: 3, phase: 'lobby' },
  inputs: new Map(), lastSeen: new Map(), nextId: 1,
  stepCount: 0, sendT: 0, pingT: 0, hostSeen: 0, resultsSent: false, joining: false,

  init() {
    $('join-btn').onclick = () => this.join($('join-code').value);
    $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join($('join-code').value); });
    $('join-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });
    $('join-wardrobe').onclick = () => App.go('wardrobe-from-join');
    $('lb-copy').onclick = () => this.copyLink();
    $('lb-leave').onclick = () => { this.leave(); App.go('title'); };
    $('lb-hats').onclick = () => App.go('wardrobe-from-lobby');
    $('lb-ready').onclick = () => this.toggleReady();
    $('lb-start').onclick = () => this.startRace();
    $('lb-addbot').onclick = () => this.addBot();
    $('lb-rmbot').onclick = () => this.removeBot();
    $('lb-track').onchange = (e) => { this.lobby.track = e.target.value; Settings.track = e.target.value; saveSettings(); this.broadcastLobby(); };
    // say goodbye when the tab closes so the others notice straight away
    addEventListener('pagehide', () => { if (this.active) this.leave(true); });
    // keep the race running for everyone if the host's tab goes into the background
    setInterval(() => { if (document.hidden && this.role === 'host' && App.scene === 'race') App.update(0.05, performance.now() / 1000); }, 50);
  },
  autoJoin() {
    const m = /[?&]room=([A-Za-z]{4})/.exec(location.search);
    if (m) { App.go('join'); $('join-code').value = m[1].toUpperCase(); $('join-status').textContent = 'Press Join to hop in!'; }
  },
  peerOptions() {
    // ?peer=localhost:9000 lets you use your own PeerJS server (handy for testing)
    const m = /[?&]peer=([^&]+)/.exec(location.search);
    const o = { debug: 1 };
    if (m) { const [host, port] = decodeURIComponent(m[1]).split(':'); Object.assign(o, { host, port: +port || 9000, path: '/', secure: location.protocol === 'https:' && host !== 'localhost' }); }
    return o;
  },
  shareLink() { return location.origin + location.pathname + '?room=' + this.code + (/[?&]peer=/.test(location.search) ? '&' + /peer=[^&]+/.exec(location.search)[0] : ''); },
  me() { return { name: Profile.name, color: Profile.color, hats: Profile.hats.slice(0, 5) }; },
  send(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) {} },
  broadcast(msg) { for (const c of this.conns.values()) this.send(c, msg); },
  setStatus(id, t) { const el = $(id); if (el) el.textContent = t; },

  // =================== HOST ===================
  host(attempt = 0) {
    if (typeof Peer === 'undefined') { toast('Online play needs an internet connection'); return; }
    this.leave(true);
    this.role = 'host'; this.active = true;
    this.code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    this.lobby = { players: [{ id: 'H', ...this.me(), ready: true, host: true }], track: TrackStore.get(Settings.track) ? Settings.track : 'meadow', laps: Settings.laps, phase: 'lobby' };
    this.nextId = 1; this.inputs.clear(); this.lastSeen.clear(); this.conns.clear();
    this.myId = 'H';
    App.go('lobby');
    this.renderLobby();
    this.setStatus('lb-status', 'Opening room…');
    const peer = (this.peer = new Peer(PEER_PREFIX + this.code, this.peerOptions()));
    peer.on('open', () => { this.setStatus('lb-status', 'Room open! Share the code or link with friends.'); this.renderLobby(); });
    peer.on('connection', (conn) => this.onConnection(conn));
    peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) { this.setStatus('lb-status', 'Reconnecting to the matchmaking server…'); try { peer.reconnect(); } catch (e) {} } });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (err.type === 'unavailable-id' && attempt < 5) { this.host(attempt + 1); return; }
      this.setStatus('lb-status', 'Network problem: ' + (err.type || err.message || err) + '. Try again in a moment.');
    });
  },
  onConnection(conn) {
    conn.on('data', (msg) => this.hostMsg(conn, msg));
    conn.on('close', () => this.dropConn(conn));
    conn.on('error', () => this.dropConn(conn));
  },
  hostMsg(conn, m) {
    if (!m || typeof m !== 'object') return;
    const id = conn._pid;
    if (id) this.lastSeen.set(id, performance.now());
    switch (m.t) {
      case 'hello': {
        if (conn._pid) return;
        let humans = this.lobby.players.filter((p) => !p.bot);
        if (this.lobby.players.length >= MAX_PLAYERS) {
          const bot = [...this.lobby.players].reverse().find((p) => p.bot);
          if (bot && this.lobby.phase === 'lobby') this.lobby.players = this.lobby.players.filter((p) => p !== bot);
          else { this.send(conn, { t: 'full' }); setTimeout(() => conn.close(), 300); return; }
        }
        const pid = 'p' + this.nextId++;
        conn._pid = pid; this.conns.set(pid, conn); this.lastSeen.set(pid, performance.now());
        const p = { id: pid, name: cleanName(m.name), color: (m.color | 0) % COLORS.length, hats: Hats.clean(m.hats), ready: false, spectate: this.lobby.phase === 'race' };
        this.lobby.players.push(p);
        this.send(conn, { t: 'welcome', id: pid, code: this.code });
        this.broadcastLobby();
        toast(p.name + ' joined!');
        Sound.play('pop');
        const R = App.race;
        if (this.lobby.phase === 'race' && R && R.mode === 'host') this.send(conn, this.startMsg(R, true));
        break;
      }
      case 'ready': { const p = this.player(id); if (p) { p.ready = !!m.v; this.broadcastLobby(); } break; }
      case 'profile': {
        const p = this.player(id); if (!p) return;
        p.name = cleanName(m.name); p.color = (m.color | 0) % COLORS.length; p.hats = Hats.clean(m.hats);
        this.broadcastLobby(); break;
      }
      case 'in': this.inputs.set(id, { bits: m.b | 0, up: m.u | 0, dn: m.d | 0 }); break;
      case 'bye': this.dropConn(conn); break;
    }
  },
  player(id) { return this.lobby.players.find((p) => p.id === id); },
  dropConn(conn) {
    const id = conn._pid; if (!id || !this.conns.has(id)) return;
    this.conns.delete(id); this.inputs.delete(id); this.lastSeen.delete(id);
    try { conn.close(); } catch (e) {}
    const p = this.player(id);
    this.lobby.players = this.lobby.players.filter((x) => x.id !== id);
    const R = App.race;
    if (R && R.mode === 'host' && R.bike(id)) { R.removeBike(id); R.ev('left', null, p ? p.name : 'A rider'); }
    else if (p) toast(p.name + ' left');
    this.broadcastLobby();
  },
  addBot() {
    if (this.role !== 'host' || this.lobby.players.length >= MAX_PLAYERS) return;
    const [b] = makeBots(1, this.lobby.players.map((p) => p.color));
    b.ready = true; this.lobby.players.push(b); this.broadcastLobby();
  },
  removeBot() {
    const bot = [...this.lobby.players].reverse().find((p) => p.bot);
    if (bot) { this.lobby.players = this.lobby.players.filter((p) => p !== bot); this.broadcastLobby(); }
  },
  lobbyMsg() {
    const t = TrackStore.get(this.lobby.track) || BUILTIN_TRACKS[0];
    return { t: 'lobby', code: this.code, laps: this.lobby.laps, track: { id: t.id, name: t.name }, phase: this.lobby.phase,
      players: this.lobby.players.map((p) => ({ id: p.id, name: p.name, color: p.color, hats: p.hats, ready: !!p.ready, bot: !!p.bot, host: !!p.host, spectate: !!p.spectate })) };
  },
  broadcastLobby() {
    if (this.role !== 'host') return;
    const h = this.player('H'); if (h) Object.assign(h, this.me());
    const m = this.lobbyMsg(); this.broadcast(m); this.renderLobby(m);
  },
  sendProfile() {
    if (this.role === 'host') this.broadcastLobby();
    else if (this.role === 'client') this.send(this.conn, { t: 'profile', ...this.me() });
  },
  startMsg(R, spectate) {
    return { t: 'start', track: R.src, laps: R.laps, spectate: !!spectate,
      players: R.bikes.map((b) => ({ id: b.id, name: b.name, color: b.color, hats: b.hats, bot: b.bot })) };
  },
  startRace() {
    if (this.role !== 'host') return;
    const waiting = this.lobby.players.filter((p) => !p.bot && !p.host && !p.ready);
    if (waiting.length) { toast('Waiting for ' + waiting.map((p) => p.name).join(', ') + ' to be ready'); return; }
    const src = TrackStore.get(this.lobby.track) || BUILTIN_TRACKS[0];
    this.lobby.players.forEach((p) => (p.spectate = false));
    const players = this.lobby.players.map((p) => ({ id: p.id, name: p.name, color: p.color, hats: p.hats, bot: !!p.bot, skill: p.skill }));
    const R = new Race({ mode: 'host', track: src, laps: this.lobby.laps, players, localId: 'H',
      inputFor: (b) => (b.id === 'H' ? localInput() : this.inputs.get(b.id) || null) });
    R.onStep = () => this.hostStep(R);
    this.lobby.phase = 'race'; this.resultsSent = false; this.stepCount = 0; this.inputs.clear();
    this.broadcast(this.startMsg(R, false));
    this.broadcastLobby();
    App.startRace(R);
  },
  hostStep(R) {
    if (R !== App.race) return;
    if (++this.stepCount % SNAP_EVERY === 0 || R.netEv.length) {
      const m = { t: 's', hc: r2(performance.now() / 1000), ph: R.phase === 'countdown' ? 0 : R.phase === 'race' ? 1 : 2, cd: r2(R.cd), tm: r2(R.time), b: R.bikes.map(packBike) };
      if (R.netEv.length) { m.ev = R.netEv; R.netEv = []; }
      this.broadcast(m);
    }
    if (R.phase === 'done' && !this.resultsSent) { this.resultsSent = true; this.broadcast({ t: 'results', results: R.results }); }
  },
  toLobby() {
    if (this.role !== 'host') return;
    this.lobby.phase = 'lobby';
    this.lobby.players.forEach((p) => { if (!p.host && !p.bot) p.ready = false; p.spectate = false; });
    App.race = null;
    this.broadcast({ t: 'tolobby' });
    this.broadcastLobby();
    App.go('lobby');
  },

  // =================== CLIENT ===================
  join(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 4) { this.setStatus('join-status', 'Room codes are 4 letters.'); return; }
    if (typeof Peer === 'undefined') { this.setStatus('join-status', 'Online play needs an internet connection.'); return; }
    if (this.joining) return;
    this.leave(true);
    this.role = 'client'; this.active = true; this.code = code; this.joining = true;
    this.setStatus('join-status', 'Connecting…');
    const peer = (this.peer = new Peer(this.peerOptions()));
    const fail = (msg) => { if (this.peer !== peer) return; this.joining = false; this.setStatus('join-status', msg); this.leave(true); };
    const timer = setTimeout(() => fail('Could not reach room ' + code + '. Check the code and that the host is still in the lobby.'), 15000);
    peer.on('open', () => {
      const conn = (this.conn = peer.connect(PEER_PREFIX + code, { serialization: 'json', reliable: true }));
      conn.on('open', () => { clearTimeout(timer); this.hostSeen = performance.now(); this.send(conn, { t: 'hello', v: 1, ...this.me() }); });
      conn.on('data', (m) => { this.hostSeen = performance.now(); this.clientMsg(m); });
      conn.on('close', () => this.hostGone('The host closed the room.'));
      conn.on('error', () => this.hostGone('Lost connection to the host.'));
    });
    peer.on('error', (err) => {
      clearTimeout(timer);
      if (err.type === 'peer-unavailable') fail('No room called ' + code + '. Double-check the code with the host.');
      else fail('Network problem: ' + (err.type || err.message || err));
    });
  },
  clientMsg(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome': this.myId = m.id; this.joining = false; App.go('lobby'); this.setStatus('lb-status', 'Joined! Press Ready when you are set.'); Sound.play('pop'); break;
      case 'full': this.joining = false; this.setStatus('join-status', 'That room is full (6 riders max).'); this.leave(true); break;
      case 'lobby': this.lobby = { players: m.players || [], track: m.track && m.track.id, trackName: m.track && m.track.name, laps: m.laps, phase: m.phase }; this.renderLobby(m); break;
      case 'start': {
        const src = sanitizeTrack(m.track); if (!src) return;
        App.startRace(new ClientRace({ track: src, laps: m.laps | 0 || 3, players: m.players || [], localId: m.spectate ? null : this.myId }));
        if (m.spectate) toast('Race in progress — watching until the next one!', 3.5);
        break;
      }
      case 's': if (App.race && App.race.mode === 'client') App.race.pushSnap(m); break;
      case 'results': if (App.race && App.race.mode === 'client') { App.race.results = m.results; App.race.phase = 'done'; App.raceDone(App.race); } break;
      case 'tolobby': App.race = null; App.go('lobby'); break;
      case 'bye': this.hostGone('The host closed the room.'); break;
    }
  },
  hostGone(msg) {
    if (this.role !== 'client') return;
    const inRace = App.scene === 'race';
    this.leave(true);
    toast(msg, 4);
    App.race = null;
    App.go(inRace || App.screen === 'lobby' || App.screen === 'results' ? 'title' : App.screen);
  },
  toggleReady() {
    const me = this.lobby.players.find((p) => p.id === this.myId); if (!me) return;
    me.ready = !me.ready; this.send(this.conn, { t: 'ready', v: me.ready }); this.renderLobby(); Sound.play('click');
  },

  // =================== shared ===================
  tick(dt) {
    if (!this.active) return;
    const now = performance.now();
    if (this.role === 'client' && this.conn && this.conn.open) {
      this.sendT -= dt; this.pingT -= dt;
      if (App.scene === 'race' && App.race && App.race.mode === 'client' && this.sendT <= 0) {
        this.sendT = 1 / 30; const i = localInput(); this.send(this.conn, { t: 'in', b: i.bits, u: i.up, d: i.dn });
      } else if (this.pingT <= 0) { this.pingT = 2; this.send(this.conn, { t: 'ping' }); }
      if (now - this.hostSeen > 9000) this.hostGone('Lost connection to the host.');
    }
    if (this.role === 'host') {
      this.pingT -= dt;
      if (this.pingT <= 0) {
        this.pingT = 2;
        if (App.scene !== 'race') this.broadcast({ t: 'ping' });
        for (const [id, t] of this.lastSeen) if (now - t > 12000) { const c = this.conns.get(id); if (c) this.dropConn(c); }
      }
    }
  },
  leave(silent) {
    if (this.role === 'host') this.broadcast({ t: 'bye' });
    else if (this.role === 'client') this.send(this.conn, { t: 'bye' });
    const peer = this.peer;
    this.peer = null; this.conn = null; this.conns.clear(); this.inputs.clear(); this.lastSeen.clear();
    this.role = null; this.active = false; this.myId = null; this.joining = false;
    if (peer) setTimeout(() => { try { peer.destroy(); } catch (e) {} }, 200);
    if (!silent) toast('Left the room');
  },
  copyLink() {
    const link = this.shareLink();
    const done = () => toast('Link copied — send it to your friends!');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => toast(link, 5));
    else toast(link, 5);
  },
  resultsButtons(R, add) {
    if (this.role === 'host') add('Back to Lobby', () => this.toLobby(), 'go');
    else { add('Leave', () => { this.leave(); App.race = null; App.go('title'); }); $('res-status').textContent = 'Waiting for the host…'; }
  },

  // =================== lobby screen ===================
  renderLobby(m) {
    if (App.screen !== 'lobby' && !m) return;
    const L = this.lobby, host = this.role === 'host';
    $('lb-code').textContent = this.code || '----';
    $('lb-link').textContent = this.code ? this.shareLink() : '';
    $('lb-hostctl').style.display = host ? '' : 'none';
    const tName = host ? (TrackStore.get(L.track) || BUILTIN_TRACKS[0]).name : L.trackName || L.track;
    $('lb-settings').textContent = 'Track: ' + tName + ' · ' + L.laps + ' laps' + (L.phase === 'race' ? ' · race in progress' : '');
    if (host) {
      const sel = $('lb-track');
      const opts = TrackStore.all();
      if (sel.options.length !== opts.length || [...sel.options].some((o, i) => o.value !== opts[i].id)) {
        sel.innerHTML = opts.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.name) + (t.diff ? '' : ' (custom)') + '</option>').join('');
      }
      sel.value = L.track;
      const laps = $('lb-laps'); laps.innerHTML = '';
      for (const n of [2, 3]) {
        const b = document.createElement('button'); b.className = 'mini'; b.textContent = n + ' laps'; b.classList.toggle('sel', L.laps === n);
        b.onclick = () => { L.laps = n; Settings.laps = n; saveSettings(); this.broadcastLobby(); }; laps.appendChild(b);
      }
      $('lb-addbot').disabled = L.players.length >= MAX_PLAYERS;
      $('lb-rmbot').disabled = !L.players.some((p) => p.bot);
    }
    const list = $('lb-players'); list.innerHTML = '';
    for (const p of L.players) {
      const row = document.createElement('div'); row.className = 'pl';
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = (COLORS[p.color] || COLORS[0]).c; row.appendChild(dot);
      const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = p.name + (p.id === this.myId ? ' (you)' : ''); row.appendChild(nm);
      if (p.hats && p.hats.length) { const c = Hats.stackCanvas(Hats.clean(p.hats)); c.style.height = Math.min(30, c.height * 2) + 'px'; c.style.width = Math.min(30, c.height * 2) * (c.width / c.height) + 'px'; row.appendChild(c); }
      const tag = document.createElement('span'); tag.className = 'tagr';
      if (p.host) { tag.textContent = 'HOST'; tag.classList.add('ready'); }
      else if (p.bot) { tag.textContent = 'CPU'; }
      else if (p.spectate) { tag.textContent = 'WATCHING'; }
      else { tag.textContent = p.ready ? 'READY' : 'NOT READY'; tag.classList.toggle('ready', !!p.ready); }
      row.appendChild(tag);
      list.appendChild(row);
    }
    $('lb-count').textContent = L.players.length + '/' + MAX_PLAYERS;
    $('lb-ready').style.display = host ? 'none' : '';
    const me = L.players.find((p) => p.id === this.myId);
    $('lb-ready').textContent = me && me.ready ? 'Ready!' : 'Ready';
    $('lb-ready').classList.toggle('sel', !!(me && me.ready));
    $('lb-start').style.display = host ? '' : 'none';
    const waiting = L.players.filter((p) => !p.bot && !p.host && !p.ready).length;
    $('lb-start').textContent = waiting ? 'Waiting (' + waiting + ')' : 'Start Race';
    $('lb-start').disabled = !!waiting || L.phase === 'race';
    $('lb-sharerow').style.display = this.code ? '' : 'none';
  },
};

function cleanName(n) { const s = String(n || '').replace(/[^\w .\-!?']/g, '').trim().slice(0, 12); return s || 'Rider'; }

// Bike state squeezed into a small array for snapshots.
function packBike(b) {
  const r = b.rider, crash = b.state === 'crash';
  return [b.id, r1(b.dist), r2(b.lp), r1(b.y), r2(b.ang), Math.round(b.v), Math.round(b.heat), STATE_CODES.indexOf(b.state),
    b.inv > 0 ? 1 : 0, b.finished ? b.place : 0, r2(b.finishTime), crash ? r1(r.x - b.dist) : 0, crash ? r1(r.h) : 0,
    crash ? r2(r.rot) : 0, crash ? r.ph : 0, r.flip ? 1 : 0, b.turbo ? 1 : 0, b.air ? 1 : 0];
}
function unpackBike(a) {
  return { id: a[0], dist: a[1], lp: a[2], y: a[3], ang: a[4], v: a[5], heat: a[6], state: STATE_CODES[a[7]] || 'ride', inv: a[8] ? 1 : 0,
    finished: a[9] > 0, place: a[9], finishTime: a[10], rider: { x: a[1] + a[11], h: a[12], rot: a[13], ph: a[14], flip: a[15] }, turbo: !!a[16], air: !!a[17] };
}

// A race as seen by a joining player: no physics, just smoothed snapshots from the host.
class ClientRace {
  constructor(o) {
    this.local = false; this.mode = 'client';
    this.src = o.track; this.track = compileTrack(o.track); this.laps = o.laps; this.localId = o.localId;
    this.meta = new Map(o.players.map((p) => [p.id, { name: cleanName(p.name), color: (p.color | 0) % COLORS.length, hats: Hats.clean(p.hats), bot: !!p.bot }]));
    this.snaps = []; this.pending = []; this.phase = 'countdown'; this.cd = 0; this.time = 0; this.results = null;
    this.off = null; this.last = [];
  }
  pushSnap(m) {
    const recv = performance.now() / 1000;
    const o = recv - m.hc;
    this.off = this.off == null || o < this.off ? o : this.off + (o - this.off) * 0.02;   // track the fastest delivery
    const bikes = new Map();
    for (const a of m.b || []) { const b = unpackBike(a); const meta = this.meta.get(b.id); if (meta) bikes.set(b.id, Object.assign(b, meta)); }
    this.snaps.push({ t: m.hc + this.off, recv, bikes, ph: m.ph, cd: m.cd, tm: m.tm });
    if (this.snaps.length > 40) this.snaps.shift();
    if (m.ev) for (const e of m.ev) this.pending.push(e);
  }
  bike(id) { const s = this.snaps[this.snaps.length - 1]; return s ? s.bikes.get(id) : null; }
  update(dt) {
    const s = this.snaps[this.snaps.length - 1];
    if (s) {
      if (this.phase !== 'done') this.phase = ['countdown', 'race', 'done'][s.ph];
      this.cd = s.cd;
      this.time = this.phase === 'race' ? Math.max(this.time + dt, s.tm) : s.tm;
      if (this.time > s.tm + 0.3) this.time = s.tm + 0.3;
    }
    if (this.pending.length) { const evs = this.pending; this.pending = []; for (const ev of evs) handleEvent(ev, this, this.last); }
  }
  viewBikes() {
    const S = this.snaps; if (!S.length) return [];
    const now = performance.now() / 1000, rt = now - INTERP_DELAY;
    let a = S[0], b = S[S.length - 1];
    for (let i = S.length - 1; i > 0; i--) if (S[i - 1].t <= rt) { a = S[i - 1]; b = S[i]; break; }
    const k = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1.2) : 1;
    const latest = S[S.length - 1];
    const out = [];
    for (const [id, nb] of latest.bikes) {
      let v;
      if (id === this.localId) {
        // your own bike: newest data, nudged forward by speed so it feels responsive
        const age = clamp(now - latest.t, 0, 0.15);
        v = Object.assign({}, nb, { dist: nb.dist + (nb.state === 'crash' ? 0 : nb.v * age) });
      } else {
        const p = a.bikes.get(id), q = b.bikes.get(id);
        if (p && q && Math.abs(q.dist - p.dist) < 80) {
          v = Object.assign({}, q, { dist: lerp(p.dist, q.dist, k), lp: lerp(p.lp, q.lp, k), y: lerp(p.y, q.y, k), ang: lerp(p.ang, q.ang, k),
            rider: { x: lerp(p.rider.x, q.rider.x, k), h: lerp(p.rider.h, q.rider.h, k), rot: lerp(p.rider.rot, q.rider.rot, k), ph: q.rider.ph, flip: q.rider.flip } });
        } else v = Object.assign({}, nb);
      }
      out.push(v);
    }
    this.last = out;
    return out;
  }
}
