import React, { useState } from 'react';
import { ONBOARDING_KEY } from '../../constants/keys.js';

export function Onboarding({ profile, goals, onComplete, onUpload, onStravaConnect }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(profile?.name === 'Runner' ? '' : (profile?.name || ''));
  const [weeklyGoal, setWeeklyGoal] = useState(goals?.weekly || 40);

  const finish = (action) => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    onComplete({ name: name.trim() || 'Runner', weeklyGoal });
    if (action === 'upload') onUpload();
    else if (action === 'strava') onStravaConnect();
  };

  return (
    <div style={{position:'fixed',inset:0,zIndex:300,background:'var(--bg)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px 20px'}}>
      <div style={{display:'flex',gap:6,marginBottom:40}}>
        {[1,2,3].map(s=>(
          <div key={s} style={{height:6,borderRadius:3,background:s<=step?'var(--or)':'var(--bd)',width:s===step?24:7,transition:'all .3s'}}/>
        ))}
      </div>

      {step===1&&(
        <div style={{width:'100%',maxWidth:340,animation:'fadeUp .3s ease both'}}>
          <div style={{fontSize:'2.6rem',textAlign:'center',marginBottom:16}}>🏃</div>
          <h1 style={{fontSize:'1.4rem',fontWeight:800,textAlign:'center',marginBottom:8}}>Welcome to Runlytics</h1>
          <p style={{fontSize:'.86rem',color:'var(--tx2)',textAlign:'center',marginBottom:32,lineHeight:1.65}}>Your personal running journal. Let's get set up in 3 quick steps.</p>
          <label style={{fontSize:'.76rem',fontWeight:600,color:'var(--tx2)',display:'block',marginBottom:7}}>What should we call you?</label>
          <input className="inp" placeholder="Your name" value={name} onChange={e=>setName(e.target.value)}
            style={{marginBottom:24}} onKeyDown={e=>e.key==='Enter'&&setStep(2)} autoFocus/>
          <button className="btn b-or" style={{width:'100%',padding:'13px',fontSize:'.92rem'}} onClick={()=>setStep(2)}>
            Continue →
          </button>
        </div>
      )}

      {step===2&&(
        <div style={{width:'100%',maxWidth:340,animation:'fadeUp .3s ease both'}}>
          <div style={{fontSize:'2.6rem',textAlign:'center',marginBottom:16}}>🎯</div>
          <h1 style={{fontSize:'1.3rem',fontWeight:800,textAlign:'center',marginBottom:8}}>Set your weekly goal</h1>
          <p style={{fontSize:'.86rem',color:'var(--tx2)',textAlign:'center',marginBottom:28,lineHeight:1.65}}>How many kilometres do you aim to run each week?</p>
          <div style={{textAlign:'center',marginBottom:16}}>
            <span style={{fontSize:'3rem',fontWeight:800,color:'var(--or)'}}>{weeklyGoal}</span>
            <span style={{fontSize:'1rem',color:'var(--tx2)',marginLeft:6}}>km / week</span>
          </div>
          <input type="range" min={5} max={200} step={5} value={weeklyGoal}
            onChange={e=>setWeeklyGoal(Number(e.target.value))}
            style={{width:'100%',marginBottom:12,accentColor:'var(--or)'}}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:'.68rem',color:'var(--tx3)',marginBottom:28}}>
            <span>5 km</span><span>200 km</span>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button className="btn b-gh" style={{flex:1,padding:'12px'}} onClick={()=>setStep(1)}>← Back</button>
            <button className="btn b-or" style={{flex:2,padding:'12px',fontSize:'.92rem'}} onClick={()=>setStep(3)}>Continue →</button>
          </div>
        </div>
      )}

      {step===3&&(
        <div style={{width:'100%',maxWidth:340,animation:'fadeUp .3s ease both'}}>
          <div style={{fontSize:'2.6rem',textAlign:'center',marginBottom:16}}>📊</div>
          <h1 style={{fontSize:'1.3rem',fontWeight:800,textAlign:'center',marginBottom:8}}>Add your first run</h1>
          <p style={{fontSize:'.86rem',color:'var(--tx2)',textAlign:'center',marginBottom:32,lineHeight:1.65}}>Import a GPX file from your GPS watch, or sync directly from Strava.</p>
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:20}}>
            <button className="btn b-or" style={{width:'100%',padding:'13px',fontSize:'.92rem'}} onClick={()=>finish('upload')}>
              📁 Upload GPX File
            </button>
            <button className="btn b-gh" style={{width:'100%',padding:'13px',fontSize:'.92rem'}} onClick={()=>finish('strava')}>
              🔗 Connect Strava
            </button>
          </div>
          <button style={{display:'block',margin:'0 auto',background:'none',border:'none',color:'var(--tx3)',fontSize:'.78rem',cursor:'pointer',padding:'8px'}}
            onClick={()=>finish(null)}>
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
