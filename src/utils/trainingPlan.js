import { weekOf } from './formatters.js';

const RACE_PEAK = { '5K': 55, '10K': 70, 'HM': 85, 'Marathon': 110 };

function nextMonday(from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  if (dow !== 0) d.setDate(d.getDate() + (7 - dow));
  return d;
}

function addWeeks(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n * 7);
  return d;
}

function runTypesForKm(km) {
  if (km < 30) return { easy: 3, long: 1, workout: 0 };
  if (km < 50) return { easy: 2, long: 1, workout: 1 };
  if (km < 70) return { easy: 3, long: 1, workout: 1 };
  return { easy: 3, long: 1, workout: 2 };
}

export function generatePlan(raceType, raceDate, baseWeeklyKm) {
  const start = nextMonday();
  const race = new Date(raceDate + 'T12:00:00');
  const totalMs = race - start;
  const totalWeeks = Math.max(8, Math.min(52, Math.round(totalMs / (7 * 86400000))));

  const peak = Math.min(baseWeeklyKm * 1.5, RACE_PEAK[raceType] || 85);
  const taperStart = totalWeeks - 3;

  const weeks = [];
  let prev = baseWeeklyKm;

  for (let i = 0; i < totalWeeks; i++) {
    const weekDate = addWeeks(start, i);
    const key = weekDate.toISOString().slice(0, 10);
    let targetKm, phase;

    if (i >= totalWeeks - 1) {
      targetKm = parseFloat((peak * 0.25).toFixed(1));
      phase = 'race';
    } else if (i >= taperStart) {
      const taperIdx = i - taperStart;
      const taperFactors = [0.8, 0.6, 0.4];
      targetKm = parseFloat((peak * taperFactors[taperIdx]).toFixed(1));
      phase = 'taper';
    } else {
      const isRecovery = (i + 1) % 4 === 0;
      if (isRecovery) {
        targetKm = parseFloat((prev * 0.85).toFixed(1));
        phase = i < 3 ? 'base' : 'build';
      } else {
        const next = Math.min(prev * 1.08, peak);
        targetKm = parseFloat(next.toFixed(1));
        phase = i < 3 ? 'base' : 'build';
      }
      prev = targetKm;
    }

    weeks.push({ week: key, targetKm, phase, ...runTypesForKm(targetKm) });
  }

  return {
    raceType,
    raceDate,
    startDate: start.toISOString().slice(0, 10),
    baseWeeklyKm: parseFloat(baseWeeklyKm.toFixed(1)),
    weeks,
  };
}

export function detectBaseKm(weeklyKm) {
  if (!weeklyKm || !weeklyKm.length) return 25;
  const today = weekOf(Date.now());
  const complete = weeklyKm.filter(w => w.week < today).slice(-4);
  if (!complete.length) return 25;
  return parseFloat((complete.reduce((s, w) => s + w.km, 0) / complete.length).toFixed(1));
}

export function getPlanWeek(plan, weekKey) {
  if (!plan || !plan.weeks) return null;
  return plan.weeks.find(w => w.week === weekKey) || null;
}

export function getPlanAdherence(plan, weeklyKm) {
  if (!plan || !plan.weeks || !weeklyKm) return null;
  const today = weekOf(Date.now());
  const completed = plan.weeks.filter(w => w.week < today && w.phase !== 'race');
  if (!completed.length) return { adherencePct: 100, weeksCompleted: 0, totalPlanned: 0, totalActual: 0, detail: [] };

  const detail = completed.map(pw => {
    const actual = weeklyKm.find(w => w.week === pw.week);
    const actualKm = actual ? actual.km : 0;
    const pct = pw.targetKm > 0 ? Math.min(120, Math.round(actualKm / pw.targetKm * 100)) : 100;
    return { week: pw.week, target: pw.targetKm, actual: actualKm, pct, phase: pw.phase };
  });

  const totalPlanned = detail.reduce((s, w) => s + w.target, 0);
  const totalActual = detail.reduce((s, w) => s + w.actual, 0);
  const adherencePct = totalPlanned > 0 ? Math.min(120, Math.round(totalActual / totalPlanned * 100)) : 100;

  return { adherencePct, weeksCompleted: completed.length, totalPlanned, totalActual, detail };
}

export function getPlanWeekNumber(plan, weekKey) {
  if (!plan || !plan.weeks) return null;
  const idx = plan.weeks.findIndex(w => w.week === weekKey);
  return idx >= 0 ? idx + 1 : null;
}
