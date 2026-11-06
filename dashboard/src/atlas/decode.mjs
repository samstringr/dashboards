// Decode Z-Anatomy GLB chunks (EXT_meshopt_compression + KHR_mesh_quantization) into plain arrays, keyed by structure id.
import fs from 'fs'; import { MeshoptDecoder } from 'meshoptimizer';
// The atlas release is not in this repo (about 83 MB). Get it with:
//   npm pack @authorod/svitylo-3d-anatomy-data@1.2.0 && tar xzf authorod-svitylo-3d-anatomy-data-1.2.0.tgz
// then point ATLAS_DIR at package/releases/1.2.0/
const ROOT = (process.env.ATLAS_DIR || 'package/releases/1.2.0').replace(/\/?$/, '/');
export const manifest = JSON.parse(fs.readFileSync(ROOT + 'manifest.json', 'utf8'));
await MeshoptDecoder.ready;
const CT = {5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array}, NC = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4};
export function readChunk(chunk, level = 'economy') {
  const buf = fs.readFileSync(ROOT + chunk.files[level].path), jl = buf.readUInt32LE(12), j = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const bl = buf.readUInt32LE(20 + jl), bin = buf.subarray(28 + jl, 28 + jl + bl);
  const views = j.bufferViews.map(v => {
    const e = v.extensions?.EXT_meshopt_compression;
    if (!e) return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const out = new Uint8Array(e.count * e.byteStride), src = bin.subarray(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength);
    MeshoptDecoder.decodeGltfBuffer(out, e.count, e.byteStride, src, e.mode, e.filter); return out;
  });
  const acc = i => { const a = j.accessors[i], v = j.bufferViews[a.bufferView], n = NC[a.type], T = CT[a.componentType], src = views[a.bufferView];
    const stride = v.byteStride || v.extensions?.EXT_meshopt_compression?.byteStride || n * T.BYTES_PER_ELEMENT, out = new Float32Array(a.count * n), dv = new DataView(src.buffer, src.byteOffset + (a.byteOffset || 0));
    const rd = {5120: o => dv.getInt8(o), 5121: o => dv.getUint8(o), 5122: o => dv.getInt16(o, true), 5123: o => dv.getUint16(o, true), 5125: o => dv.getUint32(o, true), 5126: o => dv.getFloat32(o, true)}[a.componentType];
    for (let i2 = 0; i2 < a.count; i2++) for (let k = 0; k < n; k++) { let x = rd(i2 * stride + k * T.BYTES_PER_ELEMENT); if (a.normalized) x = a.componentType === 5122 ? Math.max(x / 32767, -1) : a.componentType === 5120 ? Math.max(x / 127, -1) : a.componentType === 5123 ? x / 65535 : x / 255; out[i2 * n + k] = x; }
    return out; };
  // node transform (dequantisation lives here)
  const node = j.nodes.find(n => n.mesh != null), S = node.scale || [1, 1, 1], Tr = node.translation || [0, 0, 0];
  if (node.rotation && node.rotation.some((r, i) => Math.abs(r - [0, 0, 0, 1][i]) > 1e-6)) throw new Error('rotation in node');
  const prims = j.meshes[node.mesh].primitives.map(p => {
    const P = acc(p.attributes.POSITION); for (let i = 0; i < P.length; i += 3) { P[i] = P[i] * S[0] + Tr[0]; P[i + 1] = P[i + 1] * S[1] + Tr[1]; P[i + 2] = P[i + 2] * S[2] + Tr[2]; }
    const I = p.indices != null ? acc(p.indices) : null; const ID = p.attributes._ID != null ? acc(p.attributes._ID) : null, idN = p.attributes._ID != null ? NC[j.accessors[p.attributes._ID].type] : 1; return {P, I: I ? Uint32Array.from(I) : null, ID, idN, mat: p.material};
  });
  return prims;
}
export function structures() {
  const out = [];
  for (const ch of manifest.chunks) for (const s of manifest.structures.filter(x => x.meshes && x.system === ch.system)) {
    const idx = s.meshes.filter(m => m >= ch.meshStart && m < ch.meshStart + ch.meshCount).map(m => m - ch.meshStart);
    if (idx.length) out.push({id: s.id, chunk: ch, idx, side: s.side, parent: s.parent});
  }
  return out;
}

/* Split a chunk into meshes by the per-vertex _ID (absolute mesh index or chunk-relative). */
export function splitChunk(chunk, level = 'economy') {
  const out = new Map();
  for (const p of readChunk(chunk, level)) {
    const tri = p.I, nv = p.P.length / 3;
    for (let t = 0; t < tri.length; t += 3) {
      let id = Math.round(p.ID[tri[t] * p.idN]); if (id < chunk.meshStart) id += chunk.meshStart;
      let m = out.get(id); if (!m) { m = {map: new Map(), pos: [], idx: []}; out.set(id, m); }
      for (let k = 0; k < 3; k++) { const v = tri[t + k]; let n = m.map.get(v); if (n == null) { n = m.pos.length / 3; m.map.set(v, n); m.pos.push(p.P[v * 3], p.P[v * 3 + 1], p.P[v * 3 + 2]); } m.idx.push(n); }
    }
  }
  return out;
}
export function meshNames() { const m = new Map(); for (const s of manifest.structures) for (const i of (s.meshes || [])) m.set(i, s.id); return m; }
