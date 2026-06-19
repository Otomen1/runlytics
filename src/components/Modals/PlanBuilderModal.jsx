import React, { useState, useMemo } from 'react';
import { PLAN_KEY } from '../../constants/keys.js';
import { generatePlan, detectBaseKm, getPlanWeekNumber, getWeekDays } from '../../utils/trainingPlan.js';
import { weekOf, fmtKm } from '../../utils/formatters.js';

const RACES = [
  { id: '5K',      label: '5K',       sub: '3.1 miles',  icon: '⚡' },
  { id: '10K',     label: '10K',      sub: '6.2 miles',  icon: '🏃' },
  { id: 'HM',      label: 'Half',     sub: '13.1 miles', icon: '🌟' },
  { id: 'Marathon',label: 'Marathon', sub: '26.2 miles', icon: '🏆' },
];

const PHASE_COLORS = { base:'#3b82f6', build:'#f97316', taper:'#8b5cf6', race:'#22c55e' };

function weeksUntil(dateStr) {
  if (!dateStr) return 0;
  const race = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  return Math.round((race - now) / (7 * 86400000));
}

function minDate() {
  const d = new Date();
  d.setDate(d.getDate() + 56);
  return d.toISOString().slice(0, 10);
}

function maxDate() {
  const d = new Date();
  d.setDate(d.getDate() + 52 * 7);
  return d.toISOString().slice(0, 10);
}

function fmtRaceDate(str) {
  if (!str) return '';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PlanBuilderModal({ acts, analytics, onClose }) {
  const existingPlan = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(PLAN_KEY) || 'null'); } catch { return null; }
  }, []);

  const [view, setView] = useState(existingPlan ? 'existing' : 'wizard');
  const [step, setStep] = useState(1);
  const [raceType, setRaceType] = useState('HM');
  const [raceDate, setRaceDate] = useState('');
  const [baseKm, setBaseKm] = useState(() => detectBaseKm(analytics?.weeklyKm || []));
  const [plan, setPlan] = useState(existingPlan);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState(() => weekOf(Date.now()));

  const wksUntil = weeksUntil(raceDate);
  const dateOk = raceDate && wksUntil >= 8;

  function handleGenerate() {
    const p = generatePlan(raceType, raceDate, baseKm);
    localStorage.setItem(PLAN_KEY, JSON.stringify(p));
    setPlan(p);
    setView('existing');
  }

  function handleDelete() {
    localStorage.removeItem(PLAN_KEY);
    setPlan(null);
    setView('wizard');
    setStep(1);
    setConfirmDelete(false);
    onClose();
  }

  const today = weekOf(Date.now());
  const currentWeekNum = plan ? getPlanWeekNumber(plan, today) : null;

  return (
    <div style={{position:'fixed',inset:0,zIndex:260,background:'rgba(0,0,0,.55)',display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'var(--bg)',borderRadius:'20px 20px 0 0',maxHeight:'88vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:'1px solid var(--bd)',flexShrink:0}}>
          <button className="btn b-gh" style={{padding:'6px 12px',fontSize:'.8rem'}} onClick={onClose}>✕ Close</button>
          <span style={{fontSize:'.82rem',fontWeight:700,color:'var(--or)'}}>
            {view === 'existing' ? '🗓 Training Plan' : '🎯 Set Goal Race'}
          </span>
          <div style={{width:70}}/>
        </div>

        {view === 'existing' && plan && (
          <div style={{ overflowY: 'auto', padding: '16px 20px', paddingBottom:'calc(24px + env(safe-area-inset-bottom))', flex: 1 }}>
            <div style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--s2)', border: '1.5px solid var(--bd)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--or)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                    {plan.raceType === 'HM' ? 'Half Marathon' : plan.raceType}
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--tx)' }}>
                    {fmtRaceDate(plan.raceDate)}
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginTop: 3 }}>
                    {plan.weeks.length} weeks · base {fmtKm(plan.baseWeeklyKm)} km/wk
                  </div>
                </div>
                {currentWeekNum && (
                  <div style={{ textAlign: 'center', padding: '8px 12px', borderRadius: 10, background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.2)' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--or)', lineHeight: 1 }}>W{currentWeekNum}</div>
                    <div style={{ fontSize: '.52rem', color: 'var(--or)', letterSpacing: '.06em' }}>of {plan.weeks.length}</div>
                  </div>
                )}
              </div>
            </div>

            {plan.baseWarning && (
              <div style={{ background: 'rgba(234,179,8,.1)', border: '1px solid rgba(234,179,8,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '.78rem', color: 'var(--yw)', lineHeight: 1.55 }}>
                ⚠️ {plan.baseWarning}
              </div>
            )}

            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Week-by-Week Plan
            </div>

            {plan.weeks.map((w, i) => {
              const isCurrent = w.week === today;
              const isPast = w.week < today;
              const phaseColor = PHASE_COLORS[w.phase] || 'var(--or)';
              const isExpanded = expandedWeek === w.week;
              const days = isExpanded ? getWeekDays(w) : [];
              return (
                <div key={w.week} style={{ marginBottom: 4 }}>
                  {/* Week header row */}
                  <div
                    onClick={() => setExpandedWeek(isExpanded ? null : w.week)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px',
                      borderRadius: isExpanded ? '10px 10px 0 0' : 10,
                      background: isCurrent ? 'rgba(249,115,22,.08)' : 'var(--s2)',
                      border: isCurrent ? '1.5px solid rgba(249,115,22,.3)' : '1px solid var(--bd)',
                      borderBottom: isExpanded ? 'none' : undefined,
                      opacity: isPast && !isCurrent ? 0.6 : 1,
                      cursor: 'pointer',
                    }}>
                    <div style={{ width: 3, height: 32, borderRadius: 2, background: phaseColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '.75rem', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--tx)' : 'var(--tx2)' }}>
                          W{i + 1} · {w.week.slice(5)}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '.82rem', fontWeight: 700, color: phaseColor }}>{fmtKm(w.targetKm)} km</span>
                          <span style={{ fontSize: '.65rem', color: 'var(--tx3)' }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                        {w.easy > 0 && <span style={{ fontSize: '.6rem', color: '#3b82f6' }}>Easy ×{w.easy}</span>}
                        {w.long > 0 && <span style={{ fontSize: '.6rem', color: '#8b5cf6' }}>Long ×{w.long}</span>}
                        {w.workout > 0 && <span style={{ fontSize: '.6rem', color: '#f97316' }}>Workout ×{w.workout}</span>}
                        <span style={{ fontSize: '.6rem', color: 'var(--tx3)', marginLeft: 'auto', textTransform: 'capitalize' }}>{w.phase}</span>
                      </div>
                    </div>
                  </div>
                  {/* Expanded day schedule */}
                  {isExpanded && (
                    <div style={{
                      padding: '6px 12px 10px',
                      background: isCurrent ? 'rgba(249,115,22,.04)' : 'var(--s2)',
                      border: isCurrent ? '1.5px solid rgba(249,115,22,.3)' : '1px solid var(--bd)',
                      borderTop: 'none',
                      borderRadius: '0 0 10px 10px',
                    }}>
                      {days.map(day => (
                        <div key={day.date} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '5px 0',
                          borderBottom: day.dayOfWeek < 6 ? '1px solid var(--bd)' : 'none',
                        }}>
                          <span style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--tx3)', width: 26, flexShrink: 0 }}>{day.day}</span>
                          <span style={{ fontSize: '.82rem', width: 18, textAlign: 'center', flexShrink: 0 }}>{day.icon}</span>
                          <span style={{ fontSize: '.72rem', color: day.type === 'rest' ? 'var(--tx3)' : 'var(--tx)', flex: 1 }}>{day.label}</span>
                          {day.targetKm > 0 && (
                            <span style={{ fontSize: '.76rem', fontWeight: 700, color: day.color }}>{fmtKm(day.targetKm)} km</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="btn b-gh" style={{ flex: 1, fontSize: '.8rem', padding: '11px' }}
                onClick={() => { setView('wizard'); setStep(1); }}>
                Edit Plan
              </button>
              {confirmDelete ? (
                <button className="btn b-rd" style={{ flex: 1, fontSize: '.8rem', padding: '11px' }}
                  onClick={handleDelete}>
                  Confirm Delete
                </button>
              ) : (
                <button className="btn b-rd" style={{ flex: 1, fontSize: '.8rem', padding: '11px' }}
                  onClick={() => setConfirmDelete(true)}>
                  Delete Plan
                </button>
              )}
            </div>
          </div>
        )}

        {view === 'wizard' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px' }}>
              <div style={{ display: 'flex', gap: 5, marginBottom: 24, justifyContent: 'center' }}>
                {[1, 2, 3].map(s => (
                  <div key={s} style={{ height: 5, borderRadius: 3, background: s <= step ? 'var(--or)' : 'var(--bd)', width: s === step ? 24 : 7, transition: 'all .3s' }} />
                ))}
              </div>

              {step === 1 && (
                <div style={{ animation: 'fadeUp .22s ease both' }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--tx2)', marginBottom: 14 }}>Choose your goal race</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {RACES.map(r => (
                      <div key={r.id} className="tap"
                        onClick={() => setRaceType(r.id)}
                        style={{
                          padding: '18px 12px', borderRadius: 14, textAlign: 'center', cursor: 'pointer',
                          border: `1.5px solid ${raceType === r.id ? 'rgba(249,115,22,.6)' : 'var(--bd)'}`,
                          background: raceType === r.id ? 'rgba(249,115,22,.08)' : 'var(--s2)',
                          transition: 'all .15s',
                        }}>
                        <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>{r.icon}</div>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: raceType === r.id ? 'var(--or)' : 'var(--tx)' }}>{r.label}</div>
                        <div style={{ fontSize: '.65rem', color: 'var(--tx3)', marginTop: 2 }}>{r.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div style={{ animation: 'fadeUp .22s ease both' }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--tx2)', marginBottom: 6 }}>When is your race?</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginBottom: 14 }}>Minimum 8 weeks to build a proper plan</div>
                  <input
                    type="date"
                    className="inp"
                    value={raceDate}
                    min={minDate()}
                    max={maxDate()}
                    onChange={e => setRaceDate(e.target.value)}
                    style={{ marginBottom: 12, width: '100%', boxSizing: 'border-box' }}
                  />
                  {raceDate && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                      borderRadius: 20,
                      background: dateOk ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
                      border: `1px solid ${dateOk ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
                      fontSize: '.72rem', fontWeight: 700,
                      color: dateOk ? 'var(--gn)' : 'var(--rd)',
                    }}>
                      {dateOk
                        ? `${wksUntil} weeks · ${fmtRaceDate(raceDate)}`
                        : `Only ${wksUntil} weeks — need at least 8`}
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div style={{ animation: 'fadeUp .22s ease both' }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--tx2)', marginBottom: 4 }}>Confirm your current fitness</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginBottom: 20 }}>Based on your last 4 weeks of training</div>
                  <div style={{ padding: '16px', borderRadius: 14, background: 'var(--s2)', border: '1px solid var(--bd)' }}>
                    <div style={{ fontSize: '.68rem', color: 'var(--tx3)', marginBottom: 8 }}>Weekly base (km)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={() => setBaseKm(k => Math.max(10, parseFloat((k - 2.5).toFixed(1))))}
                        style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--bd)', background: 'var(--s3)', color: 'var(--tx)', fontSize: '1.1rem', cursor: 'pointer', flexShrink: 0 }}>−</button>
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--or)', lineHeight: 1 }}>{baseKm}</div>
                        <div style={{ fontSize: '.6rem', color: 'var(--tx3)', marginTop: 2 }}>km / week</div>
                      </div>
                      <button
                        onClick={() => setBaseKm(k => Math.min(120, parseFloat((k + 2.5).toFixed(1))))}
                        style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--bd)', background: 'var(--s3)', color: 'var(--tx)', fontSize: '1.1rem', cursor: 'pointer', flexShrink: 0 }}>+</button>
                    </div>
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>Peak target</span>
                      <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx)' }}>
                        ~{Math.min(Math.round(baseKm * 1.5), { '5K': 55, '10K': 70, 'HM': 85, 'Marathon': 110 }[raceType])} km/wk
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky footer buttons — same pattern as MonthlyWrapped */}
            <div style={{ display: 'flex', gap: 10, padding: '16px 20px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--bd)', flexShrink: 0 }}>
              {step > 1
                ? <button className="btn b-gh" style={{ flex: 1, padding: '13px' }} onClick={() => setStep(s => s - 1)}>← Back</button>
                : <div style={{ flex: 1 }} />}
              {step === 1 && <button className="btn b-or" style={{ flex: 2, padding: '13px' }} onClick={() => setStep(2)}>Next →</button>}
              {step === 2 && <button className="btn b-or" style={{ flex: 2, padding: '13px' }} disabled={!dateOk} onClick={() => setStep(3)}>Next →</button>}
              {step === 3 && <button className="btn b-or" style={{ flex: 2, padding: '13px' }} onClick={handleGenerate}>Generate Plan ✓</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
