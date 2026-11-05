import * as THREE from './three.js';
import { EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, HorizontalTiltShiftShader, VerticalTiltShiftShader } from './addons.js';

export function makeComposer(renderer, scene, camera, samples = 0) {
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  // the renderer itself runs with antialias off when the composer is in use, so the
  // offscreen buffer has to be multisampled or every edge in the scene stays jagged
  const rt = new THREE.WebGLRenderTarget(Math.max(1, sz.x), Math.max(1, sz.y), { type: THREE.HalfFloatType, depthBuffer: true, samples });
  if (!samples) rt.depthTexture = new THREE.DepthTexture(Math.max(1, sz.x), Math.max(1, sz.y), THREE.UnsignedIntType);
  const comp = new EffectComposer(renderer, rt);
  comp.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.18, 0.5, 1.1); comp.addPass(bloom);
  const ht = new ShaderPass(HorizontalTiltShiftShader), vt = new ShaderPass(VerticalTiltShiftShader);
  comp.addPass(ht); comp.addPass(vt);
  comp.addPass(new OutputPass());
  let blur = 2.4;
  // Focus a bit below mid-frame — closer chase puts the bike lower in the view.
  const apply = () => { const pr = renderer.getPixelRatio(), w = comp._w || 1, h = comp._h || 1; ht.uniforms.h.value = blur / (w * pr); vt.uniforms.v.value = blur / (h * pr); ht.uniforms.r.value = vt.uniforms.r.value = 0.58; ht.enabled = vt.enabled = blur > 0; };
  return {
    comp, bloom,
    setSize(w, h) { comp._w = w; comp._h = h; comp.setSize(w, h); bloom.setSize(w, h); apply(); },
    setBlur(b) { blur = b; apply(); },
    render(dt) { comp.render(dt); },
  };
}

export function makeSky(sunDisc = true) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);
        // Soft horizon haze band so the sky isn't a flat 2-stop blend.
        float haze = exp(-h * 4.5) * 0.35;
        vec3 c = mix(horizon, top, pow(h, 0.48));
        c = mix(c, horizon * 1.08 + vec3(0.08, 0.05, 0.02), haze);
        float s = max(dot(d, normalize(sunDir)), 0.0);
        #ifdef SUN_DISC
          c += sunCol * (pow(s, 700.0) * 7.5 + pow(s, 8.0) * 0.45 + pow(s, 2.0) * 0.08);
        #else
          c += sunCol * (s * s * s * s * 0.4);
        #endif
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    defines: sunDisc ? { SUN_DISC: '' } : {},
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), mat); m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

export function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, day: { value: 1 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, deep: { value: new THREE.Color('#2f7f99') }, shallow: { value: new THREE.Color('#7cc8d8') }, sky: { value: new THREE.Color('#bfe4f5') } }]),
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; uniform float day; uniform vec3 sunDir; uniform vec3 deep; uniform vec3 shallow; uniform vec3 sky; varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p){ return sin(p.x*0.9+time*1.3)*0.5 + sin(p.y*1.1-time*1.1)*0.5 + sin((p.x+p.y)*1.7+time*2.1)*0.25 + sin((p.x-p.y)*2.9-time*1.7)*0.15; }
      void main(){ vec2 p = vW.xz; float e = 0.15;
        vec3 n = normalize(vec3((h(p-vec2(e,0.0))-h(p+vec2(e,0.0)))*0.3, 1.0, (h(p-vec2(0.0,e))-h(p+vec2(0.0,e)))*0.3));
        vec3 v = normalize(cameraPosition - vW); float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 c = mix(deep, shallow, 0.45 + 0.12 * h(p * 0.7)); c = mix(c, sky, fr * 0.6); c *= (0.22 + 0.78 * day);
        float sp = pow(max(dot(reflect(-normalize(sunDir), n), v), 0.0), 90.0); c += vec3(1.0, 0.95, 0.85) * sp * day * 3.0;
        gl_FragColor = vec4(c, 0.94);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, fog: true, depthWrite: false,
  });
}

export function makeMotes(dot, n = 650) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { seed[i * 3] = Math.random() * 90; seed[i * 3 + 1] = Math.random() * 14; seed[i * 3 + 2] = Math.random() * 90; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: dot, size: 0.22, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff1d0, opacity: 0.6 });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  const update = (t, cx, cz, night) => {
    for (let i = 0; i < n; i++) {
      const wx = (seed[i * 3] + t * 0.8 + Math.sin(t * 0.3 + i) * 0.6), wy = seed[i * 3 + 1] + Math.sin(t * 0.5 + i * 1.7) * 0.4, wz = (seed[i * 3 + 2] + t * 0.35);
      pos[i * 3] = cx - 45 + (((wx - cx) % 90) + 90) % 90; pos[i * 3 + 1] = 0.3 + (wy % 14); pos[i * 3 + 2] = cz - 45 + (((wz - cz) % 90) + 90) % 90;
    }
    g.attributes.position.needsUpdate = true;
    mat.color.setRGB(1 - night * 0.35, 0.94, 0.82 - night * 0.45).multiplyScalar(1 + night * 2.2);
    mat.size = 0.2 + night * 0.08; mat.opacity = 0.45 + night * 0.4;
  };
  return { points: pts, update };
}

export function makePuffs(n = 90) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color('#d9c29a') }, uScale: { value: 600 } },
    vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale; void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(color, a);
      #include <colorspace_fragment>
    }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  const P = Array.from({ length: n }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  let k = 0;
  return {
    points: pts, mat,
    emit(x, y, z, strength) { const p = P[k = (k + 1) % n]; p.life = 1; p.x = x; p.y = y; p.z = z; p.vx = (Math.random() - 0.5) * 0.6; p.vy = 0.3 + Math.random() * 0.4; p.vz = (Math.random() - 0.5) * 0.6; p.s = strength; },
    update(dt, light) {
      for (let i = 0; i < n; i++) { const p = P[i]; if (p.life > 0) { p.life -= dt * 0.8; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; } pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; size[i] = (1.4 - Math.max(0, p.life)) * 1.1; alpha[i] = Math.max(0, p.life) * 0.45 * (p.s || 1); }
      g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true;
      mat.uniforms.color.value.setRGB(0.85 * light + 0.1, 0.76 * light + 0.1, 0.6 * light + 0.12);
    },
  };
}

// Soft contact shadow / AO pad, multiplied onto the ground (instanced unit quad in XZ).
// Analytic soft box (no texture) faded out with the fog so far pads do not print grey patches.
export function contactShadowMaterial(fade, strength) {
  return new THREE.ShaderMaterial({
    uniforms: { uFade: { value: new THREE.Vector2(fade[0], fade[1]) }, uK: { value: strength } },
    vertexShader: `varying vec2 vUv; varying float vDist;
      void main() { vUv = uv; vec4 w = modelMatrix * instanceMatrix * vec4( position, 1.0 ); vDist = distance( w.xyz, cameraPosition );
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec2 uFade; uniform float uK; varying vec2 vUv; varying float vDist;
      void main() { vec2 q = abs( vUv - 0.5 ) * 2.0; float e = length( max( q - 0.55, 0.0 ) ) / 0.45;
        float a = ( 1.0 - smoothstep( 0.0, 1.0, e ) ) * ( 1.0 - smoothstep( uFade.x, uFade.y, vDist ) );
        gl_FragColor = vec4( vec3( 1.0 - uK * a ), 1.0 ); }`,
    blending: THREE.MultiplyBlending, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
}
