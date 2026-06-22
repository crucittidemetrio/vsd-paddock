import { describe, it, expect } from 'vitest';
import { validatePlanCoverage } from './stintValidation';

const START = '2026-10-24T15:00:00';

// Helper: costruisce uno stint con orari derivati da offset in minuti dallo start
function stint(order, startOffsetMin, durationMin) {
  const base = new Date(START).getTime();
  const s = new Date(base + startOffsetMin * 60000);
  const e = new Date(base + (startOffsetMin + durationMin) * 60000);
  const iso = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  return { stint_order: order, planned_start_time: iso(s), planned_end_time: iso(e) };
}

describe('validatePlanCoverage', () => {
  it('piano valido: copertura completa senza gap né overlap', () => {
    const stints = [stint(1, 0, 90), stint(2, 90, 90), stint(3, 180, 90), stint(4, 270, 90)];
    const r = validatePlanCoverage(stints, START, 360);
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it('rileva un gap', () => {
    const stints = [stint(1, 0, 90), stint(2, 100, 90)]; // gap di 10 min dopo stint 1
    const r = validatePlanCoverage(stints, START, 180);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.type === 'gap')).toBe(true);
  });

  it('rileva un overlap', () => {
    const stints = [stint(1, 0, 90), stint(2, 80, 90)]; // overlap di 10 min
    const r = validatePlanCoverage(stints, START, 170);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.type === 'overlap')).toBe(true);
  });

  it('rileva end_mismatch se il piano non copre tutta la durata', () => {
    const stints = [stint(1, 0, 90), stint(2, 90, 90)]; // copre 180 ma la gara dura 360
    const r = validatePlanCoverage(stints, START, 360);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.type === 'end_mismatch')).toBe(true);
  });

  it('piano vuoto → no_stints', () => {
    const r = validatePlanCoverage([], START, 360);
    expect(r.valid).toBe(false);
    expect(r.issues[0].type).toBe('no_stints');
  });

  it('input invalido → invalid_input', () => {
    const r = validatePlanCoverage([stint(1, 0, 90)], 'non-una-data', 360);
    expect(r.valid).toBe(false);
    expect(r.issues[0].type).toBe('invalid_input');
  });
});
