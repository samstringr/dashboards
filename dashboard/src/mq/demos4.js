/* ---------- DEMOS 4: shoulders & arms day ---------- */
const STAND = p => legsTo(p, [0.12, 0.067, 0.02], [0.06, 0, 1], [0.12, 0, 1]);
// arm fields set directly (upper arm still, forearm moving): elbows pinned, as the cue says
const armFix = (C, up, fore, palm, extra = {}) => ({up: fDir(C, up), fore: fDir(C, fore), palm: fDir(C, palm), grip: 0.9, thumb: 0.8, ...extra});

/* ---- Seated dumbbell shoulder press ----
   Footage cues: bench upright, back and head on the pad. Start with the dumbbells at about ear height,
   forearms vertical, elbows a little in front of the body (not flared straight out). Press up and slightly in
   to just short of lockout over the shoulders; lower for 2 s. 14 Nov 2026, Sam: "the worst one": the forearms
   weren't stacked and the dumbbells turned in. Now authored like the other presses: the upper arm 25° in front
   of the shoulder line, the forearm vertical under the dumbbell, the handles level across, palms forward. */
{
  const base = {root: {p: [0, 0.55, 0.02], pitch: -7}, spine: [-2, -4], neck: 4};
  const B0 = solve(SIT_FEET(base));
  demo('ohp', {
    cam: {yaw: 34, pitch: 10, dist: 3.9, target: [0, 1.15, 0.05]}, tempo: [1.0, 0.4, 2.2, 0.4],
    props: [...seat(0.02, 0.415), ['world', 'B', fAt(B0.chest, [0, 0.14, -0.145]), [0.16, 0.38, 0.035], 0.025, {mat: 'pad', rot: [-11, 0, 0]}], tube([0, 0.42, -0.2], [0, 0.0, -0.4], 0.035), ...db('handL'), ...db('handR')],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = SIT_FEET({...base, arm: {clav: [lerp1(4, 16, k), lerp1(2, 6, k)]}});
      const C = solve(p).chest, e = ease(k);
      const up = slerpV(V.norm(fDir(C, [0.86, -0.22, 0.4])), V.norm([-0.08, 1, 0.03]), e), fore = slerpV([0, 1, 0], V.norm([-0.1, 1, 0.02]), e);
      p = {...p, arm: pressArm(up, fore, V.norm([0, 0, 1]), V.norm([-1, 0.1, 0.5]), {clav: p.arm.clav})};
      return {pose: p};
    }
  });
}

/* ---- Tricep pushdown (straight bar) ----
   Footage cues: stand tall with a slight lean, elbows pinned to your sides. Push the bar down until the arms
   are straight and squeeze; let it come back up to about 90° at the elbow, slowly. Only the forearms move.
   The pulley is 60 cm in front (13 Nov 2026, Sam: the cable went through the body), so the cable runs down
   past the face and chest with a hand's width to spare. */
{
  const TOP = [0, 2.08, 0.62];
  demo('pushdown', {
    cam: {yaw: 62, pitch: 8, dist: 4.1, target: [0, 1.15, 0.25]}, tempo: [0.9, 0.5, 2.0, 0.3],
    props: [tube([0, 0, 0.84], [0, 2.2, 0.84], 0.045), tube([0, 2.12, 0.84], [0, 2.12, TOP[2]], 0.035), ['world', 'Q', [-0.015, TOP[1], TOP[2]], [0.015, TOP[1], TOP[2]], 0.05, {mat: 'steel'}],
      ['world', 'B', [0, 0.45, 0.88], [0.14, 0.3, 0.06], 0.01, {mat: 'iron'}], ['bar', 'Y', [-0.22, 0, 0], [0.22, 0, 0], 0.014, {mat: 'steel'}]],
    frames: ['bar'],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = STAND({root: {p: [0, 0.94, -0.02], pitch: 8}, spine: [2, 3], neck: -6, arm: {clav: [-4, -2]}});
      // straight arms at the bottom put the hands 10 cm in front of the thighs, so the bar and cable stay clear (14 Nov 2026)
      const C = solve(p).chest, fo = slerpV(V.norm([0.05, 0.2, 1]), V.norm([0.05, -1, 0.34]), ease(k)), palm = slerpV(V.norm([0, -1, 0.15]), V.norm([0, -0.34, -1]), k);
      p = {...p, arm: armFix(C, [0.1, -1, 0.07], fo, palm, {clav: [-4, -2]})};
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), m = V.lerp(a, b, 0.5);
      return {pose: p, frames: {bar: frameX(m, V.sub(a, b))}, segs: [[TOP, m, 0.006]]};
    }
  });
}

/* ---- Overhead cable triceps extension (rope) ----
   Footage cues: face away from the pulley in a split stance, lean forward, elbows up beside your head and
   pointing forward. Let the rope pull your hands back behind your head for a deep stretch, then extend fully
   in line with the upper arms. Elbows stay where they are, pointing forward: the elbow's bend is pinned to
   the back of the head, so it can't flip as the arm straightens (13 Nov 2026, Sam: "the elbows invert").
   The pulley is high (2 m) and behind, so the cable comes down over the head to the rope rather than through
   it (14 Nov 2026). */
{
  const LOW = [0, 1.98, -0.72];
  demo('ohtri', {
    cam: {yaw: 70, pitch: 8, dist: 4.4, target: [0, 1.2, -0.05]}, tempo: [1.0, 0.5, 2.2, 0.4],
    props: [tube([0, 0, -0.98], [0, 2.2, -0.98], 0.045), tube([0, LOW[1], -0.98], LOW, 0.03), ['world', 'Q', [-0.015, LOW[1], LOW[2]], [0.015, LOW[1], LOW[2]], 0.05, {mat: 'steel'}],
      ['world', 'B', [0, 0.45, -1.02], [0.14, 0.3, 0.06], 0.01, {mat: 'iron'}]],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = {root: {p: [0, 0.9, 0.0], pitch: 24}, spine: [4, 6], neck: -16, head: -4, arm: {clav: [14, 4]}};
      p = legsTo(p, [0.13, 0.067, 0.34], [0.05, 0, 1], [0.12, 0, 1]);
      p = legR(p, solve(p), [-0.12, 0.08, -0.33], [0, 0.2, 1], V.norm([-0.1, -0.25, 1]));
      // the forearm turns in the upper arm's own front-to-back plane: from folded behind the head (150°) to almost straight
      const C = solve(p).chest, U = V.norm([0.12, 0.84, 0.48]), N = V.norm(V.add([0, 0, -1], V.sc(U, U[2]))), ph = lerp1(150, 8, ease(k)) * D2R;
      const fo = V.add(V.sc(U, Math.cos(ph)), V.sc(N, Math.sin(ph)));
      p = {...p, arm: armFix(C, U, fo, [-1, 0, 0], {clav: [14, 4], crease: fDir(C, N)})};
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), m = V.add(V.lerp(a, b, 0.5), V.sc(V.norm(V.sub(LOW, V.lerp(a, b, 0.5))), 0.1));
      return {pose: p, segs: [[LOW, m, 0.006], [m, a, 0.011], [m, b, 0.011]]};
    }
  });
}

/* ---- Cable hammer curl (rope) ----
   Footage cues: face a low pulley, elbows at your sides, thumbs up the whole way. Curl the rope up towards
   your shoulders without the elbows drifting forward; lower for 2 s to straight arms. At the bottom the hands
   are together in front of the thighs, so the rope comes up from the pulley in front of the legs, not through
   them (13 Nov 2026, Sam: "clipping through the model"). */
{
  const LOW = [0, 0.13, 0.46];
  demo('hammer', {
    cam: {yaw: 60, pitch: 8, dist: 3.9, target: [0, 1.0, 0.15]}, tempo: [0.9, 0.5, 2.0, 0.3],
    props: [tube([0, 0, 0.66], [0, 2.1, 0.66], 0.045), tube([0, LOW[1], 0.66], LOW, 0.03), ['world', 'Q', [-0.015, LOW[1], LOW[2]], [0.015, LOW[1], LOW[2]], 0.05, {mat: 'steel'}],
      ['world', 'B', [0, 0.45, 0.7], [0.14, 0.3, 0.06], 0.01, {mat: 'iron'}]],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = STAND({root: {p: [0, 0.95, -0.02], pitch: 3}, spine: [0, -2], neck: -6});
      const C = solve(p).chest, fo = slerpV(V.norm([-0.2, -1, 0.42]), V.norm([-0.04, 0.6, 0.8]), ease(k));
      p = {...p, arm: armFix(C, [0.03, -1, 0.12], fo, [-1, 0, 0], {clav: [0, -3], crease: fDir(C, [0, 0.2, 1])})};
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), m = V.add(V.lerp(a, b, 0.5), V.sc(V.norm(V.sub(LOW, V.lerp(a, b, 0.5))), 0.1));
      return {pose: p, segs: [[LOW, m, 0.006], [m, a, 0.011], [m, b, 0.011]]};
    }
  });
}

/* ---- Incline dumbbell curl ----
   Footage cues: bench at 45–60°, arms hanging straight down behind the line of the torso, palms forward.
   Curl without the elbows moving forward; lower all the way for the full stretch at the bottom. */
{
  const base = {root: {p: [0, 0.53, 0.02], pitch: -34}, spine: [-2, -4], neck: 16, head: 4};
  const B0 = solve(SIT_FEET(base));
  demo('inclinecurl', {
    cam: {yaw: 66, pitch: 10, dist: 3.8, target: [0, 0.95, 0.0]}, tempo: [1.0, 0.4, 2.4, 0.5],
    props: [...seat(0.04), ['world', 'B', fAt(B0.chest, [0, 0.12, -0.145]), [0.15, 0.4, 0.035], 0.025, {mat: 'pad', rot: [-40, 0, 0]}], tube([0, 0.4, -0.1], [0, 0, -0.5], 0.035), ...db('handL'), ...db('handR')],
    pose(t) {
      const k = phaseK(t, this.tempo), th = lerp1(4, 122, ease(k)) * D2R;
      let p = SIT_FEET({...base, arm: {clav: [-4, -8]}});
      const up = V.norm([0.06, -1, -0.02]), fore = V.norm([0.05, -Math.cos(th), Math.sin(th)]), palm = V.norm([0, Math.sin(th), Math.cos(th)]);
      p = {...p, arm: {up, fore, palm, grip: 0.9, thumb: 0.8, clav: [-4, -8]}};
      return {pose: p};
    }
  });
}
