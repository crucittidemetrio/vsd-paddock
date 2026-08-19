import { describe, it, expect } from 'vitest';
import { validatePlanCoverage, validatePilotLimits, validateFairShare } from './stintValidation';

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

describe('validatePilotLimits', () => {
  const START = '2026-10-24T15:00:00';
  function plStint(order, driver, startOffsetMin, durationMin) {
    const base = new Date(START).getTime();
    const s = new Date(base + startOffsetMin * 60000);
    const e = new Date(base + (startOffsetMin + durationMin) * 60000);
    const iso = d => {
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    return { stint_order: order, driver_id: driver, planned_start_time: iso(s), planned_end_time: iso(e) };
  }

  it('nessun limite impostato → sempre valido', () => {
    expect(validatePilotLimits([plStint(1,'A',0,600)], {}).valid).toBe(true);
  });
  it('ore massime: segnala chi sfora', () => {
    const stints = [plStint(1,'A',0,300), plStint(2,'B',300,60), plStint(3,'A',360,300)];
    const r = validatePilotLimits(stints, { maxHoursPerDriver: 8 });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.type === 'max_hours_exceeded' && i.driver_id === 'A')).toBe(true);
  });
  it('ore massime: nessuno sfora → valido', () => {
    const stints = [plStint(1,'A',0,120), plStint(2,'B',120,120)];
    expect(validatePilotLimits(stints, { maxHoursPerDriver: 8 }).valid).toBe(true);
  });
  it('riposo minimo: riposo insufficiente segnalato', () => {
    const stints = [plStint(1,'A',0,90), plStint(2,'A',100,90)];
    const r = validatePilotLimits(stints, { minRestMinutes: 30 });
    expect(r.issues.some(i => i.type === 'insufficient_rest')).toBe(true);
  });
  it('riposo minimo: rotazione ampia → valido', () => {
    const stints = [plStint(1,'A',0,90), plStint(2,'B',90,90), plStint(3,'C',180,90), plStint(4,'A',270,90)];
    expect(validatePilotLimits(stints, { minRestMinutes: 30 }).valid).toBe(true);
  });
  it('entrambi i limiti insieme', () => {
    const stints = [plStint(1,'A',0,300), plStint(2,'A',310,300)];
    const r = validatePilotLimits(stints, { maxHoursPerDriver: 8, minRestMinutes: 30 });
    expect(r.issues.some(i => i.type === 'max_hours_exceeded')).toBe(true);
    expect(r.issues.some(i => i.type === 'insufficient_rest')).toBe(true);
  });
  it('ore: usa planned_duration_min, non la differenza di orari (robustezza DST)', () => {
    // Stint con durata dichiarata 90 ma differenza orari naive di soli 30 min:
    // simula lo sfasamento del cambio ora. Il calcolo DEVE usare i 90 dichiarati.
    const stints = [
      { stint_order: 1, driver_id: 'A',
        planned_start_time: '2026-10-25T02:00:00',
        planned_end_time: '2026-10-25T02:30:00',
        planned_duration_min: 90 },
      { stint_order: 2, driver_id: 'A',
        planned_start_time: '2026-10-25T02:30:00',
        planned_end_time: '2026-10-25T04:00:00',
        planned_duration_min: 90 },
    ];
    const r = validatePilotLimits(stints, { maxHoursPerDriver: 2.5 });
    const issue = r.issues.find(i => i.type === 'max_hours_exceeded' && i.driver_id === 'A');
    expect(issue).toBeTruthy();
    expect(issue.value).toBe(3);
  });
});

describe('validateFairShare', () => {
  function fsStint(order, driver, durationMin) {
    return { stint_order: order, driver_id: driver, planned_duration_min: durationMin };
  }

  it('piano vuoto → valido, nessun byDriver', () => {
    const r = validateFairShare([]);
    expect(r.valid).toBe(true);
    expect(r.byDriver).toHaveLength(0);
  });

  it('un solo pilota in rotazione → bilanciamento non applicabile', () => {
    const stints = [fsStint(1, 'A', 300), fsStint(2, 'A', 300)];
    const r = validateFairShare(stints);
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
    expect(r.byDriver).toHaveLength(1);
  });

  it('distribuzione equa tra due piloti → valido', () => {
    const stints = [fsStint(1, 'A', 180), fsStint(2, 'B', 180), fsStint(3, 'A', 180), fsStint(4, 'B', 180)];
    const r = validateFairShare(stints);
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
    expect(r.byDriver.find(d => d.driver_id === 'A').minutes).toBe(360);
    expect(r.byDriver.find(d => d.driver_id === 'B').minutes).toBe(360);
  });

  it('distribuzione sbilanciata oltre la soglia default (25%) → segnalata', () => {
    // A guida 600 min, B guida 100 min: media 350, A è a +71%, B a -71%
    const stints = [fsStint(1, 'A', 600), fsStint(2, 'B', 100)];
    const r = validateFairShare(stints);
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.type === 'unbalanced_share' && i.driver_id === 'A')).toBe(true);
    expect(r.issues.some(i => i.type === 'unbalanced_share' && i.driver_id === 'B')).toBe(true);
  });

  it('scostamento lieve entro la soglia → valido', () => {
    // A guida 400, B guida 320: media 360, scostamento ±11%, sotto la soglia 25%
    const stints = [fsStint(1, 'A', 400), fsStint(2, 'B', 320)];
    const r = validateFairShare(stints);
    expect(r.valid).toBe(true);
  });

  it('soglia personalizzata più stretta cattura scostamenti minori', () => {
    const stints = [fsStint(1, 'A', 400), fsStint(2, 'B', 320)];
    const r = validateFairShare(stints, { toleranceFraction: 0.05 });
    expect(r.valid).toBe(false);
  });

  it('byDriver ordinato per minuti decrescenti con share_pct coerente', () => {
    const stints = [fsStint(1, 'A', 100), fsStint(2, 'B', 300)];
    const r = validateFairShare(stints);
    expect(r.byDriver[0].driver_id).toBe('B');
    expect(r.byDriver[0].share_pct).toBe(75);
    expect(r.byDriver[1].share_pct).toBe(25);
  });
});