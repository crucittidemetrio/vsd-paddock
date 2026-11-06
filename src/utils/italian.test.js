import { describe, it, expect } from 'vitest';
import { withPrepositionA } from './italian';

describe('withPrepositionA', () => {
  it('contrae gli articoli determinativi', () => {
    expect(withPrepositionA('il Pit Wall')).toBe('al Pit Wall');
    expect(withPrepositionA('la Panoramica')).toBe('alla Panoramica');
    expect(withPrepositionA('i report di gara')).toBe('ai report di gara');
    expect(withPrepositionA('le sessioni team')).toBe('alle sessioni team');
    expect(withPrepositionA('gli stint')).toBe('agli stint');
    expect(withPrepositionA('lo Stint Planner')).toBe('allo Stint Planner');
  });

  it("gestisce l'elisione", () => {
    expect(withPrepositionA("l'Analisi di Passo")).toBe("all'Analisi di Passo");
  });

  it('senza articolo antepone solo "a"', () => {
    expect(withPrepositionA('questa sezione')).toBe('a questa sezione');
  });

  it('non scambia parole che iniziano come un articolo', () => {
    expect(withPrepositionA('il')).toBe('a il');
    expect(withPrepositionA('ilaria')).toBe('a ilaria');
    expect(withPrepositionA('lavoro')).toBe('a lavoro');
  });

  it('gestisce input vuoto o nullo', () => {
    expect(withPrepositionA('')).toBe('a');
    expect(withPrepositionA(null)).toBe('a');
  });
});
