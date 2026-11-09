'use strict';
/* =====================================================================
   Hat Trick Moto — tracks.js
   Track pieces (jumps, rollers, whoops, hills...), the built-in tracks,
   turning a list of pieces into smooth terrain, saved custom tracks, and
   the track editor.
   ===================================================================== */

const START_RUN = 300;     // flat run before the first piece (start gate sits here)
const FINISH_RUN = 560;    // flat run after the finish line so riders can slow down
const MAX_PIECES = 60;

// Each piece is drawn with a few shape segments (lengths and heights in pixels):
//   line(len, dy)   straight slope
//   ease(len, dy)   smooth S-curve (flat at both ends)
//   kick(len, dy)   jump face — gets steeper toward the lip
//   land(len, dy)   landing — steepest at the top, flattening out at the bottom
//   bump(len, h)    smooth hump that ends at the same height it started
//   surf(type, len) flat stretch of mud
// `brakeAbove` is the approach speed above which a jump sends you past its landing
// (the computer riders brake to stay under it — you can too).
const PIECES = [
  { id: 'flat', code: 'f', label: 'Flat', build: (p) => p.line(220, 0) },
  { id: 'rollers', code: 'r', label: 'Rollers', build: (p) => { p.line(30, 0); for (let i = 0; i < 5; i++) p.bump(64, 13); p.line(30, 0); } },
  { id: 'whoops', code: 'w', label: 'Whoops', build: (p) => { p.line(40, 0); for (let i = 0; i < 9; i++) p.bump(40, 10); p.line(40, 0); } },
  { id: 'table', code: 't', label: 'Tabletop', brakeAbove: 320, lead: 110, build: (p) => { p.line(110, 0); p.kick(110, 50); p.line(227, 0); p.ease(240, -110); p.line(40, 0); } },
  { id: 'double', code: 'd', label: 'Double', brakeAbove: 335, lead: 120, build: (p) => { p.line(120, 0); p.kick(104, 46); p.line(7, -46); p.line(182, 0); p.line(36, 52); p.ease(240, -112); p.line(50, 0); } },
  { id: 'triple', code: 'T', label: 'Big Triple', brakeAbove: 345, lead: 160, build: (p) => { p.line(160, 0); p.kick(124, 62); p.line(8, -62); p.line(142, 0); p.line(42, 68); p.ease(280, -138); p.line(60, 0); } },
  { id: 'stepup', code: 'u', label: 'Step-Up', lead: 120, build: (p) => { p.line(120, 0); p.kick(96, 44); p.line(7, -18); p.line(50, 0); p.line(24, 54); p.line(260, 0); } },
  { id: 'stepdown', code: 'n', label: 'Step-Down', brakeAbove: 385, lead: 110, build: (p) => { p.line(110, 0); p.kick(56, 18); p.line(8, -24); p.line(170, 0); p.ease(520, -170); p.line(60, 0); } },
  { id: 'hump', code: 'h', label: 'Big Roller', build: (p) => { p.line(40, 0); p.ease(160, 64); p.ease(360, -110); p.line(40, 0); } },
  { id: 'hillup', code: 'U', label: 'Hill Up', build: (p) => p.ease(380, 120) },
  { id: 'hilldown', code: 'D', label: 'Hill Down', build: (p) => p.ease(380, -120) },
  { id: 'mud', code: 'm', label: 'Mud', build: (p) => { p.line(30, 0); p.surf('mud', 220); p.line(30, 0); } },
];
const PIECE = Object.fromEntries(PIECES.map((p) => [p.id, p]));
const PIECE_BY_CODE = Object.fromEntries(PIECES.map((p) => [p.code, p]));
const SURF = { none: 0, mud: 1 };

// ---------- built-in tracks (point to point) ----------
const BUILTIN_TRACKS = [
  { id: 'meadow', name: 'Meadow Run', diff: 1, pieces: [
    'flat', 'rollers', 'table', 'hump', 'table', 'hillup', 'rollers', 'stepdown', 'table',
    'hump', 'double', 'flat', 'table', 'hillup', 'hump', 'stepdown', 'rollers', 'table', 'hilldown', 'table'] },
  { id: 'canyon', name: 'Canyon Rush', diff: 2, pieces: [
    'flat', 'table', 'rollers', 'double', 'hump', 'whoops', 'stepup', 'double', 'stepdown', 'mud', 'table',
    'hillup', 'double', 'hump', 'stepdown', 'triple', 'stepup', 'whoops', 'double', 'triple'] },
  { id: 'ridge', name: 'Thunder Ridge', diff: 3, pieces: [
    'flat', 'double', 'whoops', 'triple', 'stepup', 'double', 'mud', 'table', 'triple', 'stepdown',
    'hump', 'double', 'stepup', 'triple', 'whoops', 'stepdown', 'double', 'mud', 'stepup', 'triple', 'double', 'triple'] },
];

// ---------- compiling: pieces -> terrain lookup tables ----------
// Heights are stored once per world pixel. y goes UP (bigger = higher).
function compileTrack(src) {
  const hs = [0], sf = [0];
  let y = 0;
  const seg = (len, dy, f, s = 0) => {
    len = Math.max(1, Math.round(len)); const y0 = y;
    for (let i = 1; i <= len; i++) { hs.push(y0 + dy * f(i / len)); sf.push(s); }
    y = y0 + dy;
  };
  const P = {
    line: (L, dy) => seg(L, dy, (t) => t),
    ease: (L, dy) => seg(L, dy, (t) => t * t * (3 - 2 * t)),
    kick: (L, dy) => seg(L, dy, (t) => t * t),
    land: (L, dy) => seg(L, dy, (t) => 1 - (1 - t) * (1 - t)),
    bump: (L, a) => { const y0 = y, len = Math.round(L); for (let i = 1; i <= len; i++) { const s = Math.sin((Math.PI * i) / len); hs.push(y0 + a * s * s); sf.push(0); } y = y0; },
    surf: (type, L) => seg(L, 0, (t) => t, SURF[type] || 0),
  };
  P.line(START_RUN, 0);
  const ids = (src.pieces || []).filter((id) => PIECE[id]).slice(0, MAX_PIECES);
  const starts = [];
  const zones = [];
  for (const id of ids) {
    const x0 = hs.length - 1; starts.push(x0); PIECE[id].build(P);
    if (PIECE[id].lead && PIECE[id].brakeAbove) zones.push({ x0, x1: x0 + PIECE[id].lead, v: PIECE[id].brakeAbove });
  }
  starts.push(hs.length - 1);
  const finishX = hs.length - 1 + 50;
  P.line(FINISH_RUN, 0);

  const len = hs.length - 1;
  const hm = Float32Array.from(hs);
  let minY = Infinity, maxY = -Infinity;
  for (const v of hm) { if (v < minY) minY = v; if (v > maxY) maxY = v; }
  // a gently smoothed copy of the ground for the trackside fence
  const fence = blur(blur(hm, 48), 48);
  return { name: src.name || 'Custom', len, hm, sf: Uint8Array.from(sf), fence, startX: 140, finishX, starts, ids, zones, minY, maxY, src };
}
function blur(a, r) {
  const n = a.length, out = new Float32Array(n);
  let sum = 0;
  const at = (i) => a[i < 0 ? 0 : i >= n ? n - 1 : i];
  for (let i = -r; i <= r; i++) sum += at(i);
  for (let i = 0; i < n; i++) { out[i] = sum / (2 * r + 1); sum += at(i + r + 1) - at(i - r); }
  return out;
}

function trackH(T, x) {
  if (x <= 0) return T.hm[0];
  if (x >= T.len) return T.hm[T.len];
  const i = x | 0, f = x - i;
  return T.hm[i] + (T.hm[i + 1] - T.hm[i]) * f;
}
// Slope looking slightly backward — so a rider on a jump lip doesn't "see" the drop behind it.
function trackSlope(T, x) { return (trackH(T, x) - trackH(T, x - 4)) / 4; }
function trackSlopeC(T, x) { return (trackH(T, x + 3) - trackH(T, x - 3)) / 6; }
// The angle a bike sits at, measured under both wheels.
function groundAng(T, x) { return Math.atan2(trackH(T, x + BIKE.half) - trackH(T, x - BIKE.half), BIKE.half * 2); }
function surfAt(T, x) { const i = Math.round(x); return i < 0 || i > T.len ? 0 : T.sf[i]; }
function pieceAt(T, x) { for (let i = 0; i < T.ids.length; i++) if (x >= T.starts[i] && x < T.starts[i + 1]) return i; return -1; }

// ---------- custom track storage ----------
const TrackStore = {
  KEY: 'htm_tracks2',
  list() { try { const a = JSON.parse(localStorage.getItem(this.KEY) || '[]'); return Array.isArray(a) ? a.map(sanitizeTrack).filter(Boolean) : []; } catch (e) { return []; } },
  saveAll(a) { try { localStorage.setItem(this.KEY, JSON.stringify(a)); } catch (e) {} },
  save(t) { const a = this.list().filter((x) => x.id !== t.id); a.push(t); this.saveAll(a); },
  remove(id) { this.saveAll(this.list().filter((x) => x.id !== id)); },
  get(id) { return BUILTIN_TRACKS.find((t) => t.id === id) || this.list().find((t) => t.id === id) || null; },
  all() { return BUILTIN_TRACKS.concat(this.list()); },
};

// Basic validation for track data that arrives over the network, by paste, or from storage.
function sanitizeTrack(t) {
  if (!t || typeof t !== 'object' || !Array.isArray(t.pieces)) return null;
  const pieces = t.pieces.map((p) => (PIECE[p] ? p : PIECE_BY_CODE[p] ? PIECE_BY_CODE[p].id : null)).filter(Boolean).slice(0, MAX_PIECES);
  if (!pieces.length) return null;
  return { id: String(t.id || 'custom').slice(0, 40), name: String(t.name || 'Custom Track').slice(0, 24), diff: t.diff | 0, pieces };
}
function trackCode(t) { return 'HTM2:' + t.name.replace(/[:|]/g, '') + '|' + t.pieces.map((id) => PIECE[id].code).join(''); }
function parseTrackCode(s) {
  const m = /^HTM2:([^|]*)\|([A-Za-z]+)$/.exec(String(s).trim());
  if (!m) return null;
  return sanitizeTrack({ id: 'c' + Date.now().toString(36), name: m[1] || 'Shared Track', pieces: m[2].split('') });
}

// =====================================================================
// Track editor. The track is a row of pieces. Tap a piece on the track to
// select it, tap a piece in the palette to insert it after the selection.
// =====================================================================
const Editor = {
  track: null, T: null, sel: -1, scroll: 0, camY: 0, undo: [], mm: null, mmDrag: false,

  init() {
    const bar = $('ed-pieces');
    PIECES.forEach((p) => {
      const b = document.createElement('button'); b.textContent = p.label; b.title = 'Add ' + p.label;
      b.onclick = () => this.insert(p.id); bar.appendChild(b);
    });
    $('ed-name').addEventListener('input', (e) => { this.track.name = e.target.value.slice(0, 24) || 'My Track'; this.autosave(); });
    $('ed-left').onclick = () => this.move(-1);
    $('ed-right').onclick = () => this.move(1);
    $('ed-delpiece').onclick = () => this.removePiece();
    $('ed-undo').onclick = () => this.doUndo();
    $('ed-new').onclick = () => { if (this.track.pieces.length && !confirm('Start a new empty track? Unsaved changes are lost.')) return; this.load(this.blank()); };
    $('ed-save').onclick = () => this.save();
    $('ed-del').onclick = () => this.remove();
    $('ed-load').onchange = (e) => { const v = e.target.value; e.target.value = ''; if (v) this.loadFrom(v); };
    $('ed-share').onclick = () => this.openShare();
    $('ed-test').onclick = () => this.testRide(false);
    $('ed-testhere').onclick = () => this.testRide(true);
    $('ed-back').onclick = () => { this.autosave(); App.go('title'); };
    $('share-close').onclick = () => { App.showScreen('none'); App.setScene('editor'); };
    $('share-copy').onclick = () => {
      const t = $('share-text'); t.select();
      const ok = () => ($('share-status').textContent = 'Copied!');
      if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(ok, () => { document.execCommand('copy'); ok(); });
      else { document.execCommand('copy'); ok(); }
    };
    $('share-import').onclick = () => this.importCode($('share-text').value);
    view.addEventListener('pointerdown', (e) => this.pointer(e, 'down'));
    view.addEventListener('pointermove', (e) => this.pointer(e, 'move'));
    addEventListener('pointerup', () => { this.mmDrag = false; this.dragX = null; });
    view.addEventListener('wheel', (e) => { if (App.scene !== 'editor') return; e.preventDefault(); this.scrollBy((e.deltaY + e.deltaX) * 0.8); }, { passive: false });
  },
  blank() { return { id: 'c' + Date.now().toString(36), name: 'My Track', diff: 0, pieces: ['flat', 'table'] }; },
  open(fromTest) {
    if (!this.track || !fromTest) this.load(sanitizeTrack(Store.get('htm_edit2', null)) || this.blank(), true);
    App.race = null; Parts.length = 0;
    App.showScreen('none'); App.setScene('editor');
    this.refreshUI();
  },
  load(t, keep) {
    this.track = JSON.parse(JSON.stringify(t)); this.track.diff = 0;
    this.undo = [];
    const n = this.track.pieces.length;
    if (!keep) this.scroll = 0;
    if (!keep || this.sel < 0 || this.sel >= n) this.sel = n - 1;
    this.changed(); this.refreshUI();
  },
  loadFrom(v) {
    if (v.startsWith('b:')) {
      const src = BUILTIN_TRACKS.find((t) => t.id === v.slice(2)); if (!src) return;
      const t = JSON.parse(JSON.stringify(src)); t.id = 'c' + Date.now().toString(36); t.name = ('My ' + src.name).slice(0, 24);
      this.load(t); toast('Copied ' + src.name + ' — edit away!');
    } else { const t = TrackStore.list().find((x) => x.id === v); if (t) { this.load(t); toast('Loaded ' + t.name); } }
  },
  refreshUI() {
    if (!this.track) return;
    $('ed-name').value = this.track.name;
    $('ed-load').innerHTML = '<option value="">Load…</option>' +
      TrackStore.list().map((t) => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') +
      BUILTIN_TRACKS.map((t) => '<option value="b:' + t.id + '">Copy of ' + esc(t.name) + '</option>').join('');
    $('ed-del').disabled = !TrackStore.list().some((t) => t.id === this.track.id);
    const has = this.sel >= 0;
    $('ed-left').disabled = !has || this.sel === 0;
    $('ed-right').disabled = !has || this.sel >= this.track.pieces.length - 1;
    $('ed-delpiece').disabled = !has;
    $('ed-testhere').disabled = !has;
    const n = this.track.pieces.length;
    $('ed-hint').textContent = (has ? 'Selected: ' + PIECE[this.track.pieces[this.sel]].label + ' (' + (this.sel + 1) + '/' + n + ')' : n + ' pieces') + ' — tap a piece above to add it after the selection';
  },
  snapshot() { this.undo.push(JSON.stringify({ t: this.track, s: this.sel })); if (this.undo.length > 80) this.undo.shift(); },
  doUndo() {
    const s = this.undo.pop(); if (!s) { toast('Nothing to undo'); return; }
    const o = JSON.parse(s); this.track = o.t; this.sel = o.s; this.changed(); this.refreshUI();
  },
  changed() { this.T = compileTrack(this.track); this.autosave(); },
  autosave() { if (this.track) Store.set('htm_edit2', this.track); },
  insert(id) {
    if (this.track.pieces.length >= MAX_PIECES) { toast(MAX_PIECES + ' pieces max'); return; }
    this.snapshot();
    this.track.pieces.splice(this.sel + 1, 0, id); this.sel++;
    Sound.play('pop'); this.changed(); this.refreshUI(); this.showSel();
  },
  removePiece() {
    if (this.sel < 0) return;
    this.snapshot(); this.track.pieces.splice(this.sel, 1);
    this.sel = Math.min(this.sel, this.track.pieces.length - 1);
    Sound.play('bonk'); this.changed(); this.refreshUI();
  },
  move(d) {
    const i = this.sel, j = i + d, a = this.track.pieces;
    if (i < 0 || j < 0 || j >= a.length) return;
    this.snapshot(); [a[i], a[j]] = [a[j], a[i]]; this.sel = j;
    Sound.play('click'); this.changed(); this.refreshUI(); this.showSel();
  },
  showSel() {
    if (this.sel < 0) return;
    const x0 = this.T.starts[this.sel], x1 = this.T.starts[this.sel + 1];
    if (x0 < this.scroll + 40 || x1 > this.scroll + W - 40) this.scroll = clamp((x0 + x1) / 2 - W / 2, 0, this.maxScroll());
  },
  key(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.doUndo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.removePiece(); }
    else if (e.code === 'Escape') { this.autosave(); App.go('title'); }
  },
  maxScroll() { return Math.max(0, this.T.len - W); },
  scrollBy(d) { this.scroll = clamp(this.scroll + d, 0, this.maxScroll()); },
  update(dt) {
    const k = Input.keys;
    if (k & IN.LB) this.scrollBy(-420 * dt);
    if (k & IN.LF) this.scrollBy(420 * dt);
    const mid = this.scroll + W / 2;
    const ty = (trackH(this.T, mid - 120) + trackH(this.T, mid) + trackH(this.T, mid + 120)) / 3 - 34;
    this.camY += (ty - this.camY) * Math.min(1, dt * 6);
  },

  pointer(e, type) {
    if (App.scene !== 'editor') return;
    const g = toGame(e.clientX, e.clientY);
    const mm = this.mm;
    if (mm && (this.mmDrag || (type === 'down' && g.y >= mm.y - 2 && g.y <= mm.y + mm.h + 2))) {
      if (type === 'down' || (e.buttons & 1)) {
        this.mmDrag = true;
        this.scroll = clamp(((g.x - mm.x0) / (mm.x1 - mm.x0)) * this.T.len - W / 2, 0, this.maxScroll());
      }
      return;
    }
    if (type === 'down') {
      this.dragX = g.x; this.dragScroll = this.scroll; this.dragMoved = false;
    } else if (type === 'move' && this.dragX != null && (e.buttons & 1 || e.pointerType !== 'mouse')) {
      const d = g.x - this.dragX;
      if (Math.abs(d) > 4) this.dragMoved = true;
      if (this.dragMoved) this.scroll = clamp(this.dragScroll - d, 0, this.maxScroll());
      return;
    }
    if (type === 'down') {
      // select on release-less tap: select immediately, drag still scrolls
      const i = pieceAt(this.T, this.scroll + g.x);
      if (i >= 0 && i !== this.sel) { this.sel = i; Sound.play('click'); this.refreshUI(); }
    }
  },

  render(now) {
    const camX = Math.round(this.scroll), camY = Math.round(this.camY);
    renderWorld(this.T, camX, camY, [], now, { overlay: () => this.overlay(camX, camY) });
    this.drawMinimap();
  },
  overlay(camX, camY) {
    const T = this.T;
    // keep labels just under the top toolbar, however tall it wraps
    const r = view.getBoundingClientRect(), tb = document.querySelector('.ed-bar.top').getBoundingClientRect();
    const ly = Math.max(20, Math.round(((tb.bottom - r.top) / r.height) * H) + 5);
    for (let i = 0; i < T.ids.length; i++) {
      const x0 = T.starts[i], x1 = T.starts[i + 1];
      if (x1 < camX || x0 > camX + W) continue;
      const sx0 = x0 - camX, sx1 = x1 - camX;
      if (i === this.sel) {
        for (let sx = Math.max(0, sx0); sx < Math.min(W, sx1); sx++) {
          const sy = GROUND_ROW - Math.round(trackH(T, camX + sx)) + camY;
          ctx.fillStyle = 'rgba(255,210,63,0.16)'; ctx.fillRect(sx, ly - 4, 1, sy - ly + 4);
          ctx.fillStyle = '#ffd23f'; ctx.fillRect(sx, sy - 2, 1, 2);
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const by = GROUND_ROW - Math.round(trackH(T, x0)) + camY;
      for (let y = ly - 2; y < by; y += 4) ctx.fillRect(sx0, y, 1, 2);
      const label = PIECE[T.ids[i]].label, lw = label.length * 4;
      if (sx0 >= 0 || sx1 > lw + 10) text(label, Math.max(2, Math.min(sx0 + 3, sx1 - lw - 4)), ly, { c: i === this.sel ? '#ffd23f' : '#f4f2e8', sh: '#140c1c' });
    }
  },
  drawMinimap() {
    const r = view.getBoundingClientRect(), bb = document.querySelector('.ed-bar.bot').getBoundingClientRect();
    const yb = Math.min(H, ((bb.top - r.top) / r.height) * H);
    const x0 = 8, x1 = W - 8, w = x1 - x0, hgt = 22, y = Math.round(yb - hgt - 4);
    this.mm = { x0, x1, y, h: hgt };
    const T = this.T, span = Math.max(40, T.maxY - T.minY);
    ctx.fillStyle = 'rgba(20,12,28,0.85)'; ctx.fillRect(x0 - 3, y - 2, w + 6, hgt + 4);
    for (let i = 0; i < w; i++) {
      const wx = (i / w) * T.len, h = trackH(T, wx);
      const top = y + 2 + Math.round((1 - (h - T.minY) / span) * (hgt - 6));
      const pi = pieceAt(T, wx);
      ctx.fillStyle = pi === this.sel && pi >= 0 ? '#ffd23f' : surfAt(T, wx) === 1 ? '#5a3418' : '#b8743c';
      ctx.fillRect(x0 + i, top, 1, y + hgt - top);
    }
    const vx = x0 + (this.scroll / T.len) * w, vw = (W / T.len) * w;
    ctx.fillStyle = '#f4f2e8';
    ctx.fillRect(Math.round(vx), y - 1, Math.round(vw), 1); ctx.fillRect(Math.round(vx), y + hgt, Math.round(vw), 1);
    ctx.fillRect(Math.round(vx), y - 1, 1, hgt + 2); ctx.fillRect(Math.round(vx + vw), y - 1, 1, hgt + 2);
  },

  save() {
    const t = sanitizeTrack(this.track);
    if (!t) { toast('Add some pieces first!'); return; }
    t.id = this.track.id; t.diff = 0;
    TrackStore.save(t); Settings.track = t.id; saveSettings();
    toast('Saved "' + t.name + '" — pick it in Solo or your online lobby'); this.refreshUI();
  },
  remove() {
    if (!TrackStore.list().some((t) => t.id === this.track.id)) return;
    if (!confirm('Delete "' + this.track.name + '" from your saved tracks?')) return;
    TrackStore.remove(this.track.id); toast('Deleted'); this.refreshUI();
  },
  openShare() {
    const t = sanitizeTrack(this.track);
    $('share-text').value = t ? trackCode(t) : ''; $('share-status').textContent = '';
    App.showScreen('share'); App.setScene('menu-editor');
  },
  importCode(s) {
    const t = parseTrackCode(s);
    if (!t) { $('share-status').textContent = "That code didn't work. Make sure you copied all of it."; return; }
    this.load(t); App.showScreen('none'); App.setScene('editor'); toast('Imported "' + t.name + '" — press Save to keep it');
  },
  testRide(fromHere) {
    const t = sanitizeTrack(this.track);
    if (!t) { toast('Add some pieces first!'); return; }
    t.id = this.track.id;
    const startX = fromHere && this.sel >= 0 ? Math.max(140, this.T.starts[this.sel] - 110) : 0;
    App.startRace(new Race({ mode: 'test', track: t, players: [App.mePlayer('me')], localId: 'me', startX, inputFor: () => localInput() }));
  },
};
