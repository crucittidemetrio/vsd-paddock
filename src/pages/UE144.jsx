import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useChampionshipStandings } from '../hooks/useChampionshipStandings';
import { useDrivers } from '../hooks/useRoster';
import Avatar from '../components/shared/Avatar';
import styles from './UE144.module.css';

const UE144_CHAMPIONSHIP_ID = 'chmp-lmu-ultimate-endurance-144-2026';

const SIMGRID_URL = null; // sostituire con il link reale

const CLASSES = [
  {
    id: 'hypercar',
    label: 'Hypercar',
    sublabel: 'Classe Top',
    icon: '🔴',
    cars: [
      'Ferrari 499P',
      'Toyota GR010 Hybrid',
      'Porsche 963',
      'Peugeot 9X8',
      'Cadillac V-Series.R',
      'BMW M Hybrid V8',
      'Alpine A424',
      'Lamborghini SC63',
      'Genesis GR90',
    ],
  },
  {
    id: 'lmp2',
    label: 'LMP2',
    sublabel: 'Parità assoluta',
    icon: '🔵',
    cars: ['Oreca 07-Gibson'],
    note: 'Vettura unica — massima parità di mezzi',
  },
  {
    id: 'lmgt3',
    label: 'LMGT3',
    sublabel: 'Gran Turismo',
    icon: '🟠',
    cars: [
      'Ferrari 296 GT3',
      'Porsche 911 GT3 R',
      'Corvette Z06 GT3.R',
      'Ford Mustang GT3',
      'BMW M4 GT3',
      'McLaren 720S GT3 Evo',
      'Aston Martin Vantage GT3',
      'Mercedes-AMG GT3',
    ],
    note: '⚠ Lista soggetta ad aggiornamento in base ai DLC disponibili',
  },
];

const POINTS = [
  { pos: 1, pts: 25 }, { pos: 2, pts: 18 }, { pos: 3, pts: 15 },
  { pos: 4, pts: 12 }, { pos: 5, pts: 10 }, { pos: 6, pts: 8 },
  { pos: 7, pts: 6 },  { pos: 8, pts: 4 },  { pos: 9, pts: 2 },
  { pos: 10, pts: 1 },
];

const CALENDAR = [
  {
    round: 'R1',
    circuit: 'Sebring International Raceway',
    date: '13 Set 2026',
    time: '14:00',
    weather: 'Sereno → Notte serena',
    multiplier: '5×',
  },
  {
    round: 'R2',
    circuit: 'Autodromo Enzo e Dino Ferrari',
    location: 'Imola',
    date: '27 Set 2026',
    time: '10:00',
    weather: 'Nuvoloso → Sereno',
    multiplier: '2×',
  },
  {
    round: 'R3',
    circuit: 'Circuit de Spa-Francorchamps',
    date: '11 Ott 2026',
    time: '15:00',
    weather: 'Sereno → Pioggia → Asciutto',
    multiplier: '10×',
  },
  {
    round: 'R4',
    circuit: 'Fuji Speedway',
    date: '25 Ott 2026',
    time: '13:00',
    weather: 'Nuvoloso → Nebbia → Sereno',
    multiplier: '4×',
  },
  {
    round: 'R5',
    circuit: 'Autodromo Nazionale Monza',
    date: '08 Nov 2026',
    time: '13:00',
    weather: 'Sereno e Caldo',
    multiplier: '2×',
  },
  {
    round: 'R6',
    circuit: 'Circuit des 24 Heures du Mans',
    date: '22 Nov 2026',
    time: '16:00',
    weather: 'Variabile → Notte → Alba',
    multiplier: '10×',
  },
];

export default function UE144() {
  return (
    <div className={styles.page}>

      {/* ════ HERO ════ */}
      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>VSD RACING PRESENTS</div>
        <h1 className={styles.heroTitle}>
          Ultimate Endurance
          <span className={styles.heroTitleAccent}> 144'</span>
        </h1>
        <p className={styles.heroSub}>
          Le Mans Ultimate · Multi-Classe · Pilota Singolo
        </p>
        <div className={styles.heroOpen}>
          <span className={styles.heroBadge}>🌍 Aperto a tutti</span>
          <span className={styles.heroBadge}>👤 Single Driver Only</span>
          <span className={styles.heroBadge}>📅 6 round · Set–Nov 2026</span>
        </div>
        <div className={styles.heroActions}>
          {SIMGRID_URL ? (
            <a href={SIMGRID_URL} target="_blank" rel="noopener noreferrer"
              className={`${styles.btn} ${styles.btnPrimary}`}>
              Iscriviti su SimGrid
            </a>
          ) : (
            <span className={`${styles.btn} ${styles.btnDisabled}`}>
              Iscrizioni — prossimamente
            </span>
          )}
          {/* Regolamento temporaneamente nascosto */}
        </div>
      </section>

      {/* ════ CLASSI ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Classi</div>
        <h2 className={styles.sectionTitle}>Tre classi in pista</h2>
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
              <ul className={styles.carList}>
                {cls.cars.map(car => (
                  <li key={car} className={styles.carItem}>{car}</li>
                ))}
              </ul>
              {cls.note && <p className={styles.classNote}>{cls.note}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* ════ FORMATO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Formato</div>
        <h2 className={styles.sectionTitle}>Struttura della sessione</h2>
        <div className={styles.formatGrid}>
          <FormatCard label="Practice" value="30'" detail="Open lobby — setup e analisi telemetrica" icon="⏱" />
          <FormatCard label="Qualifiche" value="15'" detail="Sessione privata — time attack puro" icon="🔒" />
          <FormatCard label="Gara" value="144'" detail="Rolling Start · pilota singolo" icon="🏁" accent />
        </div>

        <div className={styles.specGrid}>
          <SpecRow label="Pista" value="Dynamic Track attivo — evoluzione termica Real Road attiva" />
          <SpecRow label="Carburante" value="Virtual Energy Tank attivo" />
          <SpecRow label="Danni" value="100% — per forzare la pulizia di guida" />
          <SpecRow label="Pit stop" value="Non obbligatori — fuel saving e double stint a discrezione del pilota" />
          <SpecRow label="Track Limits" value="Drive-Through automatico LMU — da scontare entro 3 giri dalla notifica" />
          <SpecRow label="Cambio pilota" value="Non consentito — Single Driver Only" />
        </div>
      </section>

      {/* ════ BLUE FLAG ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Codice Endurance VSD</div>
        <h2 className={styles.sectionTitle}>Precedenza tra classi</h2>
        <div className={styles.blueflagWrap}>
          <div className={styles.blueflagRule}>
            <div className={styles.blueflagTitle}>Gerarchia di precedenza</div>
            <div className={styles.precedenceRow}>
              <span className={`${styles.precedencePill} ${styles.pillHypercar}`}>Hypercar</span>
              <span className={styles.precedenceArrow}>›</span>
              <span className={`${styles.precedencePill} ${styles.pillLmp2}`}>LMP2</span>
              <span className={styles.precedenceArrow}>›</span>
              <span className={`${styles.precedencePill} ${styles.pillLmgt3}`}>LMGT3</span>
            </div>
          </div>
          <p className={styles.blueflagText}>
            Le categorie più lente hanno l'assoluta precedenza di traiettoria.
            Le auto di classe superiore hanno l'onere <strong>esclusivo</strong> di effettuare
            i sorpassi senza creare situazioni di rischio.
          </p>
          <p className={styles.blueflagText}>
            Le LMGT3 e LMP2 in fase di doppiaggio devono mantenere una linea prevedibile.
            I piloti delle classi più veloci devono preparare l'attacco e sorpassare nei
            rettilinei o nelle zone sicure, evitando manovre di dive bomb che
            compromettano l'aerodinamica avversaria.
          </p>
        </div>
      </section>

      {/* ════ CALENDARIO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Stagione 2026 · Start Settembre</div>
        <h2 className={styles.sectionTitle}>Calendario ufficiale</h2>
        <p className={styles.calendarNote}>
          Il campionato richiederà massima flessibilità sui setup per adattarsi
          all'evoluzione termica del Real Road.
        </p>
        <div className={styles.calendarGrid}>
          {CALENDAR.map(r => (
            <div key={r.round} className={styles.calendarCard}>
              <div className={styles.calendarRound}>{r.round}</div>
              <div className={styles.calendarCircuit}>
                {r.circuit}
                {r.location && <span className={styles.calendarLocation}> · {r.location}</span>}
              </div>
              <div className={styles.calendarMeta}>
                <span className={styles.calendarDate}>📅 {r.date}</span>
                <span className={styles.calendarTime}>🕐 {r.time} in-game</span>
              </div>
              <div className={styles.calendarWeather}>
                <span className={styles.weatherText}>{r.weather}</span>
                <span className={styles.weatherMult}>{r.multiplier}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ════ PUNTI ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Punteggio</div>
        <h2 className={styles.sectionTitle}>Sistema WEC — per classe</h2>
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
            <span className={styles.bonusBadge}>+1 pt Pole Position</span>
            <span className={styles.bonusBadge}>+1 pt Giro Più Veloce (top-10 di classe)</span>
          </div>
        </div>
      </section>

      {/* ════ CLASSIFICA ════ */}
      <StandingsSection />

      {/* ════ PROTESTE ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Direzione Gara</div>
        <h2 className={styles.sectionTitle}>Proteste</h2>
        <div className={styles.protestBox}>
          <div className={styles.protestRow}>
            <span className={styles.protestIcon}>💬</span>
            <span>Invia la protesta nel canale Discord dedicato entro <strong>48 ore</strong> dal termine della sessione</span>
          </div>
          <div className={styles.protestRow}>
            <span className={styles.protestIcon}>🎬</span>
            <span>Allega obbligatoriamente <strong>clip video</strong> (telemetria consigliata)</span>
          </div>
          <div className={styles.protestRow}>
            <span className={styles.protestIcon}>⚖️</span>
            <span>Le decisioni dello staff sono <strong>inappellabili</strong> e basate esclusivamente sui dati</span>
          </div>
          <div className={styles.protestRow}>
            <span className={styles.protestIcon}>📋</span>
            <span>L'iscrizione al campionato implica la piena accettazione del presente regolamento</span>
          </div>
        </div>
      </section>

      {/* ════ CTA ════ */}
      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>Pronto a correre?</h2>
        <p className={styles.ctaText}>
          Il campionato è aperto a tutti i piloti su Le Mans Ultimate.
          Iscrizioni tramite SimGrid — scegli la tua classe e scendi in pista.
        </p>
        <div className={styles.ctaActions}>
          {SIMGRID_URL ? (
            <a href={SIMGRID_URL} target="_blank" rel="noopener noreferrer"
              className={`${styles.btn} ${styles.btnPrimary}`}>
              Iscriviti ora
            </a>
          ) : (
            <span className={`${styles.btn} ${styles.btnDisabled}`}>
              Link SimGrid — prossimamente
            </span>
          )}
          <a href="https://discord.gg/hdt8uHEfsy" target="_blank" rel="noopener noreferrer"
            className={styles.btn}>
            Discord VSD
          </a>
        </div>
      </section>

    </div>
  );
}

// ════ CLASSIFICA ════

const CLASS_META = {
  Hypercar: { icon: '🔴', color: '#ef4444' },
  LMP2:     { icon: '🔵', color: 'var(--vsd-blue)' },
  LMGT3:    { icon: '🟠', color: 'var(--vsd-orange)' },
};

function StandingsSection() {
  const { data, isLoading } = useChampionshipStandings(UE144_CHAMPIONSHIP_ID);
  const { data: drivers } = useDrivers();
  const [selectedClass, setSelectedClass] = useState(null);

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
        <div className={styles.standingsEmpty}>
          <div className={styles.standingsEmptyIcon}>🏁</div>
          <div className={styles.standingsEmptyTitle}>Stagione in arrivo</div>
          <div className={styles.standingsEmptyText}>
            La classifica sarà disponibile dopo il Round 1 — Sebring, 13 Set 2026.
          </div>
        </div>
      )}

      {!isLoading && hasStandings && (
        <>
          {/* Class tabs */}
          {data.classes.length > 1 && (
            <div className={styles.standingsTabs}>
              {data.classes.map(c => {
                const meta = CLASS_META[c.class_name] || {};
                const isActive = activeClass?.class_name === c.class_name;
                return (
                  <button
                    key={c.class_name}
                    onClick={() => setSelectedClass(c.class_name)}
                    className={`${styles.standingsTab} ${isActive ? styles.standingsTabActive : ''}`}
                    style={isActive && meta.color ? { borderBottomColor: meta.color, color: meta.color } : {}}
                  >
                    {meta.icon} {c.class_name}
                    <span className={styles.standingsTabCount}>{c.standings.length}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Table */}
          {activeClass && (
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
          )}

          {/* Link alla pagina completa */}
          <div className={styles.standingsFooter}>
            <Link to={`/championships/${UE144_CHAMPIONSHIP_ID}`} className={styles.standingsDetailLink}>
              Classifica completa →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function DriverCell({ driver, driverInfo }) {
  if (driver.is_vsd && driverInfo) {
    return (
      <Link to={`/roster/${driverInfo.driver_id}`} className={styles.stDriverLink}>
        <Avatar name={driverInfo.display_name} driverId={driverInfo.driver_id} size={24} />
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
