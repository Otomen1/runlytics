import React, { useCallback } from 'react';
import { Ring } from '../common/Ring.jsx';
import { getMafHR } from '../../utils/analytics.js';
import { todayKey } from '../../utils/formatters.js';
import { getStreak } from '../../utils/activity.js';
import { TASKS_KEY } from '../../constants/keys.js';

function saveTasks(t){try{localStorage.setItem(TASKS_KEY,JSON.stringify(t));}catch(e){}}

export function TasksTab({tasks,setTasks,hrProfile}){
  const todayStr=todayKey();const mafHR=getMafHR(hrProfile);
  const toggle=useCallback(id=>{
    setTasks(prev=>{
      const updated=prev.map(t=>{
        if(t.id!==id)return t;
        const done=!!(t.completions&&t.completions[todayStr]);
        const completions=Object.assign({},t.completions||{});
        if(done){delete completions[todayStr];}else{completions[todayStr]=true;}
        // FIX #4: getStreak is now defined above
        return Object.assign({},t,{completions,streak:getStreak(completions)});
      });
      saveTasks(updated);return updated;
    });
  },[todayStr]);
  const todayDone=tasks.filter(t=>t.enabled&&t.completions&&t.completions[todayStr]).length;
  const totalEnabled=tasks.filter(t=>t.enabled).length;
  const last7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));d.setHours(0,0,0,0);return{key:d.toISOString().split("T")[0],label:d.toLocaleDateString("en-GB",{weekday:"short"}).slice(0,1)};});
  return(
    <div style={{padding:"10px 0 32px"}}>
      <div className="a0" style={{marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8}}>
          <div>
            <div className="sl" style={{marginBottom:4}}>Today's Habits</div>
            <div style={{fontSize:"1.3rem",fontWeight:700,lineHeight:1}}>
              <span style={{color:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}>{todayDone}</span>
              <span style={{fontSize:".9rem",color:"var(--tx2)",fontWeight:400}}> / {totalEnabled}</span>
            </div>
          </div>
          <Ring pct={totalEnabled>0?todayDone/totalEnabled:0} size={50} color={todayDone===totalEnabled?"var(--gn)":"var(--or)"}>
            <span style={{fontSize:".55rem",fontWeight:700,color:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}>{(totalEnabled>0?Math.round(todayDone/totalEnabled*100):0)+"%"}</span>
          </Ring>
        </div>
        <div className="pb" style={{height:4}}><div className="pf" style={{width:(totalEnabled>0?Math.round(todayDone/totalEnabled*100):0)+"%",background:todayDone===totalEnabled?"var(--gn)":"var(--or)"}}/></div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {tasks.filter(t=>t.enabled).map((task,i)=>{
          const done=!!(task.completions&&task.completions[todayStr]);
          // FIX #16: Handle missing icon/category/desc from old localStorage data
          const taskIcon=task.icon||"🏃";
          const detail=task.category==="hr"&&hrProfile&&hrProfile.age?"MAF = "+mafHR+" bpm · Stay below this":(task.desc||"");
          return(
            <div key={task.id} className={"card tap a"+(i<4?i:3)}
              style={{padding:"14px 15px",borderColor:done?task.color+"30":"var(--bd)",background:done?task.color+"08":"var(--s1)",transition:"all .2s",cursor:"pointer"}}
              onClick={()=>toggle(task.id)}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <div style={{width:24,height:24,borderRadius:7,flexShrink:0,marginTop:1,border:"2.5px solid "+(done?task.color:"var(--bd2)"),background:done?task.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {done&&<span style={{color:"#fff",fontSize:".65rem",fontWeight:700}}>✓</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div>
                      <div style={{fontSize:".88rem",fontWeight:600,textDecoration:done?"line-through":"none",color:done?"var(--tx2)":"var(--tx)",marginBottom:2}}>{taskIcon} {task.title}</div>
                      {detail&&<div style={{fontSize:".72rem",color:"var(--tx3)",lineHeight:1.4}}>{detail}</div>}
                    </div>
                    {task.streak>0&&<div style={{textAlign:"center",flexShrink:0}}><div style={{fontSize:".7rem",fontWeight:700,color:"var(--or)"}}>{task.streak}🔥</div></div>}
                  </div>
                  <div style={{display:"flex",gap:5,marginTop:9}}>
                    {last7.map(({key,label})=>{const comp=!!(task.completions&&task.completions[key]),isToday=key===todayStr;return(
                      <div key={key} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:comp?task.color:isToday?"var(--bd2)":"var(--bd)",flexShrink:0}}/>
                        <div style={{fontSize:".6rem",color:isToday?"var(--tx2)":"var(--tx3)",fontWeight:isToday?600:400}}>{label}</div>
                      </div>
                    );})}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

