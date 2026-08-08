import { useMemo, useState } from 'react';
import { useConsentStatus, useAcceptConsent } from '../hooks/useConsent';
import { useAuth } from '../hooks/useAuth';
import { useNow } from '../hooks/useNow';
import './Page.css';
import './Privacy.css';
import './ConsentForm.css';

// Tenuta allineata a CONSENT_VERSION in apps-script/Consent.js — se il
// testo sotto cambia in modo sostanziale, aggiorna ENTRAMBE le stringhe.
const CONSENT_VERSION = 'v1-2026-08-08';
const CONTACT = 'https://discord.gg/gs5rR3DQay';

// nowMs passato dal chiamante (via useNow) invece di new Date() qui
// dentro: stessa convenzione già usata in FuelPanel/AdminRaceStints per
// rispettare react-hooks/purity (niente sorgenti non deterministiche
// dentro un useMemo).
function computeIsMinor(birthDateStr, nowMs) {
  if (!birthDateStr) return null;
  const d = new Date(birthDateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date(nowMs);
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age < 18;
}

export default function ConsentForm({ embedded = false }) {
  const { driver } = useAuth();
  const statusQuery = useConsentStatus();
  const acceptMutation = useAcceptConsent();
  const now = useNow(3_600_000); // basta un tick ogni ora, serve solo per calcolare l'età

  const [birthDate, setBirthDate] = useState('');
  const [siteConsent, setSiteConsent] = useState(false);
  const [socialConsent, setSocialConsent] = useState(false);
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentDeclared, setParentDeclared] = useState(false);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const existing = statusQuery.data?.record;

  // Precompila dai dati già salvati, se il pilota torna a modificare le
  // proprie scelte. Pattern "adjust state during render" (niente
  // useEffect): confrontiamo il consent_id già sincronizzato con quello
  // arrivato dalla query e, se cambia, aggiorniamo lo stato nello stesso
  // giro di render — React se ne accorge e ri-renderizza subito, senza
  // il giro extra (ed il warning set-state-in-effect) di un effect.
  const [syncedConsentId, setSyncedConsentId] = useState(undefined);
  if (existing && existing.consent_id !== syncedConsentId) {
    setSyncedConsentId(existing.consent_id);
    setBirthDate(existing.birth_date || '');
    setSiteConsent(!!existing.site_consent);
    setSocialConsent(!!existing.social_consent);
    setParentName(existing.parent_name || '');
    setParentEmail(existing.parent_email || '');
    setParentDeclared(!!existing.parent_declared);
  }

  const isMinor = useMemo(() => computeIsMinor(birthDate, now), [birthDate, now]);

  function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!birthDate) { setError('Inserisci la data di nascita'); return; }
    if (isMinor && (!parentName.trim() || !parentEmail.trim() || !parentDeclared)) {
      setError('Per i minorenni sono obbligatori nome, email del genitore/tutore e la sua dichiarazione');
      return;
    }

    acceptMutation.mutate(
      {
        birth_date: birthDate,
        site_consent: siteConsent,
        social_consent: socialConsent,
        parent_name: isMinor ? parentName.trim() : '',
        parent_email: isMinor ? parentEmail.trim() : '',
        parent_declared: isMinor ? parentDeclared : false,
      },
      {
        onSuccess: () => setJustSaved(true),
        onError: (err) => setError(err.message || 'Errore durante il salvataggio'),
      }
    );
  }

  const alreadyCurrent = statusQuery.data?.has_current;

  return (
    <div className={`page privacy-page ${embedded ? 'consent-embedded' : ''}`}>
      <div className="page-header">
        <div className="page-eyebrow">CONSENSO DATI</div>
        <h1 className="page-title">Pubblicazione dei tuoi dati</h1>
        <p className="page-sub">
          Autorizzazione alla pubblicazione dei tuoi dati personali su sito pubblico e canali
          social del team VSD.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
      <section className="privacy-section">
        <h2>Titolare del trattamento</h2>
        <p>
          Il trattamento è gestito dallo staff del team VSD (Virtual Sim-Driver). Per qualsiasi
          domanda o richiesta relativa ai tuoi dati, contatta lo staff su{' '}
          <a href={CONTACT} target="_blank" rel="noopener noreferrer">Discord</a>.
        </p>
      </section>

      <section className="privacy-section">
        <h2>1 · Sito pubblico</h2>
        <p>
          Il tuo nickname, numero gara, risultati, tempi sul giro e classifiche possono essere
          mostrati pubblicamente su vsd-paddock.vercel.app (roster, calendario, risultati gara,
          muro dei record), visibili a chiunque anche senza login.
        </p>
        <label className="consent-checkbox-row">
          <input
            type="checkbox"
            checked={siteConsent}
            onChange={(e) => setSiteConsent(e.target.checked)}
          />
          <span>Autorizzo la pubblicazione dei miei dati sportivi sul sito pubblico</span>
        </label>
      </section>

      <section className="privacy-section">
        <h2>2 · Social media</h2>
        <p>
          Foto, video, highlight di gara e altri contenuti che ti ritraggono possono essere
          pubblicati sui canali social pubblici del team (Instagram, Facebook) e su Discord, per
          finalità promozionali del team.
        </p>
        <label className="consent-checkbox-row">
          <input
            type="checkbox"
            checked={socialConsent}
            onChange={(e) => setSocialConsent(e.target.checked)}
          />
          <span>Autorizzo l'uso di foto/video che mi ritraggono sui canali social del team</span>
        </label>
      </section>

      <section className="privacy-section">
        <h2>Dati di contatto interni</h2>
        <p>
          Email e Discord ID sono trattati internamente dallo staff per organizzare gare,
          comunicazioni e gestione del roster — sono necessari per partecipare all'attività del
          team, quindi non richiedono un consenso separato (base giuridica: esecuzione
          dell'attività associativa). Restano visibili solo a staff/admin, mai pubblicati.
          Dettagli completi nella pagina <a href="/privacy">Privacy &amp; Trattamento Dati</a>.
        </p>
      </section>

      <section className="privacy-section">
        <h2>La tua data di nascita</h2>
        <p>
          Serve solo per capire se è richiesto il consenso di un genitore/tutore. Non viene
          mostrata pubblicamente da nessuna parte.
        </p>
        <div className="consent-field">
          <label htmlFor="consent-birthdate">Data di nascita</label>
          <input
            id="consent-birthdate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            max={new Date(now).toISOString().slice(0, 10)}
          />
        </div>
      </section>

      {isMinor === true && (
        <section className="privacy-section consent-minor-block">
          <h2>⚠ Consenso del genitore/tutore</h2>
          <p>
            Risulti minorenne: per pubblicare i tuoi dati serve la dichiarazione di un
            genitore/tutore. Questo modulo registra nome, email e una dichiarazione elettronica —
            non è una firma verificata. Se il team ha bisogno di un consenso genitoriale
            realmente verificato, va raccolto fuori da questo modulo (es. modulo cartaceo firmato).
          </p>
          <div className="consent-field">
            <label htmlFor="consent-parent-name">Nome e cognome del genitore/tutore</label>
            <input
              id="consent-parent-name"
              type="text"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Nome Cognome"
            />
          </div>
          <div className="consent-field">
            <label htmlFor="consent-parent-email">Email del genitore/tutore</label>
            <input
              id="consent-parent-email"
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder="email@esempio.it"
            />
          </div>
          <label className="consent-checkbox-row">
            <input
              type="checkbox"
              checked={parentDeclared}
              onChange={(e) => setParentDeclared(e.target.checked)}
            />
            <span>
              Il sottoscritto, in qualità di genitore/tutore del pilota minorenne, dichiara di
              prestare il consenso alle voci selezionate sopra
            </span>
          </label>
        </section>
      )}

      <section className="privacy-section">
        <h2>I tuoi diritti</h2>
        <p>
          Puoi revocare questo consenso in qualsiasi momento tornando su questa pagina e
          modificando le tue scelte, oppure chiedendo allo staff la rimozione dei contenuti già
          pubblicati. La revoca non rende illecito quanto già pubblicato prima della revoca
          stessa. Hai inoltre diritto di accesso, rettifica e cancellazione dei tuoi dati —
          dettagli nella pagina <a href="/privacy">Privacy</a>.
        </p>
      </section>

      {error && <div className="consent-error">❌ {error}</div>}
      {justSaved && !error && (
        <div className="consent-success">✓ Scelte salvate. Puoi tornare qui in qualsiasi momento per modificarle.</div>
      )}
      {alreadyCurrent && !justSaved && (
        <div className="consent-success">
          ✓ Hai già registrato le tue scelte per questa versione del documento ({CONSENT_VERSION}).
          Puoi modificarle e salvare di nuovo qui sotto.
        </div>
      )}

      <div className="consent-actions">
        <button
          type="submit"
          className="consent-btn-primary"
          disabled={acceptMutation.isPending}
        >
          {acceptMutation.isPending ? 'Salvataggio…' : 'Salva le mie scelte'}
        </button>
      </div>
      </form>

      <p className="privacy-updated">
        Pilota: {driver?.display_name || driver?.driver_id || '—'} · Documento versione {CONSENT_VERSION}
      </p>
    </div>
  );
}
