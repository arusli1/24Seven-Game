import { describe, expect, it } from 'vitest';
import { currentStats, DNF } from '../stats';

describe('currentStats', () => {
  it('the latest run is the single', () => {
    expect(currentStats([30_000])).toEqual({ single: 30_000 });
    expect(currentStats([10_000, 20_000])).toEqual({ single: 10_000 });
  });

  it('a DNF has no single', () => {
    expect(currentStats([DNF])).toEqual({});
    expect(currentStats([])).toEqual({});
  });
});
