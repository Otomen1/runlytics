import React, { useState, useMemo } from 'react';
import { MiniMapThumb } from '../Map/MiniMapThumb.jsx';
import { ACT_ICN, ACT_CLR } from '../../constants/activityTypes.js';
import { fmtKm, fmtDur, fmtPace, fmtDateS } from '../../utils/formatters.js';

const MOODS_LIST = [
  { key:'strong', emoji:'🔥', label:'Strong' },
  { key:'great',  emoji:'😀', label:'Great'  },
  { key:'good',   emoji:'🙂', label:'Good'   },
  { key:'normal', emoji:'😐', label:'Normal' },
  { key:'tough',  emoji:'😫', label:'Tough'  },
];
const MOOD_EMOJI = { strong:'🔥', great:'😀', good:'🙂', normal:'😐', tough:'😫' };

const DIST_FILTERS = [
  { key:'all',    label:'Any dist.' },
  { key:'short',  label:'< 8 km'   },
  { key:'medium', label:'8 – 20 km'},
  { key:'long',   label:'> 20 km'  },
];
const SORT_OPTIONS = [
  { key:'newest',  label:'Newest'  },
  { key:'oldest',  label:'Oldest'  },
  { key:'longest', label:'Longest' },
  { key:'fastest', label:'Fastest' },
];

export function AllRunsView({ acts, onSelectAct, onClose }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch]         = useState("");
  const [moodFilter, setMoodFilter] = useState("all");
  const [distFilter, setDistFilter] = useState("all");
  const [sortBy, setSortBy]         = useState("newest");
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected]     = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  const types = useMemo(() => ["all", ...new Set(acts.map(a => a.type))], [acts]);
  const hasMoods = useMemo(() => acts.some(a => a.mood), [acts]);

  const list = useMemo(() => {
    let l = [...acts];
    if (typeFilter !== "all")  l = l.filter(a => a.type === typeFilter);
    if (search.trim())         l = l.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
    if (moodFilter !== "all")  l = l.filter(a => a.mood === moodFilter);
    if (distFilter === "short")  l = l.filter(a => a.distanceKm < 8);
    else if (distFilter === "medium") l = l.filter(a => a.distanceKm >= 8 && a.distanceKm <= 20);
    else if (distFilter === "long")   l = l.filter(a => a.distanceKm > 20);
    if (sortBy === "newest")  l.sort((a, b) => b.dateTs - a.dateTs);
    else if (sortBy === "oldest")  l.sort((a, b) => a.dateTs - b.dateTs);
    else if (sortBy === "longest") l.sort((a, b) => b.distanceKm - a.distanceKm);
    else if (sortBy === "fastest") l.sort((a, b) => (a.avgPaceSecKm || 9999) - (b.avgPaceSecKm || 9999));
    return l;
  }, [acts, typeFilter, search, moodFilter, distFilter, sortBy]);

  function toggleSelect(a) {
    setSelected(prev => {
      if (prev.find(x => x.id === a.id)) return prev.filter(x => x.id !== a.id);
      if (prev.length >= 2) return [prev[1], a];
      return [...prev, a];
    });
  }

  function exitCompare() {
    setCompareMode(false);
    setSelected([]);
    setShowCompare(false);
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:220,background:"var(--bg)",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div className="glass" style={{padding:"14px 18px 0",borderBottom:"1px solid var(--bd)",flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div className="screen-title">All Runs</div>
          <div style={{display:"flex",gap:8}}>
            <button className={"btn "+(compareMode?"b-or":"b-gh")} style={{padding:"6px 11px",fontSize:".76rem"}}
              onClick={() => compareMode ? exitCompare() : setCompareMode(true)}>
              {compareMode ? "Cancel" : "⚖️ Compare"}
            </button>
            <button className="btn b-gh" style={{padding:"6px 12px",fontSize:".8rem"}} onClick={onClose}>✕</button>
          </div>
        </div>
        <input className="inp" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search runs…" style={{marginBottom:10}}/>
        {/* Type chips */}
        <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",marginBottom:8}}>
          {types.map(t => (
            <button key={t} className={"pill "+(typeFilter===t?"on":"")} onClick={() => setTypeFilter(t)}
              style={{flexShrink:0,textTransform:"capitalize"}}>
              {t==="all" ? "All ("+acts.length+")" : t}
            </button>
          ))}
        </div>
        {/* Mood chips */}
        {hasMoods && (
          <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",marginBottom:8}}>
            <button className={"pill "+(moodFilter==="all"?"on":"")} onClick={() => setMoodFilter("all")}
              style={{flexShrink:0}}>Any mood</button>
            {MOODS_LIST.map(m => (
              <button key={m.key} className={"pill "+(moodFilter===m.key?"on":"")}
                onClick={() => setMoodFilter(m.key)} style={{flexShrink:0}}>
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
        )}
        {/* Distance + sort row */}
        <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",marginBottom:12,alignItems:"center"}}>
          {DIST_FILTERS.map(d => (
            <button key={d.key} className={"pill "+(distFilter===d.key?"on":"")}
              onClick={() => setDistFilter(d.key)} style={{flexShrink:0}}>
              {d.label}
            </button>
          ))}
          <div style={{flexShrink:0,marginLeft:2,borderLeft:"1px solid var(--bd)",paddingLeft:8}}>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{background:"var(--s2,rgba(255,255,255,.07))",color:"var(--tx)",border:"1px solid var(--bd)",borderRadius:20,padding:"4px 10px",fontSize:".74rem",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
              {SORT_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{flex:1,overflowY:"auto",padding:"10px 14px",paddingBottom:compareMode&&selected.length===2?"90px":"max(32px,calc(env(safe-area-inset-bottom)+16px))"}}>
        {compareMode && (
          <div style={{padding:"9px 12px",marginBottom:10,borderRadius:10,background:"rgba(249,115,22,.08)",border:"1px solid rgba(249,115,22,.2)",fontSize:".78rem",color:"var(--or)"}}>
            {selected.length===0?"Tap two runs to compare them":selected.length===1?"Select one more run":"Ready — tap Compare below"}
          </div>
        )}
        {list.map(a => {
          const clr = ACT_CLR[a.type] || "#6b7280";
          const isSel = !!selected.find(x => x.id === a.id);
          const selIdx = selected.findIndex(x => x.id === a.id);
          return (
            <div key={a.id} className="run-card"
              style={compareMode ? {border:"2px solid "+(isSel?"var(--or)":"var(--bd)"),opacity:!isSel&&selected.length===2?0.45:1,transition:"opacity .15s,border-color .15s"} : {}}
              onClick={() => compareMode ? toggleSelect(a) : onSelectAct(a)}>
              {compareMode && (
                <div style={{width:22,height:22,borderRadius:"50%",border:"2px solid "+(isSel?"var(--or)":"var(--bd)"),background:isSel?"var(--or)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginRight:10,transition:"all .15s"}}>
                  {isSel && <span style={{color:"#fff",fontSize:".7rem",fontWeight:700}}>{selIdx+1}</span>}
                </div>
              )}
              <div style={{flex:1,minWidth:0,paddingRight:11}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                  <span style={{fontSize:".82rem",flexShrink:0}}>{ACT_ICN[a.type]||"🏃"}</span>
                  <div style={{fontWeight:700,fontSize:".88rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--tx)",flex:1}}>{a.name}</div>
                  {a.isRace&&<span style={{fontSize:".7rem",background:"rgba(249,115,22,.15)",color:"var(--or)",padding:"1px 6px",borderRadius:8,fontWeight:700,flexShrink:0}}>🏁</span>}
                </div>
                <div style={{fontSize:"1.32rem",fontWeight:800,color:clr,lineHeight:1,marginBottom:5,letterSpacing:"-.01em"}}>
                  {fmtKm(a.distanceKm)}<span style={{fontSize:".68rem",fontWeight:500,color:"var(--tx3)",marginLeft:3}}>km</span>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,fontSize:".7rem",color:"var(--tx2)",marginBottom:3}}>
                  <span>{fmtDur(a.movingTimeSec)}</span>
                  <span style={{color:"var(--tx3)"}}>·</span>
                  <span>{fmtPace(a.avgPaceSecKm)}/km</span>
                  {a.avgHR&&<><span style={{color:"var(--tx3)"}}>·</span><span>HR {a.avgHR}</span></>}
                </div>
                <div style={{fontSize:".66rem",color:"var(--tx3)"}}>{fmtDateS(a.date)}</div>
              </div>
              <MiniMapThumb route={a.route} color={clr}/>
            </div>
          );
        })}
        <div style={{textAlign:"center",fontSize:".7rem",color:"var(--tx3)",padding:"10px 0"}}>{list.length} {list.length===1?"run":"runs"}</div>
      </div>

      {/* Compare action bar */}
      {compareMode && selected.length===2 && !showCompare && (
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,padding:"12px 18px",paddingBottom:"max(18px,calc(env(safe-area-inset-bottom)+12px))",background:"rgba(6,8,15,.97)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderTop:"1px solid var(--bd)",zIndex:10}}>
          <button className="btn b-or" style={{width:"100%",padding:"13px",fontWeight:700}}
            onClick={() => setShowCompare(true)}>
            ⚖️ Compare these 2 runs
          </button>
        </div>
      )}

      {/* Comparison sheet */}
      {showCompare && selected.length===2 && (
        <CompareSheet runs={selected} onClose={() => setShowCompare(false)}
          onOpenRun={a => { exitCompare(); onSelectAct(a); }}/>
      )}
    </div>
  );
}

function CompareSheet({ runs, onClose, onOpenRun }) {
  const [a, b] = runs;
  const rows = [
    { label:'Distance',  va:fmtKm(a.distanceKm)+' km', vb:fmtKm(b.distanceKm)+' km',
      winner: a.distanceKm > b.distanceKm ? 'a' : b.distanceKm > a.distanceKm ? 'b' : null },
    { label:'Pace',      va:fmtPace(a.avgPaceSecKm)+'/km', vb:fmtPace(b.avgPaceSecKm)+'/km',
      winner: a.avgPaceSecKm>0&&b.avgPaceSecKm>0 ? (a.avgPaceSecKm<b.avgPaceSecKm?'a':a.avgPaceSecKm>b.avgPaceSecKm?'b':null) : null },
    { label:'Time',      va:fmtDur(a.movingTimeSec), vb:fmtDur(b.movingTimeSec), winner:null },
    { label:'Elevation', va:'+'+Math.round(a.elevGainM||0)+'m', vb:'+'+Math.round(b.elevGainM||0)+'m',
      winner: (a.elevGainM||0)>(b.elevGainM||0)?'a':(a.elevGainM||0)<(b.elevGainM||0)?'b':null },
    ...((a.avgHR||b.avgHR)?[{ label:'Avg HR', va:a.avgHR?a.avgHR+' bpm':'—', vb:b.avgHR?b.avgHR+' bpm':'—', winner:null }]:[]),
    ...((a.mood||b.mood)?[{ label:'Mood', va:MOOD_EMOJI[a.mood]||'—', vb:MOOD_EMOJI[b.mood]||'—', winner:null }]:[]),
  ];

  return (
    <div style={{position:'fixed',inset:0,zIndex:280,background:'rgba(0,0,0,.82)',display:'flex',alignItems:'flex-end',justifyContent:'center'}}
      onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="glass" style={{width:'100%',maxWidth:430,borderRadius:'22px 22px 0 0',padding:'20px 18px',paddingBottom:'max(40px,calc(env(safe-area-inset-bottom)+20px))',border:'1px solid var(--bd)',maxHeight:'82vh',overflowY:'auto'}}>
        <div style={{width:36,height:4,borderRadius:2,background:'var(--bd2)',margin:'0 auto 16px'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:'.94rem'}}>⚖️ Run Comparison</div>
          <button className="btn b-gh" style={{padding:'5px 11px',fontSize:'.76rem'}} onClick={onClose}>✕</button>
        </div>
        {/* Column headers */}
        <div style={{display:'grid',gridTemplateColumns:'76px 1fr 1fr',gap:8,marginBottom:12}}>
          <div/>
          {[a, b].map((r, i) => (
            <div key={r.id} className="tap" style={{textAlign:'center',padding:'9px 6px',borderRadius:10,background:'rgba(249,115,22,.06)',border:'1px solid rgba(249,115,22,.15)',cursor:'pointer'}}
              onClick={() => { onClose(); onOpenRun(r); }}>
              <div style={{fontSize:'.62rem',fontWeight:700,color:'var(--or)',marginBottom:3,letterSpacing:'.06em'}}>{i===0?'RUN A':'RUN B'}</div>
              <div style={{fontSize:'.76rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
              <div style={{fontSize:'.6rem',color:'var(--tx3)',marginTop:2}}>{fmtDateS(r.date)}</div>
            </div>
          ))}
        </div>
        {/* Stat rows */}
        {rows.map(row => (
          <div key={row.label} style={{display:'grid',gridTemplateColumns:'76px 1fr 1fr',gap:8,marginBottom:8}}>
            <div style={{fontSize:'.72rem',color:'var(--tx2)',display:'flex',alignItems:'center'}}>{row.label}</div>
            {[{v:row.va,w:row.winner==='a'},{v:row.vb,w:row.winner==='b'}].map((cell,i) => (
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
