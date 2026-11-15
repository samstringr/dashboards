/* ---------- DEMOS 8: back day as Sam trains it from 15 Nov 2026, and the cable rear delt fly ----------
   Life Fitness plate-loaded Row (wide and neutral handles), single-arm cable row with a lat focus, weighted
   45° back extension, cable rear delt fly. Conventions as in demos.js: k = 0 stretched, 1 contracted. */

/* ---- Chest-supported row: the Life Fitness plate-loaded Row (Sam's photos, 15 Nov 2026) ----
   The machine: a saddle seat on a post that adjusts for height, a tall chest pad in front of it, foot plates on
   the base, and two independent lever arms that pivot near the floor at the front, each with plates on a horn
   low down and two handles at the top: a bar that turns inwards (wide, overhand) and an upright grip (neutral).
   The sticker shows the handles travelling back and up in an arc. WHY the pivot is placed under the finish:
   a lever pivoting low turns its top along a circle, so the hands rise until the lever is upright; putting it
   upright at the end of the pull gives exactly the sticker's back-and-up path.
   Cues: seat high enough that the handles meet you at the bottom of the chest; chest stays on the pad.
   Wide: elbows out about 60°, pull to the lower chest, squeeze the shoulder blades (upper back, rear delts).
   Neutral: elbows tucked by your sides, pull to the bottom of the ribs (lats). Return over 2 s, arms long. */
function lfRow(key, wide) {
  const base = {root: {p: [0, 0.575, -0.04], pitch: 8}, spine: [2, 3], neck: -6, head: -2};
  const B0 = solve(SIT_FEET(base)), C0 = B0.chest, S0 = B0.upperL.o, padC = fAt(C0, [0, 0.1, 0.15]);
  const LX = 0.44, gE = wide ? fAt(C0, [0.3, 0.02, 0.13]) : fAt(C0, [0.18, -0.07, 0.15]);
  const PIV = [LX, 0.3, gE[2] + 0.06], R = Math.hypot(gE[1] - PIV[1], gE[2] - PIV[2]), a0 = Math.atan2(gE[2] - PIV[2], gE[1] - PIV[1]);
  const at = (a, x) => [x, PIV[1] + R * Math.cos(a), PIV[2] + R * Math.sin(a)];   // a point on the handle's circle (angle from upright, forward +)
  // the start: lean the lever forward until the arm is just short of straight (bisection on the angle)
  const reach = (SK.upper + SK.fore + GRIP) * 0.95; let lo = a0, hi = a0 + 1.2;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (V.len(V.sub(at(m, gE[0]), S0)) < reach) lo = m; else hi = m; }
  const aS = lo, plate = (x, ang) => { const c = at(ang, 0), d = V.norm(V.sub([0, c[1], c[2]], [0, PIV[1], PIV[2]])), o = V.add([x, PIV[1], PIV[2]], V.sc(d, 0.22)); return o; };
  demo(key, {
    cam: {yaw: 58, pitch: 12, dist: 3.9, target: [0, 0.9, 0.25]}, tempo: [1.0, 0.5, 2.0, 0.4],
    props: [pad([0, 0.52, -0.06], [0.17, 0.04, 0.15]), tube([0, 0.02, -0.06], [0, 0.49, -0.06], 0.035), tube([0, 0.02, -0.4], [0, 0.02, PIV[2] + 0.1], 0.04),
      ['world', 'B', padC, [0.16, 0.22, 0.04], 0.025, {mat: 'pad', rot: [10, 0, 0]}], tube(V.add(padC, [0, -0.1, 0.05]), [0, 0.5, padC[2] + 0.1], 0.035),
      ...[-1, 1].flatMap(sx => [tube([sx * LX, 0.02, -0.1], [sx * LX, 0.02, PIV[2] + 0.25], 0.035), tube([sx * (LX + 0.06), PIV[1], PIV[2]], [sx * (LX - 0.06), PIV[1], PIV[2]], 0.06),
        tube([sx * LX, 0.02, PIV[2] + 0.15], [sx * LX, PIV[1], PIV[2]], 0.04), ['world', 'B', [sx * 0.13, 0.28, 0.5], [0.07, 0.015, 0.12], 0.01, {mat: 'iron', rot: [-30, 0, 0]}]])],
    pose(t) {
      const k = phaseK(t, this.tempo), ang = lerp1(aS, a0, ease(k));
      let p = SIT_FEET({...base, arm: {clav: [lerp1(4, -2, k), lerp1(16, -16, k)]}});
      const C = solve(p).chest, gL = at(ang, gE[0]);
      const pole = wide ? V.norm(V.lerp(fDir(C, [0.7, -0.45, -0.3]), fDir(C, [0.8, -0.3, -1]), k)) : V.norm(V.lerp(fDir(C, [0.25, -0.95, -0.2]), fDir(C, [0.3, -0.55, -1]), k));
      const palm = wide ? [0, -1, 0] : [-1, 0, 0];
      p = armsTo(p, gL, mirP(gL), pole, mirP(pole), {arm: {palm}, armR: {palm: V.mx(palm)}});
      const B = solve(p), segs = [];
      for (const sx of [1, -1]) {
        const g = gripOf(B, sx > 0 ? 'L' : 'R'), top = at(ang, sx * LX), lever = [sx * LX, PIV[1], PIV[2]], hz = at(ang, 0), up = V.norm(V.sub([0, hz[1], hz[2]], [0, PIV[1], PIV[2]]));
        segs.push([lever, V.add(top, V.sc(up, 0.06)), 0.035]);
        if (wide) segs.push([V.add(top, V.sc(up, 0.06)), [g[0] - sx * 0.07, g[1] + up[1] * 0.06, g[2] + up[2] * 0.06], 0.02], [[g[0] + sx * 0.07, g[1], g[2]], [g[0] - sx * 0.08, g[1], g[2]], 0.017]);
        else segs.push([V.add(top, V.sc(up, 0.1)), V.add([g[0], g[1], g[2]], V.sc(up, 0.1)), 0.02], [V.add(g, V.sc(up, 0.09)), V.add(g, V.sc(up, -0.08)), 0.018]);
        const pc = plate(sx * (LX + 0.08), ang); segs.push([pc, V.add(pc, [sx * 0.05, 0, 0]), 0.2], [V.add(pc, [sx * 0.05, 0, 0]), V.add(pc, [sx * 0.09, 0, 0]), 0.17]);   // a 25 and a 20 on each horn, as in the photo
      }
      return {pose: p, segs};
    }
  });
}
lfRow('chestrow', true);
lfRow('chestrowclose', false);

/* ---- Single-arm cable row, lat focus ----
   Footage cues (the lat-biased one-arm row): sit side-on enough that the working arm lines up with the cable,
   feet on the plate, chest tall. Start with the arm long and the shoulder allowed forward, a slight turn of the
   torso towards the pulley for a full lat stretch. Pull the elbow back and down towards the hip, keeping it
   tucked against the side; the hand finishes by the hip, not the chest. The other hand rests on the thigh.
   Return over 2 s. One arm shown (the left); the other is the mirror. */
{
  const PUL = [0.08, 0.55, 1.0];
  demo('latrow1', {
    cam: {yaw: 60, pitch: 10, dist: 4.0, target: [0, 0.8, 0.35]}, tempo: [1.0, 0.5, 2.0, 0.4],
    props: [pad([0, 0.4, -0.05], [0.17, 0.035, 0.32]), tube([0, 0.0, -0.05], [0, 0.37, -0.05], 0.035), tube([0, 0.02, -0.3], [0, 0.02, 1.0], 0.03),
      ['world', 'B', [0, 0.3, 0.68], [0.18, 0.12, 0.02], 0.01, {mat: 'pad', rot: [-25, 0, 0]}], tube([0, 0, 1.06], [0, 1.6, 1.06], 0.045),
      ['world', 'Q', [PUL[0] - 0.015, PUL[1], PUL[2]], [PUL[0] + 0.015, PUL[1], PUL[2]], 0.05, {mat: 'steel'}], ['world', 'B', [0, 0.45, 1.1], [0.14, 0.3, 0.05], 0.01, {mat: 'iron'}],
      dHandle('handL')],
    pose(t) {
      const k = phaseK(t, this.tempo);   // 0 = arm long, 1 = elbow at the hip
      let p = {root: {p: [0, 0.5, lerp1(0.0, -0.03, k)], pitch: lerp1(12, -2, ease(k)), yaw: lerp1(-12, 4, k)}, spine: [lerp1(3, -2, k), lerp1(3, -3, k)], neck: lerp1(-6, 2, k),
        arm: {clav: [lerp1(8, -6, k), lerp1(18, -14, k)]}};
      p = legsTo(p, [0.12, 0.33, 0.7], [0.15, 0.35, 1], [0.08, 0.55, 1]);
      const B1 = solve(p), C = B1.chest, hip = B1.thighL.o;
      const g = V.lerp([0.1, 0.62, 0.66], V.add(hip, [0.07, 0.1, 0.08]), ease(k)), pole = V.norm(V.lerp(fDir(C, [0.25, -1, -0.15]), fDir(C, [0.15, -0.35, -1]), k));
      const rest = V.add(B1.thighR.o, [-0.02, 0.06, 0.3]);   // the other hand on the right thigh
      p = armsTo(p, g, rest, pole, [-0.4, -0.6, -0.5], {arm: {palm: [-1, 0, 0]}, armR: {palm: [0, -1, 0], grip: 0.4}});
      const B = solve(p), m = gripOf(B, 'L');
      return {pose: p, segs: [[PUL, m, 0.006]]};
    }
  });
}

/* ---- Weighted back extension, 45° bench ----
   Footage cues for the lower back (Sam's reason for the lift): pad just below the hip crease so the hips can
   bend, heels under the rollers, a plate held flat against the chest. Lower until the torso is about vertical,
   letting the lower back round a little at the bottom, then lift by straightening the back and hips until the
   body is a straight line on the bench's angle; no arching past it. 2 s down. */
{
  const ANG = 45, base = {neck: 0, head: 0};
  // the bench: foot plate low at the back, the thigh pad's top edge at the hip crease, all on a 45° line
  const HIP = [0, 0.98, 0.1], DOWN = V.norm([0, -Math.cos(ANG * D2R), -Math.sin(ANG * D2R)]);
  const ankle = V.add(HIP, V.sc(DOWN, SK.thigh + SK.shin - 0.02)), padTop = V.add(HIP, [0, -0.03, 0.12]);
  demo('backext', {
    cam: {yaw: 80, pitch: 6, dist: 4.2, target: [0, 0.85, 0.1]}, tempo: [1.0, 0.6, 2.0, 0.4],
    props: [['world', 'B', V.add(padTop, V.sc(DOWN, 0.18)), [0.17, 0.2, 0.04], 0.025, {mat: 'pad', rot: [-45, 0, 0]}],
      ['world', 'Y', V.add(ankle, [-0.15, 0.06, 0.05]), V.add(ankle, [0.15, 0.06, 0.05]), 0.045, {mat: 'pad'}],
      ['world', 'B', V.add(ankle, [0, -0.07, -0.06]), [0.2, 0.015, 0.12], 0.01, {mat: 'iron', rot: [-45, 0, 0]}],
      tube(V.add(ankle, [0, -0.08, -0.1]), [0, 0.02, ankle[2] - 0.25], 0.04), tube(V.add(padTop, V.sc(DOWN, 0.4)), V.add(ankle, [0, -0.06, 0]), 0.04),
      tube(V.add(padTop, V.sc(DOWN, 0.4)), [0, 0.02, padTop[2] + 0.05], 0.04), tube([0, 0.02, ankle[2] - 0.25], [0, 0.02, padTop[2] + 0.1], 0.04),
      ['plate', 'Q', [0, 0, -0.012], [0, 0, 0.012], 0.15, {mat: 'iron'}]],
    frames: ['plate'],
    pose(t) {
      const k = phaseK(t, this.tempo);   // 0 = folded over the pad, 1 = body in a line at 45°
      // pitch is the torso's lean from upright: 45 is the bench's line, 145 is folded about 100° at the hips, head towards the floor
      const pitch = lerp1(145, ANG, ease(k)), round = lerp1(18, -2, k);
      let p = {...base, root: {p: HIP, pitch}, spine: [round, round * 0.7], neck: lerp1(-55, -8, k), arm: {clav: [0, 4]}};
      p = legsTo(p, ankle, V.norm([0, 0.3, 1]), V.norm([0, -0.6, 0.8]));
      const C = solve(p).chest, mid = fAt(C, [0, 0.07, 0.17]);
      p = armsTo(p, fAt(C, [0.11, 0.05, 0.19]), fAt(C, [-0.11, 0.05, 0.19]), fDir(C, [0.6, -0.8, 0.1]), fDir(C, [-0.6, -0.8, 0.1]), {arm: {palm: fDir(C, [0, 0, -1])}, armR: {palm: fDir(C, [0, 0, -1])}});
      const Cz = fDir(C, [0, 0, 1]), Cx = fDir(C, [1, 0, 0]);
      return {pose: p, frames: {plate: F(V.add(mid, V.sc(Cz, 0.03)), Cx, V.cross(Cz, Cx), Cz)}};
    }
  });
}

/* ---- Cable rear delt fly (cross-body, standing) ----
   Footage cues: two pulleys at about shoulder height, take the left cable in the right hand and the right in the
   left, so the cables cross in front of you. Arms nearly straight with a soft, fixed bend; palms down. Sweep the
   hands out and back in a wide arc until the arms line up with the shoulders, thinking "hands out, not back",
   then return over 2 s until the hands cross. Shoulders stay down. Rear delts first, the middle back helps. */
{
  const R = 0.56, PL = [0.95, 1.5, 0.45];
  demo('cablerdf', {
    cam: {yaw: 160, pitch: 14, dist: 4.3, target: [0, 1.15, 0.1]}, tempo: [1.0, 0.5, 2.0, 0.4],
    props: [...[-1, 1].flatMap(sx => [tube([sx * 1.05, 0, PL[2] + 0.05], [sx * 1.05, 2.15, PL[2] + 0.05], 0.045), ['world', 'Q', [sx * PL[0], PL[1], PL[2] - 0.015], [sx * PL[0], PL[1], PL[2] + 0.015], 0.05, {mat: 'steel'}],
      tube([sx * 1.05, PL[1], PL[2] + 0.05], [sx * PL[0], PL[1], PL[2]], 0.025)]), dHandle('handL'), dHandle('handR')],
    pose(t) {
      const k = phaseK(t, this.tempo), th = lerp1(118, -4, ease(k));   // the hand's angle in front of the shoulder line (crossed at 118°)
      let p = STAND({root: {p: [0, 0.885, 0], pitch: 4}, spine: [1, 2], neck: -4, arm: {clav: [0, lerp1(10, -10, k)]}});
      const B1 = solve(p), C = B1.chest, S = B1.upperL.o, c = Math.cos(th * D2R), s = Math.sin(th * D2R);
      const gL = V.add(S, fDir(C, [R * c, -0.04 - 0.05 * (1 - k), R * s])), gR = V.add(B1.upperR.o, fDir(C, [-R * c, -0.04 - 0.05 * (1 - k) + 0.025, R * s]));
      const pole = V.norm(fDir(C, [s, 0.2, -c])), palm = fDir(C, [0, -1, 0]);
      p = armsTo(p, gL, gR, pole, V.mx(pole), {arm: {palm}, armR: {palm: V.mx(palm)}});
      const B = solve(p);
      return {pose: p, segs: [[mirP(PL), gripOf(B, 'L'), 0.006], [PL, gripOf(B, 'R'), 0.006]]};   // each hand holds the far cable
    }
  });
}
