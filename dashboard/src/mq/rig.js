/* ---------- RIG: a 172 cm skeleton, posed by where each segment points ----------
   WHY directions, not inverse kinematics: v7 placed the hands and let a solver choose the elbows and
   shoulders, and it often chose something no human does (elbows flaring the wrong way, the lats
   "stretching" sideways). Here a pose says where the upper arm, forearm, thigh and shin point, and the
   joints follow exactly: an elbow can only bend the way an elbow bends, because its hinge axis is
   worked out from the two segments it joins.
   Units: metres. y is up, +z is the way the figure faces, +x is the figure's left. Left limbs are
   computed directly; right limbs are the same maths in a mirrored world, then mirrored back. */
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  sc: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  mx: a => [-a[0], a[1], a[2]]
};
const D2R = Math.PI / 180;
// rotate vector v about unit axis k by angle a (radians), Rodrigues
const rot = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a), d = V.dot(k, v), x = V.cross(k, v); return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]; };
// a frame: origin o and unit axes x, y, z in world space
const F = (o, x, y, z) => ({o, x, y, z});
const fRot = (f, k, a) => F(f.o, rot(f.x, k, a), rot(f.y, k, a), rot(f.z, k, a));
const fAt = (f, l) => V.add(f.o, V.add(V.add(V.sc(f.x, l[0]), V.sc(f.y, l[1])), V.sc(f.z, l[2])));   // local point → world
const fDir = (f, l) => V.add(V.add(V.sc(f.x, l[0]), V.sc(f.y, l[1])), V.sc(f.z, l[2]));             // local direction → world
const fMir = f => F(V.mx(f.o), V.mx(f.x), V.mx(f.y), V.mx(f.z));
// the same frame seen in the mirrored world: still right-handed, its +x is the figure's right side
const fMirP = f => F(V.mx(f.o), V.sc(V.mx(f.x), -1), V.mx(f.y), V.mx(f.z));
// rotate a frame about its own local axis ('x' | 'y' | 'z') by degrees
const fTurn = (f, ax, deg) => fRot(f, f[ax], deg * D2R);
// orthonormal frame with y = given, x close to the hint
const fromYX = (o, y, xh) => { y = V.norm(y); let x = V.sub(xh, V.sc(y, V.dot(xh, y))); if (V.len(x) < 1e-6) x = Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]; x = V.norm(V.sub(x, V.sc(y, V.dot(x, y)))); return F(o, x, y, V.cross(x, y)); };

/* Body measurements for 172 cm (Drillis and Contini segment ratios, checked against ISO 7250 adult male
   medians): hip joints at 0.91 m, knees 0.49, ankles 0.067, shoulders 1.40, upper arm 0.30, forearm 0.25. */
const SK = {
  pelvis: [0, 0.95, 0],        // standing pelvis origin (between the hip joints, a little above)
  hip: [0.087, -0.045, 0.01],  // hip joint, pelvis-local
  lumbar: [0, 0.05, -0.03], chest: [0, 0.18, 0.01], neck: [0, 0.27, -0.03], head: [0, 0.105, 0.02],
  sc: [0.022, 0.225, 0.085],   // sternoclavicular joint, chest-local
  shoulder: [0.184, 0.205, -0.02],  // shoulder joint centre, chest-local, shoulders relaxed
  upper: 0.300, fore: 0.250, palm: 0.095, fing1: 0.048, thigh: 0.418, shin: 0.423
};
const sideIn = (side, v) => side > 0 ? v : V.mx(v);

/* Pose fields (all optional; angles in degrees, directions are world vectors for the LEFT side, the right
   side mirrors them unless it has its own):
   root: {p, pitch, yaw, roll}      pelvis origin and tilt (pitch + = lean forward)
   spine: [lumbar flex, thoracic flex], side, twist; neck, head: flex
   arm  / armR: {clav: [elevate, protract], up, fore, palm, crease, wrist: [flex, dev], grip, thumb}
   leg  / legR: {thigh, shin, foot, knee, toes}
   'up'/'fore'/'thigh'/'shin'/'foot' may be {t: [..]}: relative to the chest (arms) or pelvis (legs). */
function solve(P) {
  P = P || {};
  const R = P.root || {}, B = {};
  let pel = F(R.p || SK.pelvis, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  pel = fTurn(pel, 'y', R.yaw || 0); pel = fTurn(pel, 'x', R.pitch || 0); pel = fTurn(pel, 'z', R.roll || 0);
  B.pelvis = pel;
  const sp = P.spine || [0, 0], tw = (P.twist || 0) / 2, sd = (P.side || 0) / 2;
  let lum = F(fAt(pel, SK.lumbar), pel.x, pel.y, pel.z); lum = fTurn(fTurn(fTurn(lum, 'x', sp[0]), 'z', -sd), 'y', tw); B.lumbar = lum;
  let ch = F(fAt(lum, SK.chest), lum.x, lum.y, lum.z); ch = fTurn(fTurn(fTurn(ch, 'x', sp[1]), 'z', -sd), 'y', tw); B.chest = ch;
  let nk = F(fAt(ch, SK.neck), ch.x, ch.y, ch.z); nk = fTurn(nk, 'x', P.neck || 0); B.neck = nk;
  let hd = F(fAt(nk, SK.head), nk.x, nk.y, nk.z); hd = fTurn(hd, 'x', P.head || 0); B.head = hd;
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    const a = (s < 0 && P.armR) || P.arm || {}, l = (s < 0 && P.legR) || P.leg || {};
    // work in a mirrored world for the right side, so one set of maths serves both
    const chS = s > 0 ? ch : fMirP(ch), pelS = s > 0 ? pel : fMirP(pel);
    // in the mirrored world a symmetric pose needs no change; a right-only field (real-world) gets mirrored in
    const arm = armFrames(chS, a, s < 0 && !!P.armR), leg = legFrames(pelS, l, s < 0 && !!P.legR);
    for (const [n, f] of Object.entries({...arm, ...leg})) B[n + k] = s > 0 ? f : fMir(f);
  }
  return B;
}
// world direction from a pose field in the side's working space; mirrored = a real-world right-side field
const dirOf = (v, ref, mirrored, def) => {
  if (!v) return def;
  if (Array.isArray(v)) return V.norm(mirrored ? V.mx(v) : v);
  return V.norm(fDir(ref, v.t));   // relative fields are already side-neutral
};
function armFrames(ch, a, mir) {
  const clav = a.clav || [0, 0];
  // the shoulder girdle: elevation lifts the outer end, protraction swings it forward (shoulder blades apart)
  let cl = F(fAt(ch, SK.sc), ch.x, ch.y, ch.z); cl = fTurn(cl, 'y', -clav[1]); cl = fTurn(cl, 'z', clav[0]);
  const sh = fAt(cl, V.sub(SK.shoulder, SK.sc));
  const up = dirOf(a.up, ch, mir, V.norm(fDir(ch, [0.12, -1, 0])));
  const fo = dirOf(a.fore, ch, mir, up);
  // elbow hinge: perpendicular to both segments, pointing outward. Nearly straight arm: use the crease hint
  const crease = dirOf(a.crease, ch, mir, V.norm(fDir(ch, [0, 0, 1])));
  const xh = V.cross(crease, up), xc = V.cross(fo, up), w = Math.min(1, Math.max(0, (V.len(xc) - 0.06) / 0.2));
  let hx = V.len(xc) > 1e-6 ? V.norm(xc) : xh; if (V.dot(hx, xh) < 0 && w < 1) hx = V.sc(hx, -1);
  const xa = V.norm(V.lerp(V.norm(xh), hx, w));
  const hum = fromYX(sh, V.sc(up, -1), xa);
  const elbow = V.add(sh, V.sc(up, SK.upper));
  let fa = fromYX(elbow, V.sc(fo, -1), hum.x);
  // forearm turn: the palm faces -x at neutral (thumb forward); turn it towards the palm hint, within ±100°
  if (a.palm) {
    const ph = dirOf(a.palm, ch, mir), y = fa.y, t = V.norm(V.sub(ph, V.sc(y, V.dot(ph, y)))), p0 = V.sc(fa.x, -1);
    let ang = Math.atan2(V.dot(V.cross(p0, t), y), V.dot(p0, t)) / D2R; ang = Math.max(-100, Math.min(100, ang));
    fa = fTurn(fa, 'y', ang);
  }
  const wrist = V.add(elbow, V.sc(fo, SK.fore)), wr = a.wrist || [0, 0];
  let hand = F(wrist, fa.x, fa.y, fa.z); hand = fTurn(fTurn(hand, 'z', -wr[0]), 'x', wr[1]);
  const g = a.grip == null ? 0.15 : a.grip;
  let f1 = F(fAt(hand, [0, -SK.palm, 0]), hand.x, hand.y, hand.z); f1 = fTurn(f1, 'z', -g * 85);
  let f2 = F(fAt(f1, [0, -SK.fing1, 0]), f1.x, f1.y, f1.z); f2 = fTurn(f2, 'z', -g * 95);
  let th = F(fAt(hand, [-0.006, -0.028, 0.03]), hand.x, hand.y, hand.z); th = fTurn(fTurn(th, 'x', 35), 'z', -(a.thumb == null ? g : a.thumb) * 55);
  return {clav: cl, upper: hum, fore: fa, hand, fing1: f1, fing2: f2, thumb: th};
}
function legFrames(pel, l, mir) {
  const hip = fAt(pel, SK.hip);
  const th = dirOf(l.thigh, pel, mir, V.norm(fDir(pel, [0.03, -1, 0]))), sh = dirOf(l.shin, pel, mir, th);
  const kneeH = dirOf(l.knee, pel, mir, V.norm(fDir(pel, [0.1, 0, 1])));   // which way the kneecap faces
  const xh = V.cross(V.sc(th, -1), kneeH), xc = V.cross(th, sh), w = Math.min(1, Math.max(0, (V.len(xc) - 0.06) / 0.2));
  let kx = V.len(xc) > 1e-6 ? V.norm(xc) : V.norm(xh); if (V.dot(kx, xh) < 0 && w < 1) kx = V.sc(kx, -1);
  const xa = V.norm(V.lerp(V.norm(xh), kx, w));
  const thigh = fromYX(hip, V.sc(th, -1), xa), knee = V.add(hip, V.sc(th, SK.thigh));
  const shin = fromYX(knee, V.sc(sh, -1), thigh.x), ankle = V.add(knee, V.sc(sh, SK.shin));
  const fd = dirOf(l.foot, pel, mir, V.norm(fDir(pel, [0.12, 0, 1])));
  const y = V.norm(V.cross(fd, shin.x)), z = V.norm(V.cross(shin.x, y));
  const foot = F(ankle, V.cross(y, z), y, z);
  let toes = F(fAt(foot, [0, -0.05, 0.145]), foot.x, foot.y, foot.z); toes = fTurn(toes, 'x', -(l.toes || 0));
  return {thigh, shin, foot, toes};
}
// degrees → unit direction: elevation from straight down, in a plane turned 'plane' degrees from the side
// (0 = out to the side, 90 = forward). Relative to a frame, for authoring poses by eye.
const armDir = (f, elev, plane) => { const e = elev * D2R, p = plane * D2R; return V.norm(fDir(f, [Math.sin(e) * Math.cos(p), -Math.cos(e), Math.sin(e) * Math.sin(p)])); };
const lerpPose = (A, B, t) => {
  if (A == null) return B; if (B == null) return A;
  if (typeof A === 'number') return A + (B - A) * t;
  if (Array.isArray(A)) return A.map((x, i) => lerpPose(x, B[i], t));
  if (typeof A === 'object') { const o = {}; for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) o[k] = lerpPose(A[k], B[k], t); return o; }
  return t < 0.5 ? A : B;
};
