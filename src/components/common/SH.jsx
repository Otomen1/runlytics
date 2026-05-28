import React from 'react';
export const SH=({title,sub})=>(
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
    <div className="sl">{title}</div>
    {sub&&<div style={{fontSize:".66rem",color:"var(--tx3)"}}>{sub}</div>}
  </div>
);
