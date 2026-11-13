/* ---------- DEMOS 3: legs day ---------- */
// toes for a shin direction: perpendicular to the shin, pointing forward, plus plantar flexion (degrees, + = toes down)
const footFor = (shin, pf = 0) => V.norm(rot(V.norm(shin), [1, 0, 0], (-90 + pf) * D2R));
const legR = (p, B, ankle, knee, foot) => { const r = ik2(B.thighR.o, ankle, SK.thigh, SK.shin, knee); return {...p, legR: {thigh: r.up, shin: r.fore, foot, knee}}; };
const barbell = (fr, half = 1.0) => [[fr, 'Y', [-half, 0, 0], [half, 0, 0], 0.014, {mat: 'steel'}],
  [fr, 'Q', [0.72, 0, 0], [0.77, 0, 0], 0.225, {mat: 'iron'}], [fr, 'Q', [-0.72, 0, 0], [-0.77, 0, 0], 0.225, {mat: 'iron'}],
  [fr, 'Q', [0.68, 0, 0], [0.72, 0, 0], 0.035, {mat: 'steel'}], [fr, 'Q', [-0.68, 0, 0], [-0.72, 0, 0], 0.035, {mat: 'steel'}]];

/* ---- Leg press (45°) ----
   Footage cues: back and hips flat on the pad, feet shoulder width mid-platform. Lower until the knees are
   about 90° without the lower back peeling off; press through the whole foot to just short of lockout. */
{
  const base = {root: {p: [0, 0.5, 0], pitch: -52}, spine: [-2, -4], neck: 22, head: 6};
  const B0 = solve(base), H0 = B0.thighL.o, n = V.norm([0, 0.62, 1]), u = V.norm(V.cross(n, [1, 0, 0]));
  const dS = 0.56, dE = 0.8, P0 = V.add([0, H0[1], H0[2]], V.sc(n, dS)), backC = fAt(B0.chest, [0, 0.1, -0.14]);
  demo('legpress', {
    cam: {yaw: 68, pitch: 14, dist: 4.4, target: [0, 0.75, 0.35]}, tempo: [1.0, 0.4, 2.2, 0.4],
    props: [pad([0, 0.39, -0.02], [0.2, 0.035, 0.17], [-8, 0, 0]), ['world', 'B', backC, [0.18, 0.34, 0.035], 0.025, {mat: 'pad', rot: [-52, 0, 0]}],
      tube([0, 0.0, -0.05], [0, 0.36, -0.05], 0.04), tube(V.add(backC, [0, -0.2, -0.15]), [0, 0, -0.55], 0.04),
      tube(V.add(V.add(P0, [0.38, 0, 0]), V.sc(n, -0.25)), V.add(V.add(P0, [0.38, 0, 0]), V.sc(n, 0.6)), 0.03), tube(V.add(V.add(P0, [-0.38, 0, 0]), V.sc(n, -0.25)), V.add(V.add(P0, [-0.38, 0, 0]), V.sc(n, 0.6)), 0.03),
      ['sled', 'B', [0, 0, 0.022], [0.33, 0.3, 0.02], 0.01, {mat: 'iron'}], ['sled', 'Q', [0.36, 0.05, 0.02], [0.36, 0.05, 0.12], 0.05, {mat: 'steel'}], ['sled', 'Q', [-0.36, 0.05, 0.02], [-0.36, 0.05, 0.12], 0.05, {mat: 'steel'}]],
    frames: ['sled'],
    pose(t) {
      const k = phaseK(t, this.tempo), d = lerp1(dS, dE, ease(k)), P = V.add([0, H0[1], H0[2]], V.sc(n, d));
      const ank = V.add(V.add(P, [0.15, 0, 0]), V.add(V.sc(n, -0.075), V.sc(u, -0.04)));
      let p = legsTo({...base}, ank, V.norm([0.25, 1, -0.4]), V.norm(V.add(u, [0.08, 0, 0])));
      const C = solve(p).chest; p = armsTo(p, [0.3, 0.47, 0.12], [-0.3, 0.47, 0.12], fDir(C, [1, -0.3, -0.3]), V.mx(fDir(C, [1, -0.3, -0.3])), {arm: {palm: [-1, 0, 0]}, armR: {palm: [1, 0, 0]}});
      return {pose: p, frames: {sled: F(P, [1, 0, 0], u, V.sc(n, -1))}};
    }
  });
}

/* ---- Romanian deadlift (barbell) ----
   Footage cues: knees soft and staying put, push the hips straight back, bar sliding down the thighs to
   mid-shin, spine neutral and chest proud, eyes a little ahead on the floor. Stand by driving the hips forward. */
{
  const BAR_Z = 0.07;
  demo('rdl', {
    cam: {yaw: 74, pitch: 8, dist: 4.0, target: [0, 0.82, 0]}, tempo: [1.1, 0.5, 2.4, 0.3],
    props: [...barbell('bar')], frames: ['bar'],
    pose(t) {
      const k = phaseK(t, this.tempo), pitch = lerp1(72, 2, ease(k));
      let p = {root: {p: [0, lerp1(0.855, 0.95, k), 0], pitch}, spine: [lerp1(-3, 0, k), lerp1(-6, 0, k)], neck: lerp1(-20, 0, k), head: lerp1(-6, 0, k), arm: {clav: [lerp1(-6, 0, k), lerp1(6, 0, k)]}};
      // hips go back until the shoulders sit over the bar: the bar stays on the legs
      const S0 = solve(p).upperL.o; p.root.p = [0, p.root.p[1], BAR_Z - (S0[2] - p.root.p[2]) - 0.01];
      p = legsTo(p, [0.11, 0.067, 0.0], [0.05, 0, 1], [0.12, 0, 1]);
      const B1 = solve(p), S = B1.upperL.o, g = [0.24, S[1] - 0.6, BAR_Z], C = B1.chest;
      p = armsTo(p, g, mirP(g), fDir(C, [0.3, 0, -1]), V.mx(fDir(C, [0.3, 0, -1])), {arm: {palm: fDir(C, [0, 0, -1])}, armR: {palm: V.mx(fDir(C, [0, 0, -1]))}});
      const B = solve(p), m = V.lerp(gripOf(B, 'L'), gripOf(B, 'R'), 0.5);
      return {pose: p, frames: {bar: frameW(m)}};
    }
  });
}

/* ---- Bulgarian split squat (dumbbells) ----
   Footage cues: back foot on the bench, laces down; front foot far enough out that the front shin stays
   close to vertical. Drop the back knee straight down towards the floor with a slight forward lean, then
   drive up through the whole front foot. Dumbbells hang at the sides. */
{
  const FRONT = [0.11, 0.067, 0.33], BACK = [-0.11, 0.535, -0.56];
  demo('splitsquat', {
    cam: {yaw: 76, pitch: 8, dist: 4.0, target: [0, 0.75, -0.1]}, tempo: [1.1, 0.4, 2.2, 0.4],
    props: [pad([-0.05, 0.43, -0.62], [0.17, 0.035, 0.3]), tube([-0.05, 0, -0.42], [-0.05, 0.4, -0.42], 0.035), tube([-0.05, 0, -0.82], [-0.05, 0.4, -0.82], 0.035), ...db('handL'), ...db('handR')],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = {root: {p: [0, lerp1(0.585, 0.87, ease(k)), lerp1(-0.07, 0.0, k)], pitch: lerp1(13, 5, k)}, spine: [lerp1(2, 0, k), 2], neck: lerp1(-8, -3, k), arm: {clav: [-4, 0]}};
      p = legsTo(p, FRONT, [0.08, 0, 1], [0.1, 0, 1]);
      p = legR(p, solve(p), BACK, [0, -1, 0.25], V.norm([0, -0.45, -1]));
      const B1 = solve(p), C = B1.chest, S = B1.upperL.o, g = V.add(S, [0.04, -0.6, 0.02]);
      p = armsTo(p, g, mirP(g), fDir(C, [0.2, 0, -1]), V.mx(fDir(C, [0.2, 0, -1])), {arm: {palm: fDir(C, [-1, 0, 0])}, armR: {palm: V.mx(fDir(C, [-1, 0, 0]))}});
      return {pose: p};
    }
  });
}

/* ---- Seated leg curl ----
   Footage cues: knees lined up with the machine's pivot, thigh pad snug just above the knees, roller behind
   the lower calves. Curl all the way under, pause, then control the weight back to nearly straight. */
{
  const base = {root: {p: [0, 0.6, -0.04], pitch: -14}, spine: [-2, -2], neck: 6, arm: {clav: [0, 0]}};
  const th = V.norm([0.03, -0.05, 1]), sS = V.norm([0, -0.2, 1]), sE = V.norm([0, -1, -0.5]);
  const B0 = solve({...base, leg: {thigh: th, shin: sS, foot: footFor(sS)}}), K0 = B0.shinL.o;
  demo('legcurl', {
    cam: {yaw: 70, pitch: 12, dist: 3.8, target: [0, 0.65, 0.25]}, tempo: [1.0, 0.5, 2.2, 0.4],
    props: [pad([0, 0.47, 0.0], [0.2, 0.035, 0.2]), tube([0, 0, 0], [0, 0.44, 0], 0.035), ['world', 'B', fAt(B0.chest, [0, 0.0, -0.14]), [0.17, 0.32, 0.035], 0.025, {mat: 'pad', rot: [-16, 0, 0]}],
      ['world', 'Y', [-0.22, K0[1] + 0.135, K0[2] - 0.06], [0.22, K0[1] + 0.135, K0[2] - 0.06], 0.045, {mat: 'pad'}],
      tube([0.3, K0[1], K0[2]], [0.3, K0[1] + 0.135, K0[2] - 0.06], 0.025), tube([-0.3, K0[1], K0[2]], [-0.3, K0[1] + 0.135, K0[2] - 0.06], 0.025),
      ['roller', 'Y', [-0.22, 0, 0], [0.22, 0, 0], 0.045, {mat: 'pad'}]],
    frames: ['roller'],
    pose(t) {
      const k = phaseK(t, this.tempo), sh = slerpV(sS, sE, ease(k));
      let p = {...base, leg: {thigh: th, shin: sh, foot: footFor(sh, -8)}};
      const C = solve(p).chest; p = armsTo(p, [0.3, 0.5, 0.05], [-0.3, 0.5, 0.05], fDir(C, [1, -0.3, -0.3]), V.mx(fDir(C, [1, -0.3, -0.3])), {arm: {palm: [-1, 0, 0]}, armR: {palm: [1, 0, 0]}});
      const B = solve(p), a = fAt(B.shinL, [0, -0.35, -0.065]), r = V.add([0, a[1], a[2]], [0, 0, 0]);
      return {pose: p, frames: {roller: frameW(r)}, segs: [[[0.3, K0[1], K0[2]], [0.25, r[1], r[2]], 0.022], [[-0.3, K0[1], K0[2]], [-0.25, r[1], r[2]], 0.022]]};
    }
  });
}

/* ---- Seated calf raise ----
   Footage cues: pad across the lower thighs, balls of the feet on the step, shins vertical. Drop the heels
   for a full stretch and pause for a second, then push up onto the big toe as high as you can and hold. */
{
  const BALL = [0.11, 0.125, 0.43], base = {root: {p: [0, 0.56, -0.08], pitch: 2}, spine: [4, 6], neck: -6};
  demo('seatedcalf', {
    cam: {yaw: 74, pitch: 10, dist: 3.4, target: [0, 0.55, 0.2]}, tempo: [0.9, 1.0, 1.6, 1.0],
    props: [pad([0, 0.47, -0.08], [0.2, 0.035, 0.18]), tube([0, 0, -0.08], [0, 0.44, -0.08], 0.035), ['world', 'B', [0, 0.06, 0.47], [0.25, 0.06, 0.08], 0.01, {mat: 'iron'}],
      ['kpad', 'Y', [-0.24, 0, 0], [0.24, 0, 0], 0.045, {mat: 'pad'}], tube([0, 0, 0.62], [0, 0.85, 0.62], 0.045)],
    frames: ['kpad'],
    pose(t) {
      const k = phaseK(t, this.tempo), b = lerp1(-20, 28, k) * D2R, fd = [0.06, -Math.sin(b), Math.cos(b)];
      const ank = V.add(V.add(BALL, V.sc(fd, -0.15)), V.sc([0, Math.cos(b), Math.sin(b)], 0.06));
      let p = legsTo({...base}, ank, [0.1, 0.3, 1], V.norm(fd));
      const B1 = solve(p), kn = fAt(B1.thighL, [0, -0.36, 0.0]), pc = [0, kn[1] + 0.11, kn[2]], C = B1.chest;
      p = armsTo(p, [0.25, pc[1] + 0.02, pc[2]], [-0.25, pc[1] + 0.02, pc[2]], fDir(C, [1, -0.2, -0.4]), V.mx(fDir(C, [1, -0.2, -0.4])), {arm: {palm: [0, -1, 0]}, armR: {palm: [0, -1, 0]}});
      return {pose: p, frames: {kpad: frameW(pc)}, segs: [[[0, 0.85, 0.62], [0, pc[1], pc[2] + 0.03], 0.03]]};
    }
  });
}

/* ---- Adductor machine ----
   Footage cues: sit tall, back on the pad, pads against the inside of the knees. Squeeze the legs together
   under control, pause, then let them open slowly to a comfortable stretch. */
{
  const base = {root: {p: [0, 0.56, -0.02], pitch: -12}, spine: [-2, -2], neck: 6};
  const legAt = phi => { const r = phi * D2R; return {thigh: V.norm([Math.sin(r), -0.06, Math.cos(r)]), shin: V.norm([Math.sin(r) * 0.25, -1, 0.12]), foot: V.norm([Math.sin(r), 0.05, Math.cos(r)])}; };
  const B0 = solve({...base, leg: legAt(40)});
  demo('adductor', {
    cam: {yaw: 0, pitch: 22, dist: 3.6, target: [0, 0.65, 0.15]}, tempo: [1.0, 0.6, 2.2, 0.4],
    props: [pad([0, 0.47, 0.0], [0.2, 0.035, 0.2]), tube([0, 0, 0], [0, 0.44, 0], 0.035), ['world', 'B', fAt(B0.chest, [0, 0.02, -0.14]), [0.17, 0.32, 0.035], 0.025, {mat: 'pad', rot: [-14, 0, 0]}],
      ['thighL', 'B', [-0.115, -0.31, 0.0], [0.025, 0.085, 0.06], 0.02, {mat: 'pad'}], ['thighR', 'B', [-0.115, -0.31, 0.0], [0.025, 0.085, 0.06], 0.02, {mat: 'pad'}]],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = {...base, leg: legAt(lerp1(40, 5, ease(k)))};
      const C = solve(p).chest; p = armsTo(p, [0.29, 0.52, 0.06], [-0.29, 0.52, 0.06], fDir(C, [1, -0.3, -0.3]), V.mx(fDir(C, [1, -0.3, -0.3])), {arm: {palm: [-1, 0, 0]}, armR: {palm: [1, 0, 0]}});
      const B = solve(p), segs = [];
      for (const s of ['L', 'R']) segs.push([[s === 'L' ? 0.05 : -0.05, 0.36, 0.22], fAt(B['thigh' + s], [-0.14, -0.31, 0.0]), 0.022]);
      return {pose: p, segs};
    }
  });
}

/* ---- Decline weighted crunch ----
   Footage cues: feet hooked under the rollers, plate held flat on the chest. Curl the ribs towards the hips,
   chin tucked, lifting the shoulder blades well off the pad (a crunch, not a sit-up); lower under control
   and don't rest at the bottom.
   The two rollers sit where the legs are (13 Nov 2026, Sam: the feet went through the bench): one under the
   knees, one over the tops of the feet just in front of the ankles. */
{
  const d = V.norm([0, -0.4, -1.3]), n = V.norm([0, 1.3, -0.4]), sY = z => 0.8 - (0.55 - z) * 0.4 / 1.3;
  const PEL = V.add([0, sY(0.12), 0.12], V.sc(n, 0.1)), mid = [0, sY(-0.1), -0.1];
  const ANK = [0.11, 0.8, 0.7], legs = p => legsTo(p, ANK, [0.1, 1, 0.1], V.norm([0.1, 0.05, 1]));
  const KN = solve(legs({root: {p: PEL, pitch: -104}})).shinL.o, RA = [0, KN[1] - 0.11, KN[2] - 0.01], RB = [0, ANK[1] + 0.088, ANK[2] + 0.075];
  demo('crunch', {
    cam: {yaw: 72, pitch: 14, dist: 3.9, target: [0, 0.75, -0.05]}, tempo: [1.0, 0.6, 1.8, 0.3],
    props: [['world', 'B', V.add(mid, V.sc(n, -0.03)), [0.15, 0.035, 0.66], 0.025, {mat: 'pad', rot: [-17.1, 0, 0]}],
      tube([0, 0, 0.4], [0, sY(0.4) - 0.04, 0.4], 0.035), tube([0, 0, -0.6], [0, sY(-0.6) - 0.04, -0.6], 0.035),
      ['world', 'Y', [-0.17, RA[1], RA[2]], [0.17, RA[1], RA[2]], 0.045, {mat: 'pad'}], ['world', 'Y', [-0.17, RB[1], RB[2]], [0.17, RB[1], RB[2]], 0.045, {mat: 'pad'}],
      tube([0, sY(0.5) - 0.04, 0.5], RA, 0.03), tube(RA, RB, 0.03),
      ['chest', 'Q', [0, 0.12, 0.13], [0, 0.12, 0.16], 0.15, {mat: 'iron'}], ['chest', 'Q', [0, 0.12, 0.159], [0, 0.12, 0.163], 0.03, {mat: 'steel'}]],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = {root: {p: PEL, pitch: lerp1(-107, -101, k)}, spine: [lerp1(0, 24, ease(k)), lerp1(0, 34, ease(k))], neck: lerp1(4, 26, k), head: lerp1(0, 8, k)};
      p = legs(p);
      const C = solve(p).chest, gl = fAt(C, [0.13, 0.13, 0.17]);
      p = armsTo(p, gl, fAt(C, [-0.13, 0.13, 0.17]), fDir(C, [1, -0.6, 0]), fDir(C, [-1, -0.6, 0]), {arm: {palm: fDir(C, [-0.3, 0, -1])}, armR: {palm: fDir(C, [0.3, 0, -1])}});
      return {pose: p};
    }
  });
}
