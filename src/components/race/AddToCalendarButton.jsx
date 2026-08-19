import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { buildRaceIcs, downloadIcs, googleCalendarUrl } from '../../utils/ics';
import './AddToCalendarButton.css';

/**
 * AddToCalendarButton — esporta la gara nel calendario personale del
 * pilota (Google Calendar via link diretto, o file .ics per Apple/
 * Outlook/qualsiasi altro client). Puramente client-side, non tocca il
 * calendario interno della webapp.
 *
 * Il menu a tendina è renderizzato in un portal su document.body: il
 * bottone vive spesso dentro contenitori con overflow:hidden (es.
 * l'header "scenic" di RaceDetail, che ritaglia lo sfondo decorativo) —
 * un <div> position:absolute normale ci finirebbe tagliato o invisibile.
 * Il portal aggira il problema posizionandosi in coordinate di viewport,
 * indipendenti dagli antenati.
 *
 * @param {Object} race - oggetto gara (serve almeno race_id, date, race_name)
 * @param {string} trackName - nome tracciato già risolto (per LOCATION)
 */
export default function AddToCalendarButton({ race, trackName }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  const updateMenuPos = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 6, left: r.left, minWidth: Math.max(r.width, 200) });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPos();

    function onClickOutside(e) {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.atc-menu')) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', updateMenuPos, true);
    window.addEventListener('resize', updateMenuPos);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', updateMenuPos, true);
      window.removeEventListener('resize', updateMenuPos);
    };
  }, [open, updateMenuPos]);

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
      <button type="button" className="atc-btn" ref={btnRef} onClick={() => setOpen(v => !v)}>
        📅 Aggiungi al calendario
      </button>
      {open && menuPos && createPortal(
        <div
          className="atc-menu atc-menu-portal"
          style={{ top: menuPos.top, left: menuPos.left, minWidth: menuPos.minWidth }}
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
