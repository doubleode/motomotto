'use strict';
/* =====================================================================
   Hat Trick Moto — art.js
   A tiny pixel painter, the motocross bike, a posable rider, the six
   riders you can pick, and the Garage screen (name, bike colour, rider).

   Sprites are drawn from simple shapes (polygons, round-ended lines and
   discs) filled pixel by pixel — so edges stay crisp — then a 1px dark
   outline is added around the whole thing.
   Coordinates: x to the right, y DOWN, origin on the ground halfway
   between the two wheels.
   ===================================================================== */

const INK = '#140c1c';
const Pix = {
  shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return '#' + ((1 << 24) | (ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).slice(1);
  },
};

class Painter {
  constructor(x0, y0, x1, y1) { this.x0 = x0; this.y0 = y0; this.w = x1 - x0; this.h = y1 - y0; this.px = new Array(this.w * this.h).fill(null); }
  put(x, y, c) { x -= this.x0; y -= this.y0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  fill(minx, miny, maxx, maxy, test, c) {
    for (let y = Math.floor(miny) - 1; y <= Math.ceil(maxy); y++)
      for (let x = Math.floor(minx) - 1; x <= Math.ceil(maxx); x++) if (test(x + 0.5, y + 0.5)) this.put(x, y, c);
  }
  poly(p, c) {
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    this.fill(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => {
      let inside = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i], [xj, yj] = p[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, c);
  }
  seg(a, b, r, c) {   // a round-ended thick line from point a to point b
    const [ax, ay] = a, [bx, by] = b, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    this.fill(Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r, (x, y) => {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
      const ex = x - ax - t * dx, ey = y - ay - t * dy;
      return ex * ex + ey * ey <= r * r;
    }, c);
  }
  disc(p, r, c) { this.seg(p, p, r, c); }
  ring(p, r0, r1, c) {
    const [cx, cy] = p;
    this.fill(cx - r1, cy - r1, cx + r1, cy + r1, (x, y) => { const d = Math.hypot(x - cx, y - cy); return d <= r1 && d >= r0; }, c);
  }
  canvas(outline = true) {
    const { w, h, px } = this, o = outline ? 1 : 0;
    const c = document.createElement('canvas'); c.width = w + 2 * o; c.height = h + 2 * o;
    const x = c.getContext('2d');
    if (outline) {
      x.fillStyle = INK;
      const at = (i, j) => i >= 0 && j >= 0 && i < w && j < h && px[j * w + i];
      for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++)
        if (!at(i, j) && (at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1))) x.fillRect(i + o, j + o, 1, 1);
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const cc = px[j * w + i]; if (cc) { x.fillStyle = cc; x.fillRect(i + o, j + o, 1, 1); } }
    return { img: c, ox: this.x0 - o, oy: this.y0 - o };
  }
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
// Two-bone reach (thigh+shin, upper arm+forearm): where the knee/elbow goes.
function joint(a, c, l1, l2, pickFn) {
  const dx = c[0] - a[0], dy = c[1] - a[1], d = Math.max(0.01, Math.hypot(dx, dy)), dd = Math.min(d, l1 + l2 - 0.01);
  const along = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const ux = dx / d, uy = dy / d, mx = a[0] + ux * along, my = a[1] + uy * along;
  const p = [mx - uy * h, my + ux * h], q = [mx + uy * h, my - ux * h];
  return pickFn(p, q) ? p : q;
}

// ---------------------------------------------------------------------
// The bike. Wheels are 14px across, centres 15px either side of the middle.
// ---------------------------------------------------------------------
const BIKE = { half: 16, r: 8 };
function paintWheel(frame) {
  const P = new Painter(-9, -9, 9, 9), c = [0, 0];
  P.disc(c, 8, INK);
  for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6 + (frame ? Math.PI / 12 : 0); P.disc([Math.cos(a) * 7.6, Math.sin(a) * 7.6], 0.8, '#2a2438'); }  // knobbies
  P.ring(c, 5, 6.2, '#9a9aaa');
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4 + (frame ? Math.PI / 8 : 0);
    P.seg([-Math.cos(a) * 5, -Math.sin(a) * 5], [Math.cos(a) * 5, Math.sin(a) * 5], 0.4, '#5a5a6e');
  }
  P.disc(c, 1.8, '#c8c8d0');
  return P.canvas(false);
}
function paintBike(col) {
  const X = col, x = Pix.shade(col, 0.66), Z = Pix.shade(col, 1.35);
  const W = '#f4f2e8', K = INK, L = '#8a8a9a', l = '#c8c8d0', D = '#33334a', N = '#24202e', Y = '#e8b83a';
  const P = new Painter(-32, -35, 30, 2);
  P.seg([-4, -9.5], [-16, -8], 1.4, L);                                       // swingarm
  P.seg([-5, -8.6], [-15, -7.2], 0.6, D);
  P.poly([[-6.5, -15], [5, -15.5], [7, -10], [4, -5.5], [-5, -5.5], [-7, -9]], D);   // engine
  P.seg([-1, -13.5], [3.5, -13.8], 0.45, L); P.seg([-1, -11.5], [4.5, -11.8], 0.45, L); P.seg([-1.5, -9.5], [4.5, -9.6], 0.45, L);
  P.seg([6, -12.5], [8.5, -8], 1.1, l);                                       // exhaust header
  P.seg([8.5, -8], [2.5, -5], 1, l);
  P.seg([-6, -15.5], [-13, -18.6], 1.1, L);                                   // mid pipe
  P.poly([[-25.5, -21.2], [-12, -21.8], [-11, -16.6], [-23.5, -16]], l);      // muffler
  P.seg([-25, -20.6], [-23.2, -16.4], 1, L);
  P.seg([-21, -19.6], [-13, -20], 0.5, W);
  P.poly([[-14, -22.6], [-4, -21.6], [-3, -15], [-9, -14.2], [-15.5, -18.2]], X);   // side panel
  P.poly([[-12, -21.2], [-5, -20.6], [-5, -16.2], [-11, -16.8]], W);         // number plate
  P.poly([[-31, -26.5], [-14, -22.8], [-14, -20.8], [-28, -23.6]], X);       // rear fender
  P.seg([-30.5, -26], [-21, -24.2], 0.5, Z);
  P.poly([[-22, -24.8], [4, -25.8], [6.2, -23.8], [-21, -22.6]], N);         // seat
  P.poly([[3, -25.2], [12, -27.2], [16.4, -23.2], [14.4, -16.6], [8.2, -14.6], [4, -18.5]], X);   // tank + shrouds
  P.poly([[4.5, -25], [12, -26.6], [14, -25], [5, -23.4]], Z);
  P.poly([[8.2, -14.6], [14.4, -16.6], [13.4, -14.2]], x);
  P.seg([7, -21], [12.8, -22.4], 0.55, x); P.seg([7.4, -19], [13, -20.3], 0.55, x);   // radiator louvres
  P.seg([10.6, -29.2], [13.5, -18], 1.4, Y);                                  // fork tubes (gold)
  P.seg([13.5, -18], [16, -8], 1.65, K);                                      // fork legs
  P.poly([[12.7, -17], [15.3, -17.4], [16, -11.2], [14.5, -11]], W);          // fork guard
  P.seg([10.2, -28.4], [13.2, -28.6], 1, L);                                  // triple clamp
  P.seg([6.2, -32], [11, -31], 0.8, K);                                       // handlebar
  P.seg([10.8, -29.4], [11, -31.2], 0.7, L);
  P.poly([[11.6, -31], [17.2, -29.6], [15.8, -23.4], [12.2, -24.4]], W);      // front number plate
  P.poly([[12.8, -20.6], [27.5, -23], [28, -21.2], [16.2, -17.8]], X);        // front fender
  P.poly([[16.2, -17.8], [28, -21.2], [25.5, -19.8]], x);
  P.seg([-4.8, -9.6], [-1.2, -9.6], 0.8, L);                                  // footpeg
  return P.canvas();
}

// ---------------------------------------------------------------------
// The rider. Hands stay on the bars and boots on the pegs; leaning moves
// the hips, shoulders and head, and the knees and elbows follow.
// ---------------------------------------------------------------------
const POSE = {
  ankle: [-3, -11], toe: [1.6, -8.8], hand: [7.4, -32.6],
  hip: [-9.5, -27.5], shoulder: [1.4, -37], head: [6, -42.6],
  lean: { '-1': [-4.2, 1.2], 0: [0, 0], 1: [3.4, -0.6] },
  thigh: 11.8, shin: 11.4, upper: 6.4, fore: 6.4,
};
function paintHelmet(P, hd, R) {
  const [hx, hy] = hd;
  P.disc(hd, 5.3, R.H);
  // helmet design
  const h = R.h;
  if (R.helmet === 'stripe') { P.seg([hx - 5, hy - 1.5], [hx + 2, hy - 4.6], 1, h); }
  else if (R.helmet === 'flame') { P.poly([[hx - 5.2, hy + 1], [hx - 1, hy - 3], [hx - 2, hy - 0.5], [hx + 1.5, hy - 4.5], [hx + 0.5, hy - 0.5], [hx - 2, hy + 3]], h); P.seg([hx - 3, hy - 0.5], [hx - 1.6, hy - 2], 0.5, R.i); }
  else if (R.helmet === 'bolt') { P.poly([[hx - 1, hy - 5], [hx + 2, hy - 5], [hx, hy - 1.5], [hx + 2.2, hy - 1.5], [hx - 3, hy + 4], [hx - 1.4, hy - 0.2], [hx - 3.4, hy - 0.2]], h); }
  else if (R.helmet === 'checker') { for (let j = -5; j <= 5; j++) for (let i = -5; i <= 2; i++) if (((i + j) & 1) === 0 && Math.hypot(i + 0.5, j + 0.5) < 5) P.put(Math.floor(hx) + i, Math.floor(hy) + j, h); }
  else if (R.helmet === 'star') { const pts = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k & 1 ? 1.4 : 3.3; pts.push([hx - 1.3 + Math.cos(a) * r, hy - 0.8 + Math.sin(a) * r]); } P.poly(pts, h); }
  P.poly([[hx - 1.5, hy - 5.3], [hx + 7.8, hy - 4.6], [hx + 6.6, hy - 2.6], [hx + 0.5, hy - 3.2]], R.peak || R.H);   // peak
  P.poly([[hx + 1.8, hy - 2.7], [hx + 5.8, hy - 2.2], [hx + 5.8, hy + 0.9], [hx + 1.8, hy + 0.9]], INK);   // goggles frame
  P.poly([[hx + 2.6, hy - 1.9], [hx + 5.4, hy - 1.6], [hx + 5.4, hy + 0.2], [hx + 2.6, hy + 0.2]], '#6fe3ff');
  P.put(Math.floor(hx + 3), Math.floor(hy - 1.6), '#f4f2e8');
  P.seg([hx - 4.4, hy - 1], [hx + 1.6, hy - 0.8], 0.6, R.i);                 // goggle strap
  P.poly([[hx + 1.4, hy + 1.6], [hx + 6.6, hy + 1.4], [hx + 5, hy + 5], [hx + 0.6, hy + 4.6]], R.H);   // chin bar
  P.seg([hx + 3.5, hy + 2.6], [hx + 5, hy + 2.5], 0.5, INK);
}
// layer: 'back' = the far arm and leg (drawn behind the bike), 'front' = the rest
function paintRiderOnBike(R, lean, layer) {
  const o = POSE.lean[lean] || POSE.lean[0];
  const hip = add(POSE.hip, o), sh = add(POSE.shoulder, o), hd = add(POSE.head, [o[0] * 1.05, o[1]]);
  const P = new Painter(-24, -54, 22, -4);
  if (layer === 'back') {
    const d = [1.4, -0.4], dk = (c) => Pix.shade(c, 0.68);
    const hip2 = add(hip, d), an2 = add(POSE.ankle, [1.2, 0]), toe2 = add(POSE.toe, [1.2, 0]);
    const kn2 = joint(hip2, an2, POSE.thigh, POSE.shin, (p, q) => p[0] > q[0]);
    P.seg(hip2, kn2, 2.4, dk(R.A)); P.seg(kn2, an2, 2.1, dk(R.Q)); P.seg(an2, toe2, 1.8, dk(R.Q));
    const sh2 = add(sh, d), hand2 = add(POSE.hand, [1, -0.6]);
    const el2 = joint(sh2, hand2, POSE.upper, POSE.fore, (p, q) => p[1] < q[1]);
    P.seg(sh2, el2, 1.8, dk(R.J)); P.seg(el2, hand2, 1.6, dk(R.J)); P.disc(hand2, 1.7, dk(R.F));
    return P.canvas();
  }
  const knee = joint(hip, POSE.ankle, POSE.thigh, POSE.shin, (p, q) => p[0] > q[0]);
  const elbow = joint(sh, POSE.hand, POSE.upper, POSE.fore, (p, q) => p[1] < q[1]);
  P.seg(hip, knee, 2.5, R.A);                                   // thigh
  P.seg(add(hip, [0, 0.8]), add(knee, [0, 0.8]), 0.55, R.a);    // pants stripe
  P.seg(knee, POSE.ankle, 2.2, R.Q);                            // tall boot
  P.seg(POSE.ankle, POSE.toe, 1.9, R.Q);
  P.seg(add(POSE.ankle, [-1, 2.2]), add(POSE.toe, [1, 2]), 0.6, INK);   // sole
  P.disc(knee, 1.9, '#c8c8d0');                                 // knee guard
  // torso (jersey) — a tapered block from hips to shoulders
  const dx = sh[0] - hip[0], dy = sh[1] - hip[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  P.poly([[hip[0] + nx * 3.2, hip[1] + ny * 3.2], [sh[0] + nx * 4, sh[1] + ny * 4], [sh[0] - nx * 2.8, sh[1] - ny * 2.8], [hip[0] - nx * 2.6, hip[1] - ny * 2.6]], R.J);
  P.seg([hip[0] + nx * 1.2, hip[1] + ny * 1.2], [sh[0] + nx * 1.5, sh[1] + ny * 1.5], 0.8, R.j);
  P.disc(hip, 2.9, R.A);
  P.seg(sh, elbow, 2.6, INK); P.seg(elbow, POSE.hand, 2.4, INK);  // arm, with a dark edge so it reads against the jersey
  P.seg(sh, elbow, 1.9, R.J);
  P.seg(elbow, POSE.hand, 1.7, R.J);
  P.seg(add(elbow, [0, 0.5]), POSE.hand, 0.5, R.j);
  P.disc(POSE.hand, 1.8, R.F);                                  // glove
  paintHelmet(P, hd, R);
  return P.canvas();
}
// Off the bike: running back (two frames) and tumbling.
function paintRunner(R, frame) {
  const P = new Painter(-14, -40, 14, 2);
  const hip = [0, -18], sh = [3, -29], hd = [5.5, -35];
  const feet = frame ? [[6, -1], [-6, -2]] : [[1.5, -1], [-1.5, -2.5]];
  feet.forEach((f, i) => {
    const kn = joint(hip, f, 9.5, 10, (p, q) => p[0] > q[0]);
    const dk = i ? (c) => Pix.shade(c, 0.68) : (c) => c;
    P.seg(hip, kn, 2.2, dk(R.A)); P.seg(kn, f, 2, dk(R.Q)); P.seg(f, add(f, [2.5, 0]), 1.6, dk(R.Q));
  });
  const dx = sh[0] - hip[0], dy = sh[1] - hip[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  P.poly([[hip[0] + nx * 3.5, hip[1] + ny * 3.5], [sh[0] + nx * 4, sh[1] + ny * 4], [sh[0] - nx * 3.2, sh[1] - ny * 3.2], [hip[0] - nx * 3, hip[1] - ny * 3]], R.J);
  P.disc(hip, 3, R.A);
  const hand = frame ? [9, -24] : [-3, -22];
  const el = joint(sh, hand, 6.5, 6.5, (p, q) => p[1] > q[1]);
  P.seg(sh, el, 2, R.J); P.seg(el, hand, 1.8, R.J); P.disc(hand, 1.7, R.F);
  paintHelmet(P, hd, R);
  return P.canvas();
}
function paintTumble(R) {
  const P = new Painter(-16, -16, 16, 16);
  const hip = [-2, 3], sh = [5, -5], hd = [7, -11], kn = [6, 7], ft = [0, 13];
  P.seg(hip, kn, 2.4, R.A); P.seg(kn, ft, 2.1, R.Q);
  P.seg(hip, sh, 3.4, R.J);
  P.disc(hip, 3.6, R.A);
  const hand = [12, 0]; P.seg(sh, [10, -4], 2.2, R.J); P.seg([10, -4], hand, 2, R.J); P.disc(hand, 1.9, R.F);
  paintHelmet(P, hd, R);
  return P.canvas();
}

// The six riders. '@' means "use the bike colour".
const RIDERS = [
  { id: 'ace', name: 'Ace', helmet: 'stripe', H: '#f4f2e8', h: '@', i: '#140c1c', J: '#f4f2e8', j: '@', A: '#3a3a4e', a: '#f4f2e8', F: '@', Q: '#f4f2e8', peak: '@' },
  { id: 'blaze', name: 'Blaze', helmet: 'flame', H: '#2a2438', h: '#ff8a2a', i: '#ffd23f', J: '#2a2438', j: '#ff8a2a', A: '#2a2438', a: '#ff8a2a', F: '#ff8a2a', Q: '#2a2438', peak: '#ff8a2a' },
  { id: 'bolt', name: 'Bolt', helmet: 'bolt', H: '#ffd23f', h: '#2a2438', i: '#2a2438', J: '#ffd23f', j: '#2a2438', A: '#2a2438', a: '#ffd23f', F: '#2a2438', Q: '#2a2438', peak: '#2a2438' },
  { id: 'checkers', name: 'Checkers', helmet: 'checker', H: '#f4f2e8', h: '#140c1c', i: '#e8383b', J: '#e8383b', j: '#f4f2e8', A: '#f4f2e8', a: '#e8383b', F: '#140c1c', Q: '#e8383b', peak: '#e8383b' },
  { id: 'nova', name: 'Nova', helmet: 'star', H: '#22448e', h: '#ffd23f', i: '#f4f2e8', J: '#3b78e8', j: '#ffd23f', A: '#22448e', a: '#f4f2e8', F: '#ffd23f', Q: '#22448e', peak: '#ffd23f' },
  { id: 'moss', name: 'Moss', helmet: 'stripe', H: '#2a8a30', h: '#a4f05a', i: '#140c1c', J: '#46c84a', j: '#140c1c', A: '#2a2a38', a: '#a4f05a', F: '#140c1c', Q: '#a4f05a', peak: '#a4f05a' },
];
const RIDER_IDS = RIDERS.map((r) => r.id);
const riderDef = (id) => RIDERS.find((r) => r.id === id) || RIDERS[0];

// Build (and cache) every sprite for one bike colour + rider combo.
const ArtCache = {};
let WHEELS = null;
function bikeArt(colorIdx, riderId) {
  const key = colorIdx + ':' + riderId;
  if (ArtCache[key]) return ArtCache[key];
  if (!WHEELS) WHEELS = [paintWheel(0), paintWheel(1)];
  const col = (COLORS[colorIdx] || COLORS[0]).c, base = riderDef(riderId), R = {};
  for (const k in base) R[k] = base[k] === '@' ? col : base[k];
  return (ArtCache[key] = {
    wheel: WHEELS, body: paintBike(col),
    back: [-1, 0, 1].map((d) => paintRiderOnBike(R, d, 'back')),
    front: [-1, 0, 1].map((d) => paintRiderOnBike(R, d, 'front')),
    run: [paintRunner(R, 0), paintRunner(R, 1)], tumble: paintTumble(R),
  });
}
const blit = (c, s, dx, dy) => c.drawImage(s.img, s.ox + dx, s.oy + dy);
// Draw a bike + rider with the ground point between the wheels at (0,0) in the
// current transform. `sq` squashes the body down (suspension), `lean` is -1/0/1.
function drawBikeArt(c, art, wf, sq, withRider, lean) {
  const li = clamp((lean | 0) + 1, 0, 2);
  if (withRider) blit(c, art.back[li], 0, sq);
  blit(c, art.wheel[wf], -BIKE.half, -BIKE.r);
  blit(c, art.wheel[wf], BIKE.half, -BIKE.r);
  blit(c, art.body, 0, sq);
  if (withRider) blit(c, art.front[li], 0, sq);
}
// A still picture of a bike + rider (menus, lobby).
function bikePortrait(colorIdx, riderId) {
  const c = document.createElement('canvas'); c.width = 62; c.height = 60;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.translate(32, 59);
  drawBikeArt(x, bikeArt(colorIdx, riderId), 0, 0, true, 0);
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
    $('wr-random').onclick = () => { Profile.rider = pick(RIDER_IDS); Profile.color = Math.floor(Math.random() * COLORS.length); Sound.play('pop'); this.changed(); };
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
    if (Net.active) Net.sendProfile();
    App.go(this.returnTo || 'title');
  },
  changed() { saveProfile(); this.render(); if (Net.active) Net.sendProfile(); },
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
    App.refreshTitle();
  },
  preview(t) {
    if (App.screen !== 'wardrobe') { this.previewing = false; return; }
    requestAnimationFrame((tt) => this.preview(tt));
    const now = t / 1000;
    const c = $('wr-preview'), x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, c.width, c.height);
    // a hop with a lean back then forward every couple of seconds
    const ph = (now % 2.4) / 2.4, hop = ph < 0.34 ? Math.sin((ph / 0.34) * Math.PI) * 10 : 0;
    const tilt = ph < 0.34 ? Math.sin((ph / 0.34) * Math.PI * 2) * 0.28 : 0;
    const sq = ph >= 0.34 && ph < 0.4 ? 2 : 0;
    x.fillStyle = '#b8743c'; x.fillRect(0, c.height - 8, c.width, 8);
    x.save(); x.translate(c.width / 2, c.height - 8 - Math.round(hop)); x.rotate(-tilt);
    drawBikeArt(x, bikeArt(Profile.color, Profile.rider), (now * 8 | 0) & 1, sq, true, ph < 0.17 ? -1 : ph < 0.34 ? 1 : 0);
    x.restore();
  },
};
