import { useState } from 'react';
import { useRaceRSVP, useSetRSVP } from '../../hooks/useRaceRSVP';
import './RaceRSVP.css';

const STATUS_META = {
  confirmed: { label: 'Ci sarò', icon: '✓', className: 'rsvp-confirmed' },
  tentative: { label: 'Forse',   icon: '?', className: 'rsvp-tentative' },
  declined:  { label: 'Assente', icon: '✕', className: 'rsvp-declined' },
};
const STATUS_ORDER = ['confirmed', 'tentative', 'declined'];

/**
 * RaceRSVP — conferma presenza per una gara in programma. Ogni pilota
 * loggato imposta la PROPRIA risposta (confermato/forse/assente) e vede
 * il quadro aggregato di chi ha già risposto — utile per lo Stint
 * Planner e per capire chi manca senza doverlo scoprire su Discord
 * all'ultimo momento.
 *
 * @param {string}   raceId
 * @param {string}   currentDriverId - null se non loggato
 * @param {Array}    drivers         - roster per join id→nome
 * @param {Function} getDriverName   - (driverId, drivers) => string
 */
export default function RaceRSVP({ raceId, currentDriverId, drivers, getDriverName }) {
  const { data: rsvps = [], isLoading } = useRaceRSVP(raceId);
  const setRsvp = useSetRSVP();
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);

  const mine = rsvps.find(r => r.driver_id === currentDriverId) || null;

  const groups = { confirmed: [], tentative: [], declined: [] };
  rsvps.forEach(r => {
    if (groups[r.status]) groups[r.status].push(r);
  });

  function handleSet(status) {
    setRsvp.mutate({ race_id: raceId, status, note: note || mine?.note || '' });
  }

  return (
    <section className="rsvp-section">
      <div className="rsvp-header">
        <h2 className="rsvp-title">Conferma presenza</h2>
        <span className="rsvp-count">
          {isLoading ? '…' : `${rsvps.length} risposte`}
        </span>
      </div>

      {currentDriverId && (
        <div className="rsvp-self">
          <div className="rsvp-self-buttons">
            {STATUS_ORDER.map(status => {
              const meta = STATUS_META[status];
              const active = mine?.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  className={`rsvp-btn ${meta.className} ${active ? 'rsvp-btn-active' : ''}`}
                  onClick={() => handleSet(status)}
                  disabled={setRsvp.isPending}
                >
                  <span className="rsvp-btn-icon">{meta.icon}</span> {meta.label}
                </button>
              );
            })}
            <button
              type="button"
              className="rsvp-note-toggle"
              onClick={() => setNoteOpen(v => !v)}
            >
              {noteOpen ? 'Chiudi nota' : '+ nota'}
            </button>
          </div>

          {noteOpen && (
            <textarea
              className="rsvp-note-input"
              placeholder="Es. arrivo con 10 minuti di ritardo…"
              defaultValue={mine?.note || ''}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          )}

          {setRsvp.isError && (
            <div className="rsvp-error">Errore: {setRsvp.error?.message}</div>
          )}
        </div>
      )}

      <div className="rsvp-groups">
        {STATUS_ORDER.map(status => {
          const meta = STATUS_META[status];
          const list = groups[status];
          if (list.length === 0) return null;
          return (
            <div key={status} className={`rsvp-group ${meta.className}`}>
              <div className="rsvp-group-label">
                {meta.icon} {meta.label} <span className="rsvp-group-count">({list.length})</span>
              </div>
              <ul className="rsvp-group-list">
                {list.map(r => (
                  <li key={r.rsvp_id} className="rsvp-group-item">
                    {getDriverName(r.driver_id, drivers)}
                    {r.note && <span className="rsvp-item-note"> — {r.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!isLoading && rsvps.length === 0 && (
          <div className="rsvp-empty">Nessuna risposta ancora.</div>
        )}
      </div>
    </section>
  );
}
