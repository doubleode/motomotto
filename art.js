'use strict';
/* =====================================================================
   Hat Trick Moto — art.js
   Pixel-art helpers, the bike and rider sprites, the six riders you can
   pick, and the Garage screen (name, bike color, rider).
   ===================================================================== */

// Shared palette. Each letter in a sprite string maps to a colour.
const PAL = {
  k: '#140c1c', w: '#f4f2e8', l: '#c8c8d0', L: '#8a8a9a', D: '#33334a', n: '#24202e', s: '#24202e',
  g: '#46c84a', G: '#2a8a30', c: '#6fe3ff', y: '#ffd23f', Y: '#c99a1e', o: '#ff8a2a', r: '#e8383b',
  b: '#9c5a2c', B: '#6a3a1c', u: '#3b78e8', U: '#22448e', p: '#ff8fc8', v: '#8a3ce0', e: '#ffe9a8',
};

const Pix = {
  // Build a canvas from rows of palette letters. '.' is transparent.
  // A 1px dark outline is added automatically around the shape.
  build(rows, map, outline = true) {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const pad = outline ? 1 : 0;
    const c = document.createElement('canvas');
    c.width = w + pad * 2; c.height = h + pad * 2;
    const x = c.getContext('2d');
    const col = (ch) => (map && map[ch]) || PAL[ch];
    const solid = new Uint8Array((w + 2) * (h + 2));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ch = rows[j][i];
      if (ch && ch !== '.' && col(ch)) solid[(j + 1) * (w + 2) + i + 1] = 1;
    }
    if (outline) {
      x.fillStyle = PAL.k;
      const at = (a, b) => a >= 0 && b >= 0 && a < w + 2 && b < h + 2 && solid[b * (w + 2) + a];
      for (let j = 0; j < h + 2; j++) for (let i = 0; i < w + 2; i++)
        if (!solid[j * (w + 2) + i] && (at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1))) x.fillRect(i - 1 + pad, j - 1 + pad, 1, 1);
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ch = rows[j][i]; if (!ch || ch === '.') continue;
      const cc = col(ch); if (!cc) continue;
      x.fillStyle = cc; x.fillRect(i + pad, j + pad, 1, 1);
    }
    return c;
  },
  shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return '#' + ((1 << 24) | (ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).slice(1);
  },
  // Lay non-'.' characters of `over` on top of `base` (same row layout).
  overlay(base, over, row0 = 0) {
    const out = base.slice();
    over.forEach((o, j) => {
      const r = out[row0 + j].split('');
      for (let i = 0; i < o.length; i++) if (o[i] !== '.' && r[i] && r[i] !== '.') r[i] = o[i];
      out[row0 + j] = r.join('');
    });
    return out;
  },
};

// ---------------------------------------------------------------------
// The bike. Grid is 36 wide. Wheels (12x12):
// rear at cols 0-11, front at cols 24-35. X = bike colour, x = darker,
// Z = highlight. The pivot used for tilting is col 18, row 14.
// Wheels sit at rows 10-21, so the bike stands tall on its suspension.
// ---------------------------------------------------------------------
const BIKE_ROWS = [
  '..........................kkk.......',
  '..........................LLwww.....',
  '...........................Lwwww....',
  '.................XXZZZZ....Lwww.....',
  'XXX.......DDDDDDDXXXZZXX...L........',
  '.XXXX..DDDDDDDDDXXXXXXXXX..L........',
  '..XXXXXXXwwwwwwXXXXXXXXXx..LXXXXXXX.',
  '...XXXXXwwwwwwwxnnnnnnnnx..LXXXXXX..',
  '..lllll.wwwwwwwnnYLLDDLLn...L.......',
  '.LllllL..xwwwwxnnYLDDDDLn...L.......',
  '..........xxxnnnnYLDLDLLn....D......',
  '..............nnnLLLLLLnn....D......',
  '............LLLLnLLLLLnn.....D......',
  '..........LLLL.........n......D.....',
  '........LLLL..................D.....',
  '.....LLLL.....................D.....',
];
const WHEEL_ROWS = [
  ['...kkkkkk...', '.kkkkkkkkkk.', '.kkLLLLLLkk.', 'kkL..nn..Lkk', 'kkL..nn..Lkk', 'kkLnnllnnLkk',
   'kkLnnllnnLkk', 'kkL..nn..Lkk', 'kkL..nn..Lkk', '.kkLLLLLLkk.', '.kkkkkkkkkk.', '...kkkkkk...'],
  ['...kkkkkk...', '.kkkkkkkkkk.', '.kkLLLLLLkk.', 'kkLn....nLkk', 'kkL.n..n.Lkk', 'kkL..ll..Lkk',
   'kkL..ll..Lkk', 'kkL.n..n.Lkk', 'kkLn....nLkk', '.kkLLLLLLkk.', '.kkkkkkkkkk.', '...kkkkkk...'],
];
const BIKE = { ox: -18, oy: -14, wheelY: 10, rearX: 0, frontX: 24, contact: 8 };

// The rider, standing on the pegs in attack position. Same 36-wide grid;
// row 0 of this sprite sits at bike row -13. Letters: H helmet, h helmet
// design, c goggles, J jersey, j jersey stripe, A pants, a pants stripe,
// F gloves, Q boots.
const RIDER_OY = -13;
const RIDER_ROWS = [
  '......................HHHH..........',
  '....................HHHHHHHhh.......',
  '...................HHHHHHHHhhh......',
  '..................HHHHHHHHkcccc.....',
  '..................HHHHHHHHkcccck....',
  '..................HHHHHHHHHkcc......',
  '...................HHHHHHHHHHH......',
  '.....................HHHHHHHHH......',
  '.................JJJ...HHHH.........',
  '...............JJJJJJJ..............',
  '..............JJjjJJJJJJJ...........',
  '.............JJJjjJJJJJJJJJ.........',
  '.............JJJJJJJJ...JJJJ........',
  '.............JJJJJJJ......JJF.......',
  '..............aAAAAA.......FFF......',
  '.............AAAAAAAA......FF.......',
  '............AAAAAAAAAAA.............',
  '..............AAAAAAAAAA............',
  '................aAAAAAAA............',
  '..................AAAAA.............',
  '.................AAAAQ..............',
  '................AAAQQ...............',
  '...............AAAQQ................',
  '..............QQQQQ.................',
  '.............QQQQQQ.................',
  '.............QQQQQQQ................',
];
// Helmet designs, laid over rows 0-7 of the rider.
const HELMETS = {
  stripe: ['......................hhhh..........', '....................hhhhhhh.........', '...................hhhhhhhh.........'],
  flame: ['', '', '', '..................h.................', '..................hhi...............', '..................hhhhi.............', '...................hhhhhhi..........', '.....................hhhhhhh........'],
  bolt: ['', '........................hh..........', '......................hhh...........', '....................hhhhhh..........', '.......................hh...........', '......................hh............', '.....................h..............'],
  checker: ['......................h.h...........', '....................h.h.h.h.........', '...................h.h.h.h.h........', '..................h.h.h.h...........', '...................h.h.h............', '..................h.h.h.h.h.........', '...................h.h.h.h.h........', '.....................h.h.h.h........'],
  star: ['', '', '......................h.............', '.....................hhh............', '...................hhhhhhh..........', '....................hhhhh...........', '....................hh.hh...........'],
};
// Small sprites for when the rider is off the bike.
const RUN_TOP = ['....HHHH......', '..HHHHHHhh....', '.HHHHHHHkccc..', '.HHHHHHHkccck.', '.HHHHHHHHHh...', '..HHHHHHHHH...',
  '....JJJJ......', '...JJJJJJ.....', '..JJjJJJJF....', '.FJJjJJJ......', '...JJJJJ......'];
const RUN_ROWS = [
  RUN_TOP.concat(['...aAAAA......', '...AAAAAA.....', '..AAA..AAA....', '.AAA....AAA...', 'AAA......AA...', 'QQ.......QQQ..', 'QQQ.......QQQ.']),
  RUN_TOP.concat(['...aAAAA......', '...AAAAA......', '....AAAA......', '....AAA.......', '....AAAQ......', '....QQQQ......', '...QQQQQ......']),
];
const TUMBLE_ROWS = ['....HHHHH.......', '..HHHHHHHHh.....', '.HHHHHHHHkcc....', '.HHHHHHHHkccc...', '..HHHHHHHHH.....',
  '...JJJJJJJJJF...', '..JJJjjJJJJJF...', '.AAJJjjJJJJ.....', 'AAAAJJJJJ.......', 'AAAAAAAA........', '.QQAAAAAAQ......',
  'QQQ..AAAAQQ.....', 'QQ....QQQQ......'];
const HEAD_ROWS = RUN_TOP.slice(0, 6);

// The six riders. '@' means "use the bike colour".
const RIDERS = [
  { id: 'ace', name: 'Ace', helmet: 'stripe', H: '#f4f2e8', h: '@', i: '#140c1c', J: '#f4f2e8', j: '@', A: '#3a3a4e', a: '#f4f2e8', F: '@', Q: '#f4f2e8' },
  { id: 'blaze', name: 'Blaze', helmet: 'flame', H: '#2a2438', h: '#ff8a2a', i: '#ffd23f', J: '#2a2438', j: '#ff8a2a', A: '#2a2438', a: '#ff8a2a', F: '#ff8a2a', Q: '#2a2438' },
  { id: 'bolt', name: 'Bolt', helmet: 'bolt', H: '#ffd23f', h: '#2a2438', i: '#f4f2e8', J: '#ffd23f', j: '#2a2438', A: '#2a2438', a: '#ffd23f', F: '#2a2438', Q: '#2a2438' },
  { id: 'checkers', name: 'Checkers', helmet: 'checker', H: '#f4f2e8', h: '#140c1c', i: '#e8383b', J: '#e8383b', j: '#f4f2e8', A: '#f4f2e8', a: '#e8383b', F: '#140c1c', Q: '#e8383b' },
  { id: 'nova', name: 'Nova', helmet: 'star', H: '#22448e', h: '#ffd23f', i: '#f4f2e8', J: '#3b78e8', j: '#ffd23f', A: '#22448e', a: '#f4f2e8', F: '#ffd23f', Q: '#22448e' },
  { id: 'moss', name: 'Moss', helmet: 'stripe', H: '#2a8a30', h: '#a4f05a', i: '#140c1c', J: '#46c84a', j: '#140c1c', A: '#2a2a38', a: '#a4f05a', F: '#140c1c', Q: '#a4f05a' },
];
const RIDER_IDS = RIDERS.map((r) => r.id);
const riderDef = (id) => RIDERS.find((r) => r.id === id) || RIDERS[0];

// Build (and cache) every sprite for one bike colour + rider combo.
const ArtCache = {};
function bikeArt(colorIdx, riderId) {
  const key = colorIdx + ':' + riderId;
  if (ArtCache[key]) return ArtCache[key];
  const col = (COLORS[colorIdx] || COLORS[0]).c, R = riderDef(riderId);
  const map = { X: col, x: Pix.shade(col, 0.62), Z: Pix.shade(col, 1.35) };
  for (const k of ['H', 'h', 'i', 'J', 'j', 'A', 'a', 'F', 'Q']) map[k] = R[k] === '@' ? col : R[k];
  const helmet = (HELMETS[R.helmet] || []).filter((r) => r !== undefined);
  const riderRows = Pix.overlay(RIDER_ROWS, helmet.map((r) => r || ''));
  return (ArtCache[key] = {
    body: Pix.build(BIKE_ROWS, map),
    wheel: WHEEL_ROWS.map((w) => Pix.build(w, null, false)),
    rider: Pix.build(riderRows, map),
    run: RUN_ROWS.map((r) => Pix.build(r, map)),
    tumble: Pix.build(TUMBLE_ROWS, map),
    head: Pix.build(HEAD_ROWS, map),
  });
}
// Draw a whole bike + rider with its pivot at (0,0) in the current transform.
// `sq` pushes the body down a pixel or two (suspension squash on landings).
function drawBikeArt(c, art, wf, sq, withRider) {
  const ox = BIKE.ox, oy = BIKE.oy;
  c.drawImage(art.wheel[wf], ox + BIKE.rearX, oy + BIKE.wheelY);
  c.drawImage(art.wheel[wf], ox + BIKE.frontX, oy + BIKE.wheelY);
  c.drawImage(art.body, ox - 1, oy - 1 + sq);
  if (withRider) c.drawImage(art.rider, ox - 1, oy + RIDER_OY - 1 + sq);
}
// A static picture of a bike + rider on its own canvas (menus, lobby).
function bikePortrait(colorIdx, riderId) {
  const c = document.createElement('canvas'); c.width = 40; c.height = 38;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.translate(20, 29);   // pivot: wheels touch the bottom edge
  drawBikeArt(x, bikeArt(colorIdx, riderId), 0, 0, true);
  return c;
}

// ---------------------------------------------------------------------
// The Garage screen: name, bike colour and rider.
// ---------------------------------------------------------------------
const Garage = {
  init() {
    if (!RIDER_IDS.includes(Profile.rider)) Profile.rider = RIDER_IDS[0];
    const sw = $('wr-colors');
    COLORS.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'swatch'; b.style.background = c.c; b.title = c.name;
      b.onclick = () => { Profile.color = i; Sound.play('click'); this.changed(); }; sw.appendChild(b);
    });
    $('wr-name').addEventListener('input', (e) => { const v = e.target.value.replace(/[^\w .\-!?']/g, '').slice(0, 12); Profile.name = v.trim() || 'Rider'; saveProfile(); });
    $('wr-name').addEventListener('change', () => this.changed());
    $('wr-random').onclick = () => { Profile.rider = RIDER_IDS[Math.floor(Math.random() * RIDER_IDS.length)]; Profile.color = Math.floor(Math.random() * COLORS.length); Sound.play('pop'); this.changed(); };
    $('wr-done').onclick = () => { Sound.play('click'); this.close(); };
  },
  open(returnTo) {
    this.returnTo = returnTo || 'title';
    $('wr-name').value = Profile.name;
    this.render();
    if (!this.previewing) { this.previewing = true; requestAnimationFrame((t) => this.preview(t)); }
  },
  close() {
    Profile.name = (Profile.name || 'Rider').trim().slice(0, 12) || 'Rider';
    saveProfile();
    if (typeof Net !== 'undefined' && Net.active && Net.sendProfile) Net.sendProfile();
    App.go(this.returnTo || 'title');
  },
  changed() { saveProfile(); this.render(); if (typeof Net !== 'undefined' && Net.active && Net.sendProfile) Net.sendProfile(); },
  render() {
    $('wr-colors').querySelectorAll('.swatch').forEach((b, i) => b.classList.toggle('sel', i === Profile.color));
    const grid = $('wr-riders'); grid.innerHTML = '';
    for (const R of RIDERS) {
      const b = document.createElement('button'); b.className = 'riderbtn'; b.classList.toggle('on', R.id === Profile.rider);
      b.appendChild(bikePortrait(Profile.color, R.id));
      const sp = document.createElement('span'); sp.textContent = R.name; b.appendChild(sp);
      b.onclick = () => { Profile.rider = R.id; Sound.play('pop'); this.changed(); };
      grid.appendChild(b);
    }
    if (typeof App !== 'undefined') App.refreshTitle();
  },
  preview(t) {
    if (App.screen !== 'wardrobe') { this.previewing = false; return; }
    requestAnimationFrame((tt) => this.preview(tt));
    const now = t / 1000;
    const c = $('wr-preview'), x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, c.width, c.height);
    // a little hop every couple of seconds
    const ph = (now % 2.4) / 2.4, hop = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) * 9 : 0;
    const tilt = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI * 2) * 0.25 : 0;
    const sq = ph >= 0.3 && ph < 0.36 ? 1 : 0;
    x.fillStyle = '#b8743c'; x.fillRect(0, c.height - 8, c.width, 8);
    x.save(); x.translate(c.width / 2, c.height - 8 - BIKE.contact - Math.round(hop)); x.rotate(-tilt);
    drawBikeArt(x, bikeArt(Profile.color, Profile.rider), (now * 8 | 0) & 1, sq, true);
    x.restore();
  },
};
