'use strict';
/* =====================================================================
   Hat Trick Moto — net.js
   Online multiplayer with PeerJS (WebRTC).

   One player hosts: they run the lobby, the computer riders, and decide
   the finishing order. Everyone rides their OWN bike on their own device
   (so the controls feel instant) and sends where they are 20 times a
   second. The host passes everyone's positions on to everyone else, and
   other riders show up as ghosts you ride through — just like a time
   trial against friends.

   Messages (JSON):
     client -> host : hello, ready, profile, st (my bike), ping, bye
     host -> client : welcome, full, lobby, start, s (all bikes), left,
                      results, tolobby, bye
   ===================================================================== */

const PEER_PREFIX = 'hattrickmoto-v4-';   // bump when messages change so old copies can't join
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PLAYERS = 6;
const SEND_EVERY = 3;                     // physics steps between updates (60/3 = 20 per second)

const Net = {
  role: null, active: false, peer: null, code: '', myId: null,
  conns: new Map(),            // host: player id -> connection
  conn: null,                  // client: connection to the host
  lobby: { players: [], track: 'meadow', phase: 'lobby' },
  lastSeen: new Map(), nextId: 1, stepCount: 0, pingT: 0, hostSeen: 0, resultsSent: false, joining: false,

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
  me() { return { name: Profile.name, color: Profile.color, char: Profile.rider }; },
  send(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) {} },
  broadcast(msg) { for (const c of this.conns.values()) this.send(c, msg); },
  setStatus(id, t) { const el = $(id); if (el) el.textContent = t; },

  // =================== HOST ===================
  host(attempt = 0) {
    if (typeof Peer === 'undefined') { toast('Online play needs an internet connection'); return; }
    this.leave(true);
    this.role = 'host'; this.active = true;
    this.code = Array.from({ length: 4 }, () => pick(CODE_CHARS)).join('');
    this.lobby = { players: [{ id: 'H', ...this.me(), ready: true, host: true }], track: TrackStore.get(Settings.track) ? Settings.track : 'meadow', phase: 'lobby' };
    this.nextId = 1; this.lastSeen.clear(); this.conns.clear();
    this.myId = 'H';
    App.go('lobby');
    this.setStatus('lb-status', 'Opening room…');
    const peer = (this.peer = new Peer(PEER_PREFIX + this.code, this.peerOptions()));
    peer.on('open', () => { this.setStatus('lb-status', 'Room open! Share the code or link with friends.'); this.renderLobby(); });
    peer.on('connection', (conn) => {
      conn.on('data', (msg) => this.hostMsg(conn, msg));
      conn.on('close', () => this.dropConn(conn));
      conn.on('error', () => this.dropConn(conn));
    });
    peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) { this.setStatus('lb-status', 'Reconnecting to the matchmaking server…'); try { peer.reconnect(); } catch (e) {} } });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (err.type === 'unavailable-id' && attempt < 5) { this.host(attempt + 1); return; }
      this.setStatus('lb-status', 'Network problem: ' + (err.type || err.message || err) + '. Try again in a moment.');
    });
  },
  hostMsg(conn, m) {
    if (!m || typeof m !== 'object') return;
    const id = conn._pid;
    if (id) this.lastSeen.set(id, performance.now());
    switch (m.t) {
      case 'hello': {
        if (conn._pid) return;
        if (this.lobby.players.length >= MAX_PLAYERS) {
          const bot = [...this.lobby.players].reverse().find((p) => p.bot);
          if (bot && this.lobby.phase === 'lobby') this.lobby.players = this.lobby.players.filter((p) => p !== bot);
          else { this.send(conn, { t: 'full' }); setTimeout(() => conn.close(), 300); return; }
        }
        const pid = 'p' + this.nextId++;
        conn._pid = pid; this.conns.set(pid, conn); this.lastSeen.set(pid, performance.now());
        const p = { id: pid, name: cleanName(m.name), color: (m.color | 0) % COLORS.length, char: cleanRider(m.char), ready: false, spectate: this.lobby.phase === 'race' };
        this.lobby.players.push(p);
        this.send(conn, { t: 'welcome', id: pid, code: this.code });
        this.broadcastLobby();
        toast(p.name + ' joined!'); Sound.play('pop');
        const R = App.race;
        if (this.lobby.phase === 'race' && R && R.mode === 'host') this.send(conn, this.startMsg(R, true));
        break;
      }
      case 'ready': { const p = this.player(id); if (p) { p.ready = !!m.v; this.broadcastLobby(); } break; }
      case 'profile': {
        const p = this.player(id); if (!p) return;
        p.name = cleanName(m.name); p.color = (m.color | 0) % COLORS.length; p.char = cleanRider(m.char);
        this.broadcastLobby(); break;
      }
      case 'st': { const R = App.race; if (R && R.mode === 'host') { const g = R.ghosts.get(id); if (g) g.push(m.s); } break; }
      case 'bye': this.dropConn(conn); break;
    }
  },
  player(id) { return this.lobby.players.find((p) => p.id === id); },
  dropConn(conn) {
    const id = conn._pid; if (!id || !this.conns.has(id)) return;
    this.conns.delete(id); this.lastSeen.delete(id);
    try { conn.close(); } catch (e) {}
    const p = this.player(id), name = p ? p.name : 'A rider';
    this.lobby.players = this.lobby.players.filter((x) => x.id !== id);
    const R = App.race;
    if (R && R.mode === 'host' && R.meta.has(id)) { R.removePlayer(id); this.broadcast({ t: 'left', id, name }); }
    toast(name + (R ? ' left the race' : ' left'));
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
    return { t: 'lobby', code: this.code, track: { id: t.id, name: t.name }, phase: this.lobby.phase,
      players: this.lobby.players.map((p) => ({ id: p.id, name: p.name, color: p.color, char: p.char, ready: !!p.ready, bot: !!p.bot, host: !!p.host, spectate: !!p.spectate })) };
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
    return { t: 'start', track: { id: R.src.id, name: R.src.name, pieces: R.src.pieces }, spectate: !!spectate, elapsed: spectate ? R.time : 0,
      players: [...R.meta.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, char: p.char, bot: p.bot })) };
  },
  startRace() {
    if (this.role !== 'host') return;
    const waiting = this.lobby.players.filter((p) => !p.bot && !p.host && !p.ready);
    if (waiting.length) { toast('Waiting for ' + waiting.map((p) => p.name).join(', ') + ' to be ready'); return; }
    const src = sanitizeTrack(TrackStore.get(this.lobby.track) || BUILTIN_TRACKS[0]);
    this.lobby.players.forEach((p) => (p.spectate = false));
    const players = this.lobby.players.map((p) => ({ id: p.id, name: p.name, color: p.color, char: p.char, bot: !!p.bot, skill: p.skill }));
    const R = new Race({ mode: 'host', track: src, players, localId: 'H', inputFor: (b) => (b.id === 'H' ? localInput() : null) });
    R.onStep = () => this.hostStep(R);
    this.lobby.phase = 'race'; this.resultsSent = false; this.stepCount = 0;
    this.broadcast(this.startMsg(R, false));
    this.broadcastLobby();
    App.startRace(R);
  },
  hostStep(R) {
    if (R !== App.race) return;
    if (R.phase === 'done' && !this.resultsSent) { this.resultsSent = true; this.broadcast({ t: 'results', results: R.results }); }
    if (++this.stepCount % SEND_EVERY) return;
    const all = [];
    for (const b of R.sim) all.push([b.id, ...packBike(b)]);
    for (const [id, g] of R.ghosts) if (g.raw) all.push([id, ...g.raw]);
    this.broadcast({ t: 's', b: all });
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
      conn.on('open', () => { clearTimeout(timer); this.hostSeen = performance.now(); this.send(conn, { t: 'hello', v: 4, ...this.me() }); });
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
    const R = App.race && App.race.mode === 'client' ? App.race : null;
    switch (m.t) {
      case 'welcome': this.myId = m.id; this.joining = false; App.go('lobby'); this.setStatus('lb-status', 'Joined! Press Ready when you are set.'); Sound.play('pop'); break;
      case 'full': this.joining = false; this.setStatus('join-status', 'That room is full (6 riders max).'); this.leave(true); break;
      case 'lobby':
        this.lobby = { players: Array.isArray(m.players) ? m.players : [], track: m.track && m.track.id, trackName: m.track && String(m.track.name), phase: m.phase };
        this.renderLobby(m); break;
      case 'start': {
        const src = sanitizeTrack(m.track); if (!src) return;
        const players = (Array.isArray(m.players) ? m.players : []).slice(0, MAX_PLAYERS)
          .map((p) => ({ id: String(p.id), name: cleanName(p.name), color: (p.color | 0) % COLORS.length, char: cleanRider(p.char), bot: !!p.bot }));
        const NR = new Race({ mode: 'client', track: src, players, localId: m.spectate ? null : this.myId, inputFor: () => localInput(), elapsed: m.spectate ? num(m.elapsed) : 0 });
        NR.onStep = () => this.clientStep(NR);
        this.stepCount = 0;
        App.startRace(NR);
        if (m.spectate) toast('Race in progress — watching until the next one!', 3.5);
        break;
      }
      case 's':
        if (R && Array.isArray(m.b)) for (const e of m.b) {
          if (!Array.isArray(e) || e[0] === this.myId) continue;
          const g = R.ghosts.get(e[0]); if (g) g.push(e.slice(1));
        }
        break;
      case 'left': if (R) R.removePlayer(m.id); toast(cleanName(m.name) + ' left the race'); break;
      case 'results':
        if (R && Array.isArray(m.results)) {
          R.results = m.results.slice(0, MAX_PLAYERS).map((r, i) => ({ id: r.id, name: cleanName(r.name), color: (r.color | 0) % COLORS.length, pos: i + 1, time: typeof r.time === 'number' ? r.time : null, bot: !!r.bot }));
          R.phase = 'done'; App.raceDone(R);
        }
        break;
      case 'tolobby': App.race = null; App.go('lobby'); break;
      case 'bye': this.hostGone('The host closed the room.'); break;
    }
  },
  clientStep(R) {
    if (R !== App.race || ++this.stepCount % SEND_EVERY) return;
    const b = R.bike(this.myId);
    if (b) this.send(this.conn, { t: 'st', s: packBike(b) });
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
    this.pingT -= dt;
    if (this.pingT <= 0) {
      this.pingT = 2;
      if (this.role === 'client') this.send(this.conn, { t: 'ping' });
      if (this.role === 'host') {
        if (App.scene !== 'race') this.broadcast({ t: 'ping' });
        for (const [id, t] of this.lastSeen) if (now - t > 12000) { const c = this.conns.get(id); if (c) this.dropConn(c); }
      }
    }
    if (this.role === 'client' && this.conn && this.conn.open && now - this.hostSeen > 9000) this.hostGone('Lost connection to the host.');
  },
  leave(silent) {
    if (this.role === 'host') this.broadcast({ t: 'bye' });
    else if (this.role === 'client') this.send(this.conn, { t: 'bye' });
    const peer = this.peer;
    this.peer = null; this.conn = null; this.conns.clear(); this.lastSeen.clear();
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
    $('lb-settings').textContent = 'Track: ' + tName + (L.phase === 'race' ? ' · race in progress' : '');
    if (host) {
      const sel = $('lb-track'), opts = TrackStore.all();
      if (sel.options.length !== opts.length || [...sel.options].some((o, i) => o.value !== opts[i].id))
        sel.innerHTML = opts.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.name) + (t.diff ? '' : ' (custom)') + '</option>').join('');
      sel.value = L.track;
      $('lb-addbot').disabled = L.players.length >= MAX_PLAYERS;
      $('lb-rmbot').disabled = !L.players.some((p) => p.bot);
    }
    const list = $('lb-players'); list.innerHTML = '';
    for (const p of L.players) {
      const row = document.createElement('div'); row.className = 'pl';
      const pic = bikePortrait((p.color | 0) % COLORS.length, cleanRider(p.char)); pic.style.height = '45px'; pic.style.width = '46px'; row.appendChild(pic);
      const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = cleanName(p.name) + (p.id === this.myId ? ' (you)' : ''); row.appendChild(nm);
      const tag = document.createElement('span'); tag.className = 'tagr';
      if (p.host) { tag.textContent = 'HOST'; tag.classList.add('ready'); }
      else if (p.bot) tag.textContent = 'CPU';
      else if (p.spectate) tag.textContent = 'WATCHING';
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

function cleanRider(r) { return RIDER_IDS.includes(r) ? r : RIDER_IDS[0]; }
function cleanName(n) { const s = String(n || '').replace(/[^\w .\-!?']/g, '').trim().slice(0, 12); return s || 'Rider'; }
