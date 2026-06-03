import React, { useMemo } from 'react';
import { SH } from '../common/SH.jsx';
import { Ring } from '../common/Ring.jsx';
import { getMafHR, getMafZones, computeZones } from '../../utils/analytics.js';

function StreakCalendar({ acts }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const runDays = useMemo(() => {
    const s = new Set();
    acts.forEach(a => { if (a.date && a.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)) s.add(+a.date.slice(8,10)); });
    return s;
  }, [acts, year, month]);
  const todayD = now.getDate();
  // Build grid cells: empty slots + day cells
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  return (
    <div className="card a1" style={{padding:16,marginBottom:14}}>
      <SH title="Streak Calendar" sub={monthLabel}/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:6}}>
        {DAY_LABELS.map(d=>(
          <div key={d} style={{textAlign:'center',fontSize:'.58rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.04em',paddingBottom:4}}>{d}</div>
        ))}
        {cells.map((d,i)=> d===null ? <div key={'e'+i}/> : (
          <div key={d} style={{
            aspectRatio:'1',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:'.7rem',fontWeight:d===todayD?700:400,
            background: runDays.has(d) ? 'var(--or)' : d===todayD ? 'var(--bd)' : 'transparent',
            color: runDays.has(d) ? '#fff' : d===todayD ? 'var(--tx)' : d<todayD ? 'var(--tx2)' : 'var(--tx3)',
            border: d===todayD&&!runDays.has(d) ? '1px solid var(--bd2)' : 'none',
          }}>{d}</div>
        ))}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:8}}>
        <div style={{width:10,height:10,borderRadius:3,background:'var(--or)'}}/>
        <span style={{fontSize:'.7rem',color:'var(--tx2)'}}>{runDays.size} run day{runDays.size!==1?'s':''} this month</span>
      </div>
    </div>
  );
}

export function HRTab({acts,hrProfile,onEditHR}){
  const mafHR=getMafHR(hrProfile);
  const runsWithHR=acts.filter(a=>a.avgHR&&a.distanceKm>0);
  const last5=runsWithHR.slice(0,5);
  const aggZones=useMemo(()=>{
    if(!last5.length)return null;
    const secs=[0,0,0,0,0];let tot=0;
    last5.forEach(r=>{const z=computeZones(r.hrSamples,mafHR);if(z)z.forEach((zone,i)=>{secs[i]+=(zone.seconds||0);tot+=(zone.seconds||0);});});
    if(!tot)return null;
    return getMafZones(mafHR).map((z,i)=>({...z,pct:Math.round(secs[i]/tot*100),minutes:parseFloat((secs[i]/60).toFixed(1))}));
  },[last5,mafHR]);
  return(
    <div style={{padding:"4px 0 32px"}}>
      <StreakCalendar acts={acts}/>
      <div className="card a0" style={{padding:20,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:64,height:64,borderRadius:18,background:"rgba(249,115,22,.1)",border:"1px solid rgba(249,115,22,.2)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontSize:"1.4rem",fontWeight:700,color:"var(--or)",lineHeight:1}}>{mafHR}</div>
            <div style={{fontSize:".5rem",color:"var(--or)",opacity:.7,marginTop:2}}>BPM</div>
          </div>
          <div style={{flex:1}}>
            <div className="sl" style={{marginBottom:4}}>MAF Heart Rate</div>
            <div style={{fontWeight:700,fontSize:"var(--fs-base)",marginBottom:4}}>Aerobic Zone Target</div>
            <div style={{fontSize:".74rem",color:"var(--tx2)",lineHeight:1.5}}>{hrProfile&&hrProfile.age?"180 − "+hrProfile.age+" = "+mafHR+" bpm":"Set age in Settings"}</div>
          </div>
        </div>
        {!(hrProfile&&hrProfile.age)&&<button className="btn b-or" style={{width:"100%",marginTop:14,padding:"10px",fontSize:".86rem"}} onClick={onEditHR}>Set Up MAF Profile →</button>}
      </div>
      {aggZones&&(
        <div className="card a1" style={{padding:16,marginBottom:14}}>
          <SH title="Zone Distribution" sub={"Last "+last5.length+" runs"}/>
          {aggZones.map((z,i)=>(
            <div key={z.zone} style={{marginBottom:i<4?11:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:10,height:10,borderRadius:3,background:z.color,flexShrink:0}}/>
                  <span style={{fontSize:".8rem",fontWeight:600}}>{z.zone}</span>
                  <span style={{fontSize:".72rem",color:"var(--tx2)"}}>{z.label}</span>
                </div>
                <span style={{fontSize:".88rem",color:z.color,fontWeight:700}}>{z.pct}%</span>
              </div>
              <div className="pb"><div className="pf" style={{width:z.pct+"%",background:z.color}}/></div>
            </div>
          ))}
        </div>
      )}
      {!runsWithHR.length&&(
        <div style={{textAlign:"center",padding:"40px 0 20px"}}>
          <div style={{fontSize:"2.8rem",marginBottom:14}}>❤️</div>
          <div style={{fontWeight:700,fontSize:"var(--fs-lg)",marginBottom:8}}>No HR data yet</div>
          <div style={{fontSize:".84rem",color:"var(--tx2)",marginBottom:6,lineHeight:1.65,maxWidth:260,margin:"0 auto 8px"}}>
            {!acts.length
              ? "Log your first run to see heart-rate zones and MAF coaching."
              : "Your runs don't have HR data. Use a chest strap or wrist sensor and re-upload with HR samples."}
          </div>
          {!acts.length
            ? <div style={{fontSize:".74rem",color:"var(--tx3)",marginTop:12}}>Upload a GPX or connect Strava to get started.</div>
            : <button className="btn b-or" style={{padding:"10px 22px",marginTop:16}} onClick={onEditHR}>Adjust MAF Profile →</button>
          }
        </div>
      )}
    </div>
  );
}
