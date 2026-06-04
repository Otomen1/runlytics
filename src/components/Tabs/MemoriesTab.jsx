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
    <div onClick={onOpen}
      style={{cursor:'pointer',padding:'18px 12px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',aspectRatio:'1',borderRadius:'var(--r-lg)',background:'var(--s2)',border:'1px solid var(--bd)'}}>
      <div style={{fontSize:'2.4rem',fontWeight:900,lineHeight:1,letterSpacing:'-.03em',textTransform:'uppercase',color:'var(--tx)'}}>{mon}</div>
      <div style={{fontSize:'.75rem',fontWeight:600,color:'var(--tx2)',opacity:.7,marginTop:4,letterSpacing:'.02em'}}>{year}</div>
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
              <button onClick={() => setSearch('')}
                style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',fontSize:'.9rem'}}>✕</button>
            )}
          </div>
          <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2}}>
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
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {months.map(ym => (
              <MonthCard key={ym} acts={acts} ym={ym} onOpen={() => onOpenWrapped(ym)}/>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
