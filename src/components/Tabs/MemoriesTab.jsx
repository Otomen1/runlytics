import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getPhotos } from '../../db/indexedDB.js';
import { fmtKm, fmtPace, fmtDate } from '../../utils/formatters.js';
import { getMemories, getHighlights, getMonthsWithActivity, computeWrapped } from '../../utils/wrapped.js';
import { MonthlyWrapped } from '../Modals/MonthlyWrapped.jsx';

const MOODS_MAP = {
  great:  { emoji: '😀', label: 'Great' },
  good:   { emoji: '🙂', label: 'Good' },
  normal: { emoji: '😐', label: 'Normal' },
  tough:  { emoji: '😫', label: 'Tough' },
  strong: { emoji: '🔥', label: 'Strong' },
};

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

// Loads one thumbnail per activity lazily
function useThumb(actId, photoCount) {
  const [url, setUrl] = useState(null);
  const urlRef = useRef(null);
  useEffect(() => {
    if (!photoCount) return;
    let active = true;
    getPhotos(actId).then(photos => {
      if (!active || !photos[0]) return;
      const u = URL.createObjectURL(photos[0].thumbBlob);
      urlRef.current = u;
      setUrl(u);
    }).catch(() => {});
    return () => { active = false; if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } };
  }, [actId, photoCount]);
  return url;
}

function MemoryCard({ act, onSelect }) {
  const thumb = useThumb(act.id, act.photoCount);
  const mood = act.mood ? MOODS_MAP[act.mood] : null;
  return (
    <div className="card" onClick={() => onSelect(act)}
      style={{padding:'12px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginBottom:8}}>
      {thumb ? (
        <img src={thumb} alt="" style={{width:52,height:52,borderRadius:10,objectFit:'cover',flexShrink:0}} loading="lazy"/>
      ) : (
        <div style={{width:52,height:52,borderRadius:10,background:'var(--bd)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem'}}>
          {mood ? mood.emoji : '📓'}
        </div>
      )}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2}}>
          {mood && <span style={{fontSize:'.9rem'}}>{mood.emoji}</span>}
          <span style={{fontSize:'.86rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{act.name}</span>
        </div>
        <div style={{fontSize:'.68rem',color:'var(--tx2)',marginBottom:act.notes?3:0}}>{fmtDate(act.date)} · {fmtKm(act.distanceKm)} km</div>
        {act.notes && (
          <div style={{fontSize:'.74rem',color:'var(--tx3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontStyle:'italic'}}>
            "{act.notes.slice(0, 60)}{act.notes.length > 60 ? '…' : ''}"
          </div>
        )}
      </div>
      <div style={{fontSize:'1rem',color:'var(--tx3)',flexShrink:0}}>›</div>
    </div>
  );
}

function HighlightCard({ icon, label, act, onSelect }) {
  const thumb = useThumb(act.id, act.photoCount);
  return (
    <div className="card" onClick={() => onSelect(act)}
      style={{padding:'14px',cursor:'pointer',position:'relative',overflow:'hidden',flexShrink:0,width:160}}>
      {thumb && (
        <img src={thumb} alt="" loading="lazy"
          style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:.18,borderRadius:'inherit'}}/>
      )}
      <div style={{position:'relative'}}>
        <div style={{fontSize:'1.6rem',marginBottom:6}}>{icon}</div>
        <div style={{fontSize:'.62rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.06em',marginBottom:3}}>{label.toUpperCase()}</div>
        <div style={{fontSize:'.8rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{act.name}</div>
        <div style={{fontSize:'.68rem',color:'var(--tx2)',marginTop:2}}>{fmtKm(act.distanceKm)} km · {fmtDate(act.date)}</div>
      </div>
    </div>
  );
}

function MonthCard({ acts, ym, onOpen }) {
  const data = useMemo(() => computeWrapped(acts, ym), [acts, ym]);
  if (!data) return null;
  const mood = data.topMood ? MOODS_MAP[data.topMood] : null;
  const [mon, year] = (() => {
    const [y, m] = ym.split('-');
    const d = new Date(+y, +m - 1, 1);
    return [d.toLocaleString('default',{month:'short'}), y];
  })();
  return (
    <div className="card2" onClick={onOpen}
      style={{cursor:'pointer',padding:'18px 12px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,aspectRatio:'1',textAlign:'center'}}>
      <div style={{fontSize:'1.75rem',fontWeight:800,lineHeight:1,letterSpacing:'-.02em'}}>{mon}</div>
      <div style={{fontSize:'.65rem',color:'var(--tx3)',fontWeight:500,letterSpacing:'.04em',textTransform:'uppercase',marginTop:2}}>{year}</div>
      <div style={{width:24,height:1,background:'var(--bd)',margin:'2px 0'}}/>
      <div style={{fontSize:'.92rem',fontWeight:700,color:'var(--or)',lineHeight:1}}>{fmtKm(data.totalDistance)} <span style={{fontSize:'.6rem',fontWeight:500,color:'var(--tx3)'}}>km</span></div>
      <div style={{fontSize:'.68rem',color:'var(--tx2)'}}>{data.totalRuns} runs</div>
    </div>
  );
}

export function MemoriesTab({ acts, onSelectAct }) {
  const [wrappedMonth, setWrappedMonth] = useState(null);

  const memories = useMemo(() => getMemories(acts), [acts]);
  const highlights = useMemo(() => getHighlights(acts), [acts]);
  const months = useMemo(() => getMonthsWithActivity(acts).slice(0, 12), [acts]);

  if (!acts.length) return (
    <div style={{textAlign:'center',padding:'60px 20px',color:'var(--tx2)'}}>
      <div style={{fontSize:'3rem',marginBottom:12}}>📖</div>
      <div style={{fontWeight:700,fontSize:'1rem',marginBottom:8}}>Your running story starts here</div>
      <div style={{fontSize:'.82rem',lineHeight:1.6}}>Upload a GPX or sync Strava to begin building your memories.</div>
    </div>
  );

  return (
    <div style={{padding:'18px 16px 100px'}}>

      {/* Recent Memories */}
      {memories.length > 0 && (
        <section style={{marginBottom:28}}>
          <div style={{fontSize:'.62rem',fontWeight:700,color:'var(--tx2)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>📸 Recent Memories</div>
          {memories.map(a => <MemoryCard key={a.id} act={a} onSelect={onSelectAct}/>)}
        </section>
      )}

      {/* Highlights */}
      {highlights.length > 0 && (
        <section style={{marginBottom:28}}>
          <div style={{fontSize:'.62rem',fontWeight:700,color:'var(--tx2)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>✨ Highlights</div>
          <div style={{display:'flex',gap:10,overflowX:'auto',paddingBottom:4,scrollbarWidth:'none'}}>
            {highlights.map(h => <HighlightCard key={h.label} {...h} onSelect={onSelectAct}/>)}
          </div>
        </section>
      )}

      {/* Monthly Wrapped */}
      {months.length > 0 && (
        <section>
          <div style={{fontSize:'.62rem',fontWeight:700,color:'var(--tx2)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>🗓 Monthly Wrapped</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {months.map(ym => (
              <MonthCard key={ym} acts={acts} ym={ym} onOpen={() => setWrappedMonth(ym)}/>
            ))}
          </div>
        </section>
      )}

      {wrappedMonth && (
        <MonthlyWrapped
          acts={acts}
          yearMonth={wrappedMonth}
          onClose={() => setWrappedMonth(null)}
          onSelectAct={act => { setWrappedMonth(null); onSelectAct(act); }}
        />
      )}
    </div>
  );
}
