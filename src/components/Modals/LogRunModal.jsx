import React, { useState, useMemo } from 'react';
import { migrateActivity, classifyRun } from '../../utils/activity.js';
import { parseDurSec, fmtDur } from '../../utils/formatters.js';

const TYPES = ['Run','Walk','Hike','TrailRun','VirtualRun'];
const MOODS = [
  { key:'great',  label:'😄', title:'Great'  },
  { key:'good',   label:'🙂', title:'Good'   },
  { key:'normal', label:'😐', title:'Normal' },
  { key:'tough',  label:'😓', title:'Tough'  },
  { key:'strong', label:'💪', title:'Strong' },
];

export function LogRunModal({ onAdd, onClose, shoes = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName]         = useState('');
  const [date, setDate]         = useState(today);
  const [type, setType]         = useState('Run');
  const [distStr, setDistStr]   = useState('');
  const [durStr, setDurStr]     = useState('');
  const [hrStr, setHrStr]       = useState('');
  const [elevStr, setElevStr]   = useState('');
  const [mood, setMood]         = useState(null);
  const [shoeId, setShoeId]     = useState(null);
  const [error, setError]       = useState('');

  const activeShoes = useMemo(() => (shoes || []).filter(s => s.active !== false), [shoes]);

  const distKm = parseFloat(distStr) || 0;
  const movingTimeSec = parseDurSec(durStr);

  const pacePreview = useMemo(() => {
    if (distKm > 0 && movingTimeSec > 0)
      return fmtDur(Math.round(movingTimeSec / distKm)) + '/km';
    return null;
  }, [distKm, movingTimeSec]);

  function handleSave() {
    if (distKm <= 0) { setError('Distance is required'); return; }
    if (movingTimeSec <= 0) { setError('Duration is required'); return; }
    const avgHR = parseInt(hrStr, 10) || null;
    const elevGainM = parseInt(elevStr, 10) || 0;
    const avgPaceSecKm = distKm > 0 ? movingTimeSec / distKm : 0;
    const trainingLoad = movingTimeSec && avgHR
      ? Math.round((movingTimeSec / 60) * (avgHR / 100) * 1.5)
      : Math.round(distKm * 8);
    const dateTs = new Date(date + 'T12:00:00').getTime();
    const act = migrateActivity({
      id: 'm' + Date.now(),
      name: (name.trim() || 'Run').slice(0, 128),
      type,
      date,
      dateTs,
      distanceKm: parseFloat(distKm.toFixed(3)),
      movingTimeSec,
      avgPaceSecKm: parseFloat(avgPaceSecKm.toFixed(1)),
      avgHR: avgHR && avgHR > 30 && avgHR < 250 ? avgHR : null,
      maxHR: null,
      elevGainM,
      elevLossM: 0,
      runClass: classifyRun(distKm, avgPaceSecKm),
      hrSamples: [],
      route: [],
      source: 'manual',
      trainingLoad,
      mood: mood || null,
      shoeId: shoeId || null,
    });
    onAdd([act]);
    onClose();
  }

  const shell = {
    position:'fixed',inset:0,zIndex:280,background:'rgba(0,0,0,.55)',
    display:'flex',flexDirection:'column',justifyContent:'flex-end',
  };
  const sheet = {
    background:'var(--bg)',borderRadius:'20px 20px 0 0',
    maxHeight:'92vh',display:'flex',flexDirection:'column',overflow:'hidden',
  };
  const inp = { width:'100%',boxSizing:'border-box',padding:'10px 12px',borderRadius:10,border:'1px solid var(--bd)',background:'var(--bg2)',color:'var(--tx)',fontSize:'.9rem' };
  const label = { fontSize:'.75rem',color:'var(--tx2)',fontWeight:600,marginBottom:4,display:'block' };

  return (
    <div style={shell} role="presentation" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={sheet}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:'1px solid var(--bd)',flexShrink:0}}>
          <button className="btn b-gh" style={{padding:'6px 14px',fontSize:'.8rem'}} onClick={onClose}>✕</button>
          <span style={{fontWeight:700,fontSize:'.9rem'}}>Log a Run</span>
          <button className="btn b-or" style={{padding:'6px 14px',fontSize:'.8rem'}} onClick={handleSave}>Save</button>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:'auto',padding:'18px 20px 8px',display:'flex',flexDirection:'column',gap:14}}>
          {error && <div style={{color:'#ef4444',fontSize:'.8rem',fontWeight:600}}>{error}</div>}

          {/* Name */}
          <div>
            <label style={label}>Activity name</label>
            <input style={inp} type="text" placeholder="Morning Run" maxLength={128}
              value={name} onChange={e=>{setError('');setName(e.target.value);}} />
          </div>

          {/* Date + Type */}
          <div style={{display:'flex',gap:10}}>
            <div style={{flex:1}}>
              <label style={label}>Date</label>
              <input style={inp} type="date" value={date} max={today}
                onChange={e=>setDate(e.target.value)} />
            </div>
            <div style={{flex:1}}>
              <label style={label}>Type</label>
              <select style={inp} value={type} onChange={e=>setType(e.target.value)}>
                {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Distance + Duration */}
          <div style={{display:'flex',gap:10}}>
            <div style={{flex:1}}>
              <label style={label}>Distance (km)</label>
              <input style={inp} type="number" placeholder="5.0" min="0" step="0.1"
                value={distStr} onChange={e=>{setError('');setDistStr(e.target.value);}} />
            </div>
            <div style={{flex:1}}>
              <label style={label}>Duration (MM:SS or H:MM:SS)</label>
              <input style={inp} type="text" placeholder="30:00"
                value={durStr} onChange={e=>{setError('');setDurStr(e.target.value);}} />
            </div>
          </div>

          {pacePreview && (
            <div style={{fontSize:'.78rem',color:'var(--tx2)',marginTop:-8}}>
              Avg pace: <strong style={{color:'var(--or)'}}>{pacePreview}</strong>
            </div>
          )}

          {/* HR + Elevation */}
          <div style={{display:'flex',gap:10}}>
            <div style={{flex:1}}>
              <label style={label}>Avg HR (optional)</label>
              <input style={inp} type="number" placeholder="155" min="40" max="220"
                value={hrStr} onChange={e=>setHrStr(e.target.value)} />
            </div>
            <div style={{flex:1}}>
              <label style={label}>Elev gain m (optional)</label>
              <input style={inp} type="number" placeholder="80" min="0"
                value={elevStr} onChange={e=>setElevStr(e.target.value)} />
            </div>
          </div>

          {/* Mood */}
          <div>
            <label style={label}>How did it feel?</label>
            <div style={{display:'flex',gap:8}}>
              {MOODS.map(m=>(
                <button key={m.key} onClick={()=>setMood(mood===m.key?null:m.key)}
                  title={m.title}
                  aria-label={m.title}
                  aria-pressed={mood===m.key}
                  style={{flex:1,padding:'8px 0',borderRadius:10,border:'1px solid',fontSize:'1.3rem',cursor:'pointer',background:mood===m.key?'var(--or2)':'var(--bg2)',borderColor:mood===m.key?'var(--or)':'var(--bd)',color:'var(--tx)'}}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Shoes */}
          {activeShoes.length > 0 && (
            <div>
              <label style={label}>Shoes (optional)</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                <button onClick={()=>setShoeId(null)}
                  aria-pressed={!shoeId}
                  style={{padding:'5px 10px',borderRadius:20,border:'1px solid',fontSize:'.78rem',cursor:'pointer',background:!shoeId?'var(--or2)':'var(--bg2)',borderColor:!shoeId?'var(--or)':'var(--bd)',color:'var(--tx)'}}>
                  None
                </button>
                {activeShoes.map(s=>(
                  <button key={s.id} onClick={()=>setShoeId(s.id)}
                    aria-pressed={shoeId===s.id}
                    style={{padding:'5px 10px',borderRadius:20,border:'1px solid',fontSize:'.78rem',cursor:'pointer',background:shoeId===s.id?'var(--or2)':'var(--bg2)',borderColor:shoeId===s.id?'var(--or)':'var(--bd)',color:'var(--tx)'}}>
                    {s.brand} {s.model}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{height:16}}/>
        </div>
      </div>
    </div>
  );
}
