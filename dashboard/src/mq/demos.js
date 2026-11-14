/* ---------- DEMOS: the first three lifts, built from form footage ----------
   Each rep is a phase k from 0 (stretched: bottom of a press, arms up on a pulldown) to 1 (contracted),
   played at a coaching tempo: lift in about 1 s, pause, lower in 2–3 s. Hands that hold a bar or handle are
   placed by a two-bone solve WITH an explicit elbow direction (never a free guess), so the elbows travel
   the way they do in the footage; the shoulder blades move with the arms (down and back on pulls, apart at
   the end of a press). Equipment that moves (dumbbells, bar, handles) is attached to the hands. */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = x => x * x * (3 - 2 * x);
// tempo [up, top pause, down, bottom pause] in seconds → k for time t (0 = stretched, 1 = contracted)
function phaseK(t, tp) { const T = tp[0] + tp[1] + tp[2] + tp[3], u = ((t % T) + T) % T; if (u < tp[3]) return 0; if (u < tp[3] + tp[0]) return ease((u - tp[3]) / tp[0]); if (u < tp[3] + tp[0] + tp[1]) return 1; return 1 - ease((u - tp[3] - tp[0] - tp[1]) / tp[2]); }
// two segments from root R to target H, bending towards the pole direction
function ik2(R, H, L1, L2, pole) {
  const d = V.sub(H, R), dist = clamp(V.len(d), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-4), dn = V.norm(d);
  const a = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
  const pp = V.norm(V.sub(pole, V.sc(dn, V.dot(pole, dn))));
  const up = V.norm(V.add(V.sc(dn, Math.cos(a)), V.sc(pp, Math.sin(a)))), E = V.add(R, V.sc(up, L1));
  return {up, fore: V.norm(V.sub(H, E)), E};
}
/* Where a closed hand holds a bar, from the wrist (14 Nov 2026): measured on the physique body's fist, which
   sits closer to the wrist than the old jointed hand's did (bars and dumbbell handles showed below the fingers). */
const GRIP = 0.052, GX = -0.026;
// arms to grip points (world, left then right), with world elbow poles; returns the pose's arm fields
function armsTo(pose, gripL, gripR, poleL, poleR, extra = {}) {
  const B = solve(pose), out = {};
  for (const [k, g, pl] of [['arm', gripL, poleL], ['armR', gripR, poleR]]) {
    const S = B[k === 'arm' ? 'upperL' : 'upperR'].o, r = ik2(S, g, SK.upper, SK.fore + GRIP, pl);
    out[k] = {...((k === 'arm' ? pose.arm : pose.armR || pose.arm) || {}), up: r.up, fore: r.fore, grip: 0.9, thumb: 0.8, ...(extra[k] || {})};
  }
  // right-side fields are real-world here, so they must not be mirrored from the left
  return {...pose, arm: out.arm, armR: out.armR};
}
// legs to ankle points with the knee pointing along 'knee'; feet along 'foot'
function legsTo(pose, ankleL, knee, foot) {
  const B = solve(pose), H = B.thighL.o, r = ik2(H, ankleL, SK.thigh, SK.shin, knee);
  return {...pose, leg: {thigh: r.up, shin: r.fore, foot, knee}};
}
const mirP = p => [-p[0], p[1], p[2]];
const lerp1 = (a, b, t) => a + (b - a) * t;
// equipment helpers (world shapes)
/* Stacking (13 Nov 2026, Sam: on the incline press "the elbows cave in and the forearms, hands and elbows
   aren't stacked"). On every press the forearm points along the line the load travels: straight up under a
   dumbbell, straight along the handle's path on a machine. So a press is authored as two directions, where the
   upper arm puts the elbow and where the force goes, never as a hand target the elbow has to guess around.
   crease: the side the elbow bends towards, so a nearly straight arm can't flip its elbow the wrong way. */
const pressArm = (up, fore, palm, crease, extra = {}) => ({up, fore, palm, crease, grip: 0.9, thumb: 0.8, ...extra});
const pad = (c, h, rot) => ['world', 'B', c, h, 0.025, {mat: 'pad', ...(rot ? {rot} : {})}];
const tube = (a, b, r = 0.025) => ['world', 'Y', a, b, r, {mat: 'steel'}];
const db = bone => [   // a dumbbell in the hand: handle across the palm, two iron heads
  [bone, 'Q', [GX, -GRIP, -0.07], [GX, -GRIP, 0.07], 0.014, 0.003, {mat: 'steel'}],
  [bone, 'Q', [GX, -GRIP, 0.065], [GX, -GRIP, 0.125], 0.052, 0.008, {mat: 'iron'}],
  [bone, 'Q', [GX, -GRIP, -0.065], [GX, -GRIP, -0.125], 0.052, 0.008, {mat: 'iron'}]];

/* ---- Incline dumbbell press, bench at 30° ----
   Footage cues: back flat on the pad, shoulder blades pinned, feet planted wide. Bottom: dumbbells beside the
   upper chest, elbows about 55° from the torso and just below the bench line, forearms vertical: each dumbbell
   straight over its elbow. Top: dumbbells over the shoulders, arms vertical, not locked. The forearm stays
   vertical the whole way, so the elbows can't drift in under the weights. */
const INC = 30 * D2R, INC_U = [0, Math.sin(INC), -Math.cos(INC)], INC_N = [0, Math.cos(INC), Math.sin(INC)];
const INC_P0 = [0, 0.47, 0.02];   // where the back pad's top surface meets the seat
demo('inclinepress', {
  cam: {yaw: 62, pitch: 14, dist: 3.6, target: [0, 0.82, 0.05]}, tempo: [1.0, 0.4, 2.4, 0.4],
  props: [
    ['world', 'B', V.add(V.add(INC_P0, V.sc(INC_U, 0.4)), V.sc(INC_N, -0.035)), [0.14, 0.4, 0.035], 0.025, {mat: 'pad', rot: [-60, 0, 0]}],
    pad([0, 0.435, 0.2], [0.15, 0.035, 0.19], [-8, 0, 0]),
    tube([0, 0.06, -0.55], [0, 0.4, -0.12]), tube([0, 0.4, -0.12], [0, 0.4, 0.3]), tube([0, 0.4, 0.3], [0, 0.04, 0.42]),
    tube([-0.22, 0.03, -0.55], [0.22, 0.03, -0.55]), tube([-0.22, 0.03, 0.42], [0.22, 0.03, 0.42]),
    ...db('handL'), ...db('handR')],
  box: [[[0, 0.45, -0.05], 0.75]],
  pose(t) {
    const k = phaseK(t, this.tempo);
    let p = {root: {p: [0, 0.6, -0.0], pitch: -52}, spine: [-4, -6], neck: 14, head: 6,
      arm: {clav: [lerp1(2, 6, k), lerp1(-8, 4, k)]}};
    // seat the body: pelvis on the seat, chest on the pad
    const B0 = solve(p), back = fAt(B0.chest, [0, 0.1, -0.09]), gap = V.dot(V.sub(back, INC_P0), INC_N);
    p.root.p = V.sub(p.root.p, V.sc(INC_N, gap - 0.004));
    p = legsTo(p, [0.27, 0.075, 0.55], [0.3, 0.6, 1], [0.25, 0, 1]);
    const C = solve(p).chest, e = ease(k);
    // upper arm: out about 55° from the torso and a touch below the bench at the bottom, vertical at the top
    const up = slerpV(V.norm(fDir(C, [0.74, -0.52, -0.42])), V.norm([-0.06, 1, 0.03]), e), fore = slerpV([0, 1, 0], V.norm([-0.1, 1, 0.03]), e);
    p = {...p, arm: pressArm(up, fore, V.norm([-0.12, 0, 1]), V.norm([-1, 0.2, 0.3]), {clav: p.arm.clav})};
    return {pose: p};
  }
});

/* ---- Lat pulldown, wide overhand grip ----
   Footage cues: thighs locked under the pads, slight lean back. Top: arms long, shoulder blades lifted and
   spread (the stretch). Pull: shoulder blades down and together first, then elbows down and slightly back
   to the sides; bar to the upper chest, chest up to meet it. Forearms stay in line with the cable. */
const PD_TOP = [0, 2.3, 0.12];   // top pulley, above the bar's line
demo('pulldown', {
  cam: {yaw: 38, pitch: 10, dist: 4.3, target: [0, 1.15, 0.05]}, tempo: [1.0, 0.5, 2.0, 0.5],
  props: [
    pad([0, 0.43, 0.02], [0.2, 0.035, 0.19]), tube([0, 0.0, 0.02], [0, 0.4, 0.02], 0.035),
    ['world', 'Y', [-0.2, 0.62, 0.3], [0.2, 0.62, 0.3], 0.045, {mat: 'pad'}], tube([0, 0.4, 0.3], [0, 0.62, 0.3], 0.025), tube([0, 0.0, 0.3], [0, 0.4, 0.3], 0.025),
    tube([0, 0.0, 0.62], [0, 2.36, 0.62], 0.04), tube([0, 2.36, 0.62], [0, 2.36, 0.12], 0.035), ['world', 'Q', [-0.03, 2.3, 0.12], [0.03, 2.3, 0.12], 0.05, 0.01, {mat: 'steel'}],
    ['world', 'B', [0, 0.55, 0.7], [0.14, 0.3, 0.06], 0.01, {mat: 'iron'}],
    // the bar: straight middle, ends angled down
    ['bar', 'Y', [-0.42, 0, 0], [0.42, 0, 0], 0.014, {mat: 'steel'}], ['bar', 'Y', [0.42, 0, 0], [0.6, -0.07, 0], 0.014, {mat: 'steel'}], ['bar', 'Y', [-0.42, 0, 0], [-0.6, -0.07, 0], 0.014, {mat: 'steel'}]],
  frames: ['bar'], box: [[[0, 1.2, 0.3], 1.25]],
  pose(t) {
    const k = phaseK(t, this.tempo);
    let p = {root: {p: [0, 0.545, 0.0], pitch: lerp1(-6, -16, k)}, spine: [lerp1(2, -6, k), lerp1(0, -8, k)], neck: lerp1(-6, 6, k), head: lerp1(-10, 0, k),
      arm: {clav: [lerp1(22, -6, k), lerp1(10, -12, k)]}};
    p = legsTo(p, [0.17, 0.075, 0.47], [0.2, 0.3, 1], [0.15, 0, 1]);
    const B = solve(p), C = B.chest;
    // bar height: overhead at arm's length, then to the upper chest just under the chin
    const topBar = [0, B.upperL.o[1] + 0.6, B.upperL.o[2] + 0.05], botBar = V.add(fAt(C, [0, 0.27, 0.17]), [0, 0.0, 0.02]);
    const bar = V.lerp(topBar, botBar, ease(k)), gL = V.add(bar, [0.37, 0, 0]);
    const pole = V.norm(V.lerp(fDir(C, [1, 0.1, -0.15]), fDir(C, [0.6, -1, -0.45]), k));
    p = armsTo(p, gL, mirP(gL), pole, mirP(pole), {arm: {palm: fDir(C, [0, 0, 1])}, armR: {palm: V.mx(fDir(C, [0, 0, 1]))}});
    const fb = F(bar, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    return {pose: p, frames: {bar: fb}, segs: [[bar, PD_TOP, 0.006]]};
  }
});

/* ---- Seated machine chest press ----
   Footage cues: seat set so the handles are level with mid-chest, back and shoulder blades against the pad,
   feet flat. Press forward along the machine's path to just short of lockout, then let the handles come back
   until they're level with the chest (elbows a little behind the torso, about 45–60° out). Forearms point
   along the handles' path, so each hand is straight in front of its elbow. */
demo('machpress', {
  cam: {yaw: 58, pitch: 12, dist: 3.7, target: [0, 0.95, 0.2]}, tempo: [1.0, 0.4, 2.2, 0.4],
  props: [
    pad([0, 0.43, 0.06], [0.2, 0.035, 0.2]), tube([0, 0.0, 0.06], [0, 0.4, 0.06], 0.035),
    pad([0, 0.98, -0.2], [0.19, 0.4, 0.035], [-8, 0, 0]), tube([0, 0.4, -0.25], [0, 1.45, -0.32], 0.035),
    tube([0.36, 0.0, -0.34], [0.36, 1.62, -0.34], 0.04), tube([-0.36, 0.0, -0.34], [-0.36, 1.62, -0.34], 0.04), tube([-0.36, 1.62, -0.34], [0.36, 1.62, -0.34], 0.04),
    // lever arms hang from a pivot above and behind the shoulders, handles horizontal
    ['handleL', 'Y', [-0.07, 0, 0], [0.09, 0, 0], 0.017, {mat: 'pad'}], ['handleR', 'Y', [-0.09, 0, 0], [0.07, 0, 0], 0.017, {mat: 'pad'}]],
  frames: ['handleL', 'handleR'], box: [[[0, 1.0, 0.0], 1.0]],
  pose(t) {
    const k = phaseK(t, this.tempo);
    let p = {root: {p: [0, 0.545, 0.03], pitch: -9}, spine: [-3, -4], neck: 4, head: 2, arm: {clav: [0, lerp1(-10, 6, k)]}};
    p = legsTo(p, [0.17, 0.075, 0.5], [0.2, 0.3, 1], [0.15, 0, 1]);
    const C = solve(p).chest, e = ease(k);
    const up = slerpV(V.norm(fDir(C, [0.72, -0.4, -0.56])), V.norm(fDir(C, [0.12, -0.14, 1])), e), fore = slerpV(V.norm(fDir(C, [-0.06, 0.02, 1])), V.norm(fDir(C, [-0.04, -0.1, 1])), e);
    p = {...p, arm: pressArm(up, fore, fDir(C, [-0.1, -1, 0.05]), fDir(C, [-1, 0.1, 0.4]), {clav: p.arm.clav})};
    const B = solve(p), gL = gripOf(B, 'L');
    // levers: from a pivot on the frame above and behind each shoulder down to its handle
    const fr = {}, segs = [];
    for (const [s, g] of [['L', gL], ['R', gripOf(B, 'R')]]) {
      const piv = [s === 'L' ? 0.3 : -0.3, 1.58, -0.3];
      // the handle runs through the closed hand (14 Nov 2026: it sat above the fingers), the lever meets its outer end
      let hz = B['hand' + s].z; if (V.dot(hz, [s === 'L' ? 1 : -1, 0, 0]) < 0) hz = V.sc(hz, -1);
      fr['handle' + s] = frameX(g, s === 'L' ? hz : V.sc(hz, -1)); segs.push([piv, V.add(g, V.sc(hz, 0.09)), 0.022]);
    }
    return {pose: p, frames: fr, segs};
  }
});
