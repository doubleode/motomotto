'use strict';
/* =====================================================================
   Hat Trick Moto — hats.js
   Pixel-art helpers (shared by the whole game) and the hat system.
   ===================================================================== */

// Shared palette. Each letter in a sprite string maps to a colour.
const PAL = {
  k: '#140c1c', w: '#f4f2e8', l: '#c8c8d0', L: '#8a8a9a', D: '#33334a', n: '#4a4a62', s: '#24202e',
  g: '#46c84a', G: '#2a8a30', h: '#a4f05a', c: '#6fe3ff', C: 'rgba(170,230,255,0.38)',
  y: '#ffd23f', Y: '#c99a1e', o: '#ff8a2a', O: '#c25a14', r: '#e8383b', R: '#9a1e24',
  b: '#9c5a2c', B: '#6a3a1c', t: '#e8c890', T: '#b89058', u: '#3b78e8', U: '#22448e',
  p: '#ff8fc8', m: '#d23cb4', v: '#8a3ce0', V: '#5a2496', e: '#ffe9a8',
};

const Pix = {
  // Build a canvas from rows of palette letters. '.' is transparent.
  // A 1px dark outline is added automatically around the shape.
  build(rows, map, outline = true) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const pad = outline ? 1 : 0;
    const c = document.createElement('canvas');
    c.width = w + pad * 2; c.height = h + pad * 2;
    const x = c.getContext('2d');
    const solid = new Uint8Array((w + 2) * (h + 2));
    const col = (ch) => (map && map[ch]) || PAL[ch];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ch = rows[j][i];
      if (ch && ch !== '.' && ch !== ' ' && col(ch)) solid[(j + 1) * (w + 2) + i + 1] = 1;
    }
    if (outline) {
      x.fillStyle = PAL.k;
      for (let j = 0; j < h + 2; j++) for (let i = 0; i < w + 2; i++) {
        if (solid[j * (w + 2) + i]) continue;
        const n = (a, b) => a >= 0 && b >= 0 && a < w + 2 && b < h + 2 && solid[b * (w + 2) + a];
        if (n(i - 1, j) || n(i + 1, j) || n(i, j - 1) || n(i, j + 1)) x.fillRect(i - 1 + pad, j - 1 + pad, 1, 1);
      }
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ch = rows[j][i];
      if (!ch || ch === '.' || ch === ' ') continue;
      const cc = col(ch); if (!cc) continue;
      x.fillStyle = cc; x.fillRect(i + pad, j + pad, 1, 1);
    }
    return c;
  },
  shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  },
};

// ---------------------------------------------------------------------
// Hat sprites. Fill colours only — the outline is added automatically.
// `frames` gives simple animation (spinning propeller, flickering candles).
// ---------------------------------------------------------------------
const HAT_DEFS = [
  { id: 'cowboy', name: 'Cowboy Hat', rows: ['...bbbbbb...', '...bbBBbb...', '...bbbbbb...', '...RRRRRR...', 'b..bbbbbb..b', 'bb.bbbbbb.bb', '.bbbbbbbbbb.'] },
  { id: 'tophat', name: 'Top Hat', rows: ['..DDDDl..', '..DDDDl..', '..DDDDl..', '..DDDDl..', '..rrrrr..', '..DDDDD..', 'DDDDDDDDD'] },
  { id: 'propeller', name: 'Propeller Beanie', rate: 14, frames: [
    ['yyyyyLuuuuu', '.....L.....', '....ryu....', '...rryuu...', '..rrryuuu..', '.wwwwwwwww.'],
    ['...yyLuu...', '.....L.....', '....ryu....', '...rryuu...', '..rrryuuu..', '.wwwwwwwww.'],
    ['uuuuuLyyyyy', '.....L.....', '....ryu....', '...rryuu...', '..rrryuuu..', '.wwwwwwwww.'],
    ['...uuLyy...', '.....L.....', '....ryu....', '...rryuu...', '..rrryuuu..', '.wwwwwwwww.']] },
  { id: 'chef', name: 'Chef Hat', rows: ['.ww.ww.ww.', 'wwwwwwwwww', 'wwwwwwwwlw', '.wwwwwwlw.', '..wwwwww..', '..wwwwww..', '..llllll..'] },
  { id: 'pirate', name: 'Pirate Hat', rows: ['....DDD....', '..DDDDDDD..', '.DDDDwDDDD.', 'DDDDwkwDDDD', 'DDDDDwDDDDD', 'yDDDDDDDDDy', '.yyyyyyyyy.'] },
  { id: 'viking', name: 'Viking Helmet', rows: ['t.........t', 'tt.......tt', '.tt.LLL.tt.', '..tLLlLLt..', '..LLLlLLL..', '..LLLLLLL..', '..YYYYYYY..'] },
  { id: 'cone', name: 'Traffic Cone', rows: ['....o....', '...ooo...', '...www...', '..ooooo..', '..wwwww..', '.ooooooo.', 'ooooooooo'] },
  { id: 'party', name: 'Party Hat', rows: ['...w...', '..www..', '...m...', '..mym..', '..mmm..', '.mmmym.', '.ymmmm.', 'mmmmmym'] },
  { id: 'crown', name: 'Crown', rate: 3, frames: [
    ['y..y..y', 'y.yyy.y', 'yyyyyyy', 'yryuyry', 'YYYYYYY'],
    ['e..y..y', 'y.yyy.y', 'yyyyyyy', 'yryuyry', 'YYYYYYY']] },
  { id: 'wizard', name: 'Wizard Hat', rows: ['....v....', '....v....', '...vvv...', '...vyv...', '..vvvvv..', '..vvvyv..', '.vyvvvvv.', 'vvvvvvvvv', 'VVVVVVVVV'] },
  { id: 'cap', name: 'Baseball Cap', rows: ['..uuuu....', '.uuuuuu...', '.uuwuuu...', '.uuuuuuuuu'] },
  { id: 'sombrero', name: 'Sombrero', rows: ['.....yyy.....', '....yyyyy....', '....yYYYy....', '....rgrgr....', 'y..yyyyyyy..y', 'yyyyyyyyyyyyy', '.YYYYYYYYYYY.'] },
  { id: 'bunny', name: 'Bunny Ears', rows: ['.w...w.', 'wpw.wpw', 'wpw.wpw', 'wpw.wpw', 'wpw.wpw', '.w...w.', '.lllll.'] },
  { id: 'fishbowl', name: 'Fishbowl', rate: 2, frames: [
    ['..ccccc..', '.cCCCCCc.', 'cCCCCCwCc', 'cuuuuuuuc', 'cuoooouuc', 'cuuuuuuuc', '.ccccccc.'],
    ['..ccccc..', '.cCCCCCc.', 'cCCCCCwCc', 'cuuuuuuuc', 'cuuoooouc', 'cuuuuuuuc', '.ccccccc.']] },
  { id: 'cake', name: 'Birthday Cake', rate: 6, frames: [
    ['..y..y..', '..r..u..', 'pwpwpwpw', 'pppppppp', 'tttttttt', 'wwwwwwww', 'tttttttt'],
    ['..e..o..', '..r..u..', 'pwpwpwpw', 'pppppppp', 'tttttttt', 'wwwwwwww', 'tttttttt']] },
  { id: 'umbrella', name: 'Tiny Umbrella', rows: ['....rrr....', '..rrwwwrr..', '.rrwwrwwrr.', 'rwwrrrrrwwr', '.....B.....', '.....B.....', '.....B.....', '...lllll...'] },
  { id: 'fez', name: 'Fez', rows: ['..rrrr..', '..rrrrY.', '.rrrrrY.', '.rrrrrY.', '.RRRRR..'] },
  { id: 'mohawk', name: 'Mohawk', rows: ['h.h.h.h', 'hhhhhhh', 'hhhhhhh', '.hhhhh.'] },
  { id: 'gradcap', name: 'Graduation Cap', rows: ['.DDDDDDDDD.', 'DDDDDDDDDDD', '...DDDDDy..', '...DDDDDy..', '...DDDDD.y.'] },
  { id: 'duck', name: 'Rubber Duck', rows: ['...yyy...', '..yyyky..', '..yyyyyoo', 'y..yyyy..', 'yyyyyyyy.', 'yyyyYyyy.', '.yyyyyy..'] },
  { id: 'antlers', name: 'Antlers', rows: ['b.b...b.b', '.bb...bb.', '..b...b..', '..bb.bb..', '...lll...'] },
  { id: 'pineapple', name: 'Pineapple', rows: ['..g.g..', '...gg..', '..ggg..', '.yYyYy.', '.YyYyY.', '.yYyYy.', '..yYy..'] },
  { id: 'halo', name: 'Halo', rate: 3, frames: [
    ['.yyyyy.', 'y.....y', '.yyyyy.', '.......', '.......'],
    ['.yyyye.', 'y.....y', '.yyyyy.', '.......', '.......']] },
  { id: 'flowerpot', name: 'Flower Pot', rows: ['..ppp..', '.ppypp.', '..ppp..', '...g...', '.g.g...', '..gg...', 'ooooooo', '.ooooo.'] },
];

const Hats = {
  list: HAT_DEFS,
  byId: Object.fromEntries(HAT_DEFS.map((h) => [h.id, h])),
  MAX: 5,
  _spr: {},
  valid(id) { return !!this.byId[id]; },
  clean(ids) { return (Array.isArray(ids) ? ids : []).filter((id) => this.valid(id)).slice(0, this.MAX); },
  // Built sprite frames for a hat: { frames:[canvas], h: unpadded height, rate }
  spr(id) {
    if (this._spr[id]) return this._spr[id];
    const d = this.byId[id]; if (!d) return null;
    const fr = (d.frames || [d.rows]).map((rows) => Pix.build(rows));
    return (this._spr[id] = { frames: fr, h: (d.frames || [d.rows])[0].length, rate: d.rate || 0 });
  },
  frame(id, now) { const s = this.spr(id); return s.frames.length > 1 ? s.frames[Math.floor(now * s.rate) % s.frames.length] : s.frames[0]; },
  randomStack(n) {
    n = n == null ? 2 + Math.floor(Math.random() * 4) : n;
    const out = []; for (let i = 0; i < Math.min(n, this.MAX); i++) out.push(this.list[Math.floor(Math.random() * this.list.length)].id);
    return out;
  },

  // ----- wobble: each hat leans and bounces on a little spring -----
  newWobble() { return { x: new Float32Array(5), vx: new Float32Array(5), y: new Float32Array(5), vy: new Float32Array(5), pv: 0 }; },
  stepWobble(w, dt, ay, v, air, n) {
    if (dt <= 0) return;
    const ax = (v - w.pv) / dt; w.pv = v;
    const steps = Math.ceil(dt / (1 / 120)), h = dt / steps;
    for (let s = 0; s < steps; s++) for (let i = 0; i < n; i++) {
      const k = 140 - i * 14, c = 5 + i * 0.5;
      const fx = -k * w.x[i] - c * w.vx[i] - clampH(ax, -400, 400) * 0.55;
      w.vx[i] += fx * h; w.x[i] += w.vx[i] * h;
      const fy = -k * w.y[i] - c * w.vy[i] + clampH(ay, -900, 1400) * 0.22;
      w.vy[i] += fy * h; w.y[i] += w.vy[i] * h;
      w.x[i] = clampH(w.x[i], -4, 4); w.y[i] = clampH(w.y[i], -3, 2.5);
    }
  },
  kick(w, amt) {
    amt = clampH(amt, 0, 3);
    for (let i = 0; i < 5; i++) { w.vx[i] += (Math.random() - 0.5) * 40 * amt * (1 + i * 0.4); w.vy[i] += 22 * amt; }
  },
  // Draw a stack whose bottom hat sits at (x, y) (x = centre, y = bottom row).
  drawStack(ctx, ids, x, y, w, now, still) {
    let cx = 0, cy = y;
    for (let i = 0; i < ids.length; i++) {
      const s = this.spr(ids[i]); if (!s) continue;
      const img = this.frame(ids[i], now);
      let tilt = 0;
      if (w && !still) { cx += w.x[i]; cy += w.y[i]; tilt = clampH(w.x[i] * 0.09, -0.35, 0.35); }
      const dx = Math.round(x + cx), dy = Math.round(cy);
      if (Math.abs(tilt) > 0.07) {
        ctx.save(); ctx.translate(dx, dy); ctx.rotate(tilt);
        ctx.drawImage(img, -(img.width >> 1), -img.height + 1); ctx.restore();
      } else ctx.drawImage(img, dx - (img.width >> 1), dy - img.height + 1);
      cy -= s.h;
    }
  },
  stackHeight(ids) { let h = 0; for (const id of ids) { const s = this.spr(id); if (s) h += s.h; } return h; },

  // ----- crashing: hats fly off, bounce, then hop back on -----
  launch(rs, vb) {
    if (!vb.hats.length) return;
    let h = vb.y + 24;
    const hats = vb.hats.map((id) => {
      const s = this.spr(id), o = { id, x: vb.dist + 2, lp: vb.lp, h, vx: 25 + Math.random() * 110, vh: 80 + Math.random() * 120,
        vl: (Math.random() - 0.5) * 1.4, rot: 0, vr: (Math.random() - 0.5) * 18, rest: false };
      h += s ? s.h : 6; return o;
    });
    rs.fly = { hats, phase: 'fly', t: 0 };
  },
  recall(rs, vb) {
    if (!rs.fly) return;
    rs.fly.phase = 'back'; rs.fly.t = 0;
    for (const o of rs.fly.hats) { o.sx = o.x; o.sh = o.h; o.slp = o.lp; o.srot = o.rot; }
  },
  stepFlying(rs, vb, T, dt) {
    const F = rs.fly; F.t += dt;
    if (F.phase === 'fly') {
      for (const o of F.hats) {
        if (o.rest) continue;
        o.vh -= 300 * dt; o.x += o.vx * dt; o.h += o.vh * dt; o.rot += o.vr * dt;
        o.lp = clampH(o.lp + o.vl * dt, -0.4, 3.4);
        const g = trackH(T, o.x);
        if (o.h <= g) {
          o.h = g;
          if (o.vh < -50) { o.vh = -o.vh * 0.45; o.vx *= 0.6; o.vr *= 0.6; o.vl *= 0.5; if (typeof Sound !== 'undefined' && vb.id === App.race?.localId) Sound.play('bonk', 0.7); }
          else { o.vh = 0; o.vx *= 0.8; o.vl = 0; if (Math.abs(o.vx) < 5) { o.rest = true; o.rot = Math.round(o.rot / (Math.PI / 2)) * (Math.PI / 2); } }
        }
      }
      if (vb.state !== 'crash' && F.t > 0.2) this.recall(rs, vb);   // safety: rider got back on (e.g. missed event)
    } else {
      const k = Math.min(1, F.t / 0.35);
      let h = vb.y + 24;
      for (const o of F.hats) {
        o.x = o.sx + (vb.dist - o.sx) * k; o.lp = o.slp + (vb.lp - o.slp) * k;
        o.h = o.sh + (h - o.sh) * k + Math.sin(k * Math.PI) * 26; o.rot = o.srot * (1 - k);
        const s = this.spr(o.id); h += s ? s.h : 6;
      }
      if (k >= 1) rs.fly = null;
    }
  },
  drawFlying(rs, vb, T, camD) {
    const now = performance.now() / 1000;
    for (const o of rs.fly.hats) {
      const sx = Math.round(CAM_X + wrapD(o.x - camD, T.len)); if (sx < -20 || sx > W + 20) continue;
      const sy = Math.round(laneY(o.lp) - o.h);
      const img = this.frame(o.id, now);
      ctx.save(); ctx.translate(sx, sy - (img.height >> 1)); ctx.rotate(-o.rot);
      ctx.drawImage(img, -(img.width >> 1), -(img.height >> 1)); ctx.restore();
    }
  },

  // ----- UI helpers -----
  icon(id, size = 18) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const x = c.getContext('2d'); const img = this.frame(id, 0);
    x.drawImage(img, (size - img.width) >> 1, size - img.height - Math.max(0, (size - img.height) >> 1));
    return c;
  },
  stackCanvas(ids) {
    const c = document.createElement('canvas');
    const h = Math.max(8, this.stackHeight(ids) + 3); c.width = 18; c.height = h;
    this.drawStack(c.getContext('2d'), ids, 9, h - 2, null, 0, true);
    return c;
  },

  // ----- the wardrobe screen -----
  initUI() {
    Profile.hats = this.clean(Profile.hats);
    const grid = $('wr-hats');
    for (const d of this.list) {
      const b = document.createElement('button'); b.className = 'hatbtn'; b.title = d.name; b.dataset.id = d.id;
      b.appendChild(this.icon(d.id)); const sp = document.createElement('span'); sp.textContent = d.name; b.appendChild(sp);
      b.onclick = () => { if (Profile.hats.length >= this.MAX) { toast('5 hats max — remove one first'); return; } Profile.hats.push(d.id); Sound.play('pop'); this.kick(this.prevWob, 1.5); this.changed(); };
      grid.appendChild(b);
    }
    const sw = $('wr-colors');
    COLORS.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'swatch'; b.style.background = c.c; b.title = c.name;
      b.onclick = () => { Profile.color = i; Sound.play('click'); this.changed(); }; sw.appendChild(b);
    });
    $('wr-name').addEventListener('input', (e) => { const v = e.target.value.replace(/[^\w .\-!?']/g, '').slice(0, 12); Profile.name = v.trim() || 'Rider'; saveProfile(); });
    $('wr-name').addEventListener('change', () => this.changed(true));
    $('wr-random').onclick = () => { Profile.hats = this.randomStack(); Profile.color = Math.floor(Math.random() * COLORS.length); Sound.play('pop'); this.kick(this.prevWob, 2); this.changed(); };
    $('wr-clear').onclick = () => { Profile.hats = []; Sound.play('click'); this.changed(); };
    $('wr-done').onclick = () => { Sound.play('click'); this.close(); };
    this.prevWob = this.newWobble();
  },
  openWardrobe(returnTo) {
    this.returnTo = returnTo || 'title';
    $('wr-name').value = Profile.name;
    this.renderLists();
    if (!this.previewing) { this.previewing = true; requestAnimationFrame((t) => this.preview(t)); }
  },
  close() {
    Profile.name = (Profile.name || 'Rider').trim().slice(0, 12) || 'Rider';
    saveProfile();
    if (typeof Net !== 'undefined' && Net.active && Net.sendProfile) Net.sendProfile();
    App.go(this.returnTo || 'title');
  },
  changed(nameOnly) { saveProfile(); if (!nameOnly) this.renderLists(); if (typeof Net !== 'undefined' && Net.active && Net.sendProfile) Net.sendProfile(); },
  renderLists() {
    $('wr-colors').querySelectorAll('.swatch').forEach((b, i) => b.classList.toggle('sel', i === Profile.color));
    const counts = {}; Profile.hats.forEach((id) => (counts[id] = (counts[id] || 0) + 1));
    $('wr-hats').querySelectorAll('.hatbtn').forEach((b) => b.classList.toggle('on', !!counts[b.dataset.id]));
    $('wr-count').textContent = Profile.hats.length + '/' + this.MAX;
    const st = $('wr-stack'); st.innerHTML = '';
    if (!Profile.hats.length) { const p = document.createElement('div'); p.className = 'small'; p.textContent = 'No hats yet. Tap a hat to add it!'; st.appendChild(p); }
    Profile.hats.forEach((id, i) => {
      const row = document.createElement('div'); row.className = 'stackitem';
      row.appendChild(this.icon(id, 16));
      const nm = document.createElement('span'); nm.className = 'grow'; nm.textContent = (i === Profile.hats.length - 1 ? 'Top: ' : i === 0 ? 'Bottom: ' : '') + this.byId[id].name; row.appendChild(nm);
      const mkb = (label, title, fn, dis) => { const b = document.createElement('button'); b.textContent = label; b.title = title; b.disabled = !!dis; b.onclick = () => { Sound.play('click'); fn(); this.changed(); }; row.appendChild(b); };
      const swap = (a, b) => { const t = Profile.hats[a]; Profile.hats[a] = Profile.hats[b]; Profile.hats[b] = t; };
      mkb('▲', 'Move up', () => swap(i, i + 1), i === Profile.hats.length - 1);
      mkb('▼', 'Move down', () => swap(i, i - 1), i === 0);
      mkb('X', 'Remove', () => Profile.hats.splice(i, 1));
      st.appendChild(row);
    });
    if (typeof App !== 'undefined') App.refreshTitle();
  },
  preview(t) {
    if (App.screen !== 'wardrobe') { this.previewing = false; return; }
    requestAnimationFrame((tt) => this.preview(tt));
    const now = t / 1000, dt = this.lastPrev ? Math.min(0.05, now - this.lastPrev) : 0.016; this.lastPrev = now;
    const c = $('wr-preview'), x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, c.width, c.height);
    // gentle idle bounce so you can see the wobble
    const ph = (now % 2.2) / 2.2, bounce = ph < 0.25 ? Math.sin((ph / 0.25) * Math.PI) * 5 : 0;
    const ay = ph < 0.25 ? -Math.sin((ph / 0.25) * Math.PI) * 600 : 0;
    this.stepWobble(this.prevWob, dt, ay, 0, false, Profile.hats.length);
    if (Math.abs(ph - 0.25) < dt / 2.2) this.kick(this.prevWob, 0.9);
    const art = bikeArt(Profile.color);
    const bx = 11, by = c.height - 18 - Math.round(bounce);
    x.drawImage(art.wheel[0], bx + 1, by + 5); x.drawImage(art.wheel[0], bx + 16, by + 5);
    x.drawImage(art.body, bx - 1, by - 1);
    x.drawImage(art.rider, bx - 1, by + RIDER_OY - 1);
    this.drawStack(x, Profile.hats, bx + HAT_X, by + HAT_Y, this.prevWob, now);
  },
};
function clampH(v, a, b) { return v < a ? a : v > b ? b : v; }
