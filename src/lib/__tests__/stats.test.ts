import { describe, expect, it } from 'vitest';
import { currentStats, DNF } from '../stats';

describe('currentStats', () => {
  it('single only, until enough runs', () => {
    expect(currentStats([30_000])).toEqual({ single: 30_000 });
    expect(currentStats([30_000, 20_000])).toEqual({ single: 30_000 });
  });

  it('mean of 3 and speedcubing average of 5 (drop best and worst)', () => {
    // newest first
    const recent = [10_000, 20_000, 30_000, 90_000, 5_000];
    expect(currentStats(recent)).toEqual({ single: 10_000, mo3: 20_000, ao5: 20_000 });
  });

  it('DNF: no single, voids avg of 3, counts as worst in avg of 5 (once)', () => {
    expect(currentStats([DNF])).toEqual({});
    expect(currentStats([10_000, DNF, 20_000, 30_000, 40_000])).toEqual({ single: 10_000, ao5: 30_000 });
    expect(currentStats([10_000, DNF, DNF, 30_000, 40_000])).toEqual({ single: 10_000 });
  });
});
