import { describe, it, expect } from 'vitest';
import {
  generatePlan,
  detectBaseKm,
  getPlanWeek,
  getPlanAdherence,
  getPlanWeekNumber,
  getTodayWorkout,
} from './trainingPlan.js';

function makePlan(overrides = {}) {
  return generatePlan('HM', futureDate(16), 40, ...Object.values(overrides));
}

function futureDate(weeks) {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function planWeekStub(overrides = {}) {
  return { targetKm: 42, easy: 2, long: 1, workout: 1, phase: 'build', week: '2026-06-01', ...overrides };
}

// ── generatePlan ──────────────────────────────────────────────────────────────

describe('generatePlan', () => {
  it('returns correct shape', () => {
    const plan = generatePlan('HM', futureDate(16), 40);
    expect(plan).toHaveProperty('raceType', 'HM');
    expect(plan.weeks.length).toBeGreaterThanOrEqual(8);
    expect(plan.weeks[0]).toHaveProperty('phase');
    expect(plan.weeks[0]).toHaveProperty('targetKm');
    expect(plan.weeks[0]).toHaveProperty('easy');
  });

  it('clamps to 8 weeks minimum', () => {
    const plan = generatePlan('5K', futureDate(4), 20);
    expect(plan.weeks.length).toBe(8);
  });

  it('last week is race phase', () => {
    const plan = generatePlan('HM', futureDate(12), 40);
    expect(plan.weeks[plan.weeks.length - 1].phase).toBe('race');
  });

  it('taper weeks decrease volume', () => {
    const plan = generatePlan('HM', futureDate(16), 40);
    const n = plan.weeks.length;
    expect(plan.weeks[n - 2].targetKm).toBeLessThan(plan.weeks[n - 4].targetKm);
  });

  it('caps peak at RACE_PEAK for type', () => {
    const plan = generatePlan('5K', futureDate(16), 100);
    const peak = Math.max(...plan.weeks.map(w => w.targetKm));
    expect(peak).toBeLessThanOrEqual(55);
  });
});

// ── detectBaseKm ──────────────────────────────────────────────────────────────

describe('detectBaseKm', () => {
  it('returns 25 fallback for empty input', () => {
    expect(detectBaseKm([])).toBe(25);
    expect(detectBaseKm(null)).toBe(25);
  });

  it('averages last 4 complete weeks', () => {
    const weeks = [
      { week: '2026-05-04', km: 30 },
      { week: '2026-05-11', km: 40 },
      { week: '2026-05-18', km: 35 },
      { week: '2026-05-25', km: 45 },
    ];
    const result = detectBaseKm(weeks);
    expect(result).toBe(37.5);
  });
});

// ── getPlanWeek ───────────────────────────────────────────────────────────────

describe('getPlanWeek', () => {
  it('returns matching week', () => {
    const plan = generatePlan('HM', futureDate(16), 40);
    const key = plan.weeks[0].week;
    expect(getPlanWeek(plan, key)).toEqual(plan.weeks[0]);
  });

  it('returns null for out-of-range key', () => {
    const plan = generatePlan('HM', futureDate(16), 40);
    expect(getPlanWeek(plan, '1990-01-01')).toBeNull();
  });
});

// ── getPlanWeekNumber ─────────────────────────────────────────────────────────

describe('getPlanWeekNumber', () => {
  it('returns 1-based index', () => {
    const plan = generatePlan('HM', futureDate(16), 40);
    expect(getPlanWeekNumber(plan, plan.weeks[0].week)).toBe(1);
    expect(getPlanWeekNumber(plan, plan.weeks[2].week)).toBe(3);
  });

  it('returns null for missing key', () => {
    const plan = generatePlan('HM', futureDate(16), 40);
    expect(getPlanWeekNumber(plan, '1990-01-01')).toBeNull();
  });
});

// ── getPlanAdherence ──────────────────────────────────────────────────────────

describe('getPlanAdherence', () => {
  it('returns 100% adherence when no weeks completed', () => {
    const plan = generatePlan('HM', futureDate(16), 40);
    const result = getPlanAdherence(plan, []);
    expect(result.adherencePct).toBe(100);
    expect(result.weeksCompleted).toBe(0);
  });
});

// ── getTodayWorkout ───────────────────────────────────────────────────────────

describe('getTodayWorkout', () => {
  it('returns null when planWeek is null', () => {
    expect(getTodayWorkout(null, [], null, 150, 0)).toBeNull();
  });

  it('returns done:true when all run types completed', () => {
    const pw = planWeekStub({ easy: 1, long: 1, workout: 1 });
    const weekActs = [
      { distanceKm: 8,  runClass: 'easy' },
      { distanceKm: 16, runClass: 'long' },
      { distanceKm: 10, runClass: 'workout' },
    ];
    const result = getTodayWorkout(pw, weekActs, 330, 150, 2);
    expect(result.done).toBe(true);
  });

  it('prioritises workout over long and easy', () => {
    const pw = planWeekStub({ easy: 2, long: 1, workout: 1 });
    const result = getTodayWorkout(pw, [], 330, 150, 2);
    expect(result.type).toBe('workout');
  });

  it('falls back to long when workout is done', () => {
    const pw = planWeekStub({ easy: 2, long: 1, workout: 1 });
    const weekActs = [{ distanceKm: 10, runClass: 'workout' }];
    const result = getTodayWorkout(pw, weekActs, 330, 150, 2);
    expect(result.type).toBe('long');
  });

  it('returns easy when only easy remains', () => {
    const pw = planWeekStub({ easy: 2, long: 1, workout: 1 });
    const weekActs = [
      { distanceKm: 10, runClass: 'workout' },
      { distanceKm: 16, runClass: 'long' },
    ];
    const result = getTodayWorkout(pw, weekActs, 330, 150, 2);
    expect(result.type).toBe('easy');
  });

  it('overrides to easy when fatigued (form < -8)', () => {
    const pw = planWeekStub({ easy: 1, long: 1, workout: 1 });
    const result = getTodayWorkout(pw, [], 330, 150, -10);
    expect(result.type).toBe('easy');
  });

  it('includes paceNote when no avgPaceSecKm given', () => {
    const pw = planWeekStub({ easy: 2, long: 0, workout: 0 });
    const result = getTodayWorkout(pw, [], null, 150, 0);
    expect(result.paceNote).toBeTruthy();
    expect(result.paceMin).toBeNull();
  });

  it('computes pace range when avgPaceSecKm provided', () => {
    const pw = planWeekStub({ easy: 2, long: 0, workout: 0 });
    const result = getTodayWorkout(pw, [], 330, 150, 0);
    expect(result.paceMin).toBeGreaterThan(330);
    expect(result.paceMax).toBeGreaterThan(result.paceMin);
  });

  it('distanceKm is within sensible bounds for each type', () => {
    const pw = planWeekStub({ targetKm: 50, easy: 3, long: 1, workout: 1 });
    const easy    = getTodayWorkout({ ...pw, easy: 1, long: 0, workout: 0 }, [], null, null, 0);
    const long    = getTodayWorkout({ ...pw, easy: 0, long: 1, workout: 0 }, [], null, null, 0);
    const workout = getTodayWorkout({ ...pw, easy: 0, long: 0, workout: 1 }, [], null, null, 0);
    expect(easy.distanceKm).toBeGreaterThanOrEqual(5);
    expect(easy.distanceKm).toBeLessThanOrEqual(18);
    expect(long.distanceKm).toBeGreaterThanOrEqual(10);
    expect(long.distanceKm).toBeLessThanOrEqual(35);
    expect(workout.distanceKm).toBeGreaterThanOrEqual(6);
    expect(workout.distanceKm).toBeLessThanOrEqual(16);
  });
});
