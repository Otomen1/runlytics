import React, { useState, useMemo } from 'react';
import { FITNESS_TEST_KEY } from '../../constants/keys.js';
import { weekOf, fmtKm, fmtPace } from '../../utils/formatters.js';
import { getPlanWeek, getPlanWeekNumber, getPlanAdherence } from '../../utils/trainingPlan.js';
import { computeFitnessProfile, estimateVO2Max } from '../../utils/fitnessProfile.js';
import {
  computeGoalHealthScore, computeCoachInsights,
  computeAdaptiveReco, computeCoachMilestones, computeCatchUpPath,
} from '../../utils/adaptiveCoach.js';

function fmtSec(sec) {
  if (!sec || sec <= 0) return '--';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--tx2)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 10, ...style }}>
      {children}
    </div>
  );
}

const PHASE_COLORS = { base: '#3b82f6', build: 'var(--or)', taper: '#8b5cf6', race: '#22c55e' };
const INSIGHT_COLORS = { success: '#22c55e', warning: 'var(--or)', caution: '#ef4444', info: '#3b82f6' };

export function CoachTab({ acts, analytics, hrProfile, plan }) {
  const today = weekOf(Date.now());
  const planWeek      = useMemo(() => plan ? getPlanWeek(plan, today) : null,       [plan, today]);
  const planWeekNum   = useMemo(() => plan ? getPlanWeekNumber(plan, today) : null, [plan, today]);
  const planAdh       = useMemo(() => plan ? getPlanAdherence(plan, analytics.weeklyKm) : null, [plan, analytics]);
  const reco          = useMemo(() => computeAdaptiveReco(plan, analytics),          [plan, analytics]);
  const insights      = useMemo(() => computeCoachInsights(plan, analytics, acts),   [plan, analytics, acts]);
  const health        = useMemo(() => computeGoalHealthScore(plan, analytics, acts), [plan, analytics, acts]);
  const milestones    = useMemo(() => computeCoachMilestones(plan, acts, analytics), [plan, acts, analytics]);
  const fitness       = useMemo(() => computeFitnessProfile(acts, plan, analytics),  [acts, plan, analytics]);
  const catchUp       = useMemo(() => computeCatchUpPath(plan, analytics),            [plan, analytics]);

  const [showFitnessTest, setShowFitnessTest] = useState(false);
  const [testInput, setTestInput] = useState({ distKm: '', timeMin: '' });
  const [testResult, setTestResult] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FITNESS_TEST_KEY) || 'null'); } catch { return null; }
  });

  const weeksTotal     = plan?.weeks?.length || 0;
  const weeksRemaining = plan ? plan.weeks.filter(w => w.week >= today).length : 0;
  const raceDate       = plan?.raceDate;
  const isPastRace     = raceDate && Date.now() > new Date(raceDate + 'T23:59:59').getTime();

  const healthColor = health === null ? 'var(--tx3)'
    : health >= 90 ? '#22c55e'
    : health >= 75 ? '#3b82f6'
    : health >= 60 ? 'var(--or)'
    : '#ef4444';

  const healthLabel = health === null ? '—'
    : health >= 90 ? 'Excellent'
    : health >= 75 ? 'Good'
    : health >= 60 ? 'Needs Attention'
    : 'At Risk';

  const RACE_EMOJIS = { '5K': '🏃', '10K': '🏃', 'HM': '🏅', 'Marathon': '🏆' };

  function runFitnessTest() {
    const dist = parseFloat(testInput.distKm);
    const mins = parseFloat(testInput.timeMin);
    if (!dist || !mins || dist <= 0 || mins <= 0) return;
    const timeSec = Math.round(mins * 60);
    const paceSecKm = Math.round(timeSec / dist);
    const vo2 = estimateVO2Max(paceSecKm);
    const raceTimes = {
      '5K':  Math.round(timeSec * Math.pow(5 / dist, 1.06)),
      '10K': Math.round(timeSec * Math.pow(10 / dist, 1.06)),
      'HM':  Math.round(timeSec * Math.pow(21.0975 / dist, 1.06)),
      'FM':  Math.round(timeSec * Math.pow(42.195 / dist, 1.06)),
    };
    const result = { dist, timeSec, paceSecKm, vo2, raceTimes, ts: Date.now() };
    setTestResult(result);
    try { localStorage.setItem(FITNESS_TEST_KEY, JSON.stringify(result)); } catch {}
  }

  return (
    <div style={{ padding: '18px 16px 100px' }}>

      {/* No plan state */}
      {!plan && (
        <Card>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🎯</div>
            <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 6 }}>No Training Plan Yet</div>
            <div style={{ fontSize: '.8rem', color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 4 }}>
              Set up a Training Plan in the <strong>More</strong> tab to unlock coach insights, health score, and adaptive recommendations.
            </div>
            <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginTop: 8 }}>
              Fitness Profile and Milestones are available regardless.
            </div>
          </div>
        </Card>
      )}

      {/* Section 1 — Current Goal */}
      {plan && (
        <section style={{ marginBottom: 22 }}>
          <SectionLabel>🎯 Current Goal</SectionLabel>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--tx)' }}>
                  {RACE_EMOJIS[plan.raceType] || '🏆'} {plan.raceType}
                </div>
                <div style={{ fontSize: '.74rem', color: 'var(--tx2)', marginTop: 3 }}>
                  Race date: {raceDate}
                </div>
              </div>
              {planWeek && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.64rem', fontWeight: 700, background: PHASE_COLORS[planWeek.phase] || 'var(--tx3)', color: '#fff', padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {planWeek.phase}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {planWeekNum && (
                <div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--or)', lineHeight: 1 }}>{planWeekNum}<span style={{ fontSize: '.7rem', fontWeight: 600 }}>/{weeksTotal}</span></div>
                  <div style={{ fontSize: '.62rem', color: 'var(--tx2)', marginTop: 2 }}>Week</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--tx)', lineHeight: 1 }}>{weeksRemaining}</div>
                <div style={{ fontSize: '.62rem', color: 'var(--tx2)', marginTop: 2 }}>Weeks left</div>
              </div>
              {planWeek && (
                <div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#3b82f6', lineHeight: 1 }}>{fmtKm(planWeek.targetKm)}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--tx2)', marginTop: 2 }}>km target</div>
                </div>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* Section 2 — Goal Health Score */}
      {plan && health !== null && (
        <section style={{ marginBottom: 22 }}>
          <SectionLabel>💚 Goal Health Score</SectionLabel>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
                <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bd)" strokeWidth="3"/>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke={healthColor} strokeWidth="3"
                    strokeDasharray={`${health} ${100 - health}`} strokeLinecap="round"/>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 900, color: healthColor, lineHeight: 1 }}>{health}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: healthColor, marginBottom: 4 }}>{healthLabel}</div>
                <div style={{ fontSize: '.76rem', color: 'var(--tx2)', lineHeight: 1.5 }}>
                  Based on adherence, consistency, recent activity, and plan progress.
                </div>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Section 3 — Plan Adherence */}
      {plan && planAdh && planAdh.weeksCompleted > 0 && (
        <section style={{ marginBottom: 22 }}>
          <SectionLabel>📋 Plan Adherence</SectionLabel>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: planAdh.adherencePct >= 90 ? '#22c55e' : planAdh.adherencePct >= 70 ? 'var(--or)' : '#ef4444', lineHeight: 1 }}>
                  {planAdh.adherencePct}%
                </div>
                <div style={{ fontSize: '.64rem', color: 'var(--tx2)', marginTop: 2 }}>{planAdh.weeksCompleted} weeks tracked</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '.76rem', fontWeight: 600, color: 'var(--tx)' }}>{fmtKm(planAdh.totalActual)} km</div>
                <div style={{ fontSize: '.62rem', color: 'var(--tx2)' }}>of {fmtKm(planAdh.totalPlanned)} planned</div>
              </div>
            </div>
            <div style={{ background: 'var(--bd)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, background: planAdh.adherencePct >= 90 ? '#22c55e' : planAdh.adherencePct >= 70 ? 'var(--or)' : '#ef4444', width: `${Math.min(100, planAdh.adherencePct)}%`, transition: 'width .4s ease' }}/>
            </div>
          </Card>
        </section>
      )}

      {/* Section 4 — Coach Insights */}
      {plan && insights.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <SectionLabel>💡 Coach Insights</SectionLabel>
          {insights.map((ins, i) => (
            <div key={i} className="card" style={{ padding: '12px 14px', marginBottom: 8, borderLeft: `3px solid ${INSIGHT_COLORS[ins.type] || 'var(--tx2)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: '1rem' }}>{ins.icon}</span>
                <span style={{ fontWeight: 700, fontSize: '.84rem', color: 'var(--tx)' }}>{ins.title}</span>
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--tx2)', lineHeight: 1.55 }}>{ins.body}</div>
            </div>
          ))}
        </section>
      )}

      {/* Section 4b — Catch-Up Path (only when behind) */}
      {plan && catchUp && (
        <section style={{ marginBottom: 22 }}>
          <SectionLabel>📈 Catch-Up Path</SectionLabel>
          <Card>
            <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginBottom: 12 }}>
              Based on your actual recent running, here's your safe ramp to plan peak volume.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--tx)' }}>{catchUp.actualCurrentKm}</div>
                <div style={{ fontSize: '.6rem', color: 'var(--tx3)' }}>Current km/wk</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--or)' }}>{catchUp.nextWeekTarget}</div>
                <div style={{ fontSize: '.6rem', color: 'var(--tx3)' }}>Next week target</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: catchUp.canReachPeak ? '#22c55e' : '#ef4444' }}>{catchUp.targetPeakKm}</div>
                <div style={{ fontSize: '.6rem', color: 'var(--tx3)' }}>Plan peak</div>
              </div>
            </div>
            <div style={{ fontSize: '.76rem', color: 'var(--tx2)', lineHeight: 1.5 }}>
              {catchUp.canReachPeak
                ? `At 8% weekly build you can reach plan peak volume in ~${catchUp.weeksToNearPeak} week${catchUp.weeksToNearPeak === 1 ? '' : 's'}. Start this week at ${catchUp.nextWeekTarget} km.`
                : `At 8% weekly build you'll reach ~${catchUp.projectedPeakKm} km — ${Math.round((1 - catchUp.projectedPeakKm / catchUp.targetPeakKm) * 100)}% short of plan peak. Focus on consistency rather than closing the gap fast.`}
            </div>
          </Card>
        </section>
      )}

      {/* Section 5 — Fitness Profile */}
      <section style={{ marginBottom: 22 }}>
        <SectionLabel>⚡ Fitness Profile</SectionLabel>
        {fitness.raceTimes ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              {Object.entries(fitness.raceTimes).map(([dist, sec]) => (
                <div key={dist} className="card" style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{dist}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--or)', lineHeight: 1 }}>{fmtSec(sec)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {fitness.vo2max && (
                <div className="card" style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>VO₂max</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#3b82f6', lineHeight: 1 }}>{fitness.vo2max}</div>
                </div>
              )}
              {fitness.longestRun > 0 && (
                <div className="card" style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Longest (cycle)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#8b5cf6', lineHeight: 1 }}>{fmtKm(fitness.longestRun)}<span style={{ fontSize: '.6rem', fontWeight: 600 }}> km</span></div>
                </div>
              )}
              {fitness.consistencyPct !== null && (
                <div className="card" style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Consist.</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#22c55e', lineHeight: 1 }}>{fitness.consistencyPct}%</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: '.64rem', color: 'var(--tx3)', marginTop: 8, textAlign: 'center' }}>
              Training effort estimates — actual race performance is typically 10–15% faster
            </div>
          </>
        ) : (
          <Card>
            <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--tx3)', fontSize: '.82rem' }}>
              Log at least one run ≥ 3 km to see race time estimates.
            </div>
          </Card>
        )}
      </section>

      {/* Section 6 — Adaptive Recommendation */}
      {plan && reco && (
        <section style={{ marginBottom: 22 }}>
          <SectionLabel>🧭 Adaptive Recommendation</SectionLabel>
          <Card style={{ borderLeft: `3px solid ${reco.color}` }}>
            <div style={{ fontSize: '.82rem', fontWeight: 800, color: reco.color, marginBottom: 5 }}>{reco.status}</div>
            <div style={{ fontSize: '.8rem', color: 'var(--tx2)', lineHeight: 1.55 }}>{reco.reco}</div>
          </Card>
        </section>
      )}

      {/* Section 7 — Milestones */}
      <section style={{ marginBottom: 22 }}>
        <SectionLabel>
          {`🏅 Milestones · ${milestones.filter(m => m.earned).length}/${milestones.length}`}
        </SectionLabel>
        <Card>
          {milestones.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--bd)', opacity: m.earned ? 1 : 0.38 }}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{m.earned ? m.icon : '○'}</span>
              <span style={{ fontSize: '.8rem', fontWeight: m.earned ? 600 : 400, color: m.earned ? 'var(--tx)' : 'var(--tx3)' }}>{m.label}</span>
              {m.earned && <span style={{ marginLeft: 'auto', fontSize: '.68rem', color: '#22c55e', fontWeight: 700 }}>Earned</span>}
            </div>
          ))}
        </Card>
      </section>

      {/* Section 8 — Fitness Test */}
      <section style={{ marginBottom: 22 }}>
        <SectionLabel>🧪 Fitness Assessment</SectionLabel>
        <button
          onClick={() => setShowFitnessTest(v => !v)}
          style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--r-lg)', padding: '11px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.82rem', fontWeight: 700, color: 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showFitnessTest ? 8 : 0 }}>
          <span>Enter a recent race or time trial</span>
          <span style={{ fontSize: '.8rem', color: 'var(--tx3)' }}>{showFitnessTest ? '▲' : '▼'}</span>
        </button>
        {showFitnessTest && (
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: '.68rem', color: 'var(--tx2)', marginBottom: 4 }}>Distance (km)</div>
                <input className="inp" type="number" min="0.5" step="0.1" placeholder="e.g. 5"
                  value={testInput.distKm}
                  onChange={e => setTestInput(p => ({ ...p, distKm: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box' }}/>
              </div>
              <div>
                <div style={{ fontSize: '.68rem', color: 'var(--tx2)', marginBottom: 4 }}>Time (minutes)</div>
                <input className="inp" type="number" min="1" step="0.5" placeholder="e.g. 22.5"
                  value={testInput.timeMin}
                  onChange={e => setTestInput(p => ({ ...p, timeMin: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box' }}/>
              </div>
            </div>
            <button onClick={runFitnessTest}
              style={{ width: '100%', background: 'var(--or)', border: 'none', borderRadius: 10, padding: '10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.84rem', fontWeight: 700, color: '#fff', marginBottom: 10 }}>
              Calculate
            </button>
            {testResult && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  {Object.entries(testResult.raceTimes).map(([dist, sec]) => (
                    <div key={dist} style={{ background: 'var(--bd)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: '.6rem', color: 'var(--tx3)', marginBottom: 2 }}>{dist}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--or)' }}>{fmtSec(sec)}</div>
                    </div>
                  ))}
                </div>
                {testResult.vo2 && (
                  <div style={{ fontSize: '.76rem', color: 'var(--tx2)', textAlign: 'center' }}>
                    Estimated VO₂max: <strong style={{ color: '#3b82f6' }}>{testResult.vo2}</strong>
                    &ensp;·&ensp; Pace: <strong>{fmtPace(testResult.paceSecKm)}/km</strong>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
      </section>

      {/* Section 9 — Plan Completion Report (only after race date) */}
      {plan && isPastRace && planAdh && (
        <section style={{ marginBottom: 22 }}>
          <SectionLabel>🏁 Plan Completion Report</SectionLabel>
          <Card style={{ borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontWeight: 800, fontSize: '.9rem', marginBottom: 10, color: '#22c55e' }}>🎉 Race Complete!</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: '.62rem', color: 'var(--tx3)', marginBottom: 2 }}>Goal</div>
                <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{plan.raceType}</div>
              </div>
              <div>
                <div style={{ fontSize: '.62rem', color: 'var(--tx3)', marginBottom: 2 }}>Adherence</div>
                <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{planAdh.adherencePct}%</div>
              </div>
              <div>
                <div style={{ fontSize: '.62rem', color: 'var(--tx3)', marginBottom: 2 }}>Planned km</div>
                <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{fmtKm(planAdh.totalPlanned)} km</div>
              </div>
              <div>
                <div style={{ fontSize: '.62rem', color: 'var(--tx3)', marginBottom: 2 }}>Actual km</div>
                <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{fmtKm(planAdh.totalActual)} km</div>
              </div>
              <div>
                <div style={{ fontSize: '.62rem', color: 'var(--tx3)', marginBottom: 2 }}>Weeks completed</div>
                <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{planAdh.weeksCompleted}</div>
              </div>
              {fitness.longestRun > 0 && (
                <div>
                  <div style={{ fontSize: '.62rem', color: 'var(--tx3)', marginBottom: 2 }}>Longest run</div>
                  <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{fmtKm(fitness.longestRun)} km</div>
                </div>
              )}
            </div>
          </Card>
        </section>
      )}

    </div>
  );
}
