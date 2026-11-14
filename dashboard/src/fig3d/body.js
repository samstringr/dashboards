/* ---------- BODY: rig and surface ----------
   Pure maths, no three.js. The figure faces +z, left is +x, y is up, metres.
   v7: the surface is a real scanned man (Z-Anatomy / BodyParts3D, CC BY-SA 4.0), remeshed and
   shrink-wrapped onto the atlas muscles offline (anat/bake.mjs). Every vertex carries how much fat
   sits over the muscle there (pull), the soft-tissue depth to bone (depth) and the muscle under it,
   so lean and fat mass reshape the same skin instead of inflating ellipsoids (v6 looked alien).
   The rig's lengths and offsets are read from the atlas's own bones, so the rest pose is exact. */
const D2R = Math.PI / 180;
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  sc: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  mad: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
};
const perp = (v, axis) => { const p = V.mad(v, axis, -V.dot(v, axis)); return V.len(p) < 1e-5 ? null : V.norm(p); };
const frameAt = deg => { const p = deg * D2R; return {l: [1, 0, 0], u: [0, Math.cos(p), Math.sin(p)], f: [0, -Math.sin(p), Math.cos(p)]}; };
const sym = a => [a, Array.isArray(a) ? [-a[0], a[1], a[2]] : {t: [-a.t[0], a.t[1], a.t[2]]}];
const rotV = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a), kv = V.cross(k, v), d = V.dot(k, v); return [v[0] * c + kv[0] * s + k[0] * d * (1 - c), v[1] * c + kv[1] * s + k[1] * d * (1 - c), v[2] * c + kv[2] * s + k[2] * d * (1 - c)]; };
const rotF = (F, k, a, o) => ({o: o || F.o, x: rotV(F.x, k, a), y: rotV(F.y, k, a), z: rotV(F.z, k, a)});
const toWorld = (F, l) => V.add(F.o, V.add(V.add(V.sc(F.x, l[0]), V.sc(F.y, l[1])), V.sc(F.z, l[2])));
const smooth01 = (a, b, t) => { const q = Math.min(1, Math.max(0, (t - a) / (b - a))); return q * q * (3 - 2 * q); };
const toLocal = (F, p) => { const d = V.sub(p, F.o); return [V.dot(d, F.x), V.dot(d, F.y), V.dot(d, F.z)]; };
const MUSCLES = ['chest', 'lats', 'upperback', 'traps', 'fdelt', 'sdelt', 'rdelt', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'erectors', 'glutes', 'quads', 'hams', 'adductors', 'calves'];
const MI = Object.fromEntries(MUSCLES.map((m, i) => [m, i]));

/* ---------- the atlas: unpack, then derive the rig ---------- */
let ATL = null, LEN = null, SK = null, REST_J = null, REST_B = null;
async function loadBody() {
  if (ATL) return ATL;
  ATL = await unpackBody2(BODY_B64);
  mannequinize(ATL);
  const J = ATL.J, mid = (a, b) => a.map((v, i) => (v + b[i]) / 2), dist = (a, b) => V.len(V.sub(a, b)), avg = (k1, k2) => (dist(J[k1 + 'L'], J[k2 + 'L']) + dist(J[k1 + 'R'], J[k2 + 'R'])) / 2;
  const hp = mid(J.hpL, J.hpR), P = [0, hp[1] + 0.02, hp[2]], N = [0, mid(J.shL, J.shR)[1] + 0.033, P[2]], tor = N[1] - P[1];
  // spine split at roughly L4, T10 and C7 on the atlas: 24 / 36 / 40 % of hip-to-neck
  LEN = {pelvis: tor * 0.24, abdomen: tor * 0.36, chest: tor * 0.40, ua: avg('sh', 'el'), fa: avg('el', 'wr'), hand: avg('wr', 'tip'), palm: avg('wr', 'kn3'), th: avg('hp', 'kn'), sh: avg('kn', 'an'), ft: avg('an', 'toe')};
  SK = {P, N, sh: [(J.shL[0] - J.shR[0]) / 2, J.shL[1] - N[1], J.shL[2] - P[2]], hp: [(J.hpL[0] - J.hpR[0]) / 2, J.hpL[1] - P[1], J.hpL[2] - P[2]], head: [0, J.head[1] - N[1], J.head[2] - P[2]],
    toe: V.sub(J.toeL, J.anL)};
  // rest joints straight from the bones (not IK), so binding is exact
  const F = frameAt(0), A = V.mad(P, F.u, LEN.pelvis), C = V.mad(A, F.u, LEN.abdomen);
  REST_J = {P, A, C, N, H: [0, J.head[1], J.head[2]], F0: F, F1: F, F2: F, F3: F, side: {}};
  for (const [k, sg] of [['L', 1], ['R', -1]]) {
    const sh = J['sh' + k], el = J['el' + k], wr = J['wr' + k], line = V.norm(V.sub(wr, sh)), off = V.sub(el, V.mad(sh, line, V.dot(V.sub(el, sh), line)));
    REST_J.side[k] = {sg, sh, el, wr, hp: J['hp' + k], kn: J['kn' + k], an: J['an' + k], toe: J['toe' + k], ep: V.len(off) > 0.01 ? V.norm(off) : [0.15 * sg, -0.05, -1], kp: [0, 0, 1], pron: 0, curl: 0};
  }
  REST_B = frames(REST_J);
  SK.kn3 = {L: toLocal(REST_B.hdL, J.kn3L), R: toLocal(REST_B.hdR, J.kn3R)};
  REST_B = frames(REST_J); // again, now the finger bone knows where the knuckles are
  const fmidOf = (a, b) => V.add(a, V.sc(V.sub(b, a), 0.45));
  SK.fmid = {L: toLocal(REST_B.fgL, fmidOf(J.kn3L, J.tipL)), R: toLocal(REST_B.fgR, fmidOf(J.kn3R, J.tipR))};
  REST_B = frames(REST_J); // and once more for the second finger joint
  return ATL;
}

function ik(a, t, l1, l2, pole) {
  const d0 = V.sub(t, a), dir = V.norm(d0);
  const d = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(V.len(d0), l1 + l2 - 1e-4));
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = perp(pole, dir) || perp([0, 0, 1], dir) || [1, 0, 0];
  return [V.mad(V.mad(a, dir, x), p, h), V.mad(a, dir, d)];
}
/* A pose: p pelvis centre (2 cm above the hip joints), pitch torso lean (0 upright, + forward, −90 on your back),
   bend extra chest lean, head extra head pitch, hands/feet/toe targets ([x,y,z] world or {t:[left,up,front]}
   from the pelvis), ep/kp elbow and knee pole directions, pron forearm turn in degrees from palms-forward
   (≈80 palms to the thighs, ≈170 palms back), curl finger bend in degrees (≈80 around a bar). */
function solve(pose) {
  const pitch = pose.pitch || 0, bend = pose.bend || 0;
  const F0 = frameAt(pitch), F1 = frameAt(pitch + bend * 0.5), F2 = frameAt(pitch + bend), F3 = frameAt(pitch + bend + (pose.head || 0));
  const P = pose.p, A = V.mad(P, F0.u, LEN.pelvis), C = V.mad(A, F1.u, LEN.abdomen), N = V.mad(C, F2.u, LEN.chest);
  const H = V.mad(V.mad(N, F3.u, SK.head[1]), F3.f, SK.head[2]);
  const at = t => Array.isArray(t) ? t : V.add(P, V.add(V.add(V.sc(F0.l, t.t[0]), V.sc(F0.u, t.t[1])), V.sc(F0.f, t.t[2])));
  const dirOf = t => Array.isArray(t) ? V.norm(t) : V.norm(V.add(V.add(V.sc(F0.l, t.t[0]), V.sc(F0.u, t.t[1])), V.sc(F0.f, t.t[2])));
  const J = {P, A, C, N, H, F0, F1, F2, F3, side: {}};
  for (const [k, s] of [['L', 0], ['R', 1]]) {
    const sg = s ? -1 : 1;
    const sh = V.mad(V.mad(V.mad(N, F2.l, sg * SK.sh[0]), F2.u, SK.sh[1]), F2.f, SK.sh[2]);
    const hp = V.mad(V.mad(V.mad(P, F0.l, sg * SK.hp[0]), F0.u, SK.hp[1]), F0.f, SK.hp[2]);
    const ep = dirOf(pose.ep[s]), kp = dirOf(pose.kp[s]);
    const [el, wr] = ik(sh, at(pose.hands[s]), LEN.ua, LEN.fa, ep);
    const [kn, an] = ik(hp, at(pose.feet[s]), LEN.th, LEN.sh, kp);
    let toe;
    if (pose.toe) { const tt = at(pose.toe[s]), d = V.norm(V.sub(tt, an)); toe = V.mad(an, d, LEN.ft); }
    else { let fw = [F0.f[0], 0, F0.f[2]]; if (V.len(fw) < 0.3 || pitch < -45) fw = [0, 0, 1]; fw = V.norm(fw); toe = V.add(V.add(V.mad(an, fw, SK.toe[2]), [sg * SK.toe[0], 0, 0]), [0, SK.toe[1], 0]); }
    J.side[k] = {sg, sh, el, wr, hp, kn, an, toe, ep, kp, pron: pose.pron ? pose.pron[s] : 80, curl: pose.curl ? pose.curl[s] : 20};
  }
  return J;
}
/* Bone frames {o origin, x lateral (or left for the torso), y along, z front}. Limbs take their front from
   the pole: the inside of the elbow faces away from the elbow pole, the kneecap faces the knee pole.
   The forearm turns in two steps (tw halfway, hd at the wrist) so the twist spreads along it rather than
   pinching at the wrist; the fingers (fg) curl about the knuckle line towards the palm. */
function frames(J) {
  const B = {};
  const tf = (o, F, sg = 1) => ({o, x: V.sc(F.l, sg), y: F.u, z: F.f});
  B.pelvis = tf(J.P, J.F0); B.abdomen = tf(J.A, J.F1); B.chest = tf(J.C, J.F2); B.neck = tf(J.N, J.F3); B.head = tf(J.H, J.F3);
  for (const k of ['L', 'R']) {
    const S = J.side[k], sg = S.sg;
    /* front of a limb bone: from the bend itself once the joint is bent past ~10° (the hinge decides which way
       the elbow crease and kneecap face), from the pole when it is nearly straight. Taking it from the pole
       alone flipped the forearm 180° in a full curl. */
    const limb = (o, b, front, fb, bend, w) => { const y = V.norm(V.sub(b, o)); let z = perp(front, y) || perp(fb, y) || perp([0, 0, 1], y); const zb = bend && perp(bend, y); if (zb && w > 0) z = perp(V.add(V.sc(z, 1 - w), V.sc(zb, w)), y) || z; return {o, y, z, x: V.sc(V.cross(z, y), sg)}; };
    const neg = v => V.sc(v, -1), bw = (a, b) => smooth01(0.17, 0.4, V.len(V.cross(a, b)));
    const uaY = V.norm(V.sub(S.el, S.sh)), faY = V.norm(V.sub(S.wr, S.el)), wA = bw(uaY, faY);
    const thY = V.norm(V.sub(S.kn, S.hp)), snY = V.norm(V.sub(S.an, S.kn)), wL = bw(thY, snY);
    B['ua' + k] = limb(S.sh, S.el, neg(S.ep), J.F2.f, faY, wA);
    const fa = B['fa' + k] = limb(S.el, S.wr, neg(S.ep), J.F2.f, neg(uaY), wA), tw = sg * (S.pron || 0) * D2R;
    B['tw' + k] = rotF(fa, fa.y, tw / 2, V.sc(V.add(S.el, S.wr), 0.5));
    const hd = B['hd' + k] = rotF(fa, fa.y, tw, S.wr);
    /* Two finger joints (14 Nov 2026, Sam: the hands weren't gripping the bars). One bend at the knuckles left the
       fingers straight, sticking out of the palm; a grip curls at the knuckles and again halfway along. */
    const fg = B['fg' + k] = rotF(hd, V.norm(V.cross(hd.y, hd.z)), (S.curl || 0) * 0.6 * D2R, SK && SK.kn3 ? toWorld(hd, SK.kn3[k]) : S.wr);
    B['fx' + k] = rotF(fg, V.norm(V.cross(fg.y, fg.z)), (S.curl || 0) * 0.9 * D2R, SK && SK.fmid ? toWorld(fg, SK.fmid[k]) : fg.o);
    B['th' + k] = limb(S.hp, S.kn, S.kp, J.F0.f, neg(snY), wL);
    B['sn' + k] = limb(S.kn, S.an, S.kp, J.F0.f, thY, wL);
    B['ft' + k] = limb(S.an, S.toe, V.sub(S.kn, S.an), [0, 1, 0]);
  }
  return B;
}
/* How Sam would stand for a photo: arms hanging just off the thighs, elbows soft, palms in, fingers relaxed. */
function standPose() {
  const J = ATL.J, P = SK.P;
  return {p: P, pitch: 0, hands: [[0.232, 0.86, 0.066], [-0.232, 0.86, 0.066]], ep: sym([0.28, 0, -1]), feet: [J.anL, J.anR], toe: [J.toeL, J.toeR], kp: sym([0.04, 0, 1]), pron: [78, 78], curl: [28, 28]};
}

/* ---------- surface ---------- */
/* Arc length along a polyline (a limb's bones), from its start, for the point's nearest segment. */
function chainU(p, pts) {
  let best = 1e9, u = 0, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], ab = V.sub(pts[i + 1], a), L = V.len(ab), t = Math.max(i ? 0 : -0.5, Math.min(i < pts.length - 2 ? 1 : 1.5, V.dot(V.sub(p, a), ab) / (L * L)));
    const d = V.len(V.sub(p, V.mad(a, ab, t))); if (d < best) { best = d; u = acc + t * L; } acc += L;
  }
  return u;
}
let SURF = null; // composition-independent: weights, muscle shares, shorts
function surface() {
  if (SURF) return SURF;
  const B = ATL, nv = B.h.nv, J = ATL.J, R = REST_J;
  const bones = Object.keys(REST_B).concat(['clL', 'clR']), bi = Object.fromEntries(bones.map((b, i) => [b, i]));
  const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4), SHORTS = new Float32Array(nv), SM = new Float32Array(nv), RY = new Float32Array(nv), MW = new Float32Array(nv * MUSCLES.length);
  const knots = [R.P[1] - 1, R.A[1], R.C[1], R.N[1] + 0.01, 1.505], spineB = ['pelvis', 'abdomen', 'chest', 'neck', 'head'], blend = [0, 0.05, 0.06, 0.035, 0.035];
  /* The armpit: where each arm's skin meets the torso's, about 20 cm below the shoulder joint.
     13 Nov 2026: Sam saw fins down the lats on the pulldown and presses: the arm side of the armpit followed the
     upper arm fully while the torso side next to it stayed put. The first fix gave the torso skin near the
     armpit the full shoulder-bone weight over 14 cm, which pushed the lats out like wings whenever the arms went
     up (14 Nov: "freakishly wide lats", "a bat" on the hanging leg raise, the side delt hidden on raises).
     Now both sides of the armpit seam carry a small, equal share of the shoulder bone (k = 0.2), the torso hands
     back to the ribcage within 4 cm, and the arm hands over to the upper arm within 12 cm. Compared side by side
     at k = 0, 0.2 and 0.4 (contact sheets, 14 Nov): 0 shows the fins, 0.4 the wings, 0.2 neither.
     __SEAM is a test-only override for that comparison. */
  const SP = globalThis.__SEAM || {k: 0.2, dArm: 0.12, dTorso: 0.04, drop: 0.06};
  const seam = {L: [], R: []};
  for (let t = 0; t < B.I.length; t += 3) {
    const gs = [B.grp[B.I[t]], B.grp[B.I[t + 1]], B.grp[B.I[t + 2]]], arm = gs.filter(g => g === 3 || g === 4);
    if (!arm.length || arm.length === 3 || gs.some(g => g >= 5)) continue;
    for (let q = 0; q < 3; q++) if (gs[q] === 3 || gs[q] === 4) { const k = gs[q] === 3 ? 'L' : 'R', v = B.I[t + q]; if (B.P[v * 3 + 1] < R.side[k].sh[1] - SP.drop) seam[k].push(v); }   // the armpit part only
  }
  const seamD = (p, k) => { const S = R.side[k]; if (V.len(V.sub(p, S.sh)) > 0.4) return 1; let d = 1; for (const q of seam[k]) { const dx = B.P[q * 3] - p[0], dy = B.P[q * 3 + 1] - p[1], dz = B.P[q * 3 + 2] - p[2], e = dx * dx + dy * dy + dz * dz; if (e < d) d = e; } return Math.sqrt(d); };
  for (let v = 0; v < nv; v++) {
    const p = [B.P[v * 3], B.P[v * 3 + 1], B.P[v * 3 + 2]], g = B.grp[v], w = new Map(), add = (b, x) => { if (x > 1e-4) w.set(b, (w.get(b) || 0) + x); };
    const spine = share => { // partition of unity along the spine by height
      let prev = 1; for (let i = 1; i < spineB.length; i++) { const r = smooth01(knots[i] - blend[i], knots[i] + blend[i], p[1]); add(spineB[i - 1], share * (prev - r)); prev = r; } add('head', share * prev);
    };
    const sideOf = g >= 3 && g <= 8 ? (g % 2 ? 'L' : 'R') : p[0] >= 0 ? 'L' : 'R';
    if (g === 3 || g === 4) { // arm
      const k = g === 3 ? 'L' : 'R', S = R.side[k], u = chainU(p, [S.sh, S.el, S.wr, J['kn3' + k], J['tip' + k]]);
      const aS = smooth01(0, SP.dArm, seamD(p, k)), a = Math.min(smooth01(-0.04, 0.12, u), aS), cs = SP.k + (1 - SP.k) * aS, e = smooth01(LEN.ua - 0.035, LEN.ua + 0.035, u), q = Math.min(1, Math.max(0, (u - LEN.ua) / LEN.fa)), f = smooth01(LEN.ua + LEN.fa + LEN.palm - 0.012, LEN.ua + LEN.fa + LEN.palm + 0.016, u);
      add('cl' + k, (1 - a) * cs); spine((1 - a) * (1 - cs)); add('ua' + k, a * (1 - e));
      const fore = a * e * (1 - f); if (q < 0.5) { add('fa' + k, fore * (1 - 2 * q)); add('tw' + k, fore * 2 * q); } else { add('tw' + k, fore * (2 - 2 * q)); add('hd' + k, fore * (2 * q - 1)); }
      const uM = LEN.ua + LEN.fa + LEN.palm + 0.45 * (LEN.hand - LEN.palm), f2 = smooth01(uM - 0.008, uM + 0.01, u);
      add('fg' + k, a * e * f * (1 - f2)); add('fx' + k, a * e * f * f2);
    } else if (g >= 5) { // leg, hip, crotch
      const dd = (p[1] - J.hpL[1]) - 0.5 * (p[2] - J.hpL[2]), t = 1 - smooth01(-0.10, 0.03, dd);
      const legs = g === 9 || Math.abs(p[0]) < 0.03 ? [['L', smooth01(-0.03, 0.03, p[0])], ['R', 1 - smooth01(-0.03, 0.03, p[0])]] : [[sideOf, 1]];
      spine(1 - t);
      for (const [k, s] of legs) {
        const S = R.side[k], u = chainU(p, [S.hp, S.kn, S.an, S.toe]), kk = smooth01(LEN.th - 0.04, LEN.th + 0.04, u), aa = smooth01(LEN.th + LEN.sh - 0.03, LEN.th + LEN.sh + 0.03, u);
        add('th' + k, t * s * (1 - kk)); add('sn' + k, t * s * kk * (1 - aa)); add('ft' + k, t * s * aa);
      }
    } else { // torso, neck, head; the shoulder bone carries the skin around the joint
      /* torso skin round the armpit follows the shoulder bone only partly, fading over 20 cm: a steep
         fade (v7 draft: full weight to 4.5 cm, gone by 15) folded the side of the chest into stripes when
         the arm moved */
      const S = R.side[sideOf], c = g === 2 ? 0 : Math.max(0.55 * (1 - smooth01(0.02, 0.20, V.len(V.sub(p, S.sh)))) * smooth01(0.05, 0.12, Math.abs(p[0])), SP.k * (1 - smooth01(0, SP.dTorso, seamD(p, sideOf))));
      add('cl' + sideOf, c); spine(1 - c);
    }
    const list = [...w].sort((x, y) => y[1] - x[1]).slice(0, 4), tot = list.reduce((s, x) => s + x[1], 0) || 1;
    list.forEach(([b, x], i) => { SI[v * 4 + i] = bi[b]; SW[v * 4 + i] = x / tot; });
    RY[v] = p[1]; if (g !== 2 && g !== 3 && g !== 4) { SM[v] = 1; SHORTS[v] = smooth01(0.605, 0.625, p[1]) * (1 - smooth01(0.972, 0.99, p[1])); } // the edge itself is drawn per pixel (view.js)
    let m = B.mk[v] === 255 ? -1 : MUSCLES.indexOf(B.h.mk[B.mk[v]]);
    /* WHY: the atlas labels the whole front of the belly as obliques and the lumbar strip as lats/traps, so abs
       and lower back could never colour in (found 6 Nov 2026: 0 and 22 vertices). Re-labelled by position:
       the rectus strip either side of the midline (about 5 cm at the pubis widening to 7 cm under the ribs) is
       abs; the strip either side of the spine, between the glutes and the bottom of the ribs, is lower back. */
    if (g !== 3 && g !== 4) {
      const ax = Math.abs(p[0]);
      if (m === MI.obliques && p[2] > 0.03 && ax < 0.052 + 0.02 * smooth01(0.92, 1.12, p[1])) m = MI.abs;
      else if (p[2] < 0.02 && ax < 0.05 && p[1] > 0.95 && p[1] < 1.16 && (m < 0 || m === MI.lats || m === MI.traps)) m = MI.erectors;
    }
    if (m >= 0) MW[v * MUSCLES.length + m] = 1;
  }
  // soften the muscle borders over a couple of rings so a highlight glows rather than cuts off
  const nb = Array.from({length: nv}, () => []);
  for (let t = 0; t < B.I.length; t += 3) for (let k = 0; k < 3; k++) { const a = B.I[t + k], b = B.I[t + (k + 1) % 3]; nb[a].push(b); nb[b].push(a); }
  const n = MUSCLES.length;
  for (let it = 0; it < 3; it++) { const T = MW.slice(); for (let v = 0; v < nv; v++) { const s = nb[v]; if (!s.length) continue; for (let q = 0; q < n; q++) { let a = T[v * n + q]; for (const u of s) a += T[u * n + q]; MW[v * n + q] = a / (s.length + 1); } } }
  return (SURF = {skinIndex: SI, skinWeight: SW, shorts: SHORTS, shortsMask: SM, restY: RY, muscleW: MW, fib: new Float32Array(nv), bones});
}
function buildMesh(comp) {
  const s = surface(), shp = shapeBody(ATL, comp);
  // the lean/fat offsets change at muscle borders; a light pass stops those borders showing as ridges
  taubin(shp.P, ATL.adj, null, 2);
  return {pos: shp.P, idx: ATL.I, ...s, rest: REST_B, comp: shp, cav: cavity(shp.P, ATL.adj, ATL.I)};
}
/* ---------- mannequin finish (v9) ----------
   WHY: Sam wanted a plain mannequin like his reference image, not a scanned person. The atlas head has a
   real face and the skin keeps faint ridges from the muscle borders (the "lines on the back"). Both are
   smoothed away here, once, at load: Taubin smoothing (a shrink step then an inflate step) so the body
   keeps its volume and proportions while small detail fades. The head is smoothed far harder than the
   body, blending in across the chin, so the face becomes a blank egg like a display mannequin's. */
// how far each vertex sits below its neighbours along its normal (metres): > 0 in the grooves between muscles
function cavity(P, adj, I) {
  const N = vnormals(P, I), nv = P.length / 3, c = new Float32Array(nv);
  for (let v = 0; v < nv; v++) { let x = 0, y = 0, z = 0; const s0 = adj.start[v], s1 = adj.start[v + 1], k = (s1 - s0) || 1; for (let j = s0; j < s1; j++) { const u = adj.nb[j] * 3; x += P[u]; y += P[u + 1]; z += P[u + 2]; }
    c[v] = (x / k - P[v * 3]) * N[v * 3] + (y / k - P[v * 3 + 1]) * N[v * 3 + 1] + (z / k - P[v * 3 + 2]) * N[v * 3 + 2]; }
  // the same groove over a few rings, so it reads as a soft shadow rather than speckle
  for (let it = 0; it < 10; it++) { const t = new Float32Array(nv); for (let v = 0; v < nv; v++) { let a = c[v], n = 1; for (let j = adj.start[v]; j < adj.start[v + 1]; j++) { a += c[adj.nb[j]]; n++; } t[v] = a / n; } c.set(t); }
  return c;
}
function adjacency(I, nv) {
  const deg = new Uint32Array(nv + 1);
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) deg[I[t + k]] += 2;
  const start = new Uint32Array(nv + 1); for (let v = 0; v < nv; v++) start[v + 1] = start[v] + deg[v];
  const nb = new Uint32Array(start[nv]), fill = start.slice(0, nv);
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; nb[fill[a]++] = b; nb[fill[a]++] = c; nb[fill[b]++] = a; nb[fill[b]++] = c; nb[fill[c]++] = a; nb[fill[c]++] = b; }
  return {start, nb};
}
// Taubin smoothing in place; w (per vertex 0..1) limits where it acts, list = the vertices to touch
function taubin(P, adj, w, iters, list) {
  const nv = P.length / 3, L = list || null, n = L ? L.length : nv, tmp = new Float32Array(n * 3);
  for (let it = 0; it < iters * 2; it++) {
    const f = it % 2 ? -0.53 : 0.5;
    for (let i = 0; i < n; i++) {
      const v = L ? L[i] : i, s0 = adj.start[v], s1 = adj.start[v + 1]; let x = 0, y = 0, z = 0;
      for (let j = s0; j < s1; j++) { const u = adj.nb[j] * 3; x += P[u]; y += P[u + 1]; z += P[u + 2]; }
      const k = (s1 - s0) || 1, g = f * (w ? w[v] : 1);
      tmp[i * 3] = P[v * 3] + g * (x / k - P[v * 3]); tmp[i * 3 + 1] = P[v * 3 + 1] + g * (y / k - P[v * 3 + 1]); tmp[i * 3 + 2] = P[v * 3 + 2] + g * (z / k - P[v * 3 + 2]);
    }
    for (let i = 0; i < n; i++) { const v = L ? L[i] : i; P[v * 3] = tmp[i * 3]; P[v * 3 + 1] = tmp[i * 3 + 1]; P[v * 3 + 2] = tmp[i * 3 + 2]; }
  }
}
// plain Laplacian (moves each vertex towards its neighbours' average): kills spikes and folds outright
function relax(P, adj, w, iters, f, list) {
  const L = list || null, n = L ? L.length : P.length / 3, tmp = new Float32Array(n * 3);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      const v = L ? L[i] : i, s0 = adj.start[v], s1 = adj.start[v + 1]; let x = 0, y = 0, z = 0;
      for (let j = s0; j < s1; j++) { const u = adj.nb[j] * 3; x += P[u]; y += P[u + 1]; z += P[u + 2]; }
      const k = (s1 - s0) || 1, g = f * (w ? w[v] : 1);
      tmp[i * 3] = P[v * 3] + g * (x / k - P[v * 3]); tmp[i * 3 + 1] = P[v * 3 + 1] + g * (y / k - P[v * 3 + 1]); tmp[i * 3 + 2] = P[v * 3 + 2] + g * (z / k - P[v * 3 + 2]);
    }
    for (let i = 0; i < n; i++) { const v = L ? L[i] : i; P[v * 3] = tmp[i * 3]; P[v * 3 + 1] = tmp[i * 3 + 1]; P[v * 3 + 2] = tmp[i * 3 + 2]; }
  }
}
function mannequinize(A) {
  const nv = A.h.nv, P = A.P, adj = A.adj = adjacency(A.I, nv);
  // the chin sits about 6 cm above the shoulder joints
  const shY = (A.J.shL[1] + A.J.shR[1]) / 2, y0 = shY + 0.075, y1 = shY + 0.11;
  // the skull's extent (ears ignored), and the forehead's depth: the face is rebuilt as a smooth dome at
  // that depth, so the nose, eyes and mouth disappear but the head keeps its own shape and size
  let top = -1e9, back = 1e9, brow = -1e9, wide = 0;
  for (let v = 0; v < nv; v++) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; if (y < y1) continue; top = Math.max(top, y); if (Math.abs(x) < 0.07) back = Math.min(back, z); }
  for (let v = 0; v < nv; v++) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; if (y > top - 0.075 && y < top - 0.04 && Math.abs(x) < 0.03) brow = Math.max(brow, z); if (y > top - 0.12 && y < top - 0.06) wide = Math.max(wide, Math.abs(x) < 0.09 ? Math.abs(x) : 0); }
  // the dome covers the upper face (eyes and nose); the mouth and chin are only smoothed, so the jaw keeps its line
  const cy = top - 0.1, ry = 0.125, rx = Math.min(wide, 0.08) + 0.004, cz = (back + brow) / 2, rz = (brow - back) / 2;
  const w = new Float32Array(nv), head = [];
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0))), up = t * t * (3 - 2 * t);
    if (y > y0 - 0.03) head.push(v);
    w[v] = up;
    if (z <= cz || up <= 0) continue;
    const q = 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2; if (q <= 0) continue;
    const zf = cz + rz * Math.sqrt(q), face = Math.min(1, Math.max(0, (0.085 - Math.abs(x)) / 0.025)), lo = Math.min(1, Math.max(0, (y - (top - 0.19)) / 0.05)), upper = lo * lo * (3 - 2 * lo);
    P[v * 3 + 2] += upper * face * (zf - z);
  }
  const H = Uint32Array.from(head);
  // lips and chin: flattened in place (a plain average pulls a bump into its surroundings), so the lower face
  // reads as a smooth jaw rather than a muzzle under the blank upper face
  const mw = new Float32Array(nv);
  for (const v of H) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], a = Math.min(1, Math.max(0, (y - (top - 0.235)) / 0.03)) * Math.min(1, Math.max(0, ((top - 0.11) - y) / 0.03)), f = Math.min(1, Math.max(0, (z - cz) / 0.03)) * Math.min(1, Math.max(0, (0.07 - Math.abs(x)) / 0.025)); mw[v] = a * f; }
  relax(P, adj, mw, 70, 0.6, H);
  taubin(P, adj, w, 40, H);              // blend the rebuilt face into the head and soften the mouth, volume kept
  relax(P, adj, null, 1, 0.4);           // everywhere: spikes and small folds go
  taubin(P, adj, null, 3);               // a light pass only: the muscle shapes are the detail worth keeping
  A.N = null;   // normals follow the smoothed surface
}
// The mesh has ~3% folded triangles (from simplifying the scan), which shade as bright specks. Normals
// averaged over each vertex's neighbours a few times hide them without moving the surface.
function smoothNormals(N, adj, iters = 3) {
  const nv = N.length / 3, tmp = new Float32Array(N.length);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < nv; v++) { let x = N[v * 3], y = N[v * 3 + 1], z = N[v * 3 + 2]; for (let j = adj.start[v]; j < adj.start[v + 1]; j++) { const u = adj.nb[j] * 3; x += N[u] * 0.5; y += N[u + 1] * 0.5; z += N[u + 2] * 0.5; } const l = Math.hypot(x, y, z) || 1; tmp[v * 3] = x / l; tmp[v * 3 + 1] = y / l; tmp[v * 3 + 2] = z / l; }
    N.set(tmp);
  }
  return N;
}
