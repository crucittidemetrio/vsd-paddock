/**
 * Smoke test — Vitest framework operational check.
 *
 * Verifica:
 *  - Vitest runner gira
 *  - Ambiente jsdom configurato (document esiste)
 *  - jest-dom matchers caricati (toBeInTheDocument)
 *
 * Se tutti questi passano, il setup di base è solido e Gemini
 * (o noi stessi) può scrivere test reali sui moduli del progetto.
 */
import { describe, it, expect } from 'vitest';

describe('Vitest framework smoke', () => {
  it('arithmetic baseline works', () => {
    expect(1 + 1).toBe(2);
  });

  it('jsdom environment is loaded', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement).toBeDefined();
    expect(typeof window).toBe('object');
  });

  it('jest-dom custom matchers are available', () => {
    const div = document.createElement('div');
    div.textContent = 'VSD Paddock';
    document.body.appendChild(div);

    expect(div).toBeInTheDocument();
    expect(div).toHaveTextContent('VSD Paddock');

    document.body.removeChild(div);
  });

  it('async/await is supported in tests', async () => {
    const promise = Promise.resolve(42);
    const value = await promise;
    expect(value).toBe(42);
  });
});
