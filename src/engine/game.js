import * as THREE from './three.js';
import { RoomEnvironment } from './addons.js';
import * as O from './osm.js';
import { makeTextures } from './textures.js';
import { std, tube, bake, makeBike, makePagoda, makePagodaMats, makeStation, makeTrainCar, makeVehicle, vehicleLights, makePerson, palmGeometries, roundTreeGeometries, bushGeometry } from './models.js';
import { loadAssets, cloneAsset, instancedFromAsset } from './assets.js';
import { makeComposer, makeSky, makeWaterMaterial, makeMotes, makePuffs } from './fx.js';

const { BB, px, pz, HW, HH, BX, BZ, MR, UP, my, rnd, pick, mpick, col, MAJOR, DRIVE, WALLS, CAR_COLS, ITEMS, pip, area, centroid, segDist, clipSeg, Grid, Builder } = O;
export { my };
const UNPAVED = /unpaved|dirt|ground|gravel|sand|earth|compacted/;
const TIN = ['#d6dadd', '#c9ccd0', '#b98d6a', '#a85a44', '#6f8fa6', '#7f9a7a', '#e0e2e4', '#c08a5a'];
const WOODS = ['#e2c09a', '#d4ab82', '#c79a6e', '#e8cfae'];

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
};

export async function createGame(o) {
  const { container, minimap, joyBase, joyKnob } = o;
  const modelsBase = o.modelsBase || 'models/';
  const hud = o.onHud || (() => {}), ev = o.onEvent || (() => {});
  const opts = Object.assign({ dayMinutes: 8, startHour: 16, traffic: 'Normal', quality: 'Best', realClock: false }, o.options || {});
  const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
  const best = opts.quality !== 'Fast';
  const mobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const MAXPR = Math.min(window.devicePixelRatio || 1, best ? (mobile ? 1.5 : 2) : 1);
  let pr = mobile ? Math.min(1, MAXPR) : MAXPR;
  const msg = m => hud({ loading: true, loadMsg: m });

  msg('စတင်နေသည်…');
  const [data0, assets] = await Promise.all([O.fetchOSM(msg), loadAssets(modelsBase, msg)]);
  let data = data0; if (!data) { msg('အင်တာနက် မရပါ — နမူနာမြို့ကို တည်ဆောက်နေသည်…'); data = O.fallbackData(); }
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
  msg('မြို့ကို တည်ဆောက်နေသည်…');
  await new Promise(r => setTimeout(r, 30));
  const TX = makeTextures();
  const W = O.parse(data);
  const isMobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const sat = opts.ground === 'Satellite' ? await loadSatellite(msg, isMobile) : null;
  msg('မြို့ကို တည်ဆောက်နေသည်…');
  const satRoof = (x, z) => { if (!sat) return null; const d = sat.sample, u = (x - sat.wx0) / (sat.wx1 - sat.wx0), v = (z - sat.wz0) / (sat.wz1 - sat.wz0); const ix = Math.floor(u * d.width), iy = Math.floor(v * d.height); if (ix < 0 || iy < 0 || ix >= d.width || iy >= d.height) return null; const i = (iy * d.width + ix) * 4, r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2]; if (gg > r * 1.06 && gg > b) return null; const c = new THREE.Color().setRGB(r / 255, gg / 255, b / 255, THREE.SRGBColorSpace); return c.lerp(new THREE.Color(1, 1, 1), 0.18); };

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: !best, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
  container.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none' });
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(46, 1, 1.0, 1400);
  scene.fog = new THREE.Fog(0xbfe4f5, 320, 1250);
  const CHUNK = 160, ck = (x, z) => Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
  class ChunkB {
    constructor(us) { this.m = new Map(); this.us = us; }
    at(x, z) { const k = ck(x, z); let b = this.m.get(k); if (!b) { b = new Builder(); if (this.us) b.us = this.us; this.m.set(k, b); } return b; }
    poly(pts, y, c, down) { const [x, z] = centroid(pts); this.at(x, z).poly(pts, y, c, down); }
    seg(ax, az, bx, bz, w, y, c) { this.at((ax + bx) / 2, (az + bz) / 2).seg(ax, az, bx, bz, w, y, c); }
    disc(x, z, r, y, c) { this.at(x, z).disc(x, z, r, y, c, 14); }
    segUV(ax, az, bx, bz, w, y, c, v0, v1) { this.at((ax + bx) / 2, (az + bz) / 2).segUV(ax, az, bx, bz, w, y, c, v0, v1); }
    meshes(mat, cast, recv, order) { for (const b of this.m.values()) if (!b.empty) { const me = b.mesh(mat); me.castShadow = cast; me.receiveShadow = recv; if (order) me.renderOrder = order; scene.add(me); } }
  }
  const sky = makeSky(); scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xdff2ff, 0xc9b48a, 0.8); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.castShadow = true;
  const SH = best && !mobile ? 2048 : 1024, SR = 50;
  sun.shadow.mapSize.set(SH, SH); Object.assign(sun.shadow.camera, { left: -SR, right: SR, top: SR, bottom: -SR, near: 1, far: 420 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.35; sun.shadow.radius = 3;
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

  // ---------- procedural infill ----------
  if (W.buildings.length < 400) {
    msg('အိမ်ခြေများ ဖြည့်စွက်နေသည်…');
    const FILL = new Set(['residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'living_street', 'service', 'road', 'track']);
    let added = 0;
    for (const s of roadSegs) {
      if (added > 2600) break;
      const r = s[6]; if (!FILL.has(r.type)) continue;
      const dx = s[2] - s[0], dz = s[3] - s[1], L = Math.hypot(dx, dz); if (L < 14) continue;
      const fx = dx / L, fz = dz / L, nx = -fz, nz = fx, dens = r.type === 'track' ? 0.35 : 0.72;
      for (let d = 7; d < L - 7; d += 11 + rnd() * 6) for (const side of [-1, 1]) {
        if (rnd() > dens) continue;
        const dep = 6 + rnd() * 4.5, wid = 5.5 + rnd() * 3.5, off = r.w / 2 + 2.6 + dep / 2;
        const cx = s[0] + fx * d + nx * side * off, cz = s[1] + fz * d + nz * side * off;
        const c = [[-wid / 2, -dep / 2], [wid / 2, -dep / 2], [wid / 2, dep / 2], [-wid / 2, dep / 2]].map(([u, v]) => [cx + fx * u + nx * v, cz + fz * u + nz * v]);
        if (c.some(p => Math.abs(p[0]) > BX - 3 || Math.abs(p[1]) > BZ - 3 || blocked(p[0], p[1]) || roadClear(p[0], p[1]) < 1.0) || blocked(cx, cz)) continue;
        const b = { pts: c, tags: { building: 'house' }, proc: true }; b.ob = addObs(c, 'b'); W.buildings.push(b); added++;
      }
    }
  }

  // ---------- ground ----------
  const G = new ChunkB(6);
  if (!sat) for (const g of W.greens.sort((a, b) => a.y - b.y)) G.poly(g.pts, g.y, col(g.color));
  const bedC = col('#6f9c94');
  for (const w of W.waters) G.poly(w, 0.025, bedC);
  const curbC = col('#ebe3d2'), majC = col('#7f848d'), resC = col('#959aa2'), trkC = col('#d2b27f'), footC = col('#e9dfc9'), dashC = col('#fbf6e6');
  const order = s => (MAJOR.has(s[6].type) ? 3 : DRIVE.has(s[6].type) ? 2 : 1);
  const sorted = roadSegs.slice().sort((a, b) => order(a) - order(b));
  const shoulderC = col('#d8c49a'), white = col('#ffffff');
  const RD = { major: new ChunkB(), plain: new ChunkB(), dirt: new ChunkB() }, JN = { paved: new ChunkB(8), dirt: new ChunkB(8) };
  const ordR = r => (MAJOR.has(r.type) ? 3 : DRIVE.has(r.type) ? 2 : 1);
  let wi = 0;
  for (const r of W.roads.slice().sort((a, b) => ordR(a) - ordR(b))) {
    const lift = (wi++ % 8) * 0.004;
    const t = r.type, unp = t === 'track' || UNPAVED.test(r.tags.surface || ''), drive = DRIVE.has(t) || t === 'track';
    const kind = !drive ? null : unp ? 'dirt' : MAJOR.has(t) ? 'major' : 'plain';
    const y = (MAJOR.has(t) ? 0.09 : drive ? 0.07 : 0.06) + lift, rep = 16;
    let cum = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const p = r.pts[i], q = r.pts[i + 1], L0 = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const c = clipSeg(p[0], p[1], q[0], q[1]); if (!c) { cum += L0; continue; }
      const L = Math.hypot(c[2] - c[0], c[3] - c[1]);
      if (!kind) { G.seg(c[0], c[1], c[2], c[3], r.w, y, footC); G.disc(c[2], c[3], r.w / 2, y, footC); cum += L0; continue; }
      if (kind !== 'dirt') { G.seg(c[0], c[1], c[2], c[3], r.w + 2.0, 0.04 + lift * 0.25, shoulderC); G.disc(c[0], c[1], (r.w + 2.0) / 2, 0.04 + lift * 0.25, shoulderC); G.disc(c[2], c[3], (r.w + 2.0) / 2, 0.04 + lift * 0.25, shoulderC); }
      RD[kind].segUV(c[0], c[1], c[2], c[3], r.w, y, white, cum / rep, (cum + L) / rep);
      const jn = kind === 'dirt' ? JN.dirt : JN.paved;
      jn.disc(c[0], c[1], r.w / 2, y - 0.002, white); jn.disc(c[2], c[3], r.w / 2, y - 0.002, white);
      cum += L0;
    }
  }
  const sleepers = [], balC = col('#a99a88'), railC = col('#6b7078');
  for (const c of railSegs) {
    G.seg(c[0], c[1], c[2], c[3], 3.2, 0.13, balC); G.disc(c[2], c[3], 1.6, 0.13, balC);
    const dx = c[2] - c[0], dz = c[3] - c[1], L = Math.hypot(dx, dz); if (L < 0.1) continue;
    const nx = -dz / L, nz = dx / L;
    for (const o of [-0.72, 0.72]) G.seg(c[0] + nx * o, c[1] + nz * o, c[2] + nx * o, c[3] + nz * o, 0.14, 0.2, railC);
    for (let d = 0; d < L && sleepers.length < 16000; d += 1.0) sleepers.push([c[0] + dx * d / L, 0.15, c[1] + dz * d / L, Math.atan2(dx, dz)]);
  }
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.ground, roughness: 0.95 });
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
  const roadMat = map => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.88, metalness: 0 });
  RD.major.meshes(roadMat(TX.asphaltMajor), false, true); RD.plain.meshes(roadMat(TX.asphaltPlain), false, true); RD.dirt.meshes(roadMat(TX.dirtRoad), false, true);
  JN.paved.meshes(roadMat(TX.asphaltJoint), false, true); JN.dirt.meshes(roadMat(TX.dirtJoint), false, true);
  const waterMat = makeWaterMaterial();
  { const WB = new ChunkB(); const wc = col('#ffffff');
    for (const w of W.waters) WB.poly(w, 0.045, wc);
    for (const w of W.waterLines) for (let i = 0; i < w.pts.length - 1; i++) { const c = clipSeg(w.pts[i][0], w.pts[i][1], w.pts[i + 1][0], w.pts[i + 1][1]); if (c) { WB.seg(c[0], c[1], c[2], c[3], w.w, 0.045, wc); WB.disc(c[2], c[3], w.w / 2, 0.045, wc); } }
    WB.meshes(waterMat, false, false, 1); }
  const byChunk = (list, ix, iz) => { const mp = new Map(); for (const w of list) { const k = ck(w[ix], w[iz]); if (!mp.has(k)) mp.set(k, []); mp.get(k).push(w); } return [...mp.values()]; };
  const mkInst = (list, geo, mat, y0 = 0, shadow = false, colorFn = null) => { if (!list.length) return null; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), s2 = new THREE.Vector3(); for (const part of byChunk(list, 0, 2)) { const im = new THREE.InstancedMesh(geo, mat, part.length); part.forEach((w, i) => { q.setFromEuler(e.set(0, w[3], 0)); m4.compose(v.set(w[0], w[1] + y0, w[2]), q, w[4] ? s2.set(1, w[4], 1) : s1); im.setMatrixAt(i, m4); if (colorFn) im.setColorAt(i, colorFn(w)); }); im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true; scene.add(im); } };
  mkInst(sleepers, new THREE.BoxGeometry(2.3, 0.1, 0.26), std(0x5e4636, { roughness: 0.9 }));
  const boardMats = [0, 1, 2, 3, 4, 5].map(i => i === 2 ? new THREE.MeshStandardMaterial({ color: 0xb4c98a, map: TX.ground, roughness: 1 }) : new THREE.MeshStandardMaterial({ color: 0x8c5e3a, map: TX.wood, roughness: 0.7 }));
  const board = new THREE.Mesh(new THREE.BoxGeometry(BX * 2 + 6, 8, BZ * 2 + 6), boardMats); board.position.y = sat ? -4.08 : -4.001; board.receiveShadow = true; scene.add(board);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(BX * 2 + 40, 3, BZ * 2 + 40), std(0x4e3522, { map: TX.wood, roughness: 0.6 })); plinth.position.y = -9.5; scene.add(plinth);

  // ---------- buildings ----------
  msg('အဆောက်အအုံများ ဆောက်နေသည်…');
  const WB = { bamboo: new ChunkB(), wood: new ChunkB(), plaster: new ChunkB() }, RBc = new ChunkB(), UBc = new ChunkB(), CBc = new ChunkB();
  const winLit = [], winDark = [], frames = [], doors = [], posts = [];
  const houseA = assets.houses || [], houseLists = houseA.map(() => []);
  const cAt = (pts) => centroid(pts);
  for (const b of W.buildings) {
    const pts = b.pts; if (pts.length < 3) continue;
    const ar = area(pts); if (ar < 6) continue;
    const t = b.tags, [cx, cz] = cAt(pts);
    const small = b.proc || ar < 140;
    const ns = houseA.length && pts.length === 4 && ar < 260 ? nearSeg(cx, cz) : null;
    if (ns && ns[1] && ns[0] < 9 && MAJOR.has(ns[1][6].type)) {
      const [p0, p1, p2] = pts, e0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), e1 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const ua = e0 >= e1 ? [p1[0] - p0[0], p1[1] - p0[1]] : [p2[0] - p1[0], p2[1] - p1[1]], lu = Math.max(e0, e1), lv = Math.min(e0, e1);
      const ux = ua[0] / lu, uz = ua[1] / lu; let th = Math.atan2(-uz, ux);
      const fz = [Math.sin(th), Math.cos(th)]; if (roadClear(cx + fz[0] * 6, cz + fz[1] * 6) > roadClear(cx - fz[0] * 6, cz - fz[1] * 6)) th += Math.PI;
      const k = Math.floor(rnd() * houseA.length), sz = houseA[k].size, sx = lu / Math.max(sz.x, 0.1), szz = lv / Math.max(sz.z, 0.1);
      houseLists[k].push([cx, cz, th, sx, (5.5 + rnd() * 2.5) / Math.max(sz.y, 0.1), szz]); continue;
    }
    const kind = small ? (rnd() < 0.55 ? 'bamboo' : 'wood') : 'plaster';
    const stilt = small && rnd() < 0.45, y0 = stilt ? 1.3 : 0;
    let levels = small ? 1 : (parseInt(t['building:levels']) || (ar > 500 ? 2 : (rnd() < 0.45 ? 2 : 1)));
    levels = Math.min(levels, 8);
    const h = parseFloat(t.height) || (y0 + levels * 3.0 + (small ? 0.3 : 0.5));
    const v = 0.9 + rnd() * 0.15;
    const wc = kind === 'plaster' ? col(pick(WALLS)) : kind === 'wood' ? col(pick(WOODS)) : new THREE.Color(v, v * 0.98, v * 0.95);
    const B = WB[kind].at(cx, cz), RB = RBc.at(cx, cz), UB = UBc.at(cx, cz), CB = CBc.at(cx, cz);
    let doorEdge = -1, dmin = 1e9;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 2.4) continue; const d = roadClear((a[0] + c[0]) / 2, (a[1] + c[1]) / 2); if (d < dmin) { dmin = d; doorEdge = i; } }
    let cum = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.05) continue;
      let nx = dz / L, nz = -dx / L;
      if (pip((a[0] + c[0]) / 2 + nx * 0.15, (a[1] + c[1]) / 2 + nz * 0.15, pts)) { nx = -nx; nz = -nz; }
      const u0 = cum / 2, u1 = (cum + L) / 2; cum += L;
      B.quad([a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], h, c[1]], [a[0], h, a[1]], wc, [nx, 0, nz], [u0, y0 / 2], [u1, y0 / 2], [u1, h / 2], [u0, h / 2]);
      const rot = Math.atan2(nx, nz);
      if (stilt) { posts.push([a[0], 0, a[1], 0, y0]); if (L > 4) posts.push([(a[0] + c[0]) / 2, 0, (a[1] + c[1]) / 2, 0, y0]); }
      if (i === doorEdge) doors.push([a[0] + dx * 0.5 + nx * 0.06, y0 + 1.05, a[1] + dz * 0.5 + nz * 0.06, rot]);
      if (L > 2.6 && winLit.length + winDark.length < 16000) {
        let n = small ? Math.floor(L / 3.0) : Math.floor((L - 0.8) / 2.6);
        if (i === doorEdge && n % 2 === 1) n--;
        for (let k = 0; k < n; k++) for (let f = 0; f < levels; f++) {
          const tt = (k + 0.5) / n, wx = a[0] + dx * tt, wz = a[1] + dz * tt, wy = y0 + 1.55 + f * 3.0;
          frames.push([wx + nx * 0.03, wy, wz + nz * 0.03, rot]);
          (rnd() < 0.32 ? winLit : winDark).push([wx + nx * 0.075, wy, wz + nz * 0.075, rot]);
        }
      }
    }
    if (stilt) UB.poly(pts, y0, col('#7a5a3e'), true);
    const rc = satRoof(cx, cz) || col(pick(TIN));
    if (pts.length === 4 && ar < 420) {
      const [p0, p1, p2] = pts;
      const e0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), e1 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const [a, bb, c, d] = e0 >= e1 ? pts : [pts[1], pts[2], pts[3], pts[0]];
      const lu = Math.hypot(bb[0] - a[0], bb[1] - a[1]), lv = Math.hypot(d[0] - a[0], d[1] - a[1]);
      const ux = [(bb[0] - a[0]) / lu, (bb[1] - a[1]) / lu], vx = [(d[0] - a[0]) / lv, (d[1] - a[1]) / lv];
      const oh = small ? 0.6 : 0.45, rh = lv * (small ? 0.42 : 0.3) + 0.3, sl = rh / (lv / 2), ey = h - sl * oh;
      const P = (p, du, dv, y) => [p[0] + ux[0] * du + vx[0] * dv, y, p[1] + ux[1] * du + vx[1] * dv];
      const A = P(a, -oh, -oh, ey), Bv = P(bb, oh, -oh, ey), C = P(c, oh, oh, ey), D = P(d, -oh, oh, ey);
      const m1 = [(bb[0] + c[0]) / 2, (bb[1] + c[1]) / 2], m3 = [(d[0] + a[0]) / 2, (d[1] + a[1]) / 2];
      const M1 = P(m1, oh, 0, h + rh), M3 = P(m3, -oh, 0, h + rh);
      const ref = (...q) => [q.reduce((s, p) => s + p[0], 0) / q.length - cx, q.reduce((s, p) => s + p[1], 0) / q.length - (h - 1), q.reduce((s, p) => s + p[2], 0) / q.length - cz];
      const uv = p => [(p[0] * ux[0] + p[2] * ux[1]) / 1.1, (p[0] * vx[0] + p[2] * vx[1]) / 1.1 + p[1] / 1.1];
      const rtri = (q1, q2, q3) => { RB.tri(q1, q2, q3, rc, ref(q1, q2, q3), uv(q1), uv(q2), uv(q3)); const r = ref(q1, q2, q3); UB.tri(q1, q2, q3, col('#5e4a3a'), [-r[0], -r[1], -r[2]]); };
      rtri(A, Bv, M1); rtri(A, M1, M3); rtri(C, D, M3); rtri(C, M3, M1);
      const G1 = [bb[0], h, bb[1]], G2 = [c[0], h, c[1]], G3 = [d[0], h, d[1]], G4 = [a[0], h, a[1]], Mg1 = [m1[0], h + rh, m1[1]], Mg3 = [m3[0], h + rh, m3[1]];
      B.tri(G1, G2, Mg1, wc, ref(G1, G2, Mg1), [0, h / 2], [lv / 2, h / 2], [lv / 4, (h + rh) / 2]);
      B.tri(G3, G4, Mg3, wc, ref(G3, G4, Mg3), [0, h / 2], [lv / 2, h / 2], [lv / 4, (h + rh) / 2]);
    } else {
      CB.poly(pts, h - 0.45, col('#dcd6cc'));
      for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2; CB.quad([a[0], h - 0.45, a[1]], [c[0], h - 0.45, c[1]], [c[0], h, c[1]], [a[0], h, a[1]], wc, [cx - mx, 0, cz - mz]); }
      CB.poly(pts.map(p => [p[0], p[1]]), h, col('#efe9de'));
    }
  }
  const wallMats = { bamboo: std(0xffffff, { map: TX.bamboo, vertexColors: true, roughness: 0.92 }), wood: std(0xffffff, { map: TX.wood, vertexColors: true, roughness: 0.85 }), plaster: std(0xffffff, { map: TX.plaster, vertexColors: true, roughness: 0.92 }) };
  houseA.forEach((h, i) => houseLists[i].length && instancedFromAsset(h, houseLists[i], scene));
  for (const k in WB) WB[k].meshes(wallMats[k], true, true);
  RBc.meshes(new THREE.MeshStandardMaterial({ map: TX.tin, vertexColors: true, metalness: 0.6, roughness: 0.4 }), true, true);
  UBc.meshes(std(0xffffff, { vertexColors: true, roughness: 0.9 }), false, true);
  CBc.meshes(std(0xffffff, { vertexColors: true, map: TX.concrete, roughness: 0.95 }), true, true);
  const litMat = new THREE.MeshBasicMaterial({ color: 0x3a4452, map: TX.windowLit });
  const WINC = ['#ffffff', '#ffffff', '#ffe2b8', '#ffd0a0', '#d9ecff', '#e8f6ff'].map(c => col(c));
  const winGeo = new THREE.PlaneGeometry(0.78, 0.95);
  mkInst(frames, new THREE.BoxGeometry(0.98, 1.14, 0.06), std(0x5a3d2b, { roughness: 0.7 }));
  mkInst(winLit, winGeo, litMat, 0, false, w => WINC[Math.floor(Math.abs(w[0] * 3.1 + w[2] * 1.7)) % WINC.length]); mkInst(winDark, winGeo, std(0x34404d, { roughness: 0.15, metalness: 0.5 }));
  mkInst(doors, new THREE.BoxGeometry(1.0, 2.1, 0.08), std(0x6b4630, { map: TX.wood, roughness: 0.75 }));
  { const pg = new THREE.CylinderGeometry(0.11, 0.13, 1, 6); pg.translate(0, 0.5, 0); mkInst(posts, pg, std(0x6e5038, { map: TX.wood, roughness: 0.9 }), 0, true); }

  // ---------- pagodas ----------
  const PM = makePagodaMats(TX);
  for (const p of W.pagodas) {
    let g;
    if (assets.pagoda) { g = cloneAsset(assets.pagoda).object; g.scale.multiplyScalar(p.r / 4); }
    else g = makePagoda(p.r, PM);
    g.position.set(p.x, 0, p.z); scene.add(g);
  }

  // ---------- trees & bushes ----------
  const trees = [];
  const okTree = (x, z) => Math.abs(x) < BX - 2 && Math.abs(z) < BZ - 2 && !blocked(x, z) && roadClear(x, z) > 1.8;
  for (const g of W.greens) {
    if (!g.trees) continue;
    const ar = area(g.pts), n = Math.min(300, Math.floor(ar / 900 * g.trees));
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const p of g.pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
    for (let i = 0, tries = 0; i < n && tries < n * 4 && trees.length < 2600; tries++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0); if (pip(x, z, g.pts) && okTree(x, z)) { trees.push([x, z, rnd() < g.palm ? 1 : 0, 0.75 + rnd() * 0.55]); i++; } }
  }
  for (const s of roadSegs) {
    if (trees.length > 3200) break;
    const r = s[6]; if (!DRIVE.has(r.type) && r.type !== 'track') continue;
    const dx = s[2] - s[0], dz = s[3] - s[1], L = Math.hypot(dx, dz);
    for (let d = 5; d < L; d += 18 + rnd() * 22) { if (rnd() < 0.5) continue; const side = rnd() < 0.5 ? -1 : 1, off = r.w / 2 + 2.4 + rnd() * 2; const x = s[0] + dx * d / L - dz / L * side * off, z = s[1] + dz * d / L + dx / L * side * off; if (okTree(x, z)) trees.push([x, z, rnd() < 0.4 ? 1 : 0, 0.7 + rnd() * 0.45]); }
  }
  for (let i = 0; i < 900 && trees.length < 2800; i++) { const x = (rnd() * 2 - 1) * (BX - 4), z = (rnd() * 2 - 1) * (BZ - 4); if (okTree(x, z) && roadClear(x, z) > 4) trees.push([x, z, rnd() < 0.6 ? 1 : 0, 0.8 + rnd() * 0.5]); }
  const bushes = [];
  for (const b of W.buildings) { if (bushes.length > 1500 || rnd() > 0.35) continue; const [cx, cz] = centroid(b.pts); const p = b.pts[Math.floor(rnd() * b.pts.length)]; const x = p[0] + (p[0] - cx) * 0.25, z = p[1] + (p[1] - cz) * 0.25; if (!blocked(x, z) && roadClear(x, z) > 0.8) bushes.push([x, z, 0, 0.7 + rnd() * 0.6]); }
  {
    const palms = trees.filter(t => t[2] === 1).map(t => [t[0], t[1], t[0] * 13.1 % 6.28, t[3]]), rounds = trees.filter(t => t[2] === 0).map(t => [t[0], t[1], t[0] * 7.7 % 6.28, t[3]]);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    const place = (list, geo, mat, colors) => {
      if (!list.length) return;
      for (const part of byChunk(list, 0, 1)) { const im = new THREE.InstancedMesh(geo, mat, part.length);
      part.forEach((t, i) => { q.setFromEuler(e.set(0, t[2], 0)); m4.compose(v.set(t[0], 0, t[1]), q, s.set(t[3], t[3], t[3])); im.setMatrixAt(i, m4); if (colors) im.setColorAt(i, c.set(colors[Math.floor(Math.abs(t[0] * 7 + t[1] * 3)) % colors.length])); });
      im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; scene.add(im); }
    };
    const vc = o => std(0xffffff, Object.assign({ vertexColors: true, roughness: 0.85 }, o));
    if (assets.palm) instancedFromAsset(assets.palm, palms, scene);
    else { const P = palmGeometries(); place(palms, P.trunk, vc({ roughness: 0.95 })); place(palms, P.crown, vc({ side: THREE.DoubleSide, roughness: 0.7 }), ['#ffffff', '#f0f5e8', '#e6ecd8']); }
    const treeA = assets.tree ? (Array.isArray(assets.tree) ? assets.tree : [assets.tree]) : [];
    if (treeA.length) { const treeLists = treeA.map(() => []); for (const t of rounds) treeLists[Math.floor(Math.abs(t[0] * 11 + t[1] * 5)) % treeA.length].push(t); treeA.forEach((a, i) => treeLists[i].length && instancedFromAsset(a, treeLists[i], scene)); }
    else { const R = roundTreeGeometries(); place(rounds, R.trunk, vc({ roughness: 0.95 })); place(rounds, R.canopy, vc({ flatShading: true, roughness: 0.8 }), ['#6fae5a', '#86bf64', '#5b9a52', '#9cc56b', '#7aa84e']); }
    place(bushes, bushGeometry(), vc({ flatShading: true }), ['#6fae5a', '#5b9a52', '#d9488f', '#86bf64', '#e0609a', '#7aa84e']);
  }

  // ---------- street lamps ----------
  const lamps = [];
  for (const s of roadSegs) { const r = s[6]; if (!MAJOR.has(r.type) || lamps.length > 500) continue; const dx = s[2] - s[0], dz = s[3] - s[1], L = Math.hypot(dx, dz); for (let d = 10; d < L; d += 36) { const off = r.w / 2 + 1.0, x = s[0] + dx * d / L - dz / L * off, z = s[1] + dz * d / L + dx / L * off; if (!blocked(x, z)) lamps.push([x, 0, z, Math.atan2(-dz, dx) + Math.PI / 2]); } }
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  if (lamps.length) {
    const pole = new THREE.CylinderGeometry(0.06, 0.1, 5, 6); pole.translate(0, 2.5, 0);
    const arm = new THREE.BoxGeometry(0.06, 0.06, 1.0); arm.translate(0, 4.95, -0.45);
    const metal = std(0x4a4f57, { metalness: 0.7, roughness: 0.4 });
    mkInst(lamps, pole, metal, 0, true); mkInst(lamps, arm, metal);
    const bg = new THREE.SphereGeometry(0.2, 10, 8); bg.scale(1, 0.6, 1); bg.translate(0, 4.85, -0.9); mkInst(lamps, bg, bulbMat);
  }

  // stars
  const starGeo = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 900; i++) { const a = Math.random() * 6.28, el = Math.random() * 1.3 + 0.1; sp.push(Math.cos(a) * Math.cos(el) * 2400, Math.sin(el) * 2400, Math.sin(a) * Math.cos(el) * 2400); }
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
  const bike = new THREE.Group(); bike.rotation.order = 'YXZ';
  const BK = makeBike(TX);
  if (assets.bike) { bike.add(cloneAsset(assets.bike).object); bike.add(BK.pkg); } else bike.add(BK.group);
  scene.add(bike);
  const headlight = new THREE.SpotLight(0xfff0c8, 0, 34, 0.55, 0.5, 0); headlight.position.set(0, 1.0, 0.7); bike.add(headlight); bike.add(headlight.target); headlight.target.position.set(0, 0, 10);
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
  const TRAFFIC = { Quiet: [8, 12], Normal: [18, 24], Busy: [32, 44] };
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
  const cancelMission = () => { mission = null; beam.visible = false; BK.pkg.visible = false; arrow.visible = false; };

  // ---------- input ----------
  const keys = {}, joy = { x: 0, y: 0, id: null };
  const kd = e => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') { api.bell(); e.preventDefault(); } };
  const ku = e => { keys[e.key.toLowerCase()] = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const jmove = e => { if (joy.id !== e.pointerId) return; const r = joyBase.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } joy.x = dx / R; joy.y = dy / R; if (joyKnob) joyKnob.style.transform = `translate(${dx}px, ${dy}px)`; };
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
  const fx = best ? makeComposer(renderer, scene, camera, mobile ? 0 : 4) : null;
  const motes = null; if (motes) scene.add(motes.points);
  const puffs = makePuffs(); scene.add(puffs.points);

  const stdMats = new Set();
  function collectMats() { scene.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && m.isMeshStandardMaterial && !stdMats.has(m)) { m.userData.envBase = m.metalness > 0.5 ? 0.9 : 0.28; stdMats.add(m); } }); }); }
  setTraffic(opts.traffic);

  // ---------- loop ----------
  let perfAcc = 0, perfN = 0, hour = opts.realClock ? nowHour() : opts.startHour, dayMin = opts.dayMinutes, playing = false, camMode = 1, popup = null, popT = 0, hudT = 0, mmT = 0, envT = 0, bumpT = 0, puffT = 0, last = performance.now(), raf = 0, frozen = false;
  const CAM = [{ d: 7.5, h: 3.4, blur: 0 }, { d: 15, h: 9, blur: 0.5 }, { d: 34, h: 30, blur: 1.1 }];
  const camPos = new THREE.Vector3(P.x - Math.sin(P.h) * 15, 9, P.z - Math.cos(P.h) * 15), look = new THREE.Vector3(), want = new THREE.Vector3();
  const SKY_TOP_D = col('#5fa8e0'), SKY_HOR_D = col('#cfe9f5'), SKY_TOP_N = col('#0b1226'), SKY_HOR_N = col('#22304f'), SKY_HOR_S = col('#f5a46e'), SKY_TOP_S = col('#6b6fa8');
  const tmp = new THREE.Color(), tmp2 = new THREE.Color(), WIN_D = col('#3a4452'), WIN_N = col('#ffffff'), BULB_D = col('#d6d6d6'), BULB_N = col('#ffe7a8'), MOON = col('#9fb4ff');
  const blockedR = (x, z) => Math.abs(x) > HW + 8 || Math.abs(z) > HH + 8 || blocked(x, z) || blocked(x + 0.45, z) || blocked(x - 0.45, z) || blocked(x, z + 0.45) || blocked(x, z - 0.45);
  const resize = () => { const w = container.clientWidth || 1, h = container.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (fx) fx.setSize(w, h); puffs.mat.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360)); };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  if (fx) fx.setBlur(CAM[camMode].blur);

  const frame = now => {
    raf = requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
    if (frozen) return;
    perfAcc += rawDt; perfN++;
    if (perfAcc > 1.5) { const avg = perfAcc / perfN; perfAcc = 0; perfN = 0; let np = pr; if (avg > 0.024) np = Math.max(0.6, pr - 0.15); else if (avg < 0.0145) np = Math.min(MAXPR, pr + 0.1); if (Math.abs(np - pr) > 0.01) { pr = np; renderer.setPixelRatio(pr); resize(); } }
    const tsec = now / 1000;
    let steer = 0, thr = 0;
    if (playing) {
      if (Math.abs(joy.x) > 0.08 || Math.abs(joy.y) > 0.08) { steer = joy.x; thr = -joy.y; }
      if (keys.a || keys.arrowleft) steer = -1; if (keys.d || keys.arrowright) steer = 1;
      if (keys.w || keys.arrowup) thr = 1; if (keys.s || keys.arrowdown) thr = -1;
    }
    P.steer += (steer - P.steer) * Math.min(1, dt * 8);
    if (thr > 0) P.v += thr * 4.2 * dt; else if (thr < 0) P.v += (P.v > 0.2 ? thr * 10 : thr * 2) * dt;
    P.v -= P.v * 0.35 * dt; P.v = Math.max(-2.2, Math.min(9, P.v));
    if (Math.abs(P.v) < 0.03 && !thr) P.v = 0;
    P.h -= P.steer * 1.9 * dt * Math.min(1, Math.abs(P.v) / 2.5 + 0.15) * Math.sign(P.v || 1);
    const nx = P.x + Math.sin(P.h) * P.v * dt, nz = P.z + Math.cos(P.h) * P.v * dt;
    if (!blockedR(nx, nz)) { P.x = nx; P.z = nz; }
    else if (!blockedR(nx, P.z)) { P.x = nx; P.v *= 0.92; }
    else if (!blockedR(P.x, nz)) { P.z = nz; P.v *= 0.92; }
    else { if (Math.abs(P.v) > 3 && bumpT <= 0) { SND.bump(); bumpT = 0.6; } P.v *= -0.2; }
    bumpT -= dt;
    bike.position.set(P.x, 0, P.z); bike.rotation.y = P.h;
    bike.rotation.z += ((P.steer * Math.min(1, Math.abs(P.v) / 7) * 0.3) - bike.rotation.z) * Math.min(1, dt * 6);
    P.wheel += P.v * dt / 0.34;
    if (thr > 0 || P.v > 0.4) P.phase += Math.max(0, P.v) * dt * 1.3;
    BK.update(P.phase, P.wheel);
    puffT -= dt;
    if (Math.abs(P.v) > 2.5 && puffT <= 0) { puffT = 0.05; const [d, s] = nearSeg(P.x, P.z); const dirt = d > 0 || (s && s[7]); puffs.emit(P.x - Math.sin(P.h) * 0.6 + (Math.random() - 0.5) * 0.2, 0.15, P.z - Math.cos(P.h) * 0.6, dirt ? 1 : 0.25); }

    if (opts.realClock) hour = nowHour();
    else if (playing) hour = (hour + dt * 24 / (dayMin * 60)) % 24;
    const ang = (hour - 6) / 24 * Math.PI * 2, elev = Math.sin(ang);
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.22), dusk = Math.max(0, 1 - Math.abs(elev) / 0.3), night = 1 - day;
    tmp.copy(SKY_TOP_N).lerp(SKY_TOP_D, day).lerp(SKY_TOP_S, dusk * 0.5); tmp2.copy(SKY_HOR_N).lerp(SKY_HOR_D, day).lerp(SKY_HOR_S, dusk * 0.7);
    sky.material.uniforms.top.value.copy(tmp); sky.material.uniforms.horizon.value.copy(tmp2); scene.fog.color.copy(tmp2);
    const sdx = Math.cos(ang), sdy = elev, sdz = 0.35;
    sky.material.uniforms.sunDir.value.set(sdx, sdy, sdz).normalize(); sky.material.uniforms.sunCol.value.setRGB(1, 0.8 + 0.2 * (1 - dusk), 0.6 + 0.4 * (1 - dusk)).multiplyScalar(day);
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    if (elev > -0.05) { sun.intensity = day * 2.4; sun.color.setRGB(1, 0.82 + 0.18 * (1 - dusk), 0.62 + 0.38 * (1 - dusk)); sun.position.set(P.x + sdx * 140, Math.max(0.12, elev) * 160 + 8, P.z + sdz * 140); }
    else { sun.intensity = 0.35 * night; sun.color.copy(MOON); sun.position.set(P.x - sdx * 120, -elev * 150 + 30, P.z - 60); }
    const tx = Math.round(P.x / 1.5) * 1.5, tz = Math.round(P.z / 1.5) * 1.5;
    sun.position.x += tx - P.x; sun.position.z += tz - P.z; sun.target.position.set(tx, 0, tz);
    hemi.intensity = 0.2 + day * 0.55; hemi.color.setRGB(0.5 + 0.45 * day, 0.58 + 0.37 * day, 0.85 + 0.12 * day);
    const glow = THREE.MathUtils.smoothstep(night, 0.3, 0.8);
    litMat.color.copy(WIN_D).lerp(WIN_N, glow).multiplyScalar(1 + glow * 0.3);
    bulbMat.color.copy(BULB_D).lerp(BULB_N, night).multiplyScalar(1 + night * 1.8);
    starMat.opacity = THREE.MathUtils.smoothstep(night, 0.5, 1);
    headlight.intensity = night * 1.3; BK.lensM.emissiveIntensity = night * 3;
    vehicleLights.head.emissiveIntensity = 0.1 + night * 4; vehicleLights.tail.emissiveIntensity = 0.2 + night * 3;
    PM.gold.emissiveIntensity = night * 1.4; if (train && train.lights) train.lights.emissiveIntensity = 0.3 + night * 5;
    waterMat.uniforms.time.value = tsec; waterMat.uniforms.day.value = day; waterMat.uniforms.sunDir.value.copy(sky.material.uniforms.sunDir.value); waterMat.uniforms.sky.value.copy(tmp2);
    envT -= dt; if (envT <= 0) { envT = 0.5; for (const m of stdMats) m.envMapIntensity = m.userData.envBase * (0.12 + 0.88 * day); }
    if (fx) { fx.bloom.enabled = night > 0.15; fx.bloom.strength = night * 0.45; fx.bloom.threshold = 1.05; fx.bloom.radius = 0.35; }
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
      const vis = Math.abs(cx - P.x) < 170 && Math.abs(cz - P.z) < 170; a.g.visible = vis; if (!vis) { a.g.rotation.y = Math.atan2(ux, uz); continue; }
      let d = Math.atan2(ux, uz) - a.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); a.g.rotation.y += d * Math.min(1, dt * 8);
      if (a.mixer) a.mixer.update(dt * (a.cur / a.speed + 0.05));
      if (a.type === 'ped') {
        a.walk += a.cur * dt * 5.5;
        if (a.arms) { a.arms.forEach((ar, i) => { if (!ar.userData.fixed) ar.rotation.x = Math.sin(a.walk + i * Math.PI) * 0.45 * (a.cur / a.speed); }); a.feet.forEach((f, i) => { f.position.z = 0.02 + Math.sin(a.walk + i * Math.PI) * 0.12 * (a.cur / a.speed); }); a.g.position.y = Math.abs(Math.sin(a.walk)) * 0.03; }
      } else if (a.wheels) for (const w of a.wheels) w.rotation.x += a.cur * dt / 0.33;
      const dp = Math.hypot(qx, qz);
      if (dp < a.r + 0.6 && dp > 0.01) { P.x += qx / dp * (a.r + 0.6 - dp); P.z += qz / dp * (a.r + 0.6 - dp); P.v *= 0.7; }
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
        if (mission.stage === 'pickup') { mission.stage = 'deliver'; mission.t = 0; BK.pkg.visible = true; beamMat.color.copy(BEAM_B); beam.position.set(mission.B.x, 0, mission.B.z); SND.pick(); ev({ type: 'toast', text: `${mission.item} ရပြီ — ပို့ရန် သွားပါ` }); }
        else { const base = Math.round(mission.dist / 10) * 50 + 500, bonus = mission.t < mission.limit ? Math.round((mission.limit - mission.t) * 10 / 50) * 50 : 0; money += base + bonus; delivered++; SND.done(); ev({ type: 'toast', text: `ပို့ဆောင်ပြီး! +${my((base + bonus).toLocaleString())} ကျပ်${bonus ? ' (အချိန်ဆုကြေး ပါ)' : ''}` }); cancelMission(); }
      }
    }
    popT -= dt;
    if (popT <= 0) { popT = 0.3; let bp = null, bd = 28; for (const p of W.pois) { const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < bd) { bd = d; bp = p; } } popup = bp; }
    const cm = CAM[camMode], k = 1 - Math.exp(-dt * 3.5);
    want.set(P.x - Math.sin(P.h) * cm.d, cm.h, P.z - Math.cos(P.h) * cm.d);
    camPos.lerp(want, k); camera.position.copy(camPos);
    look.set(P.x + Math.sin(P.h) * 3, 1.2, P.z + Math.cos(P.h) * 3); camera.lookAt(look);
    if (fx) fx.render(dt); else renderer.render(scene, camera);
    mmT -= dt; if (mmT <= 0) { mmT = 0.12; drawMinimap(); }
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.2;
      let m = null;
      if (mission) { const T = mission.stage === 'pickup' ? mission.A : mission.B; m = { stage: mission.stage, item: mission.item, label: T.label, dist: Math.round(Math.hypot(T.x - P.x, T.z - P.z)), left: mission.stage === 'deliver' ? Math.max(0, Math.round(mission.limit - mission.t)) : null }; }
      hud({ loading: false, ready: true, offline: W.offline, sat: !!sat, hour, money, delivered, flowers: flowersGot, flowersTotal: flowers.length, speed: Math.round(Math.abs(P.v) * 3.6), mission: m, popup: popup ? { name: popup.name, en: popup.en, kind: popup.kind } : null, stats: { b: W.buildings.length, r: W.roads.length, p: W.pois.length, models: Object.keys(assets).length } });
    }
  };
  raf = requestAnimationFrame(frame);

  const api = {
    start() { ac(); playing = true; },
    bell() { SND.bell(); for (const a of agents) if (a.type === 'ped' && Math.hypot(a.g.position.x - P.x, a.g.position.z - P.z) < 12) a.lane = Math.sign(a.lane || 1) * 4.3; },
    cycleCamera() { camMode = (camMode + 1) % CAM.length; if (fx) fx.setBlur(CAM[camMode].blur); },
    toggleMission() { if (mission) { cancelMission(); ev({ type: 'toast', text: 'အလုပ် ပယ်ဖျက်ပြီး' }); } else startMission(); },
    setDayMinutes(m) { dayMin = Math.max(1, m || 8); },
    setTraffic,
    setHour(h) { hour = h; },
    pause(v) { frozen = !!v; },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); renderer.dispose(); renderer.domElement.remove(); },
  };
  return api;
}
