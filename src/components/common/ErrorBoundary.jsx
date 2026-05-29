import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={crashed:false,msg:''}; }
  static getDerivedStateFromError(e){ return{crashed:true,msg:e?.message||'Unknown error'}; }
  componentDidCatch(e,info){ console.error('[ErrorBoundary]',e,info); }
  render(){
    if(!this.state.crashed)return this.props.children;
    return(
      <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#06080f',padding:24,gap:16}}>
        <div style={{fontSize:'2.5rem'}}>💥</div>
        <div style={{fontWeight:700,fontSize:'1.05rem',color:'#d8e6f7'}}>Something went wrong</div>
        <div style={{fontSize:'.78rem',color:'#6e8aab',textAlign:'center',lineHeight:1.6,background:'#0b0f1a',border:'1px solid #1c2538',borderRadius:10,padding:'10px 14px',maxWidth:320,wordBreak:'break-word'}}>{this.state.msg}</div>
        <button onClick={()=>window.location.reload()}
          style={{marginTop:8,background:'linear-gradient(135deg,#f97316,#ea580c)',color:'#fff',border:'none',borderRadius:12,padding:'12px 28px',fontWeight:700,fontSize:'.88rem',cursor:'pointer',fontFamily:'inherit'}}>
          Reload App
        </button>
      </div>
    );
  }
}
