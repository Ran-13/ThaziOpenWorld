import * as THREE from './three.js';

export const BB = { s: 20.841, w: 96.041, n: 20.865, e: 96.069 };
export const LAT0 = (BB.s + BB.n) / 2, LON0 = (BB.w + BB.e) / 2;
export const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110540;
export const px = lon => (lon - LON0) * KX, pz = lat => -(lat - LAT0) * KZ;
export const HW = (BB.e - BB.w) / 2 * KX, HH = (BB.n - BB.s) / 2 * KZ;
export const BX = HW + 12, BZ = HH + 12, MR = Math.max(BX, BZ);
export const UP = [0, 1, 0];
export const MYD = '၀၁၂၃၄၅၆၇၈၉';
export const my = s => String(s).replace(/[0-9]/g, d => MYD[d]);
let seed = 4242;
export const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
export const pick = a => a[Math.floor(rnd() * a.length)];
export const mpick = a => a[Math.floor(Math.random() * a.length)];
export const col = h => new THREE.Color(h);

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const CACHE_KEY = 'thazi-osm-cache-v1';

export const RW = { motorway: 12, trunk: 11, primary: 10, secondary: 8, tertiary: 7, unclassified: 5.5, residential: 5.5, living_street: 4.5, service: 4, track: 3.5, road: 5, footway: 1.6, path: 1.6, pedestrian: 3, cycleway: 2, steps: 1.6, bridleway: 2 };
export const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
export const DRIVE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'road']);
export const WALLS = ['#f4e4c8', '#f2c9b8', '#cfe3d4', '#c9dbe9', '#f6dfa0', '#e8d2e6', '#fbf6ec', '#e9c9a3', '#d7e7c0'];
export const ROOFS = ['#c4573a', '#8aa0b4', '#b84a3c', '#6f8fa6', '#d98a4b', '#9aa5ad', '#a8553f'];
export const CAR_COLS = ['#e94f37', '#3b8ea5', '#f5b700', '#ffffff', '#5c6b73', '#2e86ab', '#7bb661', '#f18f01'];
export const ITEMS = ['မုန့်ဟင်းခါး', 'လက်ဖက်ရည်', 'ထန်းလျက်', 'ပဲပြုတ်', 'စာအိတ်', 'ဆေးဘူး', 'ထမင်းချိုင့်', 'ပန်းခြင်း'];
export const PAGODA_RE = /ဘုရား|စေတီ|pagoda|paya|zedi|stupa/i;

export function baseType(h) { return (h || '').replace('_link', ''); }

export function kindOf(t) {
  if (t.railway === 'station' || t.public_transport === 'station') return 'ဘူတာရုံ';
  const r = t.religion;
  const M = { place_of_worship: r === 'buddhist' ? 'ဘုရား / ဘုန်းကြီးကျောင်း' : r === 'muslim' ? 'ဗလီ' : r === 'christian' ? 'ခရစ်ယာန် ဘုရားကျောင်း' : r === 'hindu' ? 'ဟိန္ဒူ ဘုရားကျောင်း' : 'ဘာသာရေး အဆောက်အအုံ', monastery: 'ဘုန်းကြီးကျောင်း', school: 'စာသင်ကျောင်း', college: 'ကောလိပ်', university: 'တက္ကသိုလ်', hospital: 'ဆေးရုံ', clinic: 'ဆေးခန်း', doctors: 'ဆေးခန်း', pharmacy: 'ဆေးဆိုင်', marketplace: 'ဈေး', bank: 'ဘဏ်', restaurant: 'စားသောက်ဆိုင်', cafe: 'လက်ဖက်ရည်ဆိုင်', fuel: 'ဓာတ်ဆီဆိုင်', police: 'ရဲစခန်း', post_office: 'စာတိုက်', townhall: 'မြို့နယ်ရုံး', fire_station: 'မီးသတ်စခန်း', library: 'စာကြည့်တိုက်', bus_station: 'ကားဂိတ်', kindergarten: 'မူကြိုကျောင်း' };
  if (t.amenity && M[t.amenity]) return M[t.amenity];
  if (t.shop) return 'ဆိုင်';
  if (t.tourism) return 'ခရီးသွား နေရာ';
  if (t.office || t.government) return 'ရုံး';
  if (t.leisure) return 'အပန်းဖြေ နေရာ';
  if (t.place) return 'ရပ်ကွက် / ရွာ';
  return 'နေရာ';
}
export const isImportant = t => t.railway === 'station' || ['place_of_worship', 'monastery', 'marketplace', 'school', 'hospital', 'townhall'].includes(t.amenity);

export function normalize(j) {
  return { elements: j.elements.map(e => {
    if (e.type === 'node') return { type: 'node', lat: +e.lat.toFixed(6), lon: +e.lon.toFixed(6), tags: e.tags || {} };
    if (e.type === 'way' && e.geometry) return { type: 'way', nodes: e.nodes, tags: e.tags || {}, pts: e.geometry.flatMap(g => g ? [+g.lat.toFixed(6), +g.lon.toFixed(6)] : [NaN, NaN]) };
    return null;
  }).filter(Boolean) };
}

export async function fetchOSM(msg) {
  try { const c = localStorage.getItem(CACHE_KEY); if (c) return JSON.parse(c); } catch (e) {}
  const bb = `${BB.s},${BB.w},${BB.n},${BB.e}`;
  const q = `[out:json][timeout:90];(way["building"](${bb});way["highway"](${bb});way["railway"](${bb});way["waterway"](${bb});way["natural"](${bb});way["landuse"](${bb});way["leisure"](${bb});way["amenity"](${bb});node["name"](${bb});node["railway"="station"](${bb}););out geom;`;
  for (let i = 0; i < ENDPOINTS.length; i++) {
    try {
      msg(`OpenStreetMap မှ သာစည်မြေပုံ ရယူနေသည်… (${my(i + 1)}/${my(ENDPOINTS.length)})`);
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
      const r = await fetch(ENDPOINTS[i], { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) continue;
      const j = await r.json();
      if (!j.elements || !j.elements.length) continue;
      const n = normalize(j);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(n)); } catch (e) {}
      return n;
    } catch (e) {}
  }
  return null;
}

export function fallbackData() {
  const els = []; let id = 1; const lat = z => LAT0 - z / KZ, lon = x => LON0 + x / KX;
  const way = (pts, tags) => { const nodes = pts.map(p => p.id); els.push({ type: 'way', tags, nodes, pts: pts.flatMap(p => [lat(p.z), lon(p.x)]) }); };
  const grid = {}; const G = 110;
  for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) grid[i + ',' + j] = { id: id++, x: i * G + (Math.sin(i * 3 + j) * 12), z: j * G + Math.cos(i + j * 2) * 12 };
  for (let j = -7; j <= 7; j++) { const row = []; for (let i = -7; i <= 7; i++) row.push(grid[i + ',' + j]); way(row, { highway: j === 0 ? 'primary' : 'residential' }); }
  for (let i = -7; i <= 7; i++) { const c = []; for (let j = -7; j <= 7; j++) c.push(grid[i + ',' + j]); way(c, { highway: i === 0 ? 'secondary' : i % 2 ? 'track' : 'residential' }); }
  const rail = []; for (let z = -1300; z <= 1300; z += 50) rail.push({ id: id++, x: 260, z });
  way(rail, { railway: 'rail' });
  els.push({ type: 'node', lat: lat(0), lon: lon(275), tags: { railway: 'station', name: 'သာစည်ဘူတာ' } });
  return { elements: els, offline: true };
}

export function pip(x, z, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) ins = !ins;
  }
  return ins;
}
export function area(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(a / 2); }
export function centroid(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }
export function segDist(x, z, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; let t = l2 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - ax - t * dx, z - az - t * dz); }
export function clipSeg(ax, az, bx, bz) {
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz], q = [ax + BX, BX - ax, az + BZ, BZ - az];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [ax + t0 * dx, az + t0 * dz, ax + t1 * dx, az + t1 * dz];
}
export const clampPts = pts => pts.map(p => [Math.max(-BX, Math.min(BX, p[0])), Math.max(-BZ, Math.min(BZ, p[1]))]);

export class Grid {
  constructor(c) { this.c = c; this.m = new Map(); }
  k(i, j) { return (i + 500) * 1000 + (j + 500); }
  add(it, x0, z0, x1, z1) { const c = this.c; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) { const k = this.k(i, j); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(it); } }
  q(x, z) { return this.m.get(this.k(Math.floor(x / this.c), Math.floor(z / this.c))) || []; }
}

export class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.us = 4; }
  tri(a, b, c, cl, ref, ua, ub, uc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (!ua) { const s = this.us; ua = [a[0] / s, a[2] / s]; ub = [b[0] / s, b[2] / s]; uc = [c[0] / s, c[2] / s]; }
    if (nx * ref[0] + ny * ref[1] + nz * ref[2] < 0) { let t = b; b = c; c = t; t = ub; ub = uc; uc = t; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    for (let i = 0; i < 3; i++) { this.n.push(nx, ny, nz); this.c.push(cl.r, cl.g, cl.b); }
  }
  quad(a, b, c, d, cl, ref, ua, ub, uc, ud) { this.tri(a, b, c, cl, ref, ua, ub, uc); this.tri(a, c, d, cl, ref, ua, uc, ud); }
  seg(ax, az, bx, bz, w, y, cl) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < 0.01) return;
    const nx = -dz / l * w / 2, nz = dx / l * w / 2;
    this.quad([ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz], cl, UP);
  }
  segUV(ax, az, bx, bz, w, y, cl, v0, v1) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < 0.01) return;
    const nx = -dz / l * w / 2, nz = dx / l * w / 2;
    this.quad([ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz], cl, UP, [0, v0], [0, v1], [1, v1], [1, v0]);
  }
  disc(x, z, r, y, cl, n = 10) { for (let i = 0; i < n; i++) { const a1 = i / n * 6.2832, a2 = (i + 1) / n * 6.2832; this.tri([x, y, z], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a2) * r, y, z + Math.sin(a2) * r], cl, UP); } }
  poly(pts, y, cl, down) {
    if (pts.length < 3) return;
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []); } catch (e) { return; }
    const ref = down ? [0, -1, 0] : UP;
    for (const t of tris) this.tri([pts[t[0]][0], y, pts[t[0]][1]], [pts[t[1]][0], y, pts[t[1]][1]], [pts[t[2]][0], y, pts[t[2]][1]], cl, ref);
  }
  get empty() { return this.p.length === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere();
    return g;
  }
  mesh(mat) { return new THREE.Mesh(this.geometry(), mat); }
}

export function parse(data) {
  const W = { buildings: [], roads: [], rails: [], waters: [], waterLines: [], greens: [], pois: [], pagodas: [], offline: !!data.offline };
  for (const el of data.elements) {
    const t = el.tags || {};
    const name = t['name:my'] || t.name;
    if (el.type === 'node') {
      const x = px(el.lon), z = pz(el.lat);
      if (Math.abs(x) > HW || Math.abs(z) > HH) continue;
      if (name) W.pois.push({ x, z, tags: t, name, en: t['name:en'] && t['name:en'] !== name ? t['name:en'] : (t.name && t.name !== name ? t.name : ''), kind: kindOf(t), important: isImportant(t) });
      if (t.amenity === 'place_of_worship' && (t.religion === 'buddhist' || PAGODA_RE.test(name || ''))) W.pagodas.push({ x, z, r: 4 });
      continue;
    }
    const pts = [];
    for (let i = 0; i < el.pts.length; i += 2) pts.push([px(el.pts[i + 1]), pz(el.pts[i])]);
    if (pts.some(p => isNaN(p[0]))) continue;
    const closed = el.nodes && el.nodes.length > 3 && el.nodes[0] === el.nodes[el.nodes.length - 1];
    const ring = closed ? pts.slice(0, -1) : pts;
    if (closed && name && (t.amenity || t.shop || t.tourism || t.railway || t.leisure || t.office || t.building)) {
      const [cx, cz] = centroid(ring);
      if (Math.abs(cx) < HW && Math.abs(cz) < HH) W.pois.push({ x: cx, z: cz, tags: t, name, en: t['name:en'] && t['name:en'] !== name ? t['name:en'] : (t.name && t.name !== name ? t.name : ''), kind: kindOf(t), important: isImportant(t) });
    }
    if (t.building) {
      if (!closed) continue;
      const [cx, cz] = centroid(ring);
      if (Math.abs(cx) > BX - 2 || Math.abs(cz) > BZ - 2) continue;
      const isPagoda = ['temple', 'pagoda', 'stupa', 'shrine'].includes(t.building) && (t.religion === 'buddhist' || PAGODA_RE.test(name || '') || t.building === 'stupa' || t.building === 'pagoda');
      if (isPagoda) { W.pagodas.push({ x: cx, z: cz, r: Math.max(3, Math.min(12, Math.sqrt(area(ring)) / 2)) }); continue; }
      W.buildings.push({ pts: ring, tags: t });
      continue;
    }
    if (t.highway) { const bt = baseType(t.highway); if (RW[bt]) { const tw = parseFloat(t.width), ln = parseInt(t.lanes); W.roads.push({ pts, nodes: el.nodes, tags: t, type: bt, w: Math.max(1.4, Math.min(16, tw > 0 ? tw : ln > 0 && RW[bt] > 4 ? ln * 3.2 : RW[bt])), name }); } continue; }
    if (['rail', 'siding', 'narrow_gauge', 'light_rail'].includes(t.railway)) { W.rails.push({ pts }); continue; }
    if (t.waterway && !closed) { W.waterLines.push({ pts, w: t.waterway === 'river' ? 14 : t.waterway === 'canal' ? 7 : 3 }); continue; }
    if (!closed) continue;
    if (t.natural === 'water' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.water) { W.waters.push(clampPts(ring)); continue; }
    const g = greenOf(t);
    if (g) W.greens.push({ pts: clampPts(ring), color: g.c, y: g.y, trees: g.trees, palm: g.palm });
  }
  return W;
}

export function greenOf(t) {
  const lu = t.landuse, le = t.leisure, na = t.natural;
  if (lu === 'farmland' || lu === 'paddy' || lu === 'farmyard') return { c: '#d6dc8a', y: 0.02, trees: 0.15, palm: 0.85 };
  if (lu === 'orchard' || lu === 'plantation') return { c: '#a9cd7f', y: 0.02, trees: 1.4, palm: 0.4 };
  if (lu === 'forest' || na === 'wood') return { c: '#8fbf72', y: 0.02, trees: 2.2, palm: 0.15 };
  if (na === 'scrub' || na === 'heath') return { c: '#c3c98a', y: 0.02, trees: 0.5, palm: 0.5 };
  if (lu === 'grass' || lu === 'meadow' || lu === 'village_green' || le === 'park' || le === 'garden' || le === 'pitch' || le === 'playground') return { c: '#acd38f', y: 0.025, trees: 0.7, palm: 0.3 };
  if (lu === 'cemetery') return { c: '#bccba2', y: 0.02, trees: 0.6, palm: 0.2 };
  if (lu === 'residential') return { c: '#c9d39a', y: 0.01, trees: 0.25, palm: 0.35 };
  if (lu === 'religious' || t.amenity === 'place_of_worship' || t.amenity === 'monastery') return { c: '#f1e3c2', y: 0.015, trees: 0.4, palm: 0.3 };
  if (lu === 'industrial' || lu === 'railway') return { c: '#d8cfc2', y: 0.012, trees: 0, palm: 0 };
  if (lu === 'commercial' || lu === 'retail') return { c: '#e6d6b0', y: 0.012, trees: 0.05, palm: 0.2 };
  if (t.amenity === 'school' || t.amenity === 'hospital') return { c: '#e6dcc0', y: 0.015, trees: 0.3, palm: 0.3 };
  return null;
}

