import * as THREE from './three.js';
import { mergeGeometries } from './addons.js';
import { Builder } from './osm.js';

const Yv = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
export const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, o));
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const unitSph = new THREE.SphereGeometry(1, 14, 10);
export function setTube(m, a, b, r) { _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); const L = _a.distanceTo(_b); m.position.copy(_a).add(_b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(Yv, _d.copy(_b).sub(_a).normalize()); m.scale.set(r, L, r); }
export function tube(a, b, r, mat) { const m = new THREE.Mesh(unitCyl, mat); setTube(m, a, b, r); m.castShadow = true; return m; }
function sph(r, mat, x, y, z, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(unitSph, mat); m.position.set(x, y, z); m.scale.set(r * sx, r * sy, r * sz); m.castShadow = true; return m; }
function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }

export function bake(root, keepList = []) {
  const keep = new Set(keepList);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), mm = new THREE.Matrix4();
  const byMat = new Map(), rm = [];
  root.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material) || o.material.vertexColors) return;
    for (let p = o; p && p !== root; p = p.parent) if (keep.has(p)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    g.applyMatrix4(mm.multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g); rm.push(o);
  });
  rm.forEach(o => o.parent.remove(o));
  for (const [mat, gs] of byMat) { const me = new THREE.Mesh(mergeGeometries(gs), mat); me.castShadow = true; me.receiveShadow = true; root.add(me); }
  return root;
}

const SKIN = [0xa8714a, 0x9a6440, 0xb98258, 0x8a5838];
const LONGYI = [['#2f5d50', '#c9a227'], ['#6b2b3a', '#e0b04a'], ['#27407a', '#8fb3e0'], ['#5a3d2b', '#d9a066'], ['#4a3f7a', '#c9b2e8'], ['#7a2e24', '#f0c27a'], ['#2e5b2e', '#a8d08d']];
const SHIRT = [0xf5f2ea, 0xe8d7a8, 0xbcd7e8, 0xf2c9b8, 0xd8e6c4, 0xf2e2f0, 0xffffff];
const pickR = a => a[Math.floor(Math.random() * a.length)];
const longyiCache = new Map();
function longyiMat(T, pair) { const k = pair.join(); if (!longyiCache.has(k)) { const t = T.longyi(pair[0], pair[1]); t.repeat.set(3, 2); longyiCache.set(k, std(0xffffff, { map: t, roughness: 0.85 })); } return longyiCache.get(k); }
function kamaukGeo() { return new THREE.LatheGeometry([[0, 0.16], [0.06, 0.15], [0.16, 0.1], [0.3, 0.035], [0.38, 0.005], [0.39, -0.01], [0.37, -0.014]].map(p => new THREE.Vector2(p[0], p[1])), 32); }
let KAMAUK = null;

// ---------- bicycle + rider ----------
export function makeBike(T) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const frameM = std(0x1f5a46, { roughness: 0.32, metalness: 0.45 }), chromeM = std(0xdfe3e8, { roughness: 0.18, metalness: 1 }), tireM = std(0x26252b, { roughness: 0.9 });
  const leatherM = std(0x6b3b22, { roughness: 0.55 }), basketM = std(0xffffff, { map: T.bamboo, roughness: 0.9, side: THREE.DoubleSide });
  const R = 0.34, RA = [0, R, -0.52], FA = [0, R, 0.56], BB = [0, 0.3, -0.04], ST = [0, 0.88, -0.24], HT1 = [0, 0.92, 0.42], HT2 = [0, 0.72, 0.47];
  const wheel = () => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(R - 0.03, 0.032, 10, 40), tireM); tire.rotation.y = Math.PI / 2; tire.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.065, 0.011, 6, 40), chromeM); rim.rotation.y = Math.PI / 2;
    const sg = []; for (let i = 0; i < 20; i++) { const c = new THREE.CylinderGeometry(0.0035, 0.0035, R - 0.07, 3); c.translate(0, (R - 0.07) / 2, 0); c.rotateX(i / 20 * Math.PI * 2); c.translate(i % 2 ? 0.014 : -0.014, 0, 0); sg.push(c); }
    const spokes = new THREE.Mesh(mergeGeometries(sg), chromeM);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.09, 12), chromeM); hub.rotation.z = Math.PI / 2;
    w.add(tire, rim, spokes, hub); return w;
  };
  const wr = wheel(), wf = wheel(); wr.position.set(...RA); wf.position.set(...FA); g.add(wr, wf);
  for (const [a, b, r] of [[BB, ST, 0.02], [ST, HT1, 0.018], [BB, HT2, 0.022], [HT1, HT2, 0.026]]) g.add(tube(a, b, r, frameM));
  for (const s of [-1, 1]) { g.add(tube(BB, [s * 0.06, R, -0.52], 0.012, frameM)); g.add(tube(ST, [s * 0.06, R, -0.52], 0.011, frameM)); g.add(tube(HT2, [s * 0.05, R, 0.56], 0.014, frameM)); }
  g.add(tube(ST, [0, 0.97, -0.27], 0.012, chromeM));
  g.add(sph(1, leatherM, 0, 0.99, -0.29, 0.1, 0.04, 0.15));
  g.add(tube(HT1, [0, 1.0, 0.4], 0.013, chromeM));
  const bar = [[-0.27, 1.0, 0.29], [-0.12, 1.02, 0.4], [0.12, 1.02, 0.4], [0.27, 1.0, 0.29]];
  for (let i = 0; i < 3; i++) g.add(tube(bar[i], bar[i + 1], 0.011, chromeM));
  for (const s of [-1, 1]) g.add(tube([s * 0.27, 1.0, 0.29], [s * 0.29, 0.99, 0.2], 0.018, tireM));
  for (const z of [RA[2], FA[2]]) { const piv = new THREE.Group(); piv.position.set(0, R, z); piv.rotation.y = Math.PI / 2; const f = new THREE.Mesh(new THREE.TorusGeometry(R + 0.025, 0.02, 4, 24, Math.PI * 0.85), frameM); f.rotation.z = z < 0 ? 0.1 * Math.PI : 0.05 * Math.PI; f.scale.z = 2.2; piv.add(f); g.add(piv); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 24), chromeM); ring.rotation.y = Math.PI / 2; ring.position.set(0.07, BB[1], BB[2]); g.add(ring);
  g.add(tube([0.07, 0.4, -0.04], [0.07, R + 0.04, -0.52], 0.006, tireM), tube([0.07, 0.2, -0.04], [0.07, R - 0.04, -0.52], 0.006, tireM));
  const crank = new THREE.Group(); crank.position.set(...BB); g.add(crank);
  const ca = box(0.02, 0.17, 0.03, chromeM, 0.1, -0.085, 0), cb = box(0.02, 0.17, 0.03, chromeM, -0.1, 0.085, 0);
  crank.add(ca, cb, box(0.09, 0.02, 0.06, tireM, 0.15, -0.17, 0), box(0.09, 0.02, 0.06, tireM, -0.15, 0.17, 0));
  g.add(box(0.28, 0.015, 0.38, chromeM, 0, 0.82, -0.5));
  for (const s of [-1, 1]) g.add(tube([s * 0.12, 0.82, -0.66], [s * 0.06, R, -0.52], 0.007, chromeM));
  const bk = new THREE.Group(); bk.position.set(0, 0.87, 0.66);
  bk.add(box(0.38, 0.012, 0.3, basketM, 0, -0.11, 0), box(0.012, 0.22, 0.3, basketM, 0.19, 0, 0), box(0.012, 0.22, 0.3, basketM, -0.19, 0, 0), box(0.38, 0.22, 0.012, basketM, 0, 0, 0.15), box(0.38, 0.22, 0.012, basketM, 0, 0, -0.15));
  g.add(bk); g.add(tube([0, 0.76, 0.62], FA, 0.006, chromeM));
  const pkg = box(0.3, 0.2, 0.24, std(0xffffff, { map: T.wood, roughness: 0.8 }), 0, 1.0, 0.66); pkg.visible = false; g.add(pkg);
  g.add(sph(0.03, chromeM, 0.15, 1.04, 0.39, 1, 0.6, 1));
  const lensM = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe9b0, emissiveIntensity: 0, roughness: 0.2 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.07, 14), chromeM); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 0.9, 0.53); g.add(lamp);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 14), lensM); lens.position.set(0, 0.9, 0.566); g.add(lens);

  // rider
  const skinM = std(0xa8714a, { roughness: 0.6 }), shirtM = std(0xf5f2ea, { roughness: 0.8 }), lonM = longyiMat(T, ['#2f5d50', '#c9a227']), hairM = std(0x1c1714, { roughness: 0.7 });
  const hatM = std(0xffffff, { map: T.bamboo, roughness: 0.85, side: THREE.DoubleSide });
  g.add(sph(0.13, lonM, 0, 1.03, -0.3, 1.25, 0.8, 1.1));
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.32, 6, 14), shirtM); torso.castShadow = true;
  setTube(torso, [0, 1.08, -0.29], [0, 1.44, -0.17], 1); torso.scale.set(1.2, 1, 0.9); g.add(torso);
  g.add(tube([0, 1.5, -0.16], [0, 1.58, -0.13], 0.045, skinM));
  g.add(sph(0.11, skinM, 0, 1.66, -0.11, 1, 1.08, 1));
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.116, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); hair.position.set(0, 1.67, -0.12); hair.rotation.x = -0.3; g.add(hair);
  const hat = new THREE.Mesh(KAMAUK || (KAMAUK = kamaukGeo()), hatM); hat.position.set(0, 1.74, -0.11); hat.rotation.x = -0.12; hat.castShadow = true; g.add(hat);
  for (const s of [-1, 1]) {
    const S = [s * 0.19, 1.42, -0.17], H = [s * 0.27, 1.0, 0.27], E = [s * 0.27, 1.2, -0.02];
    g.add(tube(S, E, 0.048, shirtM), tube(E, H, 0.038, skinM), sph(0.045, skinM, ...H), sph(0.05, shirtM, ...S));
  }
  const legs = [-1, 1].map(s => {
    const th = new THREE.Mesh(unitCyl, lonM), sh = new THREE.Mesh(unitCyl, skinM), kn = new THREE.Mesh(unitSph, lonM), ft = box(0.085, 0.03, 0.22, std(0x3a2a20), 0, 0, 0);
    th.castShadow = sh.castShadow = kn.castShadow = true; kn.scale.setScalar(0.075); g.add(th, sh, kn, ft); return { s, th, sh, kn, ft };
  });
  const L1 = 0.44, L2 = 0.46;
  const update = (phase, wheelAng) => {
    wr.rotation.x = wf.rotation.x = wheelAng; crank.rotation.x = phase;
    for (const l of legs) {
      const c = Math.cos(phase) * 0.17 * (l.s > 0 ? 1 : -1), sn = Math.sin(phase) * 0.17 * (l.s > 0 ? 1 : -1);
      const F = [l.s * 0.16, BB[1] - c, BB[2] - sn], Hp = [l.s * 0.1, 1.0, -0.29];
      const dy = F[1] - Hp[1], dz = F[2] - Hp[2]; let d = Math.hypot(dy, dz); const dd = Math.min(d, L1 + L2 - 0.002);
      const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a)), uy = dy / d, uz = dz / d;
      let py = -uz, pz = uy; if (pz < 0) { py = -py; pz = -pz; }
      const K = [l.s * 0.13, Hp[1] + uy * a + py * hh, Hp[2] + uz * a + pz * hh];
      setTube(l.th, Hp, K, 0.075); setTube(l.sh, K, F, 0.05); l.kn.position.set(...K); l.ft.position.set(F[0], F[1] + 0.03, F[2] + 0.03);
    }
  };
  update(0, 0);
  bake(g, [wr, wf, crank, pkg, ...legs.flatMap(l => [l.th, l.sh, l.kn, l.ft])]);
  return { group: g, update, pkg, lensM };
}

// ---------- pagoda ----------
const PROFILE = [[0, 0], [0.62, 0], [0.62, 0.1], [0.56, 0.12], [0.56, 0.22], [0.5, 0.24], [0.5, 0.33], [0.46, 0.35], [0.47, 0.5], [0.45, 0.66], [0.4, 0.82], [0.32, 0.96], [0.24, 1.05], [0.19, 1.1], [0.21, 1.13], [0.17, 1.16], [0.17, 1.22], [0.2, 1.25], [0.14, 1.28], [0.14, 1.32], [0.13, 1.45], [0.1, 1.6], [0.065, 1.74], [0.035, 1.85], [0.015, 1.9], [0, 1.92]];
export function makePagodaMats(T) {
  return { gold: std(0xe8b64a, { metalness: 1, roughness: 0.28, emissive: 0x6a4a10, emissiveIntensity: 0 }), white: std(0xf6f0e4, { map: T.plaster, roughness: 0.9 }), gem: std(0xffffff, { metalness: 0.2, roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.4 }), pave: std(0xece4d4, { map: T.concrete, roughness: 0.95 }) };
}
export function makePagoda(r, M) {
  const g = new THREE.Group(); let y = 0.1;
  const pav = new THREE.Mesh(new THREE.BoxGeometry(r * 3.2, 0.1, r * 3.2), M.pave); pav.position.y = 0.05; pav.receiveShadow = true; g.add(pav);
  for (const [s, h] of [[2.3, 0.12], [2.0, 0.22], [1.7, 0.2], [1.42, 0.18]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(r * s, r * h, r * s), M.white); b.position.y = y + r * h / 2; b.castShadow = b.receiveShadow = true; g.add(b);
    const t = new THREE.Mesh(new THREE.BoxGeometry(r * s + 0.05 * r, r * 0.025, r * s + 0.05 * r), M.gold); t.position.y = y + r * h; g.add(t);
    y += r * h;
  }
  const main = new THREE.Mesh(new THREE.LatheGeometry(PROFILE.map(([a, b]) => new THREE.Vector2(a * r, b * r)), 48), M.gold); main.position.y = y; main.castShadow = true; g.add(main);
  const mini = new THREE.LatheGeometry(PROFILE.map(([a, b]) => new THREE.Vector2(a * r * 0.2, b * r * 0.2)), 16);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const m = new THREE.Mesh(mini, M.gold); m.position.set(sx * r * 0.6, y, sz * r * 0.6); m.castShadow = true; g.add(m); }
  const top = y + 1.9 * r;
  for (let i = 0; i < 5; i++) { const k = 5 - i; const c = new THREE.Mesh(new THREE.CylinderGeometry(r * (0.012 + 0.01 * k), r * (0.03 + 0.011 * k), r * 0.03, 20), M.gold); c.position.y = top + r * (0.015 + i * 0.045); g.add(c); }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.006, r * 0.006, r * 0.36, 6), M.gold); rod.position.y = top + r * 0.32; g.add(rod);
  const vane = new THREE.Mesh(new THREE.BoxGeometry(r * 0.004, r * 0.05, r * 0.1), M.gold); vane.position.set(0, top + r * 0.36, r * 0.05); g.add(vane);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(r * 0.026, 14, 10), M.gem); orb.position.y = top + r * 0.52; g.add(orb);
  return bake(g);
}

// ---------- station ----------
export function makeStation(T, len = 110) {
  const g = new THREE.Group();
  const conc = std(0xffffff, { map: T.concrete, roughness: 0.95 }), plaster = std(0xf3e6c4, { map: T.plaster, roughness: 0.9 }), shutter = std(0x2f6b5a, { roughness: 0.6 });
  const tinM = new THREE.MeshStandardMaterial({ map: T.tin, vertexColors: true, metalness: 0.55, roughness: 0.42 });
  const plat = box(5, 0.9, len, conc, 4.6, 0.45, 0); g.add(plat);
  g.add(box(0.3, 0.02, len, std(0xf2b233), 2.35, 0.91, 0));
  const bw = 8, bl = 30, bh = 5.4, bx = 7.1 + bw / 2;
  g.add(box(bw, bh, bl, plaster, bx, bh / 2, 0));
  g.add(box(bw + 0.2, 0.3, bl + 0.2, std(0xd9c9a3), bx, 0.9, 0));
  for (let i = -5; i <= 5; i++) { const d = box(0.1, i % 3 === 0 ? 2.4 : 1.4, 1.1, shutter, 7.06, i % 3 === 0 ? 2.1 : 2.6, i * 2.5); g.add(d); }
  const B = new Builder(); const top = bh, rh = 2.2, oh = 0.7;
  const x0 = bx - bw / 2 - oh, x1 = bx + bw / 2 + oh, z0 = -bl / 2 - oh, z1 = bl / 2 + oh, c = new THREE.Color('#b23a2a');
  const A = [x0, top, z0], Bv = [x1, top, z0], C = [x1, top, z1], D = [x0, top, z1], R1 = [bx, top + rh, z0 + bw / 2 + oh], R2 = [bx, top + rh, z1 - bw / 2 - oh];
  const ref = (...v) => [v.reduce((s, p) => s + p[0], 0) / v.length - bx, v.reduce((s, p) => s + p[1], 0) / v.length - top + 0.5, v.reduce((s, p) => s + p[2], 0) / v.length];
  const uv = p => [p[2] / 1.2, (p[0] + p[1]) / 1.2];
  const tri = (a, b, cc) => B.tri(a, b, cc, c, ref(a, b, cc), uv(a), uv(b), uv(cc));
  tri(A, D, R2); tri(A, R2, R1); tri(Bv, C, R2); tri(Bv, R2, R1); tri(A, Bv, R1); tri(D, C, R2);
  const roof = B.mesh(tinM); roof.castShadow = true; g.add(roof);
  for (let z = -len * 0.35; z <= len * 0.35; z += 7.5) g.add(tube([5.9, 0.9, z], [5.9, 4.3, z], 0.08, std(0x4a4f57, { metalness: 0.6, roughness: 0.4 })));
  const can = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.1, len * 0.75), new THREE.MeshStandardMaterial({ color: 0x8aa0b4, metalness: 0.5, roughness: 0.45 })); can.position.set(4.9, 4.35, 0); can.rotation.z = 0.07; can.castShadow = true; g.add(can);
  const signM = new THREE.MeshStandardMaterial({ map: T.sign, roughness: 0.7, side: THREE.DoubleSide });
  for (const z of [-len * 0.42, len * 0.42]) {
    g.add(tube([4.0, 0.9, z - 1.3], [4.0, 3.4, z - 1.3], 0.05, shutter), tube([4.0, 0.9, z + 1.3], [4.0, 3.4, z + 1.3], 0.05, shutter));
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.94), signM); s.position.set(4.0, 3.0, z); s.rotation.y = Math.PI / 2; g.add(s);
  }
  for (let z = -20; z <= 20; z += 10) g.add(box(0.5, 0.45, 1.8, std(0x6b4a30), 6.3, 1.12, z));
  bake(g);
  return { group: g, rects: [[2.1, 7.1, -len / 2, len / 2], [7.1, 7.1 + bw, -bl / 2, bl / 2]] };
}

// ---------- train ----------
export function makeTrainCar(kind, T) {
  const L = kind === 'loco' ? 16 : 14, g = new THREE.Group();
  const sideM = std(0xffffff, { map: kind === 'loco' ? T.loco : T.coach, roughness: 0.45, metalness: 0.25 }), endM = std(0xffffff, { map: kind === 'loco' ? T.locoEnd : T.coachEnd, roughness: 0.5 });
  const dark = std(0x2b2a33, { roughness: 0.7, metalness: 0.4 }), roofM = std(0x8a9399, { roughness: 0.5, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.7, L), [sideM, sideM, roofM, dark, endM, endM]); body.position.y = 2.3; body.castShadow = body.receiveShadow = true; g.add(body);
  const rg = new THREE.CylinderGeometry(1.45, 1.45, L - 0.1, 20, 1, false, Math.PI / 2, Math.PI); rg.rotateX(Math.PI / 2);
  const roof = new THREE.Mesh(rg, roofM); roof.scale.y = 0.3; roof.position.y = 3.64; roof.castShadow = true; g.add(roof);
  g.add(box(2.5, 0.4, L - 1.5, dark, 0, 0.98, 0));
  const wg = new THREE.CylinderGeometry(0.45, 0.45, 0.18, 16); wg.rotateZ(Math.PI / 2);
  for (const z of [L / 2 - 2.6, -L / 2 + 2.6]) { g.add(box(2.2, 0.55, 2.8, dark, 0, 0.78, z)); for (const x of [-1.0, 1.0]) for (const dz of [-0.85, 0.85]) { const w = new THREE.Mesh(wg, dark); w.position.set(x, 0.6, z + dz); g.add(w); } }
  let lights = null;
  if (kind === 'loco') {
    lights = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1c0, emissiveIntensity: 0.2 });
    for (const z of [L / 2 + 0.01, -L / 2 - 0.01]) for (const x of [-0.8, 0.8]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), lights); l.position.set(x, 1.5, z); if (z < 0) l.rotation.y = Math.PI; g.add(l); }
    g.add(box(1.6, 0.5, 2, roofM, 0, 3.9, 0));
  }
  bake(g);
  return { group: g, L, lights };
}

// ---------- vehicles ----------
const VG = {};
function extrudeProfile(pts, depth, bevel) {
  const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2); g.computeVertexNormals(); return g;
}
function vgeo() {
  if (VG.ok) return VG;
  VG.car = extrudeProfile([[-2.0, 0.3], [2.0, 0.3], [2.05, 0.72], [1.9, 0.9], [1.55, 0.96], [0.85, 1.0], [0.35, 1.5], [-1.25, 1.52], [-1.85, 1.06], [-2.02, 0.92]], 1.56, 0.08);
  VG.glass = extrudeProfile([[0.78, 1.02], [0.33, 1.45], [-1.2, 1.47], [-1.75, 1.07]], 1.78, 0);
  VG.cab = extrudeProfile([[0.35, 0.35], [2.1, 0.35], [2.15, 0.8], [1.75, 0.95], [1.35, 1.62], [0.42, 1.64], [0.38, 0.95]], 1.6, 0.07);
  VG.cabGlass = extrudeProfile([[1.3, 1.0], [1.05, 1.52], [0.5, 1.54], [0.5, 1.0]], 1.8, 0);
  VG.tire = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18); VG.tire.rotateZ(Math.PI / 2);
  VG.rim = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 14); VG.rim.rotateZ(Math.PI / 2);
  VG.mtire = new THREE.TorusGeometry(0.27, 0.07, 8, 22); VG.mtire.rotateY(Math.PI / 2);
  VG.ok = true; return VG;
}
export const vehicleLights = { head: new THREE.MeshStandardMaterial({ color: 0xfffbea, emissive: 0xfff1c0, emissiveIntensity: 0.1 }), tail: new THREE.MeshStandardMaterial({ color: 0xa01818, emissive: 0xff2a1a, emissiveIntensity: 0.1 }) };
const darkM = std(0x26252b, { roughness: 0.85 }), rimM = std(0xc9ced4, { metalness: 0.9, roughness: 0.3 }), glassM = std(0x1d2a36, { roughness: 0.08, metalness: 0.6 }), chromeM2 = std(0xdfe3e8, { metalness: 1, roughness: 0.2 });
function addWheels(g, list) { const V = vgeo(); const ws = []; for (const [x, z] of list) { const w = new THREE.Group(); w.position.set(x, 0.34, z); const t = new THREE.Mesh(V.tire, darkM), r = new THREE.Mesh(V.rim, rimM); t.castShadow = true; w.add(t, r); g.add(w); ws.push(w); } return ws; }
function rider(T, g, y, z, lean, helmetColor) {
  const sk = std(pickR(SKIN), { roughness: 0.6 }), sh = std(pickR(SHIRT)), lon = longyiMat(T, pickR(LONGYI));
  const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 4, 10), sh); setTube(t, [0, y, z], [0, y + 0.42, z + lean], 1); t.scale.set(1.2, 1, 0.9); t.castShadow = true; g.add(t);
  g.add(sph(0.11, sk, 0, y + 0.62, z + lean + 0.02));
  if (helmetColor != null) g.add(sph(0.135, std(helmetColor, { roughness: 0.3, metalness: 0.2 }), 0, y + 0.66, z + lean + 0.01, 1, 0.9, 1.1));
  else { const h = new THREE.Mesh(KAMAUK || (KAMAUK = kamaukGeo()), std(0xffffff, { map: T.bamboo, side: THREE.DoubleSide })); h.position.set(0, y + 0.7, z + lean + 0.02); h.scale.setScalar(0.9); g.add(h); }
  for (const s of [-1, 1]) { g.add(tube([s * 0.1, y, z], [s * 0.14, y - 0.05, z + 0.42], 0.075, lon), tube([s * 0.14, y - 0.05, z + 0.42], [s * 0.16, y - 0.5, z + 0.38], 0.05, sk)); }
  return sk;
}
export function makeVehicle(type, T, color) {
  const V = vgeo(), g = new THREE.Group();
  const paint = std(color, { roughness: 0.28, metalness: 0.55 });
  let wheels = [];
  if (type === 'car') {
    const b = new THREE.Mesh(V.car, paint); b.castShadow = b.receiveShadow = true; g.add(b);
    g.add(new THREE.Mesh(V.glass, glassM));
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.66), glassM); ws.position.set(0, 1.26, 0.62); ws.rotation.x = -Math.PI / 4.2; g.add(ws);
    wheels = addWheels(g, [[0.8, 1.25], [-0.8, 1.25], [0.8, -1.3], [-0.8, -1.3]]);
    for (const x of [-0.55, 0.55]) { g.add(box(0.34, 0.12, 0.05, vehicleLights.head, x, 0.78, 2.1), box(0.3, 0.12, 0.05, vehicleLights.tail, x, 0.82, -2.08)); }
    g.add(box(1.7, 0.16, 0.12, darkM, 0, 0.42, 2.08), box(1.7, 0.16, 0.12, darkM, 0, 0.42, -2.08));
  } else if (type === 'pickup') {
    const b = new THREE.Mesh(V.cab, paint); b.castShadow = true; g.add(b);
    g.add(new THREE.Mesh(V.cabGlass, glassM));
    const bed = std(0x6b4a30, { map: T.wood, roughness: 0.8 });
    g.add(box(1.74, 0.5, 2.5, paint, 0, 0.6, -0.95), box(1.7, 0.06, 2.4, bed, 0, 0.88, -0.95));
    for (const s of [-1, 1]) { g.add(box(0.06, 0.4, 2.4, paint, s * 0.85, 1.1, -0.95), box(0.4, 0.08, 2.2, bed, s * 0.6, 1.2, -0.95)); }
    for (const [x, z] of [[0.85, 0.3], [-0.85, 0.3], [0.85, -2.15], [-0.85, -2.15]]) g.add(tube([x, 0.9, z], [x, 2.05, z], 0.03, chromeM2));
    const roof = box(1.85, 0.06, 2.6, std(pickR([0x2f8f83, 0xd9603b, 0x23408e, 0xf2b233]), { roughness: 0.7 }), 0, 2.08, -0.92); g.add(roof);
    wheels = addWheels(g, [[0.8, 1.35], [-0.8, 1.35], [0.8, -1.5], [-0.8, -1.5]]);
    for (const x of [-0.55, 0.55]) { g.add(box(0.3, 0.12, 0.05, vehicleLights.head, x, 0.75, 2.17), box(0.2, 0.15, 0.05, vehicleLights.tail, x * 1.4, 0.7, -2.22)); }
    if (Math.random() < 0.7) for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) { const sk = std(pickR(SKIN)); const p = new THREE.Group(); p.position.set((i % 2 ? 0.55 : -0.55), 1.25, -0.3 - Math.floor(i / 2) * 0.9); p.add(sph(0.14, std(pickR(SHIRT)), 0, 0.3, 0, 1.1, 1.5, 0.9), sph(0.1, sk, 0, 0.62, 0)); g.add(p); }
  } else if (type === 'moto') {
    const w1 = new THREE.Group(), w2 = new THREE.Group(); w1.position.set(0, 0.34, 0.62); w2.position.set(0, 0.34, -0.62);
    for (const w of [w1, w2]) { const t = new THREE.Mesh(V.mtire, darkM); t.castShadow = true; w.add(t); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12), rimM); r.rotation.z = Math.PI / 2; w.add(r); g.add(w); }
    wheels = [w1, w2];
    g.add(box(0.22, 0.28, 0.9, paint, 0, 0.6, 0.05), box(0.26, 0.1, 0.62, darkM, 0, 0.82, -0.2), box(0.3, 0.2, 0.34, paint, 0, 0.8, 0.32));
    g.add(tube([0, 0.7, 0.42], [0, 0.34, 0.62], 0.025, chromeM2), tube([-0.32, 1.06, 0.45], [0.32, 1.06, 0.45], 0.014, chromeM2), tube([0, 0.86, 0.44], [0, 1.06, 0.45], 0.02, chromeM2));
    g.add(box(0.14, 0.1, 0.05, vehicleLights.head, 0, 0.92, 0.6), box(0.12, 0.06, 0.04, vehicleLights.tail, 0, 0.78, -0.55));
    rider(T, g, 0.92, -0.22, 0.12, Math.random() < 0.6 ? pickR([0xd9603b, 0x2f2f38, 0xf5f2ea, 0x23408e]) : null);
  } else {
    // trishaw (saiker)
    const w1 = new THREE.Group(), w2 = new THREE.Group(), w3 = new THREE.Group(); w1.position.set(0, 0.34, 0.55); w2.position.set(0, 0.34, -0.5); w3.position.set(1.05, 0.3, -0.1);
    for (const w of [w1, w2, w3]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.03, 8, 24), darkM); t.rotation.y = Math.PI / 2; t.castShadow = true; w.add(t); g.add(w); }
    wheels = [w1, w2, w3];
    g.add(tube([0, 0.3, -0.05], [0, 0.88, -0.24], 0.02, paint), tube([0, 0.88, -0.24], [0, 0.92, 0.42], 0.018, paint), tube([0, 0.3, -0.05], [0, 0.72, 0.47], 0.022, paint), tube([0, 0.72, 0.47], [0, 0.34, 0.55], 0.016, paint));
    g.add(tube([0, 0.5, -0.1], [1.05, 0.5, -0.1], 0.025, paint));
    const seatM = std(pickR([0x2f8f83, 0x7a2430, 0x23408e]), { roughness: 0.6 });
    g.add(box(0.7, 0.08, 1.2, paint, 0.85, 0.58, -0.15), box(0.7, 0.3, 0.12, seatM, 0.85, 0.75, -0.15), box(0.66, 0.42, 0.06, seatM, 0.85, 0.98, -0.15));
    g.add(box(0.06, 0.4, 1.2, paint, 1.2, 0.8, -0.15), box(0.06, 0.4, 1.2, paint, 0.5, 0.8, -0.15));
    for (const [x, z] of [[0.52, 0.42], [1.18, 0.42], [0.52, -0.72], [1.18, -0.72]]) g.add(tube([x, 0.6, z], [x, 1.85, z], 0.018, chromeM2));
    g.add(box(0.85, 0.05, 1.35, std(pickR([0xf2b233, 0xd9603b, 0x2f8f83]), { roughness: 0.7 }), 0.85, 1.88, -0.15));
    rider(T, g, 1.0, -0.28, 0.12, null);
  }
  bake(g, wheels);
  return { group: g, wheels };
}

// ---------- people ----------
export function makePerson(T) {
  const g = new THREE.Group(), female = Math.random() < 0.5;
  const skin = std(pickR(SKIN), { roughness: 0.6 }), shirt = std(pickR(SHIRT), { roughness: 0.85 }), lon = longyiMat(T, pickR(LONGYI)), hairM = std(0x1a1512, { roughness: 0.6 });
  const prof = (female ? [[0, 0.1], [0.12, 0.1], [0.13, 0.35], [0.15, 0.7], [0.16, 0.92], [0, 0.94]] : [[0, 0.08], [0.15, 0.08], [0.155, 0.4], [0.165, 0.75], [0.16, 0.95], [0, 0.96]]).map(p => new THREE.Vector2(p[0], p[1]));
  const skirt = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), lon); skirt.castShadow = true; g.add(skirt);
  const feet = [-1, 1].map(s => { const f = box(0.08, 0.04, 0.2, std(0x3a2a20), s * 0.07, 0.03, 0.02); g.add(f); return f; });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.3, 4, 12), shirt); torso.position.y = 1.18; torso.scale.set(1.18, 1, 0.85); torso.castShadow = true; g.add(torso);
  g.add(tube([0, 1.4, 0], [0, 1.48, 0], 0.04, skin), sph(0.105, skin, 0, 1.58, 0.01, 1, 1.08, 1));
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); hair.position.set(0, 1.59, -0.005); hair.rotation.x = -0.25; g.add(hair);
  if (female) g.add(sph(0.06, hairM, 0, 1.6, -0.12));
  const arms = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.19, 1.36, 0); const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.4, 3, 8), shirt); a.position.y = -0.24; a.castShadow = true; p.add(a); p.add(sph(0.04, skin, 0, -0.5, 0)); g.add(p); return p; });
  const r = Math.random();
  if (r < 0.25) { const h = new THREE.Mesh(KAMAUK || (KAMAUK = kamaukGeo()), std(0xffffff, { map: T.bamboo, side: THREE.DoubleSide })); h.position.y = 1.66; h.scale.setScalar(0.85); h.castShadow = true; g.add(h); }
  else if (r < 0.45) { const um = std(pickR([0x2b2a33, 0x7a2430, 0x23408e, 0xd9603b]), { side: THREE.DoubleSide, roughness: 0.7 }); const c = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.25, 10, 1, true), um); c.position.set(0.15, 2.05, 0.05); c.castShadow = true; g.add(c, tube([0.17, 1.15, 0.1], [0.15, 2.15, 0.05], 0.012, std(0x3a2a20))); arms[1].rotation.x = -0.9; arms[1].userData.fixed = true; }
  bake(g, [...arms, ...feet]);
  return { group: g, arms, feet };
}

// ---------- trees ----------
function prep(geo, c) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals(); const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  const f = typeof c === 'function' ? c : () => c;
  for (let i = 0; i < n; i++) { const cc = f(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i)); arr[i * 3] = cc.r; arr[i * 3 + 1] = cc.g; arr[i * 3 + 2] = cc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
}
function fanLeaf(c1, c2) {
  const pos = [], R = 1.25, n = 10, span = Math.PI * 1.35;
  for (let i = 0; i < n; i++) {
    const a0 = -span / 2 + span * i / n, a1 = -span / 2 + span * (i + 1) / n, am = (a0 + a1) / 2, z = (i % 2 ? 0.1 : -0.1);
    const p1 = [Math.sin(a0) * R, Math.cos(a0) * R, 0], p2 = [Math.sin(a1) * R, Math.cos(a1) * R, 0], pm = [Math.sin(am) * R * 1.04, Math.cos(am) * R * 1.04, z], pi = [Math.sin(am) * 0.25, Math.cos(am) * 0.25, z * 0.3];
    pos.push(0, 0, 0, ...p1, ...pm, 0, 0, 0, ...pm, ...p2);
    void pi;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return prep(g, (x, y) => c1.clone().lerp(c2, Math.min(1, Math.hypot(x, y) / R)));
}
export function palmGeometries() {
  const H = 9.2, pts = [];
  for (let i = 0; i <= 24; i++) pts.push(new THREE.Vector2(0.27 - i * 0.0045 + (i % 2 ? 0.018 : 0), i * H / 24));
  pts.push(new THREE.Vector2(0.0, H));
  const trunk = prep(new THREE.LatheGeometry(pts, 9), (x, y) => new THREE.Color('#7d6a55').lerp(new THREE.Color('#5a4a3c'), y / H));
  const parts = [], green1 = new THREE.Color('#4f8a3e'), green2 = new THREE.Color('#8cbf5a'), brown1 = new THREE.Color('#7a5f3a'), brown2 = new THREE.Color('#a88a5a');
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < 17; k++) {
    const dead = k >= 14;
    const leaf = fanLeaf(dead ? brown1 : green1, dead ? brown2 : green2);
    const pet = prep(new THREE.CylinderGeometry(0.025, 0.04, 1.2, 4), dead ? brown1 : new THREE.Color('#6a8a40'));
    pet.translate(0, 0.6, 0); leaf.translate(0, 1.15, 0);
    const p = mergeGeometries([pet, leaf]);
    p.rotateX(dead ? 2.4 + Math.random() * 0.4 : 0.25 + (k / 14) * 1.35 + Math.random() * 0.15);
    p.rotateY(k * ga); p.translate(0, H - 0.1, 0); parts.push(p);
  }
  parts.push(prep(new THREE.SphereGeometry(0.42, 8, 6), new THREE.Color('#5a4a30')).translate(0, H, 0));
  return { trunk, crown: mergeGeometries(parts) };
}
function blob(r, cx, cy, cz, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const d = 1 + 0.16 * Math.sin(x * 4.1 / r + y * 3.3 / r) * Math.cos(z * 3.7 / r + x * 2.1 / r); p.setXYZ(i, x * d, y * d, z * d); }
  g.translate(cx, cy, cz); return g;
}
export function roundTreeGeometries() {
  const tr = [prep(new THREE.CylinderGeometry(0.2, 0.32, 2.8, 7).translate(0, 1.4, 0), new THREE.Color('#6e5038'))];
  const br = new THREE.CylinderGeometry(0.07, 0.12, 1.6, 5); br.translate(0, 0.8, 0); br.rotateZ(0.8); br.translate(0, 2.2, 0); tr.push(prep(br, new THREE.Color('#6e5038')));
  const br2 = new THREE.CylinderGeometry(0.07, 0.12, 1.5, 5); br2.translate(0, 0.75, 0); br2.rotateZ(-0.7); br2.rotateY(1.2); br2.translate(0, 2.4, 0); tr.push(prep(br2, new THREE.Color('#6e5038')));
  const shade = (x, y) => { const t = Math.max(0, Math.min(1, (y - 2.2) / 3.4)); const v = 0.62 + t * 0.45; return new THREE.Color(v, v, v); };
  const cp = [[1.9, 0, 3.9, 0], [1.4, 1.3, 3.5, 0.4], [1.5, -1.2, 3.6, -0.5], [1.4, 0.3, 4.9, -0.3], [1.3, -0.4, 3.4, 1.2], [1.2, 0.5, 3.6, -1.3]].map(([r, x, y, z]) => prep(blob(r, x, y, z), shade));
  return { trunk: mergeGeometries(tr), canopy: mergeGeometries(cp) };
}
export function bushGeometry() {
  const shade = (x, y) => { const v = 0.7 + Math.min(1, y / 1.3) * 0.35; return new THREE.Color(v, v, v); };
  return mergeGeometries([[0.7, 0, 0.55, 0], [0.55, 0.55, 0.45, 0.2], [0.5, -0.5, 0.4, -0.2]].map(([r, x, y, z]) => prep(blob(r, x, y, z), shade)));
}
