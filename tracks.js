'use strict';
/* =====================================================================
   Hat Trick Moto — tracks.js
   Ramp shapes, the three built-in tracks, track compiling (height map +
   item grid), custom-track storage, and the track editor.
   ===================================================================== */

const TILE = 16;          // one grid cell = 16 world pixels
const LANES = 4;
const ITEM = { NONE: 0, MUD: 1, COOL: 2, HAY: 3, BAR: 4 };
const ITEM_KEYS = ['none', 'mud', 'cool', 'hay', 'bar'];

// Ramp profiles: x in tiles, height in pixels. Ramps span all four lanes.
const RAMPS = {
  bump:   { w: 3,  label: 'Small bump',  pts: [[0, 0], [1.5, 14], [3, 0]] },
  medium: { w: 6,  label: 'Medium ramp', pts: [[0, 0], [3, 30], [4, 30], [6, 0]] },
  big:    { w: 6,  label: 'Big jump',    pts: [[0, 0], [4, 50], [5, 50], [5.2, 0]] },
  double: { w: 10, label: 'Double hump', pts: [[0, 0], [2.5, 27], [3.5, 27], [5, 7], [6.5, 27], [7.5, 27], [10, 0]] },
};
// Tiles at the very start and end of a track stay clear for the start grid.
const RESERVED_START = 3, RESERVED_END = 6;

// ---------- built-in tracks ----------
// items: [type, startTile, lanes ('0'-'3'), length in tiles]
// Positions are stretched by TRACK_STRETCH so the fast bikes have room to land.
const TRACK_STRETCH = 1.3;
function defTrack(id, name, diff, length, ramps, items) {
  const S = (x) => Math.round(x * TRACK_STRETCH);
  const out = { id, name, diff, length: S(length), ramps: [], items: [] };
  for (const [type, x] of ramps) out.ramps.push({ type, x: S(x) });
  for (const [type, x, lanes, len = 1] of items)
    for (const l of lanes) for (let i = 0; i < len; i++) out.items.push({ t: type, x: S(x) + i, lane: +l });
  return out;
}

const BUILTIN_TRACKS = [
  defTrack('meadow', 'Meadow Loop', 1, 260,
    [['bump', 16], ['bump', 26], ['medium', 38], ['bump', 58], ['medium', 74], ['double', 96], ['bump', 124],
     ['medium', 138], ['bump', 158], ['big', 176], ['bump', 204], ['medium', 218], ['bump', 238]],
    [['cool', 66, '0123'], ['mud', 50, '1', 3], ['mud', 112, '2', 4], ['hay', 86, '0'], ['hay', 130, '3'],
     ['mud', 150, '0', 2], ['hay', 196, '3'], ['cool', 196, '12'], ['mud', 228, '3', 3]]),

  defTrack('canyon', 'Dusty Canyon', 2, 320,
    [['medium', 16], ['bump', 30], ['bump', 36], ['double', 50], ['big', 74], ['medium', 98], ['bump', 112],
     ['double', 126], ['medium', 150], ['big', 170], ['bump', 196], ['bump', 202], ['medium', 216], ['double', 236],
     ['big', 262], ['medium', 290], ['bump', 304]],
    [['bar', 46, '12'], ['cool', 64, '03'], ['mud', 86, '01', 4], ['hay', 90, '3'], ['bar', 108, '0'], ['bar', 108, '3'],
     ['cool', 142, '0123'], ['mud', 160, '23', 3], ['hay', 184, '0'], ['bar', 188, '23'], ['cool', 210, '1'],
     ['mud', 228, '012', 3], ['bar', 252, '1'], ['hay', 254, '3'], ['cool', 280, '23'], ['mud', 298, '1', 3]]),

  defTrack('gulch', 'Thunder Gulch', 3, 380,
    [['bump', 14], ['medium', 22], ['double', 36], ['big', 56], ['bump', 80], ['bump', 86], ['bump', 92],
     ['medium', 104], ['double', 120], ['big', 142], ['medium', 166], ['double', 184], ['bump', 206], ['big', 216],
     ['bump', 240], ['medium', 250], ['double', 268], ['big', 292], ['bump', 316], ['medium', 324], ['double', 342],
     ['bump', 362]],
    [['bar', 32, '03'], ['cool', 50, '12'], ['mud', 66, '0123', 2], ['hay', 72, '1'], ['bar', 74, '2'],
     ['cool', 98, '0'], ['bar', 100, '123'], ['mud', 114, '23', 4], ['bar', 136, '01'], ['cool', 160, '3'],
     ['hay', 160, '0'], ['bar', 178, '12'], ['mud', 198, '01', 4], ['cool', 230, '0123'], ['bar', 236, '0'],
     ['bar', 236, '3'], ['mud', 262, '12', 3], ['hay', 286, '0'], ['bar', 286, '2'], ['cool', 310, '1'],
     ['bar', 336, '03'], ['mud', 356, '0123', 2], ['hay', 368, '3'], ['hay', 370, '0']]),
];

// ---------- compiling ----------
// Turns track source data into fast lookup tables used by the physics.
function compileTrack(src) {
  const tiles = Math.max(60, src.length | 0);
  const len = tiles * TILE;
  const hm = new Float32Array(len + 2);
  for (const r of src.ramps || []) {
    const sh = RAMPS[r.type]; if (!sh) continue;
    const x0 = r.x * TILE;
    for (let i = 0; i < sh.pts.length - 1; i++) {
      const [ax, ah] = sh.pts[i], [bx, bh] = sh.pts[i + 1];
      const p0 = x0 + ax * TILE, p1 = x0 + bx * TILE;
      for (let px = Math.floor(p0); px <= Math.ceil(p1); px++) {
        if (px < 0 || px >= len) continue;
        const f = p1 > p0 ? (px - p0) / (p1 - p0) : 1;
        if (f < 0 || f > 1) continue;
        hm[px] = Math.max(hm[px], ah + (bh - ah) * f);
      }
    }
  }
  hm[len] = hm[0]; hm[len + 1] = hm[1];
  const grid = new Uint8Array(tiles * LANES);
  for (const it of src.items || []) {
    const code = ITEM_KEYS.indexOf(it.t);
    if (code > 0 && it.x >= 0 && it.x < tiles && it.lane >= 0 && it.lane < LANES) grid[it.x * LANES + it.lane] = code;
  }
  return { name: src.name || 'Custom', tiles, len, hm, grid, src };
}

function trackH(T, x) {
  x = ((x % T.len) + T.len) % T.len;
  const i = x | 0, f = x - i;
  return T.hm[i] + (T.hm[i + 1] - T.hm[i]) * f;
}
function trackSlope(T, x) { return (trackH(T, x + 1.5) - trackH(T, x - 1.5)) / 3; }
function itemAt(T, x, lane) {
  if (lane < 0 || lane >= LANES) return 0;
  const tx = Math.floor((((x % T.len) + T.len) % T.len) / TILE);
  return T.grid[tx * LANES + lane];
}

// ---------- custom track storage ----------
const TrackStore = {
  list() { try { return JSON.parse(localStorage.getItem('htm_tracks') || '[]'); } catch (e) { return []; } },
  saveAll(a) { try { localStorage.setItem('htm_tracks', JSON.stringify(a)); } catch (e) {} },
  save(t) { const a = this.list().filter(x => x.id !== t.id); a.push(t); this.saveAll(a); },
  remove(id) { this.saveAll(this.list().filter(x => x.id !== id)); },
  get(id) { return BUILTIN_TRACKS.find(t => t.id === id) || this.list().find(t => t.id === id) || null; },
  all() { return BUILTIN_TRACKS.concat(this.list()); },
};

// Basic validation for track data that arrives over the network or by paste.
function sanitizeTrack(t) {
  if (!t || typeof t !== 'object') return null;
  const length = Math.max(60, Math.min(600, t.length | 0));
  const out = { id: String(t.id || 'custom').slice(0, 40), name: String(t.name || 'Custom Track').slice(0, 24), diff: 0, length, ramps: [], items: [] };
  for (const r of (Array.isArray(t.ramps) ? t.ramps : []).slice(0, 400))
    if (RAMPS[r.type] && r.x >= 0 && r.x < length) out.ramps.push({ type: r.type, x: r.x | 0 });
  for (const it of (Array.isArray(t.items) ? t.items : []).slice(0, 4000))
    if (ITEM_KEYS.indexOf(it.t) > 0 && it.x >= 0 && it.x < length && it.lane >= 0 && it.lane < LANES)
      out.items.push({ t: it.t, x: it.x | 0, lane: it.lane | 0 });
  return out;
}

// =====================================================================
// Track editor. You paint directly onto the real track view: ramps span
// all four lanes; mud, cooling strips, hay and barriers go in one lane.
// =====================================================================
const ED_TOOLS = [
  { id: 'bump', label: 'Bump', kind: 'ramp', col: '#cf8a4c' },
  { id: 'medium', label: 'Medium', kind: 'ramp', col: '#cf8a4c' },
  { id: 'big', label: 'Big Jump', kind: 'ramp', col: '#cf8a4c' },
  { id: 'double', label: 'Double', kind: 'ramp', col: '#cf8a4c' },
  { id: 'mud', label: 'Mud', kind: 'item', col: '#5a3418' },
  { id: 'cool', label: 'Cooling', kind: 'item', col: '#7fe8ff' },
  { id: 'hay', label: 'Hay', kind: 'item', col: '#f4d872' },
  { id: 'bar', label: 'Barrier', kind: 'item', col: '#e8383b' },
  { id: 'erase', label: 'Eraser', kind: 'erase', col: '#f4f2e8' },
];

const RAMP_CODE = { bump: 'b', medium: 'm', big: 'g', double: 'd' };   // short codes for share strings

const Editor = {
  track: null, T: null, scroll: 0, tool: 'bump', hover: null, painting: false, lastCell: null, undo: [], mm: null,

  init() {
    const bar = $('ed-tools');
    ED_TOOLS.forEach((t, i) => {
      const b = document.createElement('button');
      b.innerHTML = '<span style="display:inline-block;width:8px;height:8px;margin-right:5px;background:' + t.col + ';box-shadow:0 0 0 2px #140c1c"></span>' + t.label;
      b.title = t.label + ' (key ' + (i + 1) + ')'; b.dataset.tool = t.id;
      b.onclick = () => this.setTool(t.id);
      bar.appendChild(b);
    });
    const u = document.createElement('button'); u.textContent = 'Undo'; u.onclick = () => this.doUndo(); bar.appendChild(u);
    const help = document.createElement('span'); help.className = 'lbl'; help.id = 'ed-hint'; help.style.marginLeft = '6px'; bar.appendChild(help);
    $('ed-name').addEventListener('input', (e) => { this.track.name = e.target.value.slice(0, 24) || 'My Track'; this.autosave(); });
    $('ed-shorter').onclick = () => this.setLength(this.track.length - 20);
    $('ed-longer').onclick = () => this.setLength(this.track.length + 20);
    $('ed-scroll').addEventListener('input', (e) => { this.scroll = (e.target.value / 1000) * this.maxScroll(); });
    $('ed-new').onclick = () => { if (this.track.ramps.length + this.track.items.length && !confirm('Start a new empty track? Unsaved changes are lost.')) return; this.load(this.blank()); };
    $('ed-save').onclick = () => this.save();
    $('ed-del').onclick = () => this.remove();
    $('ed-load').onchange = (e) => { const v = e.target.value; e.target.value = ''; if (v) this.loadFrom(v); };
    $('ed-share').onclick = () => this.openShare();
    $('ed-test').onclick = () => this.testRide();
    $('ed-back').onclick = () => { this.autosave(); App.go('title'); };
    $('share-close').onclick = () => { App.showScreen('none'); App.setScene('editor'); };
    $('share-copy').onclick = () => { const t = $('share-text'); t.select(); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => ($('share-status').textContent = 'Copied!'), () => { document.execCommand('copy'); $('share-status').textContent = 'Copied!'; }); };
    $('share-import').onclick = () => this.importCode($('share-text').value);
    view.addEventListener('pointerdown', (e) => this.pointer(e, 'down'));
    view.addEventListener('pointermove', (e) => this.pointer(e, 'move'));
    addEventListener('pointerup', () => { this.painting = false; this.lastCell = null; });
    view.addEventListener('pointerleave', () => { this.hover = null; });
    view.addEventListener('wheel', (e) => { if (App.scene !== 'editor') return; e.preventDefault(); this.scrollBy((e.deltaY + e.deltaX) * 0.6); }, { passive: false });
  },
  blank() { return { id: 'c' + Date.now().toString(36), name: 'My Track', diff: 0, length: 200, ramps: [], items: [] }; },
  open(fromTest) {
    if (!this.track || !fromTest) {
      const saved = sanitizeTrack(Store.get('htm_edit', null));
      this.load(saved || this.blank(), true);
    }
    App.race = null; Parts.length = 0;
    App.showScreen('none'); App.setScene('editor');
    this.setTool(this.tool);
    this.refreshUI();
  },
  load(t, keepScroll) {
    this.track = JSON.parse(JSON.stringify(t)); this.track.diff = 0;
    this.T = compileTrack(this.track); this.undo = [];
    if (!keepScroll) this.scroll = 0;
    this.autosave(); this.refreshUI();
  },
  loadFrom(v) {
    if (v.startsWith('b:')) {
      const src = BUILTIN_TRACKS.find((t) => t.id === v.slice(2)); if (!src) return;
      const t = JSON.parse(JSON.stringify(src)); t.id = 'c' + Date.now().toString(36); t.name = ('My ' + src.name).slice(0, 24); this.load(t);
      toast('Copied ' + src.name + ' — edit away!');
    } else { const t = TrackStore.list().find((x) => x.id === v); if (t) { this.load(t); toast('Loaded ' + t.name); } }
  },
  refreshUI() {
    if (!this.track) return;
    $('ed-name').value = this.track.name;
    $('ed-len').textContent = this.track.length;
    const sel = $('ed-load');
    sel.innerHTML = '<option value="">Load…</option>' + TrackStore.list().map((t) => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') +
      BUILTIN_TRACKS.map((t) => '<option value="b:' + t.id + '">Copy of ' + esc(t.name) + '</option>').join('');
    $('ed-del').disabled = !TrackStore.list().some((t) => t.id === this.track.id);
    this.syncSlider();
  },
  setTool(id) {
    this.tool = id;
    $('ed-tools').querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('sel', b.dataset.tool === id));
    const t = ED_TOOLS.find((x) => x.id === id);
    $('ed-hint').textContent = t.kind === 'ramp' ? 'Click the track to place a ramp' : t.kind === 'item' ? 'Click or drag in a lane' : 'Click or drag to erase';
  },
  key(e) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= ED_TOOLS.length) this.setTool(ED_TOOLS[n - 1].id);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.doUndo(); }
    if (e.code === 'Escape') { this.autosave(); App.go('title'); }
  },
  maxScroll() { return Math.max(0, this.track.length * TILE - W + 40); },
  scrollBy(d) { this.scroll = clamp(this.scroll + d, 0, this.maxScroll()); this.syncSlider(); },
  syncSlider() { const m = this.maxScroll(); $('ed-scroll').value = m ? Math.round((this.scroll / m) * 1000) : 0; },
  update(dt) {
    const k = Input.keys;
    if (k & IN.LB) this.scrollBy(-260 * dt);
    if (k & IN.LF) this.scrollBy(260 * dt);
  },
  snapshot() { this.undo.push(JSON.stringify(this.track)); if (this.undo.length > 60) this.undo.shift(); },
  doUndo() {
    const s = this.undo.pop(); if (!s) { toast('Nothing to undo'); return; }
    this.track = JSON.parse(s); this.T = compileTrack(this.track); this.autosave(); this.refreshUI();
  },
  changed() { this.T = compileTrack(this.track); this.autosave(); },
  autosave() { if (this.track) Store.set('htm_edit', this.track); },
  setLength(n) {
    n = clamp(n, 80, 600); if (n === this.track.length) return;
    this.snapshot();
    this.track.length = n;
    const lim = n - RESERVED_END;
    this.track.ramps = this.track.ramps.filter((r) => r.x + RAMPS[r.type].w <= lim);
    this.track.items = this.track.items.filter((it) => it.x < lim);
    this.changed(); this.refreshUI(); this.scrollBy(0);
  },

  // --- pointer: work out which tile/lane is under the finger or mouse ---
  cellAt(gx, gy) {
    const tx = Math.floor((Math.round(this.scroll) + gx) / TILE);
    if (tx < 0 || tx >= this.track.length) return null;
    const h = this.T.hm[tx * TILE + 8] || 0;
    const ly = gy + h - TRACK_TOP;
    const lane = Math.floor(ly / LANE_H);
    const inTrack = gy > TRACK_TOP - h - 40 && gy < TRACK_BOT + 4;
    return { tx, lane: lane >= 0 && lane < LANES ? lane : null, inTrack };
  },
  pointer(e, type) {
    if (App.scene !== 'editor') return;
    const g = toGame(e.clientX, e.clientY);
    if (this.mm && g.y >= this.mm.y && g.y <= this.mm.y + this.mm.h && g.x >= this.mm.x0 - 4 && g.x <= this.mm.x1 + 4) {
      if (type === 'down' || (e.buttons & 1 && this.mmDrag)) {
        this.mmDrag = true;
        this.scroll = clamp(((g.x - this.mm.x0) / (this.mm.x1 - this.mm.x0)) * this.track.length * TILE - W / 2, 0, this.maxScroll()); this.syncSlider();
      }
      this.hover = null; return;
    }
    if (type === 'down') this.mmDrag = false;
    const c = this.cellAt(g.x, g.y);
    this.hover = c && c.inTrack ? c : null;
    if (type === 'down' && this.hover) { e.preventDefault(); this.painting = true; this.lastCell = null; this.apply(this.hover, true); }
    else if (type === 'move' && this.painting && this.hover) {
      const t = ED_TOOLS.find((x) => x.id === this.tool);
      if (t.kind !== 'ramp') this.apply(this.hover, false);
    }
  },
  apply(c, first) {
    const key = c.tx + ':' + c.lane;
    if (!first && key === this.lastCell) return;
    this.lastCell = key;
    const t = ED_TOOLS.find((x) => x.id === this.tool), tr = this.track;
    const reserved = (x0, x1) => x0 < RESERVED_START || x1 > tr.length - RESERVED_END;
    if (t.kind === 'ramp') {
      const w = RAMPS[t.id].w, x0 = c.tx;
      if (reserved(x0, x0 + w)) { toast('Keep the start/finish area clear'); return; }
      if (tr.ramps.some((r) => r.x === x0 && r.type === t.id)) return;
      this.snapshot();
      tr.ramps = tr.ramps.filter((r) => r.x + RAMPS[r.type].w <= x0 || r.x >= x0 + w);
      tr.ramps.push({ type: t.id, x: x0 });
      tr.ramps.sort((a, b) => a.x - b.x);
      Sound.play('pop');
    } else if (t.kind === 'item') {
      if (c.lane == null) return;
      if (reserved(c.tx, c.tx + 1)) { if (first) toast('Keep the start/finish area clear'); return; }
      const cur = tr.items.find((it) => it.x === c.tx && it.lane === c.lane);
      if (cur && cur.t === t.id) return;
      if (first) this.snapshot();
      tr.items = tr.items.filter((it) => !(it.x === c.tx && it.lane === c.lane));
      tr.items.push({ t: t.id, x: c.tx, lane: c.lane });
      Sound.play('click');
    } else {
      const it = c.lane != null && tr.items.find((x) => x.x === c.tx && x.lane === c.lane);
      if (it) { if (first) this.snapshot(); tr.items = tr.items.filter((x) => x !== it); }
      else {
        const r = tr.ramps.find((rr) => c.tx >= rr.x && c.tx < rr.x + RAMPS[rr.type].w);
        if (!r) return;
        if (first) this.snapshot(); tr.ramps = tr.ramps.filter((x) => x !== r);
      }
      Sound.play('bonk');
    }
    this.changed();
  },

  // --- drawing ---
  render(now) {
    const camD = this.scroll + CAM_X;
    renderWorld(this.T, camD, 0, [], now, { overWorld: (camLeft) => this.overlay(camLeft, now) });
    this.drawMinimap();
  },
  overlay(camLeft, now) {
    const T = this.T, tr = this.track;
    const t0 = Math.max(0, Math.floor(camLeft / TILE)), t1 = Math.min(tr.length - 1, Math.ceil((camLeft + W) / TILE));
    for (let t = t0; t <= t1; t++) {
      const sx = t * TILE - camLeft, h = Math.round(T.hm[t * TILE + 8] || 0);
      ctx.fillStyle = t % 10 === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(sx, TRACK_TOP - h, 1, LANES * LANE_H);
      if (t % 10 === 0) text(String(t), sx + 2, TRACK_TOP - h - 8, { c: '#f4f2e8', sh: '#140c1c' });
      if (t < RESERVED_START || t >= tr.length - RESERVED_END) { ctx.fillStyle = 'rgba(232,56,59,0.22)'; ctx.fillRect(sx, TRACK_TOP - h, TILE, LANES * LANE_H); }
    }
    const endX = tr.length * TILE - camLeft;
    if (endX < W + 10) { ctx.fillStyle = 'rgba(20,12,28,0.55)'; ctx.fillRect(endX, TRACK_TOP - 50, W - endX + 40, LANES * LANE_H + 60); text('END OF LAP', endX + 6, TRACK_TOP - 46, { c: '#ffd23f', sh: '#140c1c' }); }
    const c = this.hover; if (!c) return;
    const t = ED_TOOLS.find((x) => x.id === this.tool);
    const blink = (now * 4 | 0) & 1 ? 'rgba(255,210,63,0.55)' : 'rgba(255,255,255,0.45)';
    if (t.kind === 'ramp') {
      const w = RAMPS[t.id].w;
      for (let i = 0; i < w * TILE; i++) {
        const x = c.tx * TILE + i, h = this.ghostH(t.id, i);
        const sx = x - camLeft;
        ctx.fillStyle = blink; ctx.fillRect(sx, TRACK_TOP - h, 1, 1); ctx.fillRect(sx, TRACK_BOT - h, 1, 1);
      }
      text(RAMPS[t.id].label, c.tx * TILE - camLeft, TRACK_BOT + 6, { c: '#ffd23f', sh: '#140c1c' });
    } else if (c.lane != null) {
      const h = Math.round(T.hm[c.tx * TILE + 8] || 0), sx = c.tx * TILE - camLeft, y = TRACK_TOP + c.lane * LANE_H - h;
      ctx.fillStyle = blink;
      ctx.fillRect(sx, y, TILE, 1); ctx.fillRect(sx, y + LANE_H - 1, TILE, 1); ctx.fillRect(sx, y, 1, LANE_H); ctx.fillRect(sx + TILE - 1, y, 1, LANE_H);
    }
  },
  ghostH(type, px) {
    const pts = RAMPS[type].pts, x = px / TILE;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ah] = pts[i], [bx, bh] = pts[i + 1];
      if (x >= ax && x <= bx) return Math.round(ah + (bh - ah) * (bx > ax ? (x - ax) / (bx - ax) : 1));
    }
    return 0;
  },
  drawMinimap() {
    const r = view.getBoundingClientRect(), bb = document.querySelector('.ed-bar.bot').getBoundingClientRect();
    const yb = Math.min(H, ((bb.top - r.top) / r.height) * H);
    const x0 = 8, x1 = W - 8, w = x1 - x0, hgt = 20, y = Math.round(yb - hgt - 4);
    this.mm = { x0, x1, y, h: hgt };
    const tr = this.track, len = tr.length * TILE;
    ctx.fillStyle = 'rgba(20,12,28,0.85)'; ctx.fillRect(x0 - 3, y - 2, w + 6, hgt + 4);
    for (let i = 0; i < w; i++) {
      const a = Math.floor((i / w) * len), b2 = Math.floor(((i + 1) / w) * len);
      let mx = 0; for (let p = a; p < b2; p += 2) mx = Math.max(mx, this.T.hm[p]);
      if (mx > 0.5) { ctx.fillStyle = '#b8743c'; const hh = Math.max(1, Math.round((mx / 50) * 7)); ctx.fillRect(x0 + i, y + 7 - hh, 1, hh); }
    }
    ctx.fillStyle = '#4a3422'; ctx.fillRect(x0, y + 8, w, 12);
    const cols = { mud: '#8a5a32', cool: '#7fe8ff', hay: '#f4d872', bar: '#e8383b' };
    for (const it of tr.items) { ctx.fillStyle = cols[it.t]; ctx.fillRect(x0 + Math.floor(((it.x * TILE) / len) * w), y + 8 + it.lane * 3, Math.max(1, Math.round((TILE / len) * w)), 3); }
    const vx = x0 + (this.scroll / len) * w, vw = (W / len) * w;
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(Math.round(vx), y - 1, Math.round(vw), 1); ctx.fillRect(Math.round(vx), y + hgt, Math.round(vw), 1);
    ctx.fillRect(Math.round(vx), y - 1, 1, hgt + 2); ctx.fillRect(Math.round(vx + vw), y - 1, 1, hgt + 2);
  },

  // --- saving, sharing, testing ---
  save() {
    const t = sanitizeTrack(this.track); t.id = this.track.id; t.diff = 0;
    if (!t.ramps.length && !t.items.length) { toast('Add some ramps first!'); return; }
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
    const code = 'HTM1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ n: t.name, l: t.length, r: t.ramps.map((r) => [RAMP_CODE[r.type], r.x]), i: t.items.map((it) => [it.t[0], it.x, it.lane]) }))));
    $('share-text').value = code; $('share-status').textContent = '';
    App.showScreen('share'); App.setScene('menu-editor');
  },
  importCode(s) {
    try {
      s = String(s).trim();
      const d = JSON.parse(decodeURIComponent(escape(atob(s.replace(/^HTM1:/, '')))));
      const rt = Object.fromEntries(Object.entries(RAMP_CODE).map(([k, v]) => [v, k])), it = { m: 'mud', c: 'cool', h: 'hay', b: 'bar' };
      const t = sanitizeTrack({ id: 'c' + Date.now().toString(36), name: d.n, length: d.l,
        ramps: (d.r || []).map(([k, x]) => ({ type: RAMPS[k] ? k : rt[k], x })), items: (d.i || []).map(([k, x, lane]) => ({ t: ITEM_KEYS.includes(k) ? k : it[k], x, lane })) });
      if (!t) throw new Error('bad');
      this.load(t); App.showScreen('none'); App.setScene('editor'); toast('Imported "' + t.name + '" — press Save to keep it');
    } catch (e) { $('share-status').textContent = "That code didn't work. Make sure you copied all of it."; }
  },
  testRide() {
    const t = sanitizeTrack(this.track); t.id = this.track.id;
    const me = { id: 'me', name: Profile.name, color: Profile.color, rider: Profile.rider };
    App.startRace(new Race({ mode: 'test', track: t, laps: 1, players: [me], localId: 'me', inputFor: (b) => (b.id === 'me' ? localInput() : null) }));
  },
};
