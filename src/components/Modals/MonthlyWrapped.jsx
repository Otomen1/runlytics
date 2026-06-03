import React, { useState, useEffect, useRef } from 'react';
import { computeWrapped } from '../../utils/wrapped.js';
import { fmtKm, fmtPace, fmtDate } from '../../utils/formatters.js';
import { getPhotos } from '../../db/indexedDB.js';

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

export function MonthlyWrapped({ acts, yearMonth, onClose, onSelectAct }) {
  const data = React.useMemo(() => computeWrapped(acts, yearMonth), [acts, yearMonth]);
  const [slide, setSlide] = useState(0);
  const [coverUrl, setCoverUrl] = useState(null);
  const urlRef = useRef(null);

  useEffect(() => {
    if (!data?.favoriteMemory?.photoCount) return;
    let active = true;
    getPhotos(data.favoriteMemory.id).then(photos => {
      if (!active || !photos[0]) return;
      const url = URL.createObjectURL(photos[0].thumbBlob);
      urlRef.current = url;
      setCoverUrl(url);
    }).catch(() => {});
    return () => { active = false; if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } };
  }, [data?.favoriteMemory?.id]);

  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setSlide(s => Math.min(s + 1, slides.length - 1));
      if (e.key === 'ArrowLeft') setSlide(s => Math.max(s - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!data) return (
    <div style={{position:'fixed',inset:0,zIndex:260,background:'rgba(0,0,0,.5)',display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'var(--bg)',borderRadius:'20px 20px 0 0',height:'55vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12}}>
        <div style={{fontSize:'2rem'}}>📭</div>
        <div style={{color:'var(--tx2)'}}>No runs this month</div>
        <button className="btn b-gh" style={{marginTop:8}} onClick={onClose}>Close</button>
      </div>
    </div>
  );

  const mood = data.topMood ? MOODS_MAP[data.topMood] : null;
  const moodCount = data.topMood ? (data.moodCounts[data.topMood] || 0) : 0;

  const slides = [
    // Slide 1 — Overview
    <div key="overview" style={slideWrap}>
      <div style={{fontSize:'2.4rem',marginBottom:12}}>📅</div>
      <div style={{fontSize:'1rem',fontWeight:700,color:'var(--or)',marginBottom:4}}>{monthLabel(yearMonth)}</div>
      <div style={{fontSize:'.76rem',color:'var(--tx3)',marginBottom:28}}>Monthly Wrapped</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,width:'100%'}}>
        {[
          { l: 'Distance', v: fmtKm(data.totalDistance) + ' km' },
          { l: 'Runs', v: String(data.totalRuns) },
          { l: 'Memories', v: String(data.memoryCount) },
          { l: 'Best Streak', v: data.streakDays + ' days' },
        ].map(s => (
          <div key={s.l} className="card2" style={{padding:'14px 10px',textAlign:'center'}}>
            <div style={{fontSize:'1.3rem',fontWeight:700,color:'var(--or)',marginBottom:4}}>{s.v}</div>
            <div style={{fontSize:'.62rem',color:'var(--tx3)',letterSpacing:'.04em'}}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>,

    // Slide 2 — Longest run
    data.longestRun ? (
      <div key="longest" style={slideWrap}>
        <div style={{fontSize:'2.4rem',marginBottom:12}}>🏃</div>
        <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.08em',marginBottom:6}}>LONGEST RUN</div>
        <div style={{fontSize:'2.6rem',fontWeight:800,color:'var(--or)',lineHeight:1,marginBottom:6}}>{fmtKm(data.longestRun.distanceKm)} km</div>
        <div style={{fontSize:'.88rem',fontWeight:600,marginBottom:4,textAlign:'center'}}>{data.longestRun.name}</div>
        <div style={{fontSize:'.72rem',color:'var(--tx2)'}}>{fmtDate(data.longestRun.date)}</div>
        {data.longestRun.mood && MOODS_MAP[data.longestRun.mood] && (
          <div style={{marginTop:16,fontSize:'1.4rem'}}>{MOODS_MAP[data.longestRun.mood].emoji}</div>
        )}
        <button style={viewBtn} onClick={() => { onSelectAct(data.longestRun); onClose(); }}>View Run →</button>
      </div>
    ) : null,

    // Slide 3 — Fastest run
    data.fastestRun ? (
      <div key="fastest" style={slideWrap}>
        <div style={{fontSize:'2.4rem',marginBottom:12}}>⚡</div>
        <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.08em',marginBottom:6}}>FASTEST PACE</div>
        <div style={{fontSize:'2.6rem',fontWeight:800,color:'var(--or)',lineHeight:1,marginBottom:6}}>{fmtPace(data.fastestRun.avgPaceSecKm)}<span style={{fontSize:'1rem',fontWeight:400}}>/km</span></div>
        <div style={{fontSize:'.88rem',fontWeight:600,marginBottom:4,textAlign:'center'}}>{data.fastestRun.name}</div>
        <div style={{fontSize:'.72rem',color:'var(--tx2)'}}>{fmtDate(data.fastestRun.date)}</div>
        <button style={viewBtn} onClick={() => { onSelectAct(data.fastestRun); onClose(); }}>View Run →</button>
      </div>
    ) : null,

    // Slide 4 — Top mood
    mood ? (
      <div key="mood" style={slideWrap}>
        <div style={{fontSize:'3.5rem',marginBottom:12}}>{mood.emoji}</div>
        <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.08em',marginBottom:6}}>TOP MOOD</div>
        <div style={{fontSize:'2rem',fontWeight:800,marginBottom:6}}>{mood.label}</div>
        <div style={{fontSize:'.82rem',color:'var(--tx2)'}}>Logged {moodCount} time{moodCount !== 1 ? 's' : ''} this month</div>
      </div>
    ) : null,

    // Slide 5 — Favorite memory
    data.favoriteMemory ? (
      <div key="memory" style={slideWrap}>
        <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.08em',marginBottom:10}}>FAVORITE MEMORY</div>
        {coverUrl ? (
          <img src={coverUrl} alt="" style={{width:'100%',maxHeight:160,objectFit:'cover',borderRadius:12,marginBottom:12}} />
        ) : (
          <div style={{width:'100%',height:100,background:'var(--bd)',borderRadius:12,marginBottom:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2rem'}}>
            {data.favoriteMemory.mood ? MOODS_MAP[data.favoriteMemory.mood]?.emoji : '📓'}
          </div>
        )}
        <div style={{fontSize:'.88rem',fontWeight:600,marginBottom:4,textAlign:'center'}}>{data.favoriteMemory.name}</div>
        <div style={{fontSize:'.72rem',color:'var(--tx2)',marginBottom:8}}>{fmtDate(data.favoriteMemory.date)}</div>
        {data.favoriteMemory.notes && (
          <div style={{fontSize:'.78rem',fontStyle:'italic',color:'var(--tx2)',lineHeight:1.5,textAlign:'center'}}>
            "{data.favoriteMemory.notes.slice(0, 80)}{data.favoriteMemory.notes.length > 80 ? '…' : ''}"
          </div>
        )}
        <button style={viewBtn} onClick={() => { onSelectAct(data.favoriteMemory); onClose(); }}>Open Memory →</button>
      </div>
    ) : null,

    // Slide 6 — Recap
    <div key="recap" style={slideWrap}>
      <div style={{fontSize:'2.4rem',marginBottom:12}}>🎉</div>
      <div style={{fontSize:'1rem',fontWeight:700,color:'var(--or)',marginBottom:16}}>{monthLabel(yearMonth)}</div>
      <div style={{fontSize:'.88rem',color:'var(--tx2)',lineHeight:1.7,textAlign:'center',maxWidth:260}}>
        {data.totalRuns} run{data.totalRuns !== 1 ? 's' : ''} · {fmtKm(data.totalDistance)} km covered
        {data.memoryCount > 0 && ` · ${data.memoryCount} memor${data.memoryCount !== 1 ? 'ies' : 'y'} saved`}
        {data.streakDays > 1 && ` · ${data.streakDays}-day streak`}
      </div>
      {mood && <div style={{fontSize:'2rem',marginTop:16}}>{mood.emoji}</div>}
    </div>,
  ].filter(Boolean);

  return (
    <div style={{position:'fixed',inset:0,zIndex:260,background:'rgba(0,0,0,.5)',display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'var(--bg)',borderRadius:'20px 20px 0 0',height:'55vh',display:'flex',flexDirection:'column'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:'1px solid var(--bd)',flexShrink:0}}>
        <button className="btn b-gh" style={{padding:'6px 12px',fontSize:'.8rem'}} onClick={onClose}>✕ Close</button>
        <div style={{fontSize:'.82rem',fontWeight:700,color:'var(--or)'}}>{monthLabel(yearMonth)}</div>
        <div style={{display:'flex',gap:5,alignItems:'center'}}>
          {slides.map((_, i) => (
            <div key={i} onClick={() => setSlide(i)} style={{width:i===slide?18:6,height:6,borderRadius:3,background:i===slide?'var(--or)':'var(--bd)',cursor:'pointer',transition:'width .2s'}}/>
          ))}
        </div>
      </div>

      {/* Slide content */}
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px 20px',overflowY:'auto'}}>
        {slides[slide]}
      </div>

      {/* Navigation */}
      <div style={{display:'flex',gap:10,padding:'16px 20px',paddingBottom:'calc(16px + env(safe-area-inset-bottom))',borderTop:'1px solid var(--bd)',flexShrink:0}}>
        <button className="btn b-gh" style={{flex:1,padding:'13px'}} onClick={() => setSlide(s => Math.max(0, s-1))} disabled={slide===0}>← Back</button>
        {slide < slides.length - 1
          ? <button className="btn b-or" style={{flex:2,padding:'13px'}} onClick={() => setSlide(s => s+1)}>Next →</button>
          : <button className="btn b-or" style={{flex:2,padding:'13px'}} onClick={onClose}>Done ✓</button>
        }
      </div>
    </div>
    </div>
  );
}

const slideWrap = {display:'flex',flexDirection:'column',alignItems:'center',width:'100%',maxWidth:400};
const viewBtn = {marginTop:16,background:'none',border:'1px solid var(--bd)',borderRadius:20,padding:'7px 18px',fontSize:'.78rem',color:'var(--or)',cursor:'pointer',fontFamily:'inherit'};
