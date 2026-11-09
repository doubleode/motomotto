'use strict';
/* =====================================================================
   Hat Trick Moto — game.js
   Canvas + pixel font, input, sound, bike physics, computer riders, the
   race (with ghosts for online riders), drawing, HUD, menus, main loop.
   Loaded last.
   ===================================================================== */

// ---------- helpers ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const wrapA = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);   // angle into -PI..PI
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
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------- constants ----------
const H = 270;
let W = 480;                 // internal width adapts to the screen shape
const GROUND_ROW = 206;      // screen row where the camera's height target sits
const STEP = 1 / 60;         // fixed physics step
const IN = { THR: 1, BRK: 4, LB: 16, LF: 32 };
const PHYS = {
  g: 250,                          // gravity (pixels per second²) — on the floaty side, for big air
  acc: 300, vMax: 390,             // gas: pull, and the speed where the engine runs out of pull
  brake: 420, roll: 14, drag: 0.0005,
  pump: 70,                        // lean forward on a downslope = a little extra speed
  absorb: 16000,                   // lean forward to soak up rollers instead of launching off them
  mudDrag: 320, mudMax: 110,
  pop: 44, scrub: 0.3,             // lean back on a lip to pop higher, forward to scrub low and fast
  rotRate: 4.6, rotAcc: 12, rotDamp: 2.5,   // spinning the bike in the air
  assist: 1.8, assistLean: 0.45,   // the bike gently follows its arc through the air
  crashTol: 0.8,                   // land more than ~45° off the slope and you go down
  perfectTol: 0.18, perfectBoost: 24, flipBoost: 40,
  crashTime: 2,
};
const COLORS = [
  { name: 'Red', c: '#e8383b' }, { name: 'Blue', c: '#3b78e8' }, { name: 'Green', c: '#3fbf4a' }, { name: 'Yellow', c: '#f2c230' },
  { name: 'Orange', c: '#f07a2a' }, { name: 'Purple', c: '#9b4be8' }, { name: 'Pink', c: '#f25fae' }, { name: 'Teal', c: '#2ec4c4' },
];
const BOT_NAMES = ['Dusty', 'Moxie', 'Gravel Gus', 'Rocket Rae', 'Mudslinger', 'Pip', 'Loopy Lou', 'Captain Revs', 'Nitro Nell', 'Bumpy', 'Skidmore', 'Clutch'];

// ---------- saved profile & settings ----------
const Profile = (() => {
  const p = Store.get('htm_profile', null) || {};
  return {
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 12) : 'Rider' + (10 + Math.floor(Math.random() * 90)),
    color: p.color >= 0 && p.color < COLORS.length ? p.color | 0 : Math.floor(Math.random() * COLORS.length),
    rider: typeof p.rider === 'string' ? p.rider : pick(['ace', 'blaze', 'bolt', 'checkers', 'nova', 'moss']),
  };
})();
function saveProfile() { Store.set('htm_profile', Profile); }
const Settings = Object.assign({ track: 'meadow', mute: false }, Store.get('htm_settings', {}));
function saveSettings() { Store.set('htm_settings', Settings); }

// ---------- canvas ----------
const view = $('game'), vctx = view.getContext('2d');
const buf = document.createElement('canvas');
const ctx = buf.getContext('2d');
let K = 1, SCALE = 1;
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
function present() { vctx.imageSmoothingEnabled = false; vctx.drawImage(buf, 0, 0, W * K, H * K); }
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
const Input = { keys: 0, touch: 0 };
const KEYMAP = {
  KeyZ: IN.THR, Space: IN.THR, ArrowUp: IN.THR, KeyW: IN.THR,
  KeyX: IN.BRK, ArrowDown: IN.BRK, KeyS: IN.BRK, ArrowLeft: IN.LB, KeyA: IN.LB, ArrowRight: IN.LF, KeyD: IN.LF,
};
const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'); };
addEventListener('keydown', (e) => {
  Sound.init();
  if (typing(e)) { if (e.code === 'Escape') e.target.blur(); return; }
  const b = KEYMAP[e.code];
  if (b && (App.scene === 'race' || App.scene === 'editor')) { e.preventDefault(); Input.keys |= b; }
  if (e.code === 'Escape') App.onEscape();
  if (App.scene === 'editor') Editor.key(e);
});
addEventListener('keyup', (e) => { const b = KEYMAP[e.code]; if (b) Input.keys &= ~b; });
addEventListener('blur', () => { Input.keys = 0; Input.touch = 0; Touch.ptrs.clear(); });
function localInput() { return { bits: App.screen === 'pause' ? 0 : Input.keys | Input.touch }; }

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
      Input.touch = bits;
      for (const el of btns) el.classList.toggle('down', !!(bits & +el.dataset.b));
    };
    addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') App.setTouch(true);
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
      case 'go': this.tone(880, 0.5, { vol: 0.2 * vol }); this.noise(0.25, { vol: 0.2 * vol, f: 900 }); break;
      case 'crash': this.noise(0.55, { vol: 0.45 * vol, f: 2500, fto: 180 }); this.tone(130, 0.35, { type: 'triangle', vol: 0.35 * vol, to: 40 }); break;
      case 'land': this.tone(95, 0.12, { type: 'sine', vol: 0.45 * vol, to: 45 }); this.noise(0.12, { vol: 0.15 * vol, f: 900 }); break;
      case 'perfect': this.tone(660, 0.08, { vol: 0.13 * vol }); this.tone(990, 0.14, { vol: 0.13 * vol, delay: 0.07 }); break;
      case 'flip': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.09, { vol: 0.13 * vol, delay: i * 0.06 })); break;
      case 'finish': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.4 : 0.12, { vol: 0.16 * vol, delay: i * 0.11 })); break;
      case 'pop': this.tone(900, 0.06, { vol: 0.1 * vol, to: 1700 }); break;
      case 'bonk': this.tone(320, 0.05, { vol: 0.06 * vol, to: 200 }); break;
      case 'click': this.tone(700, 0.04, { vol: 0.06 * vol }); break;
    }
  },
  engine(v, gas, on) {
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
    const base = 38 + v * 0.34 + (gas ? 8 : 0);
    e.o1.frequency.setTargetAtTime(base, t, 0.06);
    e.o2.frequency.setTargetAtTime(base * 0.5, t, 0.06);
    e.lfo.frequency.setTargetAtTime(base * 0.25, t, 0.06);
    e.f.frequency.setTargetAtTime(500 + v * 4.5, t, 0.08);
    e.g.gain.setTargetAtTime(on ? (gas ? 0.11 : 0.06) : 0, t, 0.05);
  },
  engineOff() { if (this.eng) this.eng.g.gain.setTargetAtTime(0, this.ac.currentTime, 0.05); },
};

// =====================================================================
// BIKE PHYSICS
// On the ground a bike has one speed along the slope: gravity speeds it
// up downhill and slows it uphill. When the ground falls away faster than
// the bike would fall (a jump lip or the top of a roller), it takes off.
// In the air you spin the bike; land with it lined up with the slope and
// you keep your speed — land across the slope and you lose it, or crash.
// =====================================================================
function newBike(p) {
  return {
    id: p.id, name: p.name, color: p.color | 0, char: p.char || 'ace', bot: !!p.bot, skill: p.skill || 0.7,
    x: 0, y: 0, s: 0, vx: 0, vy: 0, air: false, ang: 0, om: 0, wh: 0, lean: 0,
    heat: 0, state: 'ride', st: 0, inv: 0, finished: false, finishTime: 0, place: 0,
    airT: 0, rot: 0, combo: 0, gas: false, input: 0, ai: null,
    rider: { x: 0, y: 0, vx: 0, vy: 0, rot: 0, ph: 0, flip: 0 },
    px: 0, py: 0, pang: 0, pwh: 0, prx: 0, pry: 0, prr: 0,
  };
}
function placeBike(b, T, x) {
  Object.assign(b, { x, y: trackH(T, x), s: 0, vx: 0, vy: 0, air: false, ang: groundAng(T, x), om: 0, wh: 0, heat: 0, state: 'ride',
    st: 0, inv: 0, finished: false, finishTime: 0, place: 0, airT: 0, rot: 0, combo: 0, gas: false });
  b.px = b.x; b.py = b.y; b.pang = b.ang; b.pwh = 0; b.prx = b.rider.x = x; b.pry = b.rider.y = b.y; b.prr = 0;
  return b;
}

function stepBike(b, dt, R) {
  const T = R.track;
  if (b.inv > 0) b.inv -= dt;
  if (b.state === 'crash') { stepCrash(b, dt, R); return; }
  const racing = R.phase === 'race';
  const inp = racing && !b.finished ? b.input : 0;
  const L = (inp & IN.LB ? 1 : 0) - (inp & IN.LF ? 1 : 0);
  b.lean = L;
  const thr = racing && b.state === 'ride' && !b.finished && !!(inp & IN.THR);
  b.gas = thr && !b.air;
  if (b.air) airStep(b, dt, R, L);
  else groundStep(b, dt, R, L, thr, inp);
  if (b.state === 'crash') return;

  if (racing && !b.finished && b.x >= T.finishX) {
    b.finished = true; b.finishTime = R.time; b.place = R.placeFor(b); R.ev('finish', b, b.place);
  }
}

function groundStep(b, dt, R, L, thr, inp) {
  const T = R.track;
  const th = Math.atan(trackSlope(T, b.x));
  let a = 0;
  if (thr && b.s < PHYS.vMax) a += PHYS.acc * (1 - Math.max(0, b.s) / PHYS.vMax);
  const braking = !!(inp & IN.BRK) || b.finished;
  if (braking) a -= Math.sign(b.s) * (b.finished ? 220 : PHYS.brake);
  a -= PHYS.g * Math.sin(th);
  if (L < 0 && th < -0.08) a += PHYS.pump * -Math.sin(th);
  if (Math.abs(b.s) > 1) a -= Math.sign(b.s) * PHYS.roll;
  a -= PHYS.drag * b.s * Math.abs(b.s);
  if (surfAt(T, b.x) === SURF.mud && b.s > PHYS.mudMax) a -= PHYS.mudDrag;
  const s0 = b.s;
  b.s += a * dt;
  if (braking && s0 !== 0 && Math.sign(b.s) !== Math.sign(s0)) b.s = 0;   // brakes stop you, they don't reverse you

  const y0 = b.y;
  b.x = clamp(b.x + b.s * Math.cos(th) * dt, 2, T.len - 2);
  const g1 = trackH(T, b.x);
  // Does the ground curve away faster than gravity can pull us round it? Then we fly.
  // (A jump lip is a very sharp curve, a roller crest a gentle one.)
  const xa = b.x + 3, d1 = (trackH(T, xa + 6) - trackH(T, xa - 6)) / 12;
  const d2 = (trackH(T, xa + 6) - 2 * trackH(T, xa) + trackH(T, xa - 6)) / 36;
  const lift = b.s * b.s * (-d2 / Math.pow(1 + d1 * d1, 1.5)) - PHYS.g * Math.cos(th);
  const vy = b.s * Math.sin(th);
  if (b.s > 45 && lift > (L < 0 ? PHYS.absorb : 0) && clearAhead(T, b.x, g1, b.s * Math.cos(th), vy)) {
    b.air = true; b.y = Math.max(g1, y0 + vy * dt); b.vx = b.s * Math.cos(th); b.vy = vy;
    b.ang = th + b.wh; b.wh = 0; b.om = 0; b.airT = 0; b.rot = 0;
    if (L > 0) b.vy += PHYS.pop;                                   // preload: pop higher
    else if (L < 0 && b.vy > 0) { b.vy *= 1 - PHYS.scrub; b.vx += 12; }   // scrub: stay low and fast
    return;
  }
  b.y = g1;
  // wheelie when leaning back
  const tw = L > 0 && b.s > 30 ? (thr ? 0.42 : 0.2) : 0;
  b.wh += (tw - b.wh) * Math.min(1, dt * (tw > b.wh ? 4 : 8));
  // the bike's pitch follows the ground under both wheels
  b.ang += wrapA(groundAng(T, b.x) - b.ang) * Math.min(1, dt * 22);
}

// Make sure the ground really drops away under the arc we'd fly (and we're
// not just at a kink partway up a jump face).
function clearAhead(T, x, y, vx, vy) {
  for (let k = 1; k <= 4; k++) {
    const t = k * STEP;
    if (y + vy * t - 0.5 * PHYS.g * t * t < trackH(T, x + vx * t) - 0.2) return false;
  }
  return true;
}

function airStep(b, dt, R, L) {
  const T = R.track;
  b.airT += dt;
  b.vy -= PHYS.g * dt;
  b.x = clamp(b.x + b.vx * dt, 2, T.len - 2); b.y += b.vy * dt;
  if (L) b.om += (L * PHYS.rotRate - b.om) * Math.min(1, PHYS.rotAcc * dt);
  else b.om -= b.om * Math.min(1, PHYS.rotDamp * dt);
  const a0 = b.ang;
  let a1 = a0 + b.om * dt;
  if (b.vx > 20) {
    const d = wrapA(Math.atan2(b.vy, b.vx) - a1);
    if (Math.abs(d) < 1.3) a1 += d * (L ? PHYS.assistLean : PHYS.assist) * dt;
  }
  b.rot += a1 - a0;
  b.ang = wrapA(a1);
  const g1 = trackH(T, b.x);
  if (b.y <= g1) landBike(b, R, g1);
}

function landBike(b, R, g1) {
  const T = R.track;
  const tt = Math.atan(trackSlopeC(T, b.x));
  const d = Math.abs(wrapA(b.ang - tt));
  const vx = b.vx, vy = b.vy;
  const vt = vx * Math.cos(tt) + vy * Math.sin(tt);
  const vn = -vx * Math.sin(tt) + vy * Math.cos(tt);   // negative = slamming into the ground
  const airT = b.airT, rot = b.rot;
  b.air = false; b.y = g1; b.om = 0;
  if (b.state === 'ride' && b.inv <= 0 && !b.finished && airT > 0.08 && d > PHYS.crashTol) { crashBike(b, R, vx, vy); return; }
  const m = Math.min(1, d / PHYS.crashTol);
  b.s = airT < 0.1 ? Math.max(vt, 0.92 * Math.hypot(vx, vy)) : vt * (1 - 0.45 * m * m);   // tiny hops keep their speed
  b.ang = tt;
  if (airT < 0.12) return;
  const flips = Math.abs(rot) > 5.2 ? Math.max(1, Math.round(Math.abs(rot) / TAU)) : 0;
  if (flips && b.state !== 'crash' && !b.finished) {
    b.s += PHYS.flipBoost * flips; b.combo++;
    R.ev('flip', b, rot > 0 ? flips : -flips);
  } else if (d < PHYS.perfectTol && airT > 0.35 && tt < -0.1 && !b.finished) {
    b.combo++; b.s += PHYS.perfectBoost; R.ev('perfect', b, b.combo);
  } else if (airT > 0.35) b.combo = 0;
  R.ev('land', b, Math.round(-vn));
}

function crashBike(b, R, vx, vy) {
  b.state = 'crash'; b.st = 0; b.gas = false; b.combo = 0; b.wh = 0;
  const r = b.rider;
  Object.assign(r, { x: b.x, y: b.y + 24, vx: Math.max(30, vx * 0.7 + 30), vy: Math.max(70, Math.abs(vy) * 0.25 + 70), rot: 0, ph: 0, flip: 0 });
  // the bike cartwheels on down the track
  b.air = true; b.vx = vx * 0.55; b.vy = 60 + Math.abs(vy) * 0.1; b.om = (Math.random() < 0.5 ? -1 : 1) * 7;
  b.y = trackH(R.track, b.x) + 1;
  R.ev('crash', b);
}

function stepCrash(b, dt, R) {
  const T = R.track;
  b.st += dt;
  if (b.air) {
    b.vy -= PHYS.g * dt; b.x = clamp(b.x + b.vx * dt, 2, T.len - 2); b.y += b.vy * dt; b.ang = wrapA(b.ang + b.om * dt);
    const g = trackH(T, b.x);
    if (b.y <= g) {
      b.y = g;
      if (b.vy < -90) { b.vy = -b.vy * 0.3; b.vx *= 0.6; b.om *= 0.5; } else { b.air = false; b.s = b.vx * 0.5; }
    }
  } else {
    b.s -= Math.sign(b.s) * Math.min(Math.abs(b.s), 320 * dt);
    b.x = clamp(b.x + b.s * Math.cos(Math.atan(trackSlope(T, b.x))) * dt, 2, T.len - 2);
    b.y = trackH(T, b.x);
    b.ang += wrapA(groundAng(T, b.x) - b.ang) * Math.min(1, dt * 10);
  }
  const r = b.rider;
  if (r.ph === 0) {        // flying off the bike
    r.vy -= PHYS.g * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.rot += 9 * dt;
    const g = trackH(T, r.x);
    if (r.y <= g) { r.y = g; if (r.vy < -70) { r.vy = -r.vy * 0.35; r.vx *= 0.7; } else { r.ph = 1; r.vy = 0; } }
  } else if (r.ph === 1) { // sliding to a stop
    r.vx = Math.max(0, r.vx - 300 * dt); r.x += r.vx * dt; r.y = trackH(T, r.x); r.rot += r.vx * dt * 0.08;
    if (r.vx <= 0) { r.ph = 2; r.rot = 0; }
  } else if (r.ph === 2) { // running back to the bike
    const d = b.x - r.x; r.flip = d < 0 ? 1 : 0;
    const sp = 130 * dt;
    if (Math.abs(d) <= sp) { r.x = b.x; r.ph = 3; r.flip = 0; } else r.x += Math.sign(d) * sp;
    r.y = trackH(T, r.x);
  } else { r.x = b.x; r.y = b.y; }
  if ((r.ph === 3 && b.st >= PHYS.crashTime && !b.air) || b.st > 3.6) {
    Object.assign(b, { state: 'ride', inv: 1.0, air: false, s: 0, vx: 0, vy: 0, om: 0, wh: 0 });
    b.y = trackH(T, b.x); b.ang = groundAng(T, b.x); r.x = b.x; r.y = b.y; r.ph = 3;
    R.ev('remount', b);
  }
}

// ---------- computer riders ----------
function predictLanding(b, T) {
  let x = b.x, y = b.y, vy = b.vy, t = 0;
  for (let i = 0; i < 300; i++) {
    vy -= PHYS.g * STEP; x += b.vx * STEP; y += vy * STEP; t += STEP;
    if (y <= trackH(T, x)) return { tt: Math.atan(trackSlopeC(T, x)), t };
  }
  return { tt: 0, t: 5 };
}
function aiControl(b, R) {
  if (!b.ai) b.ai = { err: 0, wasAir: false, tick: 0, lean: 0 };
  const A = b.ai, T = R.track;
  if (R.phase !== 'race' || b.finished || b.state === 'crash') { b.input = 0; return; }
  let bits = IN.THR;
  // ease off before jumps we'd sail clean over (sloppier riders brake a bit late)
  if (!b.air) for (const z of T.zones) if (b.x >= z.x0 && b.x < z.x1 && b.s > z.v * (0.97 + (1 - b.skill) * 0.1)) { bits = IN.BRK; break; }
  if (b.air) {
    if (!A.wasAir) {
      A.wasAir = true; A.tick = 0;
      A.err = (Math.random() - 0.5) * (1 - b.skill) * 2.4;
      if (Math.random() < (1 - b.skill) * 0.18) A.err = (Math.random() < 0.5 ? -1 : 1) * rnd(0.9, 1.15);   // the odd big mistake
    }
    if (--A.tick <= 0) {
      A.tick = 1 + Math.round((1 - b.skill) * 4);   // less skilled riders react less often
      const p = predictLanding(b, T);
      const d = wrapA(p.tt + A.err - (b.ang + b.om * Math.min(p.t, 0.25)));
      A.lean = d > 0.07 ? 1 : d < -0.07 ? -1 : 0;
    }
    if (A.lean > 0) bits |= IN.LB; else if (A.lean < 0) bits |= IN.LF;
  } else {
    A.wasAir = false;
    // soak up rollers and whoops instead of getting bucked off them
    const pi = pieceAt(T, b.x + 30);
    const id = pi >= 0 ? T.ids[pi] : '';
    if ((id === 'rollers' || id === 'whoops') && b.skill > 0.55) bits |= IN.LF;
  }
  b.input = bits;
}

// =====================================================================
// GHOSTS: other online riders. We only receive their state ~20 times a
// second, so we draw them a tenth of a second in the past and slide
// smoothly between updates. Riders pass through each other.
// =====================================================================
const STATES = ['ride', 'stall', 'crash'];
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
function packBike(b) {
  const r = b.rider, c = b.state === 'crash';
  return [r1(b.x), r1(b.y), r2(b.ang), r2(b.wh), Math.round(b.s), STATES.indexOf(b.state), Math.round(b.heat), b.finished ? r2(b.finishTime) || 0.01 : 0,
    b.lean, (b.air ? 1 : 0) | (b.gas ? 2 : 0) | (b.inv > 0 ? 4 : 0), c ? r1(r.x) : 0, c ? r1(r.y) : 0, c ? r2(r.rot) : 0, c ? r.ph : 0, r.flip ? 1 : 0];
}
function unpackBike(a) {
  if (!Array.isArray(a)) return null;
  const n = (i) => num(a[i]);
  return { x: n(0), y: n(1), ang: n(2), wh: n(3), s: n(4), state: STATES[n(5)] || 'ride', heat: n(6), finished: n(7) > 0, finishTime: n(7),
    lean: clamp(n(8), -1, 1), air: !!(n(9) & 1), gas: !!(n(9) & 2), inv: n(9) & 4 ? 1 : 0,
    rider: { x: n(10), y: n(11), rot: n(12), ph: n(13), flip: n(14) } };
}
const INTERP = 0.11;
class Ghost {
  constructor(meta) { this.meta = meta; this.buf = []; this.seen = performance.now(); }
  push(arr) {
    const s = unpackBike(arr); if (!s) return;
    this.buf.push({ t: performance.now() / 1000, s }); if (this.buf.length > 40) this.buf.shift();
    this.raw = arr; this.seen = performance.now();
  }
  latest() { return this.buf.length ? this.buf[this.buf.length - 1].s : null; }
  view(now) {
    const B = this.buf; if (!B.length) return null;
    const rt = now - INTERP;
    let a = B[0], b = B[B.length - 1];
    if (rt <= a.t) b = a;
    else for (let i = B.length - 1; i > 0; i--) if (B[i - 1].t <= rt) { a = B[i - 1]; b = B[i]; break; }
    const k = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1.3) : 1, k1 = Math.min(k, 1);
    const p = a.s, q = b.s;
    if (Math.abs(q.x - p.x) > 140) return Object.assign({}, q);
    const v = Object.assign({}, q, { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k1), ang: p.ang + wrapA(q.ang - p.ang) * k1, wh: lerp(p.wh, q.wh, k1) });
    if (p.state === 'crash' && q.state === 'crash')
      v.rider = { x: lerp(p.rider.x, q.rider.x, k1), y: lerp(p.rider.y, q.rider.y, k1), rot: lerp(p.rider.rot, q.rider.rot, k1), ph: q.rider.ph, flip: q.rider.flip };
    return v;
  }
}

// =====================================================================
// THE RACE. Bikes in `sim` are simulated here (your bike, plus computer
// riders in solo or when you host). Everyone else is a ghost.
// =====================================================================
const byPos = (a, b) => (a.finished && b.finished ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.x - a.x);
class Race {
  constructor(o) {
    this.mode = o.mode;                    // solo | test | host | client | demo
    this.src = o.track;
    this.track = compileTrack(o.track);
    this.localId = o.localId || null;
    this.inputFor = o.inputFor || (() => null);
    this.phase = o.mode === 'demo' ? 'race' : 'countdown';
    this.cd = 0; this.time = 0; this.events = []; this.results = null;
    this.firstFinish = -1; this.humansDoneAt = -1;
    this.startX = o.startX || this.track.startX;
    this.sim = []; this.ghosts = new Map(); this.meta = new Map();
    for (const p of o.players) {
      const meta = { id: p.id, name: p.name, color: (p.color | 0) % COLORS.length, char: p.char || 'ace', bot: !!p.bot };
      this.meta.set(p.id, meta);
      if (p.id === this.localId || (p.bot && o.mode !== 'client')) this.sim.push(placeBike(newBike(Object.assign({}, p, meta)), this.track, this.startX));
      else this.ghosts.set(p.id, new Ghost(meta));
    }
    if (o.elapsed > 0) { this.phase = 'race'; this.time = o.elapsed; this.cd = 9; }
  }
  ev(e, b, a) { this.events.push(a === undefined ? { e, id: b ? b.id : null } : { e, id: b ? b.id : null, a }); }
  bike(id) { return this.sim.find((b) => b.id === id) || null; }
  removePlayer(id) { this.sim = this.sim.filter((b) => b.id !== id); this.ghosts.delete(id); }
  entries() {
    const out = [];
    for (const b of this.sim) out.push({ id: b.id, bot: b.bot, x: b.x, finished: b.finished, finishTime: b.finishTime });
    for (const [id, g] of this.ghosts) { const s = g.latest(); out.push({ id, bot: g.meta.bot, x: s ? s.x : 0, finished: !!(s && s.finished), finishTime: s ? s.finishTime : 0 }); }
    return out;
  }
  standings() { return this.entries().sort(byPos); }
  placeFor(b) { return this.entries().filter((e) => e.id !== b.id && e.finished && e.finishTime <= b.finishTime).length + 1; }
  step(dt) {
    if (this.phase === 'countdown') {
      const p = this.cd; this.cd += dt;
      for (const t of [0.6, 1.6, 2.6]) if (p < t && this.cd >= t) this.ev('count');
      if (this.cd >= 3.6) { this.phase = 'race'; this.ev('go'); }
    } else if (this.phase === 'race') this.time += dt;
    for (const b of this.sim) {
      b.px = b.x; b.py = b.y; b.pang = b.ang; b.pwh = b.wh; b.prx = b.rider.x; b.pry = b.rider.y; b.prr = b.rider.rot;
      if (b.bot) aiControl(b, this); else { const i = this.inputFor(b); b.input = i ? i.bits | 0 : 0; }
      stepBike(b, dt, this);
    }
    if (this.mode === 'demo') { if (this.sim.some((b) => b.x > this.track.finishX + 160)) this.restartDemo(); return; }
    if (this.phase === 'race' && this.mode !== 'client') this.checkEnd();
  }
  restartDemo() { for (const b of this.sim) { placeBike(b, this.track, this.startX); b.ai = null; } this.time = 0; RS.clear(); }
  checkEnd() {
    const E = this.entries(), humans = E.filter((e) => !e.bot), fin = E.filter((e) => e.finished);
    if (fin.length && this.firstFinish < 0) this.firstFinish = this.time;
    const humansDone = humans.length > 0 && humans.every((e) => e.finished);
    if (humansDone && this.humansDoneAt < 0) this.humansDoneAt = this.time;
    const wait = this.mode === 'test' ? 1.2 : 3;
    if (fin.length === E.length || (humansDone && this.time - this.humansDoneAt > wait) || (this.firstFinish >= 0 && this.time - this.firstFinish > 40) || !humans.length) this.end();
  }
  end() {
    this.phase = 'done';
    this.results = this.standings().map((e, i) => {
      const m = this.meta.get(e.id) || {};
      return { id: e.id, name: m.name, color: m.color, char: m.char, pos: i + 1, time: e.finished ? e.finishTime : null, bot: !!m.bot };
    });
    this.ev('done');
  }
  viewBikes(alpha, now) {
    const out = [];
    for (const b of this.sim) {
      const jump = Math.abs(b.x - b.px) > 60;
      out.push({
        id: b.id, name: b.name, color: b.color, char: b.char, bot: b.bot,
        x: jump ? b.x : lerp(b.px, b.x, alpha), y: jump ? b.y : lerp(b.py, b.y, alpha),
        ang: b.pang + wrapA(b.ang - b.pang) * alpha, wh: lerp(b.pwh, b.wh, alpha),
        s: b.s, state: b.state, air: b.air, gas: b.gas, inv: b.inv, lean: b.lean, heat: b.heat, finished: b.finished, finishTime: b.finishTime,
        rider: { x: lerp(b.prx, b.rider.x, alpha), y: lerp(b.pry, b.rider.y, alpha), rot: lerp(b.prr, b.rider.rot, alpha), ph: b.rider.ph, flip: b.rider.flip },
      });
    }
    for (const [id, g] of this.ghosts) {
      const v = g.view(now); if (!v) continue;
      Object.assign(v, { id, name: g.meta.name, color: g.meta.color, char: g.meta.char, bot: g.meta.bot });
      out.push(v);
    }
    return out;
  }
}

function makeBots(n, usedColors) {
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const free = COLORS.map((_, i) => i).filter((i) => !usedColors.includes(i)).sort(() => Math.random() - 0.5);
  const out = [];
  for (let i = 0; i < n; i++) {
    const color = free.length ? free.shift() : Math.floor(Math.random() * COLORS.length);
    out.push({ id: 'cpu' + i + '_' + Math.floor(Math.random() * 1e6), name: names[i % names.length], color, bot: true,
      skill: 0.55 + Math.random() * 0.4, char: pick(RIDER_IDS) });
    usedColors.push(color);
  }
  return out;
}

// =====================================================================
// EFFECTS: wheel spin, suspension bounce, dust, smoke — worked out from
// what each bike is doing, so ghosts get them too.
// =====================================================================
const RS = new Map();
function rsOf(id) {
  let r = RS.get(id);
  if (!r) { r = { wr: 0, sq: 0, sqv: 0, air: false, airT: 0, state: 'ride', dustT: 0, smokeT: 0, steamT: 0 }; RS.set(id, r); }
  return r;
}
const Parts = [];
function part(x, y, vx, vy, life, col, o = {}) {
  if (Parts.length > 500) Parts.shift();
  Parts.push({ x, y, vx, vy, life, max: life, col, sz: o.sz || 1, g: o.g == null ? 260 : o.g });
}
function puff(x, y, n, col, spread = 60, up = 70) {
  for (let i = 0; i < n; i++) part(x + rnd(-6, 6), y + rnd(0, 3), rnd(-spread, spread), rnd(up * 0.3, up), rnd(0.25, 0.6), col, { sz: Math.random() < 0.4 ? 2 : 1 });
}
function updateParticles(dt, T) {
  for (let i = Parts.length - 1; i >= 0; i--) {
    const p = Parts[i];
    p.life -= dt;
    if (p.life <= 0) { Parts.splice(i, 1); continue; }
    p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (T && p.g > 0) { const g = trackH(T, p.x); if (p.y < g) { p.y = g; p.vy *= -0.3; p.vx *= 0.5; } }
  }
}
// where the rear tyre touches the ground, in the world
function rearContact(vb) { const a = vb.ang; return { x: vb.x - BIKE.half * Math.cos(a), y: vb.y - BIKE.half * Math.sin(a) }; }
function updateRS(vbs, T, dt, localId) {
  for (const vb of vbs) {
    const rs = rsOf(vb.id);
    rs.wr += vb.state === 'crash' ? 0 : (vb.air ? 4 : Math.abs(vb.s) / 7) * dt;
    if (rs.air && !vb.air && vb.state !== 'crash' && rs.airT > 0.15) {
      const rc = rearContact(vb);
      puff(rc.x + 10, rc.y, Math.min(14, 3 + rs.airT * 10), '#d8a46a', 70, 80);
      rs.sqv += Math.min(70, 25 + rs.airT * 40);
    }
    rs.airT = vb.air ? rs.airT + dt : 0; rs.air = vb.air;
    if (vb.state === 'crash' && rs.state !== 'crash') {
      puff(vb.x, vb.y, 22, '#d8a46a', 90, 110);
      const near = Math.abs(vb.x - App.camX - W / 2) < W;
      if (vb.id !== localId && near && App.race && App.race.mode !== 'demo') Sound.play('crash', 0.35);
    }
    rs.state = vb.state;
    rs.sqv += (-260 * rs.sq - 16 * rs.sqv) * dt; rs.sq += rs.sqv * dt;
    if (!vb.air && vb.state !== 'crash' && Math.abs(vb.s) > 30) {
      rs.dustT -= dt * (vb.gas ? 1.8 : 0.5) * (Math.abs(vb.s) / 180);
      if (rs.dustT <= 0) {
        rs.dustT = 0.035;
        const rc = rearContact(vb), mud = surfAt(T, rc.x) === SURF.mud;
        const sp = vb.gas ? 1.2 : 0.8;
        part(rc.x - 4, rc.y + 2, -vb.s * 0.25 * sp + rnd(-20, 20), rnd(20, 70) * sp, rnd(0.25, 0.5), mud ? '#4e2c14' : Math.random() < 0.5 ? '#d8a46a' : '#c4884e', { sz: vb.gas && Math.random() < 0.4 ? 2 : 1 });
      }
    }
    if (vb.state !== 'crash') {
      rs.smokeT -= dt * (vb.gas ? 1.6 : 0.6);
      if (rs.smokeT <= 0) {
        rs.smokeT = 0.12;
        const a = vb.ang, ex = vb.x - 25 * Math.cos(a) - 18 * Math.sin(a), ey = vb.y - 25 * Math.sin(a) + 18 * Math.cos(a);
        part(ex, ey, -30 + rnd(-10, 10), rnd(5, 20), rnd(0.3, 0.6), '#c8c8d0', { g: -20, sz: vb.gas && Math.random() < 0.5 ? 2 : 1 });
      }
    }
  }
}

// =====================================================================
// DRAWING
// =====================================================================
const BG = { built: false };
function buildBG() {
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
    const s = mk(192, 50), q = s.getContext('2d');
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
    for (let i = 0; i < 192; i++) { q.fillStyle = (i >> 3) & 1 ? '#e8383b' : '#f4f2e8'; q.fillRect(i, 0, 1, 6); if (((i >> 2) & 1) === 0) q.fillRect(i, 6, 1, 2); }
    q.fillStyle = '#24305e'; q.fillRect(0, 44, 192, 6); q.fillStyle = '#6a7ac8'; q.fillRect(0, 44, 192, 2);
    return s;
  });
  // underground: layered dirt that repeats
  c = mk(64, 48); x = c.getContext('2d');
  for (let j = 0; j < 48; j++) { x.fillStyle = j % 24 < 12 ? '#7c4626' : '#71401f'; x.fillRect(0, j, 64, 1); }
  for (let j = 0; j < 48; j += 12) { x.fillStyle = '#65381c'; x.fillRect(0, j, 64, 1); }
  for (let i = 0; i < 46; i++) { const hv = hash(i * 977 + 13); x.fillStyle = hv & 1 ? '#8a5230' : '#5a321a'; x.fillRect(hv % 64, (hv >> 7) % 48, 1 + ((hv >> 13) & 1), 1); }
  BG.dirt = ctx.createPattern(c, 'repeat');
  BG.built = true;
}
function tileH(c, par, camX, y) {
  const w = c.width; for (let x = -mod(Math.round(camX * par), w); x < W; x += w) ctx.drawImage(c, x, y);
}
function drawSky(camX, camY, now) {
  if (!BG.built) buildBG();
  const by = clamp(camY * 0.15, -40, 50);
  const bands = [['#4fb8ec', 0, 30], ['#62c3f0', 30, 22], ['#78cdf2', 52, 16], ['#92d8f5', 68, 12], ['#ade3f8', 80, 200]];
  for (const [c, y, h] of bands) { ctx.fillStyle = c; ctx.fillRect(0, y, W, h); }
  const sp = 150, off = camX * 0.05 + now * 3;
  for (let k = Math.floor(off / sp) - 1; k < Math.floor(off / sp) + W / sp + 2; k++) {
    const hv = hash(k * 31 + 5), x = Math.round(k * sp - off + (hv % 50)), y = 16 + ((hv >> 8) % 34) + Math.round(by * 0.2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 26, 5); ctx.fillRect(x + 5, y - 4, 13, 4); ctx.fillRect(x + 9, y - 7, 7, 3);
    ctx.fillStyle = '#d8eef8'; ctx.fillRect(x + 2, y + 5, 22, 2);
  }
  tileH(BG.mtn, 0.1, camX, Math.round(40 + by * 0.4));
  const hy = Math.round(64 + by * 0.7);
  tileH(BG.hills, 0.22, camX, hy);
  ctx.fillStyle = '#4c9a44'; ctx.fillRect(0, hy + 46, W, H);
  const sy = Math.round(80 + by);
  tileH(BG.stand[(now * 2.5 | 0) & 1], 0.45, camX, sy);
  ctx.fillStyle = '#3f8a3c'; ctx.fillRect(0, sy + 50, W, H);
}
// Trackside bank, fence and banners — they follow a smoothed copy of the ground.
const BANNERS = [['#e8383b', '#ffd23f'], ['#3b78e8', '#f4f2e8'], ['#46c84a', '#ffd23f'], ['#8a3ce0', '#ff8fc8'], ['#140c1c', '#ff8a2a']];
function drawFence(T, camX, camY) {
  for (let sx = 0; sx < W; sx++) {
    const wx = camX + sx, i = clamp(wx, 0, T.len);
    const fy = GROUND_ROW - Math.round(T.fence[i] + 26) + camY;
    if (fy >= H) continue;
    ctx.fillStyle = mod(wx, 48) < 24 ? '#4c9a44' : '#469040'; ctx.fillRect(sx, fy + 10, 1, H - fy);
    const bi = mod(wx, 288);
    if (bi < 72) {
      const [a, b] = BANNERS[hash(Math.floor(wx / 288) + 7) % BANNERS.length];
      ctx.fillStyle = a; ctx.fillRect(sx, fy, 1, 10);
      if (bi > 4 && bi < 68 && mod(bi, 10) < 6) { ctx.fillStyle = b; ctx.fillRect(sx, fy + 3, 1, 4); }
      if (bi === 0 || bi === 71) { ctx.fillStyle = '#140c1c'; ctx.fillRect(sx, fy, 1, 10); }
    } else {
      ctx.fillStyle = '#f4f2e8'; ctx.fillRect(sx, fy + 1, 1, 2);
      ctx.fillStyle = '#c8c8d0'; ctx.fillRect(sx, fy + 7, 1, 1);
      if (mod(wx, 36) < 2) { ctx.fillStyle = '#8a8a9a'; ctx.fillRect(sx, fy, 1, 12); }
    }
  }
}
const SURF_PAL = {
  0: { top: '#ebb87a', lit: '#d9a066', mid: '#c4864c', shade: '#a86e3e', rut: '#b07a46' },
  1: { top: '#7a5030', lit: '#5f3a1c', mid: '#5a3418', shade: '#4e2c14', rut: '#7a5a3a' },
};
function drawTerrain(T, camX, camY, now) {
  if (BG.dirt.setTransform) { try { BG.dirt.setTransform(new DOMMatrix([1, 0, 0, 1, -mod(camX, 64), mod(GROUND_ROW + camY, 48)])); } catch (e) {} }
  for (let sx = 0; sx < W; sx++) {
    const wx = camX + sx, i = clamp(wx, 0, T.len);
    const h = T.hm[i], top = GROUND_ROW - Math.round(h) + camY;
    if (top >= H) continue;
    ctx.fillStyle = BG.dirt; ctx.fillRect(sx, top + 9, 1, H - top);
    ctx.fillStyle = '#93542a'; ctx.fillRect(sx, top + 4, 1, 5);
    const sf = T.sf[i];
    const P = SURF_PAL[sf] || SURF_PAL[0];
    const sl = T.hm[Math.min(T.len, i + 2)] - T.hm[Math.max(0, i - 2)];
    ctx.fillStyle = sl > 0.5 ? P.lit : sl < -0.5 ? P.shade : P.mid; ctx.fillRect(sx, top + 1, 1, 3);
    ctx.fillStyle = P.top; ctx.fillRect(sx, top, 1, 1);
    const hv = hash(wx);
    if ((hv & 7) === 0) { ctx.fillStyle = P.rut; ctx.fillRect(sx, top + 2, 1, 1); }
    if (sf === SURF.mud && (hv & 31) === 3) { ctx.fillStyle = '#9a7a5a'; ctx.fillRect(sx, top + 1, 2, 1); }
  }
}
function wsx(wx, camX) { return Math.round(wx - camX); }
function wsy(wy, camY) { return GROUND_ROW - Math.round(wy) + camY; }
function drawStartFinish(R, T, camX, camY, now) {
  // start arch
  let x = T.startX - 40;
  if (x - camX > -100 && x - camX < W + 100) {
    const gy = wsy(trackH(T, x), camY), sx = wsx(x, camX), w = 86;
    ctx.fillStyle = '#8a8a9a'; ctx.fillRect(sx, gy - 60, 3, 60); ctx.fillRect(sx + w, gy - 60, 3, 60);
    ctx.fillStyle = '#140c1c'; ctx.fillRect(sx - 1, gy - 66, w + 5, 14);
    ctx.fillStyle = '#3b78e8'; ctx.fillRect(sx, gy - 65, w + 3, 12);
    text('START', sx + w / 2 + 2, gy - 62, { c: '#f4f2e8', a: 'c', s: 1 });
    // the starting gate drops at GO
    const gx = wsx(T.startX + 22, camX), ggy = wsy(trackH(T, T.startX + 22), camY);
    const fall = !R || R.phase !== 'countdown' ? clamp(R ? R.time * 5 : 1, 0, 1) : 0;
    ctx.save(); ctx.translate(gx, ggy); ctx.rotate((fall * Math.PI) / 2);
    ctx.fillStyle = '#140c1c'; ctx.fillRect(-2, -15, 5, 16);
    ctx.fillStyle = '#c8c8d0'; ctx.fillRect(-1, -14, 3, 14);
    ctx.fillStyle = '#e8383b'; ctx.fillRect(-1, -10, 3, 3);
    ctx.restore();
  }
  // finish arch + checkered line
  x = T.finishX;
  if (x - camX > -100 && x - camX < W + 100) {
    const gy = wsy(trackH(T, x), camY), sx = wsx(x, camX);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { ctx.fillStyle = (r + c) & 1 ? '#140c1c' : '#f4f2e8'; ctx.fillRect(sx + c * 3, gy + r * 3, 3, 3); }
    ctx.fillStyle = '#8a8a9a'; ctx.fillRect(sx - 30, gy - 64, 3, 64); ctx.fillRect(sx + 34, gy - 64, 3, 64);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 22; c++) { ctx.fillStyle = (r + c) & 1 ? '#140c1c' : '#f4f2e8'; ctx.fillRect(sx - 30 + c * 3, gy - 72 + r * 3, 3, 3); }
    ctx.fillStyle = '#140c1c'; ctx.fillRect(sx - 18, gy - 60, 42, 9);
    text('FINISH', sx + 3, gy - 58, { c: '#ffd23f', a: 'c' });
  }
}
function drawBike(vb, T, camX, camY, now, ghostAlpha) {
  const rs = rsOf(vb.id), art = bikeArt(vb.color, vb.char);
  const sx = vb.x - camX, sy = GROUND_ROW - vb.y + camY;
  ctx.save();
  ctx.globalAlpha = ghostAlpha * (vb.inv > 0 && (Math.floor(now * 16) & 1) ? 0.45 : 1);
  if (sx > -60 && sx < W + 60) {
    const gh = trackH(T, vb.x), air = vb.y - gh;
    if (air > 3) {
      const sw = Math.max(10, 40 - air * 0.2);
      ctx.fillStyle = 'rgba(20,12,28,0.3)'; ctx.fillRect(Math.round(sx - sw / 2), wsy(gh, camY) - 1, Math.round(sw), 3);
    }
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(-vb.ang);
    if (vb.wh > 0.01) { ctx.translate(-BIKE.half, 0); ctx.rotate(-vb.wh); ctx.translate(BIKE.half, 0); }
    drawBikeArt(ctx, art, (rs.wr | 0) & 1, Math.round(clamp(rs.sq, 0, 3)), vb.state !== 'crash', vb.state === 'crash' ? 0 : vb.lean);
    ctx.restore();
  }
  if (vb.state === 'crash') {
    const r = vb.rider, rx = Math.round(r.x - camX), ry = wsy(r.y, camY);
    if (rx > -30 && rx < W + 30) {
      ctx.save();
      if (r.ph <= 1) { ctx.translate(rx, ry - 10); ctx.rotate(-r.rot); blit(ctx, art.tumble, 0, 0); }
      else { ctx.translate(rx, ry); if (r.flip) ctx.scale(-1, 1); blit(ctx, art.run[r.ph === 2 ? (now * 10 | 0) & 1 : 0], 0, 0); }
      ctx.restore();
    }
  }
  ctx.restore();
}
// Name tags over other riders; tags that would overlap stack upward.
function drawTags(vbs, me, camX, camY) {
  const placed = [];
  for (const vb of [...vbs].sort((a, b) => a.x - b.x)) {
    if (vb === me) continue;
    const sx = Math.round(vb.x - camX);
    if (sx < -20 || sx > W + 20) continue;
    const name = vb.name.slice(0, 10).toUpperCase(), w = name.length * 4 + 7;
    let x0 = sx - (w >> 1), y = wsy(vb.state === 'crash' ? vb.rider.y : vb.y, camY) - 62;
    for (let k = 0; k < 6 && placed.some((r) => x0 < r.x + r.w && x0 + w > r.x && y < r.y + 9 && y + 9 > r.y); k++) y -= 9;
    placed.push({ x: x0, y, w });
    ctx.fillStyle = 'rgba(20,12,28,0.7)'; ctx.fillRect(x0, y - 1, w, 8);
    ctx.fillStyle = (COLORS[vb.color] || COLORS[0]).c; ctx.fillRect(x0 + 1, y + 1, 3, 3);
    text(name, x0 + 6, y + 1, { c: '#f4f2e8' });
  }
}
function drawParticles(camX, camY) {
  for (const p of Parts) {
    const sx = Math.round(p.x - camX); if (sx < -4 || sx > W + 4) continue;
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
    ctx.fillStyle = p.col; ctx.fillRect(sx, wsy(p.y, camY), p.sz, p.sz);
  }
  ctx.globalAlpha = 1;
}
function renderWorld(T, camX, camY, vbs, now, opts = {}) {
  drawSky(camX, camY, now);
  drawFence(T, camX, camY);
  drawTerrain(T, camX, camY, now);
  drawStartFinish(opts.race, T, camX, camY, now);
  const me = opts.localId ? vbs.find((b) => b.id === opts.localId) : null;
  for (const vb of vbs) {
    if (vb === me) continue;
    const near = me && Math.abs(vb.x - me.x) < 34;
    drawBike(vb, T, camX, camY, now, near ? 0.45 : 1);
  }
  if (me) drawBike(me, T, camX, camY, now, 1);
  drawParticles(camX, camY);
  if (opts.tags) drawTags(vbs, me, camX, camY);
  if (opts.overlay) opts.overlay();
}

// ---------- HUD ----------
function panel(x, y, w, h) { ctx.fillStyle = 'rgba(20,12,28,0.78)'; ctx.fillRect(x, y, w, h); }
function profileCanvas(T, w) {
  if (T._prof && T._prof.w === w) return T._prof.c;
  const c = mk(w, 14), x = c.getContext('2d'), span = Math.max(40, T.maxY - T.minY);
  for (let i = 0; i < w; i++) {
    const h = trackH(T, (i / w) * T.len), top = 1 + Math.round((1 - (h - T.minY) / span) * 9);
    x.fillStyle = '#b8743c'; x.fillRect(i, top, 1, 14 - top);
    x.fillStyle = '#ebb87a'; x.fillRect(i, top, 1, 1);
  }
  T._prof = { w, c };
  return c;
}
function drawHUD(R, vbs, me, now, camX, camY) {
  const T = R.track;
  panel(0, 0, W, 13);
  const ranked = [...vbs].sort(byPos);
  if (me) {
    const pos = ranked.findIndex((b) => b.id === me.id) + 1;
    text(ordinal(pos) + '/' + vbs.length, 4, 4, { c: '#ffd23f' });
    const m = Math.max(0, Math.round((T.finishX - me.x) / 16));
    text(me.finished ? 'DONE' : m + 'M TO GO', 48, 4, { c: '#c8c8d0' });
  }
  text(fmtTime(me && me.finished ? me.finishTime : R.time), W / 2, 4, { a: 'c', c: '#6fe3ff' });
  if (me) {   // speedometer (16 pixels = 1 metre)
    const mph = Math.round((Math.abs(me.s) / 16) * 2.237), f = clamp(Math.abs(me.s) / PHYS.vMax, 0, 1);
    text(mph + ' MPH', W - 66, 4, { a: 'r', c: '#f4f2e8' });
    ctx.fillStyle = '#140c1c'; ctx.fillRect(W - 62, 3, 58, 7);
    ctx.fillStyle = '#3a3a4e'; ctx.fillRect(W - 61, 4, 56, 5);
    ctx.fillStyle = f < 0.6 ? '#46c84a' : f < 0.85 ? '#ffd23f' : '#ff8a2a'; ctx.fillRect(W - 61, 4, Math.round(f * 56), 5);
  }
  // standings
  panel(W - 70, 15, 70, ranked.length * 7 + 3);
  ranked.forEach((b, i) => {
    const y = 17 + i * 7, mine = me && b.id === me.id;
    text(String(i + 1), W - 66, y, { c: mine ? '#ffd23f' : '#c8c8d0' });
    ctx.fillStyle = (COLORS[b.color] || COLORS[0]).c; ctx.fillRect(W - 60, y, 5, 5);
    text(b.name.slice(0, 11), W - 53, y, { c: mine ? '#ffd23f' : '#f4f2e8' });
  });
  // riders off the edge of the screen
  if (me) for (const b of vbs) {
    if (b === me) continue;
    const sx = b.x - camX; if (sx >= -8 && sx <= W + 8) continue;
    const right = sx > W, y = clamp(wsy(b.y, camY) - 20, 24, H - 40);
    const d = Math.round(Math.abs(b.x - me.x) / 16) + 'M';
    ctx.fillStyle = (COLORS[b.color] || COLORS[0]).c;
    const ax = right ? W - 6 : 2;
    for (let k = 0; k < 4; k++) ctx.fillRect(right ? ax - k : ax + k, y + k, 1, 7 - k * 2);
    text(d, right ? W - 9 : 9, y + 1, { a: right ? 'r' : 'l', c: '#f4f2e8', sh: '#140c1c' });
  }
  // progress along the track
  const px0 = 8, pw = W - 16, py = H - 18;
  panel(px0 - 3, py - 2, pw + 6, 17);
  ctx.drawImage(profileCanvas(T, pw), px0, py);
  const fx = px0 + Math.round((T.finishX / T.len) * pw);
  for (let r = 0; r < 4; r++) { ctx.fillStyle = r & 1 ? '#140c1c' : '#f4f2e8'; ctx.fillRect(fx, py + r * 3, 2, 3); }
  for (const b of [...vbs].sort((a, c) => (a === me) - (c === me))) {
    const x = px0 + Math.round((clamp(b.x, 0, T.len) / T.len) * pw), isMe = me && b.id === me.id;
    ctx.fillStyle = '#140c1c'; ctx.fillRect(x - 2, py - 1 - (isMe ? 1 : 0), 5, isMe ? 8 : 6);
    ctx.fillStyle = (COLORS[b.color] || COLORS[0]).c; ctx.fillRect(x - 1, py - (isMe ? 1 : 0), 3, isMe ? 6 : 4);
  }
  // countdown lights
  if (R.phase === 'countdown' || (R.phase === 'race' && R.time < 1 && R.cd < 9)) {
    const lit = R.phase === 'countdown' ? (R.cd >= 0.6) + (R.cd >= 1.6) + (R.cd >= 2.6) : 3;
    const go = R.phase === 'race', cx = W / 2, y = 34;
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
  const m = App.msg;
  if (m && m.life > 0) {
    const y = 78 + (m.life > m.max - 0.15 ? (m.max - m.life) * -40 + 6 : 0);
    text(m.text, W / 2, y, { s: m.text.length > 12 ? 2 : 3, a: 'c', c: m.c, sh: '#140c1c' });
    if (m.sub) text(m.sub, W / 2, y + 22, { a: 'c', c: '#f4f2e8', sh: '#140c1c' });
  }
  if (me && me.state === 'crash' && me.rider.ph >= 2) text('GET BACK ON!', W / 2, 104, { a: 'c', c: '#f4f2e8', sh: '#140c1c' });
  if (!me && R.mode === 'client') text('WATCHING — YOU JOIN THE NEXT RACE', W / 2, 24, { a: 'c', c: '#ffd23f', sh: '#140c1c' });
}

// ---------- events from your own bike: sounds and big messages ----------
function flash(t, c, life = 1.2, sub) { App.msg = { text: t, c, life, max: life, sub }; }
function handleEvent(ev, R) {
  if (R.mode === 'demo') return;
  const me = ev.id != null && ev.id === R.localId;
  switch (ev.e) {
    case 'count': Sound.play('count'); break;
    case 'go': Sound.play('go'); break;
    case 'crash': if (me) { Sound.play('crash'); flash('WIPEOUT!', '#ff8a2a'); } break;
    case 'remount': if (me) Sound.play('pop', 0.8); break;
    case 'land': if (me && ev.a > 50) Sound.play('land', clamp(ev.a / 260, 0.25, 1)); break;
    case 'perfect': if (me) { Sound.play('perfect'); flash(ev.a > 1 ? 'PERFECT X' + ev.a : 'PERFECT!', '#ffd23f', 0.9); } break;
    case 'flip':
      if (me) { Sound.play('flip'); const n = Math.abs(ev.a); flash((n > 1 ? (n === 2 ? 'DOUBLE ' : n + 'X ') : '') + (ev.a > 0 ? 'BACKFLIP!' : 'FRONTFLIP!'), '#ff8fc8', 1.5, 'SPEED BOOST'); }
      break;
    case 'finish': if (me) { Sound.play('finish'); flash('FINISH! ' + ordinal(ev.a), '#ffd23f', 3); } break;
    case 'done': App.raceDone(R); break;
  }
}

// ---------- toast ----------
let toastTimer = 0;
function toast(msg, sec = 2.6) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.style.display = 'none'), sec * 1000); }

// =====================================================================
// THE APP: screens, modes, camera and the main loop
// =====================================================================
const MENU_SCREENS = ['title', 'help', 'wardrobe', 'solo', 'join', 'lobby', 'share'];
const App = {
  scene: 'menu', screen: 'title', race: null, demo: null, paused: false, touchOn: false,
  camX: 0, camY: 0, lead: 150, msg: null, acc: 0, doneT: -1, resultsShown: false, lastSolo: null, vbs: [],

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
    $('pause-restart').onclick = () => { this.setPaused(false); if (this.race && this.race.mode === 'test') Editor.testRide(false); else if (this.lastSolo) this.startSolo(this.lastSolo); };
    $('pause-quit').onclick = () => this.quitRace();
    Garage.init();
    Editor.init();
    Net.init();
    this.makeDemo();
    this.go('title');
    Net.autoJoin();
    requestAnimationFrame((t) => this.loop(t));
  },
  mePlayer(id) { return { id, name: Profile.name, color: Profile.color, char: Profile.rider }; },
  setTouch(on) {
    if (this.touchOn === on) return;
    this.touchOn = on;
    $('touch').classList.toggle('on', on && this.scene === 'race');
  },
  makeDemo() {
    this.demo = new Race({ mode: 'demo', track: BUILTIN_TRACKS[0], players: makeBots(4, []), localId: null });
    this.demo.sim.forEach((b, i) => { b.skill = 0.8 + Math.random() * 0.15; b.x += i * 30 - 45; });
  },
  go(name) {
    if (name === 'host') { Net.host(); return; }
    if (name === 'editor') { Editor.open(); return; }
    if (name === 'wardrobe-from-join' || name === 'wardrobe-from-lobby') { Garage.open(name.slice(14)); this.showScreen('wardrobe'); return; }
    if (name === 'lobby') { this.race = null; this.showScreen('lobby'); this.setScene('menu'); Net.renderLobby(); return; }
    if (name === 'wardrobe') Garage.open('title');
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
    if (s !== 'race') Sound.engineOff();
    this.scene = s;
    document.body.classList.toggle('racing', s === 'race');
    $('touch').classList.toggle('on', this.touchOn && s === 'race');
    $('editor-ui').classList.toggle('on', s === 'editor');
    Input.keys = 0; Input.touch = 0; Touch.ptrs.clear();
  },
  refreshTitle() {
    $('btn-mute').textContent = 'Sound: ' + (Settings.mute ? 'Off' : 'On');
    $('title-rider').textContent = 'Riding as ' + Profile.name + ' (' + riderDef(Profile.rider).name + ')';
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
  },
  startSolo(setup) {
    setup = setup || { track: TrackStore.get(Settings.track) || BUILTIN_TRACKS[0] };
    this.lastSolo = setup;
    const players = [this.mePlayer('me'), ...makeBots(3, [Profile.color])];
    this.startRace(new Race({ mode: 'solo', track: setup.track, players, localId: 'me', inputFor: (b) => (b.id === 'me' ? localInput() : null) }));
  },
  startRace(R) {
    Sound.init();
    this.race = R; this.paused = false; this.acc = 0; this.doneT = -1; this.resultsShown = false; this.msg = null;
    RS.clear(); Parts.length = 0;
    const vbs = R.viewBikes(1, performance.now() / 1000);
    const me = vbs.find((b) => b.id === R.localId) || vbs[0];
    if (me) this.follow(me, R.track, 0, true);
    this.showScreen('none');
    this.setScene('race');
    if (this.touchOn && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
    }
  },
  online() { return this.race && (this.race.mode === 'host' || this.race.mode === 'client'); },
  setPaused(p) {
    const online = this.online();
    this.paused = p && !online;
    if (p) {
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
    if (R && Net.active) Net.leave();
    this.go('title');
  },
  onEscape() {
    if (this.scene === 'race') { if (this.screen !== 'results') this.setPaused(this.screen !== 'pause'); }
    else if (this.screen === 'share') { this.showScreen('none'); this.setScene('editor'); }
    else if (this.scene !== 'editor' && this.screen !== 'title' && this.screen !== 'lobby') this.go('title');
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
    } else if (R.mode === 'test') add('Back to Editor', () => this.quitRace(), 'go');
    else Net.resultsButtons(R, add);
    this.showScreen('results');
  },
  // camera: your bike sits left of centre (further left at speed); height blends the ground here and ahead
  follow(b, T, dt, snap) {
    const frac = clamp(Math.abs(b.s) / PHYS.vMax, 0, 1);
    this.lead = snap ? 150 : this.lead + (150 - frac * 45 - this.lead) * Math.min(1, dt * 2);
    this.camX = b.x - this.lead;
    let ty = (trackH(T, b.x) + trackH(T, b.x + 140)) / 2 + 12;
    if (b.y - ty > 112) ty = b.y - 112;
    this.camY = snap ? ty : this.camY + (ty - this.camY) * Math.min(1, dt * 5);
  },

  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const now = t / 1000;
    let dt = this.lastT ? now - this.lastT : STEP; this.lastT = now;
    if (dt > 0.1) dt = 0.1;
    try { this.update(dt, now); this.render(now); } catch (e) { console.error(e); }
    present();
  },
  stepRace(R, dt) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 8) {
      R.step(STEP); n++; this.acc -= STEP;
      if (R.events.length) { const evs = R.events; R.events = []; for (const ev of evs) handleEvent(ev, R); }
      if (R.onStep) R.onStep();
    }
    if (n === 8) this.acc = 0;
  },
  update(dt, now) {
    Net.tick(dt);
    if (this.scene === 'race' && this.race) {
      const R = this.race;
      if (!this.paused) this.stepRace(R, dt);
      const vbs = (this.vbs = R.viewBikes(this.acc / STEP, performance.now() / 1000));
      const live = this.paused ? 0 : dt;
      updateRS(vbs, R.track, live, R.localId);
      updateParticles(live, R.track);
      const me = vbs.find((b) => b.id === R.localId);
      const target = me || [...vbs].sort(byPos)[0];
      if (target) this.follow(target, R.track, dt, false);
      if (me && !this.paused && R.phase !== 'done') Sound.engine(me.state === 'crash' ? 0 : Math.abs(me.s), me.gas, me.state === 'ride');
      else Sound.engineOff();
      if (this.msg) this.msg.life -= dt;
      if (this.doneT > 0) { this.doneT -= dt; if (this.doneT <= 0 && !this.resultsShown) this.showResults(this.doneRace); }
    } else if (this.scene === 'menu') {
      const D = this.demo;
      this.stepRace(D, dt);
      const vbs = (this.vbs = D.viewBikes(this.acc / STEP, now));
      updateRS(vbs, D.track, dt, null); updateParticles(dt, D.track);
      const lead = vbs.reduce((a, b) => (b.x > a.x ? b : a));
      this.follow(lead, D.track, dt, Math.abs(lead.x - this.lead - this.camX) > 400);
    } else if (this.scene === 'editor') Editor.update(dt);
  },
  render(now) {
    const cx = Math.round(this.camX), cy = Math.round(this.camY);
    if (this.scene === 'race' && this.race) {
      const R = this.race;
      renderWorld(R.track, cx, cy, this.vbs, now, { race: R, localId: R.localId, tags: true });
      drawHUD(R, this.vbs, this.vbs.find((b) => b.id === R.localId), now, cx, cy);
    } else if (this.scene === 'menu' && this.demo) renderWorld(this.demo.track, cx, cy, this.vbs, now, { race: this.demo });
    else if (this.scene === 'editor') Editor.render(now);
  },
};

window.addEventListener('load', () => App.init());
