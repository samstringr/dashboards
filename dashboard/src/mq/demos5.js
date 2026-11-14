/* ---------- DEMOS 5: the exercises new in Mesocycle 05 (13 Nov 2026) ----------
   Weighted dip (chest & triceps day), seated cable row and DB shrug (back & biceps), cable upright row and DB
   shrug (shoulders & arms). Built like the others: start and end of the rep as it is coached, the joints follow. */

/* ---- Weighted dip ----
   Cues: on parallel bars, a dip belt with a plate at the hips. Start at the top, arms straight, shoulders down.
   Lean the chest forward a little and lower until the upper arms are about level with the bars; elbows go back,
   not out. Knees bent, ankles crossed behind. Press back up to straight arms. */
{
  const HAND = [0.27, 1.27, 0.04];   // on the bar itself, so the closed hand wraps it (14 Nov 2026)
  demo('dip', {
    cam: {yaw: 58, pitch: 6, dist: 4.4, target: [0, 1.2, 0]}, tempo: [1.8, 0.4, 1.0, 0.5],
    props: [tube([0.27, 1.27, -0.38], [0.27, 1.27, 0.42], 0.022), tube([-0.27, 1.27, -0.38], [-0.27, 1.27, 0.42], 0.022),
      tube([0.27, 0, 0.38], [0.27, 1.27, 0.38], 0.03), tube([-0.27, 0, 0.38], [-0.27, 1.27, 0.38], 0.03), tube([0.27, 0, -0.34], [0.27, 1.27, -0.34], 0.03), tube([-0.27, 0, -0.34], [-0.27, 1.27, -0.34], 0.03),
      ['plate', 'Q', [0, 0, -0.012], [0, 0, 0.012], 0.11, {mat: 'iron'}]],
    frames: ['plate'],
    pose(t) {
      const k = phaseK(t, this.tempo);   // 0 = top (arms straight), 1 = bottom
      const lean = lerp1(12, 30, k);
      let p = {root: {p: [0, lerp1(1.36, 1.1, ease(k)), lerp1(-0.02, -0.07, k)], pitch: lean}, spine: [lerp1(2, 6, k), lerp1(2, 6, k)], neck: -lean * 0.6,
        arm: {clav: [lerp1(-10, 6, k), lerp1(-6, 6, k)]}};
      // knees bent about 90°, shins back, the right ankle crossed over the left
      const B0 = solve(p), hipL = B0.thighL.o;
      p = legsTo(p, V.add(hipL, [-0.06, -0.36, -0.42]), [0.1, 0.1, 1], [0.05, -0.6, -0.8]);
      const C = solve(p).chest, pole = V.norm(V.lerp(fDir(C, [0.25, -0.2, -1]), fDir(C, [0.2, 0.1, -1]), k));
      p = armsTo(p, HAND, mirP(HAND), pole, mirP(pole), {arm: {palm: [-1, 0, 0.05]}, armR: {palm: [1, 0, 0.05]}});
      const P = solve(p).pelvis, hang = fAt(P, [0, -0.2, 0.15]);
      return {pose: p, frames: {plate: F([hang[0], hang[1] - 0.18, hang[2]], [1, 0, 0], [0, 1, 0], [0, 0, 1])}, segs: [[V.add(hang, [-0.06, 0.08, 0]), [hang[0], hang[1] - 0.08, hang[2]], 0.004], [V.add(hang, [0.06, 0.08, 0]), [hang[0], hang[1] - 0.08, hang[2]], 0.004]]};
    }
  });
}

/* ---- Seated cable row (V-handle) ----
   Cues: feet on the plate, knees soft, chest tall. Start with a small forward reach at the hips, arms long.
   Pull the handle to the belly button, elbows close to your sides, and squeeze the shoulder blades together;
   sit upright at the end, no swinging back. Return over 2 s. */
{
  const PUL = [0, 0.42, 1.0], base = {spine: [0, 0], neck: 0};
  demo('cablerow', {
    cam: {yaw: 70, pitch: 10, dist: 4.0, target: [0, 0.8, 0.35]}, tempo: [1.0, 0.5, 2.0, 0.4],
    props: [pad([0, 0.4, -0.05], [0.17, 0.035, 0.32]), tube([0, 0.0, -0.05], [0, 0.37, -0.05], 0.035), tube([0, 0.02, -0.3], [0, 0.02, 1.0], 0.03),
      ['world', 'B', [0, 0.3, 0.68], [0.18, 0.12, 0.02], 0.01, {mat: 'pad', rot: [-25, 0, 0]}], tube([0, 0, 1.06], [0, 1.6, 1.06], 0.045),
      ['world', 'Q', [-0.015, PUL[1], PUL[2]], [0.015, PUL[1], PUL[2]], 0.05, {mat: 'steel'}], ['world', 'B', [0, 0.45, 1.1], [0.14, 0.3, 0.05], 0.01, {mat: 'iron'}],
      ['handle', 'Y', [-0.045, 0, 0], [0.045, 0, 0], 0.016, {mat: 'steel'}], ['handle', 'Y', [0, 0, 0], [0, 0, 0.09], 0.01, {mat: 'steel'}]],
    frames: ['handle'],
    pose(t) {
      const k = phaseK(t, this.tempo);   // 0 = arms long, 1 = handle at the belly
      let p = {...base, root: {p: [0, 0.5, lerp1(0.0, -0.04, k)], pitch: lerp1(16, -3, ease(k))}, spine: [lerp1(4, -2, k), lerp1(4, -4, k)], neck: lerp1(-8, 2, k),
        arm: {clav: [lerp1(2, -4, k), lerp1(16, -16, k)]}};
      p = legsTo(p, [0.12, 0.33, 0.7], [0.15, 0.35, 1], [0.08, 0.55, 1]);
      const C = solve(p).chest, gL = V.lerp([0.04, 0.68, 0.66], [0.045, 0.83, 0.2], ease(k)), pole = V.norm(V.lerp(fDir(C, [0.3, -1, -0.2]), fDir(C, [0.25, -0.5, -1]), k));
      p = armsTo(p, gL, mirP(gL), pole, mirP(pole), {arm: {palm: fDir(C, [-1, 0, 0])}, armR: {palm: V.mx(fDir(C, [-1, 0, 0]))}});
      const B = solve(p), m = V.lerp(gripOf(B, 'L'), gripOf(B, 'R'), 0.5), z = V.norm(V.sub(PUL, m));
      return {pose: p, frames: {handle: F(m, [1, 0, 0], V.norm(V.cross(z, [1, 0, 0])), z)}, segs: [[PUL, V.add(m, V.sc(z, 0.09)), 0.006]]};
    }
  });
}

/* ---- Dumbbell shrug ----
   Cues: stand tall, dumbbells at your sides, palms in, arms long. Lift the shoulders straight up towards the
   ears, no rolling; pause a second at the top and lower over 2 s. The arms only hang: no bending at the elbows. */
demo('shrug', {
  cam: {yaw: 28, pitch: 8, dist: 3.8, target: [0, 1.15, 0]}, tempo: [0.8, 1.0, 1.8, 0.3],
  props: [...db('handL'), ...db('handR')],
  pose(t) {
    const k = phaseK(t, this.tempo);
    let p = STAND({root: {p: [0, 0.95, 0], pitch: 2}, spine: [0, 0], neck: 0, arm: {clav: [lerp1(-6, 26, ease(k)), lerp1(2, -6, k)]}});
    const C = solve(p).chest;
    return {pose: {...p, arm: armFix(C, [0.06, -1, 0.02], [0.04, -1, 0.04], [-1, 0, 0.05], {clav: p.arm.clav})}};
  }
});

/* ---- Cable upright row (straight bar) ----
   Cues (Jeff Nippard's upright-row fix, checked 14 Nov 2026): stand just behind the pulley, grip 1 to 1.5 times
   shoulder width (wider works the side delts more), palms towards you. Lead with the elbows, "row out and up",
   bar close to the body, and stop when the elbows reach shoulder height; the hands stay below the elbows.
   Lower over 2 s. Was: hands narrower than the shoulders and the pulley 60 cm away. */
{
  const PUL = [0, 0.08, 0.24];
  demo('uprow', {
    cam: {yaw: 34, pitch: 8, dist: 3.9, target: [0, 1.1, 0.12]}, tempo: [1.0, 0.4, 2.0, 0.4],
    props: [tube([0, 0, 0.42], [0, 1.6, 0.42], 0.045), tube([0, PUL[1], 0.42], PUL, 0.03), ['world', 'Q', [-0.015, PUL[1], PUL[2]], [0.015, PUL[1], PUL[2]], 0.05, {mat: 'steel'}], ['world', 'B', [0, 0.45, 0.47], [0.14, 0.3, 0.05], 0.01, {mat: 'iron'}],
      ['bar', 'Y', [-0.34, 0, 0], [0.34, 0, 0], 0.014, {mat: 'steel'}]],
    frames: ['bar'],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = STAND({root: {p: [0, 0.95, -0.05], pitch: -2}, spine: [0, 0], neck: 0, arm: {clav: [lerp1(-4, 12, ease(k)), lerp1(4, -2, k)]}});
      const C = solve(p).chest, gL = V.lerp([0.25, 0.8, 0.13], [0.24, 1.22, 0.15], ease(k)), pole = V.norm(V.lerp(fDir(C, [1, -0.3, -0.1]), fDir(C, [1, 0.35, -0.2]), k));
      p = armsTo(p, gL, mirP(gL), pole, mirP(pole), {arm: {palm: fDir(C, [0, 0.1, -1])}, armR: {palm: V.mx(fDir(C, [0, 0.1, -1]))}});
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), m = V.lerp(a, b, 0.5);
      return {pose: p, frames: {bar: frameX(m, V.sub(a, b))}, segs: [[PUL, m, 0.006]]};
    }
  });
}
