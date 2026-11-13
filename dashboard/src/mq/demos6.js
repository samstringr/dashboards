/* ---------- DEMOS 6: the rest of Mesocycle 05, and the variants (13 Nov 2026) ----------
   Sam found lateral raise and reverse cable curl standing still with no demo, and asked for variants where an
   exercise has them. New here: dumbbell lateral raise, cable curl (facing the pulley, facing away, reverse
   grip), preacher curl, kneeling cable crunch, seated dumbbell shrug, and the seated cable pullover with a bar
   (his preferred pullover). Built like the others: start and end of the rep as coached, the joints follow. */

/* ---- Dumbbell lateral raise ----
   Cues: stand tall, dumbbells at your sides. Raise the arms out to the side a little in front (about 30°, the
   shoulder blade's plane), elbows soft and leading, to shoulder height; palms end facing the floor. No shrug.
   Lower over 2–3 s. */
demo('lateral', {
  cam: {yaw: 24, pitch: 8, dist: 3.8, target: [0, 1.15, 0.05]}, tempo: [1.0, 0.4, 2.4, 0.3],
  props: [...db('handL'), ...db('handR')],
  pose(t) {
    const k = phaseK(t, this.tempo), e = lerp1(10, 86, ease(k));
    let p = STAND({root: {p: [0, 0.95, 0], pitch: 4}, spine: [1, 0], neck: -2, arm: {clav: [lerp1(0, 5, k), 2]}});
    const C = solve(p).chest, up = armDir(C, e, 28), fore = armDir(C, e - lerp1(8, 14, k), 40);
    const palm = slerpV(fDir(C, [-1, 0, 0.1]), [0, -1, 0], ease(k));
    return {pose: {...p, arm: {up, fore, palm, grip: 0.9, thumb: 0.8, clav: p.arm.clav, crease: fDir(C, [0, 0.3, 1])}}};
  }
});

/* ---- Cable curls ----
   One shape for three variants: the upper arms stay still and the forearms turn about the elbow, a straight bar
   between the hands and a cable to a low pulley. curl: facing the pulley, palms up. revcurl: the same with an
   overhand grip, palms down (forearms and the brachialis do more). facecurl: facing away from the pulley, the
   cable running up between the feet, upper arms a little behind the body: the biceps are stretched at the
   bottom, which is the point of it (Sam's choice for back & biceps day). */
function cableCurl(key, o) {
  const LOW = o.low, col = [0, 0, LOW[2] + Math.sign(LOW[2]) * 0.2];
  demo(key, {
    cam: o.cam, tempo: [0.9, 0.5, 2.2, 0.3],
    props: [tube(col, [0, 2.1, col[2]], 0.045), tube([0, LOW[1], col[2]], LOW, 0.03), ['world', 'Q', [-0.015, LOW[1], LOW[2]], [0.015, LOW[1], LOW[2]], 0.05, {mat: 'steel'}],
      ['world', 'B', [0, 0.45, col[2] + Math.sign(LOW[2]) * 0.04], [0.14, 0.3, 0.05], 0.01, {mat: 'iron'}], ['bar', 'Y', [-0.24, 0, 0], [0.24, 0, 0], 0.014, {mat: 'steel'}]],
    frames: ['bar'],
    pose(t) {
      const k = phaseK(t, this.tempo), th = lerp1(o.th0, o.th1, ease(k)) * D2R;
      let p = legsTo({root: {p: [0, 0.95, -0.02], pitch: o.lean}, spine: [0, -1], neck: -4, arm: {clav: [0, -4]}}, [o.foot, 0.067, 0.02], [0.08, 0, 1], [0.15, 0, 1]);
      const C = solve(p).chest, up = fDir(C, o.up), fore = V.norm(fDir(C, [0.04, -Math.cos(th), Math.sin(th)])), sup = V.norm(fDir(C, [0, Math.sin(th), Math.cos(th)]));
      p = {...p, arm: {up, fore, palm: o.over ? V.sc(sup, -1) : sup, grip: 0.9, thumb: 0.8, clav: [0, -4], crease: fDir(C, [0, 0.2, 1])}};
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), m = V.lerp(a, b, 0.5);
      return {pose: p, frames: {bar: frameX(m, V.sub(a, b))}, segs: [[LOW, m, 0.006]]};
    }
  });
}
cableCurl('curl', {low: [0, 0.12, 0.5], cam: {yaw: 58, pitch: 8, dist: 3.9, target: [0, 1.0, 0.15]}, lean: 3, foot: 0.12, up: [0.07, -1, 0.06], th0: 6, th1: 128});
cableCurl('revcurl', {low: [0, 0.12, 0.5], cam: {yaw: 58, pitch: 8, dist: 3.9, target: [0, 1.0, 0.15]}, lean: 3, foot: 0.12, up: [0.07, -1, 0.06], th0: 6, th1: 118, over: true});
cableCurl('facecurl', {low: [0, 0.05, -0.32], cam: {yaw: 64, pitch: 8, dist: 4.0, target: [0, 1.0, 0.0]}, lean: 7, foot: 0.2, up: [0.07, -1, -0.24], th0: 4, th1: 122});

/* ---- Preacher curl (straight bar) ----
   Cues: sit with the armpits snug over the top of the pad, the backs of the upper arms flat on it. Lower until
   the arms are almost straight (not locked), curl up until the forearms are vertical; the elbows never lift. */
{
  const base = {root: {p: [0, 0.6, -0.04], pitch: 14}, spine: [4, 6], neck: -8, arm: {clav: [6, 8]}};
  const legs = p => legsTo(p, [0.16, 0.075, 0.38], [0.2, 0.3, 1], [0.15, 0, 1]);
  const B0 = solve(legs(base)), UP = V.norm([0.04, -0.68, 0.73]);   // upper arms 45° down the pad, whatever the lean
  const S0 = B0.upperL.o, PADN = V.norm(V.cross(UP, [1, 0, 0])), padC = V.add(V.add([0, S0[1], S0[2]], V.sc(UP, 0.17)), V.sc(PADN, -0.085));   // under the upper arms
  const tilt = Math.atan2(UP[2], -UP[1]) / D2R;
  demo('preacher', {
    cam: {yaw: 64, pitch: 10, dist: 3.6, target: [0, 0.95, 0.2]}, tempo: [1.0, 0.4, 2.4, 0.4],
    props: [pad([0, 0.56, -0.08], [0.18, 0.035, 0.17]), tube([0, 0, -0.08], [0, 0.53, -0.08], 0.035),
      ['world', 'B', padC, [0.22, 0.03, 0.17], 0.03, {mat: 'pad', rot: [90 - tilt, 0, 0]}], tube(V.add(padC, V.sc(PADN, -0.03)), [0, 0, padC[2] + 0.08], 0.035),
      ['bar', 'Y', [-0.25, 0, 0], [0.25, 0, 0], 0.014, {mat: 'steel'}], ['bar', 'Q', [0.25, 0, 0], [0.3, 0, 0], 0.08, {mat: 'iron'}], ['bar', 'Q', [-0.25, 0, 0], [-0.3, 0, 0], 0.08, {mat: 'iron'}]],
    frames: ['bar'],
    pose(t) {
      const k = phaseK(t, this.tempo), ph = lerp1(14, 118, ease(k)) * D2R;
      let p = legs(base);
      const up = UP, bend = V.norm(V.cross(up, [1, 0, 0]));   // bend: the way the forearm folds, up off the pad
      const fore = V.norm(V.add(V.sc(up, Math.cos(ph)), V.sc(bend, Math.sin(ph)))), palm = V.norm(V.add(V.sc(up, -Math.sin(ph)), V.sc(bend, Math.cos(ph))));
      p = {...p, arm: {up, fore, palm, grip: 0.9, thumb: 0.8, clav: base.arm.clav, crease: bend}};
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R');
      return {pose: p, frames: {bar: frameX(V.lerp(a, b, 0.5), V.sub(a, b))}};
    }
  });
}

/* ---- Kneeling cable crunch (rope) ----
   Cues: kneel facing a high pulley, rope held beside your head. Keep the hips where they are and curl the ribs
   down towards the hips, elbows heading for the thighs; pause, then let the spine lengthen over 2 s. */
{
  const TOP = [0, 2.2, 0.62];
  demo('cablecrunch', {
    cam: {yaw: 74, pitch: 8, dist: 4.2, target: [0, 0.9, 0.2]}, tempo: [1.0, 0.6, 2.0, 0.3],
    props: [tube([0, 0, 0.82], [0, 2.3, 0.82], 0.045), tube([0, 2.28, 0.82], [0, 2.28, TOP[2]], 0.035), ['world', 'Q', [-0.015, TOP[1], TOP[2]], [0.015, TOP[1], TOP[2]], 0.05, {mat: 'steel'}],
      ['world', 'B', [0, 0.45, 0.86], [0.14, 0.3, 0.05], 0.01, {mat: 'iron'}], ['world', 'B', [0, 0.015, -0.05], [0.28, 0.015, 0.3], 0.01, {mat: 'pad'}]],
    pose(t) {
      const k = phaseK(t, this.tempo), e = ease(k);
      let p = {root: {p: [0, 0.53, 0.0], pitch: lerp1(16, 24, e)}, spine: [lerp1(0, 22, e), lerp1(4, 30, e)], neck: lerp1(-4, 14, e), head: lerp1(0, 6, e)};
      // kneeling: thighs nearly upright, shins flat on the mat behind
      p = legsTo(p, [0.12, 0.1, -0.4], [0.05, -0.2, 1], V.norm([0.05, -1, -0.25]));
      const H = solve(p).head, gL = fAt(H, [0.08, -0.02, 0.06]), gR = fAt(H, [-0.08, -0.02, 0.06]), C = solve(p).chest;
      p = armsTo(p, gL, gR, fDir(C, [0.5, -1, 0.35]), fDir(C, [-0.5, -1, 0.35]), {arm: {palm: fDir(C, [-1, 0, 0])}, armR: {palm: fDir(C, [1, 0, 0])}});
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), mid = V.lerp(a, b, 0.5), m = V.add(mid, V.sc(V.norm(V.sub(TOP, mid)), 0.16));
      return {pose: p, segs: [[TOP, m, 0.006], [m, a, 0.011], [m, b, 0.011]]};
    }
  });
}

/* ---- Seated dumbbell shrug ----
   Cues: sit tall at the end of a flat bench, dumbbells hanging beside it, palms in. Shoulders straight up
   towards the ears, no rolling; pause a second and lower over 2 s. Sitting stops the legs and hips helping. */
{
  const base = {root: {p: [0, 0.545, 0.0], pitch: 0}, spine: [0, 0], neck: 0};
  demo('shrugseat', {
    cam: {yaw: 30, pitch: 8, dist: 3.6, target: [0, 0.9, 0.05]}, tempo: [0.8, 1.0, 1.8, 0.3],
    props: [pad([0, 0.43, -0.4], [0.14, 0.035, 0.5]), tube([0, 0, -0.75], [0, 0.4, -0.75], 0.035), tube([0, 0, -0.05], [0, 0.4, -0.05], 0.035), tube([-0.2, 0.02, -0.05], [0.2, 0.02, -0.05], 0.03),
      ...db('handL'), ...db('handR')],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = SIT_FEET({...base, arm: {clav: [lerp1(-6, 26, ease(k)), lerp1(2, -6, k)]}});
      const C = solve(p).chest;
      return {pose: {...p, arm: armFix(C, [0.2, -1, 0.02], [0.17, -1, 0.04], [-1, 0, 0.05], {clav: p.arm.clav})}};
    }
  });
}

/* ---- Seated cable pullover (straight bar) ----
   Sam's preferred pullover (13 Nov 2026): sit on a flat bench facing away from a high pulley, the bar overhead.
   Arms nearly straight, sweep the bar over and down in front to the lap with the lats, then let it draw the
   arms back overhead for the stretch. The pulley is high and just behind the head, so the cable runs down past
   the forehead rather than through it. */
{
  const TOP = [0, 2.3, -0.17], base = {root: {p: [0, 0.545, 0.02], pitch: -4}, spine: [-1, -2], neck: 6, head: 4};
  const B0 = solve(SIT_FEET(base)), S0 = B0.upperL.o, dS = V.norm([0.05, 0.96, -0.2]), dE = V.norm([0.06, -0.55, 0.83]);
  demo('pullover', {
    cam: {yaw: 70, pitch: 10, dist: 4.3, target: [0, 1.1, 0.0]}, tempo: [1.0, 0.5, 2.2, 0.4],
    props: [pad([0, 0.43, -0.05], [0.14, 0.035, 0.55]), tube([0, 0, -0.45], [0, 0.4, -0.45], 0.035), tube([0, 0, 0.35], [0, 0.4, 0.35], 0.035),
      tube([0, 0, -0.62], [0, 2.38, -0.62], 0.045), tube([0, 2.36, -0.62], [0, 2.36, TOP[2]], 0.035), ['world', 'Q', [-0.015, TOP[1], TOP[2]], [0.015, TOP[1], TOP[2]], 0.05, {mat: 'steel'}],
      ['world', 'B', [0, 0.45, -0.67], [0.14, 0.3, 0.05], 0.01, {mat: 'iron'}], ['bar', 'Y', [-0.3, 0, 0], [0.3, 0, 0], 0.014, {mat: 'steel'}]],
    frames: ['bar'],
    pose(t) {
      const k = phaseK(t, this.tempo);
      let p = SIT_FEET({...base, arm: {clav: [lerp1(16, -2, k), lerp1(6, -4, k)]}});
      const B1 = solve(p), C = B1.chest, S = B1.upperL.o, d = slerpV(dS, dE, ease(k)), gL = V.add(V.add(S, V.sc(d, lerp1(0.6, 0.55, k))), [0.02, 0, 0]);
      const pole = V.norm(V.lerp(fDir(C, [0.8, 0.2, -0.6]), fDir(C, [0.7, 0, -1]), k));
      p = armsTo(p, gL, mirP(gL), pole, mirP(pole), {arm: {palm: slerpV(V.norm([0, 0.3, 1]), [0, -1, -0.1], k)}, armR: {palm: slerpV(V.norm([0, 0.3, 1]), [0, -1, -0.1], k)}});
      const B = solve(p), a = gripOf(B, 'L'), b = gripOf(B, 'R'), m = V.lerp(a, b, 0.5);
      return {pose: p, frames: {bar: frameX(m, V.sub(a, b))}, segs: [[TOP, m, 0.006]]};
    }
  });
}
