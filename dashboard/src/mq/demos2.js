/* ---------- DEMOS 2: the rest of chest & back day ----------
   Conventions as in demos.js: k = 0 is the stretched end of the rep, 1 the contracted end. Hands on a lever
   or cable travel on an arc about its pivot, not in a straight line, so the elbow path is the machine's. */
function slerpV(a, b, k) {
  const la = V.len(a), lb = V.len(b), na = V.norm(a), nb = V.norm(b), ang = Math.acos(clamp(V.dot(na, nb), -1, 1));
  if (ang < 1e-4) return V.sc(V.norm(V.lerp(na, nb, k)), lerp1(la, lb, k));
  let ax = V.cross(na, nb); ax = V.len(ax) < 1e-6 ? [1, 0, 0] : V.norm(ax);
  return V.sc(rot(na, ax, ang * k), lerp1(la, lb, k));
}
const arcAbout = (P, a, b, k) => V.add(P, slerpV(V.sub(a, P), V.sub(b, P), k));
const gripOf = (B, s) => fAt(B['hand' + s], [-0.022, -0.078, 0]);
// a frame at o whose x runs along dir, y as close to up as it can be
const frameX = (o, dir) => { const x = V.norm(dir), y0 = Math.abs(x[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0], z = V.norm(V.cross(x, y0)); return F(o, x, V.cross(z, x), z); };
const frameW = o => F(o, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const seat = (z = 0, y = 0.43) => [pad([0, y, z], [0.19, 0.035, 0.18]), tube([0, 0.0, z], [0, y - 0.03, z], 0.035), tube([-0.22, 0.02, z], [0.22, 0.02, z], 0.03)];
const dHandle = bone => [bone, 'Q', [-0.022, -0.078, -0.06], [-0.022, -0.078, 0.06], 0.015, {mat: 'steel'}];
const vHandle = fr => [fr, 'Y', [0, -0.075, 0], [0, 0.075, 0], 0.018, {mat: 'pad'}];
const SIT_FEET = p => legsTo(p, [0.17, 0.075, 0.5], [0.2, 0.3, 1], [0.15, 0, 1]);
// right-side copy of a left-side point or direction given in a frame's terms
const both = (fn) => [fn(1), fn(-1)];

/* ---- Chest-supported row, seated machine ----
   Footage cues: sit tall with the chest on the pad, feet planted. Start: arms long, shoulder blades spread
   forward. Pull: shoulder blades back first, then elbows back past the torso, hands to the lower chest beside
   the pad; neutral handles. Return over 2 s. */
{
  const base = {root: {p: [0, 0.545, -0.04], pitch: 9}, spine: [2, 3], neck: -6, head: -2};
  const B0 = solve(SIT_FEET(base)), C0 = B0.chest, padC = fAt(C0, [0, 0.11, 0.145]);
  const gS = fAt(C0, [0.2, 0.1, 0.6]), gE = fAt(C0, [0.21, 0.07, 0.15]), PIV = [0.21, 1.66, gS[2] + 0.08];
  demo('chestrow', {
    cam: {yaw: 62, pitch: 12, dist: 3.7, target: [0, 0.95, 0.2]}, tempo: [1.0, 0.5, 2.0, 0.4],
    props: [...seat(-0.05), ['world', 'B', padC, [0.15, 0.19, 0.035], 0.025, {mat: 'pad', rot: [14, 0, 0]}], tube(V.add(padC, [0, 0, 0.04]), [0, 0.0, padC[2] + 0.16], 0.035),
      tube([0, 0, 0.95], [0, 1.72, 0.95], 0.045), tube([-0.32, 1.72, 0.95], [0.32, 1.72, 0.95], 0.04), vHandle('handleL'), vHandle('handleR')],
    frames: ['handleL', 'handleR'],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = SIT_FEET({...base, arm: {clav: [lerp1(4, -2, k), lerp1(14, -16, k)]}});
      const C = solve(p).chest, gL = arcAbout(PIV, gS, gE, k), pole = V.norm(V.lerp(fDir(C, [0.45, -0.8, -0.4]), fDir(C, [0.4, -0.55, -1]), k));
      p = armsTo(p, gL, mirP(gL), pole, mirP(pole), {arm: {palm: fDir(C, [-1, 0, 0.1])}, armR: {palm: V.mx(fDir(C, [-1, 0, 0.1]))}});
      const B = solve(p), fr = {}, segs = [];
      for (const s of ['L', 'R']) { const g = gripOf(B, s), piv = s === 'L' ? PIV : mirP(PIV); fr['handle' + s] = frameW(g); segs.push([piv, V.add(g, [0, 0.075, 0]), 0.02]); }
      return {pose: p, frames: fr, segs};
    }
  });
}

/* ---- Pec deck (handles) ----
   Footage cues: back flat on the pad, upper arms level with the shoulders, a small fixed bend in the elbow.
   Hands travel a wide arc and nearly meet in front of the chest; open until the chest stretches, hands just
   behind the shoulders. Elbows stay up and out; shoulder blades stay back. */
{
  const base = {root: {p: [0, 0.545, 0.02], pitch: -3}, spine: [0, -2], neck: 2};
  const B0 = solve(SIT_FEET(base)), C0 = B0.chest, back = fAt(C0, [0, 0.1, -0.145]), S0 = B0.upperL.o, R = 0.56;
  const hand = (C, S, th) => V.add(S, fDir(C, [R * Math.cos(th * D2R), -0.05, R * Math.sin(th * D2R)]));
  demo('pecdeck', {
    cam: {yaw: 28, pitch: 14, dist: 3.8, target: [0, 1.05, 0.1]}, tempo: [1.1, 0.5, 2.2, 0.4],
    props: [...seat(0.02), ['world', 'B', back, [0.16, 0.32, 0.035], 0.025, {mat: 'pad', rot: [-3, 0, 0]}], tube([0, 0.4, back[2] - 0.05], [0, 1.85, back[2] - 0.08], 0.045),
      tube([-0.3, 1.85, back[2] - 0.08], [0.3, 1.85, back[2] - 0.08], 0.04), vHandle('handleL'), vHandle('handleR')],
    frames: ['handleL', 'handleR'],
    pose(t) {
      const k = phaseK(t, this.tempo), th = lerp1(-14, 104, k);
      let p = SIT_FEET({...base, arm: {clav: [0, lerp1(-10, 6, k)]}});
      const B1 = solve(p), C = B1.chest, gL = hand(C, B1.upperL.o, th), c = Math.cos(th * D2R), s = Math.sin(th * D2R);
      const pole = V.norm(fDir(C, [s, -0.35, -c])), palm = fDir(C, [-s, 0, c]);
      p = armsTo(p, gL, mirP(gL), pole, mirP(pole), {arm: {palm}, armR: {palm: V.mx(palm)}});
      const B = solve(p), fr = {}, segs = [];
      for (const sd of ['L', 'R']) { const g = gripOf(B, sd), sh = B['upper' + sd].o; fr['handle' + sd] = frameW(g); segs.push([[sh[0] * 0.95, 1.8, sh[2]], V.add(g, [0, 0.075, 0]), 0.018]); }
      return {pose: p, frames: fr, segs};
    }
  });
}

/* ---- Reverse pec deck (rear delts) ----
   Footage cues: face the machine, chest on the pad, handles at shoulder height in front. Sweep the arms out
   and back in a wide arc, elbows leading and a touch bent, until the arms line up with the shoulders; squeeze
   the shoulder blades, then return over 2 s. */
{
  const base = {root: {p: [0, 0.545, -0.02], pitch: 6}, spine: [0, 2], neck: -4};
  const B0 = solve(SIT_FEET(base)), C0 = B0.chest, front = fAt(C0, [0, 0.1, 0.15]), R = 0.57;
  const hand = (C, S, th) => V.add(S, fDir(C, [R * Math.cos(th * D2R), -0.02, R * Math.sin(th * D2R)]));
  demo('revpec', {
    cam: {yaw: 150, pitch: 18, dist: 3.8, target: [0, 1.05, 0.05]}, tempo: [1.0, 0.6, 2.0, 0.4],
    props: [...seat(-0.02), ['world', 'B', front, [0.15, 0.26, 0.035], 0.025, {mat: 'pad', rot: [8, 0, 0]}], tube(V.add(front, [0, 0, 0.05]), [0, 1.85, front[2] + 0.12], 0.045), tube([0, 0, front[2] + 0.12], [0, 0.6, front[2] + 0.12], 0.045),
      tube([-0.3, 1.85, front[2] + 0.12], [0.3, 1.85, front[2] + 0.12], 0.04), vHandle('handleL'), vHandle('handleR')],
    frames: ['handleL', 'handleR'],
    pose(t) {
      const k = phaseK(t, this.tempo), th = lerp1(96, -6, k);
      let p = SIT_FEET({...base, arm: {clav: [0, lerp1(12, -14, k)]}});
      const B1 = solve(p), C = B1.chest, gL = hand(C, B1.upperL.o, th), c = Math.cos(th * D2R), s = Math.sin(th * D2R);
      const pole = V.norm(fDir(C, [s, 0.15, -c])), palm = fDir(C, [-s, 0, c]);
      p = armsTo(p, gL, mirP(gL), pole, mirP(pole), {arm: {palm}, armR: {palm: V.mx(palm)}});
      const B = solve(p), fr = {}, segs = [];
      for (const sd of ['L', 'R']) { const g = gripOf(B, sd), sh = B['upper' + sd].o; fr['handle' + sd] = frameW(g); segs.push([[sh[0] * 0.95, 1.8, sh[2] + 0.05], V.add(g, [0, 0.075, 0]), 0.018]); }
      return {pose: p, frames: fr, segs};
    }
  });
}

/* ---- Cable pullover (straight-arm pulldown, rope) ----
   Footage cues: face a high pulley, step back, hinge about 25° with soft knees, arms long with a slight bend.
   Sweep the rope from overhead down to the thighs in an arc, moving only at the shoulders: the lats do it,
   the elbows don't bend more. Let it rise until the arms are overhead and the lats stretch. */
{
  const base = {root: {p: [0, 0.935, -0.08], pitch: 24}, spine: [2, 2], neck: -10, head: -4};
  const st = p => legsTo(p, [0.12, 0.067, -0.03], [0.1, 0, 1], [0.12, 0, 1]);
  const B0 = solve(st(base)), S0 = B0.upperL.o, TOP = [0, 2.2, 0.95], L = 0.6;
  const dS = V.norm(V.sub([0.08, TOP[1], TOP[2]], S0)), dE = V.norm([-0.1, -1, 0.02]);
  demo('straightarm', {
    cam: {yaw: 72, pitch: 8, dist: 4.7, target: [0, 1.25, 0.35]}, tempo: [1.0, 0.5, 2.0, 0.4],
    props: [tube([0, 0, 1.08], [0, 2.3, 1.08], 0.045), tube([0, 2.3, 1.08], [0, 2.3, TOP[2]], 0.035), ['world', 'Q', [-0.015, TOP[1], TOP[2]], [0.015, TOP[1], TOP[2]], 0.05, {mat: 'steel'}],
      ['world', 'B', [0, 0.45, 1.1], [0.14, 0.3, 0.06], 0.01, {mat: 'iron'}]],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = st({...base, arm: {clav: [lerp1(14, -4, k), lerp1(6, -6, k)]}});
      const B1 = solve(p), C = B1.chest, S = B1.upperL.o, d = slerpV(dS, dE, k), gL = V.add(V.add(S, V.sc(d, L)), [-0.1, 0, 0]);
      const pole = V.norm(V.lerp(fDir(C, [0.7, 0.3, -0.6]), fDir(C, [0.5, 0, -1]), k)), palm = fDir(C, [-1, 0, 0]);
      p = armsTo(p, gL, mirP(gL), pole, mirP(pole), {arm: {palm}, armR: {palm: V.mx(palm)}});
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), m = V.add(V.lerp(a, b, 0.5), V.sc(V.norm(V.sub(TOP, V.lerp(a, b, 0.5))), 0.12));
      return {pose: p, segs: [[TOP, m, 0.006], [m, a, 0.011], [m, b, 0.011]]};
    }
  });
}

/* ---- Cable lateral raise (one arm) ----
   Footage cues: stand side-on to a low pulley, cable crossing in front of the body to the far hand. Raise the
   arm out to the side, a little in front (the shoulder blade's plane), elbow soft and leading, to shoulder
   height; palm ends facing down. Lower over 2–3 s and keep tension at the bottom. The other hand holds the frame. */
{
  const base = {root: {p: [0, 0.95, 0], pitch: 2, roll: 3}, spine: [0, 0], neck: 0};
  const st = p => legsTo(p, [0.12, 0.067, 0.02], [0.05, 0, 1], [0.12, 0, 1]);
  const LOW = [-0.46, 0.13, 0.06], B0 = solve(st(base)), S0 = B0.upperL.o, L = 0.6;
  const dS = V.norm(V.sub([-0.05, 0.86, 0.17], S0)), dE = V.norm([0.86, -0.04, 0.5]);
  demo('cablelat', {
    cam: {yaw: 18, pitch: 10, dist: 3.9, target: [0, 1.05, 0]}, tempo: [1.0, 0.4, 2.4, 0.4],
    props: [tube([-0.58, 0, 0.06], [-0.58, 2.1, 0.06], 0.045), tube([-0.58, 0.13, 0.06], LOW, 0.03), ['world', 'Q', [LOW[0], LOW[1], LOW[2] - 0.015], [LOW[0], LOW[1], LOW[2] + 0.015], 0.045, {mat: 'steel'}],
      ['world', 'B', [-0.64, 0.45, 0.06], [0.06, 0.3, 0.14], 0.01, {mat: 'iron'}], dHandle('handL')],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = st({...base, arm: {clav: [lerp1(0, 5, k), 2]}});
      const B1 = solve(p), C = B1.chest, gL = V.add(B1.upperL.o, V.sc(slerpV(dS, dE, k), L));
      const pole = V.norm(V.lerp(fDir(C, [1, 0.1, -0.4]), fDir(C, [0.1, 1, -0.6]), k)), palm = V.norm(V.lerp(fDir(C, [-0.4, 0, -1]), [0, -1, 0], k));
      const gR = [-0.5, 1.12, 0.05], poleR = [-0.6, -0.6, -0.5];
      p = armsTo(p, gL, gR, pole, poleR, {arm: {palm}, armR: {palm: [-1, 0, 0]}});
      return {pose: p, segs: [[LOW, gripOf(solve(p), 'L'), 0.006]]};
    }
  });
}

/* ---- Hanging leg raise ----
   Footage cues: dead hang, shoulders set (not shrugged up to the ears), no swing. Raise the legs nearly
   straight to hip height or a little above by curling the pelvis up; lower for 2 s without swinging back. */
{
  const BAR = 2.32, G = [0.27, BAR, 0];
  demo('kneeraise', {
    cam: {yaw: 70, pitch: 6, dist: 5.0, target: [0, 1.4, 0.15]}, tempo: [1.1, 0.5, 2.0, 0.6],
    props: [['world', 'Y', [-0.62, BAR, 0], [0.62, BAR, 0], 0.016, {mat: 'steel'}], tube([0.62, 0, 0], [0.62, BAR + 0.08, 0], 0.04), tube([-0.62, 0, 0], [-0.62, BAR + 0.08, 0], 0.04)],
    pose(t) {
      const k = phaseK(t, this.tempo), phi = lerp1(4, 98, k) * D2R, kb = lerp1(4, 16, k) * D2R;
      const legDir = a => ({t: [0.04, -Math.cos(a), Math.sin(a)]}), toes = a => ({t: [0.06, Math.sin(a) * 0.5 - 0.2, Math.cos(a)]});
      let p = {root: {p: [0, 1.27 + 0.03 * k, lerp1(0, 0.04, k)], pitch: lerp1(0, -16, k)}, spine: [lerp1(0, 14, k), lerp1(0, 4, k)], neck: lerp1(0, 8, k),
        arm: {clav: [lerp1(16, 10, k), 0]}, leg: {thigh: legDir(phi), shin: legDir(phi - kb), foot: toes(phi - kb + 0.35)}};
      const B1 = solve(p), C = B1.chest;
      p = armsTo(p, G, mirP(G), fDir(C, [1, 0, -0.3]), V.mx(fDir(C, [1, 0, -0.3])), {arm: {palm: [0, 0, 1]}, armR: {palm: [0, 0, 1]}});
      return {pose: p};
    }
  });
}
