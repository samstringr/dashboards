#!/usr/bin/env python3
"""Build the 3D bundle from src/ and inline it into health-fitness.html.

WHY one file: a Claude artifact is a single self-contained HTML page, so the bundle (three.js scene code,
the baked atlas body and the form-demo mannequin) has to live inside it. src/ is where it is edited;
health-fitness.html is what gets published. Run this after any change under src/, then run the tests.

  python3 build.py            # writes build/fig3d.js and updates health-fitness.html in place
"""
import glob, os, re, subprocess, sys

R = os.path.dirname(os.path.abspath(__file__)) + '/'
src = lambda p: open(R + 'src/' + p, encoding='utf-8').read()

mdec, shape, b64 = src('atlas/mdec.js'), src('atlas/shape.js'), src('atlas/body.b64').strip()
atlas = ('/* ---------- ATLAS: baked body (anat/bake.mjs) ----------\n'
  '   Mesh: Z-Anatomy atlas, derived from BodyParts3D (The Database Center for Life Science), CC BY-SA 4.0:\n'
  '   this derived mesh is shared under the same licence. Decoder: meshoptimizer reference decoder, MIT. */\n'
  + mdec + '\n' + shape + '\nconst BODY_B64 = \'' + b64 + '\';\n')
# the mannequin's files, in dependency order: rig, the lift table, every demos*.js, then the renderer
demos = sorted(os.path.basename(x) for x in glob.glob(R + 'src/mq/demos*.js'))
mq = ''.join(src('mq/' + f) + '\n' for f in ['rig.js', 'lifts.js'] + demos + ['mann.js', 'skin.js'])
head = ('/* ============================================================\n'
  '   FIG3D v9. Physique: the atlas man (Z-Anatomy, CC BY-SA 4.0) as a matte white mannequin, shaped by\n'
  '   your lean and fat mass, also drawn flat as a front-and-back muscle chart. Form demos: one per exercise,\n'
  '   choreographed on a 172 cm rig and played on the same body, working muscles red (most) to yellow.\n'
  '   ============================================================ */\n'
  "const Fig3D = (() => {\n'use strict';\n")
mqwrap = ("/* ---------- FORM DEMOS (own scope: the rig reuses names like V, SK and solve) ---------- */\n"
  "const MQ = (() => {\n" + mq +
  "return {liftView, liftSnapshot, moveFor, variantsOf, groupName, buildSkinned, EX, solve, V, fAt, F, SK};\n})();\n")
tail = ("return {load, view: (h, o) => o && o.mode === 'lift' ? MQ.liftView(h, o) : view(h, o), snapshot: (o, w, h) => o && o.mode === 'lift' ? MQ.liftSnapshot(o, w, h) : snapshot(o, w, h),\n"
  "  moveFor: MQ.moveFor, variants: MQ.variantsOf, groupName: MQ.groupName, cues: k => (MQ.EX[k] || MQ.EX.stand).cues || [], muscles: k => (MQ.EX[k] || MQ.EX.stand).muscles || {},\n"
  "  map: mapViews, musclesList: MUSCLES, levelHex: LEVEL_HEX, has: k => !!MQ.EX[k] && k !== 'stand', ready: k => !!(MQ.EX[k] && MQ.EX[k].pose), list: () => Object.keys(MQ.EX),\n"
  "  _dbg: {MQ, buildMesh, solve, standPose, surface, get ATL() { return ATL; }, get REST_J() { return REST_J; }, get LEN() { return LEN; }}};\n})();\n")
bundle = head + atlas + src('fig3d/body.js') + '\n' + src('fig3d/view.js') + '\n' + src('fig3d/map.js') + '\n' + mqwrap + tail

os.makedirs(R + 'build', exist_ok=True)
open(R + 'build/fig3d.js', 'w', encoding='utf-8').write(bundle)
# node --check proves it parses, not that it runs: the tests are what prove it runs (see CLAUDE.md)
subprocess.run(['node', '--check', R + 'build/fig3d.js'], check=True)

p = R + 'health-fitness.html'; s = open(p, encoding='utf-8').read()
start = s.index('<script>\n/* ============================================================\n   FIG3D v9') + len('<script>\n')
end = s.index('</script>', start)
out = s[:start] + bundle + s[end:]
if out == s: print('health-fitness.html already up to date', len(out))
else: open(p, 'w', encoding='utf-8').write(out); print('inlined', len(out))
