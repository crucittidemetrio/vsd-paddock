import { Link } from 'react-router-dom';
import styles from './UE144.module.css';

// ── Dati campionato ────────────────────────────────────────
const SIMGRID_URL = null; // sostituire con il link reale

const CLASSES = [
  {
    id: 'hypercar',
    label: 'Hypercar',
    color: 'red',
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
    ],
  },
  {
    id: 'lmp2',
    label: 'LMP2',
    color: 'blue',
    icon: '🔵',
    cars: ['Oreca 07-Gibson'],
  },
  {
    id: 'lmgt3',
    label: 'LMGT3',
    color: 'orange',
    icon: '🟠',
    cars: [
      'Ferrari 296 GT3',
      'Porsche 911 GT3 R',
      'Corvette Z06 GT3.R',
      'Ford Mustang GT3',
      'BMW M4 GT3',
      'McLaren 720S GT3 Evo',
      'Aston Martin Vantage GT3',
    ],
  },
];

const POINTS = [
  { pos: 1, pts: 25 }, { pos: 2, pts: 18 }, { pos: 3, pts: 15 },
  { pos: 4, pts: 12 }, { pos: 5, pts: 10 }, { pos: 6, pts: 8 },
  { pos: 7, pts: 6 },  { pos: 8, pts: 4 },  { pos: 9, pts: 2 },
  { pos: 10, pts: 1 },
];

// ── Componente principale ──────────────────────────────────
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
          <span className={styles.heroBadge}>📅 4–6 round</span>
        </div>
        <div className={styles.heroActions}>
          {SIMGRID_URL ? (
            <a
              href={SIMGRID_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              Iscriviti su SimGrid
            </a>
          ) : (
            <span className={`${styles.btn} ${styles.btnDisabled}`}>
              Iscrizioni — prossimamente
            </span>
          )}
          <a
            href="/docs/ue144/ue144_regolamento.docx"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btn}
          >
            📄 Regolamento
          </a>
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
                <span className={styles.classLabel}>{cls.label}</span>
              </div>
              <ul className={styles.carList}>
                {cls.cars.map(car => (
                  <li key={car} className={styles.carItem}>{car}</li>
                ))}
              </ul>
              {cls.id === 'lmp2' && (
                <p className={styles.classNote}>Vettura unica — massima parità</p>
              )}
              {cls.id === 'lmgt3' && (
                <p className={styles.classNote}>⚠ Lista soggetta ad aggiornamento DLC</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ════ FORMATO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Formato</div>
        <h2 className={styles.sectionTitle}>Struttura della sessione</h2>
        <div className={styles.formatGrid}>
          <FormatCard
            label="Practice"
            value="30'"
            detail="Open — accesso libero"
            icon="⏱"
          />
          <FormatCard
            label="Qualifiche"
            value="15'"
            detail="Private Mode"
            icon="🔒"
          />
          <FormatCard
            label="Gara"
            value="144'"
            detail="Rolling Start"
            icon="🏁"
            accent
          />
        </div>

        <div className={styles.specGrid}>
          <SpecRow label="Pista" value="Dynamic Track attivo — rubber-in progressivo" />
          <SpecRow label="Carburante" value="Virtual Energy Tank attivo" />
          <SpecRow label="Danni" value="60%" />
          <SpecRow label="Track Limits" value="Drive-Through automatico da LMU — da scontare entro 3 giri" />
          <SpecRow label="Cambio pilota" value="Non consentito — Single Driver Only" />
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

      {/* ════ CTA ════ */}
      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>Pronto a correre?</h2>
        <p className={styles.ctaText}>
          Il campionato è aperto a tutti i piloti su Le Mans Ultimate.
          Iscrizioni tramite SimGrid — scegli la tua classe e scendi in pista.
        </p>
        <div className={styles.ctaActions}>
          {SIMGRID_URL ? (
            <a
              href={SIMGRID_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              Iscriviti ora
            </a>
          ) : (
            <span className={`${styles.btn} ${styles.btnDisabled}`}>
              Link SimGrid — prossimamente
            </span>
          )}
          <a
            href="https://discord.gg/hdt8uHEfsy"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btn}
          >
            Discord VSD
          </a>
        </div>
      </section>

    </div>
  );
}

// ── Sottocomponenti ────────────────────────────────────────
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
