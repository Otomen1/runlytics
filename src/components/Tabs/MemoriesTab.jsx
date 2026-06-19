import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getPhotos } from '../../db/indexedDB.js';
import { fmtKm, fmtPace, fmtDate } from '../../utils/formatters.js';
import { getMemories, getHighlights, getMonthsWithActivity, computeWrapped } from '../../utils/wrapped.js';

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

const HIGHLIGHT_META = {
  'Strongest Run':  { color:'var(--or)', hero:a=>String(a.trainingLoad||''), unit:'load' },
  'Favorite Memory':{ color:'#8b5cf6',  hero:null,                           unit:null   },
  'Longest Run':    { color:'#3b82f6',  hero:a=>fmtKm(a.distanceKm),        unit:'km'   },
  'Fastest Run':    { color:'#eab308',  hero:a=>fmtPace(a.avgPaceSecKm),     unit:'/km'  },
  'Biggest Climb':  { color:'#22c55e',  hero:a=>String(a.elevGainM||''),     unit:'m ↑'  },
};

function HighlightCard({ icon, label, act, onSelect }) {
  const thumb = useThumb(act.id, act.photoCount);
  const mood  = act.mood ? MOODS_MAP[act.mood] : null;
  const meta  = HIGHLIGHT_META[label] || { color:'var(--tx2)', hero:null, unit:null };
  const { color } = meta;
  const heroVal = meta.hero ? meta.hero(act) : null;
  const isMem = label === 'Favorite Memory';

  return (
    <div onClick={() => onSelect(act)} style={{
      cursor:'pointer', flexShrink:0, width:155, display:'flex', flexDirection:'column',
      borderRadius:'var(--r-lg)', background:'var(--s2)', border:'1px solid var(--bd)',
      borderLeft:`3px solid ${color}`, overflow:'hidden',
    }}>
      {/* Photo strip for Favorite Memory */}
      {isMem && thumb && (
        <img src={thumb} alt="" loading="lazy"
          style={{width:'100%',height:80,objectFit:'cover',display:'block'}}/>
      )}
      {isMem && !thumb && (
        <div style={{width:'100%',height:72,background:`${color}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2rem'}}>
          {mood ? mood.emoji : '📸'}
        </div>
      )}

      <div style={{padding:'12px 12px 14px',display:'flex',flexDirection:'column',gap:5,flex:1}}>
        {/* Icon + label */}
        <div style={{display:'flex',alignItems:'center',gap:7}}>
          <div style={{width:28,height:28,borderRadius:'50%',background:`${color}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',flexShrink:0}}>
            {icon}
          </div>
          <div style={{fontSize:'.54rem',fontWeight:700,color,letterSpacing:'.07em',textTransform:'uppercase',lineHeight:1.2}}>{label}</div>
        </div>

        {/* Hero metric */}
        {heroVal && (
          <div style={{display:'flex',alignItems:'baseline',gap:3}}>
            <span style={{fontSize:'1.8rem',fontWeight:900,color,lineHeight:1}}>{heroVal}</span>
            <span style={{fontSize:'.58rem',color,opacity:.75,fontWeight:600}}>{meta.unit}</span>
          </div>
        )}

        {/* Activity name + secondary */}
        <div style={{marginTop:'auto'}}>
          <div style={{fontSize:'.76rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--tx)'}}>{act.name}</div>
          <div style={{fontSize:'.62rem',color:'var(--tx2)',marginTop:2}}>{fmtKm(act.distanceKm)} km · {fmtDate(act.date)}</div>
        </div>
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
  const maxWeekKm = data.weeklyBreakdown?.length
    ? Math.max(...data.weeklyBreakdown.map(w => w.km))
    : 0;
  return (
    <div onClick={onOpen} style={{cursor:'pointer',width:130,height:175,flexShrink:0,padding:'14px 12px',display:'flex',flexDirection:'column',justifyContent:'space-between',borderRadius:'var(--r-lg)',background:'var(--s2)',border:'1px solid var(--bd)'}}>

      {/* Top: month + mood */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:'1.3rem',fontWeight:800,lineHeight:1,textTransform:'uppercase',color:'var(--tx)'}}>{mon}</div>
          <div style={{fontSize:'.6rem',color:'var(--tx3)',marginTop:2}}>{year}</div>
        </div>
        {mood && <span style={{fontSize:'.9rem',lineHeight:1}}>{mood.emoji}</span>}
      </div>

      {/* Middle: km + runs */}
      <div>
        <div style={{display:'flex',alignItems:'baseline',gap:3}}>
          <span style={{fontSize:'1.7rem',fontWeight:900,color:'var(--or)',lineHeight:1}}>{fmtKm(data.totalDistance)}</span>
          <span style={{fontSize:'.58rem',color:'var(--or)',fontWeight:600}}>km</span>
        </div>
        <div style={{fontSize:'.64rem',color:'var(--tx2)',marginTop:3}}>{data.totalRuns} run{data.totalRuns!==1?'s':''}</div>
      </div>

      {/* Bottom: mini week bars */}
      {data.weeklyBreakdown?.length > 0 && (
        <div style={{display:'flex',gap:3,alignItems:'flex-end',height:22}}>
          {data.weeklyBreakdown.map(w => {
            const isBest = w.km === maxWeekKm;
            const h = maxWeekKm > 0 ? Math.max(3, Math.round((w.km/maxWeekKm)*18)) : 3;
            return <div key={w.week} style={{flex:1,height:h,background:isBest?'var(--or)':'var(--bd2)',borderRadius:2}}/>;
          })}
        </div>
      )}
    </div>
  );
}

export function MemoriesTab({ acts, onSelectAct, onOpenWrapped }) {
  const [search, setSearch] = useState('');
  const [moodFilter, setMoodFilter] = useState(null);

  const allMemories = useMemo(
    () => acts.filter(a => a.mood || a.notes || a.photoCount > 0),
    [acts]
  );

  const memories = useMemo(() => {
    let m = allMemories;
    if (moodFilter) m = m.filter(a => a.mood === moodFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      m = m.filter(a =>
        a.name?.toLowerCase().includes(q) ||
        a.notes?.toLowerCase().includes(q)
      );
    }
    return m;
  }, [allMemories, moodFilter, search]);

  const highlights = useMemo(() => getHighlights(acts), [acts]);
  const months = useMemo(() => getMonthsWithActivity(acts).slice(0, 12), [acts]);

  if (!acts.length) return (
    <div style={{textAlign:'center',padding:'60px 20px',color:'var(--tx2)'}}>
      <div style={{fontSize:'3rem',marginBottom:12}}>📖</div>
      <div style={{fontWeight:700,fontSize:'1rem',marginBottom:8}}>Your running story starts here</div>
      <div style={{fontSize:'.82rem',lineHeight:1.6}}>Upload a GPX or sync Strava to begin building your memories.</div>
    </div>
  );

  const MOOD_EMOJI = {great:'😀',strong:'🔥',good:'🙂',normal:'😐',tough:'😫'};

  return (
    <div style={{padding:'18px 16px 100px'}}>

      {/* Search + Mood filters */}
      {allMemories.length > 0 && (
        <div style={{marginBottom:16}}>
          <div style={{position:'relative',marginBottom:10}}>
            <input
              className="inp"
              placeholder="Search runs or notes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{width:'100%',boxSizing:'border-box',paddingLeft:32}}
            />
            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:'.9rem',pointerEvents:'none'}}>🔍</span>
            {search && (
              <button onClick={() => setSearch('')} aria-label="Clear search"
                style={{position:'absolute',right:4,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',fontSize:'.9rem',padding:'8px 10px'}}>✕</button>
            )}
          </div>
          <div style={{position:'relative'}}>
          <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2,scrollbarWidth:'none'}}>
            {[null,'great','strong','good','normal','tough'].map(m => {
              const active = moodFilter === m;
              return (
                <button key={m ?? 'all'} onClick={() => setMoodFilter(m)}
                  style={{flexShrink:0,padding:'5px 12px',borderRadius:20,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:'.75rem',fontWeight:active?700:400,background:active?'var(--or)':'var(--s2)',color:active?'#fff':'var(--tx2)'}}>
                  {m ? `${MOOD_EMOJI[m]} ${m}` : `All · ${allMemories.length}`}
                </button>
              );
            })}
          </div>
          <div style={{position:'absolute',right:0,top:0,bottom:0,width:32,background:'linear-gradient(to left,var(--bg),transparent)',pointerEvents:'none'}}/>
          </div>
        </div>
      )}

      {/* Memories */}
      {allMemories.length > 0 && (
        <section style={{marginBottom:28}}>
          <div style={{fontSize:'.62rem',fontWeight:700,color:'var(--tx2)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>
            {`📸 Memories${moodFilter || search ? ` · ${memories.length} found` : ` · ${allMemories.length}`}`}
          </div>
          {memories.map(a => <MemoryCard key={a.id} act={a} onSelect={onSelectAct}/>)}
          {memories.length === 0 && (
            <div style={{textAlign:'center',padding:'32px 0',color:'var(--tx3)'}}>
              <div style={{fontSize:'1.8rem',marginBottom:8}}>🔍</div>
              <div style={{fontSize:'.84rem'}}>No runs match this filter</div>
              <button onClick={() => { setSearch(''); setMoodFilter(null); }}
                style={{marginTop:10,background:'none',border:'none',color:'var(--or)',fontSize:'.8rem',cursor:'pointer'}}>
                Clear filters
              </button>
            </div>
          )}
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
          <div style={{display:'flex',gap:10,overflowX:'auto',paddingBottom:4,scrollbarWidth:'none'}}>
            {months.map(ym => (
              <MonthCard key={ym} acts={acts} ym={ym} onOpen={() => onOpenWrapped(ym)}/>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
