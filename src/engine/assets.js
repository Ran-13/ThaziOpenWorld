import * as THREE from './three.js';
import { GLTFLoader, SkeletonUtils } from './addons.js';

// Loads optional GLB models listed in <base>/models.json. Any slot without a file uses the built-in procedural model.
// opts.skip: slot names to ignore (phones skip heavy house/tree/person GLBs).
export async function loadAssets(base, msg, opts = {}) {
  let manifest;
  try { const r = await fetch(base + 'models.json', { cache: 'no-cache' }); if (!r.ok) return {}; manifest = await r.json(); } catch (e) { return {}; }
  const skip = new Set(opts.skip || []);
  const slots = Object.entries(manifest.slots || {}).filter(([slot, c]) => !skip.has(slot) && c && c.file && (!Array.isArray(c.file) || c.file.length));
  if (!slots.length) return {};
  msg && msg(`3D model ${slots.length} ခု ဖွင့်နေသည်…`);
  const loader = new GLTFLoader(), out = {};
  await Promise.all(slots.map(async ([slot, cfg]) => {
    const files = Array.isArray(cfg.file) ? cfg.file : [cfg.file];
    // Phones: one variant per slot is enough — random variety costs RAM for little visual gain.
    const pick = opts.oneVariant ? [files[Math.floor(Math.random() * files.length)]] : files;
    const res = await Promise.all(pick.map(async f => { try { return prepare(await loader.loadAsync(base + f), cfg); } catch (e) { console.warn('[models] could not load', slot, f, e); return null; } }));
    const ok = res.filter(Boolean); if (!ok.length) return;
    out[slot] = (!opts.oneVariant && Array.isArray(cfg.file)) ? ok : ok[0];
  }));
  return out;
}

function prepare(gltf, cfg) {
  const root = gltf.scene;
  root.rotation.y = (cfg.rotateY || 0) * Math.PI / 180;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  let s = 1;
  if (cfg.length) s = cfg.length / Math.max(size.x, size.z, 1e-3);
  else if (cfg.height) s = cfg.height / Math.max(size.y, 1e-3);
  s *= cfg.scale || 1;
  const wrap = new THREE.Group(), inner = new THREE.Group();
  inner.add(root); inner.position.set(-c.x, -box.min.y, -c.z);
  wrap.add(inner); wrap.scale.setScalar(s);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  wrap.updateMatrixWorld(true);
  const sz = new THREE.Box3().setFromObject(wrap).getSize(new THREE.Vector3());
  return { scene: wrap, animations: gltf.animations || [], cfg, size: sz };
}

export function cloneAsset(a) {
  const c = SkeletonUtils.clone(a.scene);
  let mixer = null;
  if (a.animations.length) {
    const want = (a.cfg.walkClip || 'walk').toLowerCase();
    const clip = a.animations.find(x => x.name.toLowerCase() === want) || a.animations.find(x => x.name.toLowerCase().includes(want)) || a.animations[0];
    mixer = new THREE.AnimationMixer(c); mixer.clipAction(clip).play();
  }
  return { object: c, mixer };
}

// Instanced copies of a static GLB (trees etc). list: [x, z, rotY, scale]
// Split per chunk like the procedural instances in game.js: one mesh spanning the whole town
// is never frustum-culled, so every copy is redrawn into the shadow map each frame.
// 160 m is deliberate - a coarser grid trades away shadow-pass culling and measured 2x the
// triangles for fewer draw calls, which is a net loss.
const CHUNK = 160;

export function instancedFromAsset(a, list, scene, track) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  a.scene.updateMatrixWorld(true);
  const cells = new Map();
  for (const t of list) { const k = Math.floor(t[0] / CHUNK) + ',' + Math.floor(t[1] / CHUNK); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(t); }
  a.scene.traverse(o => {
    if (!o.isMesh) return;
    const base = o.matrixWorld.clone();
    for (const [k, part] of cells) {
      const im = new THREE.InstancedMesh(o.geometry, o.material, part.length);
      part.forEach((t, i) => { q.setFromEuler(e.set(0, t[2], 0)); m4.compose(v.set(t[0], 0, t[1]), q, t.length > 4 ? s.set(t[3], t[4], t[5]) : s.set(t[3], t[3], t[3])); m4.multiply(base); im.setMatrixAt(i, m4); });
      im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; scene.add(im);
      if (track) { const c = k.split(','), ix = +c[0], iz = +c[1]; track(im, ix, iz); }
    }
  });
}
