import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatTrack,
  formatTrackInfo,
  formatCar,
  formatCarInfo,
  formatDate,
  formatDateTime,
  formatLapDelta,
  formatGapPercent,
  countdown,
  formatCountdown,
  formatRaceDateTime,
  formatDuration,
} from './format';

describe('formatTrack', () => {
  it('returns track_name from array when track_id matches', () => {
    const tracks = [{ track_id: 'lmu-spa-gp', track_name: 'Spa', sim: 'LMU' }];
    expect(formatTrack('lmu-spa-gp', tracks)).toBe('Spa');
  });

  it('matches case-insensitively on track_id', () => {
    const tracks = [{ track_id: 'LMU-SPA-GP', track_name: 'Spa' }];
    expect(formatTrack('lmu-spa-gp', tracks)).toBe('Spa');
  });

  it('falls back to TRACK_NAMES constant when not in array', () => {
    expect(formatTrack('spa-gp', [])).toBe('Spa-Francorchamps');
    expect(formatTrack('monza-gp', [])).toBe('Monza');
  });

  it('returns track_id unchanged when not found anywhere', () => {
    expect(formatTrack('unknown-track-id', [])).toBe('unknown-track-id');
    expect(formatTrack('unknown-track-id', undefined)).toBe('unknown-track-id');
  });

  it('returns em-dash for null/undefined/empty input', () => {
    expect(formatTrack(null, [])).toBe('—');
    expect(formatTrack('', [])).toBe('—');
    expect(formatTrack(undefined, [])).toBe('—');
  });
});

describe('formatTrackInfo', () => {
  it('returns track object when matched', () => {
    const tracks = [{ track_id: 'lmu-lemans', track_name: 'Le Mans', sim: 'LMU' }];
    const result = formatTrackInfo('lmu-lemans', tracks);
    expect(result.name).toBe('Le Mans');
    expect(result.sim).toBe('LMU');
  });

  it('extracts sim from track_id regex when not in array', () => {
    const result = formatTrackInfo('lmu-monza-gp', []);
    expect(result.sim).toBe('LMU');
  });

  it('extracts irc sim prefix uppercase', () => {
    const result = formatTrackInfo('irc-summit-point', []);
    expect(result.sim).toBe('IRC');
  });

  it('returns fallback object with null sim when no prefix match', () => {
    const result = formatTrackInfo('unknown-id', []);
    expect(result.name).toBe('unknown-id');
    expect(result.sim).toBe(null);
  });

  it('returns fallback object with name em-dash and sim null for invalid input', () => {
    const result = formatTrackInfo(null, []);
    expect(result.name).toBe('—');
    expect(result.sim).toBe(null);
  });
});

describe('formatCar', () => {
  it('returns car_name from array when car_id matches', () => {
    const cars = [{ car_id: 'lmu-ferrari-499p', car_name: 'Ferrari 499P' }];
    expect(formatCar('lmu-ferrari-499p', cars)).toBe('Ferrari 499P');
  });

  it('matches case-insensitively on car_id', () => {
    const cars = [{ car_id: 'LMU-FERRARI-499P', car_name: 'Ferrari 499P' }];
    expect(formatCar('lmu-ferrari-499p', cars)).toBe('Ferrari 499P');
  });

  it('falls back to CAR_NAMES constant when not in array', () => {
    expect(formatCar('ferrari-296-gt3', [])).toBe('Ferrari 296 GT3');
    expect(formatCar('porsche-963', [])).toBe('Porsche 963');
  });

  it('returns car_id unchanged when not found', () => {
    expect(formatCar('unknown-car', [])).toBe('unknown-car');
  });

  it('returns em-dash for null/undefined/empty input', () => {
    expect(formatCar(null, [])).toBe('—');
    expect(formatCar('', undefined)).toBe('—');
  });
});

describe('formatCarInfo', () => {
  it('returns complete car info object when matched', () => {
    const cars = [{ car_id: 'irc-gr86', car_name: 'Toyota GR86', category: 'Sports Car', race_class: 'GR86', sim: 'IRC' }];
    const result = formatCarInfo('irc-gr86', cars);
    expect(result.name).toBe('Toyota GR86');
    expect(result.category).toBe('Sports Car');
    expect(result.race_class).toBe('GR86');
    expect(result.sim).toBe('IRC');
  });

  it('extracts sim from car_id regex when not in array', () => {
    const result = formatCarInfo('lmu-ferrari-499p', []);
    expect(result.sim).toBe('LMU');
  });

  it('returns fallback info object with null metadata when not found', () => {
    const result = formatCarInfo('unknown-car', []);
    expect(result.name).toBe('unknown-car');
    expect(result.category).toBe(null);
    expect(result.race_class).toBe(null);
    expect(result.sim).toBe(null);
  });

  it('returns full em-dash + null fallback for null input', () => {
    const result = formatCarInfo(null, []);
    expect(result.name).toBe('—');
    expect(result.category).toBe(null);
    expect(result.race_class).toBe(null);
    expect(result.sim).toBe(null);
  });
});

describe('formatDate', () => {
  it('returns non-empty string for valid ISO', () => {
    const result = formatDate('2026-06-07T08:00:00.000Z');
    expect(result).toMatch(/\d{1,2}.+\d{2,4}/);
    expect(result).not.toBe('—');
  });

  it('returns em-dash for null or undefined', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('handles invalid date strings gracefully', () => {
    const result = formatDate('not-a-date');
    expect(result === '—' || result.includes('Invalid')).toBeTruthy();
  });
});

describe('formatDateTime', () => {
  it('returns non-empty string with time for valid ISO', () => {
    const result = formatDateTime('2026-06-07T08:00:00.000Z');
    expect(result).toMatch(/\d{1,2}.+\d{2,4}.+\d{1,2}:\d{2}/);
  });

  it('returns em-dash for null', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatRaceDateTime', () => {
  it('returns formatted string containing separator for valid ISO', () => {
    const result = formatRaceDateTime('2026-06-07T08:00:00.000Z');
    expect(result).toMatch(/\d{1,2}.+·.+\d{1,2}:\d{2}/);
  });

  it('returns em-dash for null', () => {
    expect(formatRaceDateTime(null)).toBe('—');
  });
});

describe('formatLapDelta', () => {
  it('formats positive delta correctly', () => {
    expect(formatLapDelta(90000, 89000)).toBe('+1.000');
  });

  it('formats negative delta correctly', () => {
    expect(formatLapDelta(89000, 90000)).toBe('-1.000');
  });

  it('returns em-dash for zero delta (identical times)', () => {
    expect(formatLapDelta(90000, 90000)).toBe('—');
  });

  it('returns em-dash for null/undefined input', () => {
    expect(formatLapDelta(null, 90000)).toBe('—');
    expect(formatLapDelta(90000, undefined)).toBe('—');
  });

  it('returns em-dash for NaN/Infinity input', () => {
    expect(formatLapDelta(90000, NaN)).toBe('—');
    expect(formatLapDelta(Infinity, 90000)).toBe('—');
  });
});

describe('formatGapPercent', () => {
  it('formats positive gap with percentage', () => {
    expect(formatGapPercent(90000, 89000)).toBe('+1.000s / +1.12%');
  });

  it('returns em-dash for identical times', () => {
    expect(formatGapPercent(90000, 90000)).toBe('—');
  });

  it('returns em-dash for null input', () => {
    expect(formatGapPercent(null, 90000)).toBe('—');
    expect(formatGapPercent(90000, null)).toBe('—');
  });

  it('returns em-dash when recordMs is zero or negative', () => {
    expect(formatGapPercent(90000, 0)).toBe('—');
    expect(formatGapPercent(90000, -100)).toBe('—');
  });

  it('returns em-dash for NaN input', () => {
    expect(formatGapPercent(90000, NaN)).toBe('—');
  });
});

describe('countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T08:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns isPast=false and correct positive diff for future date', () => {
    const result = countdown('2026-06-10T08:30:00.000Z');
    expect(result.isPast).toBe(false);
    expect(result.days).toBe(3);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(30);
  });

  it('returns isPast=true and positive abs diff for past date', () => {
    const result = countdown('2026-06-05T08:00:00.000Z');
    expect(result.isPast).toBe(true);
    expect(result.days).toBe(2);
    expect(result.hours).toBe(0);
  });

  it('handles same exact time with isPast=false (diff=0 not less than 0)', () => {
    const result = countdown('2026-06-07T08:00:00.000Z');
    expect(result.isPast).toBe(false);
    expect(result.days).toBe(0);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
  });

  it('returns null for null input', () => {
    expect(countdown(null)).toBe(null);
  });
});

describe('formatCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T08:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats days and hours for distant future', () => {
    const result = formatCountdown('2026-06-10T10:00:00.000Z');
    expect(result).toMatch(/3g 2h/);
  });

  it('formats hours and minutes for near future', () => {
    const result = formatCountdown('2026-06-07T10:30:00.000Z');
    expect(result).toMatch(/2h 30m/);
  });

  it('formats minutes only for imminent future', () => {
    const result = formatCountdown('2026-06-07T08:45:00.000Z');
    expect(result).toMatch(/45m/);
  });

  it('returns Conclusa for past date', () => {
    const result = formatCountdown('2026-06-05T08:00:00.000Z');
    expect(result.toLowerCase()).toContain('conclusa');
  });

  it('returns em-dash for null input', () => {
    expect(formatCountdown(null)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats standard duration with hours and minutes', () => {
    expect(formatDuration(90)).toBe('1h 30min');
  });

  it('formats whole hours only when minutes are zero', () => {
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(60)).toBe('1h');
  });

  it('formats minutes only when under 60', () => {
    expect(formatDuration(45)).toBe('45min');
  });

  it('formats zero as explicit 0min (valid zero value)', () => {
    expect(formatDuration(0)).toBe('0min');
  });

  it('returns em-dash for negative numbers', () => {
    expect(formatDuration(-10)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
  });

  it('returns em-dash for null/undefined/NaN', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(NaN)).toBe('—');
  });
});
