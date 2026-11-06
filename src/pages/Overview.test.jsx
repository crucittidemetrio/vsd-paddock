import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Hook simulati: il test verifica che la pagina si monti e che le regole
// equipaggio arrivino a schermo, non la rete. Le due forme dei dati
// (array diretto / oggetto con chiave) sono entrambe supportate dal layer API.
const mocks = vi.hoisted(() => ({
  auth: { isAdmin: false },
  upcoming: { data: null, isLoading: false },
  drivers: { data: null, isLoading: false },
  rsvp: { data: [] },
  crews: { data: [] },
  stints: { data: null },
  treasury: { data: null, isLoading: false },
  results: { data: null, isLoading: false },
}));

vi.mock('../hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../hooks/useRaces', () => ({ useUpcomingRaces: () => mocks.upcoming }));
vi.mock('../hooks/useRoster', () => ({ useDrivers: () => mocks.drivers }));
vi.mock('../hooks/useRaceRSVP', () => ({ useRaceRSVP: () => mocks.rsvp }));
vi.mock('../hooks/useRaceCrews', () => ({ useRaceCrews: () => mocks.crews }));
vi.mock('../hooks/useEnduranceStints', () => ({ useStints: () => mocks.stints }));
vi.mock('../hooks/useTreasury', () => ({ useTreasury: () => mocks.treasury }));
vi.mock('../hooks/useRaceResults', () => ({ useRecentTeamRaceResults: () => mocks.results }));

import Overview from './Overview';

const inDays = d => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();
const driver = (id, name, extra = {}) => ({ driver_id: id, display_name: name, status: 'active', ...extra });

function renderPage() {
  return render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.auth = { isAdmin: false };
  mocks.upcoming = { data: null, isLoading: false };
  mocks.drivers = { data: null, isLoading: false };
  mocks.rsvp = { data: [] };
  mocks.crews = { data: [] };
  mocks.stints = { data: null };
  mocks.treasury = { data: null, isLoading: false };
  mocks.results = { data: null, isLoading: false };
});

describe('Overview', () => {
  it('senza gare in programma mostra lo stato vuoto', () => {
    mocks.upcoming = { data: { races: [] }, isLoading: false };
    mocks.drivers = { data: { drivers: [driver('a', 'Anna R.')] }, isLoading: false };
    renderPage();
    expect(screen.getAllByText('Nessuna gara in programma.').length).toBeGreaterThan(0);
  });

  it('endurance: equipaggio coperto, voce stint presente, cassa nascosta ai non admin', () => {
    mocks.upcoming = {
      data: { races: [{ race_id: 'r1', race_name: 'Spa 6h', sim: 'LMU', date: inDays(3), duration_minutes: 360 }] },
      isLoading: false,
    };
    mocks.drivers = {
      data: { drivers: [driver('a', 'Anna R.'), driver('b', 'Bruno C.'), driver('c', 'Carla M.'), driver('x', 'Ex P.', { status: 'inactive' })] },
      isLoading: false,
    };
    mocks.rsvp = {
      data: [
        { driver_id: 'a', status: 'confirmed' },
        { driver_id: 'b', status: 'confirmed' },
        { driver_id: 'c', status: 'tentative' },
      ],
    };
    renderPage();
    expect(screen.getAllByText('Spa 6h').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Equipaggio coperto').length).toBeGreaterThan(0);
    expect(screen.getByText('Stint pianificati')).toBeInTheDocument();
    expect(screen.getByText(/regola endurance: 2–6 piloti/)).toBeInTheDocument();
    expect(screen.queryByText('Cassa')).not.toBeInTheDocument();
  });

  it('sprint con liste come array diretto: niente voce stint, equipaggio scoperto senza RSVP', () => {
    mocks.upcoming = {
      data: [{ race_id: 'r2', race_name: 'Sprint Monza', sim: 'LMU', date: inDays(1), duration_minutes: 40 }],
      isLoading: false,
    };
    mocks.drivers = { data: [driver('a', 'Anna R.'), driver('b', 'Bruno C.')], isLoading: false };
    renderPage();
    expect(screen.getAllByText('Equipaggio scoperto').length).toBeGreaterThan(0);
    expect(screen.queryByText('Stint pianificati')).not.toBeInTheDocument();
    expect(screen.getByText(/regola sprint: 1–2 piloti/)).toBeInTheDocument();
    expect(screen.getByText(/Senza risposta: Anna R\., Bruno C\./)).toBeInTheDocument();
  });

  it('admin vede la cassa con saldo e autonomia', () => {
    mocks.auth = { isAdmin: true };
    mocks.upcoming = { data: { races: [] }, isLoading: false };
    mocks.drivers = { data: { drivers: [driver('a', 'Anna R.')] }, isLoading: false };
    const recent = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    mocks.treasury = {
      data: {
        entries: [
          { type: 'entrata', amount: 300, date: '2026-01-10' },
          { type: 'uscita', amount: 60, date: recent },
        ],
      },
      isLoading: false,
    };
    renderPage();
    expect(screen.getByText('Cassa')).toBeInTheDocument();
    expect(screen.getByText(/mesi di autonomia/)).toBeInTheDocument();
  });
});
