import { useState, useRef, useEffect } from 'react';
import { buildRaceIcs, downloadIcs, googleCalendarUrl } from '../../utils/ics';
import './AddToCalendarButton.css';

/**
 * AddToCalendarButton — esporta la gara nel calendario personale del
 * pilota (Google Calendar via link diretto, o file .ics per Apple/
 * Outlook/qualsiasi altro client). Puramente client-side, non tocca il
 * calendario interno della webapp.
 *
 * @param {Object} race - oggetto gara (serve almeno race_id, date, race_name)
 * @param {string} trackName - nome tracciato già risolto (per LOCATION)
 */
export default function AddToCalendarButton({ race, trackName }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!race?.date) return null;

  function handleDownload() {
    const ics = buildRaceIcs(race, { trackName });
    if (!ics) return;
    const safeName = (race.race_name || 'gara-vsd').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadIcs(ics, `${safeName}.ics`);
    setOpen(false);
  }

  const gcalUrl = googleCalendarUrl(race, { trackName });

  return (
    <div className="atc-wrap" ref={wrapRef}>
      <button type="button" className="atc-btn" onClick={() => setOpen(v => !v)}>
        📅 Aggiungi al calendario
      </button>
      {open && (
        <div className="atc-menu">
          {gcalUrl && (
            <a
              className="atc-menu-item"
              href={gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              Google Calendar
            </a>
          )}
          <button type="button" className="atc-menu-item" onClick={handleDownload}>
            Apple / Outlook (.ics)
          </button>
        </div>
      )}
    </div>
  );
}
