import { useState } from 'react';
import '../race/RaceRSVP.css';

const STATUS_META = {
  confirmed: { label: 'Ci sarò', icon: '✓', className: 'rsvp-confirmed' },
  tentative: { label: 'Forse',   icon: '?', className: 'rsvp-tentative' },
  declined:  { label: 'Assente', icon: '✕', className: 'rsvp-declined' },
};
const STATUS_ORDER = ['confirmed', 'tentative', 'declined'];

/**
 * EntityRSVP — UI di conferma presenza generica, estratta da RaceRSVP.jsx
 * (introdotta per le gare) così che le sessioni team (ADR-Team-Scheduler
 * Fase 2) riusino la stessa UX/CSS invece di duplicarle. Componente
 * "dumb": chi la monta fornisce i dati già interrogati (hook specifico
 * per dominio: useRaceRSVP per le gare, useSessionRsvp per le sessioni)
 * e una callback per scrivere. Il CSS resta in components/race/RaceRSVP.css
 * — i nomi classe erano già generici (rsvp-*, non race-rsvp-*), quindi
 * non serviva duplicarlo né spostarlo.
 *
 * @param {string}   title           - es. "Conferma presenza"
 * @param {Array}    rsvps           - righe RSVP già caricate per l'entità
 * @param {boolean}  isLoading
 * @param {string}   currentDriverId - null se non loggato
 * @param {Array}    drivers         - roster per join id→nome
 * @param {Function} getDriverName   - (driverId, drivers) => string
 * @param {Function} onSetStatus     - (status, note) => void
 * @param {boolean}  isPending       - true mentre la mutation è in corso
 * @param {Error|null} error
 */
export default function EntityRSVP({
  title = 'Conferma presenza',
  rsvps = [],
  isLoading = false,
  currentDriverId,
  drivers,
  getDriverName,
  onSetStatus,
  isPending = false,
  error = null,
}) {
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);

  const mine = rsvps.find(r => r.driver_id === currentDriverId) || null;

  const groups = { confirmed: [], tentative: [], declined: [] };
  rsvps.forEach(r => {
    if (groups[r.status]) groups[r.status].push(r);
  });

  function handleSet(status) {
    onSetStatus(status, note || mine?.note || '');
  }

  return (
    <section className="rsvp-section">
      <div className="rsvp-header">
        <h2 className="rsvp-title">{title}</h2>
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
                  disabled={isPending}
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

          {error && (
            <div className="rsvp-error">Errore: {error.message}</div>
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
