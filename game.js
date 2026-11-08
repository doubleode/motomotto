'use strict';
/* =====================================================================
   Hat Trick Moto — game.js
   Canvas + pixel font, input, sound, racing physics, computer riders,
   rendering, HUD, menus and the main loop. Loaded last.
   ===================================================================== */

// ---------- helpers ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const $ = (id) => document.getElementById(id);
const wrapD = (d, L) => mod(d + L / 2, L) - L / 2;   // shortest distance around a looping track
const Store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return n >>> 0; }
function fmtTime(t) {
  if (t == null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}
const ordinal = (n) => n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- constants ----------
const H = 270;
let W = 480;                       // internal width adapts to the screen shape
const LANE_H = 22, TRACK_TOP = 140, TRACK_BOT = TRACK_TOP + LANES * LANE_H;
const CAM_X = 150;                 // where your bike sits on screen
const STEP = 1 / 60;               // fixed physics step
const IN = { THR: 1, TUR: 2, UP: 4, DN: 8, LB: 16, LF: 32 };
const PHYS = {
  g: 300, vNorm: 150, vTurbo: 212, accN: 120, accT: 165, coast: 55, mudMax: 58, laneSpeed: 7,
  leanRate: 2.6, cleanTol: 0.55, perfectTol: 0.2, heatUp: 24, coolThr: 6, coolIdle: 15,
  stallTime: 3, crashTime: 2,
};
const laneY = (lp) => TRACK_TOP + LANE_H * (lp + 0.5);
const COLORS = [
  { name: 'Red', c: '#e8383b' }, { name: 'Blue', c: '#3b78e8' }, { name: 'Green', c: '#3fbf4a' }, { name: 'Yellow', c: '#f2c230' },
  { name: 'Orange', c: '#f07a2a' }, { name: 'Purple', c: '#9b4be8' }, { name: 'Pink', c: '#f25fae' }, { name: 'Teal', c: '#2ec4c4' },
];
const BOT_NAMES = ['Dusty', 'Moxie', 'Gravel Gus', 'Rocket Rae', 'Mudslinger', 'Pip', 'Loopy Lou', 'Captain Revs', 'Nitro Nell', 'Bumpy', 'Skidmore', 'Clutch'];
const HAS_HATS = () => typeof Hats !== 'undefined' && !!Hats.list;

// ---------- saved profile & settings ----------
const Profile = (() => {
  const p = Store.get('htm_profile', null) || {};
  return {
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 12) : 'Rider' + (10 + Math.floor(Math.random() * 90)),
    color: p.color >= 0 && p.color < COLORS.length ? p.color | 0 : Math.floor(Math.random() * COLORS.length),
    hats: Array.isArray(p.hats) ? p.hats.slice(0, 5) : [],
  };
})();
function saveProfile() { Store.set('htm_profile', Profile); }
const Settings = Object.assign({ track: 'meadow', laps: 3, mute: false }, Store.get('htm_settings', {}));
function saveSettings() { Store.set('htm_settings', Settings); }

// ---------- canvas ----------
const view = $('game'), vctx = view.getContext('2d');
const buf = document.createElement('canvas');
const ctx = buf.getContext('2d');
let K = 1, SCALE = 1;
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function resize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  W = Math.round(clamp((H * ww) / wh, 400, 640));
  buf.width = W; buf.height = H;
  SCALE = Math.min(ww / W, wh / H);
  K = clamp(Math.ceil(SCALE * (window.devicePixelRatio || 1)), 1, 4);
  view.width = W * K; view.height = H * K;
  view.style.width = Math.floor(W * SCALE) + 'px';
  view.style.height = Math.floor(H * SCALE) + 'px';
  ctx.imageSmoothingEnabled = false;
}
function present() {
  vctx.imageSmoothingEnabled = false;
  vctx.drawImage(buf, 0, 0, W * K, H * K);
}
// screen pixel -> internal game pixel
function toGame(clientX, clientY) {
  const r = view.getBoundingClientRect();
  return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
}

// ---------- pixel font (3x5) ----------
const FONT = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 6, 4, 6, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 5, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6],
  6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  ' ': [0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], ':': [0, 2, 0, 2, 0], '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2],
  '-': [0, 0, 7, 0, 0], '+': [0, 2, 7, 2, 0], '/': [1, 1, 2, 4, 4], "'": [2, 2, 0, 0, 0], '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4],
  '#': [5, 7, 5, 7, 5], '%': [5, 1, 2, 4, 5], '=': [0, 7, 0, 7, 0], '>': [4, 2, 1, 2, 4], '<': [1, 2, 4, 2, 1], '_': [0, 0, 0, 0, 7], '*': [0, 5, 2, 5, 0],
};
function drawStr(str, x, y, s, col) {
  ctx.fillStyle = col;
  for (let i = 0; i < str.length; i++) {
    const g = FONT[str[i]] || FONT['?'];
    for (let r = 0; r < 5; r++) {
      const bits = g[r]; if (!bits) continue;
      for (let c = 0; c < 3; c++) if (bits & (4 >> c)) ctx.fillRect(x + (i * 4 + c) * s, y + r * s, s, s);
    }
  }
}
function text(str, x, y, o = {}) {
  const s = o.s || 1;
  str = String(str).toUpperCase();
  const w = str.length * 4 * s - s;
  let sx = o.a === 'c' ? x - w / 2 : o.a === 'r' ? x - w : x;
  sx = Math.round(sx); y = Math.round(y);
  if (o.sh) drawStr(str, sx + s, y + s, s, o.sh);
  drawStr(str, sx, y, s, o.c || '#fff');
  return w;
}

// ---------- input ----------
const Input = { keys: 0, touch: 0, up: 0, dn: 0 };
const KEYMAP = { KeyZ: IN.THR, Space: IN.THR, KeyX: IN.TUR, ArrowUp: IN.UP, ArrowDown: IN.DN, ArrowLeft: IN.LB, ArrowRight: IN.LF };
const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'); };
addEventListener('keydown', (e) => {
  Sound.init();
  if (typing(e)) { if (e.code === 'Escape') e.target.blur(); return; }
  const b = KEYMAP[e.code];
  if (b && (App.scene === 'race' || App.scene === 'editor')) {
    e.preventDefault();
    if (!e.repeat) { if (b === IN.UP) Input.up++; if (b === IN.DN) Input.dn++; }
    Input.keys |= b;
  }
  if (e.code === 'Escape') App.onEscape();
  if (App.scene === 'editor' && typeof Editor !== 'undefined') Editor.key(e);
});
addEventListener('keyup', (e) => { const b = KEYMAP[e.code]; if (b) Input.keys &= ~b; });
addEventListener('blur', () => { Input.keys = 0; Input.touch = 0; Touch.ptrs.clear(); });
function localInput() { return { bits: Input.keys | Input.touch, up: Input.up, dn: Input.dn }; }

const Touch = {
  ptrs: new Map(),
  init() {
    const root = $('touch');
    const btns = [...root.querySelectorAll('.tb[data-b]')];
    const hit = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tb = el && el.closest ? el.closest('#touch .tb[data-b]') : null;
      return tb ? +tb.dataset.b : 0;
    };
    const update = () => {
      let bits = 0;
      for (const v of this.ptrs.values()) bits |= v;
      const prev = Input.touch;
      if (bits & IN.UP && !(prev & IN.UP)) Input.up++;
      if (bits & IN.DN && !(prev & IN.DN)) Input.dn++;
      Input.touch = bits;
      for (const el of btns) el.classList.toggle('down', !!(bits & +el.dataset.b));
    };
    addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') { App.setTouch(true); }
      if (App.scene !== 'race' || !App.touchOn) return;
      this.ptrs.set(e.pointerId, hit(e)); update();
    });
    addEventListener('pointermove', (e) => { if (this.ptrs.has(e.pointerId)) { this.ptrs.set(e.pointerId, hit(e)); update(); } });
    const up = (e) => { if (this.ptrs.delete(e.pointerId)) update(); };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    $('tb-menu').addEventListener('click', () => App.onEscape());
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  },
};

// ---------- sound (Web Audio, all synthesized) ----------
const Sound = {
  ac: null, out: null, eng: null, noiseBuf: null,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      this.ac = new AC();
      this.out = this.ac.createGain(); this.out.gain.value = Settings.mute ? 0 : 0.55; this.out.connect(this.ac.destination);
      const n = this.ac.sampleRate; this.noiseBuf = this.ac.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ac = null; }
  },
  setMute(m) { Settings.mute = m; saveSettings(); if (this.out) this.out.gain.value = m ? 0 : 0.55; },
  tone(f, dur, o = {}) {
    const ac = this.ac; if (!ac) return;
    const t = ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square'; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.out); osc.start(t); osc.stop(t + dur + 0.05);
  },
  noise(dur, o = {}) {
    const ac = this.ac; if (!ac) return;
    const t = ac.currentTime + (o.delay || 0);
    const src = ac.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter(); f.type = o.ftype || 'lowpass'; f.frequency.setValueAtTime(o.f || 2000, t);
    if (o.fto) f.frequency.exponentialRampToValueAtTime(o.fto, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(o.vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },
  play(name, vol = 1) {
    if (!this.ac || vol <= 0) return;
    switch (name) {
      case 'count': this.tone(440, 0.18, { vol: 0.18 * vol }); break;
      case 'go': this.tone(880, 0.5, { vol: 0.2 * vol }); break;
      case 'crash': this.noise(0.55, { vol: 0.45 * vol, f: 2500, fto: 180 }); this.tone(130, 0.35, { type: 'triangle', vol: 0.35 * vol, to: 40 }); break;
      case 'land': this.tone(95, 0.12, { type: 'sine', vol: 0.45 * vol, to: 45 }); this.noise(0.12, { vol: 0.15 * vol, f: 900 }); break;
      case 'perfect': this.tone(660, 0.08, { vol: 0.13 * vol }); this.tone(990, 0.14, { vol: 0.13 * vol, delay: 0.07 }); break;
      case 'overheat': this.noise(0.9, { vol: 0.3 * vol, f: 4000, fto: 500, ftype: 'bandpass' }); this.tone(320, 0.7, { type: 'sawtooth', vol: 0.12 * vol, to: 70 }); break;
      case 'cool': this.tone(520, 0.16, { type: 'triangle', vol: 0.18 * vol, to: 1500 }); break;
      case 'lap': this.tone(660, 0.1, { vol: 0.15 * vol }); this.tone(880, 0.18, { vol: 0.15 * vol, delay: 0.1 }); break;
      case 'finish': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.4 : 0.12, { vol: 0.16 * vol, delay: i * 0.11 })); break;
      case 'pop': this.tone(900, 0.06, { vol: 0.1 * vol, to: 1700 }); break;
      case 'bonk': this.tone(320, 0.05, { vol: 0.06 * vol, to: 200 }); break;
      case 'click': this.tone(700, 0.04, { vol: 0.06 * vol }); break;
    }
  },
  engine(v, turbo, on) {
    const ac = this.ac; if (!ac) return;
    if (!this.eng) {
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'square'; lfo.type = 'square';
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 3;
      const am = ac.createGain(); am.gain.value = 0.6;
      const lg = ac.createGain(); lg.gain.value = 0.35;
      const g2 = ac.createGain(); g2.gain.value = 0.5;
      const g = ac.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(am); lfo.connect(lg); lg.connect(am.gain); am.connect(g); g.connect(this.out);
      o1.start(); o2.start(); lfo.start();
      this.eng = { o1, o2, lfo, f, g };
    }
    const e = this.eng, t = ac.currentTime;
    const base = 42 + v * 0.42 + (turbo ? 14 : 0);
    e.o1.frequency.setTargetAtTime(base, t, 0.06);
    e.o2.frequency.setTargetAtTime(base * 0.5, t, 0.06);
    e.lfo.frequency.setTargetAtTime(base * 0.25, t, 0.06);
    e.f.frequency.setTargetAtTime(500 + v * 5, t, 0.08);
    e.g.gain.setTargetAtTime(on ? 0.09 + (turbo ? 0.03 : 0) : 0, t, 0.05);
  },
  engineOff() { if (this.eng) this.eng.g.gain.setTargetAtTime(0, this.ac.currentTime, 0.05); },
};

// ---------- bike & rider sprites ----------
// Body grid is 26 wide; wheels sit at rows 5-13 (rear at col 1, front at col 16).
const BIKE_ROWS = [
  '..................kk......',
  '...................Lww....',
  'XX.................Lww....',
  '.XXX..DDDDDD.ZXXXX.L......',
  '..XXXXXDDDDXXXXXXXXLXXXX..',
  '.llllxxxLLLLLxxx...L.XX...',
  '.......LLDDDL.......L.....',
  '.......LDDDL........L.....',
  '......L..LL.........L.....',
  '.....L..............L.....',
];
const RIDER_OY = -9;   // rider sprite row 0 sits at body row -9
const RIDER_ROWS = [
  '............XXXX..........',
  '...........XXXXXX.........',
  '...........XXXXccc........',
  '...........XXXXcc.........',
  '............XXXX..........',
  '...........ww.............',
  '.........wwwwwww..........',
  '........wwwwwwwwww........',
  '........wwwXwww..ww.......',
  '........wwwww......ww.....',
  '........nnnnn.......ss....',
  '........nnnnnnn...........',
  '..........nnnnn...........',
  '............nn............',
  '............nns...........',
  '...........sss............',
];
const HAT_X = 14, HAT_Y = RIDER_OY + 1;  // helmet top-centre in body grid coords
const WHEEL_A = ['..kkkkk..', '.kLLLLLk.', 'kLl.l.lLk', 'kL.lll.Lk', 'kLllLllLk', 'kL.lll.Lk', 'kLl.l.lLk', '.kLLLLLk.', '..kkkkk..'];
const WHEEL_B = ['..kkkkk..', '.kLLLLLk.', 'kL..l..Lk', 'kLl.l.lLk', 'kLlllllLk', 'kLl.l.lLk', 'kL..l..Lk', '.kLLLLLk.', '..kkkkk..'];
const RIDER_TOP = ['..XXXX...', '.XXXXXX..', '.XXXXcc..', '..XXXX...', '...www...', '..wwwww..', '.w.www.w.', '...www...'];
const RUN_A = RIDER_TOP.concat(['...nnn...', '..nn.nn..', '.nn...nn.', '.s.....s.']);
const RUN_B = RIDER_TOP.concat(['...nnn...', '...nnn...', '...n.n...', '...s.s...']);
const TUMBLE = ['...XXXX...', '..XXXXXX..', '..XXXXcc..', '...XXXwww.', '..wwwwwww.', '.nnwwww...', 'nn.nnn....', 's..nns....'];
const ArtCache = {};
function bikeArt(ci) {
  if (ArtCache[ci]) return ArtCache[ci];
  const col = (COLORS[ci] || COLORS[0]).c;
  const map = { X: col, x: Pix.shade(col, 0.62), Z: Pix.shade(col, 1.35) };
  return (ArtCache[ci] = {
    body: Pix.build(BIKE_ROWS, map), rider: Pix.build(RIDER_ROWS, map),
    wheel: [Pix.build(WHEEL_A, null, false), Pix.build(WHEEL_B, null, false)],
    run: [Pix.build(RUN_A, map), Pix.build(RUN_B, map)], tumble: Pix.build(TUMBLE, map),
  });
}

// ---------- racing physics ----------
function newBike(p, slot) {
  return {
    id: p.id, name: p.name, color: p.color | 0, hats: (p.hats || []).slice(0, 5), bot: !!p.bot, skill: p.skill || 0.6,
    dist: -26 + slot.d, lane: slot.l, lp: slot.l, y: 0, vy: 0, v: 0, ang: 0, wheelie: 0, air: false,
    heat: 0, state: 'ride', st: 0, inv: 0, finished: false, place: 0, finishTime: 0, lap: 1,
    qUp: 0, qDn: 0, holdU: 0, holdD: 0, cUp: -1, cDn: -1, input: 0, slide: 0, ai: null,
    rider: { x: 0, h: 0, vx: 0, vy: 0, rot: 0, ph: 0, flip: 0 },
    pd: 0, py: 0, plp: 0, pang: 0,
  };
}

function stepBike(b, dt, R) {
  const T = R.track;
  if (b.inv > 0) b.inv -= dt;
  if (b.state === 'crash') { stepCrash(b, dt, R); return; }
  const racing = R.phase === 'race';
  const ride = b.state === 'ride';
  const inp = b.input;
  let thr = false, tur = false;
  if (racing && ride) {
    if (b.finished) thr = true;
    else { tur = !!(inp & IN.TUR); thr = tur || !!(inp & IN.THR); }
  }
  b.turbo = tur;

  // engine heat
  if (b.state === 'stall') {
    b.st -= dt;
    if (b.st <= 0) { b.state = 'ride'; b.heat = 0; }
  } else if (racing && !b.finished) {
    if (tur) b.heat += PHYS.heatUp * dt; else b.heat -= (thr ? PHYS.coolThr : PHYS.coolIdle) * dt;
    b.heat = clamp(b.heat, 0, 100);
    if (b.heat >= 100) { b.state = 'stall'; b.st = PHYS.stallTime; R.ev('overheat', b); }
  }

  // speed (only the ground pushes you)
  const s0 = trackSlope(T, b.dist);
  if (!b.air) {
    if (!racing) b.v = 0;
    else {
      const cap = b.finished ? 95 : tur ? PHYS.vTurbo : PHYS.vNorm;
      if (thr) { const a = tur ? PHYS.accT : PHYS.accN; b.v = b.v < cap ? Math.min(cap, b.v + a * dt) : Math.max(cap, b.v - 70 * dt); }
      else b.v = Math.max(0, b.v - (b.state === 'stall' ? 120 : PHYS.coast) * dt);
      b.v = Math.max(0, b.v - s0 * 85 * dt);
      if (itemAt(T, b.dist, Math.round(b.lp)) === ITEM.MUD && b.v > PHYS.mudMax) b.v = Math.max(PHYS.mudMax, b.v - 420 * dt);
    }
  }

  // lane changes (on the ground only)
  const settled = Math.abs(b.lp - b.lane) < 0.04;
  if (ride && !b.air && racing && !b.finished) {
    b.holdU = inp & IN.UP ? b.holdU + dt : 0;
    b.holdD = inp & IN.DN ? b.holdD + dt : 0;
    if (settled) {
      if (b.qUp > 0) { b.qUp--; if (b.lane > 0) b.lane--; }
      else if (b.qDn > 0) { b.qDn--; if (b.lane < LANES - 1) b.lane++; }
      else if (b.holdU > 0.3) { b.holdU = 0.16; if (b.lane > 0) b.lane--; }
      else if (b.holdD > 0.3) { b.holdD = 0.16; if (b.lane < LANES - 1) b.lane++; }
    }
  } else if (!racing) { b.qUp = b.qDn = 0; }
  b.qUp = Math.min(b.qUp, 2); b.qDn = Math.min(b.qDn, 2);
  if (b.lp < b.lane) b.lp = Math.min(b.lane, b.lp + PHYS.laneSpeed * dt);
  else if (b.lp > b.lane) b.lp = Math.max(b.lane, b.lp - PHYS.laneSpeed * dt);

  // movement + jumping
  const lean = ride && racing && !b.finished ? (inp & IN.LB ? 1 : 0) - (inp & IN.LF ? 1 : 0) : 0;
  b.dist += b.v * dt;
  const g1 = trackH(T, b.dist);
  if (!b.air) {
    const vy0 = b.v * s0;
    const yb = b.y + vy0 * dt - 0.5 * PHYS.g * dt * dt;
    if (yb > g1 + 0.5 && b.v > 25) {
      b.air = true; b.y = yb; b.vy = vy0 - PHYS.g * dt;
      b.ang = Math.atan(s0) + b.wheelie; b.wheelie = 0;
    } else { b.y = g1; b.vy = 0; }
  } else {
    b.vy -= PHYS.g * dt; b.y += b.vy * dt;
    b.ang += lean * PHYS.leanRate * dt;
    b.ang -= b.ang * 0.25 * dt;
    b.ang = clamp(b.ang, -1.4, 1.4);
    if (b.y <= g1) landBike(b, R, g1);
  }
  if (!b.air) {
    const tw = lean > 0 && b.v > 50 ? 0.45 : 0;
    b.wheelie += (tw - b.wheelie) * Math.min(1, dt * (tw > b.wheelie ? 5 : 10));
    b.ang = Math.atan(trackSlope(T, b.dist)) + b.wheelie;
  }
  if (b.state === 'crash') return;

  // cooling strips & obstacles
  const lane = Math.round(b.lp);
  const it = itemAt(T, b.dist + 6, lane);
  const above = b.y - trackH(T, b.dist);
  if (it === ITEM.COOL && above < 6 && !b.finished && b.heat > 0) { if (b.heat > 8) R.ev('cool', b); b.heat = 0; }
  if ((it === ITEM.HAY || it === ITEM.BAR) && b.inv <= 0 && !b.finished && Math.abs(b.lp - lane) < 0.4) {
    if (above < (it === ITEM.HAY ? 10 : 8)) { crashBike(b, R); return; }
  }

  // laps & finish
  if (racing && !b.finished) {
    const lap = Math.floor(b.dist / T.len) + 1;
    if (lap > b.lap) { b.lap = lap; if (lap <= R.laps) R.ev('lap', b, lap); }
    if (b.dist >= R.laps * T.len) { b.finished = true; b.place = ++R.finishCount; b.finishTime = R.time; R.ev('finish', b, b.place); }
  }
}

function landBike(b, R, g1) {
  const ga = Math.atan(trackSlope(R.track, b.dist));
  const diff = Math.abs(b.ang - ga);
  const impact = -b.vy;
  b.air = false; b.y = g1; b.vy = 0;
  if (b.state === 'ride' && !b.finished && b.inv <= 0 && diff > PHYS.cleanTol) { crashBike(b, R); return; }
  if (b.state === 'ride' && !b.finished && diff < PHYS.perfectTol && impact > 40) {
    b.v = Math.min(PHYS.vTurbo + 18, b.v + 22); R.ev('perfect', b, Math.round(impact));
  } else {
    if (b.state === 'ride' && !b.finished) b.v = Math.min(PHYS.vTurbo + 10, b.v + 6);
    R.ev('land', b, Math.round(impact));
  }
  b.ang = ga;
}

function crashBike(b, R) {
  if (b.state === 'crash') return;
  b.state = 'crash'; b.st = 0; b.qUp = b.qDn = 0; b.turbo = false;
  const r = b.rider;
  r.x = b.dist + 4; r.h = b.y + 14; r.vx = b.v * 0.55 + 35; r.vy = b.air ? Math.max(40, b.vy * 0.4 + 60) : 85;
  r.rot = 0; r.ph = 0; r.flip = 0;
  b.slide = b.v * 0.6; b.v = 0; b.wheelie = 0;
  R.ev('crash', b);
}

function stepCrash(b, dt, R) {
  const T = R.track;
  b.st += dt;
  if (b.air) {
    b.vy -= PHYS.g * dt; b.y += b.vy * dt; b.dist += b.slide * dt; b.ang -= 1.5 * dt;
    const g = trackH(T, b.dist);
    if (b.y <= g) { b.y = g; b.air = false; b.vy = 0; }
  } else {
    b.slide = Math.max(0, b.slide - 260 * dt); b.dist += b.slide * dt;
    b.y = trackH(T, b.dist); b.ang = Math.atan(trackSlope(T, b.dist));
  }
  if (b.lp < b.lane) b.lp = Math.min(b.lane, b.lp + PHYS.laneSpeed * dt);
  else if (b.lp > b.lane) b.lp = Math.max(b.lane, b.lp - PHYS.laneSpeed * dt);
  const r = b.rider;
  if (r.ph === 0) {        // flying through the air
    r.vy -= PHYS.g * dt; r.x += r.vx * dt; r.h += r.vy * dt; r.rot += 9 * dt;
    const g = trackH(T, r.x);
    if (r.h <= g) { r.h = g; if (r.vy < -60) { r.vy = -r.vy * 0.35; r.vx *= 0.7; } else { r.ph = 1; r.vy = 0; } }
  } else if (r.ph === 1) { // sliding to a stop
    r.vx = Math.max(0, r.vx - 300 * dt); r.x += r.vx * dt; r.h = trackH(T, r.x); r.rot += r.vx * dt * 0.08;
    if (r.vx <= 0) { r.ph = 2; r.rot = 0; }
  } else if (r.ph === 2) { // running back to the bike
    const d = b.dist - r.x; r.flip = d < 0 ? 1 : 0;
    const sp = 125 * dt;
    if (Math.abs(d) <= sp) { r.x = b.dist; r.ph = 3; r.flip = 0; } else r.x += Math.sign(d) * sp;
    r.h = trackH(T, r.x);
  } else { r.x = b.dist; r.h = b.y; }
  if ((r.ph === 3 && b.st >= PHYS.crashTime) || b.st > 3.4) {
    b.state = 'ride'; b.inv = 1.4; b.air = false; b.y = trackH(T, b.dist); b.vy = 0; b.v = 0;
    b.ang = Math.atan(trackSlope(T, b.dist));
    R.ev('remount', b);
  }
}

// Hitting another rider's back wheel from behind knocks you off.
function bikeCollisions(R) {
  for (const a of R.bikes) {
    if (a.state === 'crash' || a.inv > 0 || a.finished) continue;
    for (const o of R.bikes) {
      if (o === a || o.state === 'crash' || o.finished || o.inv > 0) continue;
      const d = o.dist - a.dist;
      if (d > 6 && d < 18 && Math.abs(a.lp - o.lp) < 0.55 && Math.abs(a.y - o.y) < 9 && a.v > o.v + 12) { crashBike(a, R); break; }
    }
  }
}

// ---------- computer riders ----------
function predictLandAngle(b, R) {
  let x = b.dist, y = b.y, vy = b.vy;
  for (let i = 0; i < 240; i++) {
    vy -= PHYS.g * STEP; y += vy * STEP; x += b.v * STEP;
    if (y <= trackH(R.track, x)) return Math.atan(trackSlope(R.track, x));
  }
  return 0;
}
function laneCost(b, R, lane) {
  const T = R.track;
  let c = 0;
  const look = 30 + b.v * 1.1;
  for (let d = 4; d < look; d += 8) {
    const it = itemAt(T, b.dist + d, lane);
    if (it === ITEM.HAY || it === ITEM.BAR) c += 1000 - d;
    else if (it === ITEM.MUD) c += 25;
    else if (it === ITEM.COOL && b.heat > 40) c -= 30 + b.heat * 0.5;
  }
  for (const o of R.bikes) {
    if (o === b || o.state === 'crash' || o.finished) continue;
    const d = o.dist - b.dist;
    if (d > 0 && d < 70 && Math.round(o.lp) === lane && o.v < b.v + 5) c += 120;
  }
  return c;
}
function aiControl(b, R) {
  if (!b.ai) b.ai = { laneT: Math.random() * 0.3, err: 0, wasAir: false, cool: false };
  const A = b.ai;
  if (R.phase !== 'race' || b.finished || b.state === 'crash') { b.input = 0; return; }
  let bits = IN.THR;
  const sk = b.skill;
  const lim = 50 + sk * 35;
  if (b.heat > lim) A.cool = true;
  if (b.heat < 20) A.cool = false;
  if (!A.cool && b.state === 'ride') bits |= IN.TUR;
  if (b.air) {
    if (!A.wasAir) { A.err = (Math.random() - 0.5) * (1 - sk) * 1.1; A.wasAir = true; }
    const d = predictLandAngle(b, R) + A.err - b.ang;
    if (d > 0.06) bits |= IN.LB; else if (d < -0.06) bits |= IN.LF;
  } else {
    A.wasAir = false;
    A.laneT -= STEP;
    if (A.laneT <= 0 && Math.abs(b.lp - b.lane) < 0.05 && !b.qUp && !b.qDn) {
      A.laneT = 0.12 + (1 - sk) * 0.3;
      let best = b.lane, bc = Infinity;
      for (let l = 0; l < LANES; l++) {
        let c = laneCost(b, R, l) + Math.abs(l - b.lane) * 4;
        const step = l < b.lane ? -1 : 1;   // lanes passed through on the way count too
        for (let m = b.lane + step; l !== b.lane && m !== l; m += step) c += laneCost(b, R, m) * 0.3;
        if (c < bc) { bc = c; best = l; }
      }
      if (best < b.lane) b.qUp = 1; else if (best > b.lane) b.qDn = 1;
    }
    for (const o of R.bikes) {
      if (o === b || o.state === 'crash' || o.inv > 0 || o.finished) continue;
      const d = o.dist - b.dist;
      if (d > 0 && d < 32 && Math.abs(o.lp - b.lp) < 0.6 && b.v > o.v + 4) bits &= ~(IN.THR | IN.TUR);
    }
  }
  b.input = bits;
}

// ---------- the race (authoritative simulation: solo, host, demo, test) ----------
const START_SLOTS = [{ l: 0, d: 0 }, { l: 1, d: 0 }, { l: 2, d: 0 }, { l: 3, d: 0 }, { l: 1, d: -40 }, { l: 2, d: -40 }];
class Race {
  constructor(o) {
    this.local = true;
    this.mode = o.mode;
    this.src = o.track;
    this.track = compileTrack(o.track);
    this.laps = o.laps;
    this.localId = o.localId;
    this.inputFor = o.inputFor || (() => null);
    this.phase = o.mode === 'demo' ? 'race' : 'countdown';
    this.cd = 0; this.time = 0; this.events = []; this.finishCount = 0;
    this.firstFinish = -1; this.humansDoneAt = -1; this.results = null; this.netEv = [];
    this.bikes = o.players.map((p, i) => newBike(p, START_SLOTS[i % START_SLOTS.length]));
  }
  ev(e, b, a) {
    const o = a === undefined ? { e, id: b ? b.id : null } : { e, id: b ? b.id : null, a };
    this.events.push(o);
    if (this.mode === 'host') this.netEv.push(o);
  }
  bike(id) { return this.bikes.find((b) => b.id === id); }
  removeBike(id) { this.bikes = this.bikes.filter((b) => b.id !== id); }
  step(dt) {
    if (this.phase === 'countdown') {
      const p = this.cd; this.cd += dt;
      for (const t of [0.6, 1.6, 2.6]) if (p < t && this.cd >= t) this.ev('count');
      if (this.cd >= 3.6) { this.phase = 'race'; this.ev('go'); }
    } else if (this.phase === 'race') this.time += dt;
    for (const b of this.bikes) {
      b.pd = b.dist; b.py = b.y; b.plp = b.lp; b.pang = b.ang;
      if (b.bot) aiControl(b, this);
      else {
        const i = this.inputFor(b);
        if (i) {
          b.input = i.bits | 0;
          if (b.cUp < 0 || i.up < b.cUp) b.cUp = i.up;
          if (b.cDn < 0 || i.dn < b.cDn) b.cDn = i.dn;
          if (i.up > b.cUp) { b.qUp += i.up - b.cUp; b.cUp = i.up; }
          if (i.dn > b.cDn) { b.qDn += i.dn - b.cDn; b.cDn = i.dn; }
        }
      }
      stepBike(b, dt, this);
    }
    bikeCollisions(this);
    if (this.phase === 'race' && this.mode !== 'demo') this.checkEnd();
  }
  checkEnd() {
    if (this.firstFinish < 0 && this.finishCount > 0) this.firstFinish = this.time;
    const humans = this.bikes.filter((b) => !b.bot);
    const humansDone = humans.length > 0 && humans.every((b) => b.finished);
    if (humansDone && this.humansDoneAt < 0) this.humansDoneAt = this.time;
    const all = this.bikes.every((b) => b.finished);
    if (all || (humansDone && this.time - this.humansDoneAt > 5) || (this.firstFinish >= 0 && this.time - this.firstFinish > 25) || humans.length === 0) {
      this.phase = 'done';
      this.results = this.standings().map((b, i) => ({ id: b.id, name: b.name, color: b.color, pos: i + 1, time: b.finished ? b.finishTime : null, bot: b.bot }));
      this.ev('done');
    }
  }
  standings() {
    return [...this.bikes].sort((a, b) => (a.finished && b.finished ? a.place - b.place : a.finished ? -1 : b.finished ? 1 : b.dist - a.dist));
  }
  // Snapshot of bikes for drawing, smoothed between physics steps.
  viewBikes(alpha) {
    return this.bikes.map((b) => {
      const jump = Math.abs(b.dist - b.pd) > 40;
      return Object.assign({}, b, {
        dist: jump ? b.dist : lerp(b.pd, b.dist, alpha), y: jump ? b.y : lerp(b.py, b.y, alpha),
        lp: lerp(b.plp, b.lp, alpha), ang: lerp(b.pang, b.ang, alpha),
      });
    });
  }
}

function makeBots(n, usedColors) {
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const free = COLORS.map((_, i) => i).filter((i) => !usedColors.includes(i)).sort(() => Math.random() - 0.5);
  const out = [];
  for (let i = 0; i < n; i++) {
    const color = free.length ? free.shift() : Math.floor(Math.random() * COLORS.length);
    out.push({ id: 'cpu' + i + '_' + Math.floor(Math.random() * 1e6), name: names[i % names.length], color, bot: true,
      skill: 0.5 + Math.random() * 0.45, hats: HAS_HATS() ? Hats.randomStack(1 + Math.floor(Math.random() * 3)) : [] });
    usedColors.push(color);
  }
  return out;
}

// ---------- per-bike render state (wheels, hat wobble, flying hats) ----------
const OCW = 72, OCH = 132, PVX = 36, PVY = 120, BX0 = PVX - 13, BY0 = PVY - 14;
const RS = new Map();
function rsOf(id) {
  let r = RS.get(id);
  if (!r) {
    const oc = mk(OCW, OCH);
    r = { oc, x: oc.getContext('2d'), wr: 0, py: null, pvy: 0, wob: HAS_HATS() ? Hats.newWobble() : null, fly: null, dustT: 0, steamT: 0 };
    r.x.imageSmoothingEnabled = false;
    RS.set(id, r);
  }
  return r;
}

// ---------- particles ----------
const Parts = [];
function part(x, lp, h, vx, vh, life, col, o = {}) {
  if (Parts.length > 400) Parts.shift();
  Parts.push({ x, lp, h, vx, vh, life, max: life, col, sz: o.sz || 1, g: o.g == null ? 220 : o.g });
}
function updateParticles(dt, T) {
  for (let i = Parts.length - 1; i >= 0; i--) {
    const p = Parts[i];
    p.life -= dt;
    if (p.life <= 0) { Parts.splice(i, 1); continue; }
    p.vh -= p.g * dt; p.x += p.vx * dt; p.h += p.vh * dt;
    if (T && p.g > 0) { const g = trackH(T, p.x); if (p.h < g) { p.h = g; p.vh *= -0.3; p.vx *= 0.6; } }
  }
}
function puff(x, lp, h, n, col, spread = 50) {
  for (let i = 0; i < n; i++) part(x + rnd(-6, 6), lp + rnd(-0.15, 0.15), h + rnd(0, 3), rnd(-spread, spread), rnd(20, 70), rnd(0.25, 0.6), col, { sz: Math.random() < 0.4 ? 2 : 1 });
}

function updateRS(vbs, T, dt) {
  for (const vb of vbs) {
    const rs = rsOf(vb.id);
    if (vb.state !== 'crash') rs.wr += (vb.v * dt) / 11;
    // vertical acceleration drives the hat wobble
    const vy = rs.py == null ? 0 : (vb.y - rs.py) / Math.max(dt, 0.001);
    const ay = clamp((vy - rs.pvy) / Math.max(dt, 0.001), -3000, 3000);
    rs.py = vb.y; rs.pvy = vy;
    if (rs.wob && HAS_HATS()) Hats.stepWobble(rs.wob, dt, ay, vb.v, vb.air, vb.hats.length);
    if (rs.fly && HAS_HATS()) Hats.stepFlying(rs, vb, T, dt);
    // dust & steam
    const onGround = !vb.air && vb.state !== 'crash';
    if (onGround && vb.v > 40) {
      rs.dustT -= dt * (vb.turbo ? 2.2 : 1) * (vb.v / 150);
      if (rs.dustT <= 0) {
        rs.dustT = 0.045;
        const mud = itemAt(T, vb.dist, Math.round(vb.lp)) === ITEM.MUD;
        part(vb.dist - 12, vb.lp + rnd(-0.1, 0.1), vb.y + 1, -vb.v * 0.15 + rnd(-15, 15), rnd(10, 45), rnd(0.2, 0.45), mud ? '#4e2c14' : Math.random() < 0.5 ? '#d8a46a' : '#c4884e');
      }
    }
    if (vb.state === 'stall' || (vb.heat > 80 && vb.state === 'ride')) {
      rs.steamT -= dt;
      if (rs.steamT <= 0) { rs.steamT = vb.state === 'stall' ? 0.05 : 0.14; part(vb.dist + rnd(-4, 4), vb.lp, vb.y + 10, rnd(-10, 10), rnd(25, 45), rnd(0.5, 0.9), Math.random() < 0.5 ? '#f4f2e8' : '#c8c8d0', { g: -10, sz: 2 }); }
    }
  }
}

// ---------- world drawing ----------
const BG = { built: false };
function buildBG() {
  const TAU = Math.PI * 2;
  let c = mk(256, 64), x = c.getContext('2d');
  for (let i = 0; i < 256; i++) {
    const h = 26 + Math.round(14 * Math.sin((i * TAU * 2) / 256) + 8 * Math.sin((i * TAU * 5) / 256 + 1) + 3 * Math.sin((i * TAU * 13) / 256));
    x.fillStyle = '#8492d2'; x.fillRect(i, 64 - h, 1, h);
    x.fillStyle = '#6f7cc0'; x.fillRect(i, 64 - Math.floor(h * 0.45), 1, Math.floor(h * 0.45));
    if (h > 38) { x.fillStyle = '#e4ecfa'; x.fillRect(i, 64 - h, 1, Math.min(4, h - 38)); }
  }
  BG.mtn = c;
  c = mk(320, 46); x = c.getContext('2d');
  for (let i = 0; i < 320; i++) {
    const h = 22 + Math.round(8 * Math.sin((i * TAU * 3) / 320) + 5 * Math.sin((i * TAU * 7) / 320 + 2));
    x.fillStyle = '#5aae4e'; x.fillRect(i, 46 - h, 1, h);
    x.fillStyle = '#4c9a44'; x.fillRect(i, 46 - Math.floor(h * 0.5), 1, Math.floor(h * 0.5));
    if (hash(i * 7) % 23 === 0) { x.fillStyle = '#2f7a34'; x.fillRect(i - 2, 46 - h - 4, 5, 6); x.fillStyle = '#6a4a2a'; x.fillRect(i, 46 - h + 2, 1, 2); }
  }
  BG.hills = c;
  const shirts = ['#e8383b', '#3b78e8', '#ffd23f', '#46c84a', '#ff8fc8', '#ff8a2a', '#f4f2e8', '#8a3ce0'];
  const skins = ['#f2c8a0', '#c88a5a', '#8a5a3a', '#f8dcc0', '#e0a878'];
  BG.stand = [0, 1].map((frame) => {
    const s = mk(192, 54), q = s.getContext('2d');
    q.fillStyle = '#3a2f5a'; q.fillRect(0, 6, 192, 40);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 48; k++) {
      const hv = hash(r * 1000 + k + 17);
      if (hv % 7 === 0) continue;
      const hx = k * 4 + (r & 1) * 2, cheer = frame && hv % 3 === 0 ? 1 : 0, yy = 11 + r * 8 - cheer;
      q.fillStyle = shirts[(hv >> 3) % shirts.length]; q.fillRect(hx, yy + 2, 3, 4);
      q.fillStyle = skins[hv % skins.length]; q.fillRect(hx, yy, 2, 2);
      if (frame && hv % 5 === 0) { q.fillRect(hx - 1, yy - 2, 1, 2); q.fillRect(hx + 2, yy - 2, 1, 2); }
    }
    for (let p = 0; p < 192; p += 48) { q.fillStyle = '#241c3c'; q.fillRect(p, 6, 3, 40); }
    for (let i = 0; i < 192; i++) {
      q.fillStyle = (i >> 3) & 1 ? '#e8383b' : '#f4f2e8'; q.fillRect(i, 0, 1, 6);
      if (((i >> 2) & 1) === 0) q.fillRect(i, 6, 1, 2);
    }
    q.fillStyle = '#24305e'; q.fillRect(0, 44, 192, 10); q.fillStyle = '#6a7ac8'; q.fillRect(0, 44, 192, 2);
    return s;
  });
  BG.built = true;
}
function tileH(c, sx, y, par, camD) {
  const w = c.width; let x = -mod(Math.round(camD * par), w);
  for (; x < W; x += w) ctx.drawImage(c, x, y);
}
function drawSky(camD, camY, now) {
  if (!BG.built) buildBG();
  const bands = [['#4fb8ec', 0, 30], ['#62c3f0', 30, 22], ['#78cdf2', 52, 16], ['#92d8f5', 68, 12], ['#ade3f8', 80, 60]];
  for (const [c, y, h] of bands) { ctx.fillStyle = c; ctx.fillRect(0, y, W, h); }
  // clouds
  const par = 0.06, sp = 150, off = camD * par + now * 3;
  for (let k = Math.floor(off / sp) - 1; k < Math.floor(off / sp) + W / sp + 2; k++) {
    const hv = hash(k * 31 + 5), x = Math.round(k * sp - off + (hv % 50)), y = 18 + (hv >> 8) % 36;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 26, 5); ctx.fillRect(x + 5, y - 4, 13, 4); ctx.fillRect(x + 9, y - 7, 7, 3);
    ctx.fillStyle = '#d8eef8'; ctx.fillRect(x + 2, y + 5, 22, 2);
  }
  const cy = Math.round(camY * 0.4);
  tileH(BG.mtn, 0, 44 + cy, 0.1, camD);
  tileH(BG.hills, 0, 70 + cy, 0.22, camD);
  ctx.fillStyle = '#4c9a44'; ctx.fillRect(0, 116 + cy, W, 40);
  tileH(BG.stand[(now * 2.5 | 0) & 1], 0, 82 + Math.round(camY * 0.7), 0.55, camD);
}
const DIRT = ['#b8743c', '#ad6c36'], LIT = ['#cf8a4c', '#c4824a'], SHADE = ['#965a2c', '#8c5428'];
const DIV = '#d49a5e', FACE = '#7c4626', FACE2 = '#6a3a1e', LIP = '#4e2c14';
function drawFence(camLeft) {
  const y = TRACK_TOP - 12;
  ctx.fillStyle = '#4c9a44'; ctx.fillRect(0, y - 4, W, 16);
  ctx.fillStyle = '#f4f2e8'; ctx.fillRect(0, y, W, 8);
  ctx.fillStyle = '#c8c8d0'; ctx.fillRect(0, y + 7, W, 1);
  const bannerCols = [['#e8383b', '#ffd23f'], ['#3b78e8', '#f4f2e8'], ['#46c84a', '#ffd23f'], ['#8a3ce0', '#ff8fc8']];
  for (let p = Math.floor(camLeft / 160) * 160; p < camLeft + W + 160; p += 160) {
    const sx = p - camLeft + 40, [a, b] = bannerCols[hash(p / 160 + 3) % 4];
    ctx.fillStyle = a; ctx.fillRect(sx, y, 56, 8);
    ctx.fillStyle = b;
    for (let i = 0; i < 5; i++) { ctx.fillRect(sx + 4 + i * 11, y + 2, 5, 4); }
  }
  ctx.fillStyle = '#8a8a9a';
  for (let p = Math.floor(camLeft / 32) * 32; p < camLeft + W + 32; p += 32) ctx.fillRect(p - camLeft, y - 2, 2, 12);
}
function drawTrack(T, camLeft) {
  const L = T.len, hm = T.hm;
  let sx = 0;
  while (sx < W) {
    const h = hm[mod(camLeft + sx, L) | 0];
    if (h < 0.5) {
      let ex = sx + 1;
      while (ex < W && hm[mod(camLeft + ex, L) | 0] < 0.5) ex++;
      flatRun(sx, ex, camLeft, L);
      sx = ex;
    } else { rampCol(sx, camLeft, T); sx++; }
  }
}
function dashes(sx, ex, camLeft, y) {
  let x = sx;
  while (x < ex) {
    const p = mod(camLeft + x, 16);
    if (p < 8) { const run = Math.min(8 - p, ex - x); ctx.fillRect(x, y, run, 1); x += run; } else x += 16 - p;
  }
}
function flatRun(sx, ex, camLeft, L) {
  const w = ex - sx;
  for (let i = 0; i < LANES; i++) { ctx.fillStyle = DIRT[i & 1]; ctx.fillRect(sx, TRACK_TOP + i * LANE_H, w, LANE_H); }
  ctx.fillStyle = DIV;
  for (let i = 1; i < LANES; i++) dashes(sx, ex, camLeft, TRACK_TOP + i * LANE_H);
  ctx.fillStyle = '#d8a46a'; ctx.fillRect(sx, TRACK_TOP, w, 1);
  ctx.fillStyle = LIP; ctx.fillRect(sx, TRACK_BOT, w, 3);
  for (let x = sx; x < ex; x++) {
    const hv = hash(mod(camLeft + x, L));
    if ((hv & 15) === 0) {
      ctx.fillStyle = (hv >> 4) & 1 ? SHADE[0] : LIT[0];
      ctx.fillRect(x, TRACK_TOP + 3 + ((hv >> 5) % (LANES * LANE_H - 6)), 1 + ((hv >> 9) & 1), 1);
    }
  }
}
function rampCol(sx, camLeft, T) {
  const tp = mod(camLeft + sx, T.len) | 0;
  const h = T.hm[tp], hi = Math.round(h);
  const s = T.hm[Math.min(tp + 1, T.len)] - T.hm[Math.max(tp - 1, 0)];
  const pal = s > 0.08 ? LIT : s < -0.08 ? SHADE : DIRT;
  const top = TRACK_TOP - hi, bot = TRACK_BOT - hi;
  for (let i = 0; i < LANES; i++) { ctx.fillStyle = pal[i & 1]; ctx.fillRect(sx, top + i * LANE_H, 1, LANE_H); }
  if (mod(camLeft + sx, 16) < 8) { ctx.fillStyle = DIV; for (let i = 1; i < LANES; i++) ctx.fillRect(sx, top + i * LANE_H, 1, 1); }
  ctx.fillStyle = '#e0a66a'; ctx.fillRect(sx, top, 1, 1);
  ctx.fillStyle = FACE; ctx.fillRect(sx, bot, 1, hi);
  ctx.fillStyle = FACE2;
  for (let k = 5; k < hi; k += 6) ctx.fillRect(sx, TRACK_BOT - k, 1, 1);
  ctx.fillStyle = LIP; ctx.fillRect(sx, TRACK_BOT, 1, 3);
}
function forTiles(T, camLeft, fn) {
  const t0 = Math.floor(camLeft / TILE) - 1, t1 = Math.ceil((camLeft + W) / TILE) + 1;
  for (let t = t0; t <= t1; t++) fn(mod(t, T.tiles), t * TILE - camLeft);
}
function drawDecals(T, camLeft, now) {
  forTiles(T, camLeft, (tx, sx) => {
    const h = Math.round(T.hm[tx * TILE + 8]);
    for (let l = 0; l < LANES; l++) {
      const it = T.grid[tx * LANES + l]; if (it !== ITEM.MUD && it !== ITEM.COOL) continue;
      const y = TRACK_TOP + l * LANE_H - h;
      if (it === ITEM.MUD) {
        const pl = T.grid[mod(tx - 1, T.tiles) * LANES + l] === ITEM.MUD, nx = T.grid[mod(tx + 1, T.tiles) * LANES + l] === ITEM.MUD;
        const x0 = sx + (pl ? 0 : 2), x1 = sx + (nx ? 16 : 14);
        ctx.fillStyle = '#5a3418'; ctx.fillRect(x0, y + 3, x1 - x0, LANE_H - 6);
        ctx.fillStyle = '#6e4220'; ctx.fillRect(x0 + 1, y + 4, x1 - x0 - 2, 2);
        ctx.fillStyle = '#7a5a3a'; ctx.fillRect(sx + 4 + (hash(tx * 4 + l) % 6), y + 9, 3, 1);
        ctx.fillStyle = '#3e2410'; ctx.fillRect(x0, y + LANE_H - 4, x1 - x0, 1);
      } else {
        const glow = (now * 6 + tx) % 4 < 2;
        ctx.fillStyle = '#2a6ab0'; ctx.fillRect(sx + 1, y + 2, 14, LANE_H - 4);
        for (let k = 0; k < 4; k++) { ctx.fillStyle = (k & 1) ^ glow ? '#7fe8ff' : '#d8f8ff'; ctx.fillRect(sx + 2 + k * 3, y + 3, 2, LANE_H - 6); }
      }
    }
  });
}
function drawObstacles(T, camLeft, lane) {
  forTiles(T, camLeft, (tx, sx) => {
    const it = T.grid[tx * LANES + lane]; if (it !== ITEM.HAY && it !== ITEM.BAR) return;
    const h = Math.round(T.hm[tx * TILE + 8]);
    const top = TRACK_TOP + lane * LANE_H - h, bot = top + LANE_H;
    if (it === ITEM.HAY) {
      const R = 10, x0 = sx + 2, w = 12;
      ctx.fillStyle = '#140c1c'; ctx.fillRect(x0 - 1, top + 2 - R, w + 2, bot - top - 3 + R);
      ctx.fillStyle = '#f4d872'; ctx.fillRect(x0, top + 3 - R, w, bot - top - 7);
      ctx.fillStyle = '#d8b048'; ctx.fillRect(x0, bot - 4 - R, w, R + 1);
      ctx.fillStyle = '#b8902e'; for (let k = 2; k < w; k += 3) ctx.fillRect(x0 + k, bot - 3 - R, 1, R - 1);
      ctx.fillStyle = '#8a5a2a'; ctx.fillRect(x0 + 3, top + 3 - R, 1, bot - top - 2); ctx.fillRect(x0 + 8, top + 3 - R, 1, bot - top - 2);
    } else {
      const R = 8, x0 = sx + 5, w = 6;
      ctx.fillStyle = '#140c1c'; ctx.fillRect(x0 - 1, top + 2 - R, w + 2, bot - top - 3 + R);
      ctx.fillStyle = '#f4f2e8'; ctx.fillRect(x0, top + 3 - R, w, bot - top - 7);
      for (let k = 0; k < R; k += 2) { ctx.fillStyle = (k >> 1) & 1 ? '#f4f2e8' : '#e8383b'; ctx.fillRect(x0, bot - 4 - R + k + 1, w, 2); }
      ctx.fillStyle = '#e8383b'; ctx.fillRect(x0, top + 3 - R + 4, w, 3);
    }
  });
}
function drawStartLine(T, camLeft) {
  const sx = wrapD(0 - camLeft, T.len);
  if (sx < -20 || sx > W + 20) return;
  const h = Math.round(T.hm[0]);
  for (let r = 0; r < (LANES * LANE_H) / 4; r++) for (let c = 0; c < 2; c++) {
    ctx.fillStyle = (r + c) & 1 ? '#140c1c' : '#f4f2e8';
    ctx.fillRect(sx + c * 4, TRACK_TOP - h + r * 4, 4, 4);
  }
  // flag pole behind the fence
  ctx.fillStyle = '#8a8a9a'; ctx.fillRect(sx + 3, TRACK_TOP - 58, 2, 46);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { ctx.fillStyle = (r + c) & 1 ? '#140c1c' : '#f4f2e8'; ctx.fillRect(sx + 5 + c * 3, TRACK_TOP - 58 + r * 3, 3, 3); }
}
function drawForeground(camLeft) {
  const y0 = TRACK_BOT + 3;
  ctx.fillStyle = '#3faa44'; ctx.fillRect(0, y0, W, H - y0 + 40);
  ctx.fillStyle = '#379c3c';
  for (let p = Math.floor(camLeft / 24) * 24; p < camLeft + W + 24; p += 24) ctx.fillRect(p - camLeft, y0 + 2, 10, H - y0 + 40);
  for (let p = Math.floor(camLeft / 128) * 128; p < camLeft + W + 128; p += 128) {
    const sx = p - camLeft + (hash(p) % 40), y = y0 + 6;
    ctx.fillStyle = '#140c1c'; ctx.fillRect(sx - 1, y - 1, 24, 13);
    ctx.fillStyle = '#f4d872'; ctx.fillRect(sx, y, 22, 5); ctx.fillStyle = '#d8b048'; ctx.fillRect(sx, y + 5, 22, 6);
    ctx.fillStyle = '#8a5a2a'; ctx.fillRect(sx + 6, y, 1, 11); ctx.fillRect(sx + 15, y, 1, 11);
  }
  for (let p = Math.floor(camLeft / 40) * 40; p < camLeft + W + 40; p += 40) {
    const hv = hash(p + 99); if (hv % 3) continue;
    ctx.fillStyle = ['#ffd23f', '#ff8fc8', '#f4f2e8'][hv % 3]; ctx.fillRect(p - camLeft + (hv % 30), y0 + 20 + (hv >> 5) % 14, 2, 2);
  }
}

function drawBike(vb, T, camD, now) {
  const rs = rsOf(vb.id), art = bikeArt(vb.color);
  const sx = Math.round(CAM_X + wrapD(vb.dist - camD, T.len));
  const gy = laneY(vb.lp);
  if (sx > -70 && sx < W + 70) {
    const gh = trackH(T, vb.dist), air = vb.y - gh;
    if (air > 2) {
      const sw = Math.max(6, 22 - air * 0.25);
      ctx.fillStyle = 'rgba(20,12,28,0.35)'; ctx.fillRect(Math.round(sx - sw / 2), Math.round(gy - gh - 1), Math.round(sw), 3);
    }
    const o = rs.x; o.clearRect(0, 0, OCW, OCH);
    const wf = (rs.wr | 0) & 1;
    o.drawImage(art.wheel[wf], BX0 + 1, BY0 + 5); o.drawImage(art.wheel[wf], BX0 + 16, BY0 + 5);
    o.drawImage(art.body, BX0 - 1, BY0 - 1);
    if (vb.state !== 'crash') {
      o.drawImage(art.rider, BX0 - 1, BY0 + RIDER_OY - 1);
      if (HAS_HATS() && vb.hats.length && !rs.fly) Hats.drawStack(o, vb.hats, BX0 + HAT_X, BY0 + HAT_Y, rs.wob, now);
    }
    ctx.save();
    if (vb.inv > 0 && (Math.floor(now * 16) & 1)) ctx.globalAlpha = 0.45;
    ctx.translate(sx, Math.round(gy - vb.y) - 5);
    ctx.rotate(-vb.ang);
    ctx.drawImage(rs.oc, -PVX, -PVY + 5);
    ctx.restore();
  }
  if (vb.state === 'crash') {
    const r = vb.rider;
    const rx = Math.round(CAM_X + wrapD(r.x - camD, T.len)), ry = Math.round(gy - r.h);
    if (rx > -30 && rx < W + 30) {
      ctx.save();
      if (r.ph <= 1) {
        const sp = art.tumble;
        ctx.translate(rx, ry - 5); ctx.rotate(-r.rot); ctx.drawImage(sp, -(sp.width >> 1), -(sp.height >> 1));
      } else {
        const sp = art.run[r.ph === 2 ? (now * 10 | 0) & 1 : 1];
        ctx.translate(rx, ry); if (r.flip) ctx.scale(-1, 1); ctx.drawImage(sp, -(sp.width >> 1), -sp.height + 1);
      }
      ctx.restore();
    }
  }
  if (HAS_HATS() && rs.fly) Hats.drawFlying(rs, vb, T, camD);
}

function drawParticles(T, camD) {
  for (const p of Parts) {
    const sx = Math.round(CAM_X + wrapD(p.x - camD, T.len)); if (sx < -4 || sx > W + 4) continue;
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
    ctx.fillStyle = p.col; ctx.fillRect(sx, Math.round(laneY(p.lp) - p.h), p.sz, p.sz);
  }
  ctx.globalAlpha = 1;
}

function renderWorld(T, camD, camY, vbs, now, opts = {}) {
  const camLeft = Math.round(camD) - CAM_X;
  drawSky(camD, camY, now);
  ctx.save(); ctx.translate(0, Math.round(camY));
  drawFence(camLeft);
  drawTrack(T, camLeft);
  drawDecals(T, camLeft, now);
  drawStartLine(T, camLeft);
  if (opts.underBikes) opts.underBikes(camLeft);
  const byLane = [[], [], [], []];
  for (const vb of vbs) byLane[clamp(Math.round(vb.lp), 0, 3)].push(vb);
  for (let l = 0; l < LANES; l++) {
    drawObstacles(T, camLeft, l);
    for (const vb of byLane[l]) drawBike(vb, T, camD, now);
  }
  drawForeground(camLeft);
  drawParticles(T, camD);
  if (opts.overWorld) opts.overWorld(camLeft);
  ctx.restore();
}

// ---------- HUD ----------
function panel(x, y, w, h) { ctx.fillStyle = 'rgba(20,12,28,0.78)'; ctx.fillRect(x, y, w, h); }
function drawHUD(R, vbs, me, now) {
  const T = R.track;
  panel(0, 0, W, 13);
  const ranked = [...vbs].sort((a, b) => (a.finished && b.finished ? a.place - b.place : a.finished ? -1 : b.finished ? 1 : b.dist - a.dist));
  if (me) {
    const lap = clamp(Math.floor(Math.max(0, me.dist) / T.len) + 1, 1, R.laps);
    text('LAP ' + (me.finished ? R.laps : lap) + '/' + R.laps, 4, 4, { c: '#ffd23f' });
    const pos = ranked.findIndex((b) => b.id === me.id) + 1;
    text(ordinal(pos) + '/' + vbs.length, 58, 4, { c: '#f4f2e8' });
  }
  const t = me && me.finished ? me.finishTime : R.time;
  text(fmtTime(t), W / 2, 4, { a: 'c', c: '#6fe3ff' });
  if (me) {
    const hx = W - 92;
    const hot = me.heat > 85, stall = me.state === 'stall';
    text(stall ? 'STALL' : 'TEMP', hx - 4, 4, { a: 'r', c: stall || hot ? ((now * 6) | 0) & 1 ? '#e8383b' : '#ffd23f' : '#c8c8d0' });
    ctx.fillStyle = '#140c1c'; ctx.fillRect(hx, 3, 82, 7);
    ctx.fillStyle = '#3a3a4e'; ctx.fillRect(hx + 1, 4, 80, 5);
    const w = Math.round((me.heat / 100) * 80);
    ctx.fillStyle = me.heat < 60 ? '#46c84a' : me.heat < 85 ? '#ffd23f' : '#e8383b';
    if (!(hot && ((now * 8) | 0) & 1)) ctx.fillRect(hx + 1, 4, w, 5);
    for (let k = 1; k < 8; k++) { ctx.fillStyle = '#140c1c'; ctx.fillRect(hx + 1 + k * 10, 4, 1, 5); }
  }
  // standings
  const rows = ranked.length;
  panel(W - 70, 15, 70, rows * 7 + 3);
  ranked.forEach((b, i) => {
    const y = 17 + i * 7;
    text(String(i + 1), W - 66, y, { c: b.id === (me && me.id) ? '#ffd23f' : '#c8c8d0' });
    ctx.fillStyle = (COLORS[b.color] || COLORS[0]).c; ctx.fillRect(W - 60, y, 5, 5);
    text(b.name.slice(0, 11), W - 53, y, { c: b.id === (me && me.id) ? '#ffd23f' : '#f4f2e8' });
  });
  // minimap
  const mx0 = 8, mx1 = W - 8, my = H - 8, mw = mx1 - mx0;
  ctx.fillStyle = 'rgba(20,12,28,0.55)'; ctx.fillRect(mx0 - 3, my - 7, mw + 6, 11);
  ctx.fillStyle = '#c8c8d0'; ctx.fillRect(mx0, my, mw, 1);
  for (const r of T.src.ramps) {
    const x = mx0 + Math.round(((r.x + RAMPS[r.type].w / 2) * TILE / T.len) * mw), hh = r.type === 'big' ? 4 : r.type === 'bump' ? 1 : 2;
    ctx.fillStyle = '#b8743c'; ctx.fillRect(x - 1, my - hh, r.type === 'double' ? 4 : 3, hh);
  }
  ctx.fillStyle = '#f4f2e8'; ctx.fillRect(mx0, my - 4, 1, 5);
  for (const b of vbs) {
    const x = mx0 + Math.round((mod(b.dist, T.len) / T.len) * mw);
    const isMe = me && b.id === me.id;
    ctx.fillStyle = '#140c1c'; ctx.fillRect(x - 2, my - 3 - (isMe ? 1 : 0), 5, isMe ? 6 : 5);
    ctx.fillStyle = (COLORS[b.color] || COLORS[0]).c; ctx.fillRect(x - 1, my - 2 - (isMe ? 1 : 0), 3, isMe ? 4 : 3);
  }
  // countdown lights
  if (R.phase === 'countdown' || (R.phase === 'race' && R.time < 1)) {
    const lit = R.phase === 'countdown' ? (R.cd >= 0.6) + (R.cd >= 1.6) + (R.cd >= 2.6) : 3;
    const go = R.phase === 'race';
    const cx = W / 2, y = 34;
    ctx.fillStyle = '#140c1c'; ctx.fillRect(cx - 40, y, 80, 26); ctx.fillStyle = '#3a3a4e'; ctx.fillRect(cx - 38, y + 2, 76, 22);
    for (let i = 0; i < 3; i++) {
      const lx = cx - 30 + i * 22;
      ctx.fillStyle = '#140c1c'; ctx.fillRect(lx - 1, y + 4, 18, 18);
      ctx.fillStyle = go ? '#46ff5a' : i < lit ? '#ff3a3a' : '#4a1818';
      ctx.fillRect(lx + 2, y + 5, 12, 16); ctx.fillRect(lx, y + 7, 16, 12);
      if (go || i < lit) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(lx + 3, y + 7, 3, 3); }
    }
    const label = go ? 'GO!' : lit ? String(4 - lit) : '';
    if (label) text(label, cx, y + 34, { s: 4, a: 'c', c: go ? '#46ff5a' : '#ffd23f', sh: '#140c1c' });
  }
  // big message
  const m = App.msg;
  if (m && m.life > 0) {
    const y = 74 + (m.life > m.max - 0.15 ? (m.max - m.life) * -40 + 6 : 0);
    text(m.text, W / 2, y, { s: 3, a: 'c', c: m.c, sh: '#140c1c' });
  }
  if (me && me.state === 'crash' && me.rider.ph >= 2) text('GET BACK ON!', W / 2, 100, { s: 1, a: 'c', c: '#f4f2e8', sh: '#140c1c' });
  if (App.netNote) text(App.netNote, W / 2, 18, { a: 'c', c: '#ff8a2a', sh: '#140c1c' });
}

// ---------- event effects (sounds, puffs, messages) ----------
function flash(t, c, life = 1.2) { App.msg = { text: t, c, life, max: life }; }
function handleEvent(ev, R, vbs) {
  const me = ev.id != null && ev.id === R.localId;
  const vb = ev.id != null ? vbs.find((b) => b.id === ev.id) : null;
  const near = vb ? Math.abs(wrapD(vb.dist - App.camD, R.track.len)) < 260 : false;
  const vol = R.mode === 'demo' ? 0 : me ? 1 : near ? 0.45 : 0;
  switch (ev.e) {
    case 'count': Sound.play('count'); break;
    case 'go': Sound.play('go'); break;
    case 'crash':
      Sound.play('crash', vol);
      if (vb) { puff(vb.dist, vb.lp, vb.y, 16, '#d8a46a', 70); if (HAS_HATS()) Hats.launch(rsOf(vb.id), vb); }
      if (me) flash('WIPEOUT!', '#ff8a2a');
      break;
    case 'remount': if (vb && HAS_HATS()) Hats.recall(rsOf(vb.id), vb); Sound.play('pop', vol * 0.8); break;
    case 'land':
      if (vb) { puff(vb.dist, vb.lp, vb.y, Math.min(10, 2 + (ev.a || 0) / 15), '#d8a46a', 45); const rs = rsOf(vb.id); if (rs.wob && HAS_HATS()) Hats.kick(rs.wob, (ev.a || 0) / 60); }
      if ((ev.a || 0) > 40) Sound.play('land', vol * 0.6);
      break;
    case 'perfect':
      if (vb) { puff(vb.dist, vb.lp, vb.y, 10, '#ffd23f', 60); const rs = rsOf(vb.id); if (rs.wob && HAS_HATS()) Hats.kick(rs.wob, (ev.a || 0) / 60); }
      Sound.play('land', vol * 0.5); Sound.play('perfect', me ? 1 : 0);
      if (me) flash('PERFECT!', '#ffd23f', 0.9);
      break;
    case 'overheat': Sound.play('overheat', vol); if (me) flash('OVERHEAT!', '#e8383b', 1.6); break;
    case 'cool':
      if (vb) for (let i = 0; i < 8; i++) part(vb.dist + rnd(-8, 8), vb.lp, vb.y + rnd(2, 14), rnd(-20, 20), rnd(10, 40), 0.5, '#7fe8ff', { g: 0 });
      if (me) { Sound.play('cool'); flash('COOLED!', '#6fe3ff', 0.7); }
      break;
    case 'lap': if (me) { Sound.play('lap'); flash(ev.a === R.laps ? 'FINAL LAP' : 'LAP ' + ev.a, '#f4f2e8', 1.4); } break;
    case 'finish': if (me) { Sound.play('finish'); flash('FINISH! ' + ordinal(ev.a), '#ffd23f', 3); } break;
    case 'done': App.raceDone(R); break;
    case 'left': if (ev.a) toast(ev.a + ' left the race'); break;
  }
}

// ---------- toast ----------
let toastTimer = 0;
function toast(msg, sec = 2.6) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.style.display = 'none'), sec * 1000); }

// ---------- the app: screens, modes, loop ----------
const MENU_SCREENS = ['title', 'help', 'wardrobe', 'solo', 'join', 'lobby', 'share'];
const App = {
  scene: 'menu', screen: 'title', race: null, demo: null, paused: false, touchOn: false,
  camD: 0, camY: 0, msg: null, acc: 0, doneT: -1, resultsShown: false, lastSolo: null, netNote: '',

  init() {
    resize();
    addEventListener('resize', () => resize());
    Touch.init();
    if (matchMedia('(pointer: coarse)').matches) this.setTouch(true);
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { Sound.init(); Sound.play('click'); this.go(b.dataset.go); }));
    $('btn-help').onclick = () => this.go('help');
    $('btn-mute').onclick = () => { Sound.init(); Sound.setMute(!Settings.mute); this.refreshTitle(); };
    $('solo-start').onclick = () => this.startSolo();
    $('pause-resume').onclick = () => this.setPaused(false);
    $('pause-restart').onclick = () => { this.setPaused(false); if (this.race && this.race.mode === 'test') Editor.testRide(); else if (this.lastSolo) this.startSolo(this.lastSolo); };
    $('pause-quit').onclick = () => this.quitRace();
    addEventListener('pointerdown', () => Sound.init(), { once: false, passive: true });
    if (HAS_HATS()) Hats.initUI();
    if (typeof Editor !== 'undefined') Editor.init();
    if (Net.init) Net.init();
    this.makeDemo();
    this.go('title');
    if (Net.autoJoin) Net.autoJoin();
    requestAnimationFrame((t) => this.loop(t));
  },
  setTouch(on) {
    if (this.touchOn === on) return;
    this.touchOn = on;
    $('touch').classList.toggle('on', on && this.scene === 'race');
  },
  makeDemo() {
    const tr = pick(BUILTIN_TRACKS);
    this.demo = new Race({ mode: 'demo', track: tr, laps: 999, players: makeBots(4, []), localId: null });
    this.demo.bikes.forEach((b) => { b.skill = 0.75 + Math.random() * 0.2; });
  },
  go(name) {
    if (name === 'host') { Net.host(); return; }
    if (name === 'wardrobe-from-join' || name === 'wardrobe-from-lobby') { Hats.openWardrobe(name.slice(14)); this.showScreen('wardrobe'); return; }
    if (name === 'lobby') { this.race = null; this.showScreen('lobby'); this.setScene('menu'); Net.renderLobby(); return; }
    if (name === 'editor') { if (typeof Editor !== 'undefined') Editor.open(); else toast('Track editor comes in stage 4'); return; }
    if (name === 'wardrobe' && HAS_HATS()) Hats.openWardrobe('title');
    if (name === 'solo') this.buildSolo();
    if (name === 'title') { this.refreshTitle(); if (Net.active && !this.race) Net.leave(true); }
    if (name === 'join') { if (!Net.joining) $('join-status').textContent = ''; $('join-rider').textContent = 'Riding as ' + Profile.name; if (!this.touchOn) setTimeout(() => $('join-code').focus(), 50); }
    this.showScreen(name);
    if (MENU_SCREENS.includes(name)) this.setScene('menu');
  },
  showScreen(name) {
    this.screen = name;
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === 'scr-' + name));
  },
  setScene(s) {
    if (s !== 'race') { Sound.engineOff(); }
    this.scene = s;
    document.body.classList.toggle('racing', s === 'race');
    $('touch').classList.toggle('on', this.touchOn && s === 'race');
    $('editor-ui').classList.toggle('on', s === 'editor');
    Input.keys = 0; Input.touch = 0; Touch.ptrs.clear();
  },
  refreshTitle() {
    $('btn-mute').textContent = 'Sound: ' + (Settings.mute ? 'Off' : 'On');
    $('title-rider').textContent = 'Riding as ' + Profile.name + (Profile.hats.length ? ' + ' + Profile.hats.length + ' hat' + (Profile.hats.length > 1 ? 's' : '') : '');
  },
  buildSolo() {
    const list = $('solo-tracks'); list.innerHTML = '';
    const diffs = ['CUSTOM', 'EASY', 'MEDIUM', 'HARD'];
    if (!TrackStore.get(Settings.track)) Settings.track = 'meadow';
    for (const t of TrackStore.all()) {
      const b = document.createElement('button');
      b.innerHTML = '<span>' + esc(t.name) + '</span><span class="small">' + diffs[t.diff || 0] + '</span>';
      b.classList.toggle('sel', t.id === Settings.track);
      b.onclick = () => { Settings.track = t.id; saveSettings(); this.buildSolo(); };
      list.appendChild(b);
    }
    const laps = $('solo-laps'); laps.innerHTML = '';
    for (const n of [2, 3]) {
      const b = document.createElement('button'); b.textContent = n + ' laps'; b.classList.toggle('sel', Settings.laps === n);
      b.onclick = () => { Settings.laps = n; saveSettings(); this.buildSolo(); }; laps.appendChild(b);
    }
  },
  startSolo(setup) {
    setup = setup || { track: TrackStore.get(Settings.track) || BUILTIN_TRACKS[0], laps: Settings.laps };
    this.lastSolo = setup;
    const me = { id: 'me', name: Profile.name, color: Profile.color, hats: Profile.hats };
    const players = [me, ...makeBots(3, [Profile.color])];
    this.startRace(new Race({ mode: 'solo', track: setup.track, laps: setup.laps, players, localId: 'me', inputFor: (b) => (b.id === 'me' ? localInput() : null) }));
  },
  startRace(R) {
    Sound.init();
    this.race = R; this.paused = false; this.acc = 0; this.doneT = -1; this.resultsShown = false; this.msg = null;
    RS.clear(); Parts.length = 0;
    const me = R.localId && R.viewBikes(1).find((b) => b.id === R.localId);
    this.camD = me ? me.dist : 0; this.camY = 0;
    this.showScreen('none');
    this.setScene('race');
    if (this.touchOn && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
    }
  },
  setPaused(p) {
    this.paused = p;
    if (p) {
      const online = this.race && !['solo', 'test'].includes(this.race.mode);
      $('pause-note').textContent = online ? 'The race keeps going while this menu is open.' : '';
      $('pause-restart').style.display = online ? 'none' : '';
      $('pause-resume').textContent = online ? 'Back to race' : 'Resume';
      $('pause-quit').textContent = this.race && this.race.mode === 'test' ? 'Back to Editor' : online ? 'Leave Race' : 'Quit to Menu';
      this.showScreen('pause'); Sound.engineOff();
    } else this.showScreen('none');
  },
  quitRace() {
    const R = this.race;
    this.paused = false; this.race = null;
    if (R && R.mode === 'test') { Editor.open(true); return; }
    if (R && Net.active) { Net.leave(); }
    this.go('title');
  },
  onEscape() {
    if (this.scene === 'race') {
      if (this.screen === 'results') return;
      const online = this.race && !['solo', 'test'].includes(this.race.mode);
      if (online) { if (this.screen === 'pause') this.setPaused(false); else { this.showScreen('pause'); this.setPaused(true); this.paused = false; } }
      else this.setPaused(!this.paused);
    } else if (this.scene === 'editor') { /* editor handles its own keys */ }
    else if (this.screen === 'share') { this.showScreen('none'); this.setScene('editor'); }
    else if (this.screen !== 'title' && this.screen !== 'lobby') this.go('title');
  },
  raceDone(R) { this.doneT = 1.6; this.doneRace = R; },
  showResults(R) {
    this.resultsShown = true;
    Sound.engineOff();
    const rows = R.results || [];
    const me = rows.find((r) => r.id === R.localId);
    $('res-title').textContent = me && me.time != null ? (me.pos === 1 ? 'You win!' : 'You finished ' + ordinal(me.pos).toLowerCase()) : 'Results';
    $('res-table').innerHTML = rows.map((r) =>
      '<tr><td>' + ordinal(r.pos) + '</td><td><span style="display:inline-block;width:10px;height:10px;margin-right:8px;background:' + (COLORS[r.color] || COLORS[0]).c + '"></span>' +
      esc(r.name) + (r.bot ? ' <span class="small">CPU</span>' : '') + '</td><td class="t">' + (r.time != null ? fmtTime(r.time) : 'DNF') + '</td></tr>').join('');
    $('res-status').textContent = '';
    const btns = $('res-btns'); btns.innerHTML = '';
    const add = (label, fn, cls) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = () => { Sound.play('click'); fn(); }; btns.appendChild(b); };
    if (R.mode === 'solo') {
      add('Menu', () => this.quitRace());
      add('Change Track', () => { this.race = null; this.go('solo'); });
      add('Race Again', () => this.startSolo(this.lastSolo), 'go');
    } else if (R.mode === 'test') {
      add('Back to Editor', () => this.quitRace(), 'go');
    } else if (Net.resultsButtons) Net.resultsButtons(R, add);
    this.showScreen('results');
  },

  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const now = t / 1000;
    let dt = this.lastT ? now - this.lastT : STEP; this.lastT = now;
    if (dt > 0.1) dt = 0.1;
    try { this.update(dt, now); this.render(now); } catch (e) { console.error(e); }
    present();
  },
  update(dt, now) {
    if (Net.tick) Net.tick(dt);
    if (this.scene === 'race' && this.race) {
      const R = this.race;
      if (R.local) {
        if (!this.paused) {
          this.acc += dt;
          let n = 0;
          while (this.acc >= STEP && n < 8) {
            R.step(STEP); n++; this.acc -= STEP;
            if (R.events.length) { const vbs = R.viewBikes(1); const evs = R.events; R.events = []; for (const ev of evs) handleEvent(ev, R, vbs); }
            if (R.onStep) R.onStep();
          }
          if (n === 8) this.acc = 0;
        }
      } else R.update(dt);
      const vbs = R.viewBikes(R.local ? this.acc / STEP : 0);
      this.vbs = vbs;
      updateRS(vbs, R.track, this.paused ? 0 : dt);
      updateParticles(this.paused ? 0 : dt, R.track);
      const me = vbs.find((b) => b.id === R.localId);
      const target = me || [...vbs].sort((a, b) => b.dist - a.dist)[0];
      if (target) {
        if (me) this.camD = me.dist; else this.camD += (target.dist - this.camD) * Math.min(1, dt * 4);
        const ty = clamp((target.y - 30) * 0.6, 0, 44);
        this.camY += (ty - this.camY) * Math.min(1, dt * 5);
      }
      if (me && !this.paused && R.phase !== 'done') Sound.engine(me.state === 'crash' ? 0 : me.v, me.turbo, me.state !== 'crash' && me.state !== 'stall');
      else Sound.engineOff();
      if (this.msg) this.msg.life -= dt;
      if (this.doneT > 0) { this.doneT -= dt; if (this.doneT <= 0 && !this.resultsShown) this.showResults(this.doneRace); }
    } else if (this.scene === 'menu') {
      const D = this.demo;
      this.acc += dt; let n = 0;
      while (this.acc >= STEP && n < 8) { D.step(STEP); D.events = []; this.acc -= STEP; n++; }
      if (n === 8) this.acc = 0;
      const vbs = D.viewBikes(this.acc / STEP);
      this.vbs = vbs;
      updateRS(vbs, D.track, dt); updateParticles(dt, D.track);
      const lead = vbs.reduce((a, b) => (b.dist > a.dist ? b : a));
      this.camD += (lead.dist - this.camD) * Math.min(1, dt * 2);
      this.camY += (clamp((lead.y - 30) * 0.6, 0, 44) - this.camY) * Math.min(1, dt * 3);
    } else if (this.scene === 'editor' && typeof Editor !== 'undefined') Editor.update(dt);
  },
  render(now) {
    if (this.scene === 'race' && this.race) {
      const R = this.race;
      renderWorld(R.track, this.camD, this.camY, this.vbs, now);
      drawHUD(R, this.vbs, this.vbs.find((b) => b.id === R.localId), now);
    } else if (this.scene === 'menu' && this.demo) {
      renderWorld(this.demo.track, this.camD, this.camY, this.vbs, now);
    } else if (this.scene === 'editor' && typeof Editor !== 'undefined') Editor.render(now);
  },
};

window.addEventListener('load', () => App.init());
