import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import {
  useClashParticipants,
  useClashRegister,
  useClashStandings,
  useClashReportIncident,
} from '../hooks/useClashOfClasses';
import { useAuth } from '../hooks/useAuth';
import { SOCIAL_LINKS } from '../utils/constants';
import styles from './ClashOfClasses.module.css';

const CLASSES = [
  {
    id: 'GTE',
    label: 'GTE',
    sublabel: 'La vecchia scuola',
    icon: '⚫',
    car: 'Porsche 911 RSR',
    traits: [
      'Nessun ABS',
      'Elettronica ridotta all’osso',
      'Bilanciamento frenata manuale',
      'Premia sensibilità e disciplina',
    ],
  },
  {
    id: 'GT3',
    label: 'GT3',
    sublabel: 'La nuova scuola',
    icon: '🔵',
    car: 'Mercedes-AMG GT3',
    traits: [
      'ABS attivo',
      'Controllo di trazione moderno',
      'Elettronica a supporto del pilota',
      'Premia aggressività in frenata',
    ],
  },
];

const CALENDAR = [
  { round: 1, circuit: 'Silverstone Circuit', nation: 'Regno Unito', note: 'Apertura stagione' },
  { round: 2, circuit: 'Autodromo di Imola', nation: 'Italia', note: 'Round di casa' },
  { round: 3, circuit: 'Spa-Francorchamps', nation: 'Belgio', note: 'Finale — Trofeo delle Classi' },
];

const FORMAT = [
  { label: 'Prove Libere', value: '10\'', detail: 'Set-up libero, carburante e gomme a scelta' },
  { label: 'Qualifica', value: '10\'', detail: 'Sessione unica: il giro migliore vale la griglia' },
  { label: 'Gara Sprint', value: '40\'', detail: 'Griglia combinata GTE + GT3, classifiche separate' },
];

const POINTS_TABLE = [
  { pos: 1, pts: 20 }, { pos: 2, pts: 17 }, { pos: 3, pts: 15 }, { pos: 4, pts: 13 },
  { pos: 5, pts: 11 }, { pos: 6, pts: 10 }, { pos: 7, pts: 9 }, { pos: 8, pts: 8 },
  { pos: 9, pts: 7 }, { pos: 10, pts: 6 }, { pos: 11, pts: 5 }, { pos: 12, pts: 4 },
  { pos: 13, pts: 3 }, { pos: 14, pts: 2 }, { pos: 15, pts: 1 },
];

const SANCTIONS = [
  { level: 'Media', example: 'Rientro pericoloso, contatto con vantaggio', penalty: '+10s' },
  { level: 'Grave', example: 'Manovra antisportiva, incidente evitabile', penalty: 'Drive-through (+20s) o retrocessione' },
  { level: 'Gravissima', example: 'Scontro intenzionale, condotta reiterata', penalty: 'Squalifica dalla gara' },
];

export default function ClashOfClasses() {
  usePageMeta({
    title: 'Clash of Classes — GTE vs GT3 | VSD',
    description: 'VSD Clash of Classes: mini-campionato esibizione GTE vs GT3 su Le Mans Ultimate. 3 round — Silverstone, Imola, Spa-Francorchamps. Aperto a tutta la community.',
  });

  return (
    <div className={styles.page}>

      {/* ════ HERO ════ */}
      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>VIRTUAL SIM-DRIVER PRESENTA</div>
        <h1 className={styles.heroTitle}>
          CLASH OF <span className={styles.heroTitleAccent}>CLASSES</span>
        </h1>
        <p className={styles.heroSub}>GTE vs GT3 — Old School vs New School</p>
        <div className={styles.heroOpen}>
          <span className={styles.heroBadge}>🌍 Aperto a tutta la community</span>
          <span className={styles.heroBadge}>🏁 3 round · LMU</span>
          <span className={styles.heroBadge}>📅 Date da definire</span>
        </div>
        <div className={styles.heroActions}>
          <a href="#iscrizione" className={`${styles.btn} ${styles.btnPrimary}`}>Iscriviti</a>
          <a href="#classifiche" className={`${styles.btn} ${styles.btnSecondary}`}>Classifiche</a>
          <a
            href="/clash-of-classes_regolamento.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            📄 Regolamento
          </a>
        </div>
      </section>

      {/* ════ VISIONE ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>La visione</div>
        <h2 className={styles.sectionTitle}>Non un campionato. Una sfida di filosofie.</h2>
        <p className={styles.leadText}>
          VSD Clash of Classes mette a confronto due modi di intendere la guida sim: la disciplina
          pura delle GTE, senza reti di sicurezza elettroniche, contro la precisione tecnologica
          delle GT3 moderne. Ogni pilota corre per sé, ma contribuisce anche al punteggio della
          propria classe nella sfida collettiva — il <strong>Trofeo delle Classi</strong> — che
          decreterà quale scuola di guida dominerà la stagione.
        </p>
      </section>

      {/* ════ CLASSI ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Le classi in gara</div>
        <h2 className={styles.sectionTitle}>GTE vs GT3: chi guida cosa</h2>
        <div className={styles.classGrid}>
          {CLASSES.map(cls => (
            <div key={cls.id} className={`${styles.classCard} ${styles[`cls_${cls.id}`]}`}>
              <div className={styles.classHeader}>
                <span className={styles.classIcon}>{cls.icon}</span>
                <div>
                  <div className={styles.classLabel}>{cls.label}</div>
                  <div className={styles.classSublabel}>{cls.sublabel}</div>
                </div>
              </div>
              <div className={styles.classCar}>Vettura di riferimento: {cls.car}</div>
              <ul className={styles.traitList}>
                {cls.traits.map(t => <li key={t} className={styles.traitItem}>{t}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className={styles.classNote}>
          Bilanciamento prestazionale (BoP) gestito tramite le impostazioni server LMU, a cura
          dello staff tecnico.
        </p>
      </section>

      {/* ════ CALENDARIO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Calendario</div>
        <h2 className={styles.sectionTitle}>Tre round, tre grandi circuiti</h2>
        <div className={styles.calendarGrid}>
          {CALENDAR.map(r => (
            <div key={r.round} className={styles.calendarCard}>
              <div className={styles.calendarRound}>Round {r.round}</div>
              <div className={styles.calendarCircuit}>{r.circuit}</div>
              <div className={styles.calendarMeta}>
                <span>{r.nation}</span>
                <span className={styles.calendarNoteTag}>{r.note}</span>
              </div>
              <div className={styles.calendarDate}>📅 Data da definire</div>
            </div>
          ))}
        </div>
      </section>

      {/* ════ FORMATO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Formato</div>
        <h2 className={styles.sectionTitle}>Formato del weekend di gara</h2>
        <p className={styles.leadText}>
          Stesso format per entrambe le classi, in griglia unica multiclasse: l’ordine di
          partenza è determinato dal tempo assoluto in qualifica, indipendentemente dalla classe.
        </p>
        <div className={styles.formatGrid}>
          {FORMAT.map(f => (
            <div key={f.label} className={styles.formatCard}>
              <div className={styles.formatLabel}>{f.label}</div>
              <div className={styles.formatValue}>{f.value}</div>
              <div className={styles.formatDetail}>{f.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ════ REGOLE ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Regole di gara</div>
        <h2 className={styles.sectionTitle}>Moltiplicatori e gestione gara</h2>
        <div className={styles.specGrid}>
          <SpecRow label="Consumo gomme" value="x2" />
          <SpecRow label="Consumo carburante" value="x2" />
          <SpecRow label="Griglia massima" value="22 piloti" />
          <SpecRow label="Track limits" value="Standard nativo Le Mans Ultimate, nessuna regola aggiuntiva" />
          <SpecRow label="Safety Car / FCY" value="Non previsti — gara a bandiere verdi salvo stop sicurezza server" />
          <SpecRow label="Sosta ai box" value="Non obbligatoria — scelta strategica libera del pilota" />
        </div>
      </section>

      {/* ════ PUNTEGGIO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Punteggio</div>
        <h2 className={styles.sectionTitle}>Sistema di punteggio individuale</h2>
        <p className={styles.leadText}>Punti assegnati per posizione di arrivo, all’interno della propria classe.</p>
        <div className={styles.pointsWrap}>
          <div className={styles.pointsRow}>
            {POINTS_TABLE.map(({ pos, pts }) => (
              <div key={pos} className={`${styles.pointsCell} ${pos <= 3 ? styles.pointsPodium : ''}`}>
                <div className={styles.pointsPos}>P{pos}</div>
                <div className={styles.pointsPts}>{pts}</div>
              </div>
            ))}
          </div>
          <div className={styles.bonusRow}>
            <span className={styles.bonusBadge}>+1 pt Pole position di classe</span>
            <span className={styles.bonusBadge}>+1 pt Giro veloce di classe (se in top 10)</span>
            <span className={styles.bonusBadge}>+1 pt Bonus finisher</span>
          </div>
        </div>
      </section>

      {/* ════ TROFEO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>La sfida finale</div>
        <h2 className={styles.sectionTitle}>Trofeo delle Classi &amp; Vincitore Assoluto</h2>
        <div className={styles.trophyExplain}>
          <p>
            Per ogni gara si sommano <strong>TUTTI</strong> i punti individuali dei piloti
            classificati di ciascuna classe (nessun limite di piloti conteggiati) — premia anche
            la partecipazione, non solo la performance dei top driver.
          </p>
          <p>
            Il totale di ogni round si somma sui 3 round: dopo Spa-Francorchamps, la classe col
            punteggio cumulativo più alto vince il <strong>Trofeo delle Classi</strong>. In
            parallelo, la <strong>Classifica Assoluta</strong> unisce tutti i piloti (GTE+GT3): chi
            la guida a fine stagione è il <strong>Vincitore Assoluto</strong>, a prescindere dalla
            classe.
          </p>
          <p className={styles.trophyTitlesNote}>
            Quattro riconoscimenti: Vincitore Classifica GTE · Vincitore Classifica GT3 · Classe
            vincitrice del Trofeo · Vincitore Assoluto.
          </p>
        </div>
      </section>

      {/* ════ SANZIONI ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Fair play</div>
        <h2 className={styles.sectionTitle}>Sistema sanzionatorio</h2>
        <p className={styles.leadText}>
          A pannaggio della Direzione Generale VSD: segnalazioni tramite il form qui sotto entro
          48h dalla gara.
        </p>
        <div className={styles.sanctionsTableWrap}>
          <table className={styles.sanctionsTable}>
            <thead>
              <tr><th>Livello</th><th>Esempi</th><th>Penalità</th></tr>
            </thead>
            <tbody>
              {SANCTIONS.map(s => (
                <tr key={s.level}>
                  <td className={styles.sanctionLevel}>{s.level}</td>
                  <td>{s.example}</td>
                  <td>{s.penalty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ════ ISCRIZIONE ════ */}
      <RegistrationSection />

      {/* ════ CLASSIFICHE ════ */}
      <StandingsSection />

      {/* ════ SEGNALAZIONE INCIDENTI ════ */}
      <IncidentReportSection />

      {/* ════ CTA / CONTATTI ════ */}
      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>GTE o GT3 — la tua classe, la tua sfida</h2>
        <p className={styles.ctaText}>
          Evento aperto a tutta la community VSD, non solo al roster ufficiale del team.
        </p>
        <div className={styles.ctaActions}>
          <a href="#iscrizione" className={`${styles.btn} ${styles.btnPrimary}`}>Iscriviti ora</a>
          <a href={SOCIAL_LINKS.DISCORD} target="_blank" rel="noopener noreferrer" className={styles.btn}>Discord VSD</a>
          <a href={SOCIAL_LINKS.INSTAGRAM} target="_blank" rel="noopener noreferrer" className={styles.btn}>Instagram</a>
          <a href={SOCIAL_LINKS.FACEBOOK} target="_blank" rel="noopener noreferrer" className={styles.btn}>Facebook</a>
        </div>
        <div className={styles.ctaStaff}>Staff di riferimento: @Demetrio · @Calvi · @Ciccone · @Baiguera · @Fabbro</div>
      </section>

    </div>
  );
}

// ════ ISCRIZIONE ════

function RegistrationSection() {
  const { driver, isVsdPilot } = useAuth();
  const { data: participantsData, isLoading: loadingParticipants } = useClashParticipants();
  const registerMutation = useClashRegister();

  const [displayName, setDisplayName] = useState('');
  const [selectedClass, setSelectedClass] = useState('GTE');
  const [discordHandle, setDiscordHandle] = useState('');
  const [feedback, setFeedback] = useState(null);

  const counts = participantsData?.counts || { GTE: 0, GT3: 0 };
  const total = participantsData?.count ?? 0;
  const maxGrid = participantsData?.max_grid ?? 22;
  const isFull = total >= maxGrid;

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    const name = isVsdPilot ? (driver?.display_name || displayName) : displayName;
    if (!name?.trim()) {
      setFeedback({ ok: false, message: 'Inserisci un nome.' });
      return;
    }
    try {
      await registerMutation.mutateAsync({
        display_name: name.trim(),
        class: selectedClass,
        discord_handle: discordHandle.trim(),
      });
      setFeedback({ ok: true, message: `Iscrizione confermata — classe ${selectedClass}.` });
      setDisplayName('');
      setDiscordHandle('');
    } catch (err) {
      setFeedback({ ok: false, message: err.message || 'Errore durante l’iscrizione.' });
    }
  }

  return (
    <section id="iscrizione" className={styles.section}>
      <div className={styles.sectionEyebrow}>Iscrizioni</div>
      <h2 className={styles.sectionTitle}>Scegli la tua classe</h2>
      <p className={styles.leadText}>
        La classe scelta resta fissa per tutte e 3 le gare della serie: nessun cambio classe a
        stagione avviata. Chiusura iscrizioni: 48 ore prima di Round 1 (data da definire).
      </p>

      <div className={styles.registrationLayout}>
        <form className={styles.form} onSubmit={handleSubmit}>
          {!isVsdPilot && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="coc-name">Nome pilota</label>
              <input
                id="coc-name"
                type="text"
                className={styles.input}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Nome e cognome o nickname"
                maxLength={80}
                required
              />
            </div>
          )}
          {isVsdPilot && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Pilota</label>
              <div className={styles.formStaticValue}>{driver?.display_name} (roster VSD)</div>
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="coc-class">Classe</label>
            <select
              id="coc-class"
              className={styles.select}
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
            >
              <option value="GTE">GTE — vecchia scuola</option>
              <option value="GT3">GT3 — nuova scuola</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="coc-discord">Discord (opzionale)</label>
            <input
              id="coc-discord"
              type="text"
              className={styles.input}
              value={discordHandle}
              onChange={e => setDiscordHandle(e.target.value)}
              placeholder="username#0000"
              maxLength={60}
            />
          </div>

          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={registerMutation.isPending || isFull}
          >
            {isFull ? 'Griglia al completo' : registerMutation.isPending ? 'Invio…' : 'Iscriviti a Clash of Classes'}
          </button>

          {feedback && (
            <div className={feedback.ok ? styles.formSuccess : styles.formError}>
              {feedback.message}
            </div>
          )}
        </form>

        <div className={styles.registrationCounts}>
          <div className={styles.countCard}>
            <div className={styles.countValue}>{loadingParticipants ? '—' : total}/{maxGrid}</div>
            <div className={styles.countLabel}>Iscritti totali</div>
          </div>
          <div className={styles.countCard}>
            <div className={styles.countValue}>{loadingParticipants ? '—' : counts.GTE || 0}</div>
            <div className={styles.countLabel}>Classe GTE</div>
          </div>
          <div className={styles.countCard}>
            <div className={styles.countValue}>{loadingParticipants ? '—' : counts.GT3 || 0}</div>
            <div className={styles.countLabel}>Classe GT3</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ════ CLASSIFICHE ════

const STANDINGS_TABS = [
  { id: 'gte', label: 'GTE' },
  { id: 'gt3', label: 'GT3' },
  { id: 'overall', label: 'Assoluta' },
  { id: 'trophy', label: 'Trofeo delle Classi' },
];

function StandingsSection() {
  const { data, isLoading } = useClashStandings();
  const [activeTab, setActiveTab] = useState('gte');

  const hasData = !!data && (
    (data.gte?.length > 0) || (data.gt3?.length > 0) || (data.overall?.length > 0)
  );

  return (
    <section id="classifiche" className={styles.section}>
      <div className={styles.sectionEyebrow}>Stagione</div>
      <h2 className={styles.sectionTitle}>Classifiche</h2>

      {isLoading && (
        <div className={styles.standingsSkeleton}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} style={{ width: '80%' }} />
          <div className={styles.skeletonBar} style={{ width: '90%' }} />
        </div>
      )}

      {!isLoading && !hasData && (
        <div className={styles.standingsEmpty}>
          <div className={styles.standingsEmptyIcon}>🏁</div>
          <div className={styles.standingsEmptyTitle}>Stagione in arrivo</div>
          <div className={styles.standingsEmptyText}>
            Le classifiche saranno disponibili dopo Round 1 — Silverstone.
          </div>
        </div>
      )}

      {!isLoading && hasData && (
        <>
          <div className={styles.standingsTabs}>
            {STANDINGS_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`${styles.standingsTab} ${activeTab === t.id ? styles.standingsTabActive : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab !== 'trophy' && (
            <StandingsTable rows={data[activeTab] || []} />
          )}
          {activeTab === 'trophy' && <TrophyTable trophy={data.trophy} />}
        </>
      )}
    </section>
  );
}

function StandingsTable({ rows }) {
  if (rows.length === 0) {
    return <p className={styles.leadText}>Nessun dato ancora disponibile per questa classifica.</p>;
  }
  return (
    <div className={styles.standingsTableWrap}>
      <table className={styles.standingsTable}>
        <thead>
          <tr>
            <th className={styles.stColPos}>#</th>
            <th>Pilota</th>
            <th>Classe</th>
            <th className={styles.stNum}>Pts</th>
            <th className={styles.stNum}>Gare</th>
            <th className={styles.stNum}>W</th>
            <th className={styles.stNum}>Podi</th>
            <th className={styles.stNum}>Best</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.driver_id || r.display_name}__${r.class}`}>
              <td className={styles.stColPos}><span className={styles.stPosBadge}>{r.position}</span></td>
              <td>
                {r.driver_id
                  ? <Link to={`/roster/${r.driver_id}`} className={styles.stDriverLink}>{r.display_name}</Link>
                  : <span className={styles.stDriverExternal}>{r.display_name}</span>}
              </td>
              <td>{r.class}</td>
              <td className={styles.stNum}><strong>{r.total_points}</strong></td>
              <td className={styles.stNum}>{r.races_count}</td>
              <td className={styles.stNum}>{r.wins || '—'}</td>
              <td className={styles.stNum}>{r.podiums || '—'}</td>
              <td className={styles.stNum}>{r.best_finish ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrophyTable({ trophy }) {
  if (!trophy || (trophy.gte_total === 0 && trophy.gt3_total === 0)) {
    return <p className={styles.leadText}>Nessun round ancora disputato.</p>;
  }
  return (
    <div className={styles.trophyWrap}>
      <div className={styles.trophyTotals}>
        <div className={`${styles.trophyTotalCard} ${trophy.leading_class === 'GTE' ? styles.trophyLeading : ''}`}>
          <div className={styles.trophyClassLabel}>GTE</div>
          <div className={styles.trophyClassPoints}>{trophy.gte_total}</div>
        </div>
        <div className={styles.trophyVs}>VS</div>
        <div className={`${styles.trophyTotalCard} ${trophy.leading_class === 'GT3' ? styles.trophyLeading : ''}`}>
          <div className={styles.trophyClassLabel}>GT3</div>
          <div className={styles.trophyClassPoints}>{trophy.gt3_total}</div>
        </div>
      </div>
      {trophy.leading_class && (
        <p className={styles.trophyStatus}>
          {trophy.decided ? 'Classe vincitrice del Trofeo: ' : 'In testa dopo i round disputati: '}
          <strong>{trophy.leading_class}</strong>
        </p>
      )}
      {trophy.by_round?.length > 0 && (
        <div className={styles.trophyRoundsWrap}>
          <table className={styles.standingsTable}>
            <thead>
              <tr><th>Round</th><th className={styles.stNum}>GTE</th><th className={styles.stNum}>GT3</th></tr>
            </thead>
            <tbody>
              {trophy.by_round.map(r => (
                <tr key={r.round}>
                  <td>Round {r.round}</td>
                  <td className={styles.stNum}>{r.GTE}</td>
                  <td className={styles.stNum}>{r.GT3}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════ SEGNALAZIONE INCIDENTI ════

function IncidentReportSection() {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(1);
  const [reportingName, setReportingName] = useState('');
  const [reportedName, setReportedName] = useState('');
  const [description, setDescription] = useState('');
  const [replayUrl, setReplayUrl] = useState('');
  const [feedback, setFeedback] = useState(null);

  const reportMutation = useClashReportIncident();

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    try {
      await reportMutation.mutateAsync({
        round,
        reporting_name: reportingName.trim(),
        reported_name: reportedName.trim(),
        description: description.trim(),
        replay_url: replayUrl.trim(),
      });
      setFeedback({ ok: true, message: 'Segnalazione inviata. La Direzione Generale la esaminerà entro 48h.' });
      setReportingName('');
      setReportedName('');
      setDescription('');
      setReplayUrl('');
    } catch (err) {
      setFeedback({ ok: false, message: err.message || 'Errore durante l’invio.' });
    }
  }

  return (
    <section id="segnalazioni" className={styles.section}>
      <div className={styles.sectionEyebrow}>Direzione Generale</div>
      <h2 className={styles.sectionTitle}>Segnalazione incidenti</h2>
      <p className={styles.leadText}>
        Le segnalazioni vanno inoltrate entro 48 ore dal termine della gara. Le sanzioni sono a
        pannaggio della Direzione Generale VSD e comunicate su Discord.
      </p>

      <button
        type="button"
        className={`${styles.btn} ${styles.btnSecondary}`}
        onClick={() => setOpen(v => !v)}
      >
        {open ? 'Chiudi il form' : 'Segnala un incidente'}
      </button>

      {open && (
        <form className={styles.form} onSubmit={handleSubmit} style={{ marginTop: 20 }}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="coc-inc-round">Round</label>
            <select
              id="coc-inc-round"
              className={styles.select}
              value={round}
              onChange={e => setRound(Number(e.target.value))}
            >
              {CALENDAR.map(r => (
                <option key={r.round} value={r.round}>Round {r.round} — {r.circuit}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="coc-inc-from">Pilota segnalante</label>
            <input
              id="coc-inc-from" type="text" className={styles.input}
              value={reportingName} onChange={e => setReportingName(e.target.value)}
              maxLength={80} required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="coc-inc-to">Pilota segnalato</label>
            <input
              id="coc-inc-to" type="text" className={styles.input}
              value={reportedName} onChange={e => setReportedName(e.target.value)}
              maxLength={80} required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="coc-inc-desc">Descrizione</label>
            <textarea
              id="coc-inc-desc" className={styles.textarea} rows={4}
              value={description} onChange={e => setDescription(e.target.value)}
              maxLength={2000} required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="coc-inc-replay">Link replay/telemetria (opzionale)</label>
            <input
              id="coc-inc-replay" type="url" className={styles.input}
              value={replayUrl} onChange={e => setReplayUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={reportMutation.isPending}>
            {reportMutation.isPending ? 'Invio…' : 'Invia segnalazione'}
          </button>

          {feedback && (
            <div className={feedback.ok ? styles.formSuccess : styles.formError}>
              {feedback.message}
            </div>
          )}
        </form>
      )}
    </section>
  );
}

// ════ HELPER ════

function SpecRow({ label, value }) {
  return (
    <div className={styles.specRow}>
      <div className={styles.specLabel}>{label}</div>
      <div className={styles.specValue}>{value}</div>
    </div>
  );
}
