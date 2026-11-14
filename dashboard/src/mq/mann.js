/* ---------- MANNEQUIN: the form-demo figure ----------
   WHY rigid parts: one stretched skin (v7) smeared the chest and lats whenever an arm moved, which is
   the "weird stuff under the arms". An artist's mannequin can't do that: every part is solid and turns
   about its joint, and a ball covers each joint. Parts are lathed or ellipsoid shapes in each bone's own
   frame (see rig.js: y runs back up the limb, x is the outside of the limb, z the front), matte white,
   blank head. The working muscles are painted on the parts: red does most of the work, yellow helps. */
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const BASE = [0.86, 0.865, 0.88];
const RAMP2 = [[0.15, [1.0, 0.86, 0.24]], [0.45, [1.0, 0.62, 0.12]], [0.75, [1.0, 0.36, 0.1]], [1.0, [0.95, 0.18, 0.12]]];
function ramp2(l) {
  if (l <= RAMP2[0][0]) return RAMP2[0][1];
  for (let i = 1; i < RAMP2.length; i++) if (l <= RAMP2[i][0]) { const [a, ca] = RAMP2[i - 1], [b, cb] = RAMP2[i], t = (l - a) / (b - a); return ca.map((v, k) => v + (cb[k] - v) * t); }
  return RAMP2[RAMP2.length - 1][1];
}
// a limb: profile [[y, r], ...] from the joint (y = 0) down the limb (y < 0); rounded ends; cross-section
// scaled by sx (outside-inside) and sz (front-back), shifted by off
function limbGeo(prof, sx = 1, sz = 1, off = [0, 0, 0]) {
  const p = prof.slice().sort((a, b) => a[0] - b[0]), pts = [];
  const [yb, rb] = p[0], [yt, rt] = p[p.length - 1];
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new T.Vector2(Math.max(1e-4, rb * Math.sin(a)), yb - rb * 0.75 * Math.cos(a))); }
  for (const [y, r] of p.slice(1, -1)) pts.push(new T.Vector2(r, y));
  for (let i = 6; i >= 0; i--) { const a = (i / 6) * Math.PI / 2; pts.push(new T.Vector2(Math.max(1e-4, rt * Math.sin(a)), yt + rt * 0.75 * Math.cos(a))); }
  const g = new T.LatheGeometry(pts, 32); g.scale(sx, 1, sz); g.translate(...off); g.computeVertexNormals(); return g;
}
const ellGeo = (c, r, rot) => { const g = new T.SphereGeometry(1, 32, 20); g.scale(...r); if (rot) g.rotateZ(rot[2] * D2R), g.rotateY(rot[1] * D2R), g.rotateX(rot[0] * D2R); g.translate(...c); return g; };
const ballGeo = (c, r) => ellGeo(c, [r, r, r]);
// muscles painted by where a vertex sits in its part (q = local position, n = a 0..1 radial direction)
const LIMB_R = (q, r) => [q[0] / r, q[2] / r];
const PARTS = [
  // trunk (centre bones). Thorax: wide at the armpits, tapering to the waist; front is +z
  ['chest', () => limbGeo([[-0.04, 0.13], [0.02, 0.146], [0.09, 0.166], [0.16, 0.176], [0.21, 0.168], [0.245, 0.125], [0.268, 0.06]], 1, 0.64, [0, 0, -0.004]),
    q => { const ax = Math.abs(q[0]) / 0.17, fz = q[2] / 0.11, y = q[1];
      return {chest: ss(0.15, 0.55, fz) * ss(0.03, 0.09, y) * (1 - ss(0.215, 0.245, y)) * (1 - ss(0.75, 0.95, ax)),
        lats: ss(0.1, -0.35, fz) * ss(0.4, 0.75, ax) * (1 - ss(0.13, 0.19, y)),
        upperback: ss(-0.25, -0.6, fz) * (1 - ss(0.4, 0.7, ax)) * ss(0.06, 0.12, y) * (1 - ss(0.22, 0.25, y)),
        traps: ss(0.205, 0.245, y) * ss(0.25, -0.2, fz), erectors: ss(-0.4, -0.75, fz) * (1 - ss(0.2, 0.4, ax)) * (1 - ss(0.04, 0.1, y))}; }],
  ['lumbar', () => limbGeo([[-0.02, 0.128], [0.06, 0.124], [0.12, 0.127], [0.19, 0.137]], 1, 0.74, [0, 0.0, 0.006]),
    q => { const ax = Math.abs(q[0]) / 0.13, fz = q[2] / 0.098;
      return {abs: ss(0.2, 0.6, fz) * (1 - ss(0.45, 0.7, ax)), obliques: ss(0.5, 0.8, ax) * ss(-0.5, 0.1, fz), erectors: ss(-0.3, -0.7, fz) * (1 - ss(0.3, 0.6, ax))}; }],
  ['pelvis', () => limbGeo([[-0.11, 0.095], [-0.07, 0.142], [-0.02, 0.152], [0.03, 0.146], [0.07, 0.132]], 1, 0.74, [0, 0, -0.012]),
    q => { const ax = Math.abs(q[0]) / 0.16, fz = q[2] / 0.11;
      return {glutes: ss(-0.15, -0.6, fz) * ss(0.05, 0.35, ax) * (1 - ss(0.03, 0.07, q[1])), abs: ss(0.4, 0.8, fz) * ss(-0.02, 0.04, q[1]) * (1 - ss(0.4, 0.6, ax))}; }],
  ['neck', () => limbGeo([[-0.03, 0.064], [0.04, 0.057], [0.12, 0.052]], 1, 0.95, [0, 0, 0.005]), q => ({traps: ss(0.0, -0.04, q[2]) * (1 - ss(0.02, 0.06, q[1]))})],
  // blank head: an egg, a touch narrower at the chin
  ['head', () => limbGeo([[-0.04, 0.052], [-0.005, 0.07], [0.045, 0.081], [0.09, 0.077], [0.118, 0.055]], 0.95, 1.15, [0, 0, 0.012]), null],
  // shoulder girdle: a sloped bar from the base of the neck to the shoulder (the traps' line)
  ['clav', () => { const a = [0.0, 0.035, -0.08], b = [0.15, -0.005, -0.095], d = V.sub(b, a), l = V.len(d), g = limbGeo([[-l, 0.032], [0, 0.046]], 1, 0.8);
    g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, -1, 0), new T.Vector3(...V.norm(d))))); g.translate(...a); return g; }, q => ({traps: 1})],
  // arm (left side shapes; the right uses the same in its mirrored frame)
  ['upper', () => limbGeo([[0.03, 0.058], [-0.03, 0.063], [-0.1, 0.054], [-0.17, 0.051], [-0.25, 0.042], [-0.3, 0.036]], 1, 1.04),
    q => { const [nx, nz] = LIMB_R(q, 0.058), cap = 1 - ss(0.07, 0.13, -q[1]), arm = 1 - cap;
      return {fdelt: cap * ss(0.1, 0.7, nz), sdelt: cap * ss(0.1, 0.7, nx), rdelt: cap * ss(0.1, 0.7, -nz), biceps: arm * ss(0.0, 0.55, nz) * (1 - ss(0.25, 0.3, -q[1])), triceps: arm * ss(0.0, 0.55, -nz)}; }],
  ['fore', () => limbGeo([[0.0, 0.04], [-0.05, 0.044], [-0.13, 0.036], [-0.2, 0.028], [-0.25, 0.025]], 0.84, 1, [0, 0, 0.002]), q => ({forearms: 1 - ss(0.18, 0.24, -q[1])})],
  ['hand', () => ellGeo([0, -0.048, 0.004], [0.016, 0.052, 0.04]), null],
  ['fing1', () => ellGeo([0, -0.024, 0.004], [0.012, 0.03, 0.036]), null],
  ['fing2', () => ellGeo([0, -0.02, 0.004], [0.011, 0.026, 0.033]), null],
  ['thumb', () => limbGeo([[-0.05, 0.009], [0, 0.012]], 1, 1), null],
  // leg
  ['thigh', () => limbGeo([[0.04, 0.076], [-0.04, 0.088], [-0.16, 0.081], [-0.3, 0.065], [-0.4, 0.051]], 1, 1.02, [0, 0, 0.004]),
    q => { const [nx, nz] = LIMB_R(q, 0.08), top = 1 - ss(0.0, 0.06, -q[1]);
      return {quads: ss(-0.2, 0.45, nz) * (1 - ss(0.36, 0.41, -q[1])), hams: ss(-0.1, -0.6, nz) * ss(0.04, 0.1, -q[1]), adductors: ss(0.25, 0.75, -nx) * ss(-0.3, 0.2, nz) * (1 - ss(0.25, 0.33, -q[1])), glutes: top * ss(-0.2, -0.6, nz)}; }],
  ['shin', () => limbGeo([[0.0, 0.051], [-0.07, 0.059], [-0.14, 0.055], [-0.28, 0.038], [-0.41, 0.028]], 1, 1, [0, 0, -0.008]),
    q => ({calves: ss(0.1, -0.45, q[2] / 0.05) * (1 - ss(0.26, 0.33, -q[1]))})],
  ['foot', () => ellGeo([0, -0.042, 0.055], [0.043, 0.032, 0.115]), null],
  ['toes', () => ellGeo([0, -0.012, 0.025], [0.042, 0.017, 0.038]), null]
];
// joints: [bone it rides on, local centre, radius]
const BALLS = [['upper', [0, 0, 0], 0.054], ['fore', [0, 0, 0], 0.036], ['hand', [0, 0.002, 0], 0.025], ['thigh', [0, 0, 0], 0.07], ['shin', [0, 0, 0], 0.05], ['foot', [0, 0, 0], 0.034]];
const SIDED = new Set(['clav', 'upper', 'fore', 'hand', 'fing1', 'fing2', 'thumb', 'thigh', 'shin', 'foot', 'toes']);
const MUS = ['chest', 'lats', 'upperback', 'traps', 'fdelt', 'sdelt', 'rdelt', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'erectors', 'glutes', 'quads', 'hams', 'adductors', 'calves'];

function frameMatrix(m, f) { m.set(f.x[0], f.y[0], f.z[0], f.o[0], f.x[1], f.y[1], f.z[1], f.o[1], f.x[2], f.y[2], f.z[2], f.o[2], 0, 0, 0, 1); }
let MANN_GEO = null;
function mannGeometries() {
  if (MANN_GEO) return MANN_GEO;
  MANN_GEO = PARTS.map(([bone, make, region]) => {
    const g = make(), n = g.attributes.position.count, pos = g.attributes.position.array, w = new Float32Array(n * MUS.length);
    if (region) for (let v = 0; v < n; v++) { const r = region([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]); for (const [m, x] of Object.entries(r)) { const i = MUS.indexOf(m); if (i >= 0 && x > 0) w[v * MUS.length + i] = x; } }
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3).fill(0), 3));
    return {bone, g, w};
  });
  MANN_GEO.balls = BALLS.map(([bone, c, r]) => ({bone, g: ballGeo(c, r)}));
  return MANN_GEO;
}
function buildMannequin() {
  const G = mannGeometries(), root = new T.Group(), groups = {}, meshes = [];
  const mat = new T.MeshStandardMaterial({color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0});
  const ballMat = new T.MeshStandardMaterial({color: new T.Color(...BASE.map(c => c * 0.9)), roughness: 0.6, metalness: 0});
  const grp = n => { if (!groups[n]) { const q = new T.Group(); q.matrixAutoUpdate = false; groups[n] = q; root.add(q); } return groups[n]; };
  for (const p of G) for (const s of SIDED.has(p.bone) ? ['L', 'R'] : ['']) {
    const g = p.g.clone(); const m = new T.Mesh(g, mat); grp(p.bone + s).add(m); meshes.push({m, w: p.w, g});
  }
  for (const b of G.balls) for (const s of ['L', 'R']) grp(b.bone + s).add(new T.Mesh(b.g, ballMat));
  const paint = levels => {
    const L = MUS.map(k => (levels && levels[k]) || 0);
    for (const {g, w} of meshes) {
      const col = g.attributes.color.array, n = col.length / 3;
      for (let v = 0; v < n; v++) {
        let lv = 0; for (let i = 0; i < MUS.length; i++) if (L[i]) lv = Math.max(lv, L[i] * w[v * MUS.length + i]);
        const on = ss(0.1, 0.3, lv), c = ramp2(lv);
        for (let k = 0; k < 3; k++) col[v * 3 + k] = BASE[k] + (c[k] - BASE[k]) * on;
      }
      g.attributes.color.needsUpdate = true;
    }
  };
  const M = new T.Matrix4();
  const pose = B => { for (const [n, q] of Object.entries(groups)) { const f = B[n]; if (!f) { q.visible = false; continue; } q.visible = true; frameMatrix(M, f); q.matrix.copy(M); q.matrixWorldNeedsUpdate = true; } };
  return {root, groups, paint, pose, dispose() { mat.dispose(); ballMat.dispose(); for (const {g} of meshes) g.dispose(); }};
}

/* ---------- equipment ---------- */
const MATS = {pad: [0x2b2d33, 0.85, 0.02], steel: [0xa9adb5, 0.35, 0.6], iron: [0x26272b, 0.6, 0.3], cable: [0x9a9ca3, 0.5, 0.3], floor: [0x1b1c20, 0.95, 0]};
function roundBoxGeo(w, h, d, r) {
  const g = new T.BoxGeometry(w, h, d, 6, 6, 6), p = g.attributes.position, hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), cx = Math.max(-hw, Math.min(hw, x)), cy = Math.max(-hh, Math.min(hh, y)), cz = Math.max(-hd, Math.min(hd, z)); const dx = x - cx, dy = y - cy, dz = z - cz, l = Math.hypot(dx, dy, dz) || 1; p.setXYZ(i, cx + dx / l * r, cy + dy / l * r, cz + dz / l * r); }
  g.computeVertexNormals(); return g;
}
function tubeGeo(a, b, r, caps) {
  const d = V.sub(b, a), l = V.len(d), g = new T.CylinderGeometry(r, r, l, 18, 1, false);
  g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...V.norm(d)))));
  g.translate(...V.lerp(a, b, 0.5)); return g;
}
// one equipment shape → mesh. Shape: [frame, type, ...] with B = rounded box (centre, half sizes, round, {rot}),
// Y = tube (a, b, r), Q = disc or short cylinder (a, b, r), E = ellipsoid (centre, radii, {rot})
function shapeMesh(s, mats) {
  const t = s[1], o = (typeof s[s.length - 1] === 'object' && !Array.isArray(s[s.length - 1])) ? s[s.length - 1] : {}, mat = mats[o.mat || 'pad'];
  let g;
  if (t === 'B') { g = roundBoxGeo(s[3][0] * 2, s[3][1] * 2, s[3][2] * 2, Math.min(s[4] || 0.01, Math.min(...s[3]) * 0.95)); if (o.rot) g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(o.rot[0] * D2R, o.rot[1] * D2R, o.rot[2] * D2R, 'ZYX'))); g.translate(...s[2]); }
  else if (t === 'Y' || t === 'Q') g = tubeGeo(s[2], s[3], s[4]);
  else if (t === 'E') { g = ellGeo([0, 0, 0], s[3], null); if (o.rot) g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(o.rot[0] * D2R, o.rot[1] * D2R, o.rot[2] * D2R, 'ZYX'))); g.translate(...s[2]); }
  else return null;
  return new T.Mesh(g, mat);
}

/* ---------- the lift view ---------- */
function liftScene(ex, man) {
  const mats = {}; for (const [k, [c, r, m]] of Object.entries(MATS)) mats[k] = new T.MeshStandardMaterial({color: c, roughness: r, metalness: m});
  const g = new T.Group(), frames = {}, segMeshes = [];
  for (const s of (ex.props || [])) {
    const m = shapeMesh(s, mats); if (!m) continue;
    const fr = s[0];
    if (fr === 'world') g.add(m);
    else if (man.groups[fr]) man.groups[fr].add(m);
    else { if (!frames[fr]) { const q = new T.Group(); q.matrixAutoUpdate = false; frames[fr] = q; g.add(q); } frames[fr].add(m); }
  }
  return {g, frames, segMeshes, mats, dispose() { g.traverse(o => o.geometry && o.geometry.dispose()); for (const m of Object.values(mats)) m.dispose(); }};
}
function liftView(host0, opt = {}) {
  let host = host0, renderer;
  try { renderer = new T.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: !!opt.still}); } catch (e) { host.innerHTML = '<div class="empty">3D needs WebGL, which this browser has turned off.</div>'; return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
  const wrap = document.createElement('div'); wrap.className = 'f3d';
  const el = renderer.domElement; el.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab'; wrap.append(el);
  const scene = new T.Scene(); lights(scene);
  const shadow = new T.Mesh(new T.PlaneGeometry(2.2, 1.6), new T.MeshBasicMaterial({map: shadowTex(), transparent: true, depthWrite: false})); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.001; scene.add(shadow);
  // the physique's own body (skin.js); the jointed mannequin only if the body can't be built
  let man; try { man = buildSkinned(opt.comp || null); } catch (e) { console.error(e); man = buildMannequin(); }
  scene.add(man.root);
  const cam = new T.PerspectiveCamera(27, 1, 0.05, 50), M = new T.Matrix4();
  const st = {playing: !opt.still && !window.__F3D_STATIC};
  let key = 'stand', ex = EX.stand, eq = null, t = opt.t ?? 0.4, lastT = null, yaw = 30, pitch = 10, dist = 3.6, target = [0, 0.95, 0], userAz = 0, userEl = 0, dragging = null, zoom = 1;
  const setMove = k => {
    key = EX[k] ? k : 'stand'; ex = EX[key];
    if (eq) { scene.remove(eq.g); eq.dispose(); }
    // equipment attached to the body's parts was added to the part groups: rebuild the mannequin's extras
    for (const q of Object.values(man.groups)) for (const c of [...q.children]) if (c.userData.eq) q.remove(c);
    eq = liftScene(ex, man); scene.add(eq.g);
    for (const q of Object.values(man.groups)) for (const c of q.children) if (!c.userData.body) c.userData.eq = true;
    man.paint(ex.muscles || {});
    const c = ex.cam || {yaw: 30, pitch: 10, dist: 3.9, target: [0, 0.95, 0]};
    yaw = c.yaw; pitch = c.pitch; dist = c.dist; target = c.target; userAz = 0; userEl = 0; zoom = 1; t = opt.t ?? 0.4;
    st.dirty = true;
  };
  for (const q of Object.values(man.groups)) for (const c of q.children) c.userData.body = true;
  const pose = () => {
    const r = ex.pose ? ex.pose(t) : {pose: {}};
    if (man.flex) { const k = ex.tempo ? phaseK(t, ex.tempo) : 0; man.flex(ex.flexInv ? 1 - k : k); }
    const B = solve(r.pose); man.pose(B);
    for (const [n, q] of Object.entries(eq.frames)) { const f = r.frames && r.frames[n]; q.visible = !!f; if (f) { frameMatrix(M, f); q.matrix.copy(M); q.matrixWorldNeedsUpdate = true; } }
    const segs = r.segs || [];
    while (eq.segMeshes.length < segs.length) { const m = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 10), eq.mats.cable); eq.g.add(m); eq.segMeshes.push(m); }
    eq.segMeshes.forEach((m, i) => { const s = segs[i]; m.visible = !!s; if (!s) return; const d = V.sub(s[1], s[0]), l = V.len(d) || 1e-4; m.position.set(...V.lerp(s[0], s[1], 0.5)); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...V.norm(d))); m.scale.set(s[2] || 0.006, l, s[2] || 0.006); });
  };
  setMove(opt.move || 'stand');
  const size = () => { const w = Math.max(40, host.clientWidth), h = Math.max(40, host.clientHeight); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); st.dirty = true; };
  host.replaceChildren(wrap); size();
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro && ro.observe(host);
  const attach = h => { if (h === host && wrap.parentNode === h) return; ro && ro.unobserve(host); host = h; host.replaceChildren(wrap); ro && ro.observe(host); size(); };
  // Front = facing him, Side = his left, Back = behind; play/pause stops the rep where it is
  /* Speed (14 Nov 2026, Sam asked for a slider): 0.25× to 1.5×, one setting for every exercise, remembered on
     this device. Slow is for studying a rep; the tempo each demo is authored at is 1×. */
  let speed = 1; try { speed = Math.max(0.25, Math.min(1.5, +localStorage.getItem('hf.liftSpeed') || 1)); } catch {}
  if (!opt.still) {
    const sp = document.createElement('label'); sp.className = 'f3d-speed'; sp.title = 'Playback speed';
    sp.innerHTML = `<input type="range" min="0.25" max="1.5" step="0.25" value="${speed}" aria-label="Playback speed"><span>${speed}×</span>`;
    const inp = sp.querySelector('input'); for (const ev of ['pointerdown', 'wheel', 'click', 'dblclick']) sp.addEventListener(ev, e => e.stopPropagation());
    inp.oninput = () => { speed = +inp.value; sp.querySelector('span').textContent = speed + '×'; try { localStorage.setItem('hf.liftSpeed', String(speed)); } catch {} kick(); };
    wrap.append(sp);
  }
  const ctl = opt.still ? null : controls(wrap, st, a => { yaw = a; userAz = 0; userEl = 0; st.playing = true; st.dirty = true; }, [[0, 'Front'], [90, 'Side'], [180, 'Back']]);
  if (ctl) { const pb = wrap.querySelector('[data-f=play]'); pb.addEventListener('click', () => { st.dirty = true; }); }
  /* Drag turns the camera round the figure; the wheel, or a pinch, zooms (14 Nov 2026, Sam: scrolling over the
     figure should zoom it, scrolling over the chart changes its range). Stopping the wheel here keeps the
     dashboard from zooming or the widget from changing range underneath. */
  const pts = new Map(), pinchD = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const setZoom = z => { zoom = Math.max(0.35, Math.min(1.8, z)); st.dirty = true; kick(); };
  el.addEventListener('pointerdown', e => { e.stopPropagation(); pts.set(e.pointerId, {x: e.clientX, y: e.clientY}); el.setPointerCapture(e.pointerId);
    if (pts.size === 2) { dragging = {pinch: pinchD(), z: zoom}; return; }
    dragging = {x: e.clientX, y: e.clientY, a: userAz, e: userEl}; el.style.cursor = 'grabbing'; });
  el.addEventListener('pointermove', e => { if (!dragging) return; if (pts.has(e.pointerId)) pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (dragging.pinch) { if (pts.size === 2) setZoom(dragging.z * dragging.pinch / pinchD()); return; }
    userAz = dragging.a - (e.clientX - dragging.x) * 0.5; userEl = Math.max(-20, Math.min(60, dragging.e + (e.clientY - dragging.y) * 0.3)); st.dirty = true; kick(); });
  const up = e => { pts.delete(e.pointerId); dragging = null; el.style.cursor = 'grab'; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); setZoom(zoom * Math.exp((e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY) * 0.0015)); }, {passive: false});
  el.addEventListener('dblclick', e => { e.stopPropagation(); zoom = 1; userAz = 0; userEl = 0; st.dirty = true; kick(); });
  const v = {
    el: wrap,
    frame(now, force) {
      const dt = lastT == null ? 0 : Math.min(0.1, (now - lastT) / 1000); lastT = now;
      if (!force) { if (!wrap.isConnected) return; const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth || r.width < 2) return; }
      if (st.playing && ex.pose) t += dt * speed;
      else if (!force && !st.dirty) return;
      st.dirty = false;
      pose();
      // demos are framed for a square view; a tall, narrow widget pulls the camera back so nothing is cut off
      const a = (yaw + userAz) * D2R, e = (pitch + userEl) * D2R, dd = dist * zoom * Math.max(1, 1.08 / cam.aspect);
      cam.position.set(target[0] + Math.sin(a) * Math.cos(e) * dd, target[1] + Math.sin(e) * dd, target[2] + Math.cos(a) * Math.cos(e) * dd); cam.lookAt(...target);
      renderer.render(scene, cam);
    },
    setMove(k) { setMove(k); kick(); }, attach,
    setT(x) { t = x; st.dirty = true; }, setView(a, e) { userAz = a || 0; userEl = e || 0; st.dirty = true; },
    setAngle(a) { yaw = a; userAz = 0; userEl = 0; st.dirty = true; kick(); },
    get move() { return key; },
    snapshot() { v.frame(performance.now(), true); return el.toDataURL('image/png'); },
    dispose() { views.delete(v); ro && ro.disconnect(); if (eq) eq.dispose(); man.dispose(); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); wrap.remove(); }
  };
  if (!opt.still) { views.add(v); kick(); }
  return v;
}
function liftSnapshot(opt, w, h) {
  const box = document.createElement('div'); box.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px`; document.body.append(box);
  const v = liftView(box, {...opt, still: true}); if (!v) { box.remove(); return null; }
  const url = v.snapshot(); v.dispose(); box.remove(); return url;
}
