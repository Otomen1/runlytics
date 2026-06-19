// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock heavy deps that aren't under test
vi.mock('recharts', () => ({ ResponsiveContainer: ({children})=>children, AreaChart: ()=>null, Area: ()=>null, XAxis: ()=>null, YAxis: ()=>null, Tooltip: ()=>null }));
vi.mock('../Map/RouteMapSVG.jsx', () => ({ RouteMapSVG: () => null }));
vi.mock('../common/SH.jsx', () => ({ SH: () => null }));
vi.mock('./JournalTab.jsx', () => ({ JournalTab: () => null }));
vi.mock('../../db/indexedDB.js', () => ({ saveActivity: vi.fn().mockResolvedValue(), getPhotos: vi.fn().mockResolvedValue([]) }));
vi.mock('../../db/strava.js', () => ({ fetchStravaSplits: vi.fn().mockResolvedValue(null), loadStravaAuth: vi.fn().mockReturnValue(null), getStravaToken: vi.fn().mockResolvedValue(null) }));
vi.mock('../../utils/analytics.js', () => ({ getMafHR: () => 150, computeZones: () => [], computeSplits: () => [] }));

import { Detail } from './Detail.jsx';

const mockAct = {
  id: 'test-1', name: 'Morning Run', type: 'Run', date: '2025-06-01',
  dateTs: new Date('2025-06-01').getTime(), distanceKm: 10, movingTimeSec: 3600,
  avgPaceSecKm: 360, avgHR: 145, maxHR: 170, elevGainM: 50, elevLossM: 0,
  runClass: 'easy', hrSamples: [], route: [], source: 'gpx', trainingLoad: 60,
  notes: '', mood: null, photoCount: 0, shoeId: null, isRace: false,
  raceGoalSec: null, raceLocation: '',
};

describe('Detail — inline delete confirmation', () => {
  let onDelete, onClose;

  beforeEach(() => {
    onDelete = vi.fn();
    onClose = vi.fn();
  });

  it('shows the 🗑 delete button initially', () => {
    render(<Detail act={mockAct} hrProfile={{age:30}} onClose={onClose} onDelete={onDelete}/>);
    expect(screen.getByRole('button', { name: /delete run/i })).toBeInTheDocument();
  });

  it('shows Cancel + Delete? buttons after clicking 🗑', () => {
    render(<Detail act={mockAct} hrProfile={{age:30}} onClose={onClose} onDelete={onDelete}/>);
    fireEvent.click(screen.getByRole('button', { name: /delete run/i }));
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete\?/i })).toBeInTheDocument();
  });

  it('does NOT call onDelete when Cancel is clicked', () => {
    render(<Detail act={mockAct} hrProfile={{age:30}} onClose={onClose} onDelete={onDelete}/>);
    fireEvent.click(screen.getByRole('button', { name: /delete run/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /delete run/i })).toBeInTheDocument();
  });

  it('calls onDelete(act.id) when Delete? is confirmed', () => {
    render(<Detail act={mockAct} hrProfile={{age:30}} onClose={onClose} onDelete={onDelete}/>);
    fireEvent.click(screen.getByRole('button', { name: /delete run/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete\?/i }));
    expect(onDelete).toHaveBeenCalledWith('test-1');
  });

  it('Close button has aria-label', () => {
    render(<Detail act={mockAct} hrProfile={{age:30}} onClose={onClose} onDelete={onDelete}/>);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });
});
