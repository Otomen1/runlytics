import React, { useState, useMemo, useRef } from 'react';
import { MiniMapThumb } from '../Map/MiniMapThumb.jsx';
import { ACT_ICN, ACT_CLR } from '../../constants/activityTypes.js';
import { fmtKm, fmtDur, fmtPace, fmtDate, fmtDateS } from '../../utils/formatters.js';

const ITEM_H = 88;
const BUFFER  = 5;

const MOODS = [
  { key:'strong', emoji:'🔥' },
  { key:'great',  emoji:'😀' },
  { key:'good',   emoji:'🙂' },
  { key:'normal', emoji:'😐' },
  { key:'tough',  emoji:'😫' },
];
const MOOD_EMOJI = { strong:'🔥', great:'😀', good:'🙂', normal:'😐', tough:'😫' };

const SORT_OPTIONS = [
  { key:'newest',  label:'Newest'  },
  { key:'oldest',  label:'Oldest'  },
  { key:'longest', label:'Longest' },
  { key:'fastest', label:'Fastest' },
];

export function AllRunsView({ acts, onSelectAct, onClose }) {
  const [search,      setSearch]      = useState('');
  const [sortBy,      setSortBy]      = useState('newest');
  const [compareMode, setCompareMode] = useState(false);
  const [selected,    setSelected]    = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const [scrollTop,   setScrollTop]   = useState(0);
  const listRef = useRef(null);

  const hasMoods = useMemo(() => acts.some(a => a.mood), [acts]);

  const list = useMemo(() => {
    let l = [...acts];
    if (search.trim()) l = l.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
    if (sortBy === 'newest')  l.sort((a, b) => b.dateTs - a.dateTs);
    else if (sortBy === 'oldest')  l.sort((a, b) => a.dateTs - b.dateTs);
    else if (sortBy === 'longest') l.sort((a, b) => b.distanceKm - a.distanceKm);
    else if (sortBy === 'fastest') l.sort((a, b) => (a.avgPaceSecKm||9999) - (b.avgPaceSecKm||9999));
    return l;
  }, [acts, search, moodFilter, sortBy]);

  const CONTAINER_H = typeof window !== 'undefined' ? window.innerHeight - 180 : 600;

  function toggleSelect(a) {
    setSelected(prev => {
      if (prev.find(x => x.id === a.id)) return prev.filter(x => x.id !== a.id);
      if (prev.length >= 2) return [prev[1], a];
      return [...prev, a];
    });
  }
  function exitCompare() { setCompareMode(false); setSelected([]); setShowCompare(false); }

  return (
    <div style={{position:'fixed',inset:0,zIndex:220,background:'var(--bg)',display:'flex',flexDirection:'column'}}>

      {/* Header */}
      <div style={{padding:'16px 18px 0',borderBottom:'1px solid var(--bd)',flexShrink:0,background:'var(--bg)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
          <button className="btn b-gh" style={{padding:'7px 12px',fontSize:'.9rem',flexShrink:0}} onClick={onClose}>←</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:'1.1rem',letterSpacing:'-.01em'}}>All Runs</div>
            <div style={{fontSize:'.68rem',color:'var(--tx3)',marginTop:1}}>{acts.length} activities</div>
          </div>
          <button className={'btn '+(compareMode?'b-or':'b-gh')} style={{padding:'7px 13px',fontSize:'.76rem',flexShrink:0}}
            onClick={() => compareMode ? exitCompare() : setCompareMode(true)}>
            {compareMode ? 'Cancel' : '⚖️ Compare'}
          </button>
        </div>

        {/* Search + sort */}
        <div style={{display:'flex',gap:8,marginBottom:10}}>
          <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search runs…" style={{flex:1,margin:0}}/>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
            style={{background:'var(--s2)',color:'var(--tx)',border:'1px solid var(--bd)',borderRadius:10,padding:'0 10px',fontSize:'.74rem',fontFamily:'inherit',cursor:'pointer',outline:'none',flexShrink:0}}>
            {SORT_OPTIONS.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

      </div>

      {/* Compare hint */}
      {compareMode && (
        <div style={{padding:'8px 18px',background:'rgba(249,115,22,.06)',borderBottom:'1px solid rgba(249,115,22,.15)',fontSize:'.76rem',color:'var(--or)',flexShrink:0}}>
          {selected.length===0?'Tap two runs to compare':selected.length===1?'Select one more run':'Ready — tap Compare below'}
        </div>
      )}

      {/* Virtualized list */}
      <div ref={listRef} onScroll={e=>setScrollTop(e.currentTarget.scrollTop)}
        style={{flex:1,overflowY:'auto',padding:'8px 14px',paddingBottom:compareMode&&selected.length===2?'90px':'max(32px,calc(env(safe-area-inset-bottom)+16px))'}}>
        {(() => {
          const startIdx = Math.max(0, Math.floor(scrollTop/ITEM_H)-BUFFER);
          const endIdx   = Math.min(list.length, startIdx + Math.ceil(CONTAINER_H/ITEM_H) + BUFFER*2);
          const topSpacer    = startIdx * ITEM_H;
          const bottomSpacer = Math.max(0, (list.length-endIdx)*ITEM_H);
          return (
            <>
              {topSpacer>0 && <div style={{height:topSpacer}}/>}
              {list.slice(startIdx, endIdx).map(a => {
                const clr   = ACT_CLR[a.type]||'#6b7280';
                const isSel = !!selected.find(x=>x.id===a.id);
                const selIdx = selected.findIndex(x=>x.id===a.id);
                return (
                  <div key={a.id}
                    onClick={()=>compareMode?toggleSelect(a):onSelectAct(a)}
                    style={{
                      height:ITEM_H, marginBottom:8, borderRadius:16, overflow:'hidden',
                      background:'var(--s2)',
                      border:'1px solid '+(isSel&&compareMode?'var(--or)':'var(--bd)'),
                      display:'flex', alignItems:'stretch', cursor:'pointer',
                      opacity:!isSel&&compareMode&&selected.length===2?0.35:1,
                      transition:'opacity .15s,border-color .15s',
                      boxShadow:'0 1px 3px rgba(0,0,0,.18)',
                    }}>
                    {/* Left accent bar */}
                    <div style={{width:4,background:`linear-gradient(180deg,${clr},${clr}88)`,flexShrink:0}}/>

                    {/* Compare circle */}
                    {compareMode && (
                      <div style={{width:32,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <div style={{width:20,height:20,borderRadius:'50%',border:'2px solid '+(isSel?'var(--or)':'var(--bd)'),background:isSel?'var(--or)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.65rem',fontWeight:800,color:'#fff'}}>
                          {isSel?selIdx+1:''}
                        </div>
                      </div>
                    )}

                    {/* Main content */}
                    <div style={{flex:1,minWidth:0,padding:'11px 8px 11px 14px',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
                      {/* Row 1: name + mood/race */}
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{fontWeight:700,fontSize:'.88rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,letterSpacing:'-.01em'}}>{a.name}</div>
                        {a.isRace&&<span style={{fontSize:'.58rem',background:'rgba(249,115,22,.15)',color:'var(--or)',padding:'2px 6px',borderRadius:20,fontWeight:700,flexShrink:0,letterSpacing:'.04em'}}>RACE</span>}
                      </div>
                      {/* Row 2: big distance + stats */}
                      <div style={{display:'flex',alignItems:'baseline',gap:10}}>
                        <span style={{fontSize:'1.35rem',fontWeight:900,color:clr,lineHeight:1,letterSpacing:'-.03em'}}>{fmtKm(a.distanceKm)}<span style={{fontSize:'.58rem',fontWeight:500,color:'var(--tx3)',marginLeft:2}}>km</span></span>
                        <span style={{fontSize:'.72rem',color:'var(--tx2)',fontWeight:500}}>{fmtPace(a.avgPaceSecKm)}/km</span>
                        {a.avgHR&&<span style={{fontSize:'.72rem',color:'var(--tx2)',fontWeight:500}}>❤ {a.avgHR}</span>}
                      </div>
                      {/* Row 3: date + duration */}
                      <div style={{display:'flex',alignItems:'center',gap:5,fontSize:'.63rem',color:'var(--tx3)',letterSpacing:'.01em'}}>
                        <span>{fmtDate(a.date)}</span>
                        <span style={{opacity:.4}}>·</span>
                        <span>{fmtDur(a.movingTimeSec)}</span>
                        {a.elevGainM>0&&<><span style={{opacity:.4}}>·</span><span>↑{Math.round(a.elevGainM)}m</span></>}
                      </div>
                    </div>

                    {/* Mini map */}
                    <div style={{width:64,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',padding:'10px 10px 10px 0'}}>
                      <MiniMapThumb route={a.route} color={clr}/>
                    </div>
                  </div>
                );
              })}
              {bottomSpacer>0 && <div style={{height:bottomSpacer}}/>}
            </>
          );
        })()}
        <div style={{textAlign:'center',fontSize:'.68rem',color:'var(--tx3)',padding:'12px 0'}}>{list.length} {list.length===1?'run':'runs'}</div>
      </div>

      {/* Compare action bar */}
      {compareMode && selected.length===2 && !showCompare && (
        <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:480,padding:'12px 18px',paddingBottom:'max(18px,calc(env(safe-area-inset-bottom)+12px))',background:'rgba(6,8,15,.97)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',borderTop:'1px solid var(--bd)',zIndex:10}}>
          <button className="btn b-or" style={{width:'100%',padding:'13px',fontWeight:700}} onClick={()=>setShowCompare(true)}>
            ⚖️ Compare these 2 runs
          </button>
        </div>
      )}

      {showCompare && selected.length===2 && (
        <CompareSheet runs={selected} onClose={()=>setShowCompare(false)} onOpenRun={a=>{exitCompare();onSelectAct(a);}}/>
      )}
    </div>
  );
}

function CompareSheet({ runs, onClose, onOpenRun }) {
  const [a, b] = runs;
  const rows = [
    { label:'Distance', va:fmtKm(a.distanceKm)+' km', vb:fmtKm(b.distanceKm)+' km', winner:a.distanceKm>b.distanceKm?'a':b.distanceKm>a.distanceKm?'b':null },
    { label:'Pace',     va:fmtPace(a.avgPaceSecKm)+'/km', vb:fmtPace(b.avgPaceSecKm)+'/km', winner:a.avgPaceSecKm>0&&b.avgPaceSecKm>0?(a.avgPaceSecKm<b.avgPaceSecKm?'a':a.avgPaceSecKm>b.avgPaceSecKm?'b':null):null },
    { label:'Time',     va:fmtDur(a.movingTimeSec), vb:fmtDur(b.movingTimeSec), winner:null },
    { label:'Elevation',va:'+'+Math.round(a.elevGainM||0)+'m', vb:'+'+Math.round(b.elevGainM||0)+'m', winner:(a.elevGainM||0)>(b.elevGainM||0)?'a':(a.elevGainM||0)<(b.elevGainM||0)?'b':null },
    ...((a.avgHR||b.avgHR)?[{ label:'Avg HR', va:a.avgHR?a.avgHR+' bpm':'—', vb:b.avgHR?b.avgHR+' bpm':'—', winner:null }]:[]),
    ...((a.mood||b.mood)?[{ label:'Mood', va:MOOD_EMOJI[a.mood]||'—', vb:MOOD_EMOJI[b.mood]||'—', winner:null }]:[]),
  ];
  return (
    <div style={{position:'fixed',inset:0,zIndex:280,background:'rgba(0,0,0,.82)',display:'flex',alignItems:'flex-end',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="glass" style={{width:'100%',maxWidth:430,borderRadius:'22px 22px 0 0',padding:'20px 18px',paddingBottom:'max(40px,calc(env(safe-area-inset-bottom)+20px))',border:'1px solid var(--bd)',maxHeight:'82vh',overflowY:'auto'}}>
        <div style={{width:36,height:4,borderRadius:2,background:'var(--bd2)',margin:'0 auto 16px'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:'.94rem'}}>⚖️ Run Comparison</div>
          <button className="btn b-gh" style={{padding:'5px 11px',fontSize:'.76rem'}} onClick={onClose}>✕</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'76px 1fr 1fr',gap:8,marginBottom:12}}>
          <div/>
          {[a,b].map((r,i)=>(
            <div key={r.id} className="tap" style={{textAlign:'center',padding:'9px 6px',borderRadius:10,background:'rgba(249,115,22,.06)',border:'1px solid rgba(249,115,22,.15)',cursor:'pointer'}}
              onClick={()=>{onClose();onOpenRun(r);}}>
              <div style={{fontSize:'.62rem',fontWeight:700,color:'var(--or)',marginBottom:3,letterSpacing:'.06em'}}>{i===0?'RUN A':'RUN B'}</div>
              <div style={{fontSize:'.76rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
              <div style={{fontSize:'.6rem',color:'var(--tx3)',marginTop:2}}>{fmtDateS(r.date)}</div>
            </div>
          ))}
        </div>
        {rows.map(row=>(
          <div key={row.label} style={{display:'grid',gridTemplateColumns:'76px 1fr 1fr',gap:8,marginBottom:8}}>
            <div style={{fontSize:'.72rem',color:'var(--tx2)',display:'flex',alignItems:'center'}}>{row.label}</div>
            {[{v:row.va,w:row.winner==='a'},{v:row.vb,w:row.winner==='b'}].map((cell,i)=>(
              <div key={i} style={{textAlign:'center',padding:'8px 6px',borderRadius:8,background:cell.w?'rgba(249,115,22,.1)':'var(--s2)',border:cell.w?'1px solid rgba(249,115,22,.3)':'1px solid transparent'}}>
                <div style={{fontSize:'.84rem',fontWeight:cell.w?700:400,color:cell.w?'var(--or)':'var(--tx)'}}>{cell.v}</div>
                {cell.w&&<div style={{fontSize:'.52rem',color:'var(--or)',marginTop:1,letterSpacing:'.04em'}}>BETTER</div>}
              </div>
            ))}
          </div>
        ))}
        <div style={{marginTop:12,textAlign:'center',fontSize:'.68rem',color:'var(--tx3)'}}>Tap a run header to view full details</div>
      </div>
    </div>
  );
}
