/* ---------- VIEW: three.js scene, materials, skinning, props ---------- */
const SRC3 = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
let T = null, loading = null;
const load3 = () => new Promise((res, rej) => {
  if (window.THREE) { T = window.THREE; res(T); return; }
  const s = document.createElement('script'); s.src = SRC3; s.async = true;
  s.onload = () => { T = window.THREE; T ? res(T) : rej(new Error('3D library missing')); };
  s.onerror = () => { loading = null; rej(new Error('The 3D library didn’t load')); };
  document.head.append(s);
});
const load = () => loading || (loading = Promise.all([load3(), loadBody()]).then(([t]) => t, e => { loading = null; throw e; }));
const meshCache = new Map();
const compKey = c => (c ? [c.lean, c.fat].map(v => (Math.round(v * 2) / 2).toFixed(1)).join('/') : 'base');
const bodyData = c => { const k = compKey(c); if (!meshCache.has(k)) { if (meshCache.size > 6) meshCache.delete(meshCache.keys().next().value); meshCache.set(k, buildMesh(c)); } return meshCache.get(k); };

/* v9: a matte white mannequin (Sam's reference) in plain dark shorts; a soft neutral rim keeps the
   silhouette readable against the dark widget. */
const SKIN = [0.87, 0.87, 0.885], SHORTS = [0.13, 0.135, 0.15];
function bodyMaterial(skinned, dim) {
  const m = new T.MeshStandardMaterial({color: 0xffffff, vertexColors: true, roughness: 0.66, metalness: 0, skinning: skinned});
  m.onBeforeCompile = sh => {
    sh.uniforms.rimColor = {value: new T.Color(0x9ea6b8)}; sh.uniforms.rimK = {value: dim ? 0.18 : 0.28};
    sh.uniforms.shortsCol = {value: new T.Color(...SHORTS)};
    sh.vertexShader = 'attribute float ry;\nattribute float sm;\nvarying float vRy;\nvarying float vSm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRy = ry; vSm = sm;');
    sh.fragmentShader = 'uniform vec3 rimColor;\nuniform float rimK;\nuniform vec3 shortsCol;\nvarying float vRy;\nvarying float vSm;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // shorts: hem and waistband cut per pixel from the rest-pose height, so the edges are clean
  float sht = step(0.5, vSm) * smoothstep(0.612, 0.618, vRy) * (1.0 - smoothstep(0.978, 0.984, vRy));
  diffuseColor.rgb = mix(diffuseColor.rgb, shortsCol, sht);
  float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += rimColor * fres * rimK * (1.0 - 0.7 * sht);`);
  };
  m.customProgramCacheKey = () => 'hfmq2' + (skinned ? 's' : '') + (dim ? 'd' : '');
  return m;
}
/* Strength colours: each muscle tinted by how its lifts compare with other men at the same bodyweight,
   light blue (Beginner) to deep blue (Elite); untested muscles stay white. Score 0..5, 1 = Beginner. */
// steps spaced so neighbouring levels stay distinguishable on a lit, curved surface at widget size
const LEVEL_HEX = ['#d9e6f7', '#9fc4f0', '#4a8ce0', '#1d58bd', '#0d2c6e'];
const lin = h => [1, 3, 5].map(i => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2));
const LEVEL_LIN = LEVEL_HEX.map(lin);
function levelColour(sc) {
  if (sc == null) return SKIN;
  if (sc <= 1) return SKIN.map((c, k) => c + (LEVEL_LIN[0][k] - c) * Math.max(0, sc));
  const i = Math.min(3, Math.floor(sc - 1)), t = Math.min(1, sc - 1 - i);
  return LEVEL_LIN[i].map((c, k) => c + (LEVEL_LIN[i + 1][k] - c) * t);
}
/* Definition: valleys between muscles (where a vertex sits below its neighbours) are shaded, more so the
   leaner the body, so the goal reads as more defined than today, as it would. */
function paintBody(g, d, levels, dim) {
  const nv = d.pos.length / 3, n = MUSCLES.length, col = g.attributes.color.array;
  const ids = levels ? MUSCLES.map((m, i) => levels[m] != null ? i : -1).filter(i => i >= 0) : [], pal = MUSCLES.map(m => levels && levels[m] != null ? levelColour(levels[m]) : null);
  const bf = d.comp?.bf ?? 15, def = Math.max(0.15, Math.min(1, (19 - bf) / 8)), cav = d.cav;
  for (let v = 0; v < nv; v++) {
    let r = 0, gg = 0, b = 0, W = 0;
    for (const i of ids) { const w = d.muscleW[v * n + i]; if (w <= 0.01) continue; const c = pal[i]; r += w * c[0]; gg += w * c[1]; b += w * c[2]; W += w; }
    if (W > 1) { r /= W; gg /= W; b /= W; W = 1; }
    const sh = d.shorts[v], k = (1 - sh) * W, base = SKIN;
    let c0 = base[0] * (1 - k) + (W ? r / W : 0) * k, c1 = base[1] * (1 - k) + (W ? gg / W : 0) * k, c2 = base[2] * (1 - k) + (W ? b / W : 0) * k;
    const g0 = cav ? Math.min(1, Math.max(0, (cav[v] - 0.00001) / 0.00011)) : 0, shade = 1 - 0.42 * def * g0 * g0 * (3 - 2 * g0);   // grooves are 0.05–0.4 mm deep on this mesh
    const dm = dim ? 0.72 : 1;
    col[v * 3] = c0 * shade * dm; col[v * 3 + 1] = c1 * shade * dm; col[v * 3 + 2] = c2 * shade * dm;
  }
  g.attributes.color.needsUpdate = true;
}
function bodyGeometry(d, skinned) {
  const g = new T.BufferGeometry(), nv = d.pos.length / 3;
  g.setAttribute('position', new T.BufferAttribute(d.pos.slice(), 3));
  g.setIndex(new T.BufferAttribute(d.idx, 1));
  g.computeVertexNormals(); smoothNormals(g.attributes.normal.array, ATL.adj, 3);
  const col = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) col[v * 3 + k] = SKIN[k];
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  g.setAttribute('ry', new T.BufferAttribute(d.restY, 1)); g.setAttribute('sm', new T.BufferAttribute(d.shortsMask, 1));
  g.setAttribute('hl', new T.BufferAttribute(new Float32Array(nv), 1));
  g.setAttribute('fib', new T.BufferAttribute(d.fib, 1));
  if (skinned) { g.setAttribute('skinIndex', new T.Uint16BufferAttribute(d.skinIndex, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(d.skinWeight, 4)); }
  return g;
}
/* Skinning: each bone's matrix maps its rest frame onto its posed frame. The shoulder bone takes half
   of the chest's rotation and half of the upper arm's, which keeps the deltoid from collapsing overhead. */
const m3 = F => [F.x, F.y, F.z];
function rotD(Fp, Fr) { const a = m3(Fp), b = m3(Fr), R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] = a[0][i] * b[0][j] + a[1][i] * b[1][j] + a[2][i] * b[2][j]; return R; }
function makeSkeleton(d) {
  const bones = d.bones.map(() => { const b = new T.Bone(); b.matrixAutoUpdate = false; return b; });
  const inv = d.bones.map(n => { const F = n.startsWith('cl') ? d.rest['ua' + n.slice(2)] : d.rest[n]; return new T.Matrix4().makeTranslation(-F.o[0], -F.o[1], -F.o[2]); });
  return {bones, sk: new T.Skeleton(bones, inv)};
}
const qa = () => new T.Quaternion(), mtx = () => new T.Matrix4();
function poseSkeleton(rig, d, J) {
  const B = frames(J), q1 = qa(), q2 = qa(), M = mtx();
  d.bones.forEach((n, i) => {
    const bone = rig.bones[i];
    let R, o;
    if (n.startsWith('cl')) {
      const s = n.slice(2), Rc = rotD(B.chest, d.rest.chest), Ru = rotD(B['ua' + s], d.rest['ua' + s]);
      M.set(Rc[0][0], Rc[0][1], Rc[0][2], 0, Rc[1][0], Rc[1][1], Rc[1][2], 0, Rc[2][0], Rc[2][1], Rc[2][2], 0, 0, 0, 0, 1); q1.setFromRotationMatrix(M);
      M.set(Ru[0][0], Ru[0][1], Ru[0][2], 0, Ru[1][0], Ru[1][1], Ru[1][2], 0, Ru[2][0], Ru[2][1], Ru[2][2], 0, 0, 0, 0, 1); q2.setFromRotationMatrix(M);
      q1.slerp(q2, 0.55); bone.matrix.makeRotationFromQuaternion(q1); o = B['ua' + s].o;
    } else { R = rotD(B[n], d.rest[n]); o = B[n].o; bone.matrix.set(R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, 0, 0, 0, 1); }
    bone.matrix.setPosition(o[0], o[1], o[2]); bone.matrixWorldNeedsUpdate = true;
  });
}
function shadowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(c);
}
function lights(scene, strong) {
  scene.add(new T.HemisphereLight(0xdfe6ff, 0x1c1d22, strong ? 0.34 : 0.52));
  const key = new T.DirectionalLight(0xffffff, strong ? 1.35 : 1.0); key.position.set(1.8, 3.4, 2.4); scene.add(key);
  const fill = new T.DirectionalLight(0xbcc9ff, 0.26); fill.position.set(-2.8, 1.2, 1.0); scene.add(fill);
  const back = new T.DirectionalLight(0xffffff, 0.6); back.position.set(-0.6, 2.6, -3.2); scene.add(back);
}

/* ---------- views ---------- */
const views = new Set(); let raf = 0;
const ease = x => x * x * x * (x * (x * 6 - 15) + 10);
function tick(now) { raf = 0; if (document.hidden) return; for (const v of views) v.frame(now); if (views.size) raf = requestAnimationFrame(tick); }
const kick = () => { if (!raf && views.size) raf = requestAnimationFrame(tick); };
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', kick);

/* Physique view. opt: {comp, compare (a second body, side by side), spin, still}.
   Controls (v9): pause or play the turn, Front / Side / Back, and drag to look from any angle. */
function buildScene() {
  const scene = new T.Scene(); lights(scene, true);
  const sh = new T.Mesh(new T.PlaneGeometry(1.9, 1.3), new T.MeshBasicMaterial({map: shadowTex(), transparent: true, depthWrite: false})); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.001; scene.add(sh);
  return {scene, shadow: sh};
}
const ICON = {play: '<path d="M5 3.5v9l7-4.5z"/>', pause: '<path d="M5 3.5v9M11 3.5v9"/>'};
// the control strip shared by both views: play/pause plus fixed angles (degrees the camera sits at)
function controls(wrap, st, onAngle, labels) {
  const c = document.createElement('div'); c.className = 'f3d-ctl';
  c.innerHTML = `<button data-f="play"></button>${labels.map(([a, l]) => `<button data-f="${a}">${l}</button>`).join('')}`;
  const pb = c.querySelector('[data-f=play]');
  const sync = () => { pb.innerHTML = `<svg viewBox="0 0 16 16">${st.playing ? ICON.pause : ICON.play}</svg>`; pb.title = st.playing ? 'Pause' : 'Play'; pb.setAttribute('aria-label', pb.title); };
  c.addEventListener('pointerdown', e => e.stopPropagation());
  c.onclick = e => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); if (b.dataset.f === 'play') st.playing = !st.playing; else { st.playing = false; onAngle(+b.dataset.f); } sync(); kick(); };
  sync(); wrap.append(c); return {sync};
}
function view(host0, opt = {}) {
  let host = host0, renderer;
  try { renderer = new T.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: !!opt.still}); } catch (e) { host.innerHTML = '<div class="empty">3D needs WebGL, which this browser has turned off.</div>'; return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding;
  const wrap = document.createElement('div'); wrap.className = 'f3d';
  const el = renderer.domElement; el.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab'; wrap.append(el);
  const {scene} = buildScene(), cam = new T.PerspectiveCamera(27, 1, 0.05, 50);
  let figs = [], comp = opt.comp || null, cmp = opt.compare || null, levels = opt.levels || null;
  const st = {playing: opt.spin !== false && !opt.still && !window.__F3D_STATIC};
  let az = 20, el2 = 4, dist = 4.3, ty = 0.88, spinA = 0, lastT = null, userAz = 0, userEl = 0, dragging = null;
  const clear = () => { for (const f of figs) { scene.remove(f.mesh); f.mesh.geometry.dispose(); } figs = []; };
  const addFig = (c, x, dim) => {
    const d = bodyData(c), geo = bodyGeometry(d, true), mat = bodyMaterial(true, dim), rig = makeSkeleton(d), mesh = new T.SkinnedMesh(geo, mat);
    rig.bones.forEach(b => mesh.add(b)); mesh.bind(rig.sk, new T.Matrix4()); mesh.frustumCulled = false; mesh.position.x = x;
    poseSkeleton(rig, d, solve(standPose()));
    figs.push({mesh, d, rig, geo, dim});
    paintBody(geo, d, levels, dim);
    scene.add(mesh);
  };
  const rebuild = () => { clear(); if (cmp) { addFig(cmp, -0.5, true); addFig(comp, 0.5, false); dist = 5.6; } else { addFig(comp, 0, false); dist = 3.95; } };
  rebuild();
  const size = () => { const w = Math.max(40, host.clientWidth), h = Math.max(40, host.clientHeight); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  host.replaceChildren(wrap); size();
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro && ro.observe(host);
  const attach = h => { if (h === host && wrap.parentNode === h) return; ro && ro.unobserve(host); host = h; host.replaceChildren(wrap); ro && ro.observe(host); size(); };
  // Front = facing you, Side = his left side, Back = from behind
  const ctl = opt.still ? null : controls(wrap, st, a => { az = a; userAz = 0; userEl = 0; spinA = 0; v._dirty = true; }, [[0, 'Front'], [90, 'Side'], [180, 'Back']]);
  el.addEventListener('pointerdown', e => { e.stopPropagation(); dragging = {x: e.clientX, y: e.clientY, a: userAz, e: userEl}; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; });
  el.addEventListener('pointermove', e => { if (!dragging) return; userAz = dragging.a - (e.clientX - dragging.x) * 0.5; userEl = Math.max(-15, Math.min(45, dragging.e + (e.clientY - dragging.y) * 0.3)); kick(); });
  const up = () => { dragging = null; el.style.cursor = 'grab'; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  let drawn = false;
  const v = {
    el: wrap,
    frame(now, force) {
      const dt = lastT == null ? 0 : Math.min(0.1, (now - lastT) / 1000); lastT = now;
      if (!force) { if (!wrap.isConnected) return; const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth || r.width < 2) return; }
      if (st.playing && !dragging) spinA += dt * 12;
      else if (!force && drawn && !dragging && !v._dirty) return;   // paused and nothing changed: don't redraw
      v._dirty = false; drawn = true;
      const a = (az + userAz + spinA) * D2R, e = (el2 + userEl) * D2R;
      cam.position.set(Math.sin(a) * Math.cos(e) * dist, ty + Math.sin(e) * dist, Math.cos(a) * Math.cos(e) * dist); cam.lookAt(0, ty, 0);
      renderer.render(scene, cam);
    },
    setComp(c, g, L) { comp = c; cmp = g || null; if (L !== undefined) levels = L; rebuild(); v._dirty = true; kick(); },
    setLevels(L) { levels = L; for (const f of figs) paintBody(f.geo, f.d, levels, f.dim); v._dirty = true; kick(); },
    attach, setView(a, e) { userAz = a || 0; userEl = e || 0; v._dirty = true; },
    setAngle(a) { st.playing = false; az = a; userAz = 0; userEl = 0; spinA = 0; ctl && ctl.sync(); v._dirty = true; kick(); },
    get playing() { return st.playing; },
    snapshot() { v.frame(performance.now(), true); return el.toDataURL('image/png'); },
    dispose() { views.delete(v); ro && ro.disconnect(); clear(); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); wrap.remove(); }
  };
  if (!opt.still) { views.add(v); kick(); }
  return v;
}
/* One still frame (for the widget palette), without keeping a WebGL context alive. */
function snapshot(opt, w, h) {
  const box = document.createElement('div'); box.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px`; document.body.append(box);
  const v = view(box, {...opt, still: true}); if (!v) { box.remove(); return null; }
  const url = v.snapshot(); v.dispose(); box.remove(); return url;
}
function lerpPose(A, B, k) {
  if (!B || k <= 0) return A; if (k >= 1) return B;
  const L = (a, b) => Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * k) : {t: a.t.map((v, i) => v + (b.t[i] - v) * k)};
  const same = (a, b) => Array.isArray(a) === Array.isArray(b);
  const o = {p: L(A.p, B.p), pitch: (A.pitch || 0) + ((B.pitch || 0) - (A.pitch || 0)) * k, bend: (A.bend || 0) + ((B.bend || 0) - (A.bend || 0)) * k, head: (A.head || 0) + ((B.head || 0) - (A.head || 0)) * k};
  for (const key of ['hands', 'ep', 'feet', 'kp', 'toe']) if (A[key]) o[key] = A[key].map((v, i) => B[key] && same(v, B[key][i]) ? L(v, B[key][i]) : v);
  for (const key of ['pron', 'curl']) if (A[key]) o[key] = A[key].map((v, i) => B[key] ? v + (B[key][i] - v) * k : v);
  return o;
}
