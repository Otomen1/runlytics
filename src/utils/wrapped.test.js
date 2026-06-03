import { describe, it, expect } from 'vitest';
import { computeWrapped, getMonthsWithActivity, getMemories, getHighlights } from './wrapped.js';

function makeAct(overrides = {}) {
  return {
    distanceKm: 5,
    movingTimeSec: 1800,
    avgPaceSecKm: 360,
    elevGainM: 0,
    trainingLoad: 40,
    mood: null,
    notes: '',
    photoCount: 0,
    date: '2024-06-10',
    ...overrides,
  };
}

describe('computeWrapped', () => {
  it('returns null for empty array', () => {
    expect(computeWrapped([], '2024-06')).toBeNull();
  });
  it('returns null when no activities match the month', () => {
    expect(computeWrapped([makeAct({ date: '2024-05-01' })], '2024-06')).toBeNull();
  });
  it('aggregates distance and run count', () => {
    const acts = [
      makeAct({ date: '2024-06-01', distanceKm: 8 }),
      makeAct({ date: '2024-06-10', distanceKm: 12 }),
    ];
    const result = computeWrapped(acts, '2024-06');
    expect(result.totalDistance).toBe(20);
    expect(result.totalRuns).toBe(2);
  });
  it('identifies the longest run', () => {
    const acts = [
      makeAct({ date: '2024-06-01', distanceKm: 5 }),
      makeAct({ date: '2024-06-10', distanceKm: 15 }),
    ];
    const result = computeWrapped(acts, '2024-06');
    expect(result.longestRun.distanceKm).toBe(15);
  });
  it('identifies the fastest run', () => {
    const acts = [
      makeAct({ date: '2024-06-01', avgPaceSecKm: 400 }),
      makeAct({ date: '2024-06-10', avgPaceSecKm: 300 }),
    ];
    const result = computeWrapped(acts, '2024-06');
    expect(result.fastestRun.avgPaceSecKm).toBe(300);
  });
  it('determines top mood by MOODS_ORDER priority', () => {
    const acts = [
      makeAct({ date: '2024-06-01', mood: 'tough' }),
      makeAct({ date: '2024-06-02', mood: 'good' }),
      makeAct({ date: '2024-06-03', mood: 'good' }),
    ];
    const result = computeWrapped(acts, '2024-06');
    expect(result.topMood).toBe('good');
  });
  it('counts memories (activities with mood, notes, or photo)', () => {
    const acts = [
      makeAct({ date: '2024-06-01', mood: 'great' }),
      makeAct({ date: '2024-06-02' }),
      makeAct({ date: '2024-06-03', notes: 'Good one' }),
    ];
    const result = computeWrapped(acts, '2024-06');
    expect(result.memoryCount).toBe(2);
  });
  it('calculates consecutive streak within month', () => {
    const acts = [
      makeAct({ date: '2024-06-01' }),
      makeAct({ date: '2024-06-02' }),
      makeAct({ date: '2024-06-03' }),
      makeAct({ date: '2024-06-10' }),
    ];
    const result = computeWrapped(acts, '2024-06');
    expect(result.streakDays).toBe(3);
  });
});

describe('getMonthsWithActivity', () => {
  it('returns empty array for no activities', () => {
    expect(getMonthsWithActivity([])).toEqual([]);
  });
  it('returns unique months sorted newest first', () => {
    const acts = [
      makeAct({ date: '2024-01-10' }),
      makeAct({ date: '2024-03-05' }),
      makeAct({ date: '2024-01-20' }),
    ];
    expect(getMonthsWithActivity(acts)).toEqual(['2024-03', '2024-01']);
  });
});

describe('getMemories', () => {
  it('returns empty array for no activities', () => {
    expect(getMemories([])).toEqual([]);
  });
  it('filters to activities with mood, notes, or photos', () => {
    const acts = [
      makeAct({ mood: 'great' }),
      makeAct(),
      makeAct({ notes: 'Good run' }),
      makeAct({ photoCount: 2 }),
    ];
    expect(getMemories(acts)).toHaveLength(3);
  });
  it('caps at 20 results', () => {
    const acts = Array.from({ length: 30 }, () => makeAct({ mood: 'good' }));
    expect(getMemories(acts)).toHaveLength(20);
  });
});

describe('getHighlights', () => {
  it('returns empty array for no activities', () => {
    expect(getHighlights([])).toEqual([]);
  });
  it('always includes strongest and longest run', () => {
    const acts = [makeAct({ distanceKm: 10, trainingLoad: 80 })];
    const highlights = getHighlights(acts);
    const labels = highlights.map(h => h.label);
    expect(labels).toContain('Strongest Run');
    expect(labels).toContain('Longest Run');
  });
  it('includes fastest run when pace data exists', () => {
    const acts = [makeAct({ avgPaceSecKm: 300 })];
    const labels = getHighlights(acts).map(h => h.label);
    expect(labels).toContain('Fastest Run');
  });
  it('includes biggest climb when elevation data exists', () => {
    const acts = [makeAct({ elevGainM: 500 })];
    const labels = getHighlights(acts).map(h => h.label);
    expect(labels).toContain('Biggest Climb');
  });
  it('includes favorite memory when notes exist', () => {
    const acts = [makeAct({ notes: 'Amazing run in the hills' })];
    const labels = getHighlights(acts).map(h => h.label);
    expect(labels).toContain('Favorite Memory');
  });
  it('each highlight has icon and act', () => {
    const acts = [makeAct({ distanceKm: 10, trainingLoad: 80, avgPaceSecKm: 300 })];
    getHighlights(acts).forEach(h => {
      expect(h.icon).toBeDefined();
      expect(h.act).toBeDefined();
    });
  });
});
