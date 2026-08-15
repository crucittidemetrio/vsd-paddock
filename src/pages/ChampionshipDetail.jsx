import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useChampionshipStandings } from '../hooks/useChampionshipStandings';
import { useDrivers } from '../hooks/useRoster';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/shared/Avatar';
import SimBadge from '../components/shared/SimBadge';
import { useConsentedDriverPhoto } from '../hooks/useConsent';
import PointsProgressionChart from '../components/championship/PointsProgressionChart';
import { formatDate } from '../utils/format';
import { api } from '../api/client';
import { usePageMeta } from '../hooks/usePageMeta';
import styles from './ChampionshipDetail.module.css';

const STATUS_LABEL = {
  active: 'In corso',
  upcoming: 'Prossimamente',
  completed: 'Completato',
  draft: 'Bozza',
};

export default function ChampionshipDetail() {
  const { championshipId } = useParams();
  const { data, isLoading, error, refetch } = useChampionshipStandings(championshipId);
  const { data: drivers } = useDrivers();
  const { isStaff, driver: currentDriver } = useAuth();

  const [selectedClass, setSelectedClass] = useState(null);

  const champMeta = data?.championship;
  usePageMeta(champMeta ? {
    title: `${champMeta.name} — VSD Paddock`,
    description: `Classifica, round e risultati di ${champMeta.name}${champMeta.season ? ` (${champMeta.season})` : ''} — Virtual Sim-Driver.`,
  } : {});

  const driverMap = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  // Auto-select first class when data arrives
  const activeClass = useMemo(() => {
    if (!data?.classes?.length) return null;
    if (selectedClass) {
      return data.classes.find(c => c.class_name === selectedClass) || data.classes[0];
    }
    return data.classes[0];
  }, [data, selectedClass]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.skeleton} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorBox}>
          <h2>Errore</h2>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { championship, classes, rounds, points_configured } = data;
  const champion = activeClass?.standings?.[0];

  return (
    <div className={styles.container}>
      {/* HERO BANNER — se banner_url disponibile */}
      {championship.banner_url ? (
        <div className={styles.heroBanner}>
          <img
            src={championship.banner_url}
            alt={championship.name}
            className={styles.heroBannerImg}
          />
          <div className={styles.heroBannerOverlay}>
            <div className={styles.eyebrow}>Campionato</div>
            <h1 className={styles.heroTitle}>{championship.name}</h1>
            <div className={styles.heroMeta}>
              <SimBadge sim={championship.sim} size="sm" />
              <span className={styles.metaItem}>Stagione {championship.season}</span>
              <span className={styles.metaItem}>{STATUS_LABEL[championship.status] || championship.status}</span>
              {championship.format && (
                <span className={styles.metaItem}>{championship.format}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* HEADER standard — nessun banner */
        <header className={styles.header}>
          <div className={styles.eyebrow}>Campionato</div>
          <h1 className={styles.title}>{championship.name}</h1>
          <div className={styles.meta}>
            <SimBadge sim={championship.sim} size="sm" />
            <span className={styles.metaItem}>Stagione {championship.season}</span>
            <span className={styles.metaItem}>{STATUS_LABEL[championship.status] || championship.status}</span>
            {championship.format && (
              <span className={styles.metaItem}>{championship.format}</span>
            )}
          </div>
          {championship.notes && (
            <p className={styles.notes}>{championship.notes}</p>
          )}
        </header>
      )}

      {/* Banner se punti non configurati */}
      {!points_configured && rounds.length > 0 && (
        <div className={styles.warningBanner}>
          {data.source === 'computed'
            ? '⚠️ Nessun risultato di gara ancora disputato/importato. La classifica si popolerà automaticamente man mano che le gare vengono giocate e importate.'
            : '⚠️ Punti non configurati nel JSON importato. La classifica usa solo i tie-break (vittorie → podi → miglior piazzamento).'}
        </div>
      )}

      {/* Nessun round */}
      {rounds.length === 0 ? (
        <div className={styles.emptyBox}>
          <div className={styles.emptyIcon}>∅</div>
          <h2>Nessun round di campionato</h2>
          <p>
            Per popolare la classifica, tagga almeno una gara nel sheet con<br />
            <code>event_type=championship</code> e <code>championship_id={championshipId}</code>,<br />
            poi importa i risultati via <Link to="/admin/import-results">Importa risultati</Link>.
          </p>
        </div>
      ) : (
        <>
          {/* CHAMPION CARD (se completed) */}
          {championship.status === 'completed' && champion && (
            <div className={styles.championCard}>
              <div className={styles.championLabel}>🏆 Campione {activeClass.class_name}</div>
              <DriverDisplay
                driver={champion}
                driverInfo={driverMap[champion.driver_id]}
                size={48}
                emphasis
              />
              <div className={styles.championStats}>
                {champion.total_points} pts · {champion.wins} vittorie · {champion.podiums} podi
              </div>
            </div>
          )}

          {/* CLASS TABS */}
          {classes.length > 1 && (
            <div className={styles.classTabs}>
              {classes.map(c => (
                <button
                  key={c.class_name}
                  onClick={() => setSelectedClass(c.class_name)}
                  className={`${styles.classTab} ${activeClass?.class_name === c.class_name ? styles.classTabActive : ''}`}
                >
                  {c.class_name}
                  <span className={styles.classTabCount}>{c.standings.length}</span>
                </button>
              ))}
            </div>
          )}

          {/* STANDINGS TABLE */}
          {activeClass && (
            <section className={styles.standingsSection}>
              {classes.length === 1 && (
                <h2 className={styles.classHeading}>{activeClass.class_name}</h2>
              )}
              <div className={styles.tableWrap}>
                <table className={styles.standingsTable}>
                  <thead>
                    <tr>
                      <th className={styles.colPos}>#</th>
                      <th>Pilota</th>
                      <th className={styles.num}>Punti</th>
                      <th className={styles.num}>Gare</th>
                      <th className={styles.num}>W</th>
                      <th className={styles.num}>P</th>
                      <th className={styles.num}>Best</th>
                      <th className={styles.num}>DNF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeClass.standings.map(s => {
                      const podium = s.position <= 3;
                      const rowClass = [
                        s.is_vsd ? styles.rowVsd : '',
                        podium ? styles[`podium${s.position}`] : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <tr key={`${s.driver_id || s.driver_name_external}__${s.car_class}`} className={rowClass}>
                          <td className={styles.colPos}>
                            <span className={styles.posBadge}>{s.position}</span>
                          </td>
                          <td>
                            <DriverDisplay
                              driver={s}
                              driverInfo={driverMap[s.driver_id]}
                              size={28}
                            />
                          </td>
                          <td className={styles.num}>
                            <strong>{s.total_points}</strong>
                          </td>
                          <td className={styles.num}>{s.races_count}</td>
                          <td className={styles.num}>{s.wins || '—'}</td>
                          <td className={styles.num}>{s.podiums || '—'}</td>
                          <td className={styles.num}>{s.best_finish ?? '—'}</td>
                          <td className={styles.num}>{s.dnfs || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ANDAMENTO PUNTI */}
          {activeClass && points_configured && (
            <PointsProgressionChart
              championshipId={championshipId}
              className={activeClass.class_name}
              currentDriverId={currentDriver?.driver_id}
            />
          )}

          {/* AGGIUSTAMENTI PUNTI — solo staff */}
          {isStaff && (
            <AdjustmentsPanel
              championshipId={championshipId}
              adjustments={data.adjustments || []}
              classes={classes}
              rounds={rounds}
              onSaved={refetch}
            />
          )}

          {/* ROUNDS */}
          <section className={styles.roundsSection}>
            <h2 className={styles.classHeading}>Round</h2>
            <RoundsList rounds={rounds} />
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Componente helper per renderizzare il pilota:
 * VSD → avatar + nome + badge + link al profilo
 * Esterno → solo nome
 */
function DriverDisplay({ driver, driverInfo, size = 28, emphasis = false }) {
  const isVsd = driver.is_vsd;
  const photoUrl = useConsentedDriverPhoto(driverInfo?.driver_id);

  if (isVsd && driverInfo) {
    return (
      <Link to={`/roster/${driverInfo.driver_id}`} className={styles.driverLink}>
        <Avatar
          name={driverInfo.display_name}
          driverId={driverInfo.driver_id}
          size={size}
          photoUrl={photoUrl}
        />
        <span className={emphasis ? styles.driverNameEmphasis : styles.driverName}>
          {driverInfo.display_name}
        </span>
        <span className={styles.vsdBadge}>VSD</span>
      </Link>
    );
  }

  return (
    <span className={styles.driverExternal}>
      {driver.display_name || driver.driver_name_external || 'Unknown'}
    </span>
  );
}

// ─── ROUNDS LIST (raggruppa Race 1 + Race 2 per round) ───────────────────────

function RoundsList({ rounds }) {
  // Raggruppa per numero round (o race_id se round non definito)
  const grouped = useMemo(() => {
    const map = new Map();
    rounds.forEach(r => {
      const key = r.round != null ? r.round : r.race_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    // Ordina le gare dentro ogni gruppo per race_number
    map.forEach(races => races.sort((a, b) => (a.race_number || 1) - (b.race_number || 1)));
    return [...map.entries()];
  }, [rounds]);

  const isMultiRace = rounds.some(r => r.race_number > 1);

  return (
    <div className={styles.roundsList}>
      {grouped.map(([key, races]) => {
        const first = races[0];
        const label = first.round ? `R${first.round}` : first.race_id;
        if (!isMultiRace || races.length === 1) {
          // Layout singola gara (originale)
          return (
            <Link key={key} to={`/race/${first.race_id}`} className={styles.roundCard}>
              <div className={styles.roundNum}>{label}</div>
              <div className={styles.roundInfo}>
                <div className={styles.roundName}>{first.race_name}</div>
                <div className={styles.roundMeta}>{formatDate(first.date)} · {first.status}</div>
              </div>
            </Link>
          );
        }
        // Layout multi-gara: card con Race 1 + Race 2
        return (
          <div key={key} className={styles.roundCardMulti}>
            <div className={styles.roundNum}>{label}</div>
            <div className={styles.roundMultiRaces}>
              {races.map(r => (
                <Link key={r.race_id} to={`/race/${r.race_id}`} className={styles.roundSubRace}>
                  <span className={styles.roundSubLabel}>Race {r.race_number}</span>
                  <span className={styles.roundSubName}>{r.race_name}</span>
                  <span className={styles.roundSubMeta}>{formatDate(r.date)} · {r.status}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ADJUSTMENTS PANEL (staff only) ───────────────────────────────────────────

const EMPTY_FORM = { driver_key: '', car_class: '', race_id: '', delta: '', reason: '' };

function AdjustmentsPanel({ championshipId, adjustments, classes, rounds, onSaved }) {
  const [list, setList]     = useState(adjustments);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  // Sincronizza se arriva nuova prop (dopo refetch)
  useState(() => { setList(adjustments); }, [adjustments]);

  // Driver unici dalle standings
  const driverOptions = useMemo(() => {
    const seen = new Set();
    const opts = [];
    classes.forEach(cls => {
      cls.standings.forEach(s => {
        const key = s.driver_id || s.driver_name_external || s.display_name;
        const label = `${s.display_name} (${cls.class_name})`;
        if (!seen.has(key + cls.class_name)) {
          seen.add(key + cls.class_name);
          opts.push({ key, label, car_class: cls.class_name });
        }
      });
    });
    return opts;
  }, [classes]);

  function handleDriverChange(e) {
    const val = e.target.value;
    const opt = driverOptions.find(o => o.key + '__' + o.car_class === val);
    setForm(f => ({ ...f, driver_key: opt?.key || '', car_class: opt?.car_class || '' }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.driver_key || !form.car_class || form.delta === '') return;
    const delta = Number(form.delta);
    if (isNaN(delta)) return;
    // Date.now() qui è sicuro: handleAdd gira solo dentro onSubmit (riga
    // ~430), mai durante il render. La regola react-hooks/purity non
    // distingue "chiamato nel corpo del componente durante il render" da
    // "chiamato dentro un event handler definito nel componente" — falso
    // positivo confermato, non una violazione reale.
    const newAdj = {
      // eslint-disable-next-line react-hooks/purity
      id: 'adj_' + Date.now(),
      driver_key: form.driver_key,
      car_class: form.car_class,
      race_id: form.race_id || null,
      delta,
      reason: form.reason || '',
    };
    const updated = [...list, newAdj];
    await save(updated);
    setForm(EMPTY_FORM);
  }

  async function handleRemove(id) {
    const updated = list.filter(a => a.id !== id);
    await save(updated);
  }

  async function save(updated) {
    setSaving(true);
    setMsg('');
    try {
      await api.championships.saveAdjustments({ championship_id: championshipId, adjustments: updated });
      setList(updated);
      setMsg('✓ Salvato');
      onSaved();
    } catch (err) {
      setMsg('❌ ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.adjPanel}>
      <h2 className={styles.adjTitle}>⚙️ Aggiustamenti punti <span className={styles.adjBadge}>STAFF</span></h2>

      {/* Lista aggiustamenti attivi */}
      {list.length > 0 && (
        <div className={styles.adjList}>
          {list.map(a => (
            <div key={a.id} className={styles.adjRow}>
              <span className={styles.adjDelta} style={{ color: a.delta >= 0 ? 'var(--vsd-cyan)' : 'var(--color-danger)' }}>
                {a.delta >= 0 ? '+' : ''}{a.delta}
              </span>
              <span className={styles.adjDriver}>{a.driver_key}</span>
              <span className={styles.adjClass}>{a.car_class}</span>
              {a.race_id && <span className={styles.adjRound}>{a.race_id}</span>}
              {a.reason && <span className={styles.adjReason}>{a.reason}</span>}
              <button className={styles.adjRemove} onClick={() => handleRemove(a.id)} title="Rimuovi">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Form aggiunta */}
      <form className={styles.adjForm} onSubmit={handleAdd}>
        <select
          className={styles.adjInput}
          value={form.driver_key + '__' + form.car_class}
          onChange={handleDriverChange}
          required
        >
          <option value="__">— Pilota —</option>
          {driverOptions.map(o => (
            <option key={o.key + o.car_class} value={o.key + '__' + o.car_class}>{o.label}</option>
          ))}
        </select>

        <select
          className={styles.adjInput}
          value={form.race_id}
          onChange={e => setForm(f => ({ ...f, race_id: e.target.value }))}
        >
          <option value="">Campionato (totale)</option>
          {rounds.map(r => (
            <option key={r.race_id} value={r.race_id}>
              {r.round ? `R${r.round}` : r.race_id} — {r.race_name}
            </option>
          ))}
        </select>

        <input
          className={styles.adjInput}
          type="number"
          placeholder="Δ punti (es. -5)"
          value={form.delta}
          onChange={e => setForm(f => ({ ...f, delta: e.target.value }))}
          required
        />

        <input
          className={styles.adjInput}
          type="text"
          placeholder="Motivazione (opzionale)"
          value={form.reason}
          onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
        />

        <button className={styles.adjSubmit} type="submit" disabled={saving}>
          {saving ? '…' : '+ Aggiungi'}
        </button>
      </form>

      {msg && <div className={styles.adjMsg}>{msg}</div>}
    </section>
  );
}