import { Grid, centroid, segDist } from './osm.js';

// Compounds (ခြံ): OSM maps house footprints but almost never the plot around them, so each
// building's yard is derived from the real data instead: the space closer to its own footprint than
// to any neighbour's (a footprint-aware Voronoi cell), cut back from roads and rails, and capped at
// YARD metres from the house. Every cut is a half-plane, so a plot is a convex polygon whose edges
// remember what made them: 'b' open land, 'r' street, 'x' railway, or a neighbour's index.

const YARD = 7, NEIGH_R = 40, ROAD_GAP = 0.6, MIN_EDGE = 0.4;

// Keep the part of poly where nx*x + nz*z <= off. Edge k runs p[k] -> p[k+1] and carries label l[k];
// edges created by this cut get `label`.
function clip(poly, nx, nz, off, label) {
  const p = [], l = [], n = poly.p.length;
  for (let i = 0; i < n; i++) {
    const a = poly.p[i], b = poly.p[(i + 1) % n], la = poly.l[i];
    const da = nx * a[0] + nz * a[1] - off, db = nx * b[0] + nz * b[1] - off;
    if (da <= 0) { p.push(a); l.push(la); }
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      p.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); l.push(da <= 0 ? label : la);
    }
  }
  return { p, l };
}

// Footprint extent along unit direction (ux, uz) from point c.
const extent = (pts, c, ux, uz) => { let m = -1e9; for (const q of pts) m = Math.max(m, (q[0] - c[0]) * ux + (q[1] - c[1]) * uz); return m; };

// buildings: [{ pts }]. lines: [[ax, az, bx, bz, width, label]] for roads and rails.
// Returns one { p, l } (or null) per building, in the same order.
export function makePlots(buildings, lines) {
  const C = buildings.map(b => centroid(b.pts));
  const cg = new Grid(25), lg = new Grid(25);
  C.forEach((c, i) => cg.add(i, c[0], c[1], c[0], c[1]));
  for (const s of lines) { const r = s[4] / 2 + YARD; lg.add(s, Math.min(s[0], s[2]) - r, Math.min(s[1], s[3]) - r, Math.max(s[0], s[2]) + r, Math.max(s[1], s[3]) + r); }
  const near = (g, x, z, r) => { const out = new Set(); for (let i = -Math.ceil(r / 25); i <= Math.ceil(r / 25); i++) for (let j = -Math.ceil(r / 25); j <= Math.ceil(r / 25); j++) for (const it of g.q(x + i * 25, z + j * 25)) out.add(it); return out; };

  return buildings.map((b, i) => {
    const pts = b.pts, c = C[i];
    // start from the footprint's own box (aligned to its longest edge), grown by the yard depth
    let ux = 1, uz = 0, best = 0;
    for (let k = 0; k < pts.length; k++) { const a = pts[k], e = pts[(k + 1) % pts.length], L = Math.hypot(e[0] - a[0], e[1] - a[1]); if (L > best) { best = L; ux = (e[0] - a[0]) / L; uz = (e[1] - a[1]) / L; } }
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const q of pts) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    u0 -= YARD; u1 += YARD; v0 -= YARD; v1 += YARD;
    const P = (u, v) => [u * ux - v * uz, u * uz + v * ux];
    let poly = { p: [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], l: ['b', 'b', 'b', 'b'] };

    // neighbours: split the gap between the two footprints evenly, never cutting into either house
    for (const j of near(cg, c[0], c[1], NEIGH_R)) {
      if (j === i) continue;
      const cj = C[j], dx = cj[0] - c[0], dz = cj[1] - c[1], d = Math.hypot(dx, dz);
      if (d < 0.01 || d > NEIGH_R) continue;
      const nx = dx / d, nz = dz / d, ei = extent(pts, c, nx, nz), ej = extent(buildings[j].pts, cj, -nx, -nz);
      const off = ei + Math.max(0, d - ei - ej) / 2;
      poly = clip(poly, nx, nz, nx * c[0] + nz * c[1] + off, j);
      if (poly.p.length < 3) return null;
    }
    // streets and rails: the fence runs ROAD_GAP clear of the carriageway edge
    for (const s of near(lg, c[0], c[1], YARD + 20)) {
      const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((c[0] - s[0]) * dx + (c[1] - s[1]) * dz) / l2));
      const px = s[0] + dx * t, pz = s[1] + dz * t, dd = Math.hypot(c[0] - px, c[1] - pz);
      if (dd < 0.01 || segDist(c[0], c[1], s[0], s[1], s[2], s[3]) > YARD + s[4] / 2 + 30) continue;
      const nx = (c[0] - px) / dd, nz = (c[1] - pz) / dd;   // from the road towards the house
      let keep = s[4] / 2 + ROAD_GAP;
      const own = -extent(pts, [px, pz], -nx, -nz);          // closest footprint point to the road
      if (own <= 0.2) continue;                               // footprint already on the road (OSM noise)
      keep = Math.min(keep, own - 0.2);
      poly = clip(poly, -nx, -nz, -(nx * px + nz * pz + keep), s[5]);
      if (poly.p.length < 3) return null;
    }
    // drop sliver edges left by near-parallel cuts
    const p = [], l = [];
    for (let k = 0; k < poly.p.length; k++) {
      const a = poly.p[k], e = poly.p[(k + 1) % poly.p.length];
      if (Math.hypot(e[0] - a[0], e[1] - a[1]) < MIN_EDGE && poly.p.length - (k - p.length) > 3) continue;
      p.push(a); l.push(poly.l[k]);
    }
    return p.length >= 3 ? { p, l } : null;
  });
}
