import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { computeWrapped, computeWrappedCoach, generateWrappedImage } from '../../utils/wrapped.js';
import { fmtKm, fmtPace, fmtDate, fmtDur } from '../../utils/formatters.js';
import { getPhotos } from '../../db/indexedDB.js';

const MOODS_MAP = {
  great:  { emoji: '😀', label: 'Great'  },
  good:   { emoji: '🙂', label: 'Good'   },
  normal: { emoji: '😐', label: 'Normal' },
  tough:  { emoji: '😫', label: 'Tough'  },
  strong: { emoji: '🔥', label: 'Strong' },
};
const MOODS_ORDER = ['strong','great','good','normal','tough'];
const PHASE_LABEL = { base: 'Base', build: 'Build', taper: 'Taper', race: 'Race' };
const TREND_META = {
  improving: { icon: '📈', label: 'Improving', color: '#22c55e' },
  declining:  { icon: '📉', label: 'Declining',  color: '#ef4444' },
  steady:     { icon: '➡️', label: 'Steady',     color: '#f97316' },
};

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export function MonthlyWrapped({ acts, yearMonth, plan, analytics, onClose, onSelectAct }) {
  const data      = useMemo(() => computeWrapped(acts, yearMonth), [acts, yearMonth]);
  const coachData = useMemo(() => computeWrappedCoach(plan, analytics, yearMonth), [plan, analytics, yearMonth]);

  const [slide,   setSlide]   = useState(0);
  const [coverUrl, setCoverUrl] = useState(null);
  const [sharing,  setSharing]  = useState(false);

  const urlRef        = useRef(null);
  const touchStartX   = useRef(null);
  const slidesCountRef = useRef(0);
  const containerRef  = useRef(null);
  useFocusTrap(containerRef);

  const prevMonthKm = useMemo(() => {
    const [y, m] = yearMonth.split('-').map(Number);
    const prev = m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`;
    return acts.filter(a => a.date?.startsWith(prev)).reduce((s, a) => s + (a.distanceKm||0), 0);
  }, [acts, yearMonth]);

  useEffect(() => {
    if (!data?.favoriteMemory?.photoCount) return;
    let active = true;
    getPhotos(data.favoriteMemory.id).then(photos => {
      if (!active || !photos[0]) return;
      const url = URL.createObjectURL(photos[0].thumbBlob);
      urlRef.current = url;
      setCoverUrl(url);
    }).catch(() => {});
    return () => {
      active = false;
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    };
  }, [data?.favoriteMemory?.id]);

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setSlide(s => Math.min(s + 1, slidesCountRef.current - 1));
      if (e.key === 'ArrowLeft')  setSlide(s => Math.max(s - 1, 0));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTouchStart = e => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd   = e => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) setSlide(s => Math.min(s + 1, slidesCountRef.current - 1));
    else         setSlide(s => Math.max(s - 1, 0));
  };

  if (!data) return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...sheet, height: '44vh', justifyContent: 'center' }}>
        <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>📭</div>
        <div style={{ color: 'var(--tx2)', marginBottom: 16 }}>No runs this month</div>
        <button className="btn b-gh" style={{ padding: '10px 24px' }} onClick={onClose}>Close</button>
      </div>
    </div>
  );

  const mood = data.topMood ? MOODS_MAP[data.topMood] : null;
  const delta = data.totalDistance - prevMonthKm;
  const maxWeekKm = data.weeklyBreakdown.length ? Math.max(...data.weeklyBreakdown.map(w => w.km)) : 0;
  const hasJournal = data.notesCount > 0 || data.photosCount > 0 || mood;
  const hasMemory  = !!data.favoriteMemory;

  const handleShare = async () => {
    setSharing(true);
    try {
      const blob = await generateWrappedImage(data, yearMonth);
      const file = new File([blob], `runlytics-${yearMonth}.jpg`, { type: 'image/jpeg' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `My ${monthLabel(yearMonth)} in Running` });
      } else {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = `runlytics-${yearMonth}.jpg`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }
    } catch (e) { if (e?.name !== 'AbortError') console.error('[Wrapped] share error', e); }
    setSharing(false);
  };

  /* ── Slides ───────────────────────────────────────────────────────────────── */
  const slides = [

    /* 0 — Hero Stats */
    <div key="hero" style={sw}>
      <div style={chip}>{monthLabel(yearMonth).toUpperCase()}</div>
      <div style={{ fontSize: '.58rem', color: 'var(--tx3)', marginBottom: 18, letterSpacing: '.06em' }}>MONTHLY WRAPPED</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: '4.2rem', fontWeight: 900, color: 'var(--tx)', lineHeight: 1, letterSpacing: '-.02em' }}>{fmtKm(data.totalDistance)}</span>
        <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--or)' }}>km</span>
      </div>
      <div style={{ fontSize: '.58rem', color: 'var(--tx3)', marginBottom: 20, letterSpacing: '.04em' }}>TOTAL DISTANCE</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', marginBottom: 18 }}>
        {[
          { v: String(data.totalRuns),            l: 'Runs'       },
          { v: fmtDur(data.totalTimeSec),          l: 'Time'       },
          { v: fmtPace(data.avgPaceSec||0)+'/km',  l: 'Avg Pace'   },
          data.totalElevGainM > 0 ? { v: data.totalElevGainM + 'm', l: 'Elevation' } : { v: fmtKm(data.avgDistanceKm)+' km', l: 'Avg Run' },
        ].map(s => (
          <div key={s.l} style={statCell}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--tx)', marginBottom: 3 }}>{s.v}</div>
            <div style={{ fontSize: '.52rem', color: 'var(--tx3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {data.weeklyBreakdown.length > 1 && (
        <div style={{ width: '100%', marginBottom: 14 }}>
          <div style={{ fontSize: '.56rem', color: 'var(--tx3)', letterSpacing: '.07em', marginBottom: 8 }}>KM BY WEEK</div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 52 }}>
            {data.weeklyBreakdown.map(w => {
              const best = w.km === maxWeekKm;
              const h = maxWeekKm > 0 ? Math.max(5, Math.round((w.km / maxWeekKm) * 38)) : 5;
              return (
                <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{ fontSize: '.46rem', color: best ? 'var(--or)' : 'var(--tx3)', fontWeight: best ? 700 : 400 }}>{Math.round(w.km)}</div>
                  <div style={{ width: '100%', height: h, background: best ? 'var(--or)' : 'var(--bd2)', borderRadius: 3 }}/>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.streakDays > 1 && (
        <div style={badge}>🔥 <span style={{ color: 'var(--or)', fontWeight: 700 }}>{data.streakDays}-day streak</span></div>
      )}
    </div>,

    /* 1 — Best Runs */
    <div key="runs" style={sw}>
      <div style={sectionLabel}>BEST RUNS</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', marginBottom: 10 }}>
        {data.longestRun && (
          <button style={{ ...peakCard, borderColor: 'rgba(59,130,246,.3)' }} onClick={() => { onSelectAct(data.longestRun); onClose(); }}>
            <div style={{ fontSize: '.54rem', color: '#3b82f6', fontWeight: 700, letterSpacing: '.06em', marginBottom: 6 }}>📏 LONGEST</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#3b82f6', lineHeight: 1, marginBottom: 2 }}>{fmtKm(data.longestRun.distanceKm)}</div>
            <div style={{ fontSize: '.55rem', color: '#3b82f6', marginBottom: 8 }}>km</div>
            <div style={{ fontSize: '.63rem', color: 'var(--tx2)', lineHeight: 1.3 }}>{data.longestRun.name.slice(0, 26)}</div>
            <div style={{ fontSize: '.55rem', color: 'var(--tx3)', marginTop: 3 }}>{fmtDate(data.longestRun.date)}</div>
          </button>
        )}
        {data.fastestRun && (
          <button style={{ ...peakCard, borderColor: 'rgba(249,115,22,.3)' }} onClick={() => { onSelectAct(data.fastestRun); onClose(); }}>
            <div style={{ fontSize: '.54rem', color: 'var(--or)', fontWeight: 700, letterSpacing: '.06em', marginBottom: 6 }}>⚡ FASTEST</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--or)', lineHeight: 1, marginBottom: 2 }}>{fmtPace(data.fastestRun.avgPaceSecKm)}</div>
            <div style={{ fontSize: '.55rem', color: 'var(--or)', marginBottom: 8 }}>/km</div>
            <div style={{ fontSize: '.63rem', color: 'var(--tx2)', lineHeight: 1.3 }}>{data.fastestRun.name.slice(0, 26)}</div>
            <div style={{ fontSize: '.55rem', color: 'var(--tx3)', marginTop: 3 }}>{fmtDate(data.fastestRun.date)}</div>
          </button>
        )}
      </div>

      {data.bestPerformingRun && data.bestPerformingRun.id !== data.fastestRun?.id && (
        <button style={{ ...peakCard, flexDirection: 'row', gap: 12, borderColor: 'rgba(139,92,246,.3)', padding: '12px 16px', justifyContent: 'flex-start', marginBottom: 10 }}
          onClick={() => { onSelectAct(data.bestPerformingRun); onClose(); }}>
          <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>🏅</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '.54rem', color: '#8b5cf6', fontWeight: 700, letterSpacing: '.06em', marginBottom: 3 }}>BEST PERFORMANCE (≥ 3 KM)</div>
            <div style={{ fontSize: '1rem', fontWeight: 900, color: '#8b5cf6', lineHeight: 1, marginBottom: 3 }}>{fmtPace(data.bestPerformingRun.avgPaceSecKm)}/km · {fmtKm(data.bestPerformingRun.distanceKm)} km</div>
            <div style={{ fontSize: '.63rem', color: 'var(--tx2)' }}>{data.bestPerformingRun.name.slice(0, 32)}</div>
          </div>
        </button>
      )}

      {data.biggestClimb && (
        <button style={{ ...peakCard, flexDirection: 'row', gap: 12, borderColor: 'rgba(34,197,94,.3)', padding: '12px 16px', justifyContent: 'flex-start' }}
          onClick={() => { onSelectAct(data.biggestClimb); onClose(); }}>
          <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>🏔</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '.54rem', color: '#22c55e', fontWeight: 700, letterSpacing: '.06em', marginBottom: 3 }}>BIGGEST CLIMB</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#22c55e', lineHeight: 1, marginBottom: 3 }}>{data.biggestClimb.elevGainM}m gain</div>
            <div style={{ fontSize: '.63rem', color: 'var(--tx2)' }}>{data.biggestClimb.name.slice(0, 32)}</div>
          </div>
        </button>
      )}

      {!data.longestRun && !data.fastestRun && (
        <div style={{ color: 'var(--tx3)', fontSize: '.84rem', marginTop: 20 }}>No performance data this month</div>
      )}
    </div>,

    /* 2 — Journal & Vibe (conditional: show when any journal/mood data exists) */
    hasJournal ? (
      <div key="vibe" style={sw}>
        <div style={sectionLabel}>YOUR VIBE</div>

        {mood && (
          <div style={{ textAlign: 'center', marginBottom: 18, width: '100%' }}>
            <div style={{ fontSize: '3.6rem', lineHeight: 1, marginBottom: 6 }}>{mood.emoji}</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 900, marginBottom: 4 }}>{mood.label}</div>
            <div style={{ fontSize: '.6rem', color: 'var(--tx3)', letterSpacing: '.08em' }}>MOST COMMON MOOD</div>
          </div>
        )}

        {MOODS_ORDER.filter(m => data.moodCounts[m]).length > 1 && (
          <div style={{ width: '100%', marginBottom: 16 }}>
            {MOODS_ORDER.filter(m => data.moodCounts[m]).map(m => {
              const info = MOODS_MAP[m], count = data.moodCounts[m] || 0;
              const pct  = count / data.totalRuns;
              return (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 20, textAlign: 'center', fontSize: '.9rem', flexShrink: 0 }}>{info.emoji}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--bd)', borderRadius: 3 }}>
                    <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: 'var(--or)', borderRadius: 3 }}/>
                  </div>
                  <span style={{ fontSize: '.6rem', color: 'var(--tx3)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, width: '100%' }}>
          {[
            data.notesCount  > 0 ? { icon: '📝', v: String(data.notesCount),  l: 'Notes' }  : null,
            data.photosCount > 0 ? { icon: '📸', v: String(data.photosCount), l: 'Photos' } : null,
            data.streakDays  > 1 ? { icon: '🔥', v: `${data.streakDays}d`,    l: 'Streak' } : null,
            data.mostActiveWeek  ? {
              icon: '📅',
              v: `${Math.round(data.mostActiveWeek.km)} km`,
              l: 'Best Week',
            } : null,
          ].filter(Boolean).slice(0, 3).map(s => (
            <div key={s.l} style={{ ...statCell, padding: '10px 8px' }}>
              <div style={{ fontSize: '1rem', marginBottom: 3 }}>{s.icon}</div>
              <div style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--tx)' }}>{s.v}</div>
              <div style={{ fontSize: '.52rem', color: 'var(--tx3)', letterSpacing: '.04em', textTransform: 'uppercase' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    ) : null,

    /* 3 — Coach Summary (conditional) */
    coachData ? (
      <div key="coach" style={sw}>
        <div style={sectionLabel}>TRAINING PLAN</div>

        {/* Adherence ring-style display */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: '3.8rem', fontWeight: 900, color: coachData.monthAdherence >= 90 ? '#22c55e' : coachData.monthAdherence >= 70 ? 'var(--or)' : '#ef4444', lineHeight: 1 }}>
            {coachData.monthAdherence ?? '—'}%
          </div>
          <div style={{ fontSize: '.6rem', color: 'var(--tx3)', letterSpacing: '.08em', marginTop: 4 }}>PLAN ADHERENCE THIS MONTH</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', marginBottom: 14 }}>
          <div style={statCell}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--tx)' }}>{coachData.totalActual} km</div>
            <div style={{ fontSize: '.52rem', color: 'var(--tx3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Actual</div>
          </div>
          <div style={statCell}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--tx)' }}>{coachData.totalTarget} km</div>
            <div style={{ fontSize: '.52rem', color: 'var(--tx3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Target</div>
          </div>
        </div>

        {coachData.peakLongKm && (
          <div style={{ ...statCell, width: '100%', padding: '12px 16px', marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '.76rem', color: 'var(--tx2)' }}>📏 Peak Long Run Target</span>
            <span style={{ fontSize: '.88rem', fontWeight: 800, color: '#8b5cf6' }}>{coachData.peakLongKm} km</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 10 }}>
          {coachData.phases.map(p => (
            <div key={p} style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.2)', fontSize: '.68rem', color: 'var(--or)', fontWeight: 700 }}>
              {PHASE_LABEL[p] || p}
            </div>
          ))}
        </div>

        {coachData.trend && (() => {
          const tm = TREND_META[coachData.trend];
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: `${tm.color}11`, border: `1px solid ${tm.color}33`, width: '100%' }}>
              <span style={{ fontSize: '1rem' }}>{tm.icon}</span>
              <span style={{ fontSize: '.76rem', fontWeight: 700, color: tm.color }}>Adherence {tm.label} Through Month</span>
            </div>
          );
        })()}
      </div>
    ) : null,

    /* 4 — Best Memory (conditional) */
    hasMemory ? (
      <div key="memory" style={sw}>
        <div style={sectionLabel}>BEST MEMORY</div>

        {coverUrl && (
          <img src={coverUrl} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 12, marginBottom: 14 }}/>
        )}

        {!coverUrl && data.favoriteMemory && (
          <div style={{ width: '100%', height: 120, background: 'var(--s2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, border: '1px solid var(--bd)' }}>
            <span style={{ fontSize: '2.4rem' }}>📍</span>
          </div>
        )}

        {data.favoriteMemory && (
          <>
            <div style={{ fontSize: '.96rem', fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>{data.favoriteMemory.name}</div>
            <div style={{ fontSize: '.68rem', color: 'var(--tx2)', marginBottom: 10, textAlign: 'center' }}>
              {fmtDate(data.favoriteMemory.date)} · {fmtKm(data.favoriteMemory.distanceKm)} km
            </div>
            {data.favoriteMemory.notes?.trim() && (
              <div style={{ fontSize: '.78rem', fontStyle: 'italic', color: 'var(--tx2)', lineHeight: 1.55, marginBottom: 14, textAlign: 'center', padding: '0 8px' }}>
                "{data.favoriteMemory.notes.slice(0, 100)}{data.favoriteMemory.notes.length > 100 ? '…' : ''}"
              </div>
            )}
            <button style={ghostBtn} onClick={() => { onSelectAct(data.favoriteMemory); onClose(); }}>
              Open Memory →
            </button>
          </>
        )}
      </div>
    ) : null,

    /* 5 — That's a Wrap + Share */
    <div key="wrap" style={sw}>
      <div style={{ fontSize: '2.8rem', marginBottom: 6, lineHeight: 1 }}>🎉</div>
      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--or)', marginBottom: 2 }}>{monthLabel(yearMonth)}</div>
      <div style={{ fontSize: '.6rem', color: 'var(--tx3)', marginBottom: 18, letterSpacing: '.06em' }}>AT A GLANCE</div>

      <div style={{ width: '100%', background: 'var(--s2)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--bd)', marginBottom: 12 }}>
        {[
          `🏃 ${data.totalRuns} run${data.totalRuns !== 1 ? 's' : ''}`,
          `📏 ${fmtKm(data.totalDistance)} km covered`,
          `⏱ ${fmtDur(data.totalTimeSec)} on feet`,
          data.totalElevGainM > 0 ? `⛰ ${data.totalElevGainM}m elevation` : null,
          data.streakDays > 1 ? `🔥 ${data.streakDays}-day best streak` : null,
          mood ? `${mood.emoji} mostly feeling ${mood.label.toLowerCase()}` : null,
          coachData?.monthAdherence != null ? `📋 ${coachData.monthAdherence}% plan adherence` : null,
        ].filter(Boolean).map(line => (
          <div key={line} style={{ fontSize: '.8rem', color: 'var(--tx2)', lineHeight: 2 }}>{line}</div>
        ))}
      </div>

      {prevMonthKm > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', width: '100%', borderRadius: 10, marginBottom: 14,
          background: delta >= 0 ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.07)',
          border: `1px solid ${delta >= 0 ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.15)'}`,
        }}>
          <span style={{ fontSize: '1rem' }}>{delta >= 0 ? '📈' : '📉'}</span>
          <span style={{ fontSize: '.78rem', fontWeight: 700, color: delta >= 0 ? '#22c55e' : '#ef4444' }}>
            {delta >= 0 ? '+' : ''}{fmtKm(Math.abs(delta))} km vs last month
          </span>
        </div>
      )}

      <button
        onClick={handleShare}
        disabled={sharing}
        style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: sharing ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: '.88rem', fontWeight: 700, background: 'var(--or)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: sharing ? 0.7 : 1, transition: 'opacity .2s' }}>
        {sharing ? '⏳ Generating…' : '📤 Export as Image'}
      </button>
    </div>,

  ].filter(Boolean);

  slidesCountRef.current = slides.length;

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={containerRef} style={sheet}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--bd)', flexShrink: 0 }}>
          <button className="btn b-gh" style={{ padding: '6px 12px', fontSize: '.8rem' }} onClick={onClose}>✕</button>
          <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)' }}>Monthly Wrapped</div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {slides.map((_, i) => (
              <button key={i} onClick={() => setSlide(i)} aria-label={`Slide ${i+1}`} aria-current={i===slide?'true':undefined} style={{ width: i === slide ? 20 : 6, height: 6, borderRadius: 3, background: i === slide ? 'var(--or)' : 'var(--bd)', cursor: 'pointer', transition: 'width .2s', padding: 0, border: 'none' }}/>
            ))}
          </div>
        </div>

        {/* Slide area */}
        <div
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div key={slide} style={{ animation: 'fadeUp .22s ease', width: '100%', display: 'flex', justifyContent: 'center' }}>
            {slides[slide]}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 20px', paddingBottom: 'calc(14px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--bd)', flexShrink: 0 }}>
          <button className="btn b-gh" style={{ flex: 1, padding: '13px', opacity: slide === 0 ? 0.35 : 1 }} onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}>← Back</button>
          {slide < slides.length - 1
            ? <button className="btn b-or" style={{ flex: 2, padding: '13px' }} onClick={() => setSlide(s => s + 1)}>Next →</button>
            : <button className="btn b-or" style={{ flex: 2, padding: '13px' }} onClick={onClose}>Done ✓</button>
          }
        </div>
      </div>
    </div>
  );
}

const overlay  = { position:'fixed', inset:0, zIndex:260, background:'rgba(0,0,0,.6)', display:'flex', flexDirection:'column', justifyContent:'flex-end' };
const sheet    = { background:'var(--bg)', borderRadius:'20px 20px 0 0', height:'84vh', display:'flex', flexDirection:'column' };
const sw       = { display:'flex', flexDirection:'column', alignItems:'center', width:'100%', maxWidth:420 };
const chip     = { fontSize:'.66rem', fontWeight:700, color:'var(--or)', letterSpacing:'.1em', marginBottom:4 };
const sectionLabel = { fontSize:'.64rem', fontWeight:700, color:'var(--tx3)', letterSpacing:'.12em', marginBottom:16 };
const statCell = { padding:'11px 8px', background:'var(--s2)', borderRadius:10, textAlign:'center', border:'1px solid var(--bd)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' };
const badge    = { display:'inline-flex', alignItems:'center', gap:6, background:'rgba(249,115,22,.1)', border:'1px solid rgba(249,115,22,.2)', borderRadius:20, padding:'5px 14px', fontSize:'.74rem' };
const peakCard = { background:'var(--s2)', border:'1px solid', borderRadius:12, padding:'14px 12px', display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer', fontFamily:'inherit', textAlign:'center', width:'100%' };
const ghostBtn = { marginTop:4, background:'none', border:'1px solid var(--bd)', borderRadius:20, padding:'8px 20px', fontSize:'.8rem', color:'var(--or)', cursor:'pointer', fontFamily:'inherit' };
