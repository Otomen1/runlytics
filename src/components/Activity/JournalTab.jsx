import React, { useState, useEffect, useRef, useMemo } from 'react';
import { addPhoto, getPhotos, deletePhoto } from '../../db/indexedDB.js';
import { SHOES_KEY } from '../../constants/keys.js';
import { lsGetV } from '../../utils/storage.js';
import { classifyRun } from '../../utils/activity.js';
import { parseDurSec, fmtDur } from '../../utils/formatters.js';

const MOODS = [
  { key: 'great',  emoji: '😀', label: 'Great'  },
  { key: 'good',   emoji: '🙂', label: 'Good'   },
  { key: 'normal', emoji: '😐', label: 'Normal' },
  { key: 'tough',  emoji: '😫', label: 'Tough'  },
  { key: 'strong', emoji: '🔥', label: 'Strong' },
];

async function makeThumbnail(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW = 320, scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(resolve, 'image/jpeg', 0.72);
    };
    img.src = url;
  });
}

function parseGoalTime(str) {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return null;
}

function fmtGoalTime(sec) {
  if (!sec) return '';
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

const ACTIVITY_TYPES = ['Run','Walk','Hike','TrailRun','VirtualRun'];
const RUN_CLASSES = ['easy','long','workout'];


export function JournalTab({ act, onPatch }) {
  const [photos, setPhotos] = useState([]);
  const [thumbUrls, setThumbUrls] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [goalInput, setGoalInput] = useState(() => fmtGoalTime(act.raceGoalSec));
  const [nameInput, setNameInput] = useState(act.name || '');
  const [distInput, setDistInput] = useState(() => act.source==='manual'?(act.distanceKm||'').toString():'');
  const [durInput, setDurInput]   = useState(() => act.source==='manual'&&act.movingTimeSec?fmtDur(act.movingTimeSec):'');
  const fileInputRef   = useRef(null);
  const debounceRef    = useRef(null);
  const pendingNotes   = useRef(null);
  const nameDebRef     = useRef(null);
  const onPatchRef     = useRef(onPatch);
  useEffect(() => { onPatchRef.current = onPatch; }, [onPatch]);

  const shoes = useMemo(() => lsGetV(SHOES_KEY, []), []);
  const activeShoes = shoes.filter(s => s.active !== false);

  useEffect(() => {
    getPhotos(act.id).then(setPhotos).catch(console.error);
  }, [act.id]);

  useEffect(() => {
    const urls = photos.map(p => URL.createObjectURL(p.thumbBlob));
    setThumbUrls(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [photos]);

  useEffect(() => {
    return () => { if (lightboxUrl) URL.revokeObjectURL(lightboxUrl); };
  }, [lightboxUrl]);

  useEffect(() => () => {
    if (debounceRef.current && pendingNotes.current !== null) {
      clearTimeout(debounceRef.current);
      onPatchRef.current({ notes: pendingNotes.current });
    }
  }, []);

  const handleNotes = e => {
    const notes = e.target.value;
    pendingNotes.current = notes;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onPatch({ notes });
      pendingNotes.current = null;
    }, 600);
  };

  const handleGoalBlur = () => {
    const sec = parseGoalTime(goalInput);
    onPatch({ raceGoalSec: sec });
  };

  const handleNameChange = e => {
    const name = e.target.value;
    setNameInput(name);
    if (nameDebRef.current) clearTimeout(nameDebRef.current);
    nameDebRef.current = setTimeout(() => onPatch({ name: name.slice(0,128) }), 600);
  };

  const handleManualDistDur = () => {
    const distKm = parseFloat(distInput) || 0;
    const movingTimeSec = parseDurSec(durInput);
    if (distKm <= 0 || movingTimeSec <= 0) return;
    const avgPaceSecKm = parseFloat((movingTimeSec / distKm).toFixed(1));
    const trainingLoad = act.avgHR
      ? Math.round((movingTimeSec/60)*(act.avgHR/100)*1.5)
      : Math.round(distKm*8);
    onPatch({ distanceKm: parseFloat(distKm.toFixed(3)), movingTimeSec, avgPaceSecKm, trainingLoad,
              runClass: classifyRun(distKm, avgPaceSecKm) });
  };

  const handleFileSelect = async e => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';
    for (const file of files) {
      try {
        const thumb = await makeThumbnail(file);
        await addPhoto(act.id, file, thumb, file.type);
      } catch (err) { console.error('[Journal] addPhoto failed', err); }
    }
    const updated = await getPhotos(act.id);
    setPhotos(updated);
    onPatch({ photoCount: updated.length });
  };

  const handleDelete = async photo => {
    await deletePhoto(photo.id);
    const updated = await getPhotos(act.id);
    setPhotos(updated);
    onPatch({ photoCount: updated.length });
  };

  const openLightbox = photo => {
    const url = URL.createObjectURL(photo.blob);
    setLightboxUrl(url); setLightbox(photo.id);
  };

  const closeLightbox = () => {
    if (lightboxUrl) URL.revokeObjectURL(lightboxUrl);
    setLightboxUrl(null); setLightbox(null);
  };

  const pill = (active, color='var(--or)') => ({
    padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    fontSize: '.76rem', fontWeight: active ? 700 : 400,
    background: active ? color+'22' : 'var(--s2)',
    color: active ? color : 'var(--tx2)',
    outline: active ? `1.5px solid ${color}` : '1.5px solid transparent',
    transition: 'all .12s',
  });

  const inpStyle = { width:'100%', boxSizing:'border-box', padding:'9px 11px', borderRadius:9, border:'1px solid var(--bd)', background:'var(--bg)', color:'var(--tx)', fontFamily:'inherit', fontSize:'.85rem', outline:'none' };
  const secHdr = { fontSize:'.72rem', fontWeight:700, color:'var(--tx2)', marginBottom:8, letterSpacing:'.05em', textTransform:'uppercase' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Activity details edit */}
      <div className="card" style={{ padding: 14 }}>
        <div style={secHdr}>Activity</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* Name */}
          <input style={inpStyle} type="text" placeholder="Activity name" maxLength={128}
            value={nameInput} onChange={handleNameChange} aria-label="Activity name" />
          {/* Type */}
          <select style={inpStyle} value={act.type||'Run'} onChange={e=>onPatch({type:e.target.value})}
            aria-label="Activity type">
            {ACTIVITY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          {/* Run class */}
          <div>
            <div style={{fontSize:'.7rem',color:'var(--tx3)',marginBottom:6}}>Run type</div>
            <div style={{display:'flex',gap:6}}>
              {RUN_CLASSES.map(rc=>(
                <button key={rc} onClick={()=>onPatch({runClass:rc})} aria-pressed={act.runClass===rc}
                  style={{...pill(act.runClass===rc),flex:1,textTransform:'capitalize'}}>
                  {rc}
                </button>
              ))}
              <button onClick={()=>onPatch({runClass:classifyRun(act.distanceKm,act.avgPaceSecKm)})}
                aria-pressed={false}
                style={{...pill(false,'var(--tx3)'),flex:1}}>auto</button>
            </div>
          </div>
          {/* Distance + Duration (manual runs only) */}
          {act.source==='manual'&&(
            <div style={{display:'flex',gap:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:'.7rem',color:'var(--tx3)',marginBottom:4}}>Distance (km)</div>
                <input style={inpStyle} type="number" min="0" step="0.1"
                  value={distInput} onChange={e=>setDistInput(e.target.value)}
                  onBlur={handleManualDistDur} aria-label="Distance in km" />
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'.7rem',color:'var(--tx3)',marginBottom:4}}>Duration</div>
                <input style={inpStyle} type="text" placeholder="MM:SS"
                  value={durInput} onChange={e=>setDurInput(e.target.value)}
                  onBlur={handleManualDistDur} aria-label="Duration" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mood */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--tx2)', marginBottom: 10, letterSpacing: '.05em', textTransform: 'uppercase' }}>How did it feel?</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          {MOODS.map(m => (
            <button key={m.key} onClick={() => onPatch({ mood: m.key })}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px',
                border: act.mood === m.key ? '2px solid var(--or)' : '2px solid var(--bd)',
                borderRadius: 10, background: 'transparent', cursor: 'pointer',
                transform: act.mood === m.key ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform .15s, border-color .15s' }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{m.emoji}</span>
              <span style={{ fontSize: '.6rem', color: act.mood === m.key ? 'var(--or)' : 'var(--tx2)', fontWeight: act.mood === m.key ? 700 : 400 }}>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--tx2)', marginBottom: 8, letterSpacing: '.05em', textTransform: 'uppercase' }}>Notes</div>
        <textarea defaultValue={act.notes || ''} onChange={handleNotes} placeholder="How did this run feel?" rows={4}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--tx)',
            border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 12px',
            fontFamily: 'inherit', fontSize: '.85rem', lineHeight: 1.5, resize: 'vertical', outline: 'none' }}/>
      </div>

      {/* Shoes */}
      {activeShoes.length > 0 && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--tx2)', marginBottom: 10, letterSpacing: '.05em', textTransform: 'uppercase' }}>Shoes</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button onClick={() => onPatch({ shoeId: null })} style={pill(!act.shoeId, 'var(--tx2)')}>None</button>
            {activeShoes.map(s => (
              <button key={s.id} onClick={() => onPatch({ shoeId: s.id })}
                style={pill(act.shoeId === s.id, s.color || 'var(--or)')}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Race */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: act.isRace ? 12 : 0 }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--tx2)', letterSpacing: '.05em', textTransform: 'uppercase' }}>🏁 Race</div>
          <button onClick={() => onPatch({ isRace: !act.isRace })}
            style={{ width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', background: act.isRace ? 'var(--or)' : 'var(--bd2)', transition: 'background .2s' }}>
            <div style={{ position: 'absolute', top: 3, left: act.isRace ? 18 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }}/>
          </button>
        </div>
        {act.isRace && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="inp" placeholder="Race / location name" defaultValue={act.raceLocation || ''}
              onChange={e => onPatch({ raceLocation: e.target.value })} style={{ marginBottom: 0 }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="inp" placeholder="Goal time  e.g. 1:45:00" value={goalInput}
                onChange={e => setGoalInput(e.target.value)} onBlur={handleGoalBlur}
                style={{ marginBottom: 0, flex: 1 }}/>
              {act.raceGoalSec && <span style={{ fontSize: '.72rem', color: 'var(--gn)', flexShrink: 0 }}>✓ saved</span>}
            </div>
          </div>
        )}
      </div>

      {/* Photos */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--tx2)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Photos</div>
          <button className="btn b-gh" style={{ padding: '6px 12px', fontSize: '.78rem' }} onClick={() => fileInputRef.current?.click()}>+ Add</button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileSelect}/>
        </div>
        {photos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--tx2)', fontSize: '.82rem' }}>No photos yet</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {photos.map((photo, i) => (
              <div key={photo.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: 'var(--bd)' }}>
                <img src={thumbUrls[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }} onClick={() => openLightbox(photo)}/>
                <button onClick={() => handleDelete(photo)}
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  aria-label="Delete photo">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox !== null && lightboxUrl && (
        <div onClick={closeLightbox} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={closeLightbox} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          <img src={lightboxUrl} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}/>
        </div>
      )}
    </div>
  );
}
