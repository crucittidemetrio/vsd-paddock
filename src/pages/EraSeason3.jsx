import { usePageMeta } from '../hooks/usePageMeta';
import { SOCIAL_LINKS } from '../utils/constants';
import ChampionshipInterestSection from '../components/shared/ChampionshipInterestSection';
// Riuso deliberato del CSS module di ACI LMGT3 Challenge: le classi sono
// generiche (hero/section/specGrid/calendarGrid/cta/…), pensate per lo
// stesso pattern di "pagina campionato esterno" — evita di duplicare
// ~650 righe di CSS identico per una pagina puramente informativa come
// questa. Se in futuro ERA Season 3 avesse bisogno di layout propri
// (es. classifica agganciata al backend), a quel punto ha senso separare.
import styles from './AciLmgt3Challenge.module.css';

// ERA Season 3 è un campionato esterno (Endurance Racing Association),
// non organizzato da VSD: i piloti si iscrivono a titolo individuale.
// Fonti: modulo iscrizione ufficiale (Google Form) + locandina calendario
// condivisa da Silvio Tuveri in team il 24/08/2026. Nessun'altra pagina
// pubblica/regolamento ERA è stata trovata in rete al momento della
// stesura — se emergono un sito o un regolamento ufficiali, aggiornare
// REGOLAMENTO_URL e i riferimenti sotto.
const REGISTRATION_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSeLbtEnF8tBW0vuXky7WClP9nVkcm5pG4OdrullHnUCjkLMoQ/viewform';

// Chiave dominio backend per la manifestazione di interesse (tracking
// interno VSD — NON l'iscrizione ufficiale, che resta sempre il
// Google Form ERA sopra).
const INTEREST_KEY = 'era-season-3';

// Nessun sito/regolamento ERA pubblico trovato — resta vuoto finché non
// arriva un link ufficiale da citare.
const REGOLAMENTO_URL = '';

// Le classi ammesse, così come richieste nel modulo di iscrizione.
const CLASSES = [
  { icon: '🔴', label: 'LMGT3', sublabel: 'GT da endurance' },
  { icon: '🟠', label: 'Hypercar', sublabel: 'Prototipi di vertice' },
];

// Calendario Season 3 — dalla locandina ufficiale ERA (7 round).
// Le date sono weekend di gara, non i singoli orari sessione (non noti).
const CALENDAR = [
  { round: 'R1', circuit: 'Fuji Speedway', date: '22–23 Settembre 2026' },
  { round: 'R2', circuit: 'Circuit Paul Ricard', date: '6–7 Ottobre 2026' },
  { round: 'R3', circuit: 'Daytona International Speedway', date: '20–21 Ottobre 2026' },
  { round: 'R4', circuit: 'Autodromo Nazionale Monza', date: '3–4 Novembre 2026' },
  { round: 'R5', circuit: 'Bahrain International Circuit', date: '17–18 Novembre 2026' },
  { round: 'R6', circuit: 'Indianapolis Motor Speedway', date: '1–2 Dicembre 2026', note: 'Layout da confermare' },
  { round: 'R7', circuit: 'Circuit de la Sarthe — Le Mans', date: '15–16 Dicembre 2026', finale: true },
];

export default function EraSeason3() {
  usePageMeta({
    title: 'ERA Season 3 — Le Mans Ultimate | VSD',
    description: 'ERA Season 3 su Le Mans Ultimate: classi LMGT3 e Hypercar, 7 round da Fuji a Le Mans. Campionato esterno organizzato da ERA — Endurance Racing Association, aperto a chi vuole iscriversi a titolo individuale.',
  });

  return (
    <div className={styles.page}>

      {/* ════ HERO ════ */}
      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>CAMPIONATO ESTERNO</div>
        <h1 className={styles.heroTitle}>
          ERA
          <span className={styles.heroTitleAccent}> Season 3</span>
        </h1>
        <p className={styles.heroSub}>
          Le Mans Ultimate · Endurance Racing Association · LMGT3 &amp; Hypercar
        </p>
        <div className={styles.heroOpen}>
          <span className={styles.heroBadge}>🏁 7 round</span>
          <span className={styles.heroBadge}>🏎️ LMGT3 · Hypercar</span>
          <span className={styles.heroBadge}>📅 Set–Dic 2026</span>
        </div>
        <div className={styles.heroActions}>
          <a
            href={REGISTRATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            📋 Iscriviti al campionato
          </a>
          <a href="#interesse" className={`${styles.btn} ${styles.btnSecondary}`}>
            🙋 Ci provi anche tu?
          </a>
        </div>
      </section>

      {/* ════ IL CAMPIONATO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Il Campionato</div>
        <h2 className={styles.sectionTitle}>Una serie esterna, non un format VSD</h2>
        <div className={styles.specGrid}>
          <SpecRow label="Organizzato da" value="ERA — Endurance Racing Association" />
          <SpecRow label="Simulatore" value="Le Mans Ultimate" />
          <SpecRow label="Classi" value="LMGT3 e Hypercar" />
          <SpecRow label="Modalità" value="Iscrizione individuale, online da casa — non richiede la membership VSD" />
          <SpecRow
            label="Pre-qualifica"
            value="Evento pre-season “Hotstint Barcellona”, con prenotazione di uno slot (8, 9, 10 o 11 Settembre, fascia 20:00–22:00 o 22:00–24:00) direttamente nel modulo d'iscrizione"
          />
          <SpecRow label="Conferma iscrizione" value="Versamento di 2€ (PayPal, “Amici e Parenti”) indicato nel modulo — l'iscrizione è valida solo dopo il pagamento" />
        </div>
      </section>

      {/* ════ CLASSI ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Classi ammesse</div>
        <h2 className={styles.sectionTitle}>LMGT3 e Hypercar</h2>
        <div className={styles.classGrid}>
          {CLASSES.map(c => (
            <div key={c.label} className={styles.classCard}>
              <div className={styles.classHeader}>
                <span className={styles.classIcon}>{c.icon}</span>
                <div>
                  <div className={styles.classLabel}>{c.label}</div>
                  <div className={styles.classSublabel}>{c.sublabel}</div>
                </div>
              </div>
              <p className={styles.classNote}>
                Elenco vetture omologate ed eventuale BoP non ancora pubblicati da ERA — verranno indicati qui appena disponibili.
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ════ CALENDARIO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Calendario ERA Season 3</div>
        <h2 className={styles.sectionTitle}>7 round, da Fuji a Le Mans</h2>
        <div className={styles.calendarGrid}>
          {CALENDAR.map(r => (
            <div key={r.round} className={styles.calendarCard}>
              <div className={styles.calendarRound}>{r.round}{r.finale ? ' · Gran Finale' : ''}</div>
              <div className={styles.calendarCircuit}>{r.circuit}</div>
              <div className={styles.calendarMeta}>
                <span className={styles.calendarDate}>📅 {r.date}</span>
              </div>
              {r.note && (
                <p className={styles.classNote} style={{ marginTop: 8 }}>{r.note}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ════ MANIFESTAZIONE DI INTERESSE ════ */}
      <ChampionshipInterestSection
        championshipKey={INTEREST_KEY}
        anchorId="interesse"
        eyebrow="Ci provi anche tu?"
        title="Facci sapere che ci sei"
        introText="Un segnale interno per lo staff VSD, utile per seguire chi del team partecipa fin dall'iscrizione — non sostituisce il modulo ufficiale."
        fieldLabel="Classe"
        fieldOptions={CLASSES.map(c => c.label)}
        officialUrl={REGISTRATION_URL}
        officialLabel="Modulo di iscrizione ERA"
        disclaimerText="Questa NON è l'iscrizione ufficiale al campionato — quella si fa esclusivamente tramite il modulo ERA, incluso il versamento di conferma."
      />

      {/* ════ CTA ════ */}
      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>Vuoi correre in ERA Season 3?</h2>
        <p className={styles.ctaText}>
          L'iscrizione è individuale e si fa tramite il modulo ufficiale ERA — VSD non gestisce
          i posti in griglia. Per confrontarti con altri piloti del team che partecipano, i canali
          restano quelli di sempre.
        </p>
        <div className={styles.ctaActions}>
          <a
            href={REGISTRATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            📋 Modulo di iscrizione
          </a>
          <a href={SOCIAL_LINKS.DISCORD} target="_blank" rel="noopener noreferrer" className={styles.btn}>
            Discord VSD
          </a>
        </div>
      </section>

      <p className={styles.disclaimer}>
        ERA Season 3 è un campionato organizzato da ERA — Endurance Racing Association, un ente
        esterno a VSD. Chi si iscrive lo fa a titolo personale: VSD non gestisce iscrizioni,
        pagamenti né risultati di questa serie. Per regolamento, orari sessione e qualunque altro
        dettaglio operativo fa fede esclusivamente quanto comunicato da ERA nel modulo d'iscrizione
        {REGOLAMENTO_URL && (
          <>
            {' '}e nel{' '}
            <a href={REGOLAMENTO_URL} target="_blank" rel="noopener noreferrer" className={styles.disclaimerLink}>
              regolamento ufficiale
            </a>
          </>
        )}.
      </p>

    </div>
  );
}

function SpecRow({ label, value }) {
  return (
    <div className={styles.specRow}>
      <div className={styles.specLabel}>{label}</div>
      <div className={styles.specValue}>{value}</div>
    </div>
  );
}
