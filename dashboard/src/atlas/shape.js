/* Runtime half of the baked body: unpack, then set fat and muscle for a composition. */
const ATLAS = {lean: 57, bf: 18};   // our read of the scanned man: average build, no visible abs
async function unpackBody2(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const buf = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const dv = new DataView(buf), hl = dv.getUint32(0, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const src = new Uint8Array(buf, 4 + hl), VB = new Uint8Array(h.nv * 12), IB = new Uint32Array(h.ni);
  MeshoptDecoder.decodeVertexBuffer(VB, h.nv, 12, src.subarray(0, h.ev));
  MeshoptDecoder.decodeIndexBuffer(new Uint8Array(IB.buffer), h.ni, 4, src.subarray(h.ev, h.ev + h.ei));
  const vd = new DataView(VB.buffer), P = new Float32Array(h.nv * 3), pull = new Float32Array(h.nv), depth = new Float32Array(h.nv), mk = new Uint8Array(h.nv), grp = new Uint8Array(h.nv), up = new Float32Array(h.nv);
  for (let v = 0; v < h.nv; v++) {
    const o = v * 12; for (let a = 0; a < 3; a++) P[v * 3 + a] = h.bmin[a] + (vd.getInt16(o + a * 2, true) / 32767 + 1) / 2 * (h.bmax[a] - h.bmin[a]);
    pull[v] = VB[o + 6] * 0.06e-3; depth[v] = VB[o + 7] * 0.25e-3; mk[v] = VB[o + 8]; grp[v] = VB[o + 9]; up[v] = VB[o + 10] / 255;
  }
  const I = h.nv > 65535 ? IB : Uint16Array.from(IB);
  return {h, P, I, pull, depth, mk, grp, up, J: h.joints};
}
function vnormals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2]; const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz; }
  for (let v = 0; v < N.length; v += 3) { const l = Math.hypot(N[v], N[v + 1], N[v + 2]) || 1; N[v] /= l; N[v + 1] /= l; N[v + 2] /= l; }
  return N;
}
/* fat: keep a share of the scanned man's own fat layer (so it sits where fat really sits);
   muscle: push out by the soft-tissue depth, more for the upper body, which is where lifting adds most. */
function shapeBody(B, comp) {
  const lean = comp?.lean || ATLAS.lean, fat = comp?.fat ?? lean * ATLAS.bf / (100 - ATLAS.bf), bf = 100 * fat / (lean + fat);
  const fatK = Math.max(0, Math.min(1.6, (bf - 5) / (ATLAS.bf - 5))), dl = (lean - ATLAS.lean) / ATLAS.lean;
  const gU = Math.sqrt(Math.max(0.3, 1 + 2.0 * dl)) - 1, gL = Math.sqrt(Math.max(0.3, 1 + 0.9 * dl)) - 1;
  const N = B.N || (B.N = vnormals(B.P, B.I)), P = new Float32Array(B.P.length);
  // positions are the scan's own (bake v4): fat below the scan's level pulls in, above it pushes out
  for (let v = 0; v < B.h.nv; v++) { const off = B.pull[v] * (fatK - 1) + B.depth[v] * (B.up[v] * gU + (1 - B.up[v]) * gL); for (let a = 0; a < 3; a++) P[v * 3 + a] = B.P[v * 3 + a] + N[v * 3 + a] * off; }
  return {P, bf, fatK, gU, gL};
}
