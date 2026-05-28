import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { MiniRoute } from '../Map/MiniRoute.jsx';
import { StatRow } from './ShareCard.jsx';
import { exportCustomCard, hexToRgba } from '../../utils/canvas.js';
import { fmtKm, fmtDur, fmtPace } from '../../utils/formatters.js';
import { EDITOR_DEFAULTS, ACCENT_PRESETS, BG_PRESETS, ELEMENT_META } from '../../constants/canvas.js';
import { EDITOR_PRESETS_KEY } from '../../constants/keys.js';

export function mergeEditorState(saved) {
  const d = EDITOR_DEFAULTS;
  if (!saved || typeof saved !== 'object') return d;
  const mergeObj = (def, src) => ({ ...def, ...(src && typeof src === 'object' ? src : {}) });
  return {
    bg:       mergeObj(d.bg,    saved.bg),
    fx:       mergeObj(d.fx,    saved.fx),
    elements: {
      route:    mergeObj(d.elements.route,    saved.elements?.route),
      distance: mergeObj(d.elements.distance, saved.elements?.distance),
      stats:    mergeObj(d.elements.stats,    saved.elements?.stats),
      name:     mergeObj(d.elements.name,     saved.elements?.name),
      branding: mergeObj(d.elements.branding, saved.elements?.branding),
    },
    style: mergeObj(d.style, saved.style),
  };
}

function Slider({ label, value, min=0, max=1, step=0.05, onChange, unit='', pct=false }) {
  const rafRef = useRef(null);
  const display = pct ? Math.round(value * 100) + '%' : (step < 1 ? value.toFixed(2) : Math.round(value)) + unit;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 5 }}>
        <span style={{ fontSize:'.68rem', color:'rgba(255,255,255,.4)', letterSpacing:'.08em' }}>{label}</span>
        <span style={{ fontSize:'.68rem', color:'rgba(255,255,255,.65)', fontFamily:'monospace' }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => {
          const val = parseFloat(e.target.value);
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => onChange(val));
        }}
        style={{ width:'100%', height:4, cursor:'pointer', accentColor:'#f97316', display:'block' }}/>
    </div>
  );
}

function EditorToggle({ label, value, onChange }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
      <span style={{ fontSize:'.76rem', color:'rgba(255,255,255,.62)' }}>{label}</span>
      <div style={{ width:36, height:20, borderRadius:10, background:value?'#f97316':'rgba(255,255,255,.12)',
        position:'relative', cursor:'pointer', transition:'background .18s', flexShrink:0 }}
        onClick={() => onChange(!value)}>
        <div style={{ position:'absolute', top:2, left:value?18:2, width:16, height:16, borderRadius:'50%',
          background:'#fff', transition:'left .18s', boxShadow:'0 1px 4px rgba(0,0,0,.35)' }}/>
      </div>
    </div>
  );
}

function SwatchRow({ label, value, onChange, presets }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize:'.68rem', color:'rgba(255,255,255,.4)', letterSpacing:'.08em', marginBottom:8 }}>{label}</div>}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
        {presets.map(c => (
          <div key={c} onClick={() => onChange(c)} style={{
            width:22, height:22, borderRadius:'50%', background:c, cursor:'pointer', flexShrink:0,
            border: c === value ? '2.5px solid #fff' : '2px solid rgba(255,255,255,.1)',
            boxShadow: c === value ? '0 0 0 2px #f97316' : 'none', transition:'box-shadow .15s' }}/>
        ))}
        <label style={{ display:'flex', cursor:'pointer' }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            style={{ width:22, height:22, borderRadius:'50%', border:'2px solid rgba(255,255,255,.15)',
              cursor:'pointer', padding:0, background:'transparent' }}/>
        </label>
      </div>
    </div>
  );
}

function EditorPreview({ act, state, W, H, cardRef, selected, onSelect, onDragStart }) {
  const fn = n => Math.round(n * W / 270);
  const f  = n => fn(n) + 'px';
  const { bg, fx, elements: el, style: st } = state;
  const dist     = fmtKm(act.distanceKm);
  const durFmt   = fmtDur(act.movingTimeSec);
  const paceFmt  = fmtPace(act.avgPaceSecKm) + '/km';
  const hasRoute = act.route && act.route.length > 2;
  const runName  = (act.name || 'Activity').substring(0, 28);

  const bgStyle = useMemo(() => {
    if (bg.type === 'gradient') return { background: `linear-gradient(${bg.gradAngle}deg,${bg.gradStop1},${bg.gradStop2})` };
    if (bg.type === 'image' && bg.imageData) return {
      backgroundImage: `url(${bg.imageData})`, backgroundSize: `${bg.imageZoom}%`,
      backgroundPosition: `${bg.imageX}% ${bg.imageY}%`, backgroundRepeat: 'no-repeat',
      filter: `brightness(${bg.brightness / 100}) blur(${bg.blur}px)`,
    };
    return { background: bg.color };
  }, [bg]);

  const SNAP_THRESH = 3.5;
  const SNAP_PTS = [0, 25, 33.3, 50, 66.7, 75, 100];

  const dragProps = useCallback((key) => ({
    onPointerDown: e => { e.preventDefault(); e.stopPropagation(); onDragStart(key, e, SNAP_PTS, SNAP_THRESH); },
    onClick: e => { e.stopPropagation(); onSelect(key); },
    style: {
      position: 'absolute',
      left: `${el[key].x}%`, top: `${el[key].y}%`,
      transform: `translate(-50%,-50%) scale(${el[key].scale})`,
      transformOrigin: 'center center',
      cursor: 'grab', touchAction: 'none', userSelect: 'none',
      outline: selected === key ? '2px solid rgba(59,130,246,.75)' : 'none',
      outlineOffset: 4, borderRadius: 3,
      filter: selected === key ? 'drop-shadow(0 0 8px rgba(59,130,246,.45))' : 'none',
      transition: 'left .08s ease, top .08s ease, outline .1s, filter .1s',
      willChange: 'transform, left, top',
    },
  }), [el, selected, onDragStart, onSelect]);

  return (
    <div ref={cardRef} onClick={() => onSelect(null)}
      style={{ width: W, height: H, borderRadius: fn(18) + 'px', overflow: 'hidden',
        position: 'relative', flexShrink: 0, boxShadow: '0 12px 50px rgba(0,0,0,.75)',
        cursor: 'default', animation: 'cardEntrance .38s cubic-bezier(.34,1.56,.64,1) both' }}>

      {/* Background */}
      <div style={{ position:'absolute', inset:0, ...bgStyle }}/>

      {/* BG overlay */}
      {bg.overlayOpacity > 0 && (
        <div style={{ position:'absolute', inset:0, background:bg.overlayColor, opacity:bg.overlayOpacity, pointerEvents:'none' }}/>
      )}

      {/* Vignette */}
      {fx.vignette > 0 && (
        <div style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse at 50% 50%,transparent 28%,rgba(0,0,0,${fx.vignette}) 100%)`, pointerEvents:'none' }}/>
      )}

      {/* Glow overlay */}
      {fx.glowActive && (
        <div style={{ position:'absolute', left:`${fx.glowX}%`, top:`${fx.glowY}%`,
          transform:'translate(-50%,-50%)', width:`${fx.glowRadius * 2}%`, height:`${fx.glowRadius}%`,
          background:`radial-gradient(ellipse at center,${hexToRgba(fx.glowColor, fx.glowOpacity)} 0%,transparent 70%)`,
          filter:`blur(${fn(9)}px)`, pointerEvents:'none' }}/>
      )}

      {/* Grain */}
      {fx.grain > 0 && (
        <div style={{ position:'absolute', inset:0, opacity: fx.grain * 0.45, mixBlendMode:'overlay', pointerEvents:'none',
          backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}/>
      )}

      {/* Route element */}
      {el.route.visible && hasRoute && (
        <div {...dragProps('route')}>
          <MiniRoute route={act.route} W={fn(220 * el.route.scale)} H={fn(121 * el.route.scale)} glowColor={st.accentColor}/>
        </div>
      )}

      {/* Distance element */}
      {el.distance.visible && (
        <div {...dragProps('distance')}>
          <div style={{ textAlign:'center', pointerEvents:'none' }}>
            <div style={{ fontSize:f(52), fontWeight:900, color:st.textColor, lineHeight:.84, letterSpacing:'-.04em' }}>{dist}</div>
            <div style={{ fontSize:f(7), fontWeight:700, color:st.accentColor, letterSpacing:'.22em', marginTop:f(5) }}>KILOMETRES</div>
          </div>
        </div>
      )}

      {/* Stats element */}
      {el.stats.visible && (
        <div {...dragProps('stats')} style={{ ...dragProps('stats').style, width: f(210) }}>
          <StatRow W={fn(210 * el.stats.scale)} durFmt={durFmt} paceFmt={paceFmt}/>
        </div>
      )}

      {/* Name element */}
      {el.name.visible && (
        <div {...dragProps('name')}>
          <div style={{ fontSize:f(7.5), color:st.textColor, opacity:.42, textAlign:'center', maxWidth:f(190),
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', pointerEvents:'none' }}>{runName}</div>
        </div>
      )}

      {/* Branding */}
      {el.branding.visible && (
        <div {...dragProps('branding')}>
          <div style={{ fontSize:f(6), fontWeight:700, color:'rgba(255,255,255,.28)', letterSpacing:'.2em', pointerEvents:'none' }}>RUNLYTICS</div>
        </div>
      )}

      {/* Snap guide lines (shown when element selected) */}
      {selected && <>
        <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:1, background:'rgba(59,130,246,.2)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', top:'50%', left:0, right:0, height:1, background:'rgba(59,130,246,.2)', pointerEvents:'none' }}/>
        {[33.3, 66.7].map(p => (
          <div key={p} style={{ position:'absolute', top:`${p}%`, left:0, right:0, height:1, background:'rgba(59,130,246,.1)', pointerEvents:'none' }}/>
        ))}
      </>}
    </div>
  );
}

function BgTab({ bg, set }) {
  const fileRef = useRef(null);
  const onImage = e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set({ ...bg, type:'image', imageData:ev.target.result });
    reader.readAsDataURL(file);
  };
  const tabBtn = (type, label) => (
    <button key={type} onClick={() => set({ ...bg, type })} style={{
      flex:1, padding:'8px 0', borderRadius:8, fontFamily:'inherit', cursor:'pointer', fontSize:'.72rem', fontWeight:600,
      border:`1px solid ${bg.type===type?'#f97316':'rgba(255,255,255,.1)'}`,
      background:bg.type===type?'rgba(249,115,22,.12)':'transparent',
      color:bg.type===type?'#f97316':'rgba(255,255,255,.38)', transition:'all .15s' }}>
      {label}
    </button>
  );
  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {tabBtn('color','Color')} {tabBtn('gradient','Gradient')} {tabBtn('image','Photo')}
      </div>
      {bg.type === 'color' && (
        <SwatchRow label="Background Color" value={bg.color} onChange={c => set({...bg,color:c})} presets={BG_PRESETS}/>
      )}
      {bg.type === 'gradient' && (
        <div>
          <div style={{ display:'flex', gap:12, marginBottom:4 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'.65rem', color:'rgba(255,255,255,.35)', marginBottom:6 }}>From</div>
              <SwatchRow value={bg.gradStop1} onChange={c => set({...bg,gradStop1:c})} presets={BG_PRESETS}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'.65rem', color:'rgba(255,255,255,.35)', marginBottom:6 }}>To</div>
              <SwatchRow value={bg.gradStop2} onChange={c => set({...bg,gradStop2:c})} presets={['#f97316','#060810','#3b82f6','#a855f7','#22c55e','#faf8f4','#0d0520']}/>
            </div>
          </div>
          <Slider label="Angle" value={bg.gradAngle} min={0} max={360} step={5} onChange={v => set({...bg,gradAngle:v})} unit="°"/>
        </div>
      )}
      {bg.type === 'image' && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={onImage}/>
          {bg.imageData ? (
            <div>
              <div style={{ width:'100%', height:54, borderRadius:8, backgroundImage:`url(${bg.imageData})`,
                backgroundSize:'cover', backgroundPosition:'center', marginBottom:10, border:'1px solid rgba(255,255,255,.1)' }}/>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <button onClick={() => fileRef.current?.click()} style={{ flex:1, padding:'7px', borderRadius:8,
                  border:'1px solid rgba(255,255,255,.15)', background:'transparent',
                  color:'rgba(255,255,255,.55)', fontSize:'.72rem', cursor:'pointer', fontFamily:'inherit' }}>Change photo</button>
                <button onClick={() => set({...bg,imageData:null,type:'color'})} style={{ padding:'7px 10px', borderRadius:8,
                  border:'1px solid rgba(239,68,68,.2)', background:'rgba(239,68,68,.06)',
                  color:'#ef4444', fontSize:'.72rem', cursor:'pointer', fontFamily:'inherit' }}>Remove</button>
              </div>
              <Slider label="Zoom" value={bg.imageZoom} min={80} max={220} step={5} onChange={v => set({...bg,imageZoom:v})} unit="%"/>
              <Slider label="H Position" value={bg.imageX} min={0} max={100} step={1} onChange={v => set({...bg,imageX:v})} pct/>
              <Slider label="V Position" value={bg.imageY} min={0} max={100} step={1} onChange={v => set({...bg,imageY:v})} pct/>
              <Slider label="Brightness" value={bg.brightness} min={40} max={160} step={5} onChange={v => set({...bg,brightness:v})} unit="%"/>
              <Slider label="Blur" value={bg.blur} min={0} max={16} step={1} onChange={v => set({...bg,blur:v})} unit="px"/>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              style={{ width:'100%', padding:'22px 0', borderRadius:10, border:'2px dashed rgba(255,255,255,.12)',
                background:'transparent', color:'rgba(255,255,255,.35)', fontSize:'.8rem', cursor:'pointer', fontFamily:'inherit' }}>
              📷  Upload photo
            </button>
          )}
        </div>
      )}
      {bg.type !== 'color' && (
        <div style={{ marginTop:6, paddingTop:12, borderTop:'1px solid rgba(255,255,255,.06)' }}>
          <Slider label="Overlay Opacity" value={bg.overlayOpacity} min={0} max={0.88} step={0.04} onChange={v => set({...bg,overlayOpacity:v})} pct/>
          <SwatchRow label="Overlay Color" value={bg.overlayColor} onChange={c => set({...bg,overlayColor:c})} presets={['#000000','#060810','#0d0520','#1a0a30','#ffffff']}/>
        </div>
      )}
    </div>
  );
}

function FxTab({ fx, set }) {
  return (
    <div>
      <Slider label="Vignette" value={fx.vignette} min={0} max={0.88} step={0.04} onChange={v => set({...fx,vignette:v})} pct/>
      <Slider label="Film Grain" value={fx.grain} min={0} max={1} step={0.05} onChange={v => set({...fx,grain:v})} pct/>
      <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:12, marginTop:4 }}>
        <EditorToggle label="Glow Overlay" value={fx.glowActive} onChange={v => set({...fx,glowActive:v})}/>
        {fx.glowActive && (
          <div>
            <SwatchRow label="Glow Color" value={fx.glowColor} onChange={c => set({...fx,glowColor:c})} presets={ACCENT_PRESETS}/>
            <Slider label="X Position" value={fx.glowX} min={0} max={100} step={1} onChange={v => set({...fx,glowX:v})} pct/>
            <Slider label="Y Position" value={fx.glowY} min={0} max={100} step={1} onChange={v => set({...fx,glowY:v})} pct/>
            <Slider label="Spread" value={fx.glowRadius} min={10} max={80} step={5} onChange={v => set({...fx,glowRadius:v})} unit="%"/>
            <Slider label="Intensity" value={fx.glowOpacity} min={0.05} max={0.6} step={0.05} onChange={v => set({...fx,glowOpacity:v})} pct/>
          </div>
        )}
      </div>
    </div>
  );
}

function ElementsTab({ elements, style, setElements, setStyle, selected, onSelect }) {
  const setEl = (key, patch) => setElements(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const el = selected ? elements[selected] : null;
  return (
    <div>
      {/* Element chips */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
        {Object.entries(ELEMENT_META).map(([key, meta]) => (
          <button key={key} onClick={() => onSelect(selected === key ? null : key)} style={{
            display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:20, cursor:'pointer', fontFamily:'inherit',
            border:`1px solid ${selected===key?'#3b82f6':elements[key].visible?'rgba(249,115,22,.3)':'rgba(255,255,255,.08)'}`,
            background:selected===key?'rgba(59,130,246,.14)':elements[key].visible?'rgba(249,115,22,.05)':'transparent',
            color:selected===key?'#60a5fa':elements[key].visible?'rgba(255,255,255,.65)':'rgba(255,255,255,.25)',
            fontSize:'.68rem', fontWeight:500, transition:'all .15s' }}>
            <span style={{ fontSize:'.8rem' }}>{meta.icon}</span> {meta.label}
          </button>
        ))}
      </div>

      {/* Selected element controls */}
      {el && selected && (
        <div style={{ background:'rgba(255,255,255,.03)', borderRadius:10, padding:'12px', border:'1px solid rgba(255,255,255,.07)', marginBottom:14 }}>
          <div style={{ fontSize:'.68rem', fontWeight:700, color:'rgba(255,255,255,.35)', letterSpacing:'.1em', marginBottom:10 }}>
            {ELEMENT_META[selected]?.label.toUpperCase()} · drag card to reposition
          </div>
          <EditorToggle label="Visible" value={el.visible} onChange={v => setEl(selected, {visible:v})}/>
          <Slider label="Scale" value={el.scale} min={0.4} max={1.8} step={0.05} onChange={v => setEl(selected, {scale:v})}/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:4 }}>
            {[['X', 'x', 0, 100], ['Y', 'y', 0, 100]].map(([lbl, key, min, max]) => (
              <div key={lbl}>
                <div style={{ fontSize:'.62rem', color:'rgba(255,255,255,.3)', marginBottom:5 }}>{lbl} %</div>
                <input type="number" min={min} max={max} value={Math.round(el[key])} step={1}
                  onChange={e => setEl(selected, {[key]: Math.max(min, Math.min(max, +e.target.value))})}
                  style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
                    borderRadius:7, color:'#fff', padding:'7px 8px', fontSize:'.78rem', fontFamily:'monospace', outline:'none' }}/>
              </div>
            ))}
            <div>
              <div style={{ fontSize:'.62rem', color:'rgba(255,255,255,.3)', marginBottom:5 }}>Center</div>
              <button onClick={() => setEl(selected, {x:50})} style={{ width:'100%', padding:'8px 0', borderRadius:7,
                border:'1px solid rgba(255,255,255,.1)', background:'transparent',
                color:'rgba(255,255,255,.4)', fontSize:'.7rem', cursor:'pointer', fontFamily:'inherit' }}>↔</button>
            </div>
          </div>
        </div>
      )}

      {/* Style controls */}
      <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:12 }}>
        <SwatchRow label="Accent Color" value={style.accentColor} onChange={c => setStyle(p => ({...p,accentColor:c}))} presets={ACCENT_PRESETS}/>
        <SwatchRow label="Text Color" value={style.textColor} onChange={c => setStyle(p => ({...p,textColor:c}))} presets={['#ffffff','#f0ede8','#d8e6f7','#0a0a0a','#1a1a1a']}/>
      </div>
    </div>
  );
}

function PresetsTab({ currentState, onLoad }) {
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(EDITOR_PRESETS_KEY) || '[]'); } catch { return []; }
  });
  const [name, setName] = useState('');

  const save = () => {
    const n = name.trim(); if (!n) return;
    const updated = [{ name:n, state:currentState, date:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}) }, ...presets.slice(0, 7)];
    setPresets(updated); setName('');
    try { localStorage.setItem(EDITOR_PRESETS_KEY, JSON.stringify(updated)); } catch {}
  };

  const remove = i => {
    const updated = presets.filter((_,j) => j !== i);
    setPresets(updated);
    try { localStorage.setItem(EDITOR_PRESETS_KEY, JSON.stringify(updated)); } catch {}
  };

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <input value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key==='Enter'&&save()}
          placeholder="Name this layout…"
          style={{ flex:1, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
            borderRadius:9, color:'#fff', padding:'9px 12px', fontSize:'.8rem', fontFamily:'inherit', outline:'none' }}/>
        <button onClick={save} disabled={!name.trim()} style={{
          padding:'9px 16px', borderRadius:9, border:'none', fontFamily:'inherit', fontWeight:700,
          background:name.trim()?'linear-gradient(135deg,#f97316,#ea580c)':'rgba(255,255,255,.06)',
          color:name.trim()?'#fff':'rgba(255,255,255,.3)', cursor:name.trim()?'pointer':'default', fontSize:'.8rem' }}>Save</button>
      </div>
      {presets.length === 0 && (
        <div style={{ textAlign:'center', padding:'28px 0', color:'rgba(255,255,255,.22)', fontSize:'.78rem', lineHeight:1.7 }}>
          No saved layouts yet.<br/>Set up a look you like, then save it here.
        </div>
      )}
      {presets.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 12px', borderRadius:10,
          background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', marginBottom:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'.82rem', fontWeight:600, color:'rgba(255,255,255,.78)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
            <div style={{ fontSize:'.66rem', color:'rgba(255,255,255,.28)' }}>{p.date}</div>
          </div>
          <button onClick={() => onLoad(p.state)} style={{ padding:'5px 11px', borderRadius:7, fontFamily:'inherit', fontWeight:600,
            background:'rgba(249,115,22,.1)', border:'1px solid rgba(249,115,22,.22)', color:'#f97316', fontSize:'.72rem', cursor:'pointer' }}>
            Load
          </button>
          <button onClick={() => remove(i)} style={{ padding:'5px 9px', borderRadius:7, fontFamily:'inherit',
            background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.18)', color:'#ef4444', fontSize:'.72rem', cursor:'pointer' }}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function ShareEditor({ act, onClose }) {
  const PREV_W = 230;
  const PREV_H = Math.round(PREV_W * 16 / 9); // 409

  const [state, setStateRaw] = useState(EDITOR_DEFAULTS);
  const [tab,   setTab]       = useState('bg');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy]         = useState(false);
  const cardRef  = useRef(null);
  const dragRef  = useRef(null);

  const setElements = useCallback(updater =>
    setStateRaw(prev => ({ ...prev, elements: typeof updater === 'function' ? updater(prev.elements) : updater }))
  , []);

  // Cancel any in-flight drag if the editor unmounts while the user's finger is still down
  const dragCleanupRef = useRef(null);
  useEffect(() => () => { if (dragCleanupRef.current) dragCleanupRef.current(); }, []);

  const startDrag = useCallback((key, e, snapPoints, snapThresh) => {
    e.preventDefault(); e.stopPropagation();
    setSelected(key);
    const card = cardRef.current; if (!card) return;
    const rect = card.getBoundingClientRect();
    const getXY = ev => ({
      cx: ev.touches ? ev.touches[0].clientX : ev.clientX,
      cy: ev.touches ? ev.touches[0].clientY : ev.clientY,
    });
    const { cx: startCX, cy: startCY } = getXY(e);
    let startEl;
    setStateRaw(prev => { startEl = { ...prev.elements[key] }; return prev; });
    dragRef.current = true;

    const snap = val => { for (const p of snapPoints) if (Math.abs(val - p) < snapThresh) return p; return Math.round(val * 10) / 10; };

    const onMove = ev => {
      if (!dragRef.current) return;
      ev.preventDefault();
      const { cx, cy } = getXY(ev);
      const nx = snap(Math.max(4, Math.min(96, startEl.x + (cx - startCX) / rect.width  * 100)));
      const ny = snap(Math.max(3, Math.min(97, startEl.y + (cy - startCY) / rect.height * 100)));
      setStateRaw(prev => ({ ...prev, elements: { ...prev.elements, [key]: { ...prev.elements[key], x:nx, y:ny } } }));
    };

    const cleanup = () => {
      dragRef.current = false;
      dragCleanupRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', cleanup);
      document.removeEventListener('touchend', cleanup);
    };
    dragCleanupRef.current = cleanup;

    document.addEventListener('mousemove', onMove, { passive:false });
    document.addEventListener('touchmove', onMove, { passive:false });
    document.addEventListener('mouseup', cleanup);
    document.addEventListener('touchend', cleanup);
  }, []);

  // Close editor on Escape
  useEffect(()=>{
    const onKey=e=>{if(e.key==='Escape')onClose();};
    document.addEventListener('keydown',onKey);
    return()=>document.removeEventListener('keydown',onKey);
  },[onClose]);

  const [exportErr, setExportErr] = useState('');

  const doExport = async fmt => {
    if (busy) return;
    setBusy(true);
    setExportErr('');
    try {
      await exportCustomCard(act, state, fmt);
    } catch(e) {
      setExportErr('Export failed — please try again.');
    }
    setBusy(false);
  };

  const EDITOR_TABS = [
    { id:'bg',      label:'BG'       },
    { id:'fx',      label:'FX'       },
    { id:'layout',  label:'Elements' },
    { id:'presets', label:'Saved'    },
  ];

  return (
    <div style={{ position:'fixed', inset:0, zIndex:430, background:'#05080f', display:'flex', flexDirection:'column', overscrollBehavior:'contain' }}>

      {/* Header */}
      <div style={{ flexShrink:0, padding:'12px 18px 11px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
        <button onClick={onClose} className="tap" style={{ background:'none', border:'none', color:'rgba(255,255,255,.5)', fontSize:'.82rem', cursor:'pointer', fontFamily:'inherit', padding:'4px 8px 4px 0', letterSpacing:'.01em' }}>
          ‹ Back
        </button>
        <div style={{ fontWeight:700, fontSize:'.78rem', color:'rgba(255,255,255,.55)', letterSpacing:'.12em' }}>CUSTOM EDITOR</div>
        <button onClick={() => { setStateRaw(EDITOR_DEFAULTS); setSelected(null); }} className="tap"
          style={{ background:'none', border:'none', color:'rgba(255,255,255,.32)', fontSize:'.72rem', cursor:'pointer', fontFamily:'inherit', padding:'4px 0 4px 8px' }}>
          Reset
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex:1, overflowY:'auto', paddingBottom:78 }}>

        {/* Live preview */}
        <div style={{ display:'flex', justifyContent:'center', padding:'20px 0 18px', position:'relative' }}>
          <EditorPreview act={act} state={state} W={PREV_W} H={PREV_H}
            cardRef={cardRef} selected={selected}
            onSelect={setSelected} onDragStart={startDrag}/>
          {selected && (
            <div style={{ position:'absolute', bottom:4, left:'50%', transform:'translateX(-50%)',
              background:'rgba(59,130,246,.15)', border:'1px solid rgba(59,130,246,.25)',
              borderRadius:20, padding:'3px 12px', fontSize:'.62rem', color:'#93c5fd',
              letterSpacing:'.04em', pointerEvents:'none', whiteSpace:'nowrap' }}>
              Drag to move · tap elsewhere to deselect
            </div>
          )}
        </div>

        {/* Sticky tab bar */}
        <div style={{ position:'sticky', top:0, zIndex:5, background:'#05080f', display:'flex',
          borderTop:'1px solid rgba(255,255,255,.07)', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
          {EDITOR_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex:1, padding:'10px 2px', border:'none', background:'transparent', fontFamily:'inherit', cursor:'pointer',
              color: tab===t.id?'#f97316':'rgba(255,255,255,.35)',
              fontSize:'.64rem', fontWeight:tab===t.id?700:500, letterSpacing:'.08em', textTransform:'uppercase',
              borderBottom:tab===t.id?'2px solid #f97316':'2px solid transparent', transition:'color .15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={{ padding:'16px 18px 20px' }}>
          {tab === 'bg'     && <BgTab bg={state.bg} set={bg => setStateRaw(p => ({...p,bg}))}/>}
          {tab === 'fx'     && <FxTab fx={state.fx} set={fx => setStateRaw(p => ({...p,fx}))}/>}
          {tab === 'layout' && <ElementsTab
            elements={state.elements} style={state.style}
            setElements={setElements}
            setStyle={fn => setStateRaw(p => ({...p, style: typeof fn==='function'?fn(p.style):fn}))}
            selected={selected} onSelect={setSelected}/>}
          {tab === 'presets' && <PresetsTab currentState={state} onLoad={s => { setStateRaw(mergeEditorState(s)); setSelected(null); }}/>}
        </div>
      </div>

      {/* Fixed export bar */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0,
        padding:'11px 18px',
        paddingBottom:'max(22px, calc(env(safe-area-inset-bottom) + 10px))',
        background:'rgba(5,8,15,.96)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)',
        borderTop:'1px solid rgba(255,255,255,.07)' }}>
        {exportErr&&<div style={{fontSize:'.72rem',color:'#f87171',textAlign:'center',marginBottom:8,fontWeight:600}}>{exportErr}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <button className="btn b-or" style={{ padding:'13px', fontSize:'.84rem', borderRadius:14, fontWeight:700 }}
            onClick={() => doExport('jpg')} disabled={busy}>
            {busy ? <><span className="spinner" style={{borderTopColor:'#fff'}}/> Saving…</> : 'Save JPEG'}
          </button>
          <button className="btn b-gh" style={{ padding:'13px', fontSize:'.84rem', borderRadius:14 }}
            onClick={() => doExport('png')} disabled={busy}>{busy?'Saving…':'Save PNG'}</button>
        </div>
      </div>
    </div>
  );
}
