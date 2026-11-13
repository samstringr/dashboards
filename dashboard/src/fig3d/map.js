/* ---------- MAP: the flat front-and-back muscle chart (Muscle development widget) ----------
   WHY 2D (13 Nov 2026): Sam wanted a front-and-back chart like the strength apps' muscle maps (Symmetric
   Strength's strength-by-muscle diagram, Fitbod's body map), both sides visible at once instead of a turning
   figure, each muscle filled by its level. It is drawn from the same body as the 3D physique, flat-on through an
   orthographic camera, so the outline is his and it changes with lean and fat mass between now, 4 weeks and the
   goal. Two renders per side: muscle ids (one flat colour per triangle, for outlines and tapping) and soft
   shading; the chart itself is composed per pixel on a 2D canvas, so the fills are exact level colours. */
let MAPR = null;
function mapRenderer() {
  if (MAPR) return MAPR;
  MAPR = new T.WebGLRenderer({antialias: false, alpha: true, preserveDrawingBuffer: true});
  MAPR.setPixelRatio(1); MAPR.outputEncoding = T.LinearEncoding;
  return MAPR;
}
/* The standing photo pose, skinned once on the CPU, then split into flat triangles labelled by muscle. */
function mapGeometry(d) {
  if (d._map) return d._map;
  const geo = bodyGeometry(d, true), mesh = new T.SkinnedMesh(geo, new T.MeshBasicMaterial()), rig = makeSkeleton(d);
  rig.bones.forEach(b => mesh.add(b)); mesh.bind(rig.sk, new T.Matrix4());
  poseSkeleton(rig, d, solve(standPose())); mesh.updateMatrixWorld(true); rig.sk.update();
  const nv = d.pos.length / 3, n = MUSCLES.length, P = new Float32Array(nv * 3), v3 = new T.Vector3();
  for (let v = 0; v < nv; v++) { v3.fromBufferAttribute(geo.attributes.position, v); mesh.boneTransform(v, v3); P[v * 3] = v3.x; P[v * 3 + 1] = v3.y; P[v * 3 + 2] = v3.z; }
  const lab = new Int8Array(nv);
  for (let v = 0; v < nv; v++) { let b = -1, bw = 0.5; for (let i = 0; i < n; i++) { const w = d.muscleW[v * n + i]; if (w > bw) { bw = w; b = i; } } lab[v] = b; }
  const I = d.idx, nt = I.length / 3, pos = new Float32Array(nt * 9), id = new Float32Array(nt * 9);
  const tmp = new T.BufferGeometry(); tmp.setAttribute('position', new T.BufferAttribute(P, 3)); tmp.setIndex(new T.BufferAttribute(I, 1)); tmp.computeVertexNormals();
  const N = tmp.attributes.normal.array, nrm = new Float32Array(nt * 9);
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2], la = lab[a], lb = lab[b], lc = lab[c];
    const L = la === lb || la === lc ? la : lb === lc ? lb : la, code = (L + 2) / 255;   // 1 = not a muscle, 2.. = muscle index + 2
    [a, b, c].forEach((v, k) => { for (let q = 0; q < 3; q++) { pos[t * 9 + k * 3 + q] = P[v * 3 + q]; nrm[t * 9 + k * 3 + q] = N[v * 3 + q]; } id[t * 9 + k * 3] = code; id[t * 9 + k * 3 + 1] = 1; });
  }
  for (let v = 0; v < nv; v++) { x0 = Math.min(x0, P[v * 3]); x1 = Math.max(x1, P[v * 3]); y0 = Math.min(y0, P[v * 3 + 1]); y1 = Math.max(y1, P[v * 3 + 1]); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nrm, 3)); g.setAttribute('color', new T.BufferAttribute(id, 3));
  geo.dispose(); tmp.dispose();
  return (d._map = {g, box: [x0, x1, y0, y1]});
}
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const MAP_UNTESTED = [238, 240, 243], MAP_SKIN = [196, 200, 209], MAP_LINE = [28, 30, 38];
function mapColour(sc) {
  if (sc == null) return MAP_UNTESTED;
  const H = LEVEL_HEX.map(hexRGB);
  if (sc <= 1) return MAP_UNTESTED.map((c, k) => c + (H[0][k] - c) * Math.max(0, sc));
  const i = Math.min(3, Math.floor(sc - 1)), t = Math.min(1, sc - 1 - i);
  return H[i].map((c, k) => c + (H[i + 1][k] - c) * t);
}
/* Borders follow triangle edges, so they zig-zag. A mode filter (each body pixel takes the most common label
   within r pixels) rounds them off without moving the silhouette. */
function smoothIds(ids, W, H, r) {
  const src = ids.slice(), cnt = new Int16Array(24);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x; if (src[p] === -2) continue;
    cnt.fill(0); let best = src[p], bc = 0;
    for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) {
      const q = src[yy * W + xx]; if (q === -2) continue; const c = ++cnt[q + 2]; if (c > bc) { bc = c; best = q; }
    }
    ids[p] = best;
  }
}
/* opt: {comp, levels, w, h} (CSS pixels per side; drawn at 2×). Returns {front, back}, each {canvas, ids, w, h},
   ids holding a muscle index per pixel (-1 skin, -2 background) for tapping. */
function mapViews(opt) {
  const d = bodyData(opt.comp), M = mapGeometry(d), r = mapRenderer(), dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const W = Math.round(opt.w * dpr), H = Math.round(opt.h * dpr); r.setSize(W, H, false);
  const [x0, x1, y0, y1] = M.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, bh = (y1 - y0) * 1.04, bw = (x1 - x0) * 1.06;
  const half = Math.max(bh / 2, bw / 2 * H / W), cam = new T.OrthographicCamera(-half * W / H, half * W / H, half, -half, 0.1, 20);
  const idMat = new T.MeshBasicMaterial({vertexColors: true}), shMat = new T.MeshLambertMaterial({color: 0xffffff});
  const scene = new T.Scene(), mesh = new T.Mesh(M.g, idMat); scene.add(mesh);
  const amb = new T.AmbientLight(0xffffff, 0.45), key = new T.DirectionalLight(0xffffff, 0.75); scene.add(amb, key);
  const out = {};
  for (const [side, z] of [['front', 1], ['back', -1]]) {
    cam.position.set(cx, cy, 5 * z); cam.lookAt(cx, cy, 0); key.position.set(0.8 * z, 2.5, 3 * z);
    const grab = mat => { mesh.material = mat; r.setClearColor(0x000000, 0); r.render(scene, cam); const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(r.domElement, 0, 0); return x.getImageData(0, 0, W, H).data; };
    const idp = grab(idMat), shp = grab(shMat);
    const ids = new Int8Array(W * H);
    for (let p = 0; p < W * H; p++) ids[p] = idp[p * 4 + 3] < 128 ? -2 : Math.round(idp[p * 4]) - 2;
    smoothIds(ids, W, H, Math.round(2.5 * dpr));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx2 = cv.getContext('2d'), img = cx2.createImageData(W, H), o = img.data;
    const pal = MUSCLES.map(m => mapColour(opt.levels && opt.levels[m] != null ? opt.levels[m] : null));
    const lw = Math.max(1, Math.round(dpr * 0.75));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x, id = ids[p]; if (id === -2) continue;
      let edge = 0;
      for (let k = 1; k <= lw && !edge; k++) for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) { const xx = x + dx, yy = y + dy; const q = xx < 0 || yy < 0 || xx >= W || yy >= H ? -2 : ids[yy * W + xx]; if (q !== id) { edge = q === -2 ? 2 : Math.max(edge, 1); } }
      const base = id >= 0 ? pal[id] : MAP_SKIN, lum = shp[p * 4] / 255, s = 0.8 + 0.2 * lum;
      let c = base.map(v => v * s);
      if (edge === 2) c = MAP_LINE; else if (edge === 1) c = c.map(v => v * 0.58);
      o[p * 4] = c[0]; o[p * 4 + 1] = c[1]; o[p * 4 + 2] = c[2]; o[p * 4 + 3] = 255;
    }
    cx2.putImageData(img, 0, 0);
    out[side] = {canvas: cv, ids, w: W, h: H};
  }
  idMat.dispose(); shMat.dispose();
  return out;
}
