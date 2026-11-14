/* ---------- DEMOS 7: variants Sam asked for on 14 Nov 2026 ----------
   Kneeling pushdown and kneeling overhead extension (steadier), the katana extension (two cables), seated cable
   row at three grip widths, the chest-supported shrug, and the back squat (the plan says "back squat or leg
   press"; only the leg press had a demo). Each sits in a variant group in lifts.js, so the lift widget offers it
   as a toggle. */

// kneeling, thighs nearly upright, shins flat on the floor behind (as in the cable crunch)
const KNEEL = p => legsTo(p, [0.12, 0.1, -0.4], [0.05, -0.2, 1], V.norm([0.05, -1, -0.25]));

/* ---- Kneeling tricep pushdown (straight bar) ----
   Cues: kneel facing a high pulley, close enough that the cable hangs just in front of your face. Elbows pinned
   to your sides; push the bar down to straight arms in front of the thighs, then back up to 90°. Kneeling takes
   the legs and the lean out of it. */
{
  const TOP = [0, 1.95, 0.55];
  demo('pushdownkneel', {
    cam: {yaw: 62, pitch: 8, dist: 4.0, target: [0, 0.9, 0.2]}, tempo: [0.9, 0.5, 2.0, 0.3],
    props: [tube([0, 0, 0.78], [0, 2.1, 0.78], 0.045), tube([0, 2.02, 0.78], [0, 2.02, TOP[2]], 0.035), ['world', 'Q', [-0.015, TOP[1], TOP[2]], [0.015, TOP[1], TOP[2]], 0.05, {mat: 'steel'}],
      ['world', 'B', [0, 0.45, 0.82], [0.14, 0.3, 0.06], 0.01, {mat: 'iron'}], ['world', 'B', [0, 0.015, -0.1], [0.28, 0.015, 0.3], 0.01, {mat: 'pad'}], ['bar', 'Y', [-0.22, 0, 0], [0.22, 0, 0], 0.014, {mat: 'steel'}]],
    frames: ['bar'],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = KNEEL({root: {p: [0, 0.53, 0.0], pitch: 6}, spine: [2, 2], neck: -4, arm: {clav: [-4, -2]}});
      const C = solve(p).chest, fo = slerpV(V.norm([0.05, 0.2, 1]), V.norm([0.05, -1, 0.34]), ease(k)), palm = slerpV(V.norm([0, -1, 0.15]), V.norm([0, -0.34, -1]), k);
      p = {...p, arm: armFix(C, [0.1, -1, 0.07], fo, palm, {clav: [-4, -2]})};
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), m = V.lerp(a, b, 0.5);
      return {pose: p, frames: {bar: frameX(m, V.sub(a, b))}, segs: [[TOP, m, 0.006]]};
    }
  });
}

/* The overhead extension's forearm, in the upper arm's own front-to-back plane: folded behind the head (150°)
   to almost straight. U is the upper arm in the chest's frame; N, the way the forearm folds. */
const ohArm = (C, U, k, clav) => {
  const N = V.norm(V.add([0, 0, -1], V.sc(U, U[2]))), ph = lerp1(150, 8, ease(k)) * D2R;
  return armFix(C, U, V.add(V.sc(U, Math.cos(ph)), V.sc(N, Math.sin(ph))), [-1, 0, 0], {clav, crease: fDir(C, N)});
};

/* ---- Kneeling overhead cable triceps extension (rope) ----
   Cues: kneel facing away from the pulley set about head height, lean forward a little, elbows up beside the
   head. Let the rope draw the hands behind the head, then extend fully in line with the upper arms. */
{
  const TOP = [0, 1.62, -0.72];
  demo('ohtrikneel', {
    cam: {yaw: 70, pitch: 8, dist: 4.2, target: [0, 1.0, -0.1]}, tempo: [1.0, 0.5, 2.2, 0.4],
    props: [tube([0, 0, -0.92], [0, 2.1, -0.92], 0.045), tube([0, TOP[1], -0.92], TOP, 0.03), ['world', 'Q', [-0.015, TOP[1], TOP[2]], [0.015, TOP[1], TOP[2]], 0.05, {mat: 'steel'}],
      ['world', 'B', [0, 0.45, -0.96], [0.14, 0.3, 0.06], 0.01, {mat: 'iron'}], ['world', 'B', [0, 0.015, -0.1], [0.28, 0.015, 0.3], 0.01, {mat: 'pad'}]],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = KNEEL({root: {p: [0, 0.53, 0.02], pitch: 14}, spine: [4, 4], neck: -12, head: -4, arm: {clav: [14, 4]}});
      const C = solve(p).chest; p = {...p, arm: ohArm(C, V.norm([0.12, 0.84, 0.48]), k, [14, 4])};
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), m = V.add(V.lerp(a, b, 0.5), V.sc(V.norm(V.sub(TOP, V.lerp(a, b, 0.5))), 0.1));
      return {pose: p, segs: [[TOP, m, 0.006], [m, a, 0.011], [m, b, 0.011]]};
    }
  });
}

/* ---- Katana extension (two cables) ----
   As described by JPG Coaching (gymky.com, 14 Nov 2026): stand between two cable towers facing away, two steps
   forward, pulleys at chest height. Cross the cables: right hand to the left tower, left hand to the right.
   Start with both hands behind the head, elbows up; extend up and out, each arm finishing in line with its
   cable, like drawing two swords from behind the back. Upper arms stay put. */
{
  const PL = [0.85, 0.95, -0.5], PR = mirP(PL);   // hip height (14 Nov 2026, Sam: lower, and a more vertical path); the cables now cross behind the back, below the head   // left tower (his left), right tower
  const tower = x => [tube([x, 0, -0.62], [x, 2.1, -0.62], 0.045), tube([x, PL[1], -0.62], [x, PL[1], -0.5], 0.03), ['world', 'Q', [x, PL[1], -0.515], [x, PL[1], -0.485], 0.05, {mat: 'steel'}], ['world', 'B', [x, 0.45, -0.66], [0.14, 0.3, 0.05], 0.01, {mat: 'iron'}]];
  demo('katana', {
    cam: {yaw: 150, pitch: 12, dist: 4.4, target: [0, 1.3, -0.2]}, tempo: [1.0, 0.5, 2.2, 0.4],
    props: [...tower(PL[0]), ...tower(PR[0]), dHandle('handL'), dHandle('handR')],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = STAND({root: {p: [0, 0.885, 0.04], pitch: 6}, spine: [2, 2], neck: -8, arm: {clav: [16, 2]}});
      const C = solve(p).chest; p = {...p, arm: ohArm(C, V.norm([0.2, 0.95, 0.2]), k, [16, 2])};
      const B = solve(p);
      return {pose: p, segs: [[PR, gripOf(B, 'L'), 0.006], [PL, gripOf(B, 'R'), 0.006]]};   // crossed: left hand on the right tower's cable
    }
  });
}

/* ---- Seated cable row: shoulder-width bar and wide bar ----
   Same seat, footplate and pulley as the close-grip row (demos5). A wider grip flares the elbows: shoulder
   width (elbows about 45° out, to the lower ribs) shares the work between lats and upper back; wide (elbows
   about 70° out, to the lower chest) is mostly upper back and rear delts. Overhand on the bar. */
function rowBar(key, half, gS, gE, poleS, poleE) {
  const PUL = [0, 0.74, 1.0];   // level with the lower ribs: the pull is back, not up (14 Nov 2026)
  demo(key, {
    cam: {yaw: 62, pitch: 12, dist: 4.0, target: [0, 0.8, 0.35]}, tempo: [1.0, 0.5, 2.0, 0.4],
    props: [pad([0, 0.4, -0.05], [0.17, 0.035, 0.32]), tube([0, 0.0, -0.05], [0, 0.37, -0.05], 0.035), tube([0, 0.02, -0.3], [0, 0.02, 1.0], 0.03),
      ['world', 'B', [0, 0.3, 0.68], [0.18, 0.12, 0.02], 0.01, {mat: 'pad', rot: [-25, 0, 0]}], tube([0, 0, 1.06], [0, 1.6, 1.06], 0.045),
      ['world', 'Q', [-0.015, PUL[1], PUL[2]], [0.015, PUL[1], PUL[2]], 0.05, {mat: 'steel'}], ['world', 'B', [0, 0.45, 1.1], [0.14, 0.3, 0.05], 0.01, {mat: 'iron'}],
      ['bar', 'Y', [-half, 0, 0], [half, 0, 0], 0.014, {mat: 'steel'}]],
    frames: ['bar'],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = {root: {p: [0, 0.5, lerp1(0.0, -0.04, k)], pitch: lerp1(14, -3, ease(k))}, spine: [lerp1(4, -2, k), lerp1(4, -4, k)], neck: lerp1(-8, 2, k), arm: {clav: [lerp1(2, -4, k), lerp1(16, -16, k)]}};
      p = legsTo(p, [0.12, 0.33, 0.7], [0.15, 0.35, 1], [0.08, 0.55, 1]);
      const C = solve(p).chest, gL = V.lerp(gS, gE, ease(k)), pole = V.norm(V.lerp(fDir(C, poleS), fDir(C, poleE), k));
      p = armsTo(p, gL, mirP(gL), pole, mirP(pole), {arm: {palm: [0, -1, 0]}, armR: {palm: [0, -1, 0]}});
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), m = V.lerp(a, b, 0.5);
      return {pose: p, frames: {bar: frameX(m, V.sub(a, b))}, segs: [[PUL, m, 0.006]]};
    }
  });
}
rowBar('cablerowmid', 0.25, [0.2, 0.69, 0.64], [0.21, 0.9, 0.2], [0.45, -1, -0.2], [0.55, -0.55, -1]);
rowBar('cablerowwide', 0.42, [0.34, 0.71, 0.62], [0.35, 0.97, 0.22], [0.8, -0.6, -0.2], [0.95, -0.15, -0.8]);

/* ---- Chest-supported dumbbell shrug (incline bench) ----
   Set-up checked 14 Nov 2026 (Motra's exercise guide): incline bench at 45°, lie face down with the chest and
   stomach on the pad, feet planted, arms hanging straight down with the dumbbells, palms in. Shrug straight up
   towards the ears (with the lean, that's up and back along the spine), pause, lower slowly. The pad takes the
   lower back and the swing out of it. Sam floated 60° and leaning on the top edge; 45° is what the guides use,
   and the arms hang clear either side of the pad. */
{
  const base = {root: {p: [0, 0.8, -0.22], pitch: 45}, spine: [2, 2], neck: -30, head: -6};
  const legs = p => legsTo(p, [0.14, 0.067, -0.62], [0.05, 0.1, 1], [0.12, 0, 1]);
  const C0 = solve(legs(base)).chest, padC = fAt(C0, [0, 0.02, 0.165]), PN = fDir(C0, [0, 0, 1]);
  demo('shrugincline', {
    cam: {yaw: 70, pitch: 10, dist: 3.9, target: [0, 0.85, 0.0]}, tempo: [0.8, 1.0, 1.8, 0.3],
    props: [['world', 'B', padC, [0.15, 0.36, 0.035], 0.025, {mat: 'pad', rot: [45, 0, 0]}], tube(V.add(padC, V.sc(PN, 0.05)), [0, 0.02, padC[2] + 0.35], 0.035), tube([0, 0.02, padC[2] - 0.35], [0, 0.02, padC[2] + 0.35], 0.03),
      tube(V.add(fAt(C0, [0, -0.3, 0.165]), V.sc(PN, 0.04)), [0, 0.02, padC[2] - 0.35], 0.035), ...db('handL'), ...db('handR')],
    pose(t) {
      const k = phaseK(t, this.tempo);
      const p = legs({...base, arm: {clav: [lerp1(-6, 26, ease(k)), lerp1(4, -4, k)]}});
      return {pose: {...p, arm: {up: V.norm([0.05, -1, 0.02]), fore: V.norm([0.03, -1, 0.03]), palm: V.norm([-1, 0, 0.05]), grip: 0.9, thumb: 0.8, clav: p.arm.clav}}};
    }
  });
}

/* ---- Back squat (barbell) ----
   Cues: bar on the upper traps, hands just outside the shoulders, feet about shoulder width, toes out a little.
   Brace, then sit down between the hips, knees tracking over the toes, until the hip crease is at or below the
   knee; drive up keeping the chest up and the bar over mid-foot. */
{
  demo('squat', {
    cam: {yaw: 66, pitch: 8, dist: 4.4, target: [0, 0.95, 0]}, tempo: [1.1, 0.4, 2.2, 0.4],
    props: [...barbell('bar', 1.0)], frames: ['bar'],
    pose(t) {
      const k = phaseK(t, this.tempo), e = ease(k);   // 0 = the bottom, 1 = standing
      let p = {root: {p: [0, lerp1(0.52, 0.885, e), lerp1(-0.2, -0.02, e)], pitch: lerp1(40, 4, e)}, spine: [lerp1(-2, 0, e), lerp1(-4, 0, e)], neck: lerp1(-30, -4, e), arm: {clav: [4, -8]}};
      p = legsTo(p, [0.17, 0.067, 0.02], [0.32, 0, 1], V.norm([0.35, 0, 1]));
      const B1 = solve(p), C = B1.chest, mid = V.lerp(B1.upperL.o, B1.upperR.o, 0.5), bar = V.add(V.add(mid, V.sc(C.y, 0.035)), V.sc(C.z, -0.085));
      const gL = V.add(bar, [0.33, 0, 0]);   // hands just outside the shoulders
      p = armsTo(p, gL, mirP(gL), fDir(C, [0.3, -1, -0.6]), V.mx(fDir(C, [0.3, -1, -0.6])), {arm: {palm: fDir(C, [0, 0.4, 1])}, armR: {palm: V.mx(fDir(C, [0, 0.4, 1]))}});
      return {pose: p, frames: {bar: frameX(bar, [1, 0, 0])}};
    }
  });
}

/* ---- Face pull (rope) ----
   Cues (Jeff Nippard's set-up): pulley at about face height, rope held thumbs towards you, step back until the
   arms are long. Pull the rope apart and towards the face, elbows high and out, until the hands are beside the
   ears with the upper arms level and the forearms upright; pause, return slowly. Rear delts and the rotator
   cuff do it, with the mid traps; it is not a side-delt exercise. Added 14 Nov 2026 as Sam's candidate
   replacement for the cable upright row. */
{
  const TOP = [0, 1.5, 0.95];
  demo('facepull', {
    cam: {yaw: 60, pitch: 10, dist: 4.1, target: [0, 1.15, 0.3]}, tempo: [1.0, 0.7, 2.0, 0.4],
    props: [tube([0, 0, 1.08], [0, 2.1, 1.08], 0.045), tube([0, TOP[1], 1.08], TOP, 0.03), ['world', 'Q', [-0.015, TOP[1], TOP[2]], [0.015, TOP[1], TOP[2]], 0.05, {mat: 'steel'}], ['world', 'B', [0, 0.45, 1.12], [0.14, 0.3, 0.05], 0.01, {mat: 'iron'}]],
    pose(t) {
      const k = phaseK(t, this.tempo), e = ease(k);
      let p = legsTo({root: {p: [0, 0.875, -0.05], pitch: -4}, spine: [0, -2], neck: 2, arm: {clav: [4, lerp1(14, -14, e)]}}, [0.13, 0.067, 0.06], [0.1, 0, 1], [0.15, 0, 1]);
      const C = solve(p).chest;
      const up = slerpV(V.norm(fDir(C, [0.12, 0.05, 1])), V.norm(fDir(C, [0.95, 0.05, -0.2])), e), fore = slerpV(V.norm(fDir(C, [-0.1, 0.08, 1])), V.norm(fDir(C, [-0.12, 0.92, 0.38])), e);
      p = {...p, arm: {up, fore, palm: slerpV(fDir(C, [-1, 0, 0]), fDir(C, [-0.3, 0, -1]), e), grip: 0.9, thumb: 0.8, clav: p.arm.clav, crease: fDir(C, [-0.3, 1, 0.3])}};
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), mid = V.lerp(a, b, 0.5), m = V.add(mid, V.sc(V.norm(V.sub(TOP, mid)), Math.max(0.1, V.len(V.sub(a, b)) * 0.6)));
      return {pose: p, segs: [[TOP, m, 0.006], [m, a, 0.011], [m, b, 0.011]]};
    }
  });
}

/* ---- Smith machine chest press, flat bench (14 Nov 2026: Sam swapped the machine chest press for it) ----
   Footage cues: bench centred under the bar so it comes down to mid-chest. Shoulder blades pinned back and
   down, feet planted. Grip a little wider than the shoulders, wrists stacked over the elbows. Lower for 2–3 s
   until the bar is just off the chest, elbows about 45–60° from the sides; press to just short of lockout.
   The bar runs on rails, so it can only travel straight up and down: the forearm is solved each frame so the
   hands stay over the same line (on a free bar they would drift towards the shoulders at the top). */
{
  const P0 = [0, 0.47, 0], ZC = 0.12;   // bench top; how far towards the feet the bar's line sits from the shoulder joint
  const poseAt = k => {
    let p = {root: {p: [0, 0.56, 0.18], pitch: -90}, spine: [0, -3], neck: 4, head: 2, arm: {clav: [lerp1(0, 4, k), lerp1(-8, 2, k)]}};
    const B0 = solve(p), back = fAt(B0.chest, [0, 0.1, -0.09]);
    p.root.p = V.sub(p.root.p, [0, back[1] - P0[1] - 0.004, 0]);
    const Cz = fAt(solve(p).chest, [0, 0, 0])[2], away = Math.sign(p.root.p[2] - Cz) || 1;   // which way the feet point: away from the head
    p = legsTo(p, [0.25, 0.075, p.root.p[2] + away * 0.56], [0.3, 0.6, away], [0.25, 0, away]);
    const e = ease(k), up = slerpV(V.norm([0.8, -0.22, 0.45]), V.norm([-0.05, 1, 0.2]), e);
    const fz = clamp((ZC - up[2] * 0.283) / 0.245, -0.6, 0.6), fx = lerp1(0, -0.1, e), fore = [fx, Math.sqrt(Math.max(0.01, 1 - fz * fz - fx * fx)), fz];
    return {...p, arm: pressArm(up, fore, V.norm([0, 0.1, 1]), V.norm([-1, 0.2, 0.3]), {clav: p.arm.clav})};
  };
  const barAt = p => { const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'); return {m: V.lerp(a, b, 0.5), ax: V.sub(a, b)}; };
  const RZ = barAt(poseAt(0)).m[2];
  // the bench sits under the body wherever the pose puts it: from just past the hips to past the head
  const P00 = poseAt(0), CZ = fAt(solve(P00).chest, [0, 0, 0])[2], HZ = P00.root.p[2], DIR = Math.sign(CZ - HZ) || -1, BZ = HZ + DIR * 0.34, bz = d => BZ + DIR * d;
  demo('smithpress', {
    cam: {yaw: 58, pitch: 14, dist: 4.3, target: [0, 0.85, 0.1]}, tempo: [1.0, 0.4, 2.4, 0.4],
    props: [pad([0, 0.435, BZ], [0.15, 0.035, 0.6]), tube([0, 0.4, bz(-0.55)], [0, 0.4, bz(0.55)]), tube([0, 0.03, bz(-0.48)], [0, 0.4, bz(-0.48)]), tube([0, 0.03, bz(0.48)], [0, 0.4, bz(0.48)]),
      tube([-0.2, 0.03, bz(-0.48)], [0.2, 0.03, bz(-0.48)]), tube([-0.2, 0.03, bz(0.48)], [0.2, 0.03, bz(0.48)]),
      ...[-1, 1].flatMap(sx => [tube([sx * 0.74, 0, RZ], [sx * 0.74, 2.05, RZ], 0.03), tube([sx * 0.74, 0.02, RZ - 0.35], [sx * 0.74, 0.02, RZ + 0.35], 0.03)]), tube([-0.74, 2.05, RZ], [0.74, 2.05, RZ], 0.03),
      ['bar', 'Y', [-0.8, 0, 0], [0.8, 0, 0], 0.014, {mat: 'steel'}], ['bar', 'Q', [0.6, 0, 0], [0.635, 0, 0], 0.15, {mat: 'iron'}], ['bar', 'Q', [-0.6, 0, 0], [-0.635, 0, 0], 0.15, {mat: 'iron'}]],
    frames: ['bar'], box: [[[0, 0.6, 0], 1.0]],
    pose(t) { const p = poseAt(phaseK(t, this.tempo)), b = barAt(p); return {pose: p, frames: {bar: frameX([0, b.m[1], RZ], [1, 0, 0])}}; }
  });
}
