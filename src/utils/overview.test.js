import { describe, it, expect } from 'vitest';
import {
  crewRule,
  crewStatus,
  countRsvps,
  plannedStintMinutes,
  buildReadiness,
  treasuryRunway,
  activePilotTrend,
  isSoloRace,
  soloChampionshipIds,
} from './overview';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-06T12:00:00Z').getTime();

describe('crewRule', () => {
  it('sprint fino a 120 minuti: 1-2 piloti', () => {
    expect(crewRule(40)).toMatchObject({ min: 1, max: 2, kind: 'sprint' });
    expect(crewRule(120)).toMatchObject({ min: 1, max: 2, kind: 'sprint' });
  });
  it('oltre 120 minuti: 2-6 piloti', () => {
    expect(crewRule(121)).toMatchObject({ min: 2, max: 6, kind: 'endurance' });
    expect(crewRule(360)).toMatchObject({ min: 2, max: 6, kind: 'endurance' });
    expect(crewRule('1440')).toMatchObject({ min: 2, max: 6, kind: 'endurance' });
  });
  it('durata mancante o non valida: regola sprint', () => {
    expect(crewRule(null).kind).toBe('sprint');
    expect(crewRule('').kind).toBe('sprint');
    expect(crewRule('abc').kind).toBe('sprint');
  });
});

describe('crewStatus', () => {
  it('ok quando i confermati raggiungono il minimo', () => {
    expect(crewStatus({ confirmed: 1, tentative: 0, durationMin: 40 }).level).toBe('ok');
    expect(crewStatus({ confirmed: 2, tentative: 0, durationMin: 360 }).level).toBe('ok');
  });
  it('risk quando mancano ma i forse bastano', () => {
    const s = crewStatus({ confirmed: 1, tentative: 1, durationMin: 360 });
    expect(s.level).toBe('risk');
    expect(s.missing).toBe(1);
  });
  it('ko quando nemmeno con i forse si arriva al minimo', () => {
    expect(crewStatus({ confirmed: 0, tentative: 1, durationMin: 360 }).level).toBe('ko');
    expect(crewStatus({ confirmed: 0, tentative: 0, durationMin: 40 }).level).toBe('ko');
  });
  it('segnala overMax senza trattarlo come errore', () => {
    const s = crewStatus({ confirmed: 7, tentative: 0, durationMin: 360 });
    expect(s.level).toBe('ok');
    expect(s.overMax).toBe(true);
  });
  it('ignora valori negativi o non numerici', () => {
    const s = crewStatus({ confirmed: -3, tentative: 'x', durationMin: 40 });
    expect(s.confirmed).toBe(0);
    expect(s.tentative).toBe(0);
  });
});

describe('countRsvps', () => {
  it('conta per stato e una volta sola per pilota', () => {
    const c = countRsvps([
      { driver_id: 'a', status: 'tentative' },
      { driver_id: 'a', status: 'confirmed' },
      { driver_id: 'b', status: 'declined' },
      { driver_id: 'c', status: 'tentative' },
    ]);
    expect(c).toEqual({ confirmed: 1, tentative: 1, declined: 1, responded: 3 });
  });
  it('ignora chi non è nel set dei piloti attivi', () => {
    const c = countRsvps(
      [{ driver_id: 'a', status: 'confirmed' }, { driver_id: 'x', status: 'confirmed' }],
      new Set(['a']),
    );
    expect(c.confirmed).toBe(1);
  });
  it('gestisce input vuoto', () => {
    expect(countRsvps(null).responded).toBe(0);
  });
});

describe('plannedStintMinutes', () => {
  it('somma le durate escludendo gli stint abortiti', () => {
    expect(plannedStintMinutes([
      { planned_duration_min: 60 },
      { planned_duration_min: '45', status: 'planned' },
      { planned_duration_min: 30, status: 'aborted' },
    ])).toBe(105);
  });
});

describe('buildReadiness', () => {
  const drivers = [{ driver_id: 'a' }, { driver_id: 'b' }, { driver_id: 'c' }];

  it('sprint: niente voce stint, 100% con un confermato assegnato', () => {
    const r = buildReadiness({
      race: { duration_minutes: 40 },
      activeDrivers: [{ driver_id: 'a' }],
      rsvps: [{ driver_id: 'a', status: 'confirmed' }],
      crews: [{ driver_id: 'a' }],
      stints: [],
    });
    expect(r.items.map(i => i.key)).toEqual(['crew', 'rsvp', 'assign']);
    expect(r.percent).toBe(100);
  });

  it('endurance: include la voce stint e la tolleranza del 2%', () => {
    const r = buildReadiness({
      race: { duration_minutes: 360 },
      activeDrivers: drivers,
      rsvps: drivers.map(d => ({ driver_id: d.driver_id, status: 'confirmed' })),
      crews: drivers,
      stints: [{ planned_duration_min: 359 }],
    });
    expect(r.items.find(i => i.key === 'stints').done).toBe(true);
    expect(r.percent).toBe(100);
  });

  it('endurance senza stint: voce stint non completata', () => {
    const r = buildReadiness({
      race: { duration_minutes: 360 },
      activeDrivers: drivers,
      rsvps: drivers.map(d => ({ driver_id: d.driver_id, status: 'confirmed' })),
      crews: drivers,
      stints: [],
    });
    expect(r.items.find(i => i.key === 'stints').done).toBe(false);
    expect(r.percent).toBe(75);
  });

  it('elenca chi non ha risposto', () => {
    const r = buildReadiness({
      race: { duration_minutes: 40 },
      activeDrivers: drivers,
      rsvps: [{ driver_id: 'a', status: 'confirmed' }],
      crews: [],
      stints: [],
    });
    expect(r.missingRsvpIds).toEqual(['b', 'c']);
    expect(r.items.find(i => i.key === 'rsvp').done).toBe(false);
  });

  it('senza piloti attivi la voce RSVP non risulta completata', () => {
    const r = buildReadiness({
      race: { duration_minutes: 40 },
      activeDrivers: [],
      rsvps: [],
      crews: [],
      stints: [],
    });
    expect(r.items.find(i => i.key === 'rsvp').done).toBe(false);
  });
});

describe('treasuryRunway', () => {
  it('calcola saldo e autonomia sulla spesa media mensile', () => {
    const entries = [
      { type: 'entrata', amount: '300', date: '2026-05-01' },
      { type: 'uscita', amount: '60', date: '2026-10-01' },
      { type: 'uscita', amount: '60', date: '2026-09-01' },
    ];
    const r = treasuryRunway(entries, NOW, 6);
    expect(r.balance).toBe(180);
    expect(r.monthlySpend).toBe(20);
    expect(r.runwayMonths).toBe(9);
  });
  it('senza uscite recenti l\'autonomia non è calcolabile', () => {
    const r = treasuryRunway([
      { type: 'entrata', amount: 100, date: '2026-01-01' },
      { type: 'uscita', amount: 50, date: '2025-01-01' },
    ], NOW, 6);
    expect(r.balance).toBe(50);
    expect(r.runwayMonths).toBeNull();
  });
  it('gestisce lista vuota', () => {
    expect(treasuryRunway([], NOW)).toMatchObject({ balance: 0, runwayMonths: null });
  });
});

describe('activePilotTrend', () => {
  const active = new Set(['a', 'b', 'c']);
  const iso = daysAgo => new Date(NOW - daysAgo * DAY).toISOString();

  it('confronta la finestra corrente con la precedente', () => {
    const t = activePilotTrend([
      { driver_id: 'a', set_date: iso(5) },
      { driver_id: 'a', set_date: iso(10) },
      { driver_id: 'b', set_date: iso(40) },
      { driver_id: 'c', set_date: iso(45) },
    ], active, NOW, 30);
    expect(t).toEqual({ current: 1, previous: 2, delta: -1 });
  });
  it('esclude chi non è attivo e le date non valide', () => {
    const t = activePilotTrend([
      { driver_id: 'x', set_date: iso(2) },
      { driver_id: 'a', set_date: 'non-una-data' },
      { driver_id: 'a' },
    ], active, NOW, 30);
    expect(t.current).toBe(0);
  });
});

describe('campionati solitari (UE144)', () => {
  it('crewRule: il formato solitario prevale sulla durata', () => {
    expect(crewRule(144, true)).toEqual({ min: 1, max: 1, kind: 'solo' });
    expect(crewRule(40, true)).toEqual({ min: 1, max: 1, kind: 'solo' });
    expect(crewRule(144, false).kind).toBe('endurance');
  });

  it('crewStatus: basta un confermato, e molti confermati non sono un eccesso', () => {
    expect(crewStatus({ confirmed: 1, tentative: 0, durationMin: 144, solo: true }).level).toBe('ok');
    const many = crewStatus({ confirmed: 12, tentative: 0, durationMin: 144, solo: true });
    expect(many.level).toBe('ok');
    expect(many.overMax).toBe(false);
  });

  it('crewStatus: senza confermati ma con un forse è "da confermare"', () => {
    expect(crewStatus({ confirmed: 0, tentative: 1, durationMin: 144, solo: true }).level).toBe('risk');
    expect(crewStatus({ confirmed: 0, tentative: 0, durationMin: 144, solo: true }).level).toBe('ko');
  });

  it('buildReadiness: nessuno stint da pianificare e 100% con un confermato assegnato', () => {
    const r = buildReadiness({
      race: { duration_minutes: 144 },
      activeDrivers: [{ driver_id: 'a' }],
      rsvps: [{ driver_id: 'a', status: 'confirmed' }],
      crews: [{ driver_id: 'a' }],
      stints: [],
      solo: true,
    });
    expect(r.items.map(i => i.key)).toEqual(['crew', 'rsvp', 'assign']);
    expect(r.percent).toBe(100);
    expect(r.crew.kind).toBe('solo');
  });

  it('la stessa gara senza il flag resta una endurance da 2 piloti e con stint', () => {
    const r = buildReadiness({
      race: { duration_minutes: 144 },
      activeDrivers: [{ driver_id: 'a' }],
      rsvps: [{ driver_id: 'a', status: 'confirmed' }],
      crews: [{ driver_id: 'a' }],
      stints: [],
    });
    expect(r.items.map(i => i.key)).toContain('stints');
    expect(r.crew.min).toBe(2);
  });

  it('soloChampionshipIds: seleziona solo le serie solitarie', () => {
    const ids = soloChampionshipIds([
      { id: 'chmp-ue', series: 'ue144' },
      { id: 'chmp-clash', series: 'clash-of-classes' },
      { id: 'era-s3', series: null },
      { id: 'chmp-big6' },
      null,
    ]);
    expect([...ids]).toEqual(['chmp-ue']);
  });

  it('soloChampionshipIds: accetta una lista di serie personalizzata', () => {
    const ids = soloChampionshipIds([{ id: 'x', series: 'altra' }], ['altra']);
    expect(ids.has('x')).toBe(true);
  });

  it('isSoloRace: legge championship_id e gestisce gare senza campionato', () => {
    const solo = new Set(['chmp-ue']);
    expect(isSoloRace({ championship_id: 'chmp-ue' }, solo)).toBe(true);
    expect(isSoloRace({ championship_id: 'chmp-big6' }, solo)).toBe(false);
    expect(isSoloRace({ championship_id: null }, solo)).toBe(false);
    expect(isSoloRace({}, solo)).toBe(false);
    expect(isSoloRace(null, solo)).toBe(false);
  });
});
