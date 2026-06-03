import { describe, it, expect } from 'vitest';
import { fmtKm, fmtPace, fmtDur, fmtRaceTime, weekOf, monthOf, fmtDate, fmtDateS } from './formatters.js';

describe('fmtKm', () => {
  it('formats to 2 decimal places', () => { expect(fmtKm(5.123)).toBe('5.12'); });
  it('trims trailing zeros', () => { expect(fmtKm(10.5)).toBe('10.5'); });
  it('handles integer', () => { expect(fmtKm(10)).toBe('10'); });
  it('returns "0" for zero', () => { expect(fmtKm(0)).toBe('0'); });
  it('returns "0" for null', () => { expect(fmtKm(null)).toBe('0'); });
  it('returns "0" for NaN', () => { expect(fmtKm(NaN)).toBe('0'); });
  it('returns "0" for undefined', () => { expect(fmtKm(undefined)).toBe('0'); });
  it('returns "0" for negative', () => { expect(fmtKm(-5)).toBe('0'); });
});

describe('fmtPace', () => {
  it('formats 5:00 min/km', () => { expect(fmtPace(300)).toBe('5:00'); });
  it('formats 5:30 min/km', () => { expect(fmtPace(330)).toBe('5:30'); });
  it('pads single-digit seconds', () => { expect(fmtPace(65)).toBe('1:05'); });
  it('returns "--:--" for zero', () => { expect(fmtPace(0)).toBe('--:--'); });
  it('returns "--:--" for null', () => { expect(fmtPace(null)).toBe('--:--'); });
  it('returns "--:--" for negative', () => { expect(fmtPace(-1)).toBe('--:--'); });
  it('returns "--:--" for over 3600', () => { expect(fmtPace(3601)).toBe('--:--'); });
});

describe('fmtDur', () => {
  it('formats minutes:seconds under an hour', () => { expect(fmtDur(90)).toBe('1:30'); });
  it('formats with hours', () => { expect(fmtDur(3661)).toBe('1:01:01'); });
  it('pads minutes when hours present', () => { expect(fmtDur(3600)).toBe('1:00:00'); });
  it('pads seconds', () => { expect(fmtDur(65)).toBe('1:05'); });
  it('returns "0:00" for zero', () => { expect(fmtDur(0)).toBe('0:00'); });
  it('returns "0:00" for null', () => { expect(fmtDur(null)).toBe('0:00'); });
  it('returns "0:00" for negative', () => { expect(fmtDur(-1)).toBe('0:00'); });
  it('fmtRaceTime aliases fmtDur', () => { expect(fmtRaceTime(3661)).toBe(fmtDur(3661)); });
});

describe('weekOf', () => {
  // These tests assume TZ=UTC (enforced in CI via workflow env)
  it('returns Monday of the week for a Wednesday input', () => {
    // Jan 10 2024 = Wednesday; Monday of that week = Jan 8
    expect(weekOf(Date.UTC(2024, 0, 10, 12))).toBe('2024-01-08');
  });
  it('returns the same day for a Monday input', () => {
    expect(weekOf(Date.UTC(2024, 0, 8, 12))).toBe('2024-01-08');
  });
  it('returns the correct Monday for a Sunday input', () => {
    // Jan 14 2024 = Sunday; Monday of that week = Jan 8
    expect(weekOf(Date.UTC(2024, 0, 14, 12))).toBe('2024-01-08');
  });
});

describe('monthOf', () => {
  it('returns YYYY-MM string', () => {
    expect(monthOf(Date.UTC(2024, 5, 15))).toBe('2024-06');
  });
  it('handles January correctly', () => {
    expect(monthOf(Date.UTC(2024, 0, 1))).toBe('2024-01');
  });
});

describe('fmtDate', () => {
  it('returns empty string for falsy input', () => { expect(fmtDate('')).toBe(''); });
  it('returns original string for invalid date', () => { expect(fmtDate('not-a-date')).toBe('not-a-date'); });
  it('returns non-empty string for valid ISO date', () => {
    expect(fmtDate('2024-06-15T12:00:00Z').length).toBeGreaterThan(0);
  });
});

describe('fmtDateS', () => {
  it('returns empty string for falsy input', () => { expect(fmtDateS('')).toBe(''); });
  it('returns original string for invalid date', () => { expect(fmtDateS('bad')).toBe('bad'); });
  it('returns non-empty string for valid ISO date', () => {
    expect(fmtDateS('2024-06-15T12:00:00Z').length).toBeGreaterThan(0);
  });
});
