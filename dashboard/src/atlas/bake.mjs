/* Bake the dashboard body from the Z-Anatomy atlas (BodyParts3D derived, CC BY-SA 4.0).
   WHY this shape: the atlas skin is a real scanned man but coarse and soft; the atlas muscles are
   detailed but are an écorché (gaps, tendons, no skin). So the skin is remeshed as one closed surface and then
   shrink-wrapped onto the muscles: every skin vertex learns how far below it the muscle surface is
   (pull), how thick the soft tissue is down to bone (depth) and which muscle it sits over (mk).
   The browser then sets fat by keeping a fraction of the pull, and muscle size by pushing out along
   the depth, so one mesh covers "now", "4 weeks" and "goal" without shipping the muscles.
   Output: body.b64 (gzip of header JSON + typed arrays) and bake-info.json. */
import fs from 'fs'; import zlib from 'zlib';
import { manifest, splitChunk, meshNames } from './decode.mjs';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const SCALE = 1.72 / 1.7437;                 // the atlas man is 174.4 cm; Sam is 172 cm
const TARGET_V = +(process.argv[2] || 56000); // vertices shipped
const names = meshNames();
const load = (re, level) => { const out = new Map(); for (const ch of manifest.chunks.filter(c => re.test(c.id))) for (const [id, m] of splitChunk(ch, level)) { const n = names.get(id); if (n) out.set(n, {P: Float32Array.from(m.pos, v => v * SCALE), I: Uint32Array.from(m.idx)}); } return out; };
const t0 = Date.now(), log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);
const regions = load(/^regions\./, 'economy'), muscles = load(/^muscular\./, 'standard'), bones = load(/^skeletal\./, 'economy');
// the eyeballs close the eye openings (the scan's skin stops at the eyelids)
for (const [n, m] of load(/^nervous\.sense_organs/, 'economy')) if (/\.(sclera|cornea)_[lr]$/.test(n)) regions.set('regions.eyeball_' + n.split('.')[1], m);
log('loaded', regions.size, muscles.size, bones.size);
const base = n => n.replace(/^[a-z]+\./, '').replace(/_[lr]$/, ''), side = n => n.endsWith('_l') ? 1 : n.endsWith('_r') ? -1 : 0;
/* ---------- open the armpits ----------
   The scan's upper arms touch the chest for about 12 cm below the armpit (gap ≤ 3 mm down to y 1.18 m),
   so the remesh welded them into one web, which stretched into stripes whenever an arm moved away.
   Each arm (skin, muscles, bones together) is swung out 6° about its shoulder joint first, blended in
   between 5 and 15 cm down the upper arm so the deltoid cap and armpit folds stay put. 8° from the joint
   down crumpled the armpit when the arms came back in. The rig is built on this pose. */
{
  const ABD = +(process.env.ABD ?? 0) * Math.PI / 180, sm = (a, b, t) => { const q = Math.min(1, Math.max(0, (t - a) / (b - a))); return q * q * (3 - 2 * q); };
  const ARM_SKIN = /region_of_arm|elbow|cubital|bicipital|forearm|wrist|hand|palm|radial_foveola|deltoid_region/;
  const ARM_MUS = /deltoid|biceps_brachii|brachialis|triceps|anconeus|brachioradialis|extensor_carpi|extensor_digitorum_muscle|flexor_carpi|palmaris|pronator|flexor_digitorum|supinator|pollicis|extensor_indicis|lumbrical|interosse|_of_hand|digiti_minimi/;
  const ARM_BONE = /humerus|radius|ulna|scaphoid|lunate|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal|_of_hand/;
  for (const s of ['l', 'r']) {
    const H = bones.get('skeletal.humerus_' + s).P, hp = []; for (let i = 0; i < H.length; i += 3) hp.push([H[i], H[i + 1], H[i + 2]]);
    const ymax = Math.max(...hp.map(p => p[1])), ymin = Math.min(...hp.map(p => p[1])), avg = a => a.reduce((t, p) => [t[0] + p[0] / a.length, t[1] + p[1] / a.length, t[2] + p[2] / a.length], [0, 0, 0]);
    const sh = avg(hp.filter(p => p[1] > ymax - 0.035)), el = avg(hp.filter(p => p[1] < ymin + 0.03)), dl = Math.hypot(el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]), d = [0, 1, 2].map(i => (el[i] - sh[i]) / dl);
    const sg = s === 'l' ? 1 : -1;
    const move = m => { for (let i = 0; i < m.P.length; i += 3) { const x = m.P[i] - sh[0], y = m.P[i + 1] - sh[1], z = m.P[i + 2] - sh[2], w = sm(0.05, 0.15, x * d[0] + y * d[1] + z * d[2]); if (w <= 0) continue; const a = sg * ABD * w, c = Math.cos(a), n = Math.sin(a); m.P[i] = sh[0] + x * c - y * n; m.P[i + 1] = sh[1] + x * n + y * c; } };
    const mine = n => n.endsWith('_' + s);
    for (const [n, m] of regions) if (mine(n) && ARM_SKIN.test(base(n))) move(m);
    for (const [n, m] of muscles) if (mine(n) && ARM_MUS.test(base(n))) move(m);
    for (const [n, m] of bones) if (mine(n) && ARM_BONE.test(base(n))) move(m);
  }
}
// ---------- joints from bones ----------
const pts = n => { const m = bones.get('skeletal.' + n); if (!m) throw new Error('no bone ' + n); const o = []; for (let i = 0; i < m.P.length; i += 3) o.push([m.P[i], m.P[i + 1], m.P[i + 2]]); return o; };
const cen = a => a.reduce((s, p) => [s[0] + p[0] / a.length, s[1] + p[1] / a.length, s[2] + p[2] / a.length], [0, 0, 0]);
const top = (a, d) => { const my = Math.max(...a.map(p => p[1])); return a.filter(p => p[1] > my - d); };
const bot = (a, d) => { const my = Math.min(...a.map(p => p[1])); return a.filter(p => p[1] < my + d); };
const J = {};
for (const s of ['l', 'r']) {
  const k = s.toUpperCase(), hum = pts('humerus_' + s), fem = pts('femur_' + s), tib = pts('tibia_' + s);
  J['sh' + k] = cen(top(hum, 0.035)); J['el' + k] = cen(bot(hum, 0.03));
  J['wr' + k] = cen(bot([...pts('radius_' + s), ...pts('ulna_' + s)], 0.02));
  J['kn3' + k] = cen(pts('proximal_phalanx_of_third_finger_of_hand_' + s).filter((p, i, a) => p[1] > Math.max(...a.map(q => q[1])) - 0.008));
  J['tip' + k] = cen(bot(pts('distal_phalanx_of_third_finger_of_hand_' + s), 0.01));
  const ft = top(fem, 0.07), mx = ft.map(p => Math.abs(p[0])).sort((a, b) => a - b)[Math.floor(ft.length / 2)];
  J['hp' + k] = cen(ft.filter(p => Math.abs(p[0]) < mx));
  J['kn' + k] = cen([...bot(fem, 0.025), ...top(tib, 0.025)]);
  J['an' + k] = cen(pts('talus_' + s));
  J['toe' + k] = cen(pts('distal_phalanx_of_second_finger_of_foot_' + s));
  J['ball' + k] = cen(['first', 'second', 'third', 'fourth', 'fifth'].map(f => cen(pts('proximal_phalanx_of_' + f + '_finger_of_foot_' + s))));
}
J.head = cen([...pts('frontal_bone'), ...pts('occipital_bone')]);
// ---------- skin: merge regions, weld within 1.5 mm ----------
// hair only: the nails and the eyebrow skin are part of the closed surface (skipping the nails left a hole in
// every fingertip, which let the remesh flood fill the whole body)
const SKIP = /hairs|eyelash/;
const HEADR = /^(eyeball_sclera|eyeball_cornea|angle_of_mouth|anterior_notch_of_auricle|antihelix|antitragus|apex_of_auricle|auricular_region|auricular_tubercle|buccal_region|cavity_of_concha|concha_of_auricle|crura_of_antihelix|cymba_conchae|eminentia_conchae|eminentia_fossae_triangularis|eminentia_scaphae|fossa_antihelica|frontal_region|helix|infra_orbital_region|intertragic_incisure|labial_commissure|lobule_of_auricle|mastoid_region|mental_region|mentolabial_sulcus|nasal_region|nasolabial_sulcus|occipital_region|oral_region|orbital_region|parietal_region|parotideomasseteric_region|philtrum|posterior_auricular_groove|scapha|submental_triangle|temporal_region|tragus|triangular_fossa|tubercle_of_upper_lip|zygomatic_region)$/;
const GROUP = {torso: 0, neck: 1, head: 2, arm: 3, leg: 5, hip: 7, crotch: 9};
function groupOf(b) {
  if (HEADR.test(b)) return 'head';
  if (/neck|carotid|submandibular|muscular_triangle|supraclavicular|sternocleidomastoid_region/.test(b)) return 'neck';
  if (/urogenital|anal_region/.test(b)) return 'crotch';
  if (/gluteal|hip_region|femoral_triangle|inguinal/.test(b)) return 'hip';
  if (/foot/.test(b)) return 'leg';
  if (/region_of_arm|elbow|cubital|bicipital|forearm|wrist|hand|palm|radial_foveola|deltoid_region|nail_plate|perionyx/.test(b)) return 'arm'; // finger nails too (v7 draft left them on the pelvis bone)
  if (/thigh|knee|popliteal|region_of_leg|ankle|malleol|foot|heel|sole|metatarsal|hallucial/.test(b)) return 'leg';
  return 'torso';
}
const sP = [], sI = [], sG = [], used = {};
{
  const cell = 0.0015, grid = new Map(), parent = [], find = a => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const raw = [], rawG = [], rawI = [];
  for (const [n, m] of regions) {
    const b = base(n); if (SKIP.test(b)) continue; const g = groupOf(b); used[g] = (used[g] || 0) + 1;
    const code = GROUP[g] + (g === 'arm' || g === 'leg' || g === 'hip' ? (side(n) < 0 ? 1 : 0) : 0), o = raw.length / 3;
    for (let i = 0; i < m.P.length; i++) raw.push(m.P[i]); for (let v = 0; v < m.P.length / 3; v++) rawG.push(code); for (const i of m.I) rawI.push(o + i);
  }
  const nv = raw.length / 3; for (let v = 0; v < nv; v++) parent.push(v);
  const ck = (x, y, z) => x + ',' + y + ',' + z;
  for (let v = 0; v < nv; v++) { const c = [0, 1, 2].map(a => Math.floor(raw[v * 3 + a] / cell)), k = ck(...c); (grid.get(k) || grid.set(k, []).get(k)).push(v); }
  for (let v = 0; v < nv; v++) {
    const c = [0, 1, 2].map(a => Math.floor(raw[v * 3 + a] / cell));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const u of grid.get(ck(c[0] + dx, c[1] + dy, c[2] + dz)) || []) {
      if (u <= v) continue; const d = Math.hypot(raw[u * 3] - raw[v * 3], raw[u * 3 + 1] - raw[v * 3 + 1], raw[u * 3 + 2] - raw[v * 3 + 2]);
      if (d < 0.0012) { const a = find(u), b2 = find(v); if (a !== b2) parent[Math.max(a, b2)] = Math.min(a, b2); }
    }
  }
  const idx = new Map(), acc = [];
  for (let v = 0; v < nv; v++) { const r = find(v); let n = idx.get(r); if (n == null) { n = acc.length; idx.set(r, n); acc.push([0, 0, 0, 0]); sG.push(rawG[v]); } const a = acc[n]; a[0] += raw[v * 3]; a[1] += raw[v * 3 + 1]; a[2] += raw[v * 3 + 2]; a[3]++; }
  for (const a of acc) sP.push(a[0] / a[3], a[1] / a[3], a[2] / a[3]);
  const map = v => idx.get(find(v)), dup = new Set();
  for (let t = 0; t < rawI.length; t += 3) {
    const a = map(rawI[t]), b = map(rawI[t + 1]), c = map(rawI[t + 2]); if (a === b || b === c || a === c) continue;
    const k = [a, b, c].sort((x, y) => x - y).join(','); if (dup.has(k)) continue; dup.add(k); sI.push(a, b, c); // neighbouring regions repeat their border triangles
  }
}
/* Regions come with mixed winding and overlapping borders (thousands of non-manifold edges), so
   topology can't be trusted to orient them. Instead each triangle faces away from the nearest piece
   of its own body part's skeleton: spine for the torso, arm bones for the arm, and so on. */
{
  const seg = (a, b) => [a, b], j = J, mid = (a, b) => a.map((v, i) => (v + b[i]) / 2);
  const pel = mid(j.hpL, j.hpR), C0 = [0, pel[1] - 0.02, 0.045], C1 = [0, 1.40, 0.02];
  const SK = {
    0: [seg(C0, C1), seg([0, 1.30, 0.02], j.shL), seg([0, 1.30, 0.02], j.shR), seg(pel, j.hpL), seg(pel, j.hpR)],
    1: [seg([0, 1.33, 0.0], [0, 1.58, 0.03])], 2: [seg(j.head, j.head)],
    3: [seg(j.shL, j.elL), seg(j.elL, j.wrL), seg(j.wrL, j.tipL)], 4: [seg(j.shR, j.elR), seg(j.elR, j.wrR), seg(j.wrR, j.tipR)],
    5: [seg(j.hpL, j.knL), seg(j.knL, j.anL), seg(j.anL, j.toeL)], 6: [seg(j.hpR, j.knR), seg(j.knR, j.anR), seg(j.anR, j.toeR)],
    7: [seg(pel, j.hpL), seg(j.hpL, j.knL), seg(C0, C1)], 8: [seg(pel, j.hpR), seg(j.hpR, j.knR), seg(C0, C1)], 9: [seg(j.hpL, j.hpR), seg(pel, [0, pel[1] - 0.12, pel[2] + 0.02])]
  };
  const near = (p, list) => { let best = null, bd = 1e9; for (const [a, b] of list) { const ab = [0, 1, 2].map(i => b[i] - a[i]), l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2; let t = l2 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2 : 0; t = Math.max(0, Math.min(1, t)); const q = [0, 1, 2].map(i => a[i] + ab[i] * t), d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; best = q; } } return best; };
  let flipped = 0; const nt = sI.length / 3;
  for (let t = 0; t < nt; t++) {
    const [a, b, c] = [0, 1, 2].map(k => sI[t * 3 + k] * 3), u = [0, 1, 2].map(i => sP[b + i] - sP[a + i]), w = [0, 1, 2].map(i => sP[c + i] - sP[a + i]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], m = [0, 1, 2].map(i => (sP[a + i] + sP[b + i] + sP[c + i]) / 3);
    const q = near(m, SK[sG[sI[t * 3]]]), dir = [m[0] - q[0], m[1] - q[1], m[2] - q[2]];
    if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) { const x = sI[t * 3 + 1]; sI[t * 3 + 1] = sI[t * 3 + 2]; sI[t * 3 + 2] = x; flipped++; }
  }
  console.log('winding: flipped to face out', flipped, 'of', nt);
}

// boundary edges tell us whether the regions zipped together
function edgeStats(I) { const e = new Map(); for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3], key = a < b ? a * 1e7 + b : b * 1e7 + a; e.set(key, (e.get(key) || 0) + 1); } let b = 0, nm = 0; for (const c of e.values()) { if (c === 1) b++; else if (c > 2) nm++; } return {edges: e.size, boundary: b, nonManifold: nm}; }
log('skin welded', sP.length / 3, 'verts', sI.length / 3, 'tris', JSON.stringify(edgeStats(sI)), JSON.stringify(used));

if (process.env.AXILLA) { for (const y0 of [1.30, 1.27, 1.24, 1.21, 1.18, 1.15, 1.10]) { let ax = 9, tx = -9; for (let v = 0; v < sP.length / 3; v++) { const x = sP[v * 3], y = sP[v * 3 + 1]; if (Math.abs(y - y0) > 0.006 || x < 0) continue; if (sG[v] === 3) ax = Math.min(ax, x); else if (sG[v] === 0 || sG[v] === 1) tx = Math.max(tx, x); } console.log('y', y0, 'arm inner x', ax.toFixed(3), 'torso outer x', tx.toFixed(3), 'gap mm', ((ax - tx) * 1000).toFixed(1)); } process.exit(0); }

if (process.env.LOOPS) { const e = new Map(); for (let t = 0; t < sI.length; t += 3) for (let k = 0; k < 3; k++) { const a = sI[t + k], b = sI[t + (k + 1) % 3], key = a < b ? a + ',' + b : b + ',' + a; e.set(key, (e.get(key) || 0) + 1); }
  const adj = new Map(); for (const [k, c] of e) if (c === 1) { const [a, b] = k.split(',').map(Number); (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  const seen = new Set(); for (const s0 of adj.keys()) { if (seen.has(s0)) continue; const q = [s0], comp = []; seen.add(s0); while (q.length) { const v = q.pop(); comp.push(v); for (const u of adj.get(v)) if (!seen.has(u)) { seen.add(u); q.push(u); } }
    const c = [0, 1, 2].map(a => comp.reduce((t, v) => t + sP[v * 3 + a], 0) / comp.length); let ext = 0; for (const v of comp) ext = Math.max(ext, Math.hypot(sP[v * 3] - c[0], sP[v * 3 + 1] - c[1], sP[v * 3 + 2] - c[2]));
    if (comp.length > 4) console.log('loop', comp.length, 'centre', c.map(x => x.toFixed(3)).join(','), 'radius', ext.toFixed(3), 'groups', [...new Set(comp.map(v => sG[v]))].join('/')); }
  process.exit(0); }
/* ---------- remesh: signed distance on a 2.8 mm grid, then surface nets ----------
   WHY: the regions overlap at their borders (thousands of non-manifold edges), which showed up as
   crinkled seams. Rebuilding the skin as one closed surface removes them. Far cells get their sign
   from a flood fill from outside; cells near the skin take it from the nearest (outward-facing) triangle,
   which keeps the gaps between fingers and thighs open. */
const HV = 0.0028, TOFF = 0.0016;
let P, I, G;
{
  let lo = [9, 9, 9], hi = [-9, -9, -9]; for (let i = 0; i < sP.length; i++) { lo[i % 3] = Math.min(lo[i % 3], sP[i]); hi[i % 3] = Math.max(hi[i % 3], sP[i]); }
  lo = lo.map(v => v - 5 * HV); hi = hi.map(v => v + 5 * HV);
  const nx = Math.ceil((hi[0] - lo[0]) / HV) + 1, ny = Math.ceil((hi[1] - lo[1]) / HV) + 1, nz = Math.ceil((hi[2] - lo[2]) / HV) + 1, NC = nx * ny * nz;
  const id = (i, j, k) => (k * ny + j) * nx + i, R = 2.5 * HV;
  const D = new Float32Array(NC).fill(1), NT = new Int32Array(NC).fill(-1), SG = new Float32Array(NC);
  const nt = sI.length / 3;
  for (let t = 0; t < nt; t++) {
    const A = sI[t * 3] * 3, B2 = sI[t * 3 + 1] * 3, C = sI[t * 3 + 2] * 3, a = [sP[A], sP[A + 1], sP[A + 2]], b = [sP[B2], sP[B2 + 1], sP[B2 + 2]], c = [sP[C], sP[C + 1], sP[C + 2]];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - R - lo[0]) / HV)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0], c[0]) + R - lo[0]) / HV));
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - R - lo[1]) / HV)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1], c[1]) + R - lo[1]) / HV));
    const k0 = Math.max(0, Math.floor((Math.min(a[2], b[2], c[2]) - R - lo[2]) / HV)), k1 = Math.min(nz - 1, Math.ceil((Math.max(a[2], b[2], c[2]) + R - lo[2]) / HV));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const p = [lo[0] + i * HV, lo[1] + j * HV, lo[2] + k * HV], q = closestOnTri(p, a, b, c, ab, ac), d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), o = id(i, j, k);
      if (d < D[o]) { D[o] = d; NT[o] = t; SG[o] = (p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1] + (p[2] - q[2]) * n[2] >= 0 ? 1 : -1; }
    }
  }
  /* Plug the scan's holes (eye sockets, gaps in the soles) with a flat disc in each hole's plane.
     WHY: the flood below fills "outside" from the edge of the grid; through an open eye socket it filled the
     whole body, and the remesh came out as a thin double shell with its inner half facing inwards. */
  {
    const e = new Map(); for (let t = 0; t < sI.length; t += 3) for (let q = 0; q < 3; q++) { const a = sI[t + q], b = sI[t + (q + 1) % 3], kk = a < b ? a * 4194304 + b : b * 4194304 + a; e.set(kk, (e.get(kk) || 0) + 1); }
    const adj = new Map(); for (const [kk, c] of e) if (c === 1) { const a = Math.floor(kk / 4194304), b = kk % 4194304; (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
    const triOf = new Int32Array(sP.length / 3).fill(-1); for (let t = 0; t < sI.length / 3; t++) for (let q = 0; q < 3; q++) triOf[sI[t * 3 + q]] = t;
    const seen = new Set(); let discs = 0;
    for (const s0 of adj.keys()) {
      if (seen.has(s0)) continue; const comp = [], q = [s0]; seen.add(s0); while (q.length) { const v = q.pop(); comp.push(v); for (const u of adj.get(v)) if (!seen.has(u)) { seen.add(u); q.push(u); } }
      if (comp.length < 3) continue;
      const c = [0, 1, 2].map(a => comp.reduce((t, v) => t + sP[v * 3 + a], 0) / comp.length), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let r = 0;
      for (const v of comp) { const d = [0, 1, 2].map(a => sP[v * 3 + a] - c[a]); r = Math.max(r, Math.hypot(...d)); for (let i = 0; i < 3; i++) for (let j2 = 0; j2 < 3; j2++) C[i][j2] += d[i] * d[j2]; }
      // smallest eigenvector of C: power iteration on (tr·I − C)
      const tr = C[0][0] + C[1][1] + C[2][2]; let n = [0.3, 0.5, 0.8];
      for (let it = 0; it < 60; it++) { const m = [0, 1, 2].map(i => tr * n[i] - (C[i][0] * n[0] + C[i][1] * n[1] + C[i][2] * n[2])), l = Math.hypot(...m); n = m.map(x => x / l); }
      const R2 = r + HV, i0 = Math.max(0, Math.floor((c[0] - R2 - lo[0]) / HV)), i1 = Math.min(nx - 1, Math.ceil((c[0] + R2 - lo[0]) / HV)), j0 = Math.max(0, Math.floor((c[1] - R2 - lo[1]) / HV)), j1 = Math.min(ny - 1, Math.ceil((c[1] + R2 - lo[1]) / HV)), k0 = Math.max(0, Math.floor((c[2] - R2 - lo[2]) / HV)), k1 = Math.min(nz - 1, Math.ceil((c[2] + R2 - lo[2]) / HV));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = [lo[0] + i * HV - c[0], lo[1] + j * HV - c[1], lo[2] + k * HV - c[2]], h = d[0] * n[0] + d[1] * n[1] + d[2] * n[2], rr = Math.hypot(d[0] - n[0] * h, d[1] - n[1] * h, d[2] - n[2] * h);
        if (rr <= r) { const o = id(i, j, k); if (Math.abs(h) < D[o]) { D[o] = Math.abs(h); NT[o] = triOf[comp[0]]; } } // the plug takes the hole's body part (an unset part read as pelvis and left toes behind)
      }
      discs++;
    }
    log('plugged holes', discs);
  }
  /* Outside, in two passes. 1: flood from the grid edge through cells more than 5 mm from the skin; that
     cannot squeeze through the slits where the scan's regions overlap (the armpits, the crotch, the inner
     corners of the eyes), which let a 1.6 mm flood fill the whole body. 2: creep up to 3.4 cm further
     through cells more than TOFF from the skin and on the outer side of it, which reopens the gaps between
     fingers and toes without travelling down a slit into the body. */
  const out = new Uint8Array(NC), Q = new Int32Array(NC); let qh = 0, qt = 0;
  const push = o => { if (!out[o] && D[o] > 0.005) { out[o] = 1; Q[qt++] = o; } };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { push(id(0, j, k)); push(id(nx - 1, j, k)); }
  const nbr = o => { const i = o % nx, j = Math.floor(o / nx) % ny, k = Math.floor(o / (nx * ny)), r = []; if (i > 0) r.push(o - 1); if (i < nx - 1) r.push(o + 1); if (j > 0) r.push(o - nx); if (j < ny - 1) r.push(o + nx); if (k > 0) r.push(o - nx * ny); if (k < nz - 1) r.push(o + nx * ny); return r; };
  const PAR = process.env.LEAK ? new Int32Array(NC).fill(-1) : null;
  while (qh < qt) { const o = Q[qh++]; for (const u of nbr(o)) { if (PAR && !out[u] && D[u] > 0.005) PAR[u] = o; push(u); } }
  if (PAR) { for (const t of [[0, 1.1, 0.07], [0.08, 0.62, 0.04], [0, 1.6, 0.05]]) { let o = id(Math.round((t[0] - lo[0]) / HV), Math.round((t[1] - lo[1]) / HV), Math.round((t[2] - lo[2]) / HV)); const path = []; while (o >= 0) { const i = o % nx, j = Math.floor(o / nx) % ny, k = Math.floor(o / (nx * ny)); path.push([lo[0] + i * HV, lo[1] + j * HV, lo[2] + k * HV, D[o]]); o = PAR[o]; }
    let mi = 0; path.forEach((p, i) => { if (p[3] < path[mi][3]) mi = i; }); console.log('probe', t.join(','), 'path', path.length, 'narrowest', path[mi].slice(0, 3).map(x => x.toFixed(3)).join(','), 'D', (path[mi][3] * 1000).toFixed(1), 'around:', path.slice(Math.max(0, mi - 3), mi + 4).map(p => p.slice(0, 3).map(x => x.toFixed(3)).join(',')).join(' | ')); } process.exit(0); }
  { let front = []; for (let o = 0; o < NC; o++) if (out[o]) front.push(o);
    for (let step = 0; step < +(process.env.CREEP ?? 12) && front.length; step++) { const nf = []; for (const o of front) for (const u of nbr(o)) if (!out[u] && D[u] > TOFF && SG[u] > 0) { out[u] = 1; nf.push(u); } front = nf; } }
  if (process.env.PROBE) { for (const [nm, t] of [['torso', [0, 1.1, 0.07]], ['chest', [0, 1.25, 0.07]], ['belly', [0, 0.95, 0.07]], ['head', [0, 1.6, 0.05]], ['neck', [0, 1.45, 0.03]], ['thighL', [0.08, 0.62, 0.04]], ['shinL', [0.075, 0.25, 0.02]], ['uarmL', [0.2, 1.2, 0.02]], ['farmL', [0.24, 0.98, 0.04]], ['footL', [0.08, 0.04, 0.08]], ['pelvis', [0, 0.85, 0.05]]]) { const o = id(Math.round((t[0] - lo[0]) / HV), Math.round((t[1] - lo[1]) / HV), Math.round((t[2] - lo[2]) / HV)); console.log('probe', nm, out[o] ? 'FLOODED' : 'inside', 'D', (D[o] * 1000).toFixed(1)); } process.exit(0); }
  const S = new Float32Array(NC);
  for (let o = 0; o < NC; o++) S[o] = out[o] || D[o] <= TOFF ? D[o] - TOFF : -D[o];
  // surface nets
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cid = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
  const pos = [], grp = [], corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]], cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0; for (let c = 0; c < 8; c++) { const o = corners[c]; cv[c] = S[id(i + o[0], j + o[1], k + o[2])]; if (cv[c] < 0) neg++; }
    if (!neg || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0, tri = -1;
    for (const [a, b] of edges) { if ((cv[a] < 0) === (cv[b] < 0)) continue; const t = cv[a] / (cv[a] - cv[b]), A = corners[a], Bc = corners[b]; sx += A[0] + (Bc[0] - A[0]) * t; sy += A[1] + (Bc[1] - A[1]) * t; sz += A[2] + (Bc[2] - A[2]) * t; n++; }
    for (let c = 0; c < 8 && tri < 0; c++) { const o = corners[c]; tri = NT[id(i + o[0], j + o[1], k + o[2])]; }
    cellV[cid(i, j, k)] = pos.length / 3; pos.push(lo[0] + (i + sx / n) * HV, lo[1] + (j + sy / n) * HV, lo[2] + (k + sz / n) * HV); grp.push(tri >= 0 ? sG[sI[tri * 3]] : 0);
  }
  const idx = [], quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = S[id(i, j, k)] < 0;
    if (v0 !== (S[id(i + 1, j, k)] < 0)) quad(cellV[cid(i, j - 1, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i, j - 1, k)], !v0);
    if (v0 !== (S[id(i, j + 1, k)] < 0)) quad(cellV[cid(i - 1, j, k - 1)], cellV[cid(i - 1, j, k)], cellV[cid(i, j, k)], cellV[cid(i, j, k - 1)], !v0);
    if (v0 !== (S[id(i, j, k + 1)] < 0)) quad(cellV[cid(i - 1, j - 1, k)], cellV[cid(i, j - 1, k)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)], !v0);
  }
  if (process.env.VOLS) { let ng = 0; for (let o = 0; o < NC; o++) if (S[o] < 0) ng++; let vol = 0; for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3; vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]); }
    console.log('grid inside litres', (ng * HV ** 3 * 1000).toFixed(1), 'mesh volume litres', (vol / 6 * 1000).toFixed(1), 'quads', idx.length / 6); process.exit(0); }
  // keep only the largest connected piece (drops stray bubbles from mis-signed cells)
  const nv0 = pos.length / 3, par = Int32Array.from({length: nv0}, (_, i) => i), f = a => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (let t = 0; t < idx.length; t += 3) for (let q = 1; q < 3; q++) { const x = f(idx[t]), y = f(idx[t + q]); if (x !== y) par[x] = y; }
  const cnt = new Map(); for (let v = 0; v < nv0; v++) { const r = f(v); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const big = [...cnt].sort((x, y) => y[1] - x[1])[0][0], remap = new Int32Array(nv0).fill(-1), P2 = [], G2 = [], I2 = [];
  for (let v = 0; v < nv0; v++) if (f(v) === big) { remap[v] = P2.length / 3; P2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); G2.push(grp[v]); }
  for (let t = 0; t < idx.length; t += 3) if (remap[idx[t]] >= 0) I2.push(remap[idx[t]], remap[idx[t + 1]], remap[idx[t + 2]]);
  P = Float32Array.from(P2); I = Uint32Array.from(I2); G = G2;
  /* Surface nets came out with mixed winding (half the triangles faced inward, so the renderer culled them
     and the body only looked solid because layers of half-holes overlapped). Make neighbours agree across
     every shared edge, then point the whole surface outward by its signed volume. */
  {
    const nt = I.length / 3, E = new Map(), flip = new Uint8Array(nt), seen = new Uint8Array(nt);
    const key = (a, b) => a < b ? a * 4194304 + b : b * 4194304 + a;
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const kk = key(I[t * 3 + k], I[t * 3 + (k + 1) % 3]); const L = E.get(kk); if (L) L.push(t); else E.set(kk, [t]); }
    const runs = (t, a, b) => { for (let k = 0; k < 3; k++) if (I[t * 3 + k] === a && I[t * 3 + (k + 1) % 3] === b) return true; return false; };
    let flips = 0;
    for (let s0 = 0; s0 < nt; s0++) {
      if (seen[s0]) continue; seen[s0] = 1; const q = [s0];
      while (q.length) {
        const t = q.pop();
        for (let k = 0; k < 3; k++) {
          let a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3]; if (flip[t]) [a, b] = [b, a];
          const L = E.get(key(a, b)); if (L.length !== 2) continue;
          const u = L[0] === t ? L[1] : L[0]; if (seen[u]) continue; seen[u] = 1;
          if (runs(u, a, b)) { flip[u] = 1; flips++; } q.push(u); // u must run b→a to agree with t running a→b
        }
      }
    }
    for (let t = 0; t < nt; t++) if (flip[t]) { const x = I[t * 3 + 1]; I[t * 3 + 1] = I[t * 3 + 2]; I[t * 3 + 2] = x; }
    let vol = 0; for (let t = 0; t < nt; t++) { const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3; vol += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]); }
    if (vol < 0) for (let t = 0; t < nt; t++) { const x = I[t * 3 + 1]; I[t * 3 + 1] = I[t * 3 + 2]; I[t * 3 + 2] = x; }
    log('winding made consistent:', flips, 'flipped, volume', (Math.abs(vol) / 6 * 1000).toFixed(1), 'litres', vol < 0 ? '(then all reversed)' : '');
  }
  if (process.env.SLICE) { const zs = []; for (let v = 0; v < P.length / 3; v++) if (Math.abs(P[v * 3]) < 0.004 && Math.abs(P[v * 3 + 1] - +process.env.SLICE) < 0.004) zs.push(P[v * 3 + 2].toFixed(3)); console.log('slice z', zs.sort().join(' ')); const xs = []; for (let v = 0; v < P.length / 3; v++) if (Math.abs(P[v * 3 + 2] - 0.05) < 0.004 && Math.abs(P[v * 3 + 1] - +process.env.SLICE) < 0.004) xs.push(P[v * 3].toFixed(3)); console.log('slice x', xs.sort((a,b)=>a-b).join(' ')); process.exit(0); }
  log('remeshed', nx + '×' + ny + '×' + nz, 'pieces', cnt.size, 'kept', P.length / 3, 'verts', I.length / 3, 'tris', JSON.stringify(edgeStats(I)));
}
function closestOnTri(p, a, b, c, ab, ac) { // Ericson, Real-Time Collision Detection 5.1.5
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], d1 = ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2], d2 = ac[0] * ap[0] + ac[1] * ap[1] + ac[2] * ap[2];
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = ab[0] * bp[0] + ab[1] * bp[1] + ab[2] * bp[2], d4 = ac[0] * bp[0] + ac[1] * bp[1] + ac[2] * bp[2];
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = ab[0] * cp[0] + ab[1] * cp[1] + ab[2] * cp[2], d6 = ac[0] * cp[0] + ac[1] * cp[1] + ac[2] * cp[2];
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
const nv = P.length / 3;

function facing(P, I, tag) { let o = 0, n = 0; const cnt = {}; for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, m = [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3]; if (m[1] < 1.0 || m[1] > 1.3 || Math.abs(m[0]) > 0.12) continue; const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]; const nx = u[1] * w[2] - u[2] * w[1], nz = u[0] * w[1] - u[1] * w[0]; const f = nx * m[0] + nz * (m[2] - 0.07) > 0; const side = m[2] > 0.07 ? 'front' : 'back'; cnt[side + (f ? 'Out' : 'In')] = (cnt[side + (f ? 'Out' : 'In')] || 0) + 1; if (f) o++; n++; } console.log('facing out', tag, o, '/', n, JSON.stringify(cnt)); }
facing(P, I, 'remesh');
if (process.env.FACE2) { const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2), j = J, pel = mid(j.hpL, j.hpR);
  const segs = {0: [[[0, pel[1] - 0.02, 0.045], [0, 1.40, 0.02]]], 3: [[j.shL, j.elL], [j.elL, j.wrL], [j.wrL, j.tipL]], 4: [[j.shR, j.elR], [j.elR, j.wrR], [j.wrR, j.tipR]], 5: [[j.hpL, j.knL], [j.knL, j.anL]], 6: [[j.hpR, j.knR], [j.knR, j.anR]], 2: [[j.head, j.head]]};
  const near = (p, list) => { let best = null, bd = 1e9; for (const [a, b] of list) { const ab = [0, 1, 2].map(i => b[i] - a[i]), l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2; let t = l2 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2 : 0; t = Math.max(0, Math.min(1, t)); const q = [0, 1, 2].map(i => a[i] + ab[i] * t), d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; best = q; } } return best; };
  const res = {}; for (let t = 0; t < I.length; t += 3) { const g = G[I[t]]; if (!segs[g]) continue; const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, m = [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3]; const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]; const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const q = near(m, segs[g]); const o = n[0] * (m[0] - q[0]) + n[1] * (m[1] - q[1]) + n[2] * (m[2] - q[2]) > 0; res[g] = res[g] || [0, 0]; res[g][o ? 0 : 1]++; }
  console.log('out/in by group', JSON.stringify(res)); process.exit(0); }
if (process.env.PLEAT) { const nt = I.length / 3, Nn = new Float32Array(nt * 3); for (let t = 0; t < nt; t++) { const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3; const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]; const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n) || 1; Nn.set(n.map(x => x / l), t * 3); }
  const E = new Map(); for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3], kk = a < b ? a * 4194304 + b : b * 4194304 + a; (E.get(kk) || E.set(kk, []).get(kk)).push(t); }
  let opp = 0, tot = 0, degen = 0; for (const L of E.values()) if (L.length === 2) { const d = Nn[L[0] * 3] * Nn[L[1] * 3] + Nn[L[0] * 3 + 1] * Nn[L[1] * 3 + 1] + Nn[L[0] * 3 + 2] * Nn[L[1] * 3 + 2]; if (d < -0.5) opp++; tot++; }
  for (let t = 0; t < nt; t++) if (Nn[t * 3] === 0 && Nn[t * 3 + 1] === 0 && Nn[t * 3 + 2] === 0) degen++;
  console.log('edges with opposite-facing neighbours', opp, '/', tot, 'degenerate tris', degen); process.exit(0); }
if (process.env.TRI2) { for (const x0 of [0.03, 0.06, 0.09]) { const zs = []; for (let v = 0; v < P.length / 3; v++) if (Math.abs(P[v * 3] - x0) < 0.0015 && Math.abs(P[v * 3 + 1] - 1.15) < 0.0015) zs.push(P[v * 3 + 2]); zs.sort((a, b) => a - b); console.log('x', x0, 'z', zs.map(z => z.toFixed(3)).join(' ')); } process.exit(0); }
if (process.env.TRI) { let shown = 0; for (let t = 0; t < I.length && shown < 12; t += 3 * 997) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, m = [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3]; if (m[1] < 1.0 || m[1] > 1.3 || Math.abs(m[0]) > 0.12) continue; const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]; const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n); console.log('tri', m.map(x => x.toFixed(3)).join(','), 'n', n.map(x => (x / l).toFixed(2)).join(',')); shown++; } process.exit(0); }
const nb = Array.from({length: nv}, () => []);
{ const seen = new Set(); for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3], key = a < b ? a * 1e7 + b : b * 1e7 + a; if (seen.has(key)) continue; seen.add(key); nb[a].push(b); nb[b].push(a); } }
const smoothVec = (X, lam, mask) => { const T = X.slice(); for (let v = 0; v < nv; v++) { if (mask && !mask(v)) continue; const s = nb[v]; if (!s.length) continue; let ax = 0, ay = 0, az = 0; for (const u of s) { ax += T[u * 3]; ay += T[u * 3 + 1]; az += T[u * 3 + 2]; } X[v * 3] += lam * (ax / s.length - T[v * 3]); X[v * 3 + 1] += lam * (ay / s.length - T[v * 3 + 1]); X[v * 3 + 2] += lam * (az / s.length - T[v * 3 + 2]); } };
const smoothS = (X, it, lam = 0.5) => { for (let q = 0; q < it; q++) { const T = X.slice(); for (let v = 0; v < nv; v++) { const s = nb[v]; if (!s.length) continue; let a = 0; for (const u of s) a += T[u]; X[v] = T[v] + lam * (a / s.length - T[v]); } } };
for (let q = 0; q < 10; q++) { smoothVec(P, 0.5); smoothVec(P, -0.53); }
{ const N0 = normals(P, I); for (let i = 0; i < P.length; i++) P[i] -= N0[i] * TOFF; } // back onto the skin
// shorts cover the crotch: relax the genitals into a smooth membrane between the thighs (boundary held)
{ const isC = v => Math.abs(P[v * 3]) < 0.05 && P[v * 3 + 1] > 0.68 && P[v * 3 + 1] < 0.895 && P[v * 3 + 2] > -0.03; const m = []; for (let v = 0; v < nv; v++) if (isC(v)) m.push(v); log('crotch before zmax', Math.max(...m.map(v => P[v * 3 + 2])).toFixed(3)); const inM = new Uint8Array(nv); for (const v of m) inM[v] = 1; for (let q = 0; q < 4000; q++) for (const v of m) { const s = nb[v]; let ax = 0, ay = 0, az = 0; for (const u of s) { ax += P[u * 3]; ay += P[u * 3 + 1]; az += P[u * 3 + 2]; } P[v * 3] = ax / s.length; P[v * 3 + 1] = ay / s.length; P[v * 3 + 2] = az / s.length; } log('crotch relaxed', m.length, 'zmax', Math.max(...m.map(v => P[v * 3 + 2])).toFixed(3), 'ymin', Math.min(...m.map(v => P[v * 3 + 1])).toFixed(3)); }
function normals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2]; const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; } }
  for (let v = 0; v < N.length; v += 3) { const l = Math.hypot(N[v], N[v + 1], N[v + 2]) || 1; N[v] /= l; N[v + 1] /= l; N[v + 2] /= l; }
  return N;
}
let N = normals(P, I);
// make sure normals point outward (the atlas winding is not guaranteed): test against the body axis on the torso
// ---------- ray casting into muscles and bones ----------
const MUSCLE_MAP = [
  [/pectoralis_major/, 'chest'], [/clavicular_part_of_deltoid/, 'fdelt'], [/acromial_part_of_deltoid/, 'sdelt'], [/scapular_spinal_part_of_deltoid/, 'rdelt'],
  [/descending_part_of_trapezius|levator_scapulae/, 'traps'], [/transverse_part_of_trapezius|ascending_part_of_trapezius|infraspinatus|teres_minor|rhomboid_major/, 'upperback'],
  [/latissimus_dorsi|teres_major/, 'lats'], [/serratus_anterior/, 'serratus'], [/external_abdominal_oblique/, 'obliques'], [/rectus_abdominis/, 'abs'],
  [/sternocleidomastoid|splenius_capitis/, 'neck'], [/longissimus_thoracis|iliocostalis_lumborum|posterior_layer_of_thoracolumbar_fascia/, 'erectors'],
  [/biceps_brachii|^brachialis_muscle/, 'biceps'], [/triceps_brachii|anconeus/, 'triceps'],
  [/brachioradialis|extensor_carpi_radialis|^extensor_digitorum_muscle$|extensor_carpi_ulnaris|flexor_carpi|palmaris_longus|pronator_teres|flexor_digitorum_superficialis/, 'forearms'],
  [/gluteus_maximus|gluteus_medius|tensor_fasciae_latae|iliotibial_tract/, 'glutes'], [/rectus_femoris|vastus_lateralis|vastus_medialis|sartorius/, 'quads'],
  [/biceps_femoris|semitendinosus|semimembranosus/, 'hams'], [/adductor_longus|adductor_magnus|gracilis|pectineus/, 'adductors'],
  [/gastrocnemius|soleus/, 'calves'], [/tibialis_anterior|fibularis_longus|fibularis_brevis|extensor_digitorum_longus|calcaneal_tendon/, 'shin']
];
const MK = ['chest', 'lats', 'upperback', 'traps', 'fdelt', 'sdelt', 'rdelt', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'erectors', 'glutes', 'quads', 'hams', 'adductors', 'calves', 'serratus', 'neck', 'shin'];
const UPPER = new Set(['chest', 'lats', 'upperback', 'traps', 'fdelt', 'sdelt', 'rdelt', 'biceps', 'triceps', 'forearms', 'serratus', 'neck']);
function soup(map, pick) { // all triangles, tagged with a part code, in a 2 cm grid
  const tris = [], tag = [];
  for (const [n, m] of map) { const c = pick(n); if (c == null) continue; for (let t = 0; t < m.I.length; t += 3) { for (let k = 0; k < 3; k++) { const v = m.I[t + k]; tris.push(m.P[v * 3], m.P[v * 3 + 1], m.P[v * 3 + 2]); } tag.push(c); } }
  const T = Float32Array.from(tris), grid = new Map(), cs = 0.02;
  for (let t = 0; t < tag.length; t++) {
    const o = t * 9, lo = [0, 1, 2].map(a => Math.floor(Math.min(T[o + a], T[o + 3 + a], T[o + 6 + a]) / cs)), hi = [0, 1, 2].map(a => Math.floor(Math.max(T[o + a], T[o + 3 + a], T[o + 6 + a]) / cs));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = (x + 100) * 1e6 + (y + 100) * 1e3 + (z + 100); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(t); }
  }
  return {T, tag, grid, cs};
}
function cast(S, o, d, len) { // all hits along o + d*t, t in [0, len]
  const seen = new Set(), hits = [];
  for (let s = 0; s <= len + 1e-9; s += S.cs * 0.5) {
    const p = [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s], k = (Math.floor(p[0] / S.cs) + 100) * 1e6 + (Math.floor(p[1] / S.cs) + 100) * 1e3 + (Math.floor(p[2] / S.cs) + 100);
    for (const t of S.grid.get(k) || []) {
      if (seen.has(t)) continue; seen.add(t); const q = t * 9, T = S.T;
      const e1 = [T[q + 3] - T[q], T[q + 4] - T[q + 1], T[q + 5] - T[q + 2]], e2 = [T[q + 6] - T[q], T[q + 7] - T[q + 1], T[q + 8] - T[q + 2]];
      const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
      if (Math.abs(det) < 1e-12) continue; const inv = 1 / det, tv = [o[0] - T[q], o[1] - T[q + 1], o[2] - T[q + 2]];
      const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * inv; if (u < 0 || u > 1) continue;
      const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], w = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv; if (w < 0 || u + w > 1) continue;
      const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv; if (tt >= 0 && tt <= len) hits.push([tt, S.tag[t]]);
    }
  }
  return hits.sort((a, b) => a[0] - b[0]);
}
const mus = soup(muscles, n => { const b = base(n); for (const [re, k] of MUSCLE_MAP) if (re.test(b)) return MK.indexOf(k); return null; });
const bon = soup(bones, n => /vertebra|rib|sternum|costal|hyoid|skull|bone|humerus|radius|ulna|femur|tibia|fibula|patella|clavicle|scapula|sacrum|coccyx|carpal|metacarp|phalanx|talus|calcaneus|tarsal|cuneiform|cuboid|navicular/.test(n) ? 0 : null);
log('soups', mus.tag.length, 'muscle tris', bon.tag.length, 'bone tris');
const PULL = new Float32Array(nv), DEPTH = new Float32Array(nv), MKV = new Uint8Array(nv).fill(255), UP = new Float32Array(nv), BONE = new Float32Array(nv).fill(1), KNOWN = new Uint8Array(nv);
const OUT = 0.012, IN = 0.045;
for (let v = 0; v < nv; v++) {
  if (G[v] === 2) { KNOWN[v] = 1; continue; } // the head keeps its scanned shape
  const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], n = [-N[v * 3], -N[v * 3 + 1], -N[v * 3 + 2]], o = [p[0] - n[0] * OUT, p[1] - n[1] * OUT, p[2] - n[2] * OUT];
  const b = cast(bon, p, n, 0.13); if (b.length) BONE[v] = b[0][0];
  const h = cast(mus, o, n, OUT + IN);
  if (h.length) {
    const [t1, c] = h[0], d = t1 - OUT; MKV[v] = c; UP[v] = UPPER.has(MK[c]) ? 1 : 0; KNOWN[v] = 1;
    PULL[v] = Math.max(0, Math.min(0.010, d - 0.0015));
    const exit = h.find(x => x[1] === c && x[0] > t1 + 0.002), th = exit ? exit[0] - t1 : 0.01;
    DEPTH[v] = Math.min(0.07, Math.max(th, b.length ? b[0][0] - Math.max(0, d) : th));
  } else if (BONE[v] < 0.02) KNOWN[v] = 2; // skin straight over bone (shin, kneecap, elbow): nothing beneath to pull into
  if (v % 100000 === 0) log('cast', v, '/', nv);
}
/* A ray that misses (or slips between two muscles) must not leave a cliff: unknown values are filled
   from their neighbours (harmonic fill), the skin is never pulled to within 2 mm of bone, and then
   everything is smoothed over ~7 mm so the skin flows over the muscles instead of stepping between them. */
function inpaint(X, known, it) { for (let q = 0; q < it; q++) for (let v = 0; v < nv; v++) { if (known(v)) continue; const s = nb[v]; if (!s.length) continue; let a = 0; for (const u of s) a += X[u]; X[v] = a / s.length; } }
inpaint(PULL, v => KNOWN[v] > 0, 80); inpaint(DEPTH, v => KNOWN[v] === 1, 80); inpaint(UP, v => KNOWN[v] === 1 && G[v] !== 2, 80);
for (let v = 0; v < nv; v++) PULL[v] = Math.min(PULL[v], Math.max(0, BONE[v] - 0.002));
smoothS(PULL, 12); smoothS(DEPTH, 10); smoothS(UP, 14);
const hit = MKV.reduce((s, x) => s + (x !== 255), 0);
log('hits', hit, 'of', nv, 'pull mm mean', (PULL.reduce((a, b) => a + b, 0) / hit * 1000).toFixed(2), 'depth mm mean', (DEPTH.reduce((a, b) => a + b, 0) / hit * 1000).toFixed(1));
// ---------- the defined (lean) shape is what gets simplified, so grooves survive ----------
const PD = P.slice(); for (let v = 0; v < nv; v++) for (let a = 0; a < 3; a++) PD[v * 3 + a] -= N[v * 3 + a] * PULL[v];
const ti = Math.floor(I.length * (TARGET_V / nv) / 3) * 3;
const [Is] = MeshoptSimplifier.simplify(I, PD, 3, Math.min(I.length, ti), +(process.env.ERR || 0.0012), []);
const keep = new Map(), order = []; for (const v of Is) if (!keep.has(v)) { keep.set(v, order.length); order.push(v); }
facing(PD, Is, 'simplified'); facing(P, I, 'smoothed'); const n2 = order.length; log('simplified', n2, 'verts', Is.length / 3, 'tris');
// ---------- pack: meshopt vertex/index codecs (decoded in the page by the 12 KB pure-JS reference decoder), then gzip ----------
const { MeshoptEncoder } = await import('meshoptimizer'); await MeshoptEncoder.ready;
const Iq = new Uint32Array(Is.length); for (let i = 0; i < Is.length; i++) Iq[i] = keep.get(Is[i]);
const [remap, nu] = MeshoptEncoder.reorderMesh(Iq, true, true);   // Iq is rewritten in place, vertices get a new order
/* WHY positions are the scan's, not the pulled shape: pulling 6–10 mm in along the normals folded ~6 % of the
   simplified triangles, and the browser then pushed fat back out along those folded normals, which raised
   cones all over the skin. The simplification still runs on the pulled shape so the grooves keep their
   vertices; only the stored positions change. */
let mn = [9, 9, 9], mx = [-9, -9, -9]; for (const v of order) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[v * 3 + a]); mx[a] = Math.max(mx[a], P[v * 3 + a]); }
const VB = new Uint8Array(nu * 12), dv = new DataView(VB.buffer);
order.forEach((v, i) => {
  const o = remap[i] * 12; if (remap[i] === 0xffffffff) return;
  for (let a = 0; a < 3; a++) dv.setInt16(o + a * 2, Math.round(((P[v * 3 + a] - mn[a]) / (mx[a] - mn[a]) * 2 - 1) * 32767), true);
  VB[o + 6] = Math.min(255, Math.round(PULL[v] * 1e4 / 0.6));   // 0.06 mm steps (to 15 mm)
  VB[o + 7] = Math.min(255, Math.round(DEPTH[v] * 4e3));        // 0.25 mm steps (to 64 mm)
  VB[o + 8] = MKV[v]; VB[o + 9] = G[v]; VB[o + 10] = Math.round(UP[v] * 255);
});
const ev = MeshoptEncoder.encodeVertexBuffer(VB, nu, 12), ei = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(Iq.buffer), Iq.length, 4);
const head = {v: 4, pos: 'scan', src: 'Z-Anatomy atlas (BodyParts3D, The Database Center for Life Science), CC BY-SA 4.0; skin remeshed, shrink-wrapped onto the muscles and scaled to 172 cm',
  nv: nu, ni: Iq.length, bmin: mn, bmax: mx, joints: J, mk: MK, groups: GROUP, ev: ev.length, ei: ei.length, layout: 'int16 xyz, u8 pull(0.06mm) depth(0.25mm) muscle group upper(/255) pad'};
let hj = JSON.stringify(head); while ((4 + hj.length) % 4) hj += ' ';
const len = Buffer.alloc(4); len.writeUInt32LE(hj.length);
const blob = Buffer.concat([len, Buffer.from(hj), Buffer.from(ev), Buffer.from(ei)]);
const gz = zlib.gzipSync(blob, {level: 9}); fs.writeFileSync('body.b64', gz.toString('base64'));
fs.writeFileSync('bake-info.json', JSON.stringify({joints: J, nv: nu, tris: Iq.length / 3, gzKB: gz.length >> 10}));
log('verts', nu, 'tris', Iq.length / 3, 'meshopt', (ev.length + ei.length) >> 10, 'K gz', gz.length >> 10, 'K b64', Math.round(gz.length * 4 / 3) >> 10, 'K');
