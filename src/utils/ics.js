// ═══════════════════════════════════════════════════════════
// Esportazione calendario (.ics) — lato client, nessun backend.
// ═══════════════════════════════════════════════════════════
// Genera un file .ics scaricabile (compatibile Apple/Outlook/qualsiasi
// client che importa iCalendar) e un link diretto "Aggiungi a Google
// Calendar" per una singola gara. Il calendario INTERNO della webapp
// (Race Hub) resta invariato: questo è solo un modo per portare la data
// nel calendario personale del pilota.

function pad(n) {
  return String(n).padStart(2, '0');
}

function toIcsUtc(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

function escapeIcsText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function raceWindow(race, durationMinutes) {
  const start = new Date(race.date);
  if (isNaN(start.getTime())) return null;
  const duration = durationMinutes || race.duration_minutes || 60;
  const end = new Date(start.getTime() + duration * 60000);
  return { start, end };
}

/**
 * Costruisce il contenuto testuale di un file .ics per una gara.
 * @param {Object} race - { race_id, race_name, date, duration_minutes, sim, championship, format, track_id }
 * @param {Object} opts - { trackName?, durationMinutes? }
 * @returns {string|null} contenuto .ics, o null se la gara non ha una data valida
 */
export function buildRaceIcs(race, opts = {}) {
  const window = raceWindow(race, opts.durationMinutes);
  if (!window) return null;

  const summary = escapeIcsText(race.race_name || 'Gara VSD');
  const location = escapeIcsText(opts.trackName || race.track_id || '');
  const description = escapeIcsText(
    [race.sim, race.championship, race.format].filter(Boolean).join(' · ')
  );
  const uid = `vsd-race-${race.race_id}@vsdpaddock`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VSD Paddock//Race Calendar//IT',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(window.start)}`,
    `DTEND:${toIcsUtc(window.end)}`,
    `SUMMARY:${summary}`,
    location ? `LOCATION:${location}` : null,
    description ? `DESCRIPTION:${description}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
}

/**
 * Avvia il download del file .ics nel browser.
 */
export function downloadIcs(icsContent, filename) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * URL diretto "Aggiungi a Google Calendar" (nessun download, apre in
 * una nuova scheda con l'evento precompilato).
 */
export function googleCalendarUrl(race, opts = {}) {
  const window = raceWindow(race, opts.durationMinutes);
  if (!window) return null;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: race.race_name || 'Gara VSD',
    dates: `${toIcsUtc(window.start)}/${toIcsUtc(window.end)}`,
    details: [race.sim, race.championship, race.format].filter(Boolean).join(' · '),
    location: opts.trackName || race.track_id || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
