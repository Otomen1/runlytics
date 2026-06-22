import React, { useState, useMemo, useRef } from 'react';
import { SHOES_KEY } from '../../constants/keys.js';
import { lsGetV, lsSetV } from '../../utils/storage.js';
import { DEFAULT_SHOE_MAX_KM, SHOE_WARN_THRESHOLD } from '../../constants/limits.js';
import { fmtDateS } from '../../utils/formatters.js';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';

const COLORS = ['#f97316','#22c55e','#3b82f6','#8b5cf6','#ef4444','#eab308','#06b6d4','#ec4899'];

function loadShoes() { return lsGetV(SHOES_KEY, [], raw => Array.isArray(raw) ? raw : []); }
function saveShoes(s) { lsSetV(SHOES_KEY, s); }

export function ShoeTracker({ acts, onClose }) {
  const containerRef = useRef(null);
  useFocusTrap(containerRef);
  const [shoes, setShoes] = useState(loadShoes);
  const [view, setView] = useState('list'); // 'list' | 'new' | shoe.id

  const shoeKm = useMemo(() => {
    const map = {};
    acts.forEach(a => { if (a.shoeId) map[a.shoeId] = (map[a.shoeId]||0) + a.distanceKm; });
    return map;
  }, [acts]);

  const lastUsed = useMemo(() => {
    const map = {};
    acts.forEach(a => {
      if (a.shoeId && (!map[a.shoeId] || a.date > map[a.shoeId])) map[a.shoeId] = a.date;
    });
    return map;
  }, [acts]);

  function update(next) { setShoes(next); saveShoes(next); }

  const editing = view === 'list' || view === 'new' ? null : shoes.find(s => s.id === view);

  if (view !== 'list') {
    return (
      <div ref={containerRef} style={shell}>
        <div className="glass" style={{padding:'14px 18px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
          <button className="tap" style={{background:'none',border:'none',color:'var(--tx2)',fontSize:'1.1rem',cursor:'pointer'}} onClick={() => setView('list')}>‹</button>
          <div className="screen-title">{view==='new'?'Add Shoe':'Edit Shoe'}</div>
        </div>
        <ShoeForm shoe={editing}
          onSave={data => {
            if (view === 'new') {
              update([...shoes, { ...data, id: Date.now().toString(), addedDate: new Date().toISOString().slice(0,10), active: true }]);
            } else {
              update(shoes.map(s => s.id === view ? { ...s, ...data } : s));
            }
            setView('list');
          }}
          onRetire={editing ? () => { update(shoes.map(s => s.id===view?{...s,active:false}:s)); setView('list'); } : null}
          onDelete={editing ? () => { update(shoes.filter(s => s.id!==view)); setView('list'); } : null}
          onCancel={() => setView('list')}
        />
      </div>
    );
  }

  const active = shoes.filter(s => s.active !== false);
  const retired = shoes.filter(s => s.active === false);

  return (
    <div ref={containerRef} style={shell}>
      <div className="glass" style={{padding:'14px 18px',borderBottom:'1px solid var(--bd)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div className="screen-title">👟 Shoe Tracker</div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn b-or" style={{padding:'6px 13px',fontSize:'.8rem'}} onClick={() => setView('new')}>+ Add</button>
          <button className="btn b-gh" style={{padding:'6px 13px',fontSize:'.8rem'}} onClick={onClose}>✕ Close</button>
        </div>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'16px 18px 40px',display:'flex',flexDirection:'column',gap:10}}>
        {shoes.length === 0 && (
          <div style={{textAlign:'center',padding:'56px 0',color:'var(--tx2)'}}>
            <div style={{fontSize:'3rem',marginBottom:14}}>👟</div>
            <div style={{fontWeight:700,color:'var(--tx)',marginBottom:8}}>No shoes tracked yet</div>
            <div style={{fontSize:'.8rem',lineHeight:1.6,marginBottom:20}}>Add your shoes to track mileage and know when to replace them.</div>
            <button className="btn b-or" style={{padding:'11px 24px'}} onClick={() => setView('new')}>Add First Shoe</button>
          </div>
        )}

        {active.map(shoe => {
          const km = shoeKm[shoe.id] || 0;
          const pct = Math.min(1, km / (shoe.maxKm || DEFAULT_SHOE_MAX_KM));
          const warn = pct >= SHOE_WARN_THRESHOLD;
          const last = lastUsed[shoe.id];
          return (
            <button key={shoe.id} className="card tap" style={{padding:16,cursor:'pointer',borderLeft:`4px solid ${shoe.color||'var(--or)'}`,width:'100%',textAlign:'left',background:'none',border:`1px solid var(--bd)`,borderLeft:`4px solid ${shoe.color||'var(--or)'}`}} onClick={() => setView(shoe.id)} aria-label={`Edit ${shoe.name}`}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:'.92rem',marginBottom:2}}>{shoe.name}</div>
                  {shoe.brand && <div style={{fontSize:'.72rem',color:'var(--tx3)'}}>{shoe.brand}</div>}
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:'1.1rem',fontWeight:800,color:warn?'var(--rd)':shoe.color||'var(--or)'}}>{Math.round(km)} km</div>
                  <div style={{fontSize:'.62rem',color:'var(--tx3)'}}> / {shoe.maxKm||DEFAULT_SHOE_MAX_KM} km</div>
                </div>
              </div>
              <div style={{height:7,borderRadius:4,background:'var(--bd)',overflow:'hidden',marginBottom:6}}>
                <div style={{height:'100%',borderRadius:4,background:warn?'var(--rd)':shoe.color||'var(--or)',width:(pct*100)+'%',transition:'width .4s ease'}}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                {warn
                  ? <span style={{fontSize:'.7rem',color:'var(--rd)',fontWeight:600}}>⚠️ Consider replacing soon</span>
                  : <span style={{fontSize:'.7rem',color:'var(--tx3)'}}>{Math.round((shoe.maxKm||DEFAULT_SHOE_MAX_KM)-km)} km remaining</span>}
                {last && <span style={{fontSize:'.68rem',color:'var(--tx3)'}}>Last: {fmtDateS(last)}</span>}
              </div>
            </button>
          );
        })}

        {retired.length > 0 && (
          <>
            <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--tx3)',letterSpacing:'.06em',textTransform:'uppercase',marginTop:8,padding:'0 2px'}}>Retired</div>
            {retired.map(shoe => (
              <button key={shoe.id} className="card tap" style={{padding:14,opacity:.55,cursor:'pointer',width:'100%',textAlign:'left',background:'none',border:'1px solid var(--bd)'}} onClick={() => setView(shoe.id)} aria-label={`Edit retired shoe ${shoe.name}`}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:'.88rem'}}>{shoe.name}</div>
                    <div style={{fontSize:'.7rem',color:'var(--tx3)'}}>{Math.round(shoeKm[shoe.id]||0)} km logged</div>
                  </div>
                  <span style={{fontSize:'.72rem',color:'var(--tx3)'}}>Retired</span>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ShoeForm({ shoe, onSave, onRetire, onDelete, onCancel }) {
  const [name, setName]     = useState(shoe?.name || '');
  const [brand, setBrand]   = useState(shoe?.brand || '');
  const [color, setColor]   = useState(shoe?.color || COLORS[0]);
  const [maxKm, setMaxKm]   = useState(shoe?.maxKm || DEFAULT_SHOE_MAX_KM);

  return (
    <div style={{flex:1,overflowY:'auto',padding:'20px 18px 40px',display:'flex',flexDirection:'column',gap:14}}>
      <div>
        <label style={{fontSize:'.76rem',fontWeight:600,display:'block',marginBottom:7}}>Shoe name *</label>
        <input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Nike Pegasus 40"/>
      </div>
      <div>
        <label style={{fontSize:'.76rem',fontWeight:600,display:'block',marginBottom:7}}>Brand</label>
        <input className="inp" value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Nike, Adidas, ASICS…"/>
      </div>
      <div>
        <label style={{fontSize:'.76rem',fontWeight:600,display:'block',marginBottom:7}}>Replacement distance (km)</label>
        <input className="inp" type="number" min="100" max="2000" value={maxKm} onChange={e => setMaxKm(Number(e.target.value))}/>
        <div style={{fontSize:'.72rem',color:'var(--tx3)',marginTop:5}}>Recommended: 500–800 km for most running shoes</div>
      </div>
      <div>
        <label style={{fontSize:'.76rem',fontWeight:600,display:'block',marginBottom:10}}>Colour</label>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={color===c}
              style={{width:28,height:28,borderRadius:'50%',background:c,cursor:'pointer',border:color===c?`3px solid #fff`:'3px solid transparent',boxShadow:color===c?`0 0 0 2px ${c}`:'none',transition:'all .15s',padding:0}}/>
          ))}
        </div>
      </div>
      <button className="btn b-or" style={{width:'100%',padding:'13px',marginTop:4}} onClick={() => { if (!name.trim()) return; onSave({ name: name.trim(), brand: brand.trim(), color, maxKm }); }}>
        {shoe ? 'Save Changes' : 'Add Shoe'}
      </button>
      {onRetire && shoe?.active !== false && (
        <button className="btn b-gh" style={{width:'100%',padding:'11px',fontSize:'.82rem'}} onClick={onRetire}>🏁 Retire This Shoe</button>
      )}
      {onDelete && (
        <button className="btn b-rd" style={{width:'100%',padding:'11px',fontSize:'.82rem'}} onClick={() => { if (window.confirm('Delete this shoe?')) onDelete(); }}>🗑 Delete</button>
      )}
      <button className="tap" style={{background:'none',border:'none',color:'var(--tx2)',fontSize:'.82rem',padding:'8px',cursor:'pointer',textAlign:'center'}} onClick={onCancel}>Cancel</button>
    </div>
  );
}

const shell = {position:'fixed',inset:0,zIndex:220,background:'var(--bg)',display:'flex',flexDirection:'column'};
