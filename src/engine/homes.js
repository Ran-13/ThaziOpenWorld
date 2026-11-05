import * as THREE from './three.js';
import { h01 } from './osm.js';
import { contactShadowMaterial } from './fx.js';

// Kenney suburban houses on every real OSM footprint. A rectangular lot gets one fitted house,
// a large lot a grid of houses, and any other polygon its oriented bounding rectangle. Two LODs:
//  - detail: one InstancedMesh per GLB variant, holding only homes within `radius` of the player.
//    The instance list is rebuilt on the CPU every STEP metres of travel, so the draw-call count
//    stays at <= variant count no matter how big the town is.
//  - far: one InstancedMesh of a 16-triangle box + hip roof for every home. Its vertex shader
//    collapses the instances the detail set is drawing, so the swap costs no CPU work.
// The Kenney colormap is a palette of swatches, so the shader can tell roof / wall / glass apart
// by UV cell alone and restyle them: corrugated tin roofs with rust, plaster walls, lit windows.

const STEP = 16, CELL = 40;
// The sun's shadow camera spans only ~100 m, so the depth pass collapses detail homes beyond
// SHADOW_R instead of rasterising the whole detail ring into the shadow map.
const SHADOW_R = 75;
const FIT_MIN = 1.2, STRETCH = 1.2, INSET = 0.94;
const H_MIN = 2.8, H_MAX = 8.5;
// Lots bigger than one house (markets, schools, monastery grounds) become a grid of houses.
const LOT_MAX = 240, LOT_SIDE_MAX = 24, GRID_U = 11, GRID_V = 10, GRID_MAX = 6;

const HOME_GLSL = /* glsl */`
float hHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float hNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hHash( i ), hHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hHash( i + vec2( 0.0, 1.0 ) ), hHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// 1 when palette cell c lies in columns x0..x1 of row y (16 x 4 grid over the colormap).
float hIn( vec2 c, float x0, float x1, float y ) { return step( x0 - 0.5, c.x ) * step( c.x, x1 + 0.5 ) * step( abs( c.y - y ), 0.5 ); }
`;

// Phones get Phong rather than PBR: there is no environment map there to make metalness read as
// tin, and a Blinn highlight sells the sheet metal for a fraction of the GGX cost.
function detailMaterial(map, mobile, U) {
  const mat = mobile
    ? new THREE.MeshPhongMaterial({ map, specular: 0xffffff, shininess: 42 })
    : new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 });
  mat.defines = { HOME_BUMP: '' };
  mat.extensions = { derivatives: true };   // fwidth() on WebGL1 browsers
  mat.onBeforeCompile = sh => {
    sh.uniforms.uGlow = U.uGlow; sh.uniforms.uTime = U.uTime;
    sh.vertexShader = `attribute vec4 aWall;\nattribute vec4 aRoof;\nvarying vec4 vWall;\nvarying vec4 vRoof;\nvarying vec3 vHW;\nvarying vec3 vHN;\nvarying float vONy;\nvarying float vBaseY;\n` +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vWall = aWall; vRoof = aRoof; vONy = normal.y;
  mat4 hM = modelMatrix * instanceMatrix;
  vHW = ( hM * vec4( position, 1.0 ) ).xyz;
  vHN = normalize( mat3( hM ) * normal );
  vBaseY = hM[ 3 ].y;`);
    sh.fragmentShader = `uniform float uGlow;\nuniform float uTime;\nvarying vec4 vWall;\nvarying vec4 vRoof;\nvarying vec3 vHW;\nvarying vec3 vHN;\nvarying float vONy;\nvarying float vBaseY;\n` +
      `float hRoof = 0.0, hRust = 0.0, hGlass = 0.0, hS = 0.0, hFade = 0.0;\nvec2 hCd = vec2( 1.0, 0.0 );\n` + HOME_GLSL +
      sh.fragmentShader
        .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec2 hc = floor( vMapUv * vec2( 16.0, 4.0 ) );
  // green roof swatch, or grey trim swatch when it faces up (some variants have grey roofs)
  hRoof = max( hIn( hc, 0.0, 1.0, 1.0 ), hIn( hc, 0.0, 1.0, 2.0 ) * step( 0.3, vONy ) );
  hGlass = hIn( hc, 10.0, 11.0, 1.0 );
  float hWall = hIn( hc, 6.0, 7.0, 2.0 );
  vec3 hBase = sampledDiffuseColor.rgb;
  // plaster: per-house colour keeps the swatch's soft gradient; damp grime near the ground
  vec3 wallC = vWall.rgb * ( dot( hBase, vec3( 0.299, 0.587, 0.114 ) ) / 0.79 );
  wallC *= mix( 0.62, 1.0, smoothstep( 0.0, 0.9, vHW.y - vBaseY ) ) * ( 0.9 + 0.1 * hNoise( vHW.xz * 0.8 + vHW.y * 1.3 ) );
  // corrugated tin: ridges run down the slope, so the profile varies along the contour line
  vec3 hn = normalize( vHN );
  hCd = normalize( vec2( -hn.z, hn.x ) + vec2( 1e-4, 0.0 ) );
  hS = dot( vHW.xz, hCd ) / 0.16;
  hFade = 1.0 - smoothstep( 0.2, 0.55, fwidth( hS ) );
  float streak = hNoise( vec2( hS * 0.09, vHW.y * 0.6 ) );
  float blot = hNoise( vHW.xz * 0.45 + vRoof.a * 17.0 );
  hRust = smoothstep( 0.45, 0.85, blot * 0.6 + streak * 0.55 ) * vRoof.a * hRoof;
  vec3 roofC = mix( vRoof.rgb, vec3( 0.36, 0.13, 0.05 ) * ( 0.75 + 0.5 * streak ), hRust ) * ( 0.9 + 0.1 * sin( hS * 6.2832 ) * hFade );
  vec3 hCol = mix( hBase, wallC, hWall );
  hCol = mix( hCol, roofC, hRoof );
  hCol = mix( hCol, hBase * vec3( 0.42, 0.5, 0.58 ), hGlass );
  diffuseColor *= vec4( hCol, sampledDiffuseColor.a );
#endif`)
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
  roughnessFactor = mix( roughnessFactor, mix( 0.38, 0.85, hRust ), hRoof );
  roughnessFactor = mix( roughnessFactor, 0.12, hGlass );`)
        .replace('#include <metalnessmap_fragment>', `float metalnessFactor = metalness;
  metalnessFactor = mix( metalnessFactor, mix( 0.65, 0.1, hRust ), hRoof );`)
        .replace('#include <specularmap_fragment>', `float specularStrength = hRoof * ( 1.0 - hRust ) * 0.6 + hGlass * 0.9 + 0.03;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef HOME_BUMP
  normal = normalize( normal + mat3( viewMatrix ) * vec3( hCd.x, 0.0, hCd.y ) * cos( hS * 6.2832 ) * 0.32 * hFade * hRoof );
#endif`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // about half the homes have the lights on; a few of those flicker like a weak supply
  float hLit = step( 0.5, fract( vWall.a * 7.31 ) );
  float hFlick = 1.0 - 0.3 * step( 0.9, fract( vWall.a * 3.7 ) ) * step( 0.55, hNoise( vec2( uTime * 7.0, vWall.a * 40.0 ) ) );
  totalEmissiveRadiance += vec3( 1.0, 0.72, 0.4 ) * 1.6 * hGlass * hLit * uGlow * hFlick;`);
  };
  return mat;
}

function farMaterial(mobile, U) {
  const mat = mobile ? new THREE.MeshLambertMaterial() : new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCenter = U.uCenter; sh.uniforms.uR = U.uR; sh.uniforms.uGlow = U.uGlow;
    sh.vertexShader = `attribute float aPart;\nattribute vec4 aWall;\nattribute vec4 aRoof;\nuniform vec3 uCenter;\nuniform float uR;\nvarying vec3 vFarC;\nvarying vec3 vFarP;\nvarying float vFarLit;\n` +
      sh.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  vFarC = mix( aWall.rgb * 0.92, aRoof.rgb * ( 1.0 - 0.45 * aRoof.a ), aPart );
  vFarP = vec3( position.x + position.z, position.y, aPart );
  vFarLit = step( 0.5, fract( aWall.a * 7.31 ) );   // same houses as the detail shader lights`)
        .replace('#include <project_vertex>', `#include <project_vertex>
  // the detail set draws this home: collapse every vertex to one point so the triangles vanish
  if ( distance( ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xz, uCenter.xz ) < uR ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );`);
    sh.fragmentShader = 'uniform float uGlow;\nvarying vec3 vFarC;\nvarying vec3 vFarP;\nvarying float vFarLit;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vFarC;')
      // a row of three lit windows per wall at night keeps the far town from going black
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float fWin = ( 1.0 - vFarP.z ) * step( 0.3, vFarP.y ) * step( vFarP.y, 0.62 ) * step( 0.55, fract( vFarP.x * 3.0 + 0.25 ) );
  totalEmissiveRadiance += vec3( 1.0, 0.72, 0.4 ) * 1.3 * fWin * vFarLit * uGlow;`);
  };
  return mat;
}

function shadowDepthMaterial(U) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCenter = U.uCenter; sh.uniforms.uShadowR = U.uShadowR;
    sh.vertexShader = 'uniform vec3 uCenter;\nuniform float uShadowR;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  if ( distance( ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xz, uCenter.xz ) > uShadowR ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );`);
  };
  return mat;
}

// Unit box (walls 0..1) with a hip roof rising to 1.5; aPart marks roof triangles.
function farGeometry() {
  const r = 0.25, P = [], part = [];
  const quad = (a, b, c, d, k) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) part.push(k); };
  const tri = (a, b, c, k) => { P.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) part.push(k); };
  const c = [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]];
  for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], 1, b[1]], [a[0], 1, a[1]], 0); }
  quad([-0.5, 1, 0.5], [0.5, 1, 0.5], [r, 1.5, 0], [-r, 1.5, 0], 1);
  quad([0.5, 1, -0.5], [-0.5, 1, -0.5], [-r, 1.5, 0], [r, 1.5, 0], 1);
  tri([0.5, 1, 0.5], [0.5, 1, -0.5], [r, 1.5, 0], 1);
  tri([-0.5, 1, -0.5], [-0.5, 1, 0.5], [-r, 1.5, 0], 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.computeVertexNormals();
  return g;
}

// One geometry per variant in "placed" model space: centred, base at y=0, front facing +Z.
function variantOf(asset) {
  let mesh = null;
  asset.scene.updateMatrixWorld(true);
  asset.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) return null;
  const geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) if (mesh.geometry.attributes[k]) geo.setAttribute(k, mesh.geometry.attributes[k].clone());
  if (mesh.geometry.index) geo.setIndex(mesh.geometry.index.clone());
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const s = geo.boundingBox.getSize(new THREE.Vector3());
  return { geo, map: mesh.material.map, mx: s.x, my: s.y, mz: s.z, homes: [] };
}

export function createHomes(assets, { mobile, shadows, radius, walls, roofs, fade }) {
  const variants = assets.map(variantOf).filter(Boolean);
  if (!variants.length) return null;
  const wallC = walls.map(h => new THREE.Color(h)), roofC = roofs.map(h => new THREE.Color(h));
  const U = { uGlow: { value: 0 }, uTime: { value: 0 }, uCenter: { value: new THREE.Vector3(1e9, 0, 1e9) }, uR: { value: radius }, uShadowR: { value: SHADOW_R } };
  const homes = [], cells = new Map(), stilts = [];
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);

  const isRect = pts => {
    if (pts.length !== 4) return false;
    const E = pts.map((p, i) => { const n = pts[(i + 1) % 4]; return [n[0] - p[0], n[1] - p[1]]; }), L = E.map(e => Math.hypot(e[0], e[1]));
    if (L.some(l => l < 0.5)) return false;
    const cos = Math.abs(E[0][0] * E[1][0] + E[0][1] * E[1][1]) / (L[0] * L[1]);
    return cos <= 0.26 && Math.abs(L[0] - L[2]) <= 0.25 * Math.max(L[0], L[2]) && Math.abs(L[1] - L[3]) <= 0.25 * Math.max(L[1], L[3]);
  };
  // Minimum-area rectangle aligned to one of the polygon's own edges, shrunk towards its centre so
  // the house stays (mostly) inside an L-shaped or irregular footprint.
  const obb = (pts, shrink) => {
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.3) continue;
      const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (const p of pts) { const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const ar = (u1 - u0) * (v1 - v0); if (!best || ar < best.ar) best = { ar, ux, uz, u0, u1, v0, v1 };
    }
    if (!best) return null;
    const { ux, uz } = best, cu = (best.u0 + best.u1) / 2, cv = (best.v0 + best.v1) / 2, hu = (best.u1 - best.u0) / 2 * shrink, hv = (best.v1 - best.v0) / 2 * shrink;
    const P = (u, v) => [u * ux - v * uz, u * uz + v * ux];
    return [P(cu - hu, cv - hv), P(cu + hu, cv - hv), P(cu + hu, cv + hv), P(cu - hu, cv + hv)];
  };

  // q: rectangle whose edge 0 (q0 -> q1) faces the street. Places one house; null if degenerate.
  function fitRect(q, hb, lift) {
    const F = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), D = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
    if (F < FIT_MIN || D < FIT_MIN) return null;
    const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cz = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const ex = (q[1][0] - q[0][0]) / F, ez = (q[1][1] - q[0][1]) / F;
    let nx = -ez, nz = ex;
    if (((q[0][0] + q[1][0]) / 2 - cx) * nx + ((q[0][1] + q[1][1]) / 2 - cz) * nz < 0) { nx = -nx; nz = -nz; }

    // closest aspect ratio wins; near-ties are broken by the lot hash for variety
    const want = Math.log(F / D), score = variants.map(v => Math.abs(want - Math.log(v.mx / v.mz)));
    const best = Math.min(...score), pool = variants.map((v, i) => i).filter(i => score[i] <= best + 0.12);
    const vi = pool[Math.floor(h01(hb, 40) * pool.length) % pool.length], V = variants[vi];
    const sx = F / V.mx, sz = D / V.mz, s = Math.min(sx, sz);
    const fx = Math.min(sx, s * STRETCH) * INSET, fz = Math.min(sz, s * STRETCH) * INSET;
    const fy = Math.min(H_MAX / V.my, Math.max(H_MIN / V.my, Math.sqrt(fx * fz)));
    const wx = V.mx * fx, wz = V.mz * fz, off = (D - wz) * 0.25;   // sit nearer the street than the back fence
    const x = cx + nx * off, z = cz + nz * off, yaw = Math.atan2(nx, nz);

    const m = new Float32Array(16);
    m4.compose(v3.set(x, lift, z), q4.setFromAxisAngle(UPV, yaw), s3.set(fx, fy, fz)).toArray(m);
    const wc = wallC[Math.floor(h01(hb, 41) * wallC.length) % wallC.length], rc = roofC[Math.floor(h01(hb, 42) * roofC.length) % roofC.length];
    const rust = Math.pow(h01(hb, 43), 1.6) * 0.95;
    const home = { x, z, v: vi, m, w: [wc.r, wc.g, wc.b, h01(hb, 44)], r: [rc.r, rc.g, rc.b, rust], far: [wx, V.my * fy / 1.5, wz], yaw, lift, posts: [] };
    if (lift) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), hx = wx / 2 - 0.2, hz = wz / 2 - 0.2, nX = wx > 6 ? 3 : 2, nZ = wz > 6 ? 3 : 2;
      for (let i = 0; i < nX; i++) for (let j = 0; j < nZ; j++) {
        const lx = -hx + 2 * hx * i / (nX - 1), lz = -hz + 2 * hz * j / (nZ - 1);
        home.posts.push([x + lx * cy + lz * sy, z - lx * sy + lz * cy]);
      }
      stilts.push(home);
    }
    homes.push(home); V.homes.push(home);
    const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(home);
    return home;
  }

  // pts: real footprint. frontOf(rect) -> index of the rect edge facing the street (-1 = unknown).
  // Returns the houses placed (one for a normal lot, several for a big one).
  function place(pts, hb, frontOf, lift) {
    const rect = isRect(pts) ? pts : obb(pts, 0.88);
    if (!rect) return [];
    let fe = frontOf(rect);
    if (fe < 0) fe = Math.hypot(rect[1][0] - rect[0][0], rect[1][1] - rect[0][1]) >= Math.hypot(rect[2][0] - rect[1][0], rect[2][1] - rect[1][1]) ? 0 : 1;
    const q = [0, 1, 2, 3].map(i => rect[(fe + i) % 4]);
    const F = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), D = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
    if (F * D <= LOT_MAX && F <= LOT_SIDE_MAX && D <= LOT_SIDE_MAX) { const h = fitRect(q, hb, lift); return h ? [h] : []; }
    // big lot: a grid of houses, every row facing the lot's street side
    const nu = Math.min(GRID_MAX, Math.max(1, Math.round(F / GRID_U))), nv = Math.min(GRID_MAX, Math.max(1, Math.round(D / GRID_V)));
    const P = (u, v) => [q[0][0] + (q[1][0] - q[0][0]) * u + (q[3][0] - q[0][0]) * v, q[0][1] + (q[1][1] - q[0][1]) * u + (q[3][1] - q[0][1]) * v];
    const out = [];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
      const h = fitRect([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], (hb ^ Math.imul(i * 31 + j + 1, 0x9e3779b1)) >>> 0, 0);
      if (h) out.push(h);
    }
    return out;
  }

  let farMesh = null, stiltMeshes = null;
  const detail = [];
  function build(scene, woodMat) {
    const mat = detailMaterial(variants[0].map, mobile, U), depthMat = shadows ? shadowDepthMaterial(U) : null;
    for (const V of variants) {
      if (!V.homes.length) continue;
      const n = V.homes.length, im = new THREE.InstancedMesh(V.geo, mat, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const aw = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const ar = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
      V.geo.setAttribute('aWall', aw); V.geo.setAttribute('aRoof', ar);
      im.count = 0; im.castShadow = shadows; im.receiveShadow = true;
      if (depthMat) im.customDepthMaterial = depthMat;
      im.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius + 20);
      scene.add(im); detail.push({ V, im, aw, ar });
    }
    // far LOD: every home, static
    const g = farGeometry(), n = homes.length;
    const aw = new Float32Array(n * 4), ar = new Float32Array(n * 4);
    farMesh = new THREE.InstancedMesh(g, farMaterial(mobile, U), n);
    homes.forEach((h, i) => {
      m4.compose(v3.set(h.x, h.lift, h.z), q4.setFromAxisAngle(UPV, h.yaw), s3.set(h.far[0], h.far[1], h.far[2]));
      farMesh.setMatrixAt(i, m4); aw.set(h.w, i * 4); ar.set(h.r, i * 4);
    });
    g.setAttribute('aWall', new THREE.InstancedBufferAttribute(aw, 4));
    g.setAttribute('aRoof', new THREE.InstancedBufferAttribute(ar, 4));
    farMesh.computeBoundingSphere(); farMesh.receiveShadow = true; scene.add(farMesh);
    const cg = new THREE.PlaneGeometry(1, 1); cg.rotateX(-Math.PI / 2);
    // AO pad: phones have no shadow map and the desktop one only spans ~100 m
    const contact = new THREE.InstancedMesh(cg, contactShadowMaterial(fade, 0.42), n);
    homes.forEach((h, i) => contact.setMatrixAt(i, m4.compose(v3.set(h.x, 0.04, h.z), q4.setFromAxisAngle(UPV, h.yaw), s3.set(h.far[0] * 1.35 + 1, 1, h.far[2] * 1.35 + 1))));
    contact.computeBoundingSphere(); contact.renderOrder = 1; scene.add(contact);
    // stilt houses: a timber deck on posts. Like the houses, only the ones in the detail ring are
    // drawn (the far box already floats at deck height), so it is two small draw calls in total.
    if (stilts.length) {
      for (const h of stilts) {
        h.slab = m4.compose(v3.set(h.x, h.lift, h.z), q4.setFromAxisAngle(UPV, h.yaw), s3.set(h.far[0] + 0.3, 0.22, h.far[2] + 0.3)).toArray(new Float32Array(16));
        h.postM = h.posts.map(([x, z]) => m4.compose(v3.set(x, 0, z), q4.setFromAxisAngle(UPV, h.yaw + Math.PI / 4), s3.set(1, h.lift, 1)).toArray(new Float32Array(16)));
      }
      const sg = new THREE.BoxGeometry(1, 1, 1); sg.translate(0, -0.5, 0);
      const pg = new THREE.CylinderGeometry(0.12, 0.14, 1, 4, 1, true); pg.translate(0, 0.5, 0);
      stiltMeshes = [new THREE.InstancedMesh(sg, woodMat, stilts.length), new THREE.InstancedMesh(pg, woodMat, stilts.reduce((s, h) => s + h.posts.length, 0))];
      for (const m of stiltMeshes) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0;
        m.castShadow = shadows; m.receiveShadow = true;
        if (depthMat) m.customDepthMaterial = depthMat;
        m.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius + 20);
        scene.add(m);
      }
    }
  }

  let lx = 1e9, lz = 1e9;
  function update(px, pz, glow, t) {
    U.uGlow.value = glow; U.uTime.value = t;
    if (Math.hypot(px - lx, pz - lz) < STEP) return;
    lx = px; lz = pz;
    for (const d of detail) d.n = 0;
    let ns = 0, np = 0;
    const byV = new Map(detail.map(d => [d.V, d])), R2 = radius * radius;
    for (let i = Math.floor((px - radius) / CELL); i <= Math.floor((px + radius) / CELL); i++)
      for (let j = Math.floor((pz - radius) / CELL); j <= Math.floor((pz + radius) / CELL); j++) {
        const c = cells.get(i + ',' + j); if (!c) continue;
        for (const h of c) {
          if ((h.x - px) ** 2 + (h.z - pz) ** 2 >= R2) continue;
          const d = byV.get(variants[h.v]), k = d.n++;
          d.im.instanceMatrix.array.set(h.m, k * 16); d.aw.array.set(h.w, k * 4); d.ar.array.set(h.r, k * 4);
          if (h.slab) {
            stiltMeshes[0].instanceMatrix.array.set(h.slab, ns++ * 16);
            for (const pm of h.postM) stiltMeshes[1].instanceMatrix.array.set(pm, np++ * 16);
          }
        }
      }
    for (const d of detail) {
      d.im.count = d.n; d.im.visible = d.n > 0;
      d.im.instanceMatrix.needsUpdate = d.aw.needsUpdate = d.ar.needsUpdate = true;
      d.im.boundingSphere.center.set(px, 4, pz);
    }
    if (stiltMeshes) [ns, np].forEach((n, i) => {
      const m = stiltMeshes[i]; m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; m.boundingSphere.center.set(px, 2, pz);
    });
    U.uCenter.value.set(px, 0, pz);
  }

  return { place, build, update, get count() { return homes.length; } };
}
