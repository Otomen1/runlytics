import React, { useState, useMemo } from 'react';
import { fmtKm, fmtDur, fmtPace, fmtDateS } from '../../utils/formatters.js';
import { computeYearWrapped } from '../../utils/analytics.js';

const MOODS_ORDER = ['strong','great','good','normal','tough'];
const MOODS_MAP = {
  great:  { emoji: '😀', label: 'Great',  color: '#22c55e' },
  good:   { emoji: '🙂', label: 'Good',   color: '#3b82f6' },
  normal: { emoji: '😐', label: 'Normal', color: '#6b7280' },
  tough:  { emoji: '😫', label: 'Tough',  color: '#eab308' },
  strong: { emoji: '🔥', label: 'Strong', color: '#f97316' },
};
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function YearInReview({ acts, onClose }) {
  const years = useMemo(() => {
    const yrs = new Set(acts.map(a => a.date && a.date.slice(0,4)).filter(Boolean));
    return [...yrs].sort((a,b) => b - a);
  }, [acts]);

  const [selYear, setSelYear] = useState(() => years[0] || String(new Date().getFullYear()));
  const wrapped = useMemo(() => computeYearWrapped(acts, selYear), [acts, selYear]);
  const prevYear = String(parseInt(selYear) - 1);
  const prevWrapped = useMemo(() => computeYearWrapped(acts, prevYear), [acts, prevYear]);

  if (!years.length) return (
    <div style={shell}>
      <Header onClose={onClose} title="Year in Review"/>
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,color:'var(--tx2)'}}>
        <div style={{fontSize:'2.8rem'}}>📅</div>
        <div style={{fontWeight:700,color:'var(--tx)'}}>No runs logged yet</div>
        <div style={{fontSize:'.8rem'}}>Upload runs to see your year in review.</div>
      </div>
    </div>
  );

  return (
    <div style={shell}>
      <Header onClose={onClose} title="Year in Review"/>

      {/* Year selector */}
      <div style={{padding:'0 18px 14px',borderBottom:'1px solid var(--bd)',display:'flex',gap:8,overflowX:'auto',scrollbarWidth:'none'}}>
        {years.map(y => (
          <button key={y} onClick={() => setSelYear(y)}
            style={{flexShrink:0,padding:'6px 14px',borderRadius:20,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:'.78rem',fontWeight:600,
              background: y === selYear ? 'var(--or)' : 'var(--bg2,rgba(255,255,255,.07))',
              color: y === selYear ? '#fff' : 'var(--tx2)',
              transition:'background .15s,color .15s'}}>
            {y}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'18px 18px 40px',display:'flex',flexDirection:'column',gap:12}}>
        {wrapped ? <>

          {/* ── HERO ── */}
          <div style={{background:'linear-gradient(135deg,#0f0c29,#1a0835)',borderRadius:16,padding:'28px 22px',textAlign:'center',border:'1px solid rgba(249,115,22,.18)'}}>
            <div style={{fontSize:'.72rem',fontWeight:700,color:'#f97316',letterSpacing:'.18em',marginBottom:8}}>{selYear} IN REVIEW</div>
            <div style={{fontSize:'3.2rem',fontWeight:900,color:'#fff',lineHeight:1,letterSpacing:'-.04em',marginBottom:4}}>
              {fmtKm(wrapped.totalKm)}
            </div>
            <div style={{fontSize:'.82rem',color:'rgba(255,255,255,.5)',letterSpacing:'.12em',marginBottom:16}}>KILOMETRES</div>
            <div style={{display:'flex',justifyContent:'center',gap:24}}>
              {[['Runs',wrapped.runCount],['Time',fmtDur(wrapped.totalSec)],['Elev',Math.round(wrapped.totalElev)+'m']].map(([l,v]) => (
                <div key={l} style={{textAlign:'center'}}>
                  <div style={{fontSize:'1.1rem',fontWeight:700,color:'#fff'}}>{v}</div>
                  <div style={{fontSize:'.6rem',color:'rgba(255,255,255,.35)',letterSpacing:'.1em',marginTop:2}}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── MONTHLY BREAKDOWN ── */}
          <Slide icon="📊" title="Monthly Distance">
            <MonthlyChart months={wrapped.months} bestMonth={wrapped.bestMonth}/>
          </Slide>

          {/* ── ELEVATION ── */}
          {wrapped.totalElev > 0 && (
            <Slide icon="🏔️" title="Elevation Climbed">
              <div style={{fontSize:'2.2rem',fontWeight:900,color:'#fff',letterSpacing:'-.03em',lineHeight:1}}>
                {Math.round(wrapped.totalElev).toLocaleString()} m
              </div>
              {wrapped.everests >= 0.1 && (
                <div style={{fontSize:'.82rem',color:'var(--tx2)',marginTop:8}}>
                  That's <span style={{color:'var(--or)',fontWeight:700}}>{wrapped.everests.toFixed(1)}×</span> the height of Everest (8,849 m)
                </div>
              )}
            </Slide>
          )}

          {/* ── HIGHLIGHTS ── */}
          {(wrapped.longest || wrapped.bestPace) && (
            <Slide icon="🏅" title="Year Highlights">
              {wrapped.longest && (
                <div style={{marginBottom: wrapped.bestPace ? 12 : 0}}>
                  <div style={{fontSize:'.7rem',fontWeight:700,color:'var(--or)',letterSpacing:'.08em',marginBottom:4}}>LONGEST RUN</div>
                  <div style={{fontSize:'1.6rem',fontWeight:900,color:'#fff',lineHeight:1}}>{fmtKm(wrapped.longest.distanceKm)} km</div>
                  <div style={{fontSize:'.78rem',color:'var(--tx2)',marginTop:4}}>{wrapped.longest.name} · {fmtDateS(wrapped.longest.date)}</div>
                </div>
              )}
              {wrapped.bestPace && (
                <div style={{paddingTop: wrapped.longest ? 12 : 0, borderTop: wrapped.longest ? '1px solid var(--bd)' : 'none'}}>
                  <div style={{fontSize:'.7rem',fontWeight:700,color:'#eab308',letterSpacing:'.08em',marginBottom:4}}>BEST PACE</div>
                  <div style={{fontSize:'1.6rem',fontWeight:900,color:'#fff',lineHeight:1}}>{fmtPace(wrapped.bestPace.avgPaceSecKm)}/km</div>
                  <div style={{fontSize:'.78rem',color:'var(--tx2)',marginTop:4}}>{wrapped.bestPace.name} · {fmtDateS(wrapped.bestPace.date)}</div>
                </div>
              )}
            </Slide>
          )}

          {/* ── MOOD ── */}
          {Object.keys(wrapped.moodCounts).length > 0 && (
            <Slide icon="💭" title="Year in Mood">
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

          {/* ── YEAR CALENDAR ── */}
          <Slide icon="📅" title="Year Consistency">
            <YearCalendar year={selYear} runDays={wrapped.runDays}/>
            <div style={{marginTop:10,fontSize:'.78rem',color:'var(--tx2)',textAlign:'center'}}>
              {wrapped.runCount} run{wrapped.runCount>1?'s':''} across {[...wrapped.runDays].map(d=>d.slice(0,7)).filter((v,i,a)=>a.indexOf(v)===i).length} months
            </div>
          </Slide>

          {/* ── YEAR vs YEAR ── */}
          {prevWrapped && (
            <Slide icon="📊" title={`${selYear} vs ${prevYear}`}>
              {[
                {label:'Distance', curr:fmtKm(wrapped.totalKm)+' km', prev:fmtKm(prevWrapped.totalKm)+' km', currN:wrapped.totalKm, prevN:prevWrapped.totalKm},
                {label:'Runs', curr:String(wrapped.runCount), prev:String(prevWrapped.runCount), currN:wrapped.runCount, prevN:prevWrapped.runCount},
                {label:'Time', curr:fmtDur(wrapped.totalSec), prev:fmtDur(prevWrapped.totalSec), currN:wrapped.totalSec, prevN:prevWrapped.totalSec},
                {label:'Elevation', curr:Math.round(wrapped.totalElev)+'m', prev:Math.round(prevWrapped.totalElev)+'m', currN:wrapped.totalElev, prevN:prevWrapped.totalElev},
              ].map(({label,curr,prev,currN,prevN})=>{
                const pct=prevN>0?Math.round((currN-prevN)/prevN*100):null;
                const up=pct>0;
                return(
                  <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--bd)'}}>
                    <div style={{fontSize:'.8rem',color:'var(--tx2)',minWidth:70}}>{label}</div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:'.72rem',color:'var(--tx3)'}}>{prev}</span>
                      <span style={{fontSize:'.7rem',color:'var(--tx3)'}}>→</span>
                      <span style={{fontSize:'.82rem',fontWeight:700}}>{curr}</span>
                      {pct!==null&&(
                        <span style={{fontSize:'.66rem',fontWeight:700,
                          color:up?'var(--gn)':pct<0?'var(--rd)':'var(--tx3)',
                          background:up?'var(--gn2)':pct<0?'var(--rd2)':'transparent',
                          padding:'2px 7px',borderRadius:20,minWidth:36,textAlign:'center'}}>
                          {pct===0?'—':(up?'+':'')+pct+'%'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </Slide>
          )}

        </> : (
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--tx2)'}}>No runs in {selYear}.</div>
        )}
      </div>
    </div>
  );
}

function MonthlyChart({ months, bestMonth }) {
  const maxKm = Math.max(...months.map(m => m.km), 1);
  return (
    <div>
      <div style={{display:'flex',alignItems:'flex-end',gap:3,height:80,marginBottom:6}}>
        {months.map(m => {
          const pct = m.km / maxKm;
          const isBest = m.month === bestMonth.month && m.km > 0;
          return (
            <div key={m.month} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',height:'100%'}}>
              <div style={{
                width:'100%',
                height: m.km > 0 ? Math.max(pct*100,4)+'%' : 3,
                borderRadius:'3px 3px 0 0',
                background: isBest ? 'var(--or)' : m.km > 0 ? 'rgba(249,115,22,.4)' : 'rgba(255,255,255,.06)',
                transition:'height .3s ease',
              }}/>
            </div>
          );
        })}
      </div>
      <div style={{display:'flex',gap:3}}>
        {months.map((m,i) => (
          <div key={m.month} style={{flex:1,textAlign:'center',fontSize:'.5rem',color:'var(--tx3)'}}>{MONTH_LABELS[i]}</div>
        ))}
      </div>
      {bestMonth.km > 0 && (
        <div style={{marginTop:10,fontSize:'.78rem',color:'var(--tx2)',textAlign:'center'}}>
          Best month: <span style={{color:'var(--or)',fontWeight:600}}>
            {MONTH_LABELS[parseInt(bestMonth.month.slice(5,7))-1]} — {fmtKm(bestMonth.km)} km
          </span>
        </div>
      )}
    </div>
  );
}

function YearCalendar({ year, runDays }) {
  const y = Number(year);
  const jan1 = new Date(y, 0, 1);
  const startOffset = (jan1.getDay() + 6) % 7;
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const totalDays = isLeap ? 366 : 365;
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 0; d < totalDays; d++) {
    const date = new Date(y, 0, d + 1);
    const key = date.toISOString().slice(0,10);
    cells.push({ date: key, ran: runDays.has(key) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  return (
    <div style={{overflowX:'auto',paddingBottom:4}}>
      <div style={{display:'flex',gap:2}}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{display:'flex',flexDirection:'column',gap:2}}>
            {week.map((c, di) => (
              <div key={di} style={{
                width:9,height:9,borderRadius:2,flexShrink:0,
                background: !c ? 'transparent' : c.ran ? 'var(--or)' : 'rgba(255,255,255,.06)',
              }}/>
            ))}
          </div>
        ))}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:6,paddingRight:4}}>
        {MONTH_LABELS.map(l => <div key={l} style={{fontSize:'.5rem',color:'var(--tx3)'}}>{l}</div>)}
      </div>
    </div>
  );
}

function Slide({ icon, title, children }) {
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

function Header({ title, onClose }) {
  return (
    <div className="glass" style={{padding:'14px 18px',borderBottom:'1px solid var(--bd)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
      <div className="screen-title">{title}</div>
      <button className="btn b-gh" style={{padding:'6px 13px',fontSize:'.8rem'}} onClick={onClose}>✕ Close</button>
    </div>
  );
}

const shell = {position:'fixed',inset:0,zIndex:220,background:'var(--bg)',display:'flex',flexDirection:'column'};
