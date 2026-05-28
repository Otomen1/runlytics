import React, { useState, useRef, useEffect } from 'react';
import { ShareCard } from './ShareCard.jsx';
import { downloadExport } from '../../utils/canvas.js';
import { SHARE_TEMPLATES } from '../../constants/canvas.js';

export function ShareModal({act,onClose,onOpenEditor}){
  const[idx,setIdx]=useState(0);
  const[exportState,setExportState]=useState('idle'); // idle|exporting|success
  const[exportFmt,setExportFmt]=useState('');
  const[mounted,setMounted]=useState(false);
  const scrollRef=useRef(null);
  const slideRefs=useRef([]);
  const rafRef=useRef(null);
  const scrollTimerRef=useRef(null);
  const successTimerRef=useRef(null); // tracked so we can cancel if modal unmounts

  useEffect(()=>{const t=requestAnimationFrame(()=>setMounted(true));return()=>cancelAnimationFrame(t);},[]);

  // Escape key closes the modal
  useEffect(()=>{
    const onKey=e=>{if(e.key==='Escape')onClose();};
    document.addEventListener('keydown',onKey);
    return()=>document.removeEventListener('keydown',onKey);
  },[onClose]);

  // Clean up the success-state timer if the modal unmounts mid-countdown
  useEffect(()=>()=>{
    clearTimeout(successTimerRef.current);
    cancelAnimationFrame(rafRef.current);
    clearTimeout(scrollTimerRef.current);
  },[]);

  // Depth carousel: scale slides via direct DOM manipulation to avoid React re-renders on every scroll frame
  useEffect(()=>{
    if(!mounted||!scrollRef.current)return;
    const carousel=scrollRef.current;
    const N=SHARE_TEMPLATES.length;

    const updateScales=()=>{
      const{scrollLeft,offsetWidth}=carousel;
      if(!offsetWidth)return;
      const pos=scrollLeft/offsetWidth;
      slideRefs.current.forEach((el,i)=>{
        if(!el)return;
        const dist=Math.min(Math.abs(i-pos),1);
        el.style.transform=`scale(${(1-dist*0.09).toFixed(3)})`;
        el.style.opacity=(1-dist*0.28).toFixed(3);
      });
      // Clamp to [0, N-1] so SHARE_TEMPLATES[idx] is always defined
      setIdx(Math.max(0,Math.min(N-1,Math.round(pos))));
    };

    const onScroll=()=>{
      slideRefs.current.forEach(el=>{if(el)el.style.transition='none';});
      cancelAnimationFrame(rafRef.current);
      rafRef.current=requestAnimationFrame(updateScales);
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current=setTimeout(()=>{
        slideRefs.current.forEach(el=>{if(el)el.style.transition='transform .3s ease,opacity .3s ease';});
      },150);
    };

    carousel.addEventListener('scroll',onScroll,{passive:true});
    updateScales();
    return()=>{
      carousel.removeEventListener('scroll',onScroll);
      cancelAnimationFrame(rafRef.current);
      clearTimeout(scrollTimerRef.current);
    };
  },[mounted]);

  if(!act||typeof act.distanceKm!=='number')return(
    <div style={SHARE_UI.shell}><button className="share-close" style={{position:"absolute",top:16,right:16,zIndex:10}} onClick={onClose}>✕</button></div>
  );

  const jumpTo=i=>{
    if(!scrollRef.current)return;
    // Restore transitions before programmatic scroll
    slideRefs.current.forEach(el=>{if(el)el.style.transition='transform .3s ease,opacity .3s ease';});
    scrollRef.current.scrollTo({left:i*scrollRef.current.offsetWidth,behavior:'smooth'});
    setIdx(i);
  };

  const doExport=async fmt=>{
    if(exportState!=='idle')return;
    setExportFmt(fmt);setExportState('exporting');
    try{
      await downloadExport(act,SHARE_TEMPLATES[idx].id,fmt);
      setExportState('success');
      successTimerRef.current=setTimeout(()=>setExportState('idle'),2500);
    }catch{setExportState('error');successTimerRef.current=setTimeout(()=>setExportState('idle'),3000);}
  };

  const tmpl=SHARE_TEMPLATES[idx];

  return(
    <div style={SHARE_UI.shell}>
      <button className="share-close" style={{position:"absolute",top:16,right:16,zIndex:10,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}} onClick={onClose}>✕</button>

      {/* Depth carousel — previews scale with scroll position via direct DOM manipulation */}
      <div ref={scrollRef} style={SHARE_UI.carousel}>
        {mounted?SHARE_TEMPLATES.map((t,i)=>(
          <div key={t.id} style={SHARE_UI.slide}>
            {/* This div receives direct style mutations from the scroll RAF */}
            <div ref={el=>slideRefs.current[i]=el}
              style={{transition:'transform .3s ease,opacity .3s ease',willChange:'transform,opacity',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
              {/* Floating wrapper — active card gently bobs when carousel is settled */}
              <div style={{animation:i===idx?'floatCard 4.2s ease-in-out infinite':'none',willChange:'transform'}}>
                <ShareCard type={t.id} act={act}/>
              </div>
            </div>
          </div>
        )):(
          <div style={{minWidth:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{...SHARE_UI.skeleton,
              background:'linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.09) 50%,rgba(255,255,255,.04) 75%)',
              backgroundSize:'400% 100%',animation:'shimmer 1.8s ease-in-out infinite'}}/>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div style={{...SHARE_UI.footer, paddingBottom:'max(30px, calc(env(safe-area-inset-bottom) + 12px))' }}>

        {/* Template label — re-animates on idx change via key */}
        <div key={tmpl.id} style={{textAlign:'center',marginBottom:14,animation:'slideDown .2s ease'}}>
          <div style={{fontSize:'1rem',fontWeight:700,color:'#fff',letterSpacing:'.02em',lineHeight:1.2}}>{tmpl.label}</div>
          <div style={{fontSize:'.65rem',color:'rgba(255,255,255,.28)',marginTop:4,letterSpacing:'.1em'}}>
            {tmpl.sub} · {idx+1} of {SHARE_TEMPLATES.length}
          </div>
        </div>

        {/* Dot indicators — tappable with press feedback */}
        <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:5,marginBottom:18}}>
          {SHARE_TEMPLATES.map((_,i)=>(
            <button key={i} onClick={()=>jumpTo(i)}
              style={{background:'none',border:'none',padding:5,cursor:'pointer',display:'flex',alignItems:'center',
                WebkitTapHighlightColor:'transparent'}}
              onPointerDown={e=>e.currentTarget.style.transform='scale(.75)'}
              onPointerUp={e=>e.currentTarget.style.transform='scale(1)'}
              onPointerLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              <div style={SHARE_UI.dot(i===idx)}/>
            </button>
          ))}
        </div>

        {/* Export — three distinct states: idle → exporting → success */}
        {exportState==='idle'&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:8,animation:'slideUp2 .22s ease'}}>
            <button className="btn b-or" style={{padding:'14px',fontSize:'.84rem',borderRadius:14,fontWeight:700,letterSpacing:'.03em'}}
              onClick={()=>doExport('jpg')}>Save JPEG</button>
            <button className="btn b-gh" style={{padding:'14px',fontSize:'.84rem',borderRadius:14,fontWeight:600}}
              onClick={()=>doExport('png')}>Save PNG</button>
          </div>
        )}
        {exportState==='exporting'&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'14px',
            borderRadius:14,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',
            marginBottom:8}}>
            <div className="spinner" style={{borderTopColor:'#f97316'}}/>
            <span style={{color:'rgba(255,255,255,.52)',fontSize:'.84rem'}}>
              Preparing {exportFmt.toUpperCase()}…
            </span>
          </div>
        )}
        {exportState==='error'&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'14px',
            borderRadius:14,background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',
            marginBottom:8,animation:'slideUp2 .22s ease'}}>
            <span style={{fontSize:'1rem'}}>⚠️</span>
            <span style={{color:'#f87171',fontSize:'.84rem',fontWeight:600}}>Export failed — try again</span>
          </div>
        )}
        {exportState==='success'&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'14px',
            borderRadius:14,background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.22)',
            marginBottom:8,animation:'successPop .4s ease'}}>
            <span style={{fontSize:'1.15rem',animation:'bounceIn .45s cubic-bezier(.34,1.56,.64,1)'}}>✓</span>
            <span style={{color:'#22c55e',fontSize:'.84rem',fontWeight:600}}>Saved to downloads</span>
          </div>
        )}

        {/* Custom editor entry */}
        {onOpenEditor&&(
          <button onClick={()=>onOpenEditor(act)}
            style={{width:'100%',padding:'10px',borderRadius:12,border:'1px solid rgba(255,255,255,.1)',
              background:'transparent',color:'rgba(255,255,255,.4)',fontSize:'.76rem',cursor:'pointer',
              fontFamily:'inherit',fontWeight:500,letterSpacing:'.04em',
              display:'flex',alignItems:'center',justifyContent:'center',gap:7,
              transition:'color .15s,border-color .15s'}}
            onPointerEnter={e=>{e.currentTarget.style.color='rgba(255,255,255,.65)';e.currentTarget.style.borderColor='rgba(255,255,255,.2)';}}
            onPointerLeave={e=>{e.currentTarget.style.color='rgba(255,255,255,.4)';e.currentTarget.style.borderColor='rgba(255,255,255,.1)';}}>
            <span style={{fontSize:'.88rem'}}>🎨</span> Custom Editor — full control
          </button>
        )}
        <div style={{textAlign:'center',marginTop:8,fontSize:'.6rem',color:'rgba(255,255,255,.13)',letterSpacing:'.08em'}}>
          1080 × 1920 · Instagram Story size
        </div>
      </div>
    </div>
  );
}
