import React, { useState, useMemo, useEffect, useRef } from 'react';
import { fmtKm, fmtDur, fmtPace, fmtDateS, monthOf } from '../../utils/formatters.js';
import { getPhotos } from '../../db/indexedDB.js';

const MOODS_ORDER = ['strong','great','good','normal','tough'];
const MOODS_MAP = {
  great:  { emoji: '😀', label: 'Great',  color: '#22c55e' },
  good:   { emoji: '🙂', label: 'Good',   color: '#3b82f6' },
  normal: { emoji: '😐', label: 'Normal', color: '#6b7280' },
  tough:  { emoji: '😫', label: 'Tough',  color: '#eab308' },
  strong: { emoji: '🔥', label: 'Strong', color: '#f97316' },
};

// Compute all wrapped data for a given month's activities
function computeWrapped(acts) {
  if (!acts.length) return null;

  const totalKm   = acts.reduce((s, a) => s + a.distanceKm, 0);
  const totalSec  = acts.reduce((s, a) => s + a.movingTimeSec, 0);
  const totalElev = acts.reduce((s, a) => s + (a.elevGainM || 0), 0);

  // Streak within this month
  const runDays = new Set(acts.map(a => a.date));
  const sortedDays = [...runDays].sort();
  let streak = 1, maxStreak = 1, cur = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i-1]), curr = new Date(sortedDays[i]);
    const diff = (curr - prev) / 86400000;
    cur = diff === 1 ? cur + 1 : 1;
    if (cur > maxStreak) maxStreak = cur;
  }

  const longest  = [...acts].sort((a, b) => b.distanceKm - a.distanceKm)[0];
  const bestPace = acts.filter(a => a.avgPaceSecKm > 0).sort((a, b) => a.avgPaceSecKm - b.avgPaceSecKm)[0];

  // Mood breakdown
  const moodCounts = {};
  acts.forEach(a => { if (a.mood) moodCounts[a.mood] = (moodCounts[a.mood] || 0) + 1; });
  const topMood = MOODS_ORDER.find(m => moodCounts[m]) || null;

  // Best memory: prefer acts with photo, then longest note
  const withPhoto = acts.filter(a => a.photoCount > 0);
  const withNote  = acts.filter(a => a.notes);
  const memory = withPhoto[0] || withNote.sort((a, b) => b.notes.length - a.notes.length)[0] || null;

  return { totalKm, totalSec, totalElev, runCount: acts.length, maxStreak, longest, bestPace, moodCounts, topMood, memory, runDays };
}

export function MonthlyReport({ acts, onClose }) {
  // Build month list
  const months = useMemo(() => {
    const map = {};
    acts.forEach(a => {
      const m = monthOf(a.dateTs || new Date(a.date).getTime());
      if (!map[m]) map[m] = [];
      map[m].push(a);
    });
    return Object.entries(map).sort(([a],[b]) => b > a ? 1 : -1).map(([m, list]) => ({ key: m, acts: list }));
  }, [acts]);

  const [selIdx, setSelIdx] = useState(0);
  const selected = months[selIdx] || null;
  const wrapped  = useMemo(() => selected ? computeWrapped(selected.acts) : null, [selected]);

  // Load cover photo for memory act
  const [memPhotoUrl, setMemPhotoUrl] = useState(null);
  const memUrlRef = useRef(null);
  useEffect(() => {
    if (memUrlRef.current) { URL.revokeObjectURL(memUrlRef.current); memUrlRef.current = null; }
    setMemPhotoUrl(null);
    if (!wrapped?.memory?.photoCount) return;
    let active = true;
    getPhotos(wrapped.memory.id).then(photos => {
      if (!active || !photos[0]) return;
      const url = URL.createObjectURL(photos[0].blob);
      memUrlRef.current = url;
      setMemPhotoUrl(url);
    }).catch(() => {});
    return () => { active = false; if (memUrlRef.current) { URL.revokeObjectURL(memUrlRef.current); memUrlRef.current = null; } };
  }, [wrapped?.memory?.id]);

  // Format month label: "2026-05" → "May 2026"
  const fmtMonth = key => {
    const [y, m] = key.split('-');
    return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (!months.length) return (
    <div style={shell}>
      <Header onClose={onClose} title="Monthly Wrapped"/>
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,color:'var(--tx2)'}}>
        <div style={{fontSize:'2.8rem'}}>📅</div>
        <div style={{fontWeight:700,color:'var(--tx)'}}>No runs logged yet</div>
        <div style={{fontSize:'.8rem'}}>Upload runs to see your monthly summary.</div>
      </div>
    </div>
  );

  return (
    <div style={shell}>
      <Header onClose={onClose} title="Monthly Wrapped"/>

      {/* Month selector */}
      <div style={{padding:'0 18px 14px',borderBottom:'1px solid var(--bd)',display:'flex',gap:8,overflowX:'auto',scrollbarWidth:'none'}}>
        {months.map((m, i) => (
          <button key={m.key} onClick={() => setSelIdx(i)}
            style={{flexShrink:0,padding:'6px 14px',borderRadius:20,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:'.78rem',fontWeight:600,
              background: i===selIdx ? 'var(--or)' : 'var(--bg2,rgba(255,255,255,.07))',
              color: i===selIdx ? '#fff' : 'var(--tx2)',
              transition:'background .15s,color .15s'}}>
            {fmtMonth(m.key)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:'auto',padding:'18px 18px 40px',display:'flex',flexDirection:'column',gap:12}}>
        {wrapped ? <>

          {/* ── HERO ── */}
          <div style={{background:'linear-gradient(135deg,#0f0c29,#1a0835)',borderRadius:16,padding:'28px 22px',textAlign:'center',border:'1px solid rgba(249,115,22,.18)'}}>
            <div style={{fontSize:'.72rem',fontWeight:700,color:'#f97316',letterSpacing:'.18em',marginBottom:8}}>{fmtMonth(selected.key).toUpperCase()}</div>
            <div style={{fontSize:'3.2rem',fontWeight:900,color:'#fff',lineHeight:1,letterSpacing:'-.04em',marginBottom:4}}>
              {fmtKm(wrapped.totalKm)}
            </div>
            <div style={{fontSize:'.82rem',color:'rgba(255,255,255,.5)',letterSpacing:'.12em',marginBottom:16}}>KILOMETRES</div>
            <div style={{display:'flex',justifyContent:'center',gap:24}}>
              {[['Runs', wrapped.runCount],['Time', fmtDur(wrapped.totalSec)],['Elev', Math.round(wrapped.totalElev)+'m']].map(([l,v]) => (
                <div key={l} style={{textAlign:'center'}}>
                  <div style={{fontSize:'1.1rem',fontWeight:700,color:'#fff'}}>{v}</div>
                  <div style={{fontSize:'.6rem',color:'rgba(255,255,255,.35)',letterSpacing:'.1em',marginTop:2}}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>
            {wrapped.maxStreak >= 3 && (
              <div style={{marginTop:16,display:'inline-flex',alignItems:'center',gap:6,padding:'5px 14px',borderRadius:20,background:'rgba(249,115,22,.12)',border:'1px solid rgba(249,115,22,.2)'}}>
                <span>🔥</span>
                <span style={{fontSize:'.75rem',color:'#f97316',fontWeight:600}}>{wrapped.maxStreak}-day streak</span>
              </div>
            )}
          </div>

          {/* ── LONGEST RUN ── */}
          {wrapped.longest && (
            <Slide icon="📍" title="Longest Run" accent="#f97316">
              <div style={{fontSize:'2.2rem',fontWeight:900,color:'#fff',letterSpacing:'-.03em',lineHeight:1}}>{fmtKm(wrapped.longest.distanceKm)} km</div>
              <div style={{fontSize:'.78rem',color:'var(--tx2)',marginTop:6}}>{wrapped.longest.name} · {fmtDateS(wrapped.longest.date)}</div>
              {wrapped.longest.avgPaceSecKm > 0 && (
                <div style={{marginTop:8,fontSize:'.78rem',color:'var(--tx2)'}}>{fmtPace(wrapped.longest.avgPaceSecKm)}/km · {fmtDur(wrapped.longest.movingTimeSec)}</div>
              )}
            </Slide>
          )}

          {/* ── BEST PACE ── */}
          {wrapped.bestPace && (
            <Slide icon="⚡" title="Best Pace" accent="#eab308">
              <div style={{fontSize:'2.2rem',fontWeight:900,color:'#fff',letterSpacing:'-.03em',lineHeight:1}}>{fmtPace(wrapped.bestPace.avgPaceSecKm)}/km</div>
              <div style={{fontSize:'.78rem',color:'var(--tx2)',marginTop:6}}>{wrapped.bestPace.name} · {fmtDateS(wrapped.bestPace.date)}</div>
              {wrapped.bestPace.distanceKm > 0 && (
                <div style={{marginTop:4,fontSize:'.78rem',color:'var(--tx2)'}}>{fmtKm(wrapped.bestPace.distanceKm)} km</div>
              )}
            </Slide>
          )}

          {/* ── MOOD BREAKDOWN ── */}
          {Object.keys(wrapped.moodCounts).length > 0 && (
            <Slide icon="💭" title="Month in Mood">
              {MOODS_ORDER.filter(m => wrapped.moodCounts[m]).map(m => {
                const mood = MOODS_MAP[m];
                const count = wrapped.moodCounts[m];
                const pct = Math.round(count / wrapped.runCount * 100);
                return (
                  <div key={m} style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:'.82rem'}}>{mood.emoji} {mood.label}</span>
                      <span style={{fontSize:'.78rem',color:'var(--tx2)'}}>{count} run{count>1?'s':''}</span>
                    </div>
                    <div style={{height:6,borderRadius:3,background:'var(--bd)',overflow:'hidden'}}>
                      <div style={{height:'100%',borderRadius:3,background:mood.color,width:pct+'%',transition:'width .4s ease'}}/>
                    </div>
                  </div>
                );
              })}
              {wrapped.topMood && (
                <div style={{marginTop:12,fontSize:'.78rem',color:'var(--tx2)'}}>
                  Most common: <span style={{color:MOODS_MAP[wrapped.topMood].color,fontWeight:600}}>{MOODS_MAP[wrapped.topMood].emoji} {MOODS_MAP[wrapped.topMood].label}</span>
                </div>
              )}
            </Slide>
          )}

          {/* ── FAVORITE MEMORY ── */}
          {wrapped.memory && (
            <Slide icon="📸" title="Favorite Memory">
              {memPhotoUrl && (
                <img src={memPhotoUrl} alt="" style={{width:'100%',maxHeight:200,objectFit:'cover',borderRadius:10,marginBottom:10,display:'block'}}/>
              )}
              <div style={{fontWeight:600,fontSize:'.9rem',marginBottom:4}}>{wrapped.memory.name}</div>
              <div style={{fontSize:'.75rem',color:'var(--tx2)',marginBottom:wrapped.memory.notes?8:0}}>{fmtDateS(wrapped.memory.date)} · {fmtKm(wrapped.memory.distanceKm)} km</div>
              {wrapped.memory.notes && (
                <div style={{fontSize:'.82rem',fontStyle:'italic',color:'var(--tx2)',lineHeight:1.5,borderLeft:'3px solid var(--or)',paddingLeft:10}}>
                  "{wrapped.memory.notes.length > 120 ? wrapped.memory.notes.slice(0,120)+'…' : wrapped.memory.notes}"
                </div>
              )}
            </Slide>
          )}

          {/* ── RUN CALENDAR ── */}
          <Slide icon="📅" title="Consistency">
            <RunCalendar monthKey={selected.key} runDays={wrapped.runDays}/>
            <div style={{marginTop:10,fontSize:'.78rem',color:'var(--tx2)',textAlign:'center'}}>
              {wrapped.runCount} run{wrapped.runCount>1?'s':''} this month
              {wrapped.maxStreak >= 2 && ` · best streak ${wrapped.maxStreak} days`}
            </div>
          </Slide>

        </> : (
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--tx2)'}}>No data for this month.</div>
        )}
      </div>
    </div>
  );
}

// ── Shared slide card ──
function Slide({ icon, title, accent='var(--or)', children }) {
  return (
    <div className="card" style={{padding:'16px 18px'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <span style={{fontSize:'1.1rem'}}>{icon}</span>
        <span style={{fontSize:'.72rem',fontWeight:700,color:'var(--tx2)',letterSpacing:'.08em',textTransform:'uppercase'}}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Run calendar heatmap ──
function RunCalendar({ monthKey, runDays }) {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Monday-first offset
  const startOffset = (firstDay.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${monthKey}-${String(d).padStart(2,'0')}`;
    cells.push({ day: d, ran: runDays.has(key) });
  }
  const dayLabels = ['M','T','W','T','F','S','S'];
  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:4}}>
        {dayLabels.map((l,i) => (
          <div key={i} style={{textAlign:'center',fontSize:'.58rem',color:'var(--tx2)',fontWeight:600,padding:'2px 0'}}>{l}</div>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
        {cells.map((c, i) => (
          <div key={i} style={{
            aspectRatio:'1',borderRadius:4,
            background: !c ? 'transparent' : c.ran ? 'var(--or)' : 'rgba(255,255,255,.06)',
            display:'flex',alignItems:'center',justifyContent:'center',
          }}>
            {c && <span style={{fontSize:'.6rem',color: c.ran ? '#fff' : 'var(--tx2)',fontWeight: c.ran ? 700 : 400}}>{c.day}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sticky header ──
function Header({ title, onClose }) {
  return (
    <div className="glass" style={{padding:'14px 18px 14px',borderBottom:'1px solid var(--bd)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
      <div className="screen-title">{title}</div>
      <button className="btn b-gh" style={{padding:'6px 13px',fontSize:'.8rem'}} onClick={onClose}>✕ Close</button>
    </div>
  );
}

const shell = {position:'fixed',inset:0,zIndex:220,background:'var(--bg)',display:'flex',flexDirection:'column'};
