import { useState } from 'react';
import { useApplyCandidate } from '../../hooks/useCandidates';
import './CandidateApplyForm.css';

// Form di candidatura pubblico per /joinus (26/09/2026) — sostituisce
// il Google Form esterno (JOIN_FORM_URL). Scrive direttamente nella
// pipeline `candidates` via candidates.apply (nessuna sessione
// richiesta, stesso principio di IncidentReportSection/
// ChampionshipInterestSection): elimina il passaggio manuale "lo
// staff legge le risposte del Google Form e le ricopia a mano".
//
// I campi extra del vecchio form (numero pilota, ID Steam/iRacing,
// città, età, come ci hai conosciuto, motivazione, esperienza) non
// hanno una colonna dedicata in `candidates` — vengono impacchettati
// in `notes` come blocco leggibile, esattamente il campo che
// AdminCandidates.jsx già mostra e lo staff già legge per decidere.

const SIMULATORS = [
  { value: 'LMU', label: 'Le Mans Ultimate' },
  { value: 'IRACING', label: 'iRacing' },
  { value: 'AC EVO', label: 'Assetto Corsa Evo' },
];

const CATEGORIES = ['GT3', 'Hypercar', 'LMP2', 'LMP3', 'GTE', 'Cat. minori / Altro'];

const EMPTY_FORM = {
  display_name: '',
  contact: '',
  discord_username: '',
  simulator: '',
  category: '',
  car_num: '',
  heard_from: '',
  motivation: '',
  experience: '',
  steam_id: '',
  iracing_id: '',
  city: '',
  age: '',
  website: '', // honeypot — mai mostrato all'utente
};

function buildNotes(form) {
  const lines = [];
  if (form.car_num.trim()) lines.push(`Numero pilota preferito: ${form.car_num.trim()}`);
  if (form.heard_from.trim()) lines.push(`Come ci ha conosciuto: ${form.heard_from.trim()}`);
  if (form.motivation.trim()) lines.push(`Perché vuole entrare: ${form.motivation.trim()}`);
  if (form.experience.trim()) lines.push(`Esperienza nel sim racing: ${form.experience.trim()}`);
  if (form.steam_id.trim()) lines.push(`ID Steam: ${form.steam_id.trim()}`);
  if (form.iracing_id.trim()) lines.push(`ID iRacing: ${form.iracing_id.trim()}`);
  if (form.city.trim()) lines.push(`Città: ${form.city.trim()}`);
  if (form.age.trim()) lines.push(`Età: ${form.age.trim()}`);
  return lines.join('\n');
}

export default function CandidateApplyForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [feedback, setFeedback] = useState(null);
  const applyMutation = useApplyCandidate();

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);

    if (!form.display_name.trim() || !form.contact.trim() || !form.simulator || !form.category) {
      setFeedback({ ok: false, message: 'Compila almeno nome, email, simulatore e categoria.' });
      return;
    }

    try {
      await applyMutation.mutateAsync({
        display_name: form.display_name.trim(),
        contact: form.contact.trim(),
        discord_username: form.discord_username.trim(),
        simulator: form.simulator,
        category: form.category,
        notes: buildNotes(form),
        website: form.website, // honeypot, resta vuoto per un utente reale
      });
      setFeedback({ ok: true, message: 'Candidatura inviata! Lo staff ti risponderà entro 48-72 ore, meglio se sei già sul Discord.' });
      setForm(EMPTY_FORM);
    } catch (err) {
      setFeedback({ ok: false, message: err.message || 'Errore durante l’invio. Riprova o scrivici su Discord.' });
    }
  }

  return (
    <form className="candapply-form" onSubmit={handleSubmit}>
      {/* Honeypot anti-spam: invisibile e ignorato da un utente reale,
          un bot che compila tutti i campi lo riempie e la richiesta
          viene silenziosamente scartata lato server. */}
      <input
        type="text"
        name="website"
        value={form.website}
        onChange={e => update('website', e.target.value)}
        className="candapply-honeypot"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      <div className="candapply-grid">
        <div className="candapply-group">
          <label className="candapply-label" htmlFor="candapply-name">Nome e cognome *</label>
          <input
            id="candapply-name"
            type="text"
            className="candapply-input"
            value={form.display_name}
            onChange={e => update('display_name', e.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div className="candapply-group">
          <label className="candapply-label" htmlFor="candapply-email">Email *</label>
          <input
            id="candapply-email"
            type="email"
            className="candapply-input"
            value={form.contact}
            onChange={e => update('contact', e.target.value)}
            maxLength={160}
            required
          />
        </div>

        <div className="candapply-group">
          <label className="candapply-label" htmlFor="candapply-discord">Discord (se lo conosci)</label>
          <input
            id="candapply-discord"
            type="text"
            className="candapply-input"
            value={form.discord_username}
            onChange={e => update('discord_username', e.target.value)}
            placeholder="username"
            maxLength={60}
          />
        </div>

        <div className="candapply-group">
          <label className="candapply-label" htmlFor="candapply-carnum">Numero pilota (se disponibile)</label>
          <input
            id="candapply-carnum"
            type="text"
            className="candapply-input"
            value={form.car_num}
            onChange={e => update('car_num', e.target.value)}
            maxLength={10}
          />
        </div>

        <div className="candapply-group">
          <label className="candapply-label" htmlFor="candapply-sim">Simulatore *</label>
          <select
            id="candapply-sim"
            className="candapply-select"
            value={form.simulator}
            onChange={e => update('simulator', e.target.value)}
            required
          >
            <option value="">Seleziona…</option>
            {SIMULATORS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="candapply-group">
          <label className="candapply-label" htmlFor="candapply-category">Categoria preferita *</label>
          <select
            id="candapply-category"
            className="candapply-select"
            value={form.category}
            onChange={e => update('category', e.target.value)}
            required
          >
            <option value="">Seleziona…</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="candapply-group">
          <label className="candapply-label" htmlFor="candapply-steam">ID Steam (metti 0 se non lo possiedi)</label>
          <input
            id="candapply-steam"
            type="text"
            className="candapply-input"
            value={form.steam_id}
            onChange={e => update('steam_id', e.target.value)}
            maxLength={40}
          />
        </div>

        <div className="candapply-group">
          <label className="candapply-label" htmlFor="candapply-iracing">ID iRacing (metti 0 se non lo possiedi)</label>
          <input
            id="candapply-iracing"
            type="text"
            className="candapply-input"
            value={form.iracing_id}
            onChange={e => update('iracing_id', e.target.value)}
            maxLength={40}
          />
        </div>

        <div className="candapply-group">
          <label className="candapply-label" htmlFor="candapply-city">La tua città</label>
          <input
            id="candapply-city"
            type="text"
            className="candapply-input"
            value={form.city}
            onChange={e => update('city', e.target.value)}
            maxLength={60}
          />
        </div>

        <div className="candapply-group">
          <label className="candapply-label" htmlFor="candapply-age">La tua età</label>
          <input
            id="candapply-age"
            type="text"
            className="candapply-input"
            value={form.age}
            onChange={e => update('age', e.target.value)}
            maxLength={5}
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="candapply-group">
        <label className="candapply-label" htmlFor="candapply-heard">Come ci hai conosciuto?</label>
        <input
          id="candapply-heard"
          type="text"
          className="candapply-input"
          value={form.heard_from}
          onChange={e => update('heard_from', e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="candapply-group">
        <label className="candapply-label" htmlFor="candapply-motivation">Perché vuoi entrare nel Team VSD?</label>
        <textarea
          id="candapply-motivation"
          className="candapply-textarea"
          value={form.motivation}
          onChange={e => update('motivation', e.target.value)}
          maxLength={800}
          rows={3}
        />
      </div>

      <div className="candapply-group">
        <label className="candapply-label" htmlFor="candapply-experience">Esperienza nel sim racing</label>
        <textarea
          id="candapply-experience"
          className="candapply-textarea"
          value={form.experience}
          onChange={e => update('experience', e.target.value)}
          maxLength={800}
          rows={3}
        />
      </div>

      <button type="submit" className="candapply-submit" disabled={applyMutation.isPending}>
        {applyMutation.isPending ? 'Invio…' : 'Invia candidatura'}
      </button>

      {feedback && (
        <div className={feedback.ok ? 'candapply-success' : 'candapply-error'}>
          {feedback.message}
        </div>
      )}
    </form>
  );
}
