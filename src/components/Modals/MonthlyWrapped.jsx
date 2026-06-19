import React, { useState, useEffect, useRef } from 'react';
import { computeWrapped } from '../../utils/wrapped.js';
import { fmtKm, fmtPace, fmtDate, fmtDur } from '../../utils/formatters.js';
import { getPhotos } from '../../db/indexedDB.js';

const MOODS_MAP = {
  great:  { emoji: '😀', label: 'Great' },
  good:   { emoji: '🙂', label: 'Good' },
  normal: { emoji: '😐', label: 'Normal' },
  tough:  { emoji: '😫', label: 'Tough' },
  strong: { emoji: '🔥', label: 'Strong' },
};
const MOODS_ORDER = ['strong','great','good','normal','tough'];

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export function MonthlyWrapped({ acts, yearMonth, onClose, onSelectAct }) {
  const data = React.useMemo(() => computeWrapped(acts, yearMonth), [acts, yearMonth]);
  const [slide, setSlide] = useState(0);
  const [coverUrl, setCoverUrl] = useState(null);
  const urlRef = useRef(null);
  const touchStartX = useRef(null);

  // Previous-month km for comparison
  const prevMonthKm = React.useMemo(() => {
    const [y, m] = yearMonth.split('-').map(Number);
    const prev = m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`;
    return acts.filter(a => a.date?.startsWith(prev)).reduce((s,a) => s + (a.distanceKm||0), 0);
  }, [acts, yearMonth]);

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
      if (e.key === 'ArrowLeft')  setSlide(s => Math.max(s - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTouchStart = e => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = e => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) setSlide(s => Math.min(s + 1, slides.length - 1));
    else         setSlide(s => Math.max(s - 1, 0));
  };

  if (!data) return (
    <div style={{position:'fixed',inset:0,zIndex:260,background:'rgba(0,0,0,.5)',display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'var(--bg)',borderRadius:'20px 20px 0 0',height:'50vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12}}>
        <div style={{fontSize:'2rem'}}>📭</div>
        <div style={{color:'var(--tx2)'}}>No runs this month</div>
        <button className="btn b-gh" style={{marginTop:8}} onClick={onClose}>Close</button>
      </div>
    </div>
  );

  const mood = data.topMood ? MOODS_MAP[data.topMood] : null;
  const delta = data.totalDistance - prevMonthKm;
  const maxWeekKm = data.weeklyBreakdown.length ? Math.max(...data.weeklyBreakdown.map(w=>w.km)) : 0;

  const slides = [
    /* ── Slide 1: Hero Stats ─────────────────────────────────────── */
    <div key="overview" style={slideWrap}>
      <div style={{fontSize:'.68rem',fontWeight:700,color:'var(--or)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:2}}>{monthLabel(yearMonth)}</div>
      <div style={{fontSize:'.6rem',color:'var(--tx3)',marginBottom:16}}>Monthly Wrapped</div>

      {/* Hero distance */}
      <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:2}}>
        <span style={{fontSize:'4rem',fontWeight:900,color:'var(--tx)',lineHeight:1,letterSpacing:'-.02em'}}>{fmtKm(data.totalDistance)}</span>
        <span style={{fontSize:'1.2rem',fontWeight:700,color:'var(--or)'}}>km</span>
      </div>
      <div style={{fontSize:'.6rem',color:'var(--tx3)',marginBottom:18}}>total distance this month</div>

      {/* 3 stat pills */}
      <div style={{display:'flex',gap:8,width:'100%',marginBottom:18}}>
        {[
          {v: String(data.totalRuns),                l:'RUNS'},
          {v: fmtDur(data.totalTimeSec),             l:'TIME ON FEET'},
          {v: fmtKm(data.avgDistanceKm)+' km',       l:'AVG / RUN'},
        ].map(s=>(
          <div key={s.l} style={{flex:1,padding:'10px 6px',background:'var(--s2)',borderRadius:10,textAlign:'center',border:'1px solid var(--bd)'}}>
            <div style={{fontSize:'.96rem',fontWeight:800,color:'var(--tx)',marginBottom:3}}>{s.v}</div>
            <div style={{fontSize:'.52rem',color:'var(--tx3)',letterSpacing:'.05em'}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Week bars */}
      {data.weeklyBreakdown.length > 1 && (
        <div style={{width:'100%',marginBottom:16}}>
          <div style={{fontSize:'.58rem',color:'var(--tx3)',letterSpacing:'.07em',marginBottom:7}}>KM BY WEEK</div>
          <div style={{display:'flex',gap:6,alignItems:'flex-end',height:56}}>
            {data.weeklyBreakdown.map(w=>{
              const isBest = w.km === maxWeekKm;
              const barH = maxWeekKm > 0 ? Math.max(6, Math.round((w.km/maxWeekKm)*40)) : 6;
              return (
                <div key={w.week} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                  <div style={{fontSize:'.48rem',color:isBest?'var(--or)':'var(--tx3)',fontWeight:isBest?700:400}}>{Math.round(w.km)}</div>
                  <div style={{width:'100%',height:barH,background:isBest?'var(--or)':'var(--bd2)',borderRadius:4}}/>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Streak badge */}
      {data.streakDays > 1 && (
        <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(249,115,22,.1)',border:'1px solid rgba(249,115,22,.2)',borderRadius:20,padding:'5px 14px'}}>
          <span>🔥</span>
          <span style={{fontSize:'.74rem',color:'var(--or)',fontWeight:700}}>{data.streakDays}-day streak</span>
        </div>
      )}
    </div>,

    /* ── Slide 2: Best Runs ──────────────────────────────────────── */
    <div key="peaks" style={slideWrap}>
      <div style={{fontSize:'.68rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.1em',marginBottom:16}}>BEST RUNS</div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,width:'100%',marginBottom:10}}>
        {data.longestRun && (
          <button style={{...peakCard,borderColor:'rgba(59,130,246,.3)'}} onClick={()=>{onSelectAct(data.longestRun);onClose();}}>
            <div style={{fontSize:'.56rem',color:'#3b82f6',fontWeight:700,letterSpacing:'.06em',marginBottom:6}}>📏 LONGEST</div>
            <div style={{fontSize:'2rem',fontWeight:900,color:'#3b82f6',lineHeight:1,marginBottom:2}}>{fmtKm(data.longestRun.distanceKm)}</div>
            <div style={{fontSize:'.58rem',color:'#3b82f6',marginBottom:8}}>km</div>
            <div style={{fontSize:'.65rem',color:'var(--tx2)',lineHeight:1.3}}>{data.longestRun.name.slice(0,26)}</div>
            <div style={{fontSize:'.58rem',color:'var(--tx3)',marginTop:3}}>{fmtDate(data.longestRun.date)}</div>
          </button>
        )}
        {data.fastestRun && (
          <button style={{...peakCard,borderColor:'rgba(249,115,22,.3)'}} onClick={()=>{onSelectAct(data.fastestRun);onClose();}}>
            <div style={{fontSize:'.56rem',color:'var(--or)',fontWeight:700,letterSpacing:'.06em',marginBottom:6}}>⚡ FASTEST</div>
            <div style={{fontSize:'2rem',fontWeight:900,color:'var(--or)',lineHeight:1,marginBottom:2}}>{fmtPace(data.fastestRun.avgPaceSecKm)}</div>
            <div style={{fontSize:'.58rem',color:'var(--or)',marginBottom:8}}>/km</div>
            <div style={{fontSize:'.65rem',color:'var(--tx2)',lineHeight:1.3}}>{data.fastestRun.name.slice(0,26)}</div>
            <div style={{fontSize:'.58rem',color:'var(--tx3)',marginTop:3}}>{fmtDate(data.fastestRun.date)}</div>
          </button>
        )}
      </div>

      {data.biggestClimb && (
        <button style={{...peakCard,flexDirection:'row',gap:12,borderColor:'rgba(34,197,94,.3)',padding:'12px 16px',justifyContent:'flex-start'}}
          onClick={()=>{onSelectAct(data.biggestClimb);onClose();}}>
          <span style={{fontSize:'1.6rem',flexShrink:0}}>🏔</span>
          <div style={{textAlign:'left'}}>
            <div style={{fontSize:'.56rem',color:'#22c55e',fontWeight:700,letterSpacing:'.06em',marginBottom:3}}>BIGGEST CLIMB</div>
            <div style={{fontSize:'1.1rem',fontWeight:900,color:'#22c55e',lineHeight:1,marginBottom:3}}>{data.biggestClimb.elevGainM}m</div>
            <div style={{fontSize:'.65rem',color:'var(--tx2)'}}>{data.biggestClimb.name.slice(0,32)}</div>
          </div>
        </button>
      )}

      {!data.longestRun && !data.fastestRun && (
        <div style={{color:'var(--tx3)',fontSize:'.84rem',marginTop:20}}>No performance data this month</div>
      )}
    </div>,

    /* ── Slide 3: Vibe & Memory ──────────────────────────────────── */
    (mood || data.favoriteMemory) ? (
      <div key="vibe" style={slideWrap}>
        {mood && (
          <div style={{width:'100%',marginBottom:data.favoriteMemory?14:0}}>
            <div style={{textAlign:'center',marginBottom:8}}>
              <div style={{fontSize:'3.4rem',marginBottom:4,lineHeight:1}}>{mood.emoji}</div>
              <div style={{fontSize:'.62rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.1em',marginBottom:4}}>YOUR VIBE THIS MONTH</div>
              <div style={{fontSize:'1.8rem',fontWeight:900,marginBottom:10}}>{mood.label}</div>
            </div>

            {/* Mood breakdown bars */}
            {MOODS_ORDER.filter(m=>data.moodCounts[m]).length > 1 && (
              <div style={{width:'100%',marginBottom:4}}>
                {MOODS_ORDER.filter(m=>data.moodCounts[m]).map(m=>{
                  const info=MOODS_MAP[m];
                  const count=data.moodCounts[m]||0;
                  const pct=count/data.totalRuns;
                  return (
                    <div key={m} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
                      <span style={{width:18,textAlign:'center',fontSize:'.88rem',flexShrink:0}}>{info.emoji}</span>
                      <div style={{flex:1,height:5,background:'var(--bd)',borderRadius:3}}>
                        <div style={{width:`${Math.round(pct*100)}%`,height:'100%',background:'var(--or)',borderRadius:3}}/>
                      </div>
                      <span style={{fontSize:'.6rem',color:'var(--tx3)',width:14,textAlign:'right',flexShrink:0}}>{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {data.favoriteMemory && (
          <div style={{width:'100%',textAlign:'center'}}>
            <div style={{fontSize:'.62rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.1em',marginBottom:8}}>
              {mood ? 'FAVORITE MEMORY' : 'MEMORY OF THE MONTH'}
            </div>
            {coverUrl && (
              <img src={coverUrl} alt="" style={{width:'100%',maxHeight:120,objectFit:'cover',borderRadius:10,marginBottom:10}} />
            )}
            <div style={{fontSize:'.84rem',fontWeight:600,marginBottom:3}}>{data.favoriteMemory.name}</div>
            <div style={{fontSize:'.66rem',color:'var(--tx2)',marginBottom:6}}>{fmtDate(data.favoriteMemory.date)}</div>
            {data.favoriteMemory.notes && (
              <div style={{fontSize:'.74rem',fontStyle:'italic',color:'var(--tx2)',lineHeight:1.5,marginBottom:8}}>
                "{data.favoriteMemory.notes.slice(0,70)}{data.favoriteMemory.notes.length>70?'…':''}"
              </div>
            )}
            <button style={viewBtn} onClick={()=>{onSelectAct(data.favoriteMemory);onClose();}}>Open Memory →</button>
          </div>
        )}
      </div>
    ) : null,

    /* ── Slide 4: That's a Wrap ──────────────────────────────────── */
    <div key="recap" style={slideWrap}>
      <div style={{fontSize:'3rem',marginBottom:8,lineHeight:1}}>🎉</div>
      <div style={{fontSize:'1rem',fontWeight:700,color:'var(--or)',marginBottom:2}}>{monthLabel(yearMonth)}</div>
      <div style={{fontSize:'.62rem',color:'var(--tx3)',marginBottom:18}}>at a glance</div>

      <div style={{width:'100%',background:'var(--s2)',borderRadius:12,padding:'14px 16px',border:'1px solid var(--bd)',marginBottom:12}}>
        {[
          `🏃 ${data.totalRuns} run${data.totalRuns!==1?'s':''}`,
          `📏 ${fmtKm(data.totalDistance)} km covered`,
          `⏱ ${fmtDur(data.totalTimeSec)} on feet`,
          data.streakDays>1 ? `🔥 ${data.streakDays}-day best streak` : null,
          mood ? `${mood.emoji} mostly feeling ${mood.label.toLowerCase()}` : null,
        ].filter(Boolean).map(line=>(
          <div key={line} style={{fontSize:'.8rem',color:'var(--tx2)',lineHeight:2}}>{line}</div>
        ))}
      </div>

      {prevMonthKm > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',width:'100%',borderRadius:10,
          background:delta>=0?'rgba(34,197,94,.08)':'rgba(239,68,68,.07)',
          border:`1px solid ${delta>=0?'rgba(34,197,94,.2)':'rgba(239,68,68,.15)'}`}}>
          <span style={{fontSize:'1rem'}}>{delta>=0?'📈':'📉'}</span>
          <span style={{fontSize:'.78rem',fontWeight:700,color:delta>=0?'#22c55e':'#ef4444'}}>
            {delta>=0?'+':''}{fmtKm(Math.abs(delta))} km vs last month
          </span>
        </div>
      )}
    </div>,
  ].filter(Boolean);

  return (
    <div style={{position:'fixed',inset:0,zIndex:260,background:'rgba(0,0,0,.55)',display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'var(--bg)',borderRadius:'20px 20px 0 0',height:'82vh',display:'flex',flexDirection:'column'}}>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 20px',borderBottom:'1px solid var(--bd)',flexShrink:0}}>
        <button className="btn b-gh" style={{padding:'6px 12px',fontSize:'.8rem'}} onClick={onClose}>✕</button>
        <div style={{fontSize:'.8rem',fontWeight:700,color:'var(--tx2)'}}>Monthly Wrapped</div>
        <div style={{display:'flex',gap:5,alignItems:'center'}}>
          {slides.map((_,i) => (
            <div key={i} onClick={()=>setSlide(i)} style={{width:i===slide?20:6,height:6,borderRadius:3,background:i===slide?'var(--or)':'var(--bd)',cursor:'pointer',transition:'width .2s'}}/>
          ))}
        </div>
      </div>

      {/* Slide content with swipe + fade */}
      <div
        style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px 20px',overflowY:'auto'}}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div key={slide} style={{animation:'fadeUp .22s ease',width:'100%',display:'flex',justifyContent:'center'}}>
          {slides[slide]}
        </div>
      </div>

      {/* Navigation */}
      <div style={{display:'flex',gap:10,padding:'14px 20px',paddingBottom:'calc(14px + env(safe-area-inset-bottom))',borderTop:'1px solid var(--bd)',flexShrink:0}}>
        <button className="btn b-gh" style={{flex:1,padding:'13px',opacity:slide===0?0.35:1}} onClick={()=>setSlide(s=>Math.max(0,s-1))} disabled={slide===0}>← Back</button>
        {slide < slides.length - 1
          ? <button className="btn b-or" style={{flex:2,padding:'13px'}} onClick={()=>setSlide(s=>s+1)}>Next →</button>
          : <button className="btn b-or" style={{flex:2,padding:'13px'}} onClick={onClose}>Done ✓</button>
        }
      </div>
    </div>
    </div>
  );
}

const slideWrap = {display:'flex',flexDirection:'column',alignItems:'center',width:'100%',maxWidth:420};
const viewBtn   = {marginTop:10,background:'none',border:'1px solid var(--bd)',borderRadius:20,padding:'7px 18px',fontSize:'.78rem',color:'var(--or)',cursor:'pointer',fontFamily:'inherit'};
const peakCard  = {background:'var(--s2)',border:'1px solid',borderRadius:12,padding:'14px 12px',display:'flex',flexDirection:'column',alignItems:'center',cursor:'pointer',fontFamily:'inherit',textAlign:'center',width:'100%'};
