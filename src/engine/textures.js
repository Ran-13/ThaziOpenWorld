import * as THREE from './three.js';

function cv(w, h, fn, srgb = true, wrap = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); fn(x, w, h);
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}
function grain(x, w, h, a, b) {
  const d = x.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) { const n = a + Math.random() * (b - a); d.data[i] *= n; d.data[i + 1] *= n; d.data[i + 2] *= n; }
  x.putImageData(d, 0, 0);
}

export function makeTextures() {
  const T = {};
  T.ground = cv(512, 512, (x, w, h) => {
    x.fillStyle = '#e8d9b8'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2800; i++) {
      const g = Math.random() < 0.35;
      x.fillStyle = g
        ? `rgba(${70 + Math.random() * 50},${110 + Math.random() * 50},${40 + Math.random() * 30},${0.04 + Math.random() * 0.08})`
        : `rgba(${120 + Math.random() * 50},${95 + Math.random() * 40},${55 + Math.random() * 25},${Math.random() * 0.08})`;
      x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 0.8 + Math.random() * (g ? 3 : 8), 0, 6.3); x.fill();
    }
    grain(x, w, h, 0.88, 1.02);
  });
  const drawBamboo = (x, w, h) => {
    const c = 32;
    for (let i = 0; i < w / c; i++) for (let j = 0; j < h / c; j++) {
      const hor = (i + j) % 2 === 0;
      for (let k = 0; k < 4; k++) {
        const l = 198 + Math.random() * 42; x.fillStyle = `rgb(${l},${l * 0.84},${l * 0.52})`;
        if (hor) x.fillRect(i * c, j * c + k * 8, c, 7); else x.fillRect(i * c + k * 8, j * c, 7, c);
        // Thin highlight edge so weave reads at glancing angles.
        x.fillStyle = 'rgba(255,245,210,.18)';
        if (hor) x.fillRect(i * c, j * c + k * 8, c, 1); else x.fillRect(i * c + k * 8, j * c, 1, c);
      }
      x.fillStyle = 'rgba(70,45,18,.32)'; x.fillRect(i * c, j * c, c, 1); x.fillRect(i * c, j * c, 1, c);
    }
    grain(x, w, h, 0.84, 1.02);
  };
  const drawWood = (x, w, h) => {
    for (let j = 0; j < 8; j++) {
      const l = 150 + Math.random() * 50; x.fillStyle = `rgb(${l},${l * 0.7},${l * 0.45})`; x.fillRect(0, j * 32, w, 31);
      x.fillStyle = 'rgba(40,22,10,.6)'; x.fillRect(0, j * 32 + 31, w, 1);
      for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(75,45,20,${Math.random() * 0.16})`; x.fillRect(0, j * 32 + Math.random() * 30, w * (0.2 + Math.random() * 0.8), 1); }
      // Occasional knot
      if (Math.random() < 0.35) {
        const kx = 20 + Math.random() * (w - 40), ky = j * 32 + 8 + Math.random() * 14, kr = 3 + Math.random() * 5;
        const g = x.createRadialGradient(kx, ky, 0, kx, ky, kr);
        g.addColorStop(0, 'rgba(90,50,25,.55)'); g.addColorStop(1, 'rgba(90,50,25,0)');
        x.fillStyle = g; x.beginPath(); x.arc(kx, ky, kr, 0, 6.3); x.fill();
      }
    }
    grain(x, w, h, 0.88, 1.02);
  };
  const drawTin = (x, w, h) => {
    for (let i = 0; i < w; i++) {
      const wave = Math.sin(i / w * Math.PI * 2 * 5);
      const v = 0.62 + 0.28 * wave + 0.1 * Math.sin(i / w * Math.PI * 2 * 20);
      const l = Math.round(235 * v); x.fillStyle = `rgb(${l},${Math.round(l * 0.98)},${Math.round(l * 0.94)})`; x.fillRect(i, 0, 1, h);
    }
    // Ridge highlights
    for (let r = 0; r < 5; r++) {
      const rx = ((r + 0.5) / 5) * w;
      x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(rx - 1, 0, 2, h);
      x.fillStyle = 'rgba(40,40,50,.18)'; x.fillRect(rx + 3, 0, 2, h);
    }
    for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(130,70,35,${Math.random() * 0.2})`; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 1.5 + Math.random() * 7, 0, 6.3); x.fill(); }
  };
  T.tin = cv(128, 128, drawTin);
  const drawPlaster = (x, w, h) => {
    x.fillStyle = '#f7f1e6'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 48);
      const px = Math.random() * w, py = Math.random() * h;
      g.addColorStop(0, `rgba(${140 + Math.random() * 40},${120 + Math.random() * 30},${90 + Math.random() * 20},${0.06 + Math.random() * 0.08})`);
      g.addColorStop(1, 'rgba(150,130,100,0)');
      x.save(); x.translate(px, py); x.fillStyle = g; x.fillRect(-48, -48, 96, 96); x.restore();
    }
    // Fine hairline cracks
    x.strokeStyle = 'rgba(90,70,50,.08)'; x.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      let px = Math.random() * w, py = Math.random() * h; x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 6; j++) { px += (Math.random() - 0.5) * 28; py += 8 + Math.random() * 18; x.lineTo(px, py); }
      x.stroke();
    }
    grain(x, w, h, 0.92, 1.02);
  };
  T.bamboo = cv(256, 256, drawBamboo);
  T.wood = cv(256, 256, drawWood);
  T.plaster = cv(256, 256, drawPlaster);
  // One 2x2 atlas so all walls share a single material: three families of chunk meshes
  // collapse into one. Each cell is painted on its own canvas because grain() reads
  // getImageData from the origin and ignores canvas transforms.
  T.wallAtlas = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    [drawBamboo, drawWood, drawPlaster, drawPlaster].forEach((fn, i) => {
      const sub = document.createElement('canvas'); sub.width = sub.height = 256;
      fn(sub.getContext('2d'), 256, 256);
      // CanvasTexture uploads with flipY, so UV row 0 is the BOTTOM canvas row: lay the
      // cells out bottom-up or tile 0 would sample the wrong quadrant.
      x.drawImage(sub, (i % 2) * 256, 256 - Math.floor(i / 2) * 256);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;   // the shader does the tiling with fract()
    t.anisotropy = 16;
    return t;
  })();
  const drawConcrete = (x, w, h) => { x.fillStyle = '#e6e1d8'; x.fillRect(0, 0, w, h); grain(x, w, h, 0.85, 1); x.strokeStyle = 'rgba(0,0,0,.08)'; x.strokeRect(0.5, 0.5, w - 1, h - 1); };
  T.concrete = cv(128, 128, drawConcrete);
  // Roof atlas, same trick as the walls. Both generators are parametric, so painting them at
  // cell size keeps their world scale and gains resolution rather than upscaling a small tile.
  // cell 0 = corrugated tin, 1 = concrete, 2 = plain (roof soffits and stilt floors).
  const atlas2 = (cells) => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    cells.forEach((fn, i) => {
      const sub = document.createElement('canvas'); sub.width = sub.height = 256;
      fn(sub.getContext('2d'), 256, 256);
      x.drawImage(sub, (i % 2) * 256, 256 - Math.floor(i / 2) * 256);   // flipY, see wallAtlas
    });
    return c;
  };
  const plain = (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); };
  T.roofAtlas = (() => {
    const t = new THREE.CanvasTexture(atlas2([drawTin, drawConcrete, plain, plain]));
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 16; return t;
  })();
  // Per-cell surface response so one material can still give tin its sheen:
  // three.js reads roughness from G and metalness from B.
  T.roofORM = (() => {
    const fill = (rough, metal) => (x, w, h) => { x.fillStyle = `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`; x.fillRect(0, 0, w, h); };
    const t = new THREE.CanvasTexture(atlas2([fill(0.4, 0.6), fill(0.95, 0), fill(0.9, 0), fill(0.9, 0)]));
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;   // linear data, no colorSpace
  })();
  T.longyi = (a, b) => cv(64, 64, (x, w, h) => {
    x.fillStyle = a; x.fillRect(0, 0, w, h);
    x.fillStyle = b; x.globalAlpha = 0.55; for (let i = 0; i < 4; i++) { x.fillRect(i * 16, 0, 6, h); x.fillRect(0, i * 16, w, 6); }
    x.globalAlpha = 0.3; x.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { x.fillRect(i * 16 + 10, 0, 1, h); x.fillRect(0, i * 16 + 10, w, 1); }
  });
  T.coach = cv(512, 128, (x, w, h) => {
    x.fillStyle = '#efe3c8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#7a2430'; x.fillRect(0, 78, w, 50); x.fillRect(0, 0, w, 12);
    x.fillStyle = '#f2b233'; x.fillRect(0, 74, w, 4);
    for (let i = 0; i < 10; i++) { const xx = 46 + i * 43; x.fillStyle = '#2d3a48'; x.fillRect(xx, 26, 30, 34); x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(xx + 2, 28, 8, 30); }
    x.fillStyle = '#5a1a24'; x.fillRect(8, 22, 26, 96); x.fillRect(w - 34, 22, 26, 96);
  });
  T.loco = cv(512, 128, (x, w, h) => {
    x.fillStyle = '#23408e'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f2b233'; x.fillRect(0, 70, w, 12);
    x.fillStyle = '#e8e1d2'; x.fillRect(0, 0, w, 10);
    x.fillStyle = '#1b2430'; x.fillRect(14, 18, 54, 36); x.fillRect(w - 68, 18, 54, 36);
    for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(120 + i * 34, 22, 22, 40); }
  });
  T.locoEnd = cv(128, 128, (x, w, h) => {
    x.fillStyle = '#23408e'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2b233'; x.fillRect(0, 70, w, 12);
    x.fillStyle = '#1b2430'; x.fillRect(14, 16, 44, 36); x.fillRect(70, 16, 44, 36);
  });
  T.coachEnd = cv(128, 128, (x, w, h) => { x.fillStyle = '#7a2430'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a141a'; x.fillRect(44, 20, 40, 108); });
  T.sign = cv(512, 160, (x, w, h) => {
    x.fillStyle = '#fbf6ec'; x.fillRect(0, 0, w, h); x.strokeStyle = '#23408e'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10);
    x.fillStyle = '#2b2a33'; x.textAlign = 'center'; x.font = "700 78px Padauk, 'Noto Sans Myanmar', sans-serif"; x.fillText('သာစည်', w / 2, 92);
    x.font = "700 30px system-ui, sans-serif"; x.fillText('THAZI', w / 2, 138);
  }, true, false);
  T.dot = cv(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false, false);
  T.windowLit = cv(64, 80, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h * 0.55, 4, w / 2, h * 0.55, w * 0.75);
    g.addColorStop(0, '#fff2d6'); g.addColorStop(0.6, '#e9b877'); g.addColorStop(1, '#9a6a3c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(120,40,30,.55)'; x.fillRect(0, 0, 12, h); x.fillRect(w - 12, 0, 12, h);
    x.fillStyle = 'rgba(70,30,20,.35)'; x.fillRect(0, 0, w, 8);
    x.fillStyle = 'rgba(60,40,30,.35)'; x.beginPath(); x.arc(w * 0.62, h * 0.95, 14, Math.PI, 0); x.fill();
    x.fillStyle = 'rgba(30,22,18,.85)'; for (let i = 1; i < 5; i++) x.fillRect(i * w / 5 - 1, 0, 2, h);
    x.fillRect(0, h * 0.5 - 1, w, 2);
    x.strokeStyle = '#3a2a20'; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4);
  }, true, false);
  const roadTex = (fn) => { const tx = cv(384, 1024, fn); tx.wrapS = THREE.ClampToEdgeWrapping; return tx; };
  const asphaltBase = (x, w, h, tone = 74) => {
    x.fillStyle = `rgb(${tone},${tone + 2},${tone + 6})`; x.fillRect(0, 0, w, h);
    const d = x.getImageData(0, 0, w, h);
    for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * 30 + (Math.random() < 0.035 ? 38 : 0) - (Math.random() < 0.03 ? 25 : 0); d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
    x.putImageData(d, 0, 0);
    for (let k = 0; k < 3; k++) { const pw = 90 + Math.random() * 150, ph = 140 + Math.random() * 260, px = Math.random() * (w - pw), py = Math.random() * (h - ph); x.fillStyle = `rgba(30,30,34,${0.022 + Math.random() * 0.026})`; x.beginPath(); x.roundRect ? x.roundRect(px, py, pw, ph, 60) : x.rect(px, py, pw, ph); x.fill(); }
    for (let k = 0; k < 14; k++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 40); g.addColorStop(0, `rgba(${Math.random() < 0.5 ? '20,20,22' : '150,150,150'},0.07)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(Math.random() * w, Math.random() * h); x.scale(1, 2.5); x.fillStyle = g; x.fillRect(-40, -40, 80, 80); x.restore(); }
    x.strokeStyle = 'rgba(20,20,23,.3)'; x.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      let px = Math.random() * w, py = Math.random() * h;
      const drift = (Math.random() - 0.5) * 7;
      x.lineWidth = 0.6 + Math.random() * 0.6; x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 16; j++) { px += drift + (Math.random() - 0.5) * 4.5; py += h / 22; x.lineTo(px, py); }
      x.stroke();
    }
  };
  const wear = (x, w, h, bands) => { for (const [a, b] of bands) { const g = x.createLinearGradient(a * w, 0, b * w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(a * w, 0, (b - a) * w, h); } };
  const dustEdges = (x, w, h, amt) => {
    for (const [x0, x1] of [[0, w * amt], [w, w * (1 - amt)]]) { const g = x.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(196,173,132,0.95)'); g.addColorStop(1, 'rgba(196,173,132,0)'); x.fillStyle = g; x.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), h); }
    for (let k = 0; k < 900; k++) { const side = Math.random() < 0.5, r = 0.6 + Math.random() * 2.4; x.fillStyle = `rgba(190,166,124,${0.25 + Math.random() * 0.5})`; x.beginPath(); x.arc(side ? Math.random() * w * amt * 1.2 : w - Math.random() * w * amt * 1.2, Math.random() * h, r, 0, 6.3); x.fill(); }
  };
  const paint = (x, px, py, pw, ph) => { x.fillStyle = 'rgba(238,236,226,0.92)'; x.fillRect(px, py, pw, ph); x.globalCompositeOperation = 'destination-out'; for (let k = 0; k < ph / 3; k++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`; x.fillRect(px, py + Math.random() * ph, pw, 1 + Math.random() * 2); } x.globalCompositeOperation = 'source-over'; };
  T.asphaltMajor = roadTex((x, w, h) => {
    asphaltBase(x, w, h, 74); wear(x, w, h, [[0.18, 0.32], [0.38, 0.46], [0.54, 0.62], [0.68, 0.82]]);
    const lay = x.getImageData(0, 0, w, h); void lay;
    dustEdges(x, w, h, 0.05);
    const S = w / 256;
    paint(x, 15 * S, 0, 4 * S, h); paint(x, w - 19 * S, 0, 4 * S, h); paint(x, w / 2 - 2 * S, 0, 4 * S, h * 0.1875); paint(x, w / 2 - 2 * S, h * 0.5, 4 * S, h * 0.1875);
  });
  T.asphaltPlain = roadTex((x, w, h) => {
    asphaltBase(x, w, h, 78); wear(x, w, h, [[0.2, 0.36], [0.64, 0.8]]);
    x.fillStyle = 'rgba(20,18,16,0.12)'; x.fillRect(w * 0.47, 0, w * 0.06, h);
    dustEdges(x, w, h, 0.13);
  });
  T.dirtRoad = roadTex((x, w, h) => {
    x.fillStyle = '#b8966a'; x.fillRect(0, 0, w, h); grain(x, w, h, 0.85, 1.05);
    for (const c of [0.3, 0.7]) { const g = x.createLinearGradient((c - 0.08) * w, 0, (c + 0.08) * w, 0); g.addColorStop(0, 'rgba(90,62,34,0)'); g.addColorStop(0.5, 'rgba(90,62,34,0.3)'); g.addColorStop(1, 'rgba(90,62,34,0)'); x.fillStyle = g; x.fillRect((c - 0.08) * w, 0, 0.16 * w, h); }
    for (let k = 0; k < 220; k++) { x.fillStyle = `rgba(${120 + Math.random() * 80},${100 + Math.random() * 60},${70 + Math.random() * 40},0.7)`; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 0.8 + Math.random() * 2.2, 0, 6.3); x.fill(); }
    for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(110,140,60,${0.25 + Math.random() * 0.35})`; const cx = (Math.random() < 0.5 ? 0.5 + (Math.random() - 0.5) * 0.08 : (Math.random() < 0.5 ? Math.random() * 0.08 : 0.92 + Math.random() * 0.08)) * w; x.beginPath(); x.arc(cx, Math.random() * h, 1.5 + Math.random() * 3, 0, 6.3); x.fill(); }
    dustEdges(x, w, h, 0.12);
  });
  T.asphaltJointMajor = cv(256, 256, (x, w, h) => asphaltBase(x, w, h, 74));
  T.asphaltJointPlain = cv(256, 256, (x, w, h) => asphaltBase(x, w, h, 78));
  T.dirtJoint = cv(256, 256, (x, w, h) => { x.fillStyle = '#b8966a'; x.fillRect(0, 0, w, h); grain(x, w, h, 0.85, 1.05); });
  return T;
}
