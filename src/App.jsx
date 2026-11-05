import React, { useEffect, useRef, useState } from 'react';
import { createGame } from './engine/game.js';

const my = s => String(s).replace(/[0-9]/g, d => '၀၁၂၃၄၅၆၇၈၉'[d]);
// City-kit theme: the Kenney suburban palette (slate trim, roof green, sign yellow, white siding)
// with chunky Kenney-style bottom edges.
const C = {
  panel: 'rgba(58,61,74,.92)', edge: '#25272f', text: '#f5f5f9', sub: '#b9bccf',
  green: '#53be84', greenEdge: '#2f8f63', yellow: '#f7b733', yellowEdge: '#c58a14',
  red: '#d9534f', redEdge: '#9e3431', white: '#e6e6ef', whiteEdge: '#9a9db3',
};
// Rideable vehicles: HUD name and a 24-unit line icon (stroke = currentColor).
const RIDES = {
  bike: { name: 'စက်ဘီး', horn: false, icon: <><circle cx="6" cy="16" r="3.5" /><circle cx="18" cy="16" r="3.5" /><path d="M6 16l4-7h5l3 7M10 9l-1.5-3H7M15 9l1-3h2" /></> },
  moto: { name: 'ဆိုင်ကယ်', horn: true, icon: <><circle cx="5.5" cy="16" r="3" /><circle cx="18.5" cy="16" r="3" /><path d="M5.5 16h6l3-5h3l1 5M14.5 11L13 7h3M9 11h5" /></> },
  car: { name: 'ကား', horn: true, icon: <><path d="M3 15v-3l2-4h11l3 4h2v3z" /><circle cx="7.5" cy="16" r="2" /><circle cx="17" cy="16" r="2" /><path d="M7 8l-1 4h12" /></> },
  cart: { name: 'မြင်းလှည်း', horn: false, icon: <><circle cx="8" cy="16" r="4" /><path d="M4 11h9a5 5 0 0 0-9 0zM13 13l5-1 1-4 2 1-1 3v5M18 12v5" /></> },
};
const btn = { border: 'none', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

const isMobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const OPTIONS = {
  realClock: true, dayMinutes: 8, startHour: 16,
  traffic: isMobile ? 'Quiet' : 'Normal',
  quality: isMobile ? 'Fast' : 'Best',
  ground: 'Stylized',
};

export default function App() {
  const stage = useRef(null), map = useRef(null), joy = useRef(null), knob = useRef(null), game = useRef(null);
  const [hud, setHud] = useState({ loading: true, loadMsg: 'စတင်နေသည်…' });
  const [started, setStarted] = useState(false);
  const [toast, setToast] = useState(null);
  const [rotate, setRotate] = useState(false);
  const [vp, setVp] = useState({ w: 0, h: 0 });

  // Force landscape. screen.orientation.lock() works on Android/Chrome (and only in fullscreen);
  // iOS Safari has no lock at all, so fall back to rotating the whole app 90 degrees.
  useEffect(() => {
    if (!isMobile) return;
    let locked = false;
    try {
      const r = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape');
      if (r && r.then) r.then(() => { locked = true; setRotate(false); }, () => {});
    } catch (e) { /* unsupported, fall through to the CSS rotation */ }
    const mq = matchMedia('(orientation: portrait)');
    const sync = () => setRotate(!locked && mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let alive = true, tt;
    createGame({
      container: stage.current, minimap: map.current, joyBase: joy.current, joyKnob: knob.current,
      modelsBase: new URL('models/', document.baseURI).href, options: OPTIONS,
      onHud: h => alive && setHud(p => ({ ...p, ...h })),
      onEvent: e => { if (e.type === 'toast' && alive) { clearTimeout(tt); setToast(e.text); tt = setTimeout(() => setToast(null), 2600); } },
    }).then(g => { if (alive) game.current = g; else g.dispose(); })
      .catch(err => { console.error(err); setHud({ loading: true, loadMsg: 'ဂိမ်းဖွင့်ရာတွင် အမှားဖြစ်သည် — ပြန်ဖွင့်ကြည့်ပါ' }); });
    return () => { alive = false; game.current && game.current.dispose(); game.current = null; };
  }, []);

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener('resize', on); window.addEventListener('orientationchange', on);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', on);
    };
  }, []);

  const [diag, setDiag] = useState(null);
  useEffect(() => {
    if (started) return undefined;   // the panel only shows on the start screen
    const id = setInterval(() => {
      const c = document.querySelector('canvas'); if (!c) return;
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 900) requestAnimationFrame(tick);
        else setDiag({ dpr: window.devicePixelRatio, back: c.width + 'x' + c.height,
          css: c.clientWidth + 'x' + c.clientHeight, ratio: (c.width / c.clientWidth).toFixed(2),
          fps: (n / ((performance.now() - t0) / 1000)).toFixed(0),
          gi: game.current && game.current.info ? game.current.info() : null,
          vp: window.innerWidth + 'x' + window.innerHeight, rot: rotate ? 'yes' : 'no' }); };
      requestAnimationFrame(tick);
    }, 1200);
    return () => clearInterval(id);
  }, [rotate, started]);

  const hr = hud.hour ?? (OPTIONS.realClock ? new Date().getHours() : OPTIONS.startHour), H = Math.floor(hr), Mi = Math.floor((hr - H) * 60), h12 = ((H + 11) % 12) + 1;
  const period = H >= 4 && H < 12 ? 'မနက်' : H >= 12 && H < 16 ? 'နေ့လယ်' : H >= 16 && H < 19 ? 'ညနေ' : 'ည';
  const m = hud.mission, ready = !!hud.ready;
  const pct = ready ? 1 : Math.max(0, Math.min(1, hud.progress ?? 0));

  // One scale for the whole HUD from the game area (iOS Safari's toolbars can leave a landscape
  // phone ~215 px tall). Text never drops below 11 px and touch targets never below 40 px.
  const GW = (rotate ? vp.h : vp.w) || 1280, GH = (rotate ? vp.w : vp.h) || 720;
  const k = Math.max(0.5, Math.min(1.1, GW / 900, (GH - 20) / 300));
  const z = v => Math.round(v * k), f = v => Math.max(11, Math.round(v * k)), tap = v => Math.max(40, z(v));
  const M = Math.max(8, z(14));                                   // edge margin
  const inset = side => `calc(env(safe-area-inset-${side}) + ${M}px)`;
  const panel = { background: C.panel, color: C.text, borderRadius: z(12), boxShadow: `0 ${Math.max(2, z(4))}px 0 ${C.edge}` };
  const chunky = (bg, edge, r) => ({ ...btn, background: bg, borderRadius: r, boxShadow: `0 ${Math.max(3, z(5))}px 0 ${edge}`, color: C.text });
  const mapSize = Math.max(84, z(124)), joySize = Math.max(96, z(140)), bell = Math.max(52, z(84));
  const missionW = tap(104), camW = tap(92), rideW = tap(104), btnH = tap(48), gap = Math.max(6, z(10));
  const rightW = bell + missionW + camW + rideW + 3 * gap;        // bottom-right button row
  const ride = RIDES[hud.ride] || RIDES.bike;
  // mission banner sits under the status bar; a toast stacks under the banner when both show
  const bannerTop = M + z(48) + gap, bannerH = Math.round(f(14) * 1.45 + f(12) * 1.45 + 2 * z(6)) + 2;
  const divider = <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,.14)' }} />;

  return (
    <div style={{ position: 'fixed', ...(rotate && vp.w ? { top: 0, left: 0, width: vp.h, height: vp.w, transformOrigin: '0 0', transform: `rotate(90deg) translateY(${-vp.w}px)`, willChange: 'transform', backfaceVisibility: 'hidden' } : { inset: 0 }), fontFamily: "'Padauk', 'Noto Sans Myanmar', system-ui, sans-serif", color: C.text, touchAction: 'none', overflow: 'hidden', background: '#9fd3f0' }}>
      <div ref={stage} style={{ position: 'absolute', inset: 0 }} />

      {/* top-left: one status bar (clock, speed, money, flowers) so it costs a single row of height */}
      <div style={{ ...panel, position: 'absolute', top: inset('top'), left: inset('left'), display: 'flex', alignItems: 'center', gap: z(10), padding: `${z(6)}px ${z(12)}px`, pointerEvents: 'none', maxWidth: `calc(100% - ${mapSize + 3 * M}px)` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: z(5), whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: f(22), fontWeight: 700, lineHeight: 1.2 }}>{my(`${h12}:${String(Mi).padStart(2, '0')}`)}</span>
          <span style={{ fontSize: f(13), color: C.sub }}>{period}</span>
        </div>
        {divider}
        <div style={{ fontSize: f(14), lineHeight: 1.4, whiteSpace: 'nowrap' }}><b>{my(hud.speed ?? 0)}</b> <span style={{ color: C.sub, fontSize: f(12) }}>ကမ/နာရီ</span></div>
        {divider}
        <div style={{ fontSize: f(14), fontWeight: 700, lineHeight: 1.4, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: z(5) }}>
          <span style={{ width: f(12), height: f(12), borderRadius: '50%', background: C.yellow, boxShadow: `inset 0 -2px 0 ${C.yellowEdge}` }} />{my((hud.money ?? 0).toLocaleString())} <span style={{ color: C.sub, fontWeight: 400, fontSize: f(12) }}>ကျပ်</span>
        </div>
        {divider}
        <div style={{ fontSize: f(14), fontWeight: 700, lineHeight: 1.4, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: z(5) }}>
          <span style={{ width: f(10), height: f(10), borderRadius: '50%', background: '#f7c21b', boxShadow: '0 0 0 2px #e08a00' }} />{my(hud.flowers ?? 0)}/{my(hud.flowersTotal ?? 0)}
        </div>
      </div>

      <div style={{ position: 'absolute', top: inset('top'), right: inset('right'), width: mapSize, height: mapSize, borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none', border: `${Math.max(3, z(5))}px solid ${C.panel}`, boxShadow: `0 ${Math.max(2, z(4))}px 0 ${C.edge}`, background: '#3a3d4a', boxSizing: 'border-box' }}>
        <canvas ref={map} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>

      {/* mission: top centre, clear of the status bar row and the minimap */}
      {m && (
        <div style={{ position: 'absolute', top: `calc(env(safe-area-inset-top) + ${bannerTop}px)`, left: mapSize + 2 * M, right: mapSize + 2 * M, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ ...panel, padding: `${z(6)}px ${z(12)}px`, maxWidth: '100%', display: 'flex', gap: z(10), alignItems: 'center', borderLeft: `${z(5)}px solid ${m.stage === 'pickup' ? C.green : C.red}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ fontSize: f(14), fontWeight: 700, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.stage === 'pickup' ? `${m.item} ယူရန် — ${m.label}` : `${m.item} ပို့ရန် — ${m.label}`}</div>
              <div style={{ fontSize: f(12), color: C.sub, lineHeight: 1.45 }}>{my(m.dist)} မီတာ{m.left != null ? ` · ဆုကြေးအချိန် ${my(m.left)} စက္ကန့်` : ''}</div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'absolute', top: m ? `calc(env(safe-area-inset-top) + ${bannerTop + bannerH + gap}px)` : '40%', left: joySize + 2 * M, right: joySize + 2 * M, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ ...panel, borderRadius: 999, padding: `${z(7)}px ${z(16)}px`, fontSize: f(15), fontWeight: 700, lineHeight: 1.5, textAlign: 'center' }}>{toast}</div>
        </div>
      )}

      {/* place name: bottom centre, between the joystick and the button row */}
      {started && hud.popup && (
        <div style={{ position: 'absolute', bottom: `calc(env(safe-area-inset-bottom) + ${M + z(14)}px)`, left: joySize + 2 * M, right: rightW + 2 * M, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ ...panel, padding: `${z(6)}px ${z(12)}px`, maxWidth: '100%', display: 'flex', flexDirection: 'column', borderTop: `${z(4)}px solid ${C.green}` }}>
            <div style={{ fontSize: f(11), fontWeight: 700, color: C.green, lineHeight: 1.4 }}>{hud.popup.kind}</div>
            <div style={{ fontSize: f(16), fontWeight: 700, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hud.popup.name}</div>
            {hud.popup.en && <div style={{ fontSize: f(12), color: C.sub, lineHeight: 1.35 }}>{hud.popup.en}</div>}
          </div>
        </div>
      )}

      <div ref={joy} style={{ position: 'absolute', left: inset('left'), bottom: inset('bottom'), width: joySize, height: joySize, borderRadius: '50%', background: 'rgba(58,61,74,.42)', boxShadow: `inset 0 0 0 ${Math.max(2, z(3))}px rgba(245,245,249,.75)`, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}>
        <div ref={knob} style={{ width: Math.round(joySize * 0.44), height: Math.round(joySize * 0.44), borderRadius: '50%', background: C.white, boxShadow: `0 ${Math.max(3, z(5))}px 0 ${C.whiteEdge}`, pointerEvents: 'none' }} />
      </div>

      <div style={{ position: 'absolute', right: inset('right'), bottom: inset('bottom'), display: 'flex', gap, alignItems: 'flex-end' }}>
        <button onClick={() => game.current?.cycleRide()} aria-label="ယာဉ်ပြောင်း" style={{ ...chunky(C.panel, C.edge, z(12)), width: rideW, height: btnH, fontSize: f(14), gap: z(5), whiteSpace: 'nowrap' }}>
          <svg width={f(20)} height={f(20)} viewBox="0 0 24 24" fill="none" stroke={C.yellow} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ride.icon}</svg>{ride.name}
        </button>
        <button onClick={() => game.current?.cycleCamera()} style={{ ...chunky(C.panel, C.edge, z(12)), width: camW, height: btnH, fontSize: f(14), gap: z(5) }}>
          <svg width={f(16)} height={f(16)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>ကင်မရာ
        </button>
        <button onClick={() => game.current?.toggleMission()} style={{ ...chunky(m ? C.red : C.green, m ? C.redEdge : C.greenEdge, z(12)), width: missionW, height: btnH, fontSize: f(14) }}>{m ? 'ပယ်ဖျက်' : 'အလုပ်ယူ'}</button>
        <button onClick={() => game.current?.bell()} aria-label={ride.horn ? 'ဟွန်း' : 'ဘဲလ်'} style={{ ...chunky(C.yellow, C.yellowEdge, '50%'), width: bell, height: bell, flexDirection: 'column', color: '#2b2d38' }}>
          <svg width={Math.round(bell * 0.36)} height={Math.round(bell * 0.36)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {ride.horn ? <path d="M4 10v4h3l6 4V6L7 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /> : <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>}
          </svg>
          {bell >= 64 && <span style={{ fontSize: f(12), lineHeight: 1.2 }}>{ride.horn ? 'ဟွန်း' : 'ဘဲလ်'}</span>}
        </button>
      </div>

      <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 2px)', left: 0, right: 0, textAlign: 'center', fontSize: 9, color: 'rgba(245,245,249,.85)', textShadow: '0 1px 2px rgba(0,0,0,.5)', pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>© OpenStreetMap contributors{hud.sat ? ' · Imagery © Esri, Maxar, Earthstar Geographics' : ''}</div>

      {!started && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(37,39,47,.55)', display: 'flex', padding: M, overflowY: 'auto' }}>
          <div style={{ ...panel, margin: 'auto', borderRadius: z(20), padding: `${z(22)}px ${z(22)}px ${z(16)}px`, maxWidth: 340, width: '100%', boxShadow: `0 ${z(6)}px 0 ${C.edge}`, display: 'flex', flexDirection: 'column', gap: z(14), textAlign: 'center' }}>
            <div style={{ fontSize: Math.max(26, z(44)), fontWeight: 700, lineHeight: 1.25 }}>သာစည်</div>
            <div>
              <div style={{ height: Math.max(6, z(10)), borderRadius: 999, background: C.edge, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(pct * 100)}%`, background: C.green, borderRadius: 999, transition: 'width .35s ease' }} />
              </div>
              <div style={{ fontSize: f(13), color: C.sub, marginTop: z(6), lineHeight: 1.5 }}>{my(Math.round(pct * 100))}%</div>
            </div>
            <button disabled={!ready} onClick={() => { game.current?.start(); setStarted(true); }} style={{ ...chunky(ready ? C.green : '#5b6070', ready ? C.greenEdge : C.edge, z(14)), height: tap(52), fontSize: f(19), flex: 'none' }}>{ready ? 'စတင်မည်' : 'ခဏစောင့်ပါ…'}</button>
            {diag && GH >= 420 && (
              <div style={{ color: C.sub, background: C.edge, borderRadius: 8, padding: '6px 8px', font: '11px/1.5 monospace', textAlign: 'left' }}>
                dpr {diag.dpr} · ratio {diag.ratio} · fps {diag.fps}<br />buffer {diag.back}<br />css {diag.css} · rot {diag.rot}{diag.gi ? <>{'\n'}<br />calls {diag.gi.calls} · tris {(diag.gi.tris / 1e6).toFixed(2)}M</> : null}
              </div>
            )}
            <div style={{ fontSize: 10, color: C.sub, lineHeight: 1.5 }}>မော်ဒယ်များ — Kenney, Quaternius (CC0) · ဆိုင်ကယ် Vladimir Ilic (CC-BY)</div>
          </div>
        </div>
      )}
    </div>
  );
}
