import * as THREE from './three.js';
import { Grid, segDist } from './osm.js';

// Compound fences in two LODs, decided per fence run by the distance of its midpoint:
//  - near (< nearR): Kenney fence GLB segments, one InstancedMesh rebuilt every STEP metres.
//  - far: one flat strip per run, merged per 160 m chunk, painted as boards + posts in the
//    shader. Its vertex shader collapses runs the near set is drawing, using the same centre.
// A town of fenced compounds is ~100k GLB segments, so drawing them all is not an option.

const STEP = 8, CELL = 40, H = 1.15, DRAW_MAX = 6000, POST = 2.1;
const HIT_R = 0.45;   // bike half-width, same as the probe offset in game.js blockedR()

function stripMaterial(mobile, U, color) {
  const mat = mobile
    ? new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCenter = U.uCenter; sh.uniforms.uNear = U.uNear;
    sh.vertexShader = 'attribute vec2 aMid;\nuniform vec3 uCenter;\nuniform float uNear;\nvarying vec2 vFU;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFU = uv;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  if ( distance( aMid, uCenter.xz ) < uNear ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );`);
    // u runs in metres along the run, v is 0..1 up the fence: boards with a dark seam, posts
    // every POST metres that stand a little proud of the top board
    sh.fragmentShader = 'varying vec2 vFU;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float fPost = 1.0 - step( 0.12, fract( vFU.x / ${POST.toFixed(1)} ) * ${POST.toFixed(1)} );
  if ( vFU.y > 0.9 && fPost < 0.5 ) discard;
  float fSeam = 1.0 - smoothstep( 0.0, 0.04, abs( vFU.y - 0.5 ) );
  diffuseColor.rgb *= mix( 1.0, 0.7, max( fPost, fSeam * 0.6 ) ) * mix( 0.8, 1.0, vFU.y );`);
  };
  return mat;
}

export function createFences(asset, { mobile, shadows, nearR, chunk, track }) {
  let geo = null, map = null, mx = 1, my = 1;
  if (asset) {
    let mesh = null; asset.scene.updateMatrixWorld(true); asset.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (mesh) {
      geo = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv']) if (mesh.geometry.attributes[k]) geo.setAttribute(k, mesh.geometry.attributes[k].clone());
      if (mesh.geometry.index) geo.setIndex(mesh.geometry.index.clone());
      geo.applyMatrix4(mesh.matrixWorld); geo.computeBoundingBox();
      const s = geo.boundingBox.getSize(new THREE.Vector3()); mx = s.x; my = s.y; map = mesh.material.map;
    }
  }
  const U = { uCenter: { value: new THREE.Vector3(1e9, 0, 1e9) }, uNear: { value: nearR } };
  const runs = [], cells = new Map(), strips = new Map(), hitGrid = new Grid(25);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
  const seg = geo ? mx * H / my : POST;

  // one straight run of fence from a to b
  function add(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.4) return;
    const dx = (bx - ax) / L, dz = (bz - az) / L, cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const run = { ax, az, bx, bz, cx, cz, m: null }; runs.push(run);
    hitGrid.add(run, Math.min(ax, bx) - HIT_R, Math.min(az, bz) - HIT_R, Math.max(ax, bx) + HIT_R, Math.max(az, bz) + HIT_R);
    const k = Math.floor(cx / CELL) + ',' + Math.floor(cz / CELL); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(run);
    // far strip: two triangles, u in metres along the run
    const ck = Math.floor(cx / chunk) + ',' + Math.floor(cz / chunk); let st = strips.get(ck); if (!st) strips.set(ck, st = { p: [], u: [], m: [] });
    const a0 = [ax, 0, az], b0 = [bx, 0, bz], b1 = [bx, H, bz], a1 = [ax, H, az];
    for (const [pt, u, v] of [[a0, 0, 0], [b0, L, 0], [b1, L, 1], [a0, 0, 0], [b1, L, 1], [a1, 0, 1]]) { st.p.push(...pt); st.u.push(u, v); st.m.push(cx, cz); }
  }

  // GLB segment matrices for a run, made the first time it comes near (most runs never do)
  const segments = r => {
    const L = Math.hypot(r.bx - r.ax, r.bz - r.az), dx = (r.bx - r.ax) / L, dz = (r.bz - r.az) / L;
    const n = Math.max(1, Math.round(L / seg)), sl = L / n, yaw = Math.atan2(-dz, dx);
    r.m = new Float32Array(n * 16);
    for (let k = 0; k < n; k++) m4.compose(v3.set(r.ax + dx * sl * (k + 0.5), 0, r.az + dz * sl * (k + 0.5)), q.setFromAxisAngle(UPV, yaw), s3.set(sl / mx, H / my, H / my)).toArray(r.m, k * 16);
    return r.m;
  };

  let near = null;
  function build(scene, color) {
    const mat = stripMaterial(mobile, U, color);
    for (const [k, st] of strips) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(st.p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(st.u, 2));
      g.setAttribute('aMid', new THREE.Float32BufferAttribute(st.m, 2));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const me = new THREE.Mesh(g, mat); me.receiveShadow = true; scene.add(me);
      const [ix, iz] = k.split(',').map(Number); track(me, ix, iz);
    }
    if (geo) {
      const fm = mobile ? new THREE.MeshLambertMaterial({ map }) : new THREE.MeshStandardMaterial({ map, roughness: 0.85 });
      near = new THREE.InstancedMesh(geo, fm, DRAW_MAX);
      near.instanceMatrix.setUsage(THREE.DynamicDrawUsage); near.count = 0;
      near.castShadow = shadows; near.receiveShadow = true;
      near.boundingSphere = new THREE.Sphere(new THREE.Vector3(), nearR + 10);
      scene.add(near);
    } else U.uNear.value = 0;   // no GLB: the strip is drawn everywhere
  }

  let lx = 1e9, lz = 1e9;
  function update(px, pz) {
    if (!near || Math.hypot(px - lx, pz - lz) < STEP) return;
    lx = px; lz = pz;
    let n = 0; const R2 = nearR * nearR, arr = near.instanceMatrix.array;
    for (let i = Math.floor((px - nearR) / CELL); i <= Math.floor((px + nearR) / CELL); i++)
      for (let j = Math.floor((pz - nearR) / CELL); j <= Math.floor((pz + nearR) / CELL); j++) {
        const c = cells.get(i + ',' + j); if (!c) continue;
        for (const r of c) {
          if ((r.cx - px) ** 2 + (r.cz - pz) ** 2 >= R2) continue;
          const m = r.m || segments(r); if (n + m.length / 16 > DRAW_MAX) continue;
          arr.set(m, n * 16); n += m.length / 16;
        }
      }
    near.count = n; near.visible = n > 0; near.instanceMatrix.needsUpdate = true; near.boundingSphere.center.set(px, 1, pz);
    U.uCenter.value.set(px, 0, pz);
  }

  // Would moving from (x0, z0) to (x1, z1) go through a fence? True if the step crosses a run, or
  // ends within HIT_R of one while getting closer — so a bike already touching a fence can still
  // back or slide away from it. Gate gaps are simply not runs, so they stay open.
  const cross = (ax, az, bx, bz, cx, cz, dx, dz) => {
    const o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
    return o(ax, az, bx, bz, cx, cz) * o(ax, az, bx, bz, dx, dz) < 0 && o(cx, cz, dx, dz, ax, az) * o(cx, cz, dx, dz, bx, bz) < 0;
  };
  function hits(x0, z0, x1, z1) {
    const seen = new Set();
    for (const list of [hitGrid.q(x1, z1), hitGrid.q(x0, z0)]) for (const r of list) {
      if (seen.has(r)) continue; seen.add(r);
      if (cross(r.ax, r.az, r.bx, r.bz, x0, z0, x1, z1)) return true;
      const d1 = segDist(x1, z1, r.ax, r.az, r.bx, r.bz);
      if (d1 < HIT_R && d1 < segDist(x0, z0, r.ax, r.az, r.bx, r.bz)) return true;
    }
    return false;
  }

  return { add, build, update, hits, get runs() { return runs.length; } };
}
