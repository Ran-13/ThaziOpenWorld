import * as THREE from './three.js';
import * as O from './osm.js';
import { makeTextures } from './textures.js';
import { std, tube, bake, makeBike, makePagoda, makePagodaMats, makeStation, makeTrainCar, makeVehicle, vehicleLights, makePerson, makeHorseCart } from './models.js';
import { loadAssets, cloneAsset, instancedFromAsset } from './assets.js';
import { createHomes } from './homes.js';
import { makePlots } from './plots.js';
import { createFences } from './fences.js';
import { makeComposer, makeSky, makeWaterMaterial, makeMotes, makePuffs, contactShadowMaterial } from './fx.js';

const { BB, px, pz, HW, HH, BX, BZ, MR, UP, my, rnd, pick, mpick, col, MAJOR, DRIVE, WALLS, CAR_COLS, ITEMS, pip, area, centroid, segDist, clipSeg, Grid, Builder, bhash, h01 } = O;
export { my };
const UNPAVED = /unpaved|dirt|ground|gravel|sand|earth|compacted/;
const TIN = ['#d6dadd', '#c9ccd0', '#b98d6a', '#a85a44', '#6f8fa6', '#7f9a7a', '#e0e2e4', '#c08a5a', '#8a9e7a', '#c4a882', '#9aabb8', '#d4b896'];

async function loadSatellite(msg, small) {
  const z = small ? 17 : 18, n = 2 ** z, BLK = 4;
  const tx = lon => (lon + 180) / 360 * n, ty = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
  const lonOf = x => x / n * 360 - 180, latOf = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const X0 = Math.floor(tx(BB.w)), X1 = Math.floor(tx(BB.e)), Y0 = Math.floor(ty(BB.n)), Y1 = Math.floor(ty(BB.s));
  const NX = X1 - X0 + 1, NY = Y1 - Y0 + 1, total = NX * NY;
  const SMS = 64 / (z === 18 ? 2 : 1);
  const sm = document.createElement('canvas'); sm.width = NX * SMS; sm.height = NY * SMS; const smc = sm.getContext('2d');
  const blocks = [];
  for (let bx = 0; bx < NX; bx += BLK) for (let by = 0; by < NY; by += BLK) {
    const w = Math.min(BLK, NX - bx), h = Math.min(BLK, NY - by), c = document.createElement('canvas'); c.width = w * 256; c.height = h * 256;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#cdb58a'; ctx.fillRect(0, 0, c.width, c.height);
    blocks.push({ bx, by, w, h, c, ctx, wx0: px(lonOf(X0 + bx)), wx1: px(lonOf(X0 + bx + w)), wz0: pz(latOf(Y0 + by)), wz1: pz(latOf(Y0 + by + h)) });
  }
  let ok = 0, done = 0, i = 0;
  const list = []; for (const b of blocks) for (let x = 0; x < b.w; x++) for (let y = 0; y < b.h; y++) list.push([b, x, y]);
  const worker = async () => { while (i < list.length) { const [b, x, y] = list[i++]; await new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; const to = setTimeout(() => { im.src = ''; done++; res(); }, 15000);
    im.onload = () => { clearTimeout(to); b.ctx.drawImage(im, x * 256, y * 256); smc.drawImage(im, (b.bx + x) * SMS, (b.by + y) * SMS, SMS, SMS); ok++; done++; if (done % 12 === 0) msg(`ဂြိုဟ်တုဓာတ်ပုံ ရယူနေသည်… ${my(Math.round(done / total * 100))}%`); res(); };
    im.onerror = () => { clearTimeout(to); done++; res(); };
    im.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${Y0 + b.by + y}/${X0 + b.bx + x}`; }); } };
  await Promise.all(Array.from({ length: 12 }, worker));
  if (ok < total * 0.6) return null;
  let sample; try { sample = smc.getImageData(0, 0, sm.width, sm.height); } catch (e) { return null; }
  for (const b of blocks) { const o = document.createElement('canvas'); o.width = b.c.width; o.height = b.c.height; const oc = o.getContext('2d'); oc.filter = 'saturate(0.85) brightness(1.1) contrast(1.06)'; oc.drawImage(b.c, 0, 0); b.c = o; delete b.ctx; }
  return { blocks, sample, wx0: px(lonOf(X0)), wx1: px(lonOf(X1 + 1)), wz0: pz(latOf(Y0)), wz1: pz(latOf(Y1 + 1)) };
}

let AC = null;
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, t0, dur, type = 'sine', vol = 0.2) {
  const a = ac(); if (!a) return; const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = f; o.connect(g); g.connect(a.destination);
  const t = a.currentTime + t0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.05);
}
const SND = {
  bell() { tone(2093, 0, 1.0, 'sine', 0.18); tone(3140, 0, 0.6, 'sine', 0.07); tone(2093, 0.18, 0.9, 'sine', 0.15); tone(3140, 0.18, 0.5, 'sine', 0.06); },
  collect() { [880, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.25, 'triangle', 0.12)); },
  pick() { [660, 990].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.12)); },
  done() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.5, 'triangle', 0.12)); },
  bump() { tone(120, 0, 0.15, 'square', 0.06); },
  horn() { tone(392, 0, 0.42, 'sawtooth', 0.07); tone(494, 0, 0.42, 'sawtooth', 0.06); },
};

export async function createGame(o) {
  const { container, minimap, joyBase, joyKnob } = o;
  const modelsBase = o.modelsBase || 'models/';
  const hud = o.onHud || (() => {}), ev = o.onEvent || (() => {});
  const opts = Object.assign({ dayMinutes: 8, startHour: 16, traffic: 'Normal', quality: 'Best', realClock: false }, o.options || {});
  const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
  const best = opts.quality !== 'Fast';
  const mobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  // Phones skip post (tilt-shift is a blur). Cap below native DPR 3, but keep enough pixels
  // that façades stay crisp — adaptive DPR can still drop if the frame budget slips.
  const post = best && !mobile;
  const MAXPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : best ? (post ? 2 : 3) : 1.25);
  let pr = MAXPR;
  const yieldToPaint = () => new Promise(r => setTimeout(r, 0));
  let prog = 0;
  const msg = (m, p) => { if (p != null) prog = p; hud({ loading: true, loadMsg: m, progress: prog }); };
  // Phones skip the animated person GLB (skinned mixers are CPU-heavy) and load fewer variants.
  // The kit houses, trees, planters and fences are light and stay on.
  const assetOpts = mobile ? { skip: ['person'], oneVariant: true } : {};

  msg('စတင်နေသည်…', 0.03);
  msg('စတင်နေသည်…', 0.08);
  const [data0, assets] = await Promise.all([O.fetchOSM(msg), loadAssets(modelsBase, msg, assetOpts)]);
  let data = data0; if (!data) { msg('အင်တာနက် မရပါ — နမူနာမြို့ကို တည်ဆောက်နေသည်…', 0.45); data = O.fallbackData(); }
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
  msg('မြို့ကို တည်ဆောက်နေသည်…', 0.5);
  await new Promise(r => setTimeout(r, 30));
  const TX = makeTextures();
  const W = O.parse(data);
  const isMobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const sat = opts.ground === 'Satellite' ? await loadSatellite(msg, isMobile) : null;
  msg('မြို့ကို တည်ဆောက်နေသည်…', 0.58);

  // ---------- renderer / scene ----------
  // Light MSAA on phones: with no post path this is cheap edge cleanup vs a soft upscale.
  const renderer = new THREE.WebGLRenderer({ antialias: !post, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = best && !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = best ? 1.08 : mobile ? 1.05 : 0.98;
  // Keep wall/road atlases crisp when the chase cam is close on a phone.
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  Object.values(TX).forEach(t => { if (t && t.isTexture) t.anisotropy = Math.max(t.anisotropy || 1, maxAniso); });
  container.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none' });
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  // Outdoor gradient env (not RoomEnvironment) so tin roofs and vehicle paint pick up sky/ground color.
  if (!mobile) {
    const envSc = new THREE.Scene();
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color('#5fa8e0') }, hor: { value: new THREE.Color('#d7eef8') }, gnd: { value: new THREE.Color('#b89562') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top, hor, gnd; void main(){ float y = normalize(vP).y; vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y,0.0,1.0), 0.42)) : mix(hor, gnd, pow(clamp(-y,0.0,1.0), 0.3)); gl_FragColor = vec4(c, 1.0); }',
    });
    envSc.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), envMat));
    scene.environment = pmrem.fromScene(envSc, 0.02).texture;
    envMat.dispose(); envSc.children[0].geometry.dispose();
  }
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(best ? 42 : mobile ? 44 : 48, 1, 0.6, mobile ? 520 : 1400);
  // Softer/farther fog on phones so mid-street houses stay readable instead of milky.
  scene.fog = new THREE.Fog(0xbfe4f5, mobile ? 140 : 200, mobile ? 520 : 980);
  const CHUNK = 160, ck = (x, z) => Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
  const cullMeshes = [];
  const CULL_R = mobile ? 2 : 6;
  // Small props (windows, doors, fences, bushes, lamp arms...) are a few pixels past a couple of
  // chunks but cost a draw call per chunk each, so they get a tighter ring than walls and roads.
  const DETAIL_R = mobile ? 1 : 2;
  const trackChunk = (me, ix, iz, r = CULL_R) => { cullMeshes.push({ me, ix, iz, r }); };
  class ChunkB {
    constructor(us) { this.m = new Map(); this.us = us; }
    at(x, z) { const k = ck(x, z); let b = this.m.get(k); if (!b) { b = new Builder(); if (this.us) b.us = this.us; this.m.set(k, b); } return b; }
    poly(pts, y, c, down) { const [x, z] = centroid(pts); this.at(x, z).poly(pts, y, c, down); }
    seg(ax, az, bx, bz, w, y, c) { this.at((ax + bx) / 2, (az + bz) / 2).seg(ax, az, bx, bz, w, y, c); }
    disc(x, z, r, y, c) { this.at(x, z).disc(x, z, r, y, c, 14); }
    segUV(ax, az, bx, bz, w, y, c, v0, v1) { this.at((ax + bx) / 2, (az + bz) / 2).segUV(ax, az, bx, bz, w, y, c, v0, v1); }
    quadUV(aL, bL, bR, aR, y, c, v0, v1) { const cx = (aL[0] + bL[0] + bR[0] + aR[0]) / 4, cz = (aL[1] + bL[1] + bR[1] + aR[1]) / 4; this.at(cx, cz).quad([aL[0], y, aL[1]], [bL[0], y, bL[1]], [bR[0], y, bR[1]], [aR[0], y, aR[1]], c, UP, [0, v0], [0, v1], [1, v1], [1, v0]); }
    meshes(mat, cast, recv, order, r) {
      for (const [k, b] of this.m) if (!b.empty) {
        const me = b.mesh(mat); me.castShadow = cast; me.receiveShadow = recv; if (order) me.renderOrder = order;
        scene.add(me); const p = k.split(','); trackChunk(me, +p[0], +p[1], r);
      }
    }
  }
  const sky = makeSky(!mobile); scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xe8f4ff, 0xc9a878, mobile ? 1.55 : 0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, mobile ? 1.6 : 2.55); sun.castShadow = best && !mobile;
  const SH = best && !mobile ? 2048 : 1024, SR = 50;
  sun.shadow.mapSize.set(SH, SH); Object.assign(sun.shadow.camera, { left: -SR, right: SR, top: SR, bottom: -SR, near: 1, far: 420 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.28; sun.shadow.radius = 2.2;
  // Soft fill on desktop only — phones already boost hemi and skip the second light.
  const fill = mobile ? null : new THREE.DirectionalLight(0xb8d4f0, 0.35);
  if (fill) scene.add(fill, fill.target);
  scene.add(sun, sun.target);

  // ---------- spatial indices ----------
  const obs = new Grid(25), segs = new Grid(25);
  const addObs = (pts, kind) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); } const it = { pts, x0, z0, x1, z1, kind }; obs.add(it, x0, z0, x1, z1); return it; };
  const addCircle = (x, z, r) => obs.add({ circle: true, x, z, r, x0: x - r, z0: z - r, x1: x + r, z1: z + r }, x - r, z - r, x + r, z + r);
  const blocked = (x, z) => { for (const it of obs.q(x, z)) { if (it.dead || x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue; if (it.circle) { if (Math.hypot(x - it.x, z - it.z) < it.r) return true; } else if (pip(x, z, it.pts)) return true; } return false; };
  const nearSeg = (x, z) => { let m = 1e9, best = null; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of segs.q(x + i * 25, z + j * 25)) { const d = segDist(x, z, s[0], s[1], s[2], s[3]) - s[4] / 2; if (d < m) { m = d; best = s; } } return [m, best]; };
  const roadClear = (x, z) => nearSeg(x, z)[0];
  const nearRoadName = (x, z) => { let m = 40, nm = null; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of segs.q(x + i * 25, z + j * 25)) { if (!s[5]) continue; const d = segDist(x, z, s[0], s[1], s[2], s[3]); if (d < m) { m = d; nm = s[5]; } } return nm; };

  const roadSegs = [];
  for (const r of W.roads) for (let i = 0; i < r.pts.length - 1; i++) {
    const c = clipSeg(r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]); if (!c) continue;
    const unp = r.type === 'track' || UNPAVED.test(r.tags.surface || '');
    const s = [c[0], c[1], c[2], c[3], r.w, r.name, r, unp]; roadSegs.push(s);
    segs.add(s, Math.min(c[0], c[2]) - r.w, Math.min(c[1], c[3]) - r.w, Math.max(c[0], c[2]) + r.w, Math.max(c[1], c[3]) + r.w);
  }
  for (const w of W.waters) addObs(w, 'water');
  for (const p of W.pagodas) addCircle(p.x, p.z, p.r * 1.25);
  for (const b of W.buildings) b.ob = addObs(b.pts, 'b');

  // ---------- station (placed before infill so houses avoid it) ----------
  let stationPoi = W.pois.find(p => p.tags.railway === 'station');
  const railSegs = [];
  for (const r of W.rails) for (let i = 0; i < r.pts.length - 1; i++) { const c = clipSeg(r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]); if (c) railSegs.push(c); }
  // Rails get their own index rather than going into `obs`: poseBlocked() is built on blocked(),
  // so an obstacle here would stop the player ever crossing the tracks.
  const RAIL_HW = 6;                       // matches the station platform band (x 2.1 -> 7.1)
  const railG = new Grid(25);
  for (const c of railSegs) railG.add(c, Math.min(c[0], c[2]) - RAIL_HW, Math.min(c[1], c[3]) - RAIL_HW, Math.max(c[0], c[2]) + RAIL_HW, Math.max(c[1], c[3]) + RAIL_HW);
  const railClear = (x, z) => { let m = 1e9; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of railG.q(x + i * 25, z + j * 25)) { const d = segDist(x, z, s[0], s[1], s[2], s[3]); if (d < m) m = d; } return m; };
  let stationRects = [];
  if (railSegs.length) {
    const ref = stationPoi || { x: 0, z: 0 };
    let bs = null, bd = 1e9, bp = null;
    for (const c of railSegs) { const dx = c[2] - c[0], dz = c[3] - c[1], l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((ref.x - c[0]) * dx + (ref.z - c[1]) * dz) / l2)); const x = c[0] + dx * t, z = c[1] + dz * t, d = Math.hypot(ref.x - x, ref.z - z); if (d < bd && Math.hypot(dx, dz) > 20) { bd = d; bs = c; bp = [x, z]; } }
    if (bs && bd < 250) {
      const th = Math.atan2(bs[2] - bs[0], bs[3] - bs[1]), lx = Math.cos(th), lz = -Math.sin(th);
      const s = stationPoi ? (Math.sign((stationPoi.x - bp[0]) * lx + (stationPoi.z - bp[1]) * lz) || 1) : 1;
      const st = makeStation(TX, 110); st.group.position.set(bp[0], 0, bp[1]); st.group.rotation.y = th; st.group.scale.x = s; scene.add(st.group);
      st.group.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const toW = (x, z) => [bp[0] + s * x * Math.cos(th) + z * Math.sin(th), bp[1] - s * x * Math.sin(th) + z * Math.cos(th)];
      stationRects = st.rects.map(([x0, x1, z0, z1]) => [toW(x0, z0), toW(x1, z0), toW(x1, z1), toW(x0, z1)]);
      for (const b of W.buildings) { const [cx, cz] = centroid(b.pts); if (stationRects.some(r => pip(cx, cz, r))) { b.dead = true; b.ob.dead = true; } }
      W.buildings = W.buildings.filter(b => !b.dead);
      stationRects.forEach(r => addObs(r, 'station'));
      if (!stationPoi) { const [sx, sz] = toW(11, 0); stationPoi = { x: sx, z: sz, tags: { railway: 'station' }, name: 'သာစည်ဘူတာ', en: 'Thazi Station', kind: 'ဘူတာရုံ', important: true }; W.pois.push(stationPoi); }
    }
  }

  // OSM maps buildings right up to (and over) the track; drop anything inside the corridor
  if (railSegs.length) {
    for (const b of W.buildings) {
      if (b.dead) continue;
      const [cx, cz] = centroid(b.pts);
      if (railClear(cx, cz) < RAIL_HW || b.pts.some(p => railClear(p[0], p[1]) < RAIL_HW)) { b.dead = true; b.ob.dead = true; }
    }
    W.buildings = W.buildings.filter(b => !b.dead);
  }

  // ---------- procedural infill ----------
  if (W.buildings.length < 400) {
    msg('အိမ်ခြေများ ဖြည့်စွက်နေသည်…', 0.68);
    const FILL = new Set(['residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'living_street', 'service', 'road', 'track']);
    let added = 0;
    const FILL_CAP = mobile ? 800 : 2600;
    for (const s of roadSegs) {
      if (added > FILL_CAP) break;
      const r = s[6]; if (!FILL.has(r.type)) continue;
      const dx = s[2] - s[0], dz = s[3] - s[1], L = Math.hypot(dx, dz); if (L < 14) continue;
      const fx = dx / L, fz = dz / L, nx = -fz, nz = fx, dens = r.type === 'track' ? 0.35 : 0.72;
      for (let d = 7; d < L - 7; d += 11 + rnd() * 6) for (const side of [-1, 1]) {
        if (rnd() > dens) continue;
        const dep = 6 + rnd() * 4.5, wid = 5.5 + rnd() * 3.5, off = r.w / 2 + 2.6 + dep / 2;
        const cx = s[0] + fx * d + nx * side * off, cz = s[1] + fz * d + nz * side * off;
        const c = [[-wid / 2, -dep / 2], [wid / 2, -dep / 2], [wid / 2, dep / 2], [-wid / 2, dep / 2]].map(([u, v]) => [cx + fx * u + nx * v, cz + fz * u + nz * v]);
        if (c.some(p => Math.abs(p[0]) > BX - 3 || Math.abs(p[1]) > BZ - 3 || blocked(p[0], p[1]) || roadClear(p[0], p[1]) < 1.0 || railClear(p[0], p[1]) < RAIL_HW) || blocked(cx, cz) || railClear(cx, cz) < RAIL_HW) continue;
        const b = { pts: c, tags: { building: 'house' }, proc: true }; b.ob = addObs(c, 'b'); W.buildings.push(b); added++;
      }
    }
  }

  // ---------- ground ----------
  const G = new ChunkB(6);
  if (!sat) for (const g of W.greens.sort((a, b) => a.y - b.y)) G.poly(g.pts, g.y, col(g.color));
  // compounds (plots.js): their bare-earth yards go into the ground chunks, fences come later
  msg('ခြံဝင်းများ ဆွဲနေသည်…', 0.66);
  const plots = makePlots(W.buildings, roadSegs.map(r => [r[0], r[1], r[2], r[3], r[4], 'r']).concat(railSegs.map(c => [c[0], c[1], c[2], c[3], 7, 'x'])));
  if (!sat) {
    const YARD_C = ['#d9c49a', '#d2b98c', '#cdbb93', '#d8c8a2', '#c9b48a', '#bfc98e'].map(col);
    plots.forEach((pl, i) => { if (pl) { const [cx, cz] = centroid(W.buildings[i].pts); G.poly(pl.p, 0.03, YARD_C[Math.floor(h01(bhash(cx, cz), 50) * YARD_C.length) % YARD_C.length]); } });
  }
  const bedC = col('#6f9c94');
  for (const w of W.waters) G.poly(w, 0.025, bedC);
  const order = s => (MAJOR.has(s[6].type) ? 3 : DRIVE.has(s[6].type) ? 2 : 1);
  const sorted = roadSegs.slice().sort((a, b) => order(a) - order(b));
  // Roads in the Kenney kit's own colours, sampled from its tiles: driveway slate for streets with
  // traffic, path grey for footways and dirt tracks. Laid continuously along the real OSM
  // centre-lines with mitred bends (the kit's straight tiles would gap and overlap at every bend).
  const DRIVE_C = col('#4d515e'), PATH_C = col('#747990');
  const RK = new ChunkB(), MK = new ChunkB();
  const ordR = r => (MAJOR.has(r.type) ? 3 : DRIVE.has(r.type) ? 2 : 1);
  // Road markings on paved streets, by lane count (see `lines` below). Nodes shared by two or more ways are junctions; markings stop short of them so
  // lines never run across a crossing street.
  const MARK_C = col('#eeeee4'), DASH = 3, GAP = 3, LINE_W = 0.14;
  const nodeUse = new Map();
  for (const r of W.roads) if (r.nodes) for (const n of new Set(r.nodes)) nodeUse.set(n, (nodeUse.get(n) || 0) + 1);
  // The two one-way halves of a divided road share a ref/name; their markings may meet in the
  // middle. Any other road's surface (a merging or crossing street) gets no paint from this one.
  const pairKey = r => r.oneway && (r.tags.ref || r.name);
  const onOtherRoad = (x, z, r) => {
    for (const sg of segs.q(x, z)) {
      const o = sg[6]; if (o === r || (pairKey(o) && pairKey(o) === pairKey(r))) continue;
      if (segDist(x, z, sg[0], sg[1], sg[2], sg[3]) < sg[4] / 2 - 0.1) return true;
    }
    return false;
  };
  // lay one marking strip at signed offset `off` from the centre-line of road r between global
  // distances a..b along it; mitred offsets at real vertices keep solid lines unbroken at bends.
  // Pieces are at most 2 m so the overlap test can trim a line where it meets another road.
  const markStrip = (r, mit, cumAt, y, off, a, b) => {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const s0 = Math.max(a, cumAt[i]), s1 = Math.min(b, cumAt[i + 1]); if (s1 - s0 < 0.05) continue;
      const p = r.pts[i], q = r.pts[i + 1], L = cumAt[i + 1] - cumAt[i], ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L;
      const at = (d, o) => { const l = d - cumAt[i], m = l < 1e-4 ? mit[i] : L - l < 1e-4 ? mit[i + 1] : [-uz, ux]; return [p[0] + ux * l + m[0] * o, p[1] + uz * l + m[1] * o]; };
      const n = Math.ceil((s1 - s0) / 2);
      for (let k = 0; k < n; k++) {
        const d0 = s0 + (s1 - s0) * k / n, d1 = s0 + (s1 - s0) * (k + 1) / n, mid = at((d0 + d1) / 2, off);
        // long highways run far past the map: paint only the part on the board
        if (Math.abs(mid[0]) > BX || Math.abs(mid[1]) > BZ || onOtherRoad(mid[0], mid[1], r)) continue;
        MK.quadUV(at(d0, off - LINE_W / 2), at(d1, off - LINE_W / 2), at(d1, off + LINE_W / 2), at(d0, off + LINE_W / 2), y, MARK_C, 0, 0);
      }
    }
  };
  let wi = 0;
  for (const r of W.roads.slice().sort((a, b) => ordR(a) - ordR(b))) {
    const lift = (wi++ % 5) * 0.003;
    const t = r.type, drive = DRIVE.has(t) || t === 'track', paved = drive && t !== 'track' && !UNPAVED.test(r.tags.surface || '');
    // each class needs its own band: base gaps must exceed the 0.012 lift range, or a
    // footpath lands on top of the street it crosses
    const y = (MAJOR.has(t) ? 0.095 : drive ? 0.07 : 0.05) + lift, rc = paved ? DRIVE_C : PATH_C;
    // mitre the joints so neighbouring quads share an exact edge instead of overlapping at bends
    const mit = [];
    for (let i = 0; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], d = r.pts[i + 1];
      let d1x, d1z, d2x, d2z;
      if (a) { d1x = b[0] - a[0]; d1z = b[1] - a[1]; const l = Math.hypot(d1x, d1z) || 1; d1x /= l; d1z /= l; }
      if (d) { d2x = d[0] - b[0]; d2z = d[1] - b[1]; const l = Math.hypot(d2x, d2z) || 1; d2x /= l; d2z /= l; }
      if (d1x === undefined) { d1x = d2x; d1z = d2z; }
      if (d2x === undefined) { d2x = d1x; d2z = d1z; }
      const n1x = -d1z, n1z = d1x;
      let mx = n1x + -d2z, mz = n1z + d2x; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      const k = Math.max(0.4, mx * n1x + mz * n1z);   // clamp so hairpins do not spike
      mit.push([mx / k, mz / k]);
    }
    for (let i = 0; i < r.pts.length - 1; i++) {
      const p = r.pts[i], q = r.pts[i + 1];
      const c = clipSeg(p[0], p[1], q[0], q[1]); if (!c) continue;
      const whole = Math.abs(c[0] - p[0]) < 1e-6 && Math.abs(c[1] - p[1]) < 1e-6 && Math.abs(c[2] - q[0]) < 1e-6 && Math.abs(c[3] - q[1]) < 1e-6;
      if (whole) {
        const hw = r.w / 2, ma = mit[i], mb = mit[i + 1];
        RK.quadUV([p[0] + ma[0] * hw, p[1] + ma[1] * hw], [q[0] + mb[0] * hw, q[1] + mb[1] * hw],
          [q[0] - mb[0] * hw, q[1] - mb[1] * hw], [p[0] - ma[0] * hw, p[1] - ma[1] * hw], y, rc, 0, 0);
      } else RK.segUV(c[0], c[1], c[2], c[3], r.w, y, rc, 0, 0);
      // junction caps
      RK.disc(c[0], c[1], r.w / 2, y - 0.002, rc); RK.disc(c[2], c[3], r.w / 2, y - 0.002, rc);
    }
    if (!paved || t === 'service' || r.w < 4.5 || !r.nodes) continue;
    const cumAt = [0]; for (let i = 1; i < r.pts.length; i++) cumAt.push(cumAt[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
    const total = cumAt[cumAt.length - 1], clear = r.w / 2 + 2.5;
    // open stretches between junctions (and the way's own ends)
    const stops = [0, total]; r.nodes.forEach((n, i) => { if (nodeUse.get(n) > 1) stops.push(cumAt[i]); });
    stops.sort((a, b) => a - b);
    // lines as [offset from centre-line, dashed]: solid edge lines; a one-way carriageway gets
    // dashed lane dividers only; a two-way road a solid double centre line when it has 4+ lanes
    // (plus dashed dividers), otherwise one dashed centre line
    const hw = r.w / 2, lines = [];
    if (r.w >= 5) lines.push([-(hw - 0.35), false], [hw - 0.35, false]);
    if (r.oneway) for (let k = 1; k < r.lanes; k++) lines.push([-hw + k * r.w / r.lanes, true]);
    else if (r.lanes >= 4) { lines.push([-0.12, false], [0.12, false]); for (let k = 1; k < r.lanes / 2; k++) lines.push([k * r.w / r.lanes, true], [-k * r.w / r.lanes, true]); }
    else lines.push([0, true]);
    const my = y + 0.004;
    for (let k = 0; k < stops.length - 1; k++) {
      const a = stops[k] + clear, b = stops[k + 1] - clear; if (b - a < DASH) continue;
      // dashes centred in the stretch so both ends look the same
      const n = Math.floor((b - a + GAP) / (DASH + GAP)), start = a + (b - a - (n * (DASH + GAP) - GAP)) / 2;
      for (const [off, dashed] of lines) {
        if (!dashed) { markStrip(r, mit, cumAt, my, off, a, b); continue; }
        for (let d = 0; d < n; d++) markStrip(r, mit, cumAt, my, off, start + d * (DASH + GAP), start + d * (DASH + GAP) + DASH);
      }
    }
  }
  const sleepers = [], balC = col('#a99a88'), railC = col('#6b7078');
  const SLEEPER_CAP = mobile ? 600 : 16000, SLEEPER_STEP = mobile ? 3.2 : 1.0;
  for (const c of railSegs) {
    G.seg(c[0], c[1], c[2], c[3], 3.2, 0.13, balC); G.disc(c[2], c[3], 1.6, 0.13, balC);
    const dx = c[2] - c[0], dz = c[3] - c[1], L = Math.hypot(dx, dz); if (L < 0.1) continue;
    const nx = -dz / L, nz = dx / L;
    for (const o of [-0.72, 0.72]) G.seg(c[0] + nx * o, c[1] + nz * o, c[2] + nx * o, c[3] + nz * o, 0.14, 0.2, railC);
    for (let d = 0; d < L && sleepers.length < SLEEPER_CAP; d += SLEEPER_STEP) sleepers.push([c[0] + dx * d / L, 0.15, c[1] + dz * d / L, Math.atan2(dx, dz)]);
  }
  // Lambert on phones: no PBR lighting math over thousands of wall/road fragments.
  const matCol = (color, o = {}) => mobile
    ? new THREE.MeshLambertMaterial({ color, map: o.map || null, vertexColors: !!o.vertexColors, side: o.side || THREE.FrontSide, flatShading: !!o.flatShading })
    : std(color, o);
  const groundMat = mobile
    ? new THREE.MeshLambertMaterial({ vertexColors: true, map: TX.ground })
    : new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.ground, roughness: 0.92, metalness: 0.02 });
  G.meshes(groundMat, false, true);
  if (sat) {
    for (const b of sat.blocks) {
      const x0 = Math.max(-BX - 3, b.wx0), x1 = Math.min(BX + 3, b.wx1), z0 = Math.max(-BZ - 3, b.wz0), z1 = Math.min(BZ + 3, b.wz1); if (x1 <= x0 || z1 <= z0) continue;
      const tex = new THREE.CanvasTexture(b.c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const pg = new THREE.PlaneGeometry(x1 - x0, z1 - z0); pg.rotateX(-Math.PI / 2); pg.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      const pa = pg.attributes.position, ua = pg.attributes.uv;
      for (let i = 0; i < pa.count; i++) ua.setXY(i, (pa.getX(i) - b.wx0) / (b.wx1 - b.wx0), 1 - (pa.getZ(i) - b.wz0) / (b.wz1 - b.wz0));
      const sm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })); sm.position.y = 0.02; sm.receiveShadow = true; scene.add(sm);
    }
  }
  RK.meshes(mobile ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }), false, true);
  // markings sit 4 mm above the asphalt: polygon offset keeps them from z-fighting at range
  const markMat = mobile ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  markMat.polygonOffset = true; markMat.polygonOffsetFactor = -1; markMat.polygonOffsetUnits = -4;
  MK.meshes(markMat, false, true, 0, DETAIL_R + 1);
  const waterMat = makeWaterMaterial();
  { const WB = new ChunkB(); const wc = col('#ffffff');
    for (const w of W.waters) WB.poly(w, 0.045, wc);
    for (const w of W.waterLines) for (let i = 0; i < w.pts.length - 1; i++) { const c = clipSeg(w.pts[i][0], w.pts[i][1], w.pts[i + 1][0], w.pts[i + 1][1]); if (c) { WB.seg(c[0], c[1], c[2], c[3], w.w, 0.045, wc); WB.disc(c[2], c[3], w.w / 2, 0.045, wc); } }
    WB.meshes(waterMat, false, false, 1); }
  const byChunk = (list, ix, iz) => { const mp = new Map(); for (const w of list) { const k = ck(w[ix], w[iz]); if (!mp.has(k)) mp.set(k, []); mp.get(k).push(w); } return mp; };
  const mkInst = (list, geo, mat, y0 = 0, shadow = false, colorFn = null, r = CULL_R) => {
    if (!list.length) return null;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), s2 = new THREE.Vector3();
    for (const [k, part] of byChunk(list, 0, 2)) {
      const im = new THREE.InstancedMesh(geo, mat, part.length);
      part.forEach((w, i) => { q.setFromEuler(e.set(0, w[3], 0)); m4.compose(v.set(w[0], w[1] + y0, w[2]), q, w[4] ? s2.set(1, w[4], 1) : s1); im.setMatrixAt(i, m4); if (colorFn) im.setColorAt(i, colorFn(w)); });
      im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true; scene.add(im);
      const p = k.split(','); trackChunk(im, +p[0], +p[1], r);
    }
  };
  mkInst(sleepers, new THREE.BoxGeometry(2.3, 0.1, 0.26), matCol(0x5e4636, { roughness: 0.9 }), 0, false, null, DETAIL_R);
  const boardMats = [0, 1, 2, 3, 4, 5].map(i => i === 2 ? new THREE.MeshStandardMaterial({ color: 0xb4c98a, map: TX.ground, roughness: 1 }) : new THREE.MeshStandardMaterial({ color: 0x8c5e3a, map: TX.wood, roughness: 0.7 }));
  const board = new THREE.Mesh(new THREE.BoxGeometry(BX * 2 + 6, 8, BZ * 2 + 6), boardMats); board.position.y = sat ? -4.08 : -4.001; board.receiveShadow = true; scene.add(board);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(BX * 2 + 40, 3, BZ * 2 + 40), std(0x4e3522, { map: TX.wood, roughness: 0.6 })); plinth.position.y = -9.5; scene.add(plinth);

  // ---------- buildings & compound fences ----------
  // Every OSM building is built from the Kenney suburban kit (homes.js): one fitted house per lot,
  // a grid of houses on big lots, the oriented bounding rectangle for odd shapes. OSM has the
  // houses but not the compounds (ခြံ) around them, so plots.js derives each yard from the real
  // footprints and streets, and every compound gets a bare-earth yard and a fence (ခြံစည်းရိုး)
  // with its gate on the street side: wards read as rows of fenced compounds, as on the ground.
  msg('အဆောက်အအုံများ ဆောက်နေသည်…', 0.78);
  await yieldToPaint();
  // Detail radius sits just past the fog start, so the LOD swap happens in the haze.
  const homes = assets.homes ? createHomes(Array.isArray(assets.homes) ? assets.homes : [assets.homes], {
    mobile, shadows: best && !mobile, radius: mobile ? 130 : best ? 200 : 170,
    walls: WALLS.concat(['#ffffff', '#f4efe6', '#efe9dd']), roofs: TIN, fade: [scene.fog.far * 0.45, scene.fog.far * 0.8],
  }) : null;
  const fences = createFences(assets.fence, { mobile, shadows: best && !mobile, nearR: mobile ? 55 : 90, chunk: CHUNK, track: (me, ix, iz) => trackChunk(me, ix, iz, DETAIL_R + 1) });
  // index of the footprint edge nearest a road (the street front), -1 if every edge is tiny
  const frontEdge = pts => { let e = -1, dmin = 1e9; for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 2.4) continue; const d = roadClear((a[0] + c[0]) / 2, (a[1] + c[1]) / 2); if (d < dmin) { dmin = d; e = i; } } return e; };
  let bDone = 0;
  if (homes) for (const b of W.buildings) {
    const pts = b.pts; if (pts.length < 3) continue;
    const ar = area(pts); if (ar < 4) continue;
    const [cx, cz] = centroid(pts), hb = bhash(cx, cz), nr = nearSeg(cx, cz);
    // on the rural edge and along dirt lanes about half the small homes go up on stilts
    const rural = !nr[1] || nr[0] > 14 || nr[1][7] || !DRIVE.has(nr[1][6].type) || Math.hypot(cx, cz) > 700;
    const lift = rural && ar < 150 && h01(hb, 30) < 0.5 ? 1.7 + h01(hb, 31) * 0.5 : 0;
    homes.place(pts, hb, frontEdge, lift);
    if ((++bDone & 127) === 0) await yieldToPaint();
  }
  if (homes) homes.build(scene, matCol(0x7a5a3c, { map: TX.wood, roughness: 0.85 }));

  // Lay a fence from a to b, skipping any stretch that would stand on a road or footway: OSM
  // footprints drawn over the road edge can still pull a plot onto it.
  const onRoad = (x, z) => { for (const sg of segs.q(x, z)) if (segDist(x, z, sg[0], sg[1], sg[2], sg[3]) < sg[4] / 2 + 0.15) return true; return false; };
  const fenceRun = (ax, az, bx, bz) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.8));
    const P = k => [ax + (bx - ax) * k / n, az + (bz - az) * k / n];
    let start = -1;
    for (let k = 0; k <= n; k++) {
      const ok = k < n && !onRoad(...P(k + 0.5));
      if (ok && start < 0) start = k;
      else if (!ok && start >= 0) { const p0 = P(start), p1 = P(k); fences.add(p0[0], p0[1], p1[0], p1[1]); start = -1; }
    }
  };
  plots.forEach((pl, i) => {
    if (!pl) return;
    // gate: middle of the longest street edge
    let gate = -1, gl = 3.4;
    pl.l.forEach((l, k) => { if (l !== 'r') return; const a = pl.p[k], c = pl.p[(k + 1) % pl.p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L > gl) { gl = L; gate = k; } });
    pl.l.forEach((l, k) => {
      // a fence shared with a neighbour is drawn once, by the lower index
      if (typeof l === 'number' && l < i && plots[l]) return;
      const a = pl.p[k], c = pl.p[(k + 1) % pl.p.length];
      if (k !== gate) { fenceRun(a[0], a[1], c[0], c[1]); return; }
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]), t0 = 0.5 - 1.1 / L, t1 = 0.5 + 1.1 / L;
      fenceRun(a[0], a[1], a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0);
      fenceRun(a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1, c[0], c[1]);
    });
  });
  fences.build(scene, 0xc3714e);

  // ---------- pagodas ----------
  const PM = makePagodaMats(TX);
  for (const p of W.pagodas) {
    let g;
    if (assets.pagoda) { g = cloneAsset(assets.pagoda).object; g.scale.multiplyScalar(p.r / 4); }
    else g = makePagoda(p.r, PM);
    g.position.set(p.x, 0, p.z); scene.add(g);
  }

  // ---------- trees & planters ----------
  // Kenney kit trees and planters only. Green-area trees go in now so the town is not bare at
  // first ride; roadside trees, scatter and planters are deferred until after ready so the build
  // freeze ends sooner on phones. List entries: [x, z, rotY, scale].
  const TREE_CAP = mobile ? 450 : 2800;
  const GREEN_CAP = mobile ? 350 : 2600;
  const PLANTER_CAP = mobile ? 180 : 1500;
  const TREE_R = Math.max(DETAIL_R, CULL_R - 2);
  const okTree = (x, z) => Math.abs(x) < BX - 2 && Math.abs(z) < BZ - 2 && !blocked(x, z) && roadClear(x, z) > 1.8 && railClear(x, z) > 3;
  const trees = [];
  for (const g of W.greens) {
    if (!g.trees) continue;
    const ar = area(g.pts), n = Math.min(mobile ? 40 : 300, Math.floor(ar / 900 * g.trees));
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const p of g.pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
    for (let i = 0, tries = 0; i < n && tries < n * 4 && trees.length < GREEN_CAP; tries++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0); if (pip(x, z, g.pts) && okTree(x, z)) { trees.push([x, z, rnd() * 6.28, 0.8 + rnd() * 0.5]); i++; } }
  }
  await yieldToPaint();
  const treeA = assets.tree ? (Array.isArray(assets.tree) ? assets.tree : [assets.tree]) : [];
  const plantTrees = list => {
    if (!treeA.length) return;
    const lists = treeA.map(() => []);
    for (const t of list) lists[Math.floor(Math.abs(t[0] * 11 + t[1] * 5)) % treeA.length].push(t);
    // slim kit conifers are a pixel or two past ~600 m, so they stop short of the full ring
    treeA.forEach((a, i) => lists[i].length && instancedFromAsset(a, lists[i], scene, (im, ix, iz) => trackChunk(im, ix, iz, TREE_R)));
  };
  plantTrees(trees);
  const plantPlanters = list => { if (assets.planter && list.length) instancedFromAsset(assets.planter, list, scene, (im, ix, iz) => trackChunk(im, ix, iz, DETAIL_R)); };
  const deferDecor = () => {
    if (disposed) return;
    const firstNew = scene.children.length;
    const extra = [];
    const roadStep = mobile ? 36 : 18;
    for (const s of roadSegs) {
      if (trees.length + extra.length > TREE_CAP) break;
      const r = s[6]; if (!DRIVE.has(r.type) && r.type !== 'track') continue;
      const dx = s[2] - s[0], dz = s[3] - s[1], L = Math.hypot(dx, dz);
      for (let d = 5; d < L; d += roadStep + rnd() * 22) {
        if (rnd() < (mobile ? 0.7 : 0.5)) continue;
        const side = rnd() < 0.5 ? -1 : 1, off = r.w / 2 + 2.4 + rnd() * 2;
        const x = s[0] + dx * d / L - dz / L * side * off, z = s[1] + dz * d / L + dx / L * side * off;
        if (okTree(x, z)) extra.push([x, z, rnd() * 6.28, 0.75 + rnd() * 0.45]);
      }
    }
    const scatterN = mobile ? 200 : 900;
    for (let i = 0; i < scatterN && trees.length + extra.length < TREE_CAP; i++) {
      const x = (rnd() * 2 - 1) * (BX - 4), z = (rnd() * 2 - 1) * (BZ - 4);
      if (okTree(x, z) && roadClear(x, z) > 4) extra.push([x, z, rnd() * 6.28, 0.8 + rnd() * 0.5]);
    }
    plantTrees(extra);
    const planters = [];
    const planterChance = mobile ? 0.08 : 0.35;
    for (const b of W.buildings) {
      if (planters.length > PLANTER_CAP || rnd() > planterChance) continue;
      const [cx, cz] = centroid(b.pts); const p = b.pts[Math.floor(rnd() * b.pts.length)];
      const x = p[0] + (p[0] - cx) * 0.25, z = p[1] + (p[1] - cz) * 0.25;
      if (!blocked(x, z) && roadClear(x, z) > 0.8) planters.push([x, z, rnd() * 6.28, 0.8 + rnd() * 0.4]);
    }
    plantPlanters(planters);
    freeze(scene.children.slice(firstNew));
    collectMats();
  };

  // ---------- street lamps ----------
  const lamps = [];
  const lampStep = mobile ? 56 : 36, lampCap = mobile ? 120 : 500;
  for (const s of roadSegs) { const r = s[6]; if (!MAJOR.has(r.type) || lamps.length > lampCap) continue; const dx = s[2] - s[0], dz = s[3] - s[1], L = Math.hypot(dx, dz); for (let d = 10; d < L; d += lampStep) { const off = r.w / 2 + 1.0, x = s[0] + dx * d / L - dz / L * off, z = s[1] + dz * d / L + dx / L * off; if (!blocked(x, z) && railClear(x, z) > 3 && roadClear(x, z) > 0.3) lamps.push([x, 0, z, Math.atan2(-dz, dx) + Math.PI / 2]); } }
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  if (lamps.length) {
    const pole = new THREE.CylinderGeometry(0.06, 0.1, 5, mobile ? 5 : 6); pole.translate(0, 2.5, 0);
    const arm = new THREE.BoxGeometry(0.06, 0.06, 1.0); arm.translate(0, 4.95, -0.45);
    const metal = matCol(0x4a4f57, { metalness: 0.7, roughness: 0.4 });
    mkInst(lamps, pole, metal, 0, !mobile, null, DETAIL_R + 1); mkInst(lamps, arm, metal, 0, false, null, DETAIL_R);
    const bg = new THREE.SphereGeometry(0.2, mobile ? 6 : 10, mobile ? 5 : 8); bg.scale(1, 0.6, 1); bg.translate(0, 4.85, -0.9); mkInst(lamps, bg, bulbMat);
  }

  // The world built so far never moves: compute its matrices once and drop it from three's
  // per-frame matrix walk (~3-4k objects, the largest JS cost per frame on phones).
  const freeze = list => { for (const o of list) { o.updateMatrixWorld(true); o.traverse(c => { c.matrixAutoUpdate = false; }); o.matrixWorldAutoUpdate = false; } };
  const moving = new Set([sky, hemi, sun, sun.target, fill, fill && fill.target]);
  freeze(scene.children.filter(o => !moving.has(o)));
  // the scene root must not auto-update either: a dirty root forces every child to recompute
  scene.matrixAutoUpdate = false;

  // stars
  const starGeo = new THREE.BufferGeometry(), sp = [];
  const starN = mobile ? 180 : 900;
  for (let i = 0; i < starN; i++) { const a = Math.random() * 6.28, el = Math.random() * 1.3 + 0.1; sp.push(Math.cos(a) * Math.cos(el) * 2400, Math.sin(el) * 2400, Math.sin(a) * Math.cos(el) * 2400); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; scene.add(stars);

  // ---------- graphs ----------
  const mkGraph = filter => {
    const nodes = new Map();
    for (const r of W.roads) {
      if (!filter(r.type) || !r.nodes) continue;
      for (let i = 0; i < r.pts.length; i++) {
        const [x, z] = r.pts[i]; if (Math.abs(x) > HW || Math.abs(z) > HH) continue;
        const id = r.nodes[i]; let n = nodes.get(id); if (!n) nodes.set(id, n = { id, x, z, adj: [] });
        if (i > 0) { const p = nodes.get(r.nodes[i - 1]); if (p && p !== n) { if (!p.adj.includes(n)) p.adj.push(n); if (!n.adj.includes(p)) n.adj.push(p); } }
      }
    }
    return [...nodes.values()].filter(n => n.adj.length);
  };
  const carNodes = mkGraph(t => DRIVE.has(t) && t !== 'service');
  const pedNodes = mkGraph(t => DRIVE.has(t) || ['footway', 'path', 'pedestrian', 'track', 'living_street'].includes(t));

  // ---------- player ----------
  const P = { x: 0, z: 0, h: 0, v: 0, steer: 0, phase: 0, wheel: 0 };
  const startRef = stationPoi || { x: 0, z: 0 };
  if (carNodes.length) { let bestN = carNodes[0], bd = 1e9; for (const n of carNodes) { const d = Math.hypot(n.x - startRef.x, n.z - startRef.z); if (d < bd) { bd = d; bestN = n; } } P.x = bestN.x; P.z = bestN.z; const nb = bestN.adj[0]; P.h = Math.atan2(nb.x - bestN.x, nb.z - bestN.z); }
  // Rideable vehicles. half = collision half-width / half-length (m); cam scales the chase camera;
  // lean is how far the body banks in a turn; wheelR drives wheel spin; head/pkg place the
  // headlight and the delivery parcel; sound is what the bell button plays.
  const RIDES = {
    bike: { name: 'စက်ဘီး', vmax: 9, acc: 4.2, brake: 10, rev: 2.2, turn: 1.9, half: [0.35, 0.6], cam: 1, lean: 0.3, wheelR: 0.34, head: [0, 1.0, 0.7], pkg: [0, 1.0, 0.66], sound: 'bell' },
    moto: { name: 'ဆိုင်ကယ်', vmax: 17, acc: 7, brake: 12, rev: 1.5, turn: 1.7, half: [0.38, 0.95], cam: 1.15, lean: 0.35, wheelR: 0.34, head: [0, 0.95, 0.7], pkg: [0, 1.0, -0.62], sound: 'horn' },
    car: { name: 'ကား', vmax: 19, acc: 6, brake: 14, rev: 4, turn: 1.25, half: [0.95, 2.1], cam: 1.9, lean: 0.04, wheelR: 0.34, head: [0, 0.85, 2.2], pkg: [0, 1.95, -0.5], sound: 'horn' },
    cart: { name: 'မြင်းလှည်း', vmax: 5.5, acc: 2, brake: 6, rev: 0.8, turn: 1.1, half: [0.85, 2.3], cam: 2.4, lean: 0.02, wheelR: 0.6, head: [0, 1.6, 2.5], pkg: [0, 1.05, -1.5], sound: 'bell' },
  };
  const RIDE_ORDER = ['bike', 'moto', 'car', 'cart'];
  const bike = new THREE.Group(); bike.rotation.order = 'YXZ';   // the player root, whatever is ridden
  const BK = makeBike(TX);
  BK.pkg.visible = false;
  const buildRide = id => {
    if (id === 'bike') { const g = new THREE.Group(); g.add(assets.bike ? cloneAsset(assets.bike).object : BK.group); return { g, wheels: [], update: (ph, w) => BK.update(ph, w) }; }
    if (id === 'car') {
      const a = Array.isArray(assets.car) ? assets.car[0] : assets.car;
      if (a) return { g: cloneAsset(a).object, wheels: [] };
      const m = makeVehicle('car', TX, new THREE.Color('#e94f37')); return { g: m.group, wheels: m.wheels };
    }
    if (id === 'moto') { const m = makeVehicle('moto', TX, new THREE.Color('#23408e')); return { g: m.group, wheels: m.wheels }; }
    const m = makeHorseCart(TX); return { g: m.group, wheels: m.wheels, update: m.update };
  };
  const rideModels = {};
  let rideId = 'bike', R = RIDES.bike, rideM = null;
  const pkg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.34), std(0xffffff, { map: TX.wood, roughness: 0.8 })); pkg.castShadow = true; pkg.visible = false; bike.add(pkg);
  const headlight = new THREE.SpotLight(0xfff0c8, 0, 34, 0.55, 0.5, 0); bike.add(headlight); bike.add(headlight.target);
  const mountRide = id => {
    if (rideM) bike.remove(rideM.g);
    rideM = rideModels[id] || (rideModels[id] = buildRide(id)); bike.add(rideM.g);
    rideId = id; R = RIDES[id];
    headlight.position.set(...R.head); headlight.target.position.set(R.head[0], 0, R.head[2] + 10); pkg.position.set(...R.pkg);
  };
  mountRide('bike');
  scene.add(bike);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.95, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2b233).multiplyScalar(1.6) })); arrow.geometry.rotateX(Math.PI / 2); arrow.visible = false; scene.add(arrow);

  // ---------- NPCs ----------
  const agents = [];
  const spawn = ped => {
    const pool = ped ? pedNodes : carNodes; if (!pool.length) return;
    let a;
    if (ped) {
      const pv = Array.isArray(assets.person) ? mpick(assets.person) : assets.person;
      if (pv && Math.random() < 0.5) { const c = cloneAsset(pv); a = { g: c.object, mixer: c.mixer, type: 'ped' }; }
      else { const m = makePerson(TX); a = { g: m.group, arms: m.arms, feet: m.feet, type: 'ped' }; }
      Object.assign(a, { speed: 1.1 + Math.random() * 0.5, lane: (Math.random() < 0.5 ? -1 : 1) * 3.3, r: 0.5, walk: Math.random() * 6 });
    } else {
      const r = Math.random(), type = r < 0.4 ? 'moto' : r < 0.62 ? 'car' : r < 0.78 ? 'pickup' : 'trishaw';
      const av = assets[type], aa = Array.isArray(av) ? mpick(av) : av;
      if (aa) { const c = cloneAsset(aa); a = { g: c.object, mixer: c.mixer, wheels: [] }; }
      else { const m = makeVehicle(type, TX, new THREE.Color(mpick(CAR_COLS))); a = { g: m.group, wheels: m.wheels }; }
      Object.assign(a, { type, speed: type === 'moto' ? 7 + Math.random() * 3 : type === 'trishaw' ? 3 + Math.random() : 6 + Math.random() * 3, lane: type === 'moto' || type === 'trishaw' ? 2.3 : 1.6, r: type === 'moto' ? 1.0 : type === 'trishaw' ? 1.3 : 1.9 });
    }
    a.from = mpick(pool); a.to = mpick(a.from.adj); a.t = Math.random(); a.cur = a.speed;
    scene.add(a.g); agents.push(a);
  };
  const TRAFFIC = mobile ? { Quiet: [3, 4], Normal: [6, 7], Busy: [10, 12] } : { Quiet: [8, 12], Normal: [18, 24], Busy: [32, 44] };
  const setTraffic = lvl => {
    const [nv, np] = TRAFFIC[lvl] || TRAFFIC.Normal;
    const vs = agents.filter(a => a.type !== 'ped'), ps = agents.filter(a => a.type === 'ped');
    while (vs.length > nv) { const a = vs.pop(); scene.remove(a.g); agents.splice(agents.indexOf(a), 1); }
    while (ps.length > np) { const a = ps.pop(); scene.remove(a.g); agents.splice(agents.indexOf(a), 1); }
    for (let i = vs.length; i < nv; i++) spawn(false);
    for (let i = ps.length; i < np; i++) spawn(true);
    collectMats();
  };

  // ---------- train ----------
  let train = null;
  if (W.rails.length) {
    const r = W.rails.map(r => ({ pts: r.pts.filter(p => Math.abs(p[0]) < BX - 5 && Math.abs(p[1]) < BZ - 5) })).filter(r => r.pts.length > 1)
      .map(r => { const cum = [0]; for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1])); return { pts: r.pts, cum, L: cum[cum.length - 1] }; })
      .sort((a, b) => b.L - a.L)[0];
    if (r && r.L > 150) {
      const cars = [], kinds = ['loco', 'coach', 'coach', 'coach', 'coach'];
      let lights = null;
      for (const k of kinds) {
        const slot = k === 'loco' ? assets.loco : assets.coach;
        let g, L = k === 'loco' ? 16 : 14;
        if (slot) g = cloneAsset(slot).object; else { const c = makeTrainCar(k, TX); g = c.group; L = c.L; if (c.lights) lights = c.lights; }
        scene.add(g); cars.push({ g, L });
      }
      train = { r, cars, s: 80, dir: 1, wait: 0, lights };
    }
  }
  const railAt = (r, s) => { s = Math.max(0, Math.min(r.L, s)); let i = 1; while (i < r.cum.length - 1 && r.cum[i] < s) i++; const a = r.pts[i - 1], b = r.pts[i], seg = r.cum[i] - r.cum[i - 1] || 1, t = (s - r.cum[i - 1]) / seg; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1])]; };

  // ---------- landmarks ----------
  const pinGeo = new THREE.OctahedronGeometry(0.9, 0), pins = [];
  for (const p of W.pois) if (p.important) { const c = new THREE.Color(p.tags.railway ? 0x2f8f83 : p.tags.amenity === 'place_of_worship' ? 0xe8b830 : 0xd9603b).multiplyScalar(1.3); const m = new THREE.Mesh(pinGeo, new THREE.MeshBasicMaterial({ color: c })); m.position.set(p.x, 14, p.z); scene.add(m); pins.push(m); }

  // ---------- padauk flowers ----------
  const flowers = [];
  const fGeo = new THREE.SphereGeometry(0.1, 8, 6), fMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf7c21b).multiplyScalar(1.5) }), leafM = std(0x5b8a3a), stemM = std(0x6b4a30);
  const ringGeo = new THREE.RingGeometry(0.9, 1.15, 32); ringGeo.rotateX(-Math.PI / 2);
  const driveSegs = roadSegs.filter(s => DRIVE.has(s[6].type) || s[6].type === 'track');
  for (let tries = 0; flowers.length < 40 && tries < 3000 && driveSegs.length; tries++) {
    const s = driveSegs[Math.floor(rnd() * driveSegs.length)], t = rnd(); const x = s[0] + (s[2] - s[0]) * t, z = s[1] + (s[3] - s[1]) * t;
    if (Math.abs(x) > HW || Math.abs(z) > HH || flowers.some(f => Math.hypot(f.x - x, f.z - z) < 45) || Math.hypot(x - P.x, z - P.z) < 30) continue;
    const g = new THREE.Group();
    for (let b = 0; b < 3; b++) { const br = new THREE.Group(); br.rotation.set(0.5, b * 2.1, 0); br.add(tube([0, -0.4, 0], [0, 0.25, 0], 0.012, stemM)); for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(fGeo, fMat); m.position.set(Math.sin(i) * 0.08, 0.1 + i * 0.05, Math.cos(i * 1.7) * 0.08); br.add(m); } const lf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), leafM); lf.scale.set(1, 0.3, 2); lf.position.set(0.08, -0.1, 0); br.add(lf); g.add(br); }
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf7c21b).multiplyScalar(1.2), transparent: true, opacity: 0.6, depthWrite: false })); ring.position.y = -1.15; g.add(ring);
    bake(g, [ring]); g.position.set(x, 1.3, z); scene.add(g); flowers.push({ x, z, g, got: false });
    trackChunk(g, Math.floor(x / CHUNK), Math.floor(z / CHUNK), DETAIL_R + 1);
  }
  let flowersGot = 0;

  // ---------- missions ----------
  const beamGeo = new THREE.CylinderGeometry(2.2, 2.2, 40, 24, 1, true); beamGeo.translate(0, 20, 0);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x2f8f83, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.visible = false; scene.add(beam);
  const targets = W.pois.map(p => ({ x: p.x, z: p.z, label: p.name }));
  for (const b of W.buildings.filter((b, i) => i % 3 === 0).slice(0, 600)) {
    const [cx, cz] = centroid(b.pts); let bp = null, bd = 1e9;
    for (const s of segs.q(cx, cz)) { if (!DRIVE.has(s[6].type)) continue; const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((cx - s[0]) * dx + (cz - s[1]) * dz) / l2)); const x = s[0] + dx * t, z = s[1] + dz * t, d = Math.hypot(cx - x, cz - z); if (d < bd) { bd = d; bp = [x, z]; } }
    if (!bp || bd > 30) continue; const rn = nearRoadName(cx, cz);
    targets.push({ x: bp[0], z: bp[1], label: rn ? `${rn} ရှိ နေအိမ်` : 'နေအိမ်တစ်လုံး' });
  }
  let mission = null, money = 0, delivered = 0;
  const BEAM_A = new THREE.Color(0x2f8f83).multiplyScalar(1.4), BEAM_B = new THREE.Color(0xd9603b).multiplyScalar(1.4);
  const startMission = () => {
    if (targets.length < 2) { ev({ type: 'toast', text: 'ပို့ဆောင်ရန် နေရာ မတွေ့ပါ' }); return; }
    let A, Bt;
    for (let i = 0; i < 80; i++) { A = mpick(targets); const da = Math.hypot(A.x - P.x, A.z - P.z); if (da < 60 || da > 600) continue; Bt = mpick(targets); const d = Math.hypot(Bt.x - A.x, Bt.z - A.z); if (d > 220 && d < 950) break; Bt = null; }
    if (!Bt) { A = mpick(targets); Bt = mpick(targets); }
    const dist = Math.hypot(Bt.x - A.x, Bt.z - A.z);
    mission = { stage: 'pickup', A, B: Bt, item: mpick(ITEMS), dist, limit: Math.round(dist / 4.5 + 40), t: 0 };
    beamMat.color.copy(BEAM_A); beam.visible = true; beam.position.set(A.x, 0, A.z);
    ev({ type: 'toast', text: `အလုပ်သစ် — ${mission.item} သွားယူပါ` });
  };
  const cancelMission = () => { mission = null; beam.visible = false; pkg.visible = false; arrow.visible = false; };

  // ---------- input ----------
  const keys = {}, joy = { x: 0, y: 0, id: null };
  const kd = e => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') { api.bell(); e.preventDefault(); } if (e.key.toLowerCase() === 'v' && !e.repeat) api.cycleRide(); };
  const ku = e => { keys[e.key.toLowerCase()] = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const jmove = e => { if (joy.id !== e.pointerId) return; const r = joyBase.getBoundingClientRect(), rad = r.width / 2; let dx = e.clientX - (r.left + rad), dy = e.clientY - (r.top + rad); const l = Math.hypot(dx, dy); if (l > rad) { dx *= rad / l; dy *= rad / l; } joy.x = dx / rad; joy.y = dy / rad; if (joyKnob) joyKnob.style.transform = `translate(${dx}px, ${dy}px)`; };
  const jdown = e => { joy.id = e.pointerId; try { joyBase.setPointerCapture(e.pointerId); } catch (_) {} jmove(e); e.preventDefault(); };
  const jup = e => { if (joy.id !== e.pointerId) return; joy.id = null; joy.x = joy.y = 0; if (joyKnob) joyKnob.style.transform = 'translate(0px, 0px)'; };
  if (joyBase) { joyBase.addEventListener('pointerdown', jdown); joyBase.addEventListener('pointermove', jmove); joyBase.addEventListener('pointerup', jup); joyBase.addEventListener('pointercancel', jup); }

  // ---------- minimap ----------
  const MS = 1024, S = MS / (2 * MR), mX = x => (x + MR) * S, mY = z => (z + MR) * S;
  const off = document.createElement('canvas'); off.width = off.height = MS; const oc = off.getContext('2d');
  oc.fillStyle = '#e4d3a6'; oc.fillRect(0, 0, MS, MS);
  const fillPoly = (pts, c) => { oc.fillStyle = c; oc.beginPath(); pts.forEach((p, i) => i ? oc.lineTo(mX(p[0]), mY(p[1])) : oc.moveTo(mX(p[0]), mY(p[1]))); oc.closePath(); oc.fill(); };
  W.greens.forEach(g => fillPoly(g.pts, g.color)); W.waters.forEach(w => fillPoly(w, '#7cc3d9'));
  W.buildings.forEach(b => fillPoly(b.pts, '#c9b89a')); stationRects.forEach(r => fillPoly(r, '#b9a98c'));
  oc.lineCap = 'round';
  for (const s of sorted) { const t = s[6].type; oc.strokeStyle = MAJOR.has(t) ? '#fff3c4' : DRIVE.has(t) ? '#ffffff' : '#f1e8d6'; oc.lineWidth = Math.max(1.2, s[4] * S * 1.4); oc.beginPath(); oc.moveTo(mX(s[0]), mY(s[1])); oc.lineTo(mX(s[2]), mY(s[3])); oc.stroke(); }
  oc.strokeStyle = '#6b5a4a'; oc.lineWidth = 2; oc.setLineDash([5, 4]);
  for (const r of W.rails) { oc.beginPath(); r.pts.forEach((p, i) => i ? oc.lineTo(mX(p[0]), mY(p[1])) : oc.moveTo(mX(p[0]), mY(p[1]))); oc.stroke(); }
  oc.setLineDash([]);
  const mctx = minimap ? minimap.getContext('2d') : null;
  const drawMinimap = () => {
    if (!mctx) return; const dpr = Math.min(2, window.devicePixelRatio || 1), size = Math.round(minimap.clientWidth * dpr);
    if (minimap.width !== size) minimap.width = minimap.height = size;
    const c = size / 2, rad = c, factor = rad / 230, z = factor / S, th = P.h + Math.PI;
    mctx.clearRect(0, 0, size, size); mctx.save(); mctx.beginPath(); mctx.arc(c, c, rad, 0, 6.2832); mctx.clip();
    mctx.fillStyle = '#5e4029'; mctx.fillRect(0, 0, size, size);
    mctx.translate(c, c); mctx.rotate(th); mctx.scale(z, z); mctx.translate(-mX(P.x), -mY(P.z)); mctx.drawImage(off, 0, 0); mctx.restore();
    const ct = Math.cos(th), st = Math.sin(th);
    const mark = (x, zz, color, r, clamp) => { const dx = (x - P.x) * factor, dz = (zz - P.z) * factor; let rx = dx * ct - dz * st, ry = dx * st + dz * ct; const l = Math.hypot(rx, ry); if (l > rad - r - 3) { if (!clamp) return; rx *= (rad - r - 3) / l; ry *= (rad - r - 3) / l; } mctx.fillStyle = color; mctx.strokeStyle = '#fff'; mctx.lineWidth = dpr * 1.5; mctx.beginPath(); mctx.arc(c + rx, c + ry, r, 0, 6.2832); mctx.fill(); mctx.stroke(); };
    for (const f of flowers) if (!f.got) mark(f.x, f.z, '#f7c21b', 3 * dpr, false);
    for (const p of W.pois) if (p.important) mark(p.x, p.z, p.tags.railway ? '#2f8f83' : '#d9603b', 2.5 * dpr, false);
    if (mission) { const T = mission.stage === 'pickup' ? mission.A : mission.B; mark(T.x, T.z, mission.stage === 'pickup' ? '#2f8f83' : '#d9603b', 5.5 * dpr, true); }
    mctx.fillStyle = '#2b2a33'; mctx.beginPath(); mctx.moveTo(c, c - 9 * dpr); mctx.lineTo(c + 6 * dpr, c + 6 * dpr); mctx.lineTo(c, c + 3 * dpr); mctx.lineTo(c - 6 * dpr, c + 6 * dpr); mctx.closePath(); mctx.fill();
  };

  // ---------- fx ----------
  const fx = post ? makeComposer(renderer, scene, camera, 4) : null;
  const motes = post ? makeMotes(TX.dot, 420) : null; if (motes) scene.add(motes.points);
  const puffs = makePuffs(); scene.add(puffs.points);
  // Without a shadow map (phones, Fast) the bike and traffic get soft blob shadows instead.
  let blobs = null;
  if (!renderer.shadowMap.enabled) {
    const bg = new THREE.PlaneGeometry(1, 1); bg.rotateX(-Math.PI / 2);
    blobs = new THREE.InstancedMesh(bg, contactShadowMaterial([scene.fog.near, scene.fog.far * 0.5], 0.5), 64);
    blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); blobs.frustumCulled = false; blobs.renderOrder = 1; scene.add(blobs);
  }
  const blobM = new THREE.Matrix4(), blobQ = new THREE.Quaternion(), blobP = new THREE.Vector3(), blobS = new THREE.Vector3(), Y_AXIS = new THREE.Vector3(0, 1, 0);
  const updateBlobs = () => {
    let n = 0;
    const put = (x, z, h, w, l) => { blobs.setMatrixAt(n++, blobM.compose(blobP.set(x, 0.12, z), blobQ.setFromAxisAngle(Y_AXIS, h), blobS.set(w, 1, l))); };
    put(P.x, P.z, P.h, 0.75, 1.9);
    for (const a of agents) if (a.g.visible && n < 64) put(a.g.position.x, a.g.position.z, a.g.rotation.y, a.type === 'ped' ? 0.7 : a.r * 1.15, a.type === 'ped' ? 0.7 : a.r * 2.3);
    blobs.count = n; blobs.instanceMatrix.needsUpdate = true;
  };

  const stdMats = new Set();
  function collectMats() { scene.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && m.isMeshStandardMaterial && !stdMats.has(m)) { m.userData.envBase = m.metalness > 0.5 ? 1.15 : 0.42; stdMats.add(m); } }); }); }
  setTraffic(opts.traffic);

  // ---------- loop ----------
  let perfAcc = 0, perfN = 0, hour = opts.realClock ? nowHour() : opts.startHour, dayMin = opts.dayMinutes, playing = false, camMode = 0, popup = null, popT = 0, hudT = 0, mmT = 0, envT = 0, bumpT = 0, puffT = 0, cullT = 0, last = performance.now(), raf = 0, frozen = false, disposed = false;
  const AGENT_R = mobile ? 100 : 170;
  const decorTimer = setTimeout(deferDecor, 120);
  // Over-the-shoulder default; second mode still closer than the old 13 m pull-back.
  const CAM = [{ d: 2.85, h: 1.38, blur: 0, look: 1.15, lookY: 0.98 }, { d: 6.2, h: 3.15, blur: 0.3, look: 2.1, lookY: 1.1 }];
  const camPos = new THREE.Vector3(P.x - Math.sin(P.h) * CAM[0].d, CAM[0].h, P.z - Math.cos(P.h) * CAM[0].d), look = new THREE.Vector3(), want = new THREE.Vector3();
  const SKY_TOP_D = col('#4e9fdc'), SKY_HOR_D = col('#d9eef8'), SKY_TOP_N = col('#070d1c'), SKY_HOR_N = col('#1a2744'), SKY_HOR_S = col('#ff9a5c'), SKY_TOP_S = col('#7a6fb0');
  const tmp = new THREE.Color(), tmp2 = new THREE.Color(), BULB_D = col('#d6d6d6'), BULB_N = col('#ffe7a8'), MOON = col('#9fb4ff');
  // Collision samples the ridden vehicle's footprint (corners, side midpoints, centre), so a car
  // cannot squeeze through a gap a bicycle fits. Fences are thin, so each probe's step is tested.
  const probeAt = (x, z, h, lx, lz) => [x + lx * Math.cos(h) + lz * Math.sin(h), z - lx * Math.sin(h) + lz * Math.cos(h)];
  const PROBES = [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]];
  const poseBlocked = (x, z, h, fromX = x, fromZ = z, fromH = h) => {
    if (Math.abs(x) > HW + 8 || Math.abs(z) > HH + 8) return true;
    const [hw, hl] = R.half;
    for (const [sx, sz] of PROBES) {
      const [wx, wz] = probeAt(x, z, h, sx * hw, sz * hl);
      if (blocked(wx, wz)) return true;
      const [ox, oz] = probeAt(fromX, fromZ, fromH, sx * hw, sz * hl);
      if (fences.hits(ox, oz, wx, wz)) return true;
    }
    return false;
  };
  // three.js fov is VERTICAL, so a tall phone screen collapses the horizontal field: 46 deg
  // vertical is 85 deg across in landscape but only 22 deg in portrait, magnifying the world
  // ~4x and making every texel cover 4x the pixels - which reads as blur. Widen the vertical
  // fov on narrow screens to hold a sane horizontal field. Landscape and desktop are untouched.
  const FOV = best ? 42 : mobile ? 44 : 46, HFOV_MIN = 55, FOV_MAX = 72;
  const resize = () => { const w = container.clientWidth || 1, h = container.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h;
    const want = 2 * Math.atan(Math.tan(HFOV_MIN * Math.PI / 360) / camera.aspect) * 180 / Math.PI;
    camera.fov = Math.min(FOV_MAX, Math.max(FOV, want));
    camera.updateProjectionMatrix(); if (fx) fx.setSize(w, h); puffs.mat.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360)); };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  if (fx) fx.setBlur(CAM[camMode].blur);

  let due = 0;
  const frame = now => {
    raf = requestAnimationFrame(frame);
    // 90/120 Hz phones would otherwise render up to twice as often, heat up and throttle: pace to
    // ~60 with a deadline (3 ms slack so vsync jitter on a 60 Hz panel never drops a frame).
    if (mobile) { if (now < due - 3) return; due = Math.max(due, now - 20) + 1000 / 60; }
    const rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
    if (frozen) return;
    if (playing && rawDt < 0.1) { perfAcc += rawDt; perfN++; }
    // Hysteresis band: climb while a frame fits in 18 ms (a vsync-capped 60 Hz display sits at
    // 16.7, so the old 14.5 ms gate was unreachable and the ratio could only ever fall), back off
    // past 24 ms. The device settles at the sharpest resolution it can actually hold.
    if (perfN > 30 && perfAcc > 1.5) { const avg = perfAcc / perfN; perfAcc = 0; perfN = 0; let np = pr;
      // Phones: prefer staying sharp (floor 1.25). Only back off hard past ~26 fps.
      const drop = mobile ? 0.038 : 0.024, floor = mobile ? 1.25 : 0.6, climb = mobile ? 0.026 : 0.018;
      if (avg > drop) np = Math.max(floor, pr * (avg > drop * 1.7 ? 0.85 : 0.92));
      else if (avg < climb) np = Math.min(MAXPR, pr + (mobile ? 0.12 : 0.1));
      if (Math.abs(np - pr) > 0.01) { pr = np; renderer.setPixelRatio(pr); resize(); } }
    const tsec = now / 1000;
    let steer = 0, thr = 0;
    if (playing) {
      if (Math.abs(joy.x) > 0.08 || Math.abs(joy.y) > 0.08) { steer = joy.x; thr = -joy.y; }
      if (keys.a || keys.arrowleft) steer = -1; if (keys.d || keys.arrowright) steer = 1;
      if (keys.w || keys.arrowup) thr = 1; if (keys.s || keys.arrowdown) thr = -1;
    }
    P.steer += (steer - P.steer) * Math.min(1, dt * 8);
    if (thr > 0) P.v += thr * R.acc * dt; else if (thr < 0) P.v += (P.v > 0.2 ? thr * R.brake : thr * R.rev) * dt;
    P.v -= P.v * 0.35 * dt; P.v = Math.max(-R.rev, Math.min(R.vmax, P.v));
    if (Math.abs(P.v) < 0.03 && !thr) P.v = 0;
    const oh = P.h;
    P.h -= P.steer * R.turn * dt * Math.min(1, Math.abs(P.v) / 2.5 + 0.15) * Math.sign(P.v || 1);
    const nx = P.x + Math.sin(P.h) * P.v * dt, nz = P.z + Math.cos(P.h) * P.v * dt;
    const stop = (x, z, h) => poseBlocked(x, z, h, P.x, P.z, oh);
    if (!stop(nx, nz, P.h)) { P.x = nx; P.z = nz; }
    else if (!stop(nx, P.z, P.h)) { P.x = nx; P.v *= 0.92; }
    else if (!stop(P.x, nz, P.h)) { P.z = nz; P.v *= 0.92; }
    else { if (Math.abs(P.v) > 3 && bumpT <= 0) { SND.bump(); bumpT = 0.6; } P.v *= -0.2; if (stop(P.x, P.z, P.h)) P.h = oh; }
    bumpT -= dt;
    bike.position.set(P.x, 0, P.z); bike.rotation.y = P.h;
    bike.rotation.z += ((P.steer * Math.min(1, Math.abs(P.v) / 7) * R.lean) - bike.rotation.z) * Math.min(1, dt * 6);
    P.wheel += P.v * dt / R.wheelR;
    if (thr > 0 || P.v > 0.4) P.phase += Math.max(0, P.v) * dt * 1.3;
    for (const w of rideM.wheels) w.rotation.x = P.wheel;
    if (rideM.update) rideM.update(P.phase, P.wheel, Math.min(1, Math.abs(P.v) / 2));
    puffT -= dt;
    // dust from the back of whatever is ridden; engines leave a faint puff even on tarmac
    if (Math.abs(P.v) > 2.5 && puffT <= 0) { puffT = 0.05; const [d, s] = nearSeg(P.x, P.z); const dirt = d > 0 || (s && s[7]), back = R.half[1]; puffs.emit(P.x - Math.sin(P.h) * back + (Math.random() - 0.5) * 0.2, 0.15, P.z - Math.cos(P.h) * back, dirt ? 1 : R.sound === 'horn' ? 0.4 : 0.25); }

    if (opts.realClock) hour = nowHour();
    else if (playing) hour = (hour + dt * 24 / (dayMin * 60)) % 24;
    const ang = (hour - 6) / 24 * Math.PI * 2, elev = Math.sin(ang);
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.22), dusk = Math.max(0, 1 - Math.abs(elev) / 0.3), night = 1 - day;
    tmp.copy(SKY_TOP_N).lerp(SKY_TOP_D, day).lerp(SKY_TOP_S, dusk * 0.5); tmp2.copy(SKY_HOR_N).lerp(SKY_HOR_D, day).lerp(SKY_HOR_S, dusk * 0.7);
    sky.material.uniforms.top.value.copy(tmp); sky.material.uniforms.horizon.value.copy(tmp2); scene.fog.color.copy(tmp2);
    const sdx = Math.cos(ang), sdy = elev, sdz = 0.35;
    sky.material.uniforms.sunDir.value.set(sdx, sdy, sdz).normalize(); sky.material.uniforms.sunCol.value.setRGB(1, 0.8 + 0.2 * (1 - dusk), 0.6 + 0.4 * (1 - dusk)).multiplyScalar(day);
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    if (elev > -0.05) {
      sun.intensity = day * (2.2 + dusk * 0.7); sun.color.setRGB(1, 0.78 + 0.2 * (1 - dusk), 0.55 + 0.4 * (1 - dusk));
      sun.position.set(P.x + sdx * 140, Math.max(0.12, elev) * 160 + 8, P.z + sdz * 140);
    } else {
      sun.intensity = 0.42 * night; sun.color.copy(MOON);
      sun.position.set(P.x - sdx * 120, -elev * 150 + 30, P.z - 60);
    }
    const tx = Math.round(P.x / 1.5) * 1.5, tz = Math.round(P.z / 1.5) * 1.5;
    sun.position.x += tx - P.x; sun.position.z += tz - P.z; sun.target.position.set(tx, 0, tz);
    if (fill) {
      fill.position.set(tx - sdx * 80, 40 + day * 30, tz - sdz * 80); fill.target.position.set(tx, 0, tz);
      fill.intensity = 0.12 + day * 0.28; fill.color.setRGB(0.55 + 0.2 * day, 0.65 + 0.15 * day, 0.85);
    }
    hemi.intensity = (mobile ? 0.55 : 0.28) + day * 0.62 + dusk * 0.12;
    hemi.color.setRGB(0.45 + 0.5 * day, 0.55 + 0.38 * day, 0.78 + 0.18 * day);
    hemi.groundColor.setRGB(0.55 + 0.2 * day, 0.42 + 0.18 * day, 0.28 + 0.1 * day);
    renderer.toneMappingExposure = (best ? 1.02 : mobile ? 1.0 : 0.94) + dusk * 0.12 + night * 0.08;
    const glow = THREE.MathUtils.smoothstep(night, 0.3, 0.8);
    if (homes) homes.update(P.x, P.z, glow, tsec);
    fences.update(P.x, P.z);
    bulbMat.color.copy(BULB_D).lerp(BULB_N, night).multiplyScalar(1 + night * 2.1);
    starMat.opacity = THREE.MathUtils.smoothstep(night, 0.5, 1);
    headlight.intensity = night * 1.55; BK.lensM.emissiveIntensity = night * 3.4;
    vehicleLights.head.emissiveIntensity = 0.1 + night * 4.5; vehicleLights.tail.emissiveIntensity = 0.2 + night * 3.4;
    PM.gold.emissiveIntensity = night * 1.7; if (train && train.lights) train.lights.emissiveIntensity = 0.3 + night * 5.5;
    waterMat.uniforms.time.value = tsec; waterMat.uniforms.day.value = day; waterMat.uniforms.sunDir.value.copy(sky.material.uniforms.sunDir.value); waterMat.uniforms.sky.value.copy(tmp2);
    envT -= dt; if (envT <= 0) { envT = 0.5; for (const m of stdMats) m.envMapIntensity = m.userData.envBase * (0.22 + 0.95 * day + dusk * 0.25); }
    if (fx) {
      // Soft daytime bloom for sun glints; stronger at night for windows/lamps.
      fx.bloom.enabled = true;
      fx.bloom.strength = 0.12 + night * 0.55 + dusk * 0.18;
      fx.bloom.threshold = night > 0.4 ? 0.85 : 1.15;
      fx.bloom.radius = 0.42;
    }
    if (motes) motes.update(tsec, P.x, P.z, night);
    puffs.update(dt, 0.35 + day * 0.65);

    for (const a of agents) {
      const fx_ = a.to.x - a.from.x, fz = a.to.z - a.from.z, L = Math.hypot(fx_, fz) || 1, ux = fx_ / L, uz = fz / L;
      const cx = a.from.x + fx_ * a.t - uz * a.lane, cz = a.from.z + fz * a.t + ux * a.lane;
      const qx = P.x - cx, qz = P.z - cz, ahead = qx * ux + qz * uz, lat = Math.abs(-qx * uz + qz * ux);
      const target = ahead > 0 && ahead < (a.type === 'ped' ? 2.5 : 7) && lat < (a.type === 'ped' ? 1.2 : 2.4) ? 0 : a.speed;
      a.cur += (target - a.cur) * Math.min(1, dt * 3);
      a.t += a.cur * dt / L;
      if (a.t >= 1) { const nb = a.to.adj.filter(n => n !== a.from); const nxt = nb.length ? mpick(nb) : a.from; a.from = a.to; a.to = nxt; a.t = 0; }
      a.g.position.set(cx, 0, cz);
      const vis = Math.abs(cx - P.x) < AGENT_R && Math.abs(cz - P.z) < AGENT_R; a.g.visible = vis; if (!vis) { a.g.rotation.y = Math.atan2(ux, uz); continue; }
      let d = Math.atan2(ux, uz) - a.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); a.g.rotation.y += d * Math.min(1, dt * 8);
      if (a.mixer) a.mixer.update(dt * (a.cur / a.speed + 0.05));
      if (a.type === 'ped') {
        a.walk += a.cur * dt * 5.5;
        if (a.arms) { a.arms.forEach((ar, i) => { if (!ar.userData.fixed) ar.rotation.x = Math.sin(a.walk + i * Math.PI) * 0.45 * (a.cur / a.speed); }); a.feet.forEach((f, i) => { f.position.z = 0.02 + Math.sin(a.walk + i * Math.PI) * 0.12 * (a.cur / a.speed); }); a.g.position.y = Math.abs(Math.sin(a.walk)) * 0.03; }
      } else if (a.wheels) for (const w of a.wheels) w.rotation.x += a.cur * dt / 0.33;
      const dp = Math.hypot(qx, qz);
      const pr = a.r + R.half[0] + 0.25;
      if (dp < pr && dp > 0.01) { P.x += qx / dp * (pr - dp); P.z += qz / dp * (pr - dp); P.v *= 0.7; }
    }
    if (train) {
      const T = train;
      if (T.wait > 0) T.wait -= dt; else { T.s += T.dir * 9 * dt; if (T.s > T.r.L - 5 || T.s < 80) { T.dir *= -1; T.wait = 10; T.s = Math.max(80, Math.min(T.r.L - 5, T.s)); } }
      let off = 0;
      T.cars.forEach(c => { const [x, z, a] = railAt(T.r, T.s - off - c.L / 2); off += c.L + 0.8; c.g.position.set(x, 0.12, z); c.g.rotation.y = a; const dx = P.x - x, dz = P.z - z, dd = Math.hypot(dx, dz); if (dd < 4) { P.x += dx / dd * (4 - dd); P.z += dz / dd * (4 - dd); P.v *= 0.5; } });
    }
    for (const f of flowers) { if (f.got) continue; f.g.rotation.y = tsec * 1.2; f.g.position.y = 1.3 + Math.sin(tsec * 2 + f.x) * 0.15; if (playing && Math.hypot(f.x - P.x, f.z - P.z) < 2.6) { f.got = true; scene.remove(f.g); flowersGot++; SND.collect(); ev({ type: 'toast', text: flowersGot === flowers.length ? 'ပိတောက်ပန်း အားလုံး စုပြီးပါပြီ!' : `ပိတောက်ပန်း +၁ (${my(flowersGot)}/${my(flowers.length)})` }); } }
    pins.forEach((p, i) => { p.rotation.y = tsec + i; p.position.y = 14 + Math.sin(tsec * 1.5 + i) * 0.5; });
    if (mission) {
      mission.t += dt;
      const T = mission.stage === 'pickup' ? mission.A : mission.B, d = Math.hypot(T.x - P.x, T.z - P.z);
      beam.material.opacity = 0.22 + Math.sin(tsec * 4) * 0.08;
      arrow.visible = d > 12; arrow.position.set(P.x, 3.2 + Math.sin(tsec * 3) * 0.1, P.z); arrow.rotation.y = Math.atan2(T.x - P.x, T.z - P.z);
      if (d < 7) {
        if (mission.stage === 'pickup') { mission.stage = 'deliver'; mission.t = 0; pkg.visible = true; beamMat.color.copy(BEAM_B); beam.position.set(mission.B.x, 0, mission.B.z); SND.pick(); ev({ type: 'toast', text: `${mission.item} ရပြီ — ပို့ရန် သွားပါ` }); }
        else { const base = Math.round(mission.dist / 10) * 50 + 500, bonus = mission.t < mission.limit ? Math.round((mission.limit - mission.t) * 10 / 50) * 50 : 0; money += base + bonus; delivered++; SND.done(); ev({ type: 'toast', text: `ပို့ဆောင်ပြီး! +${my((base + bonus).toLocaleString())} ကျပ်${bonus ? ' (အချိန်ဆုကြေး ပါ)' : ''}` }); cancelMission(); }
      }
    }
    popT -= dt;
    if (popT <= 0) { popT = 0.3; let bp = null, bd = 28; for (const p of W.pois) { const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < bd) { bd = d; bp = p; } } popup = bp; }
    const cm = CAM[camMode], k = 1 - Math.exp(-dt * 4.2), cs = R.cam, up = 1 + (cs - 1) * 0.9;
    want.set(P.x - Math.sin(P.h) * cm.d * cs, cm.h * up, P.z - Math.cos(P.h) * cm.d * cs);
    camPos.lerp(want, k); camera.position.copy(camPos);
    look.set(P.x + Math.sin(P.h) * cm.look * cs, cm.lookY * (1 + (cs - 1) * 0.6), P.z + Math.cos(P.h) * cm.look * cs); camera.lookAt(look);
    cullT -= dt;
    if (cullT <= 0) {
      cullT = 0.2;
      const pix = Math.floor(P.x / CHUNK), piz = Math.floor(P.z / CHUNK);
      for (const c of cullMeshes) { const d = Math.max(Math.abs(c.ix - pix), Math.abs(c.iz - piz)); c.me.visible = d <= c.r; }
    }
    if (blobs) updateBlobs();
    if (fx) fx.render(dt); else renderer.render(scene, camera);
    mmT -= dt; if (mmT <= 0) { mmT = 0.12; drawMinimap(); }
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.2;
      let m = null;
      if (mission) { const T = mission.stage === 'pickup' ? mission.A : mission.B; m = { stage: mission.stage, item: mission.item, label: T.label, dist: Math.round(Math.hypot(T.x - P.x, T.z - P.z)), left: mission.stage === 'deliver' ? Math.max(0, Math.round(mission.limit - mission.t)) : null }; }
      hud({ loading: false, ready: true, offline: W.offline, sat: !!sat, hour, money, delivered, flowers: flowersGot, flowersTotal: flowers.length, speed: Math.round(Math.abs(P.v) * 3.6), ride: rideId, mission: m, popup: popup ? { name: popup.name, en: popup.en, kind: popup.kind } : null, stats: { b: W.buildings.length, r: W.roads.length, p: W.pois.length, models: Object.keys(assets).length } });
    }
  };
  // Link every shader before the first frame (in parallel where KHR_parallel_shader_compile is
  // available) so the opening seconds do not hitch on program compiles — worst on phones.
  msg('ဂရပ်ဖစ် ပြင်ဆင်နေသည်…', 0.95);
  // the other rideable vehicles join that compile, so the first switch to them does not hitch
  const preload = RIDE_ORDER.filter(id => !rideModels[id]).map(id => (rideModels[id] = buildRide(id)).g);
  preload.forEach(g => scene.add(g));
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* older drivers: compile lazily */ }
  preload.forEach(g => scene.remove(g));
  raf = requestAnimationFrame(frame);

  const api = {
    start() { ac(); playing = true; perfAcc = 0; perfN = 0; },   // fresh timing window
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pr }),
    bell() { if (R.sound === 'horn') SND.horn(); else SND.bell(); for (const a of agents) if (a.type === 'ped' && Math.hypot(a.g.position.x - P.x, a.g.position.z - P.z) < 12) a.lane = Math.sign(a.lane || 1) * 4.3; },
    // Switch to the next rideable vehicle, unless it would not fit where the player stands.
    cycleRide() {
      const prev = rideId, next = RIDE_ORDER[(RIDE_ORDER.indexOf(rideId) + 1) % RIDE_ORDER.length];
      mountRide(next);
      if (poseBlocked(P.x, P.z, P.h)) { mountRide(prev); ev({ type: 'toast', text: `${RIDES[next].name} အတွက် နေရာမလောက်ပါ — လမ်းပေါ်ထွက်ပါ` }); return; }
      P.v = 0; collectMats();
      ev({ type: 'toast', text: RIDES[next].name });
      hud({ ride: rideId });
    },
    cycleCamera() { camMode = (camMode + 1) % CAM.length; if (fx) fx.setBlur(CAM[camMode].blur); },
    toggleMission() { if (mission) { cancelMission(); ev({ type: 'toast', text: 'အလုပ် ပယ်ဖျက်ပြီး' }); } else startMission(); },
    setDayMinutes(m) { dayMin = Math.max(1, m || 8); },
    setTraffic,
    setHour(h) { hour = h; },
    pause(v) { frozen = !!v; },
    dispose() { disposed = true; clearTimeout(decorTimer); cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); renderer.dispose(); renderer.domElement.remove(); },
  };
  return api;
}
