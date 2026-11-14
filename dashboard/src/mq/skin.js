/* ---------- SKIN: the form demos on the physique body (13 Nov 2026) ----------
   WHY: Sam asked for the demos to use the physique's body instead of the jointed mannequin. Each demo keeps its
   choreography: every frame the demo rig (rig.js) is solved as before, then its joint angles are copied onto the
   physique body's skeleton (body.js), which has the body's own bone lengths. The torso takes the rig's pelvis,
   lumbar, chest and head turns; the shoulders move with the rig's shoulder girdle (shrugs, reaches); the hands
   are placed where the rig's hands are and the feet where its feet are, so grips, seats and footplates stay in
   contact with the props, and the elbows and knees bend the way the rig's do. */
const AR = ATLAS_RIG;
const mad = (a, b, s) => V.add(a, V.sc(b, s));
let REST_MQ = null;
// a vector in the rig's rest frame f0, carried to its posed frame f1
const carry = (f0, f1, v) => { const l = [V.dot(v, f0.x), V.dot(v, f0.y), V.dot(v, f0.z)]; return V.add(V.add(V.sc(f1.x, l[0]), V.sc(f1.y, l[1])), V.sc(f1.z, l[2])); };
function toAtlas(B) {
  const S = AR.SK, L = AR.LEN, RJ = AR.REST_J; if (!REST_MQ) REST_MQ = solve({});
  const fr = f => ({l: f.x, u: f.y, f: f.z}), F0 = fr(B.pelvis), F1 = fr(B.lumbar), F2 = fr(B.chest), F3n = fr(B.neck), F3 = fr(B.head);
  // the rig has the body's own skeleton (rig.js SK), so its joints are used as they are: no second solve to disagree with it
  const hipMid = V.lerp(B.thighL.o, B.thighR.o, 0.5), P = V.sub(hipMid, V.add(V.sc(F0.u, S.hp[1]), V.sc(F0.f, S.hp[2])));
  const A = mad(P, F0.u, L.pelvis), C = mad(A, F1.u, L.abdomen), N = mad(C, F2.u, L.chest), H = mad(mad(N, F3n.u, S.head[1]), F3n.f, S.head[2]);
  const J = {P, A, C, N, H, F0, F1, F2, F3, F3n, side: {}};
  for (const [k, sg] of [['L', 1], ['R', -1]]) {
    const sh = B['upper' + k].o, el = B['fore' + k].o, wr = B['hand' + k].o, hp = B['thigh' + k].o, kn = B['shin' + k].o, an = B['foot' + k].o;
    const ep = V.sc(B['upper' + k].z, -1), kp = B['thigh' + k].z;   // elbow point and kneecap, from the rig's hinges
    const rs = RJ.side[k], toe = V.add(an, carry(REST_MQ['foot' + k], B['foot' + k], V.sub(rs.toe, rs.an)));
    const bend = Math.acos(Math.max(-1, Math.min(1, V.dot(B['hand' + k].y, B['fing2' + k].y)))) / D2R;   // how closed the rig's fingers are
    /* the hand takes the rig's hand as it is, wrist bend included: before, the body's hand only followed the
       forearm, so a bar authored in the rig's grip sat beside the body's fingers and slid as the wrist moved */
    const h = B['hand' + k], hy = V.sc(h.y, -1), pz = V.sc(h.x, -1), hz = V.norm(V.sub(pz, V.sc(hy, V.dot(pz, hy))));
    J.side[k] = {sg, sh, el, wr, hp, kn, an, toe, ep, kp, pron: 0, curl: Math.min(95, 12 + bend * 0.5), hand: {y: hy, z: hz, x: V.sc(V.cross(hz, hy), sg)}};
  }
  // forearm turn, spread along the forearm: from the elbow's frame to where the rig's palm faces (its hand's -x)
  const B0 = AR.frames(J);
  for (const [k, sg] of [['L', 1], ['R', -1]]) {
    const fa = B0['fa' + k], y = fa.y, palm = V.sc(B['hand' + k].x, -1), t = V.sub(palm, V.sc(y, V.dot(palm, y)));
    if (V.len(t) < 1e-4) continue;
    const tn = V.norm(t), ang = Math.atan2(V.dot(V.cross(fa.z, tn), y), V.dot(fa.z, tn));
    // 0 = palms forward, 180 = palms back: a forearm turns through that range and never the other way round, so
    // −170° means +190° (without this a palms-down grip flipped the twist from one frame to the next)
    let pr = ang / D2R / sg; if (pr < -90) pr += 360; J.side[k].pron = pr;
  }
  return J;
}
/* Working muscles painted on the skin: red does most of the work, yellow helps (the mannequin's ramp). */
function paintWork(g, d, shares) {
  const nv = d.pos.length / 3, n = MUS.length, col = g.attributes.color.array, wk = g.attributes.wk.array, L = MUS.map(k => (shares && shares[k]) || 0), base = AR.SKIN;
  for (let v = 0; v < nv; v++) {
    let lv = 0; for (let i = 0; i < n; i++) if (L[i]) lv = Math.max(lv, L[i] * d.muscleW[v * n + i]);
    const on = ss(0.1, 0.3, lv), c = ramp2(lv);
    for (let q = 0; q < 3; q++) col[v * 3 + q] = base[q] + (Math.pow(c[q], 2.2) - base[q]) * on;
    wk[v] = lv;
  }
  g.attributes.color.needsUpdate = true; g.attributes.wk.needsUpdate = true;
}
function buildSkinned(comp) {
  const d = AR.bodyData(comp), geo = AR.bodyGeometry(d, true), mat = AR.bodyMaterial(true, false), rig = AR.makeSkeleton(d), mesh = new T.SkinnedMesh(geo, mat);
  rig.bones.forEach(b => mesh.add(b)); mesh.bind(rig.sk, new T.Matrix4()); mesh.frustumCulled = false;
  const root = new T.Group(); root.add(mesh);
  const groups = {}; if (!REST_MQ) REST_MQ = solve({});
  // every frame the rig solves gets an empty group, so equipment can ride on a hand or the pelvis as before
  for (const n of Object.keys(REST_MQ)) { const q = new T.Group(); q.matrixAutoUpdate = false; groups[n] = q; root.add(q); }
  const M = new T.Matrix4();
  return {root, groups, skinned: true,
    paint(shares) { paintWork(geo, d, shares); },
    flex(x) { mat.userData.uFlex.value = x; },   // 0 = the working muscles long and relaxed, 1 = fully shortened
    pose(B) { for (const [n, q] of Object.entries(groups)) { const f = B[n]; if (!f) continue; frameMatrix(M, f); q.matrix.copy(M); q.matrixWorldNeedsUpdate = true; } AR.poseSkeleton(rig, d, toAtlas(B)); },
    dispose() { geo.dispose(); mat.dispose(); }};
}
