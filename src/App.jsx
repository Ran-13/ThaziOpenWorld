import React, { useEffect, useRef, useState } from 'react';
import { createGame } from './engine/game.js';

const my = s => String(s).replace(/[0-9]/g, d => '၀၁၂၃၄၅၆၇၈၉'[d]);
const card = { background: '#fff8ec', borderRadius: 16, boxShadow: '0 4px 0 rgba(43,42,51,.18)' };
const btn = { border: 'none', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' };

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

  return (
    <div style={{ position: 'fixed', ...(rotate && vp.w ? { top: 0, left: 0, width: vp.h, height: vp.w, transformOrigin: '0 0', transform: `rotate(90deg) translateY(${-vp.w}px)`, willChange: 'transform', backfaceVisibility: 'hidden' } : { inset: 0 }), fontFamily: "'Padauk', 'Noto Sans Myanmar', system-ui, sans-serif", color: '#2b2a33', touchAction: 'none', overflow: 'hidden', background: '#9fd3f0' }}>
      <div ref={stage} style={{ position: 'absolute', inset: 0 }} />

      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', left: 12, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <div style={{ ...card, padding: '8px 14px', minWidth: 128 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{my(`${h12}:${String(Mi).padStart(2, '0')}`)}</span>
            <span style={{ fontSize: 14, color: '#6b5a4a' }}>{period}</span>
          </div>
          <div style={{ fontSize: 14, color: '#6b5a4a', lineHeight: 1.5 }}>{my(hud.speed ?? 0)} ကီလိုမီတာ/နာရီ</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ ...card, background: '#f2b233', borderRadius: 14, padding: '6px 12px', fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}>{my((hud.money ?? 0).toLocaleString())} ကျပ်</div>
          <div style={{ ...card, borderRadius: 14, padding: '6px 12px', fontSize: 15, fontWeight: 700, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f7c21b', boxShadow: '0 0 0 2px #e08a00' }} />{my(hud.flowers ?? 0)}/{my(hud.flowersTotal ?? 0)}
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', right: 12, width: 132, height: 132, borderRadius: '50%', background: '#5e4029', boxShadow: '0 4px 0 rgba(43,42,51,.25), 0 0 0 5px #fff8ec', overflow: 'hidden', pointerEvents: 'none' }}>
        <canvas ref={map} style={{ width: 132, height: 132, display: 'block' }} />
      </div>

      {m && (
        <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 160px)', left: 12, right: 12, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ ...card, padding: '8px 14px', maxWidth: 420, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: m.stage === 'pickup' ? '#2f8f83' : '#d9603b', flex: 'none' }} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}>{m.stage === 'pickup' ? `${m.item} ယူရန် — ${m.label}` : `${m.item} ပို့ရန် — ${m.label}`}</div>
              <div style={{ fontSize: 13, color: '#6b5a4a', lineHeight: 1.5 }}>{my(m.dist)} မီတာ{m.left != null ? ` · ဆုကြေးအချိန် ${my(m.left)} စက္ကန့်` : ''}</div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'absolute', top: '42%', left: 16, right: 16, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: '#2b2a33', color: '#fff8ec', borderRadius: 999, padding: '8px 18px', fontSize: 16, fontWeight: 700, lineHeight: 1.6, textAlign: 'center' }}>{toast}</div>
        </div>
      )}

      {started && hud.popup && (
        <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 182px)', left: 16, right: 16, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ ...card, borderRadius: 18, padding: '10px 16px', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 2, border: '3px solid #2f8f83' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#2f8f83', lineHeight: 1.5 }}>{hud.popup.kind}</div>
            <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.4 }}>{hud.popup.name}</div>
            {hud.popup.en && <div style={{ fontSize: 13, color: '#6b5a4a', lineHeight: 1.4 }}>{hud.popup.en}</div>}
          </div>
        </div>
      )}

      <div ref={joy} style={{ position: 'absolute', left: 'calc(env(safe-area-inset-left) + 22px)', bottom: 'calc(env(safe-area-inset-bottom) + 34px)', width: 136, height: 136, borderRadius: '50%', background: 'rgba(255,248,236,.55)', boxShadow: 'inset 0 0 0 4px rgba(255,248,236,.9), 0 4px 0 rgba(43,42,51,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}>
        <div ref={knob} style={{ width: 60, height: 60, borderRadius: '50%', background: '#d9603b', boxShadow: '0 4px 0 #a8432a', pointerEvents: 'none' }} />
      </div>

      <div style={{ position: 'absolute', right: 'calc(env(safe-area-inset-right) + 18px)', bottom: 'calc(env(safe-area-inset-bottom) + 34px)', display: 'grid', gridTemplateColumns: 'auto auto', gap: 12, alignItems: 'end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => game.current?.toggleMission()} style={{ ...btn, minWidth: 78, height: 52, borderRadius: 16, background: m ? '#6b5a4a' : '#2f8f83', color: '#fff8ec', fontSize: 15, boxShadow: '0 4px 0 rgba(43,42,51,.3)', padding: '0 12px' }}>{m ? 'ပယ်ဖျက်' : 'အလုပ်ယူ'}</button>
          <button onClick={() => game.current?.cycleCamera()} style={{ ...btn, minWidth: 78, height: 48, borderRadius: 16, background: '#fff8ec', color: '#2b2a33', fontSize: 15, boxShadow: '0 4px 0 rgba(43,42,51,.25)', padding: '0 12px' }}>ကင်မရာ</button>
        </div>
        <button onClick={() => game.current?.bell()} aria-label="ဘဲလ်" style={{ ...btn, width: 88, height: 88, borderRadius: '50%', background: '#f2b233', boxShadow: '0 5px 0 #c58a14', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#2b2a33' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2b2a33" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
          <span style={{ fontSize: 13, lineHeight: 1.3 }}>ဘဲလ်</span>
        </button>
      </div>

      <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 6px)', left: 0, right: 0, textAlign: 'center', fontSize: 10, color: 'rgba(255,248,236,.9)', textShadow: '0 1px 2px rgba(0,0,0,.5)', pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>© OpenStreetMap contributors{hud.sat ? ' · Imagery © Esri, Maxar, Earthstar Geographics' : ''}</div>

      {!started && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(43,42,51,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff8ec', borderRadius: 26, padding: '30px 26px 20px', maxWidth: 340, width: '100%', boxShadow: '0 8px 0 rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.25 }}>သာစည်</div>
            <div>
              <div style={{ height: 10, borderRadius: 999, background: '#e8dfcd', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(pct * 100)}%`, background: '#d9603b', borderRadius: 999, transition: 'width .35s ease' }} />
              </div>
              <div style={{ fontSize: 13, color: '#8a7d70', marginTop: 8, lineHeight: 1.5 }}>{my(Math.round(pct * 100))}%</div>
            </div>
            <button disabled={!ready} onClick={() => { game.current?.start(); setStarted(true); }} style={{ ...btn, height: 54, borderRadius: 18, background: ready ? '#d9603b' : '#b8aea3', color: '#fff8ec', fontSize: 20, boxShadow: '0 5px 0 rgba(43,42,51,.3)' }}>{ready ? 'စတင်မည်' : 'ခဏစောင့်ပါ…'}</button>
            {diag && (
              <div style={{ fontSize: 11, color: '#2b2a33', background: '#ffe9b0', borderRadius: 8, padding: '6px 8px', font: '11px/1.5 monospace', textAlign: 'left' }}>
                dpr {diag.dpr} · ratio {diag.ratio} · fps {diag.fps}<br />buffer {diag.back}<br />css {diag.css} · rot {diag.rot}{diag.gi ? <>{'\n'}<br />calls {diag.gi.calls} · tris {(diag.gi.tris / 1e6).toFixed(2)}M</> : null}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#a2968a', lineHeight: 1.5 }}>မော်ဒယ်များ — Kenney, Quaternius (CC0) · ဆိုင်ကယ် Vladimir Ilic (CC-BY)</div>
          </div>
        </div>
      )}
    </div>
  );
}
