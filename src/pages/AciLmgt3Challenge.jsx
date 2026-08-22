import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useChampionshipStandings } from '../hooks/useChampionshipStandings';
import { useDrivers } from '../hooks/useRoster';
import { usePageMeta } from '../hooks/usePageMeta';
import { useSocialPosts } from '../hooks/useSocialManager';
import { STORY_PILLAR_IDS, storyPillarLabel } from '../utils/storyPillars';
import { SOCIAL_LINKS } from '../utils/constants';
import Avatar from '../components/shared/Avatar';
import { useConsentedDriverPhoto } from '../hooks/useConsent';
import styles from './AciLmgt3Challenge.module.css';

// Championship row creata da apps-script/migrations.js →
// migrate_add_aciLmgt3Challenge2026(). VSD non organizza questa serie:
// è indetta da ACI Sport (RDS LMGT3 Challenge 2026, pubbl. 12/07/2026),
// eseguita tramite un organizzatore esterno abilitato ACI ESport.
const ACI_CHAMPIONSHIP_ID = 'chmp-lmu-aci-lmgt3-challenge-2026';

// Regolamento ufficiale pubblicato da ACI Sport — fonte pubblica,
// nessun riferimento al portale organizzatore esterno finché non
// arriva l'autorizzazione a citarlo (in attesa di risposta).
const REGOLAMENTO_URL =
  'https://www.acisport.it/public_federazione/2026/pdf/Annuario/regolamento_aci_esport_lmgt3_challenge_2026_-_le_mans_ultimate.pdf';

const REGISTRATION_DEADLINE = '15 Settembre 2026';

const PREQUALIFICHE_DATES = '17 e 20 Settembre 2026';

// Piloti VSD sull'entry list pubblica di Apex (piloti-team-lmgt3-2026.html,
// embed Canva), verificata il 22/08/2026: tutti ancora con stato
// "IN VERIFICA", nessuno "ACCETTATA". Il campo è capped a 35 su un'entry
// list di 54+ nomi, quindi decidono le prequalifiche del 17-20 settembre —
// questi piloti ci provano, non sono ancora confermati. Il numero è quello
// assegnato da Apex per questo campionato specifico (non il race_number
// VSD). Da aggiornare a mano dopo le prequalifiche: chi passa va spostato
// nella sezione "Piloti VSD in gara" come confermato, chi non passa va
// tolto da qui.
const PREQUALIFICHE_ENTRIES = [
  { name: 'Silvio Tuveri', carNumber: 233 },
  { name: 'Francesco Mastrangelo', carNumber: 223 },
  { name: 'Simone Pelloni', carNumber: 333 },
  { name: 'Simone Raparelli', carNumber: 83 },
  { name: 'Simone Mazzola', carNumber: 61 },
  { name: 'Davide Casesi', carNumber: 250 },
];

// Organizzatore esterno abilitato ACI ESport che gestisce operativamente
// la serie (iscrizioni, server, JSON risultati). Autorizzazione a citarlo
// e linkarlo confermata da Antonio Guarnaccia il 21/08/2026.
const APEX_URL = 'https://www.apexitaliasimracing.net/';

// Loghi partner (hero) — vuoti di proposito. L'autorizzazione ricevuta
// finora copre citare/linkare Apex a testo, non necessariamente mostrarne
// il logo: l'uso di un marchio ha in genere regole a parte (spazi, colori,
// non modificabile) anche quando il link è già ok. Per ACI Sport il
// discorso è ancora più delicato: è la federazione che ha indetto il
// campionato, non la controparte che ci ha autorizzato — usare il loro
// logo senza un ok esplicito da loro rischia di sembrare un patrocinio
// che non abbiamo. Valorizzare solo dopo conferma esplicita (separata da
// quella già ottenuta per la citazione testuale); il resto della UI è
// già pronto ad attivarsi da solo.
const APEX_LOGO_URL = '';
const ACI_LOGO_URL = '';

// Canale YouTube delle dirette gara — confermato da Antonio Guarnaccia
// (Apex Italia Simracing, organizzatore esterno abilitato ACI ESport) il
// 21/08/2026: dirette su ACI Sport TV, differita dopo ~2 giorni su Sky
// canale 228. Il bottone in Hero e il badge live per round in Calendario
// erano già pronti ad attivarsi non appena valorizzata questa costante.
const YOUTUBE_LIVE_URL = 'https://youtube.com/@acisporttvofficial';

// Idem — differita TV, utile come ulteriore segnale di credibilità della
// serie (non è un evento amatoriale, va in onda anche su Sky).
const SKY_CHANNEL_NOTE = 'In differita dopo ~2 giorni su Sky, canale 228 (e streaming su acisport.tv)';

// Art. 5 RDS — le uniche 10 vetture omologate per la classe LMGT3.
const CARS = [
  'Aston Martin Vantage AMR LMGT3',
  'BMW M4 LMGT3',
  'Corvette Z06 LMGT3.R',
  'Ferrari 296 LMGT3',
  'Ford Mustang LMGT3',
  'Lamborghini Huracán LMGT3 Evo2',
  'Lexus RCF LMGT3',
  'McLaren 720S LMGT3 Evo',
  'Mercedes-AMG LMGT3',
  'Porsche 911 GT3 R LMGT3',
];

// Art. 12.2 RDS — punteggio ufficiale.
const POINTS = [
  { pos: 1, pts: 35 }, { pos: 2, pts: 30 }, { pos: 3, pts: 26 },
  { pos: 4, pts: 23 }, { pos: 5, pts: 20 }, { pos: 6, pts: 18 },
  { pos: 7, pts: 16 }, { pos: 8, pts: 14 }, { pos: 9, pts: 12 },
  { pos: 10, pts: 10 }, { pos: 11, pts: 9 }, { pos: 12, pts: 8 },
  { pos: 13, pts: 7 }, { pos: 14, pts: 6 }, { pos: 15, pts: 5 },
  { pos: 16, pts: 4 }, { pos: 17, pts: 3 }, { pos: 18, pts: 2 },
  { pos: 19, pts: 2 }, { pos: 20, pts: 2 }, { pos: 21, pts: 1 },
  { pos: 22, pts: 1 }, { pos: 23, pts: 1 }, { pos: 24, pts: 1 },
];

// Art. 9.2 RDS — calendario ufficiale (orari 22:01 locali per la gara).
const CALENDAR = [
  { round: 'R1', circuit: 'Autodromo Enzo e Dino Ferrari', location: 'Imola', date: '01 Ott 2026' },
  { round: 'R2', circuit: 'Circuit de Spa-Francorchamps', date: '15 Ott 2026' },
  { round: 'R3', circuit: 'Fuji International Speedway', date: '29 Ott 2026' },
  { round: 'R4', circuit: 'Autódromo José Carlos Pace', location: 'Interlagos', date: '12 Nov 2026' },
  { round: 'R5', circuit: 'Sebring International Raceway', date: '26 Nov 2026' },
  { round: 'R6', circuit: 'Bahrain International Circuit', date: '10 Dic 2026' },
];

export default function AciLmgt3Challenge() {
  usePageMeta({
    title: 'ACI LMGT3 Challenge 2026 — VSD Racing su Le Mans Ultimate | VSD',
    description: 'VSD Racing partecipa all’ACI LMGT3 Challenge 2026, campionato ufficiale indetto da ACI Sport su Le Mans Ultimate: classe unica LMGT3, 6 gare, calendario internazionale da Imola al Bahrain.',
  });

  return (
    <div className={styles.page}>

      {/* ════ HERO ════ */}
      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>VSD RACING IN GARA</div>
        <h1 className={styles.heroTitle}>
          ACI LMGT3 Challenge
          <span className={styles.heroTitleAccent}> 2026</span>
        </h1>
        <p className={styles.heroSub}>
          Le Mans Ultimate · Campionato Ufficiale ACI Sport · Classe Unica LMGT3
        </p>
        <div className={styles.heroOpen}>
          <span className={styles.heroBadge}>🌍 Field 35 vetture</span>
          <span className={styles.heroBadge}>👤 Conduttore singolo</span>
          <span className={styles.heroBadge}>📅 6 gare · Ott–Dic 2026</span>
        </div>
        <div className={styles.heroActions}>
          <a
            href={REGOLAMENTO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            📄 Regolamento ufficiale ACI Sport
          </a>
          <span className={`${styles.btn} ${styles.btnDisabled}`}>
            Iscrizioni chiuse il {REGISTRATION_DEADLINE}
          </span>
          {YOUTUBE_LIVE_URL && (
            <a
              href={YOUTUBE_LIVE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.btn} ${styles.btnSecondary}`}
            >
              🔴 Segui le dirette
            </a>
          )}
        </div>
        {YOUTUBE_LIVE_URL && (
          <p className={styles.heroSub} style={{ marginTop: 8, fontSize: 13 }}>
            📺 {SKY_CHANNEL_NOTE}
          </p>
        )}
        {(APEX_LOGO_URL || ACI_LOGO_URL) && (
          <div className={styles.heroPartnerLogos}>
            {ACI_LOGO_URL && (
              <img src={ACI_LOGO_URL} alt="ACI Sport" className={styles.heroPartnerLogo} />
            )}
            {APEX_LOGO_URL && (
              <a href={APEX_URL} target="_blank" rel="noopener noreferrer">
                <img src={APEX_LOGO_URL} alt="Apex Italia Simracing" className={styles.heroPartnerLogo} />
              </a>
            )}
          </div>
        )}
      </section>

      {/* ════ IL CAMPIONATO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Il Campionato</div>
        <h2 className={styles.sectionTitle}>Una serie ufficiale, non un format VSD</h2>
        <div className={styles.specGrid}>
          <SpecRow label="Indetto da" value="ACI Sport — Federazione Sportiva ACI, tramite ACI ESport" />
          <SpecRow
            label="Organizzatore esecutivo"
            value={
              <>
                Apex Italia Simracing — iscrizioni, server e risultati gara.{' '}
                <a href={APEX_URL} target="_blank" rel="noopener noreferrer" className={styles.disclaimerLink}>
                  apexitaliasimracing.net ↗
                </a>
              </>
            }
          />
          <SpecRow label="Simulatore" value="Le Mans Ultimate (Studio 397 / Motorsport Games)" />
          <SpecRow label="Modalità" value="Online, da casa — nessun requisito di membership VSD" />
          <SpecRow label="Field" value="35 equipaggi — se le iscrizioni superano il numero, decidono le prequalifiche del 17 e 20 Settembre 2026" />
          <SpecRow label="Tassa di ammissione" value="€15 a conduttore ammesso" />
          <SpecRow label="Titoli assegnati" value="Nessuno (art. 21 RDS) — trofeo ai primi 3 conduttori a fine stagione" />
        </div>
      </section>

      {/* ════ VETTURE AMMESSE ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Art. 5 RDS</div>
        <h2 className={styles.sectionTitle}>Vetture ammesse — Classe LMGT3</h2>
        <div className={styles.classGrid}>
          <div className={styles.classCard}>
            <div className={styles.classHeader}>
              <span className={styles.classIcon}>🟠</span>
              <div>
                <div className={styles.classLabel}>LMGT3</div>
                <div className={styles.classSublabel}>Classe unica — 10 modelli omologati</div>
              </div>
            </div>
            <ul className={styles.carList}>
              {CARS.map(car => (
                <li key={car} className={styles.carItem}>{car}</li>
              ))}
            </ul>
            <p className={styles.classNote}>
              ⚙ Balance of Performance ufficiale fornito dagli aggiornamenti di Le Mans Ultimate
            </p>
          </div>
        </div>
      </section>

      {/* ════ FORMATO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Formato Gara</div>
        <h2 className={styles.sectionTitle}>Struttura del weekend</h2>
        <div className={styles.formatGrid}>
          <FormatCard label="Prove Libere" value="10'" detail="Open lobby — la sera prima anche server FP 21:00–23:00" icon="⏱" />
          <FormatCard label="Qualifica" value="15'" detail="Sessione privata — giri illimitati" icon="🔒" />
          <FormatCard label="Gara" value="75'" detail="Griglia dalla qualifica · short formation lap" icon="🏁" accent />
        </div>
        <div className={styles.specGrid}>
          <SpecRow label="Track limits" value="Regola FIA di default — linee bianche parte della pista, cordoli esterni" />
          <SpecRow label="Real Road" value="Heavy — evoluzione termica attiva" />
          <SpecRow label="Carburante/Gomme" value="Consumo e usura realistici" />
          <SpecRow label="Danni" value="Realistici" />
          <SpecRow label="Aiuti alla guida" value="ABS, TC, ausili di frenata/sterzo e traiettoria — tutti disattivati" />
        </div>
      </section>

      {/* ════ CALENDARIO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Art. 9.2 RDS</div>
        <h2 className={styles.sectionTitle}>Calendario ufficiale</h2>
        <div className={styles.calendarGrid}>
          {CALENDAR.map(r => (
            <div key={r.round} className={styles.calendarCard}>
              <div className={styles.calendarRound}>{r.round}</div>
              <div className={styles.calendarCircuit}>
                {r.circuit}
                {r.location && <span> · {r.location}</span>}
              </div>
              <div className={styles.calendarMeta}>
                <span className={styles.calendarDate}>📅 {r.date}</span>
                <span className={styles.calendarTime}>🕐 22:01 (Italia)</span>
              </div>
              {YOUTUBE_LIVE_URL && (
                <a
                  href={YOUTUBE_LIVE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.calendarLive}
                >
                  🔴 Diretta YouTube
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ════ PUNTEGGIO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Art. 12.2 RDS</div>
        <h2 className={styles.sectionTitle}>Sistema di punteggio</h2>
        <div className={styles.pointsWrap}>
          <div className={styles.pointsRow}>
            {POINTS.map(({ pos, pts }) => (
              <div key={pos} className={`${styles.pointsCell} ${pos <= 3 ? styles.pointsPodium : ''}`}>
                <div className={styles.pointsPos}>P{pos}</div>
                <div className={styles.pointsPts}>{pts}</div>
              </div>
            ))}
          </div>
          <div className={styles.bonusRow}>
            <span className={styles.bonusBadge}>+1 pt Giro Veloce</span>
            <span className={styles.bonusBadge}>Punti solo a chi completa ≥50% dei giri del vincitore</span>
          </div>
        </div>
      </section>

      {/* ════ PATENTE A PUNTI ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Art. 19 RDS</div>
        <h2 className={styles.sectionTitle}>Patente a punti</h2>
        <div className={styles.specGrid}>
          <SpecRow label="Punti iniziali" value="10 per conduttore, a inizio campionato" />
          <SpecRow label="Penalità 5″" value="-2 punti patente" />
          <SpecRow label="Penalità 10″/15″ / Pit lane start" value="-3 punti patente" />
          <SpecRow label="Penalità ≥20″ / Drive Through / Stop&Go" value="-4 punti patente" />
          <SpecRow label="Squalifica" value="-5 punti patente" />
          <SpecRow label="Azzeramento" value="Esclusione dalla prova successiva; si rientra con 2 punti a manifestazione rimanente" />
        </div>
      </section>

      {/* ════ PILOTI VSD ════ */}
      <PrequalificheSection />

      {/* ════ STORY BOOK ════ */}
      <StoryBookSection />

      {/* ════ CLASSIFICA ════ */}
      <StandingsSection />

      {/* ════ CTA ════ */}
      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>Segui l'avventura ACI</h2>
        <p className={styles.ctaText}>
          Aggiornamenti, prequalifiche e risultati gara per gara: tutto quello che riguarda
          i colori VSD all'ACI LMGT3 Challenge passa dai nostri canali.
        </p>
        <div className={styles.ctaActions}>
          <a href={SOCIAL_LINKS.DISCORD} target="_blank" rel="noopener noreferrer" className={styles.btn}>
            Discord VSD
          </a>
          <a href={SOCIAL_LINKS.INSTAGRAM} target="_blank" rel="noopener noreferrer" className={styles.btn}>
            Instagram
          </a>
          <a href={SOCIAL_LINKS.FACEBOOK} target="_blank" rel="noopener noreferrer" className={styles.btn}>
            Facebook
          </a>
        </div>
      </section>

      <p className={styles.disclaimer}>
        L'ACI LMGT3 Challenge è un campionato indetto da ACI Sport e gestito operativamente da{' '}
        <a href={APEX_URL} target="_blank" rel="noopener noreferrer" className={styles.disclaimerLink}>
          Apex Italia Simracing
        </a>
        . VSD Racing vi partecipa con propri piloti ma non è l'organizzatore della serie — per il
        regolamento completo fa fede esclusivamente il documento ufficiale pubblicato su acisport.it.
      </p>

    </div>
  );
}

// ════ PILOTI IN PREQUALIFICA ════
// Onora il tentativo, non anticipa un risultato: tutti i sei sono ancora
// "in verifica" sull'entry list Apex, non confermati. Se un nome combacia
// con un pilota nel roster VSD, la card diventa un link al suo profilo con
// avatar reale; altrimenti resta una card semplice (es. pilota non più a
// roster, o nome scritto diversamente altrove).
//
// Il roster pubblico VSD mostra display_name troncato per privacy (es.
// "Silvio T.", non "Silvio Tuveri") — un match esatto sul nome completo
// preso dall'entry list Apex non trova mai nulla. Si normalizza invece a
// "nome|iniziale cognome" (es. "silvio|t") su entrambi i lati: stesso
// schema che il roster già usa, nessuna ambiguità osservata sui piloti
// attuali (nessun duplicato nome+iniziale nel roster).
function firstNameLastInitial(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return String(fullName || '').toLowerCase().trim();
  const first = parts[0].toLowerCase();
  const lastInitial = parts[parts.length - 1][0]?.toLowerCase() || '';
  return `${first}|${lastInitial}`;
}

function PrequalificheSection() {
  const { data: drivers } = useDrivers();

  const driverByName = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => {
      m[firstNameLastInitial(d.display_name)] = d;
    });
    return m;
  }, [drivers]);

  return (
    <section className={styles.section}>
      <div className={styles.sectionEyebrow}>{PREQUALIFICHE_DATES}</div>
      <h2 className={styles.sectionTitle}>I nostri in prequalifica</h2>
      <p className={styles.prequalIntro}>
        Il campo è capped a 35 vetture: con le iscrizioni oltre quel numero, decidono le
        prequalifiche. Questi sono i piloti VSD in corsa per un posto — stato "in verifica"
        sull'entry list ufficiale, non ancora un posto confermato.
      </p>
      <div className={styles.prequalGrid}>
        {PREQUALIFICHE_ENTRIES.map(entry => (
          <PrequalCard
            key={entry.name}
            entry={entry}
            driver={driverByName[firstNameLastInitial(entry.name)] || null}
          />
        ))}
      </div>
    </section>
  );
}

function PrequalCard({ entry, driver }) {
  const photoUrl = useConsentedDriverPhoto(driver?.driver_id);

  const inner = (
    <>
      <Avatar
        name={driver?.display_name || entry.name}
        driverId={driver?.driver_id || entry.name}
        size={48}
        photoUrl={photoUrl}
      />
      <div className={styles.prequalName}>{driver?.display_name || entry.name}</div>
      <div className={styles.prequalNumber}>#{entry.carNumber}</div>
      <span className={styles.prequalBadge}>In verifica</span>
    </>
  );

  if (driver) {
    return (
      <Link to={`/roster/${driver.driver_id}`} className={styles.prequalCard}>
        {inner}
      </Link>
    );
  }
  return <div className={styles.prequalCard}>{inner}</div>;
}

// ════ STORY BOOK ════
// Capitoli scritti dallo staff nel Social Manager (stessa fonte dati,
// vedi ../utils/storyPillars.js) — qui vengono letti in sola lettura,
// solo quelli con status "pubblicato" (bozze/programmati restano
// visibili solo lato admin), in ordine cronologico dal più vecchio:
// si legge come un libro, non come un feed.
function StoryBookSection() {
  const { data: posts, isLoading } = useSocialPosts('pubblicato');

  const chapters = useMemo(() => {
    return (posts || [])
      .filter(p => STORY_PILLAR_IDS.includes(p.pillar))
      .sort((a, b) => {
        const da = String(a.published_at || a.scheduled_date || a.created_at || '');
        const db = String(b.published_at || b.scheduled_date || b.created_at || '');
        return da.localeCompare(db);
      });
  }, [posts]);

  return (
    <section className={styles.section}>
      <div className={styles.sectionEyebrow}>Story Book</div>
      <h2 className={styles.sectionTitle}>Il racconto dell'avventura VSD</h2>

      {isLoading && (
        <div className={styles.standingsSkeleton}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} style={{ width: '85%' }} />
        </div>
      )}

      {!isLoading && chapters.length === 0 && (
        <div className={styles.emptyBox}>
          <div className={styles.emptyIcon}>📖</div>
          <div className={styles.emptyTitle}>Il primo capitolo deve ancora essere scritto</div>
          <div className={styles.emptyText}>
            Arriva con l'esito delle prequalifiche del 17 e 20 Settembre — o prima,
            se qualcuno dei nostri si iscrive direttamente.
          </div>
        </div>
      )}

      {!isLoading && chapters.length > 0 && (
        <div className={styles.storyList}>
          {chapters.map(ch => (
            <article key={ch.post_id} className={styles.storyChapter}>
              <div className={styles.storyChapterHead}>
                <span className={styles.storyChapterTag}>
                  📖 {storyPillarLabel(ch.pillar)}
                </span>
                <span className={styles.storyChapterDate}>
                  {fmtChapterDate(ch.published_at || ch.scheduled_date || ch.created_at)}
                </span>
              </div>
              <p className={styles.storyChapterText}>{ch.content}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function fmtChapterDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ════ CLASSIFICA ════

function StandingsSection() {
  const { data, isLoading } = useChampionshipStandings(ACI_CHAMPIONSHIP_ID);
  const { data: drivers } = useDrivers();
  // Classe unica LMGT3 (art. 5 RDS) — nessun selettore multi-classe da
  // costruire qui, a differenza di altri campionati VSD. setSelectedClass
  // non serve finché resta così: se in futuro ACI aggiunge classi, va
  // reintrodotto insieme alla UI del selettore.
  const [selectedClass] = useState(null);

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  const activeClass = useMemo(() => {
    if (!data?.classes?.length) return null;
    if (selectedClass) {
      return data.classes.find(c => c.class_name === selectedClass) || data.classes[0];
    }
    return data.classes[0];
  }, [data, selectedClass]);

  const hasStandings = data?.classes?.length > 0 && data.rounds?.length > 0;

  return (
    <section className={styles.section}>
      <div className={styles.sectionEyebrow}>Stagione 2026</div>
      <h2 className={styles.sectionTitle}>Classifica</h2>

      {isLoading && (
        <div className={styles.standingsSkeleton}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} style={{ width: '80%' }} />
          <div className={styles.skeletonBar} style={{ width: '90%' }} />
        </div>
      )}

      {!isLoading && !hasStandings && (
        <div className={styles.emptyBox}>
          <div className={styles.emptyIcon}>🏁</div>
          <div className={styles.emptyTitle}>Stagione in arrivo</div>
          <div className={styles.emptyText}>
            La classifica sarà disponibile dopo Round 1 — Imola, 1 Ottobre 2026.
          </div>
        </div>
      )}

      {!isLoading && hasStandings && activeClass && (
        <>
          <div className={styles.standingsTableWrap}>
            <table className={styles.standingsTable}>
              <thead>
                <tr>
                  <th className={styles.stColPos}>#</th>
                  <th>Pilota</th>
                  <th className={styles.stNum}>Pts</th>
                  <th className={styles.stNum}>Gare</th>
                  <th className={styles.stNum}>W</th>
                  <th className={styles.stNum}>Podi</th>
                  <th className={styles.stNum}>Best</th>
                </tr>
              </thead>
              <tbody>
                {activeClass.standings.map(s => {
                  const podium = s.position <= 3;
                  return (
                    <tr
                      key={`${s.driver_id || s.driver_name_external}__${s.car_class}`}
                      className={[
                        s.is_vsd ? styles.stRowVsd : '',
                        podium ? styles[`stPodium${s.position}`] : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <td className={styles.stColPos}>
                        <span className={styles.stPosBadge}>{s.position}</span>
                      </td>
                      <td>
                        <DriverCell driver={s} driverInfo={driverMap[s.driver_id]} />
                      </td>
                      <td className={styles.stNum}><strong>{s.total_points}</strong></td>
                      <td className={styles.stNum}>{s.races_count}</td>
                      <td className={styles.stNum}>{s.wins || '—'}</td>
                      <td className={styles.stNum}>{s.podiums || '—'}</td>
                      <td className={styles.stNum}>{s.best_finish ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.standingsFooter}>
            <Link to={`/championships/${ACI_CHAMPIONSHIP_ID}`} className={styles.standingsDetailLink}>
              Classifica completa →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function DriverCell({ driver, driverInfo }) {
  const photoUrl = useConsentedDriverPhoto(driverInfo?.driver_id);
  if (driver.is_vsd && driverInfo) {
    return (
      <Link to={`/roster/${driverInfo.driver_id}`} className={styles.stDriverLink}>
        <Avatar name={driverInfo.display_name} driverId={driverInfo.driver_id} size={24} photoUrl={photoUrl} />
        <span className={styles.stDriverName}>{driverInfo.display_name}</span>
        <span className={styles.stVsdBadge}>VSD</span>
      </Link>
    );
  }
  return (
    <span className={styles.stDriverExternal}>
      {driver.display_name || driver.driver_name_external || 'Unknown'}
    </span>
  );
}

// ════ HELPER COMPONENTS ════

function FormatCard({ label, value, detail, icon, accent }) {
  return (
    <div className={`${styles.formatCard} ${accent ? styles.formatCardAccent : ''}`}>
      <div className={styles.formatIcon}>{icon}</div>
      <div className={styles.formatLabel}>{label}</div>
      <div className={styles.formatValue}>{value}</div>
      <div className={styles.formatDetail}>{detail}</div>
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
