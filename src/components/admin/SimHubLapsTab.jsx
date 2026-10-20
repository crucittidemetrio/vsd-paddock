import { useMemo, useState } from 'react';
import { useAutoLapInbox, useMapAutoLapName, useRejectAutoLap } from '../../hooks/useBestLaps';
import { useTracks, useCars } from '../../hooks/useLookups';
import styles from '../../pages/AdminBestLaps.module.css';

// Giri arrivati in automatico dal plugin SimHub (20/10/2026).
// Il server abbina da solo i nomi del gioco al catalogo quando è sicuro;
// qui lo staff abbina quelli rimasti in sospeso. Un abbinamento vale per
// sempre (alias) e riprocessa subito tutti i giri in attesa con quel nome.

const STATUS_LABEL = {
  unmapped: 'Da abbinare',
  imported: 'Personale ✓',
  not_pb: 'Non migliorativo',
  rejected: 'Scartato',
};

function trackLabel(t) {
  return [t.track_name, t.variant].filter(Boolean).join(' — ') || t.track_id;
}

function MapRow({ sim, kind, raw, count, onMap, busy }) {
  const [value, setValue] = useState('');
  const tracksQuery = useTracks(kind === 'track' ? sim : undefined);
  const carsQuery = useCars(kind === 'car' ? sim : undefined);
  const options = kind === 'track'
    ? (tracksQuery.data || []).map((t) => ({ id: t.track_id, label: trackLabel(t) }))
    : (carsQuery.data || []).map((c) => ({ id: c.car_id, label: c.car_name || c.car_id }));
  options.sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className={styles.pendingCard}>
      <div className={styles.pendingInfo}>
        <div><strong>{kind === 'track' ? '🏁 Pista' : '🚗 Auto'}</strong> · {sim}</div>
        <div><code>{raw}</code></div>
        <div className={styles.fieldHint}>{count} {count === 1 ? 'giro in attesa' : 'giri in attesa'}</div>
      </div>
      <div className={styles.pendingActions}>
        <select className={styles.select} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">— scegli dal catalogo {sim} —</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!value || busy}
          onClick={() => onMap({ sim, kind, raw, mapped_id: value })}
        >
          {busy ? 'Abbino…' : 'Abbina'}
        </button>
      </div>
    </div>
  );
}

export default function SimHubLapsTab() {
  const inboxQuery = useAutoLapInbox();
  const mapMutation = useMapAutoLapName();
  const rejectMutation = useRejectAutoLap();
  const [busyKey, setBusyKey] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const laps = useMemo(() => inboxQuery.data?.laps || [], [inboxQuery.data]);

  // nomi grezzi ancora da abbinare, raggruppati (sim, tipo, nome)
  const toMap = useMemo(() => {
    const m = new Map();
    laps.filter((l) => l.status === 'unmapped').forEach((l) => {
      if (!l.track_id) {
        const k = `${l.sim}|track|${l.raw_track.toLowerCase()}`;
        m.set(k, { sim: l.sim, kind: 'track', raw: l.raw_track, count: (m.get(k)?.count || 0) + 1 });
      }
      if (!l.car_id) {
        const k = `${l.sim}|car|${l.raw_car.toLowerCase()}`;
        m.set(k, { sim: l.sim, kind: 'car', raw: l.raw_car, count: (m.get(k)?.count || 0) + 1 });
      }
    });
    return Array.from(m.entries()).map(([key, v]) => ({ key, ...v }));
  }, [laps]);

  async function handleMap(payload) {
    const key = `${payload.sim}|${payload.kind}|${payload.raw.toLowerCase()}`;
    setBusyKey(key);
    setError('');
    setMessage('');
    try {
      const res = await mapMutation.mutateAsync(payload);
      setMessage(`Abbinato. Giri importati come personale: ${res?.imported ?? 0}, non migliorativi: ${res?.not_pb ?? 0}.`);
    } catch (e) {
      setError(e.message || 'Errore durante l\'abbinamento');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleReject(id) {
    if (!window.confirm('Scartare questo giro? Non verrà mai importato.')) return;
    setError('');
    try {
      await rejectMutation.mutateAsync(id);
    } catch (e) {
      setError(e.message || 'Errore');
    }
  }

  return (
    <section className={styles.listSection}>
      <h2 className={styles.sectionTitle}>Giri SimHub</h2>
      <p className={styles.headerMeta}>
        Giri inviati in automatico dal plugin SimHub dei piloti. Entra nei Best Laps solo il giro che
        migliora il personale del pilota su quella pista e auto. Se il nome del gioco non corrisponde
        al catalogo, abbinalo qui una volta sola: vale anche per i giri futuri.
      </p>

      {message && <div className={styles.headerMeta}>✅ {message}</div>}
      {error && <div className={styles.alertError}>❌ {error}</div>}
      {inboxQuery.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {inboxQuery.error && <div className={styles.errorBox}>Errore: {inboxQuery.error.message}</div>}

      {toMap.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>Da abbinare ({toMap.length})</h3>
          <div className={styles.pendingList}>
            {toMap.map((r) => (
              <MapRow key={r.key} {...r} onMap={handleMap} busy={busyKey === r.key} />
            ))}
          </div>
        </>
      )}

      <h3 className={styles.sectionTitle}>Ultimi giri ricevuti ({laps.length})</h3>
      {!inboxQuery.isLoading && laps.length === 0 && (
        <div className={styles.empty}>
          Nessun giro ancora. Appena un pilota usa il plugin con il suo token, i giri compaiono qui.
        </div>
      )}
      {laps.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr className={styles.tableHeaderRow}>
              <th>Data</th><th>Pilota</th><th>Sim</th><th>Pista</th><th>Auto</th><th>Tempo</th><th>Sessione</th><th>Esito</th><th />
            </tr>
          </thead>
          <tbody>
            {laps.slice(0, 100).map((l) => (
              <tr key={l.id} className={styles.tableRow}>
                <td>{new Date(l.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td className={styles.cellDriver}>{l.driver_name || l.driver_code}</td>
                <td>{l.sim}</td>
                <td title={l.raw_track}>{l.track_id || <em>{l.raw_track}</em>}</td>
                <td title={l.raw_car}>{l.car_id || <em>{l.raw_car}</em>}</td>
                <td className={styles.cellTime}>{l.lap_time_display}</td>
                <td>{l.session_type}</td>
                <td>{STATUS_LABEL[l.status] || l.status}</td>
                <td>
                  {l.status === 'unmapped' && (
                    <button type="button" className={styles.btnDelete} onClick={() => handleReject(l.id)}>Scarta</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
