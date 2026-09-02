import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePitwallBridge } from '../hooks/usePitwallBridge';
import { usePitwallSessions, usePitwallSession } from '../hooks/usePitwallSessions';
import styles from './PitWall.module.css';

// 0=test,1-4=practice,5-8=qual,9=warmup,10-13=race — stessa convenzione
// già documentata in vsd-pitwall-bridge/Program.cs.
const SESSION_LABELS = {
  0: 'Test',
  1: 'Prove Libere', 2: 'Prove Libere', 3: 'Prove Libere', 4: 'Prove Libere',
  5: 'Qualifica', 6: 'Qualifica', 7: 'Qualifica', 8: 'Qualifica',
  9: 'Warm Up',
  10: 'Gara', 11: 'Gara', 12: 'Gara', 13: 'Gara',
};

const FINISH_LABELS = { 1: 'FINITO', 2: 'RITIRATO', 3: 'SQUALIFICATO' };

function sessionLabel(code) {
  return SESSION_LABELS[code] ?? `Sessione ${code}`;
}

function fmtLapTime(seconds) {
  // -1 (o 0/assente) e' il sentinel "nessun tempo ancora" osservato nei
  // dati reali (vedi vsd-pitwall-bridge/README.md) — non un tempo valido.
  if (seconds == null || seconds <= 0) return '—';
  const totalMs = Math.round(seconds * 1000);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function fmtGap(v) {
  if (v.place === 1) return '—';
  if (v.lapsBehindLeader > 0) return `+${v.lapsBehindLeader} gir${v.lapsBehindLeader === 1 ? 'o' : 'i'}`;
  if (v.timeBehindLeader > 0) return `+${v.timeBehindLeader.toFixed(3)}s`;
  return '—';
}

function fmtInterval(v) {
  if (v.place === 1) return '—';
  if (v.timeBehindNext > 0) return `+${v.timeBehindNext.toFixed(3)}s`;
  return '—';
}

// Settore 3 non è un campo diretto dello Scoring buffer (solo S1/S2 lo
// sono) — si ricava per differenza dal tempo sul giro. Usiamo il giro
// MIGLIORE (bestLapTime/bestLapSector1/2), non l'ultimo giro completato:
// vedi nota sopra ClassificaTable sul perché. Stimato, non un dato
// riportato a parte dal gioco: se mancano i pezzi torna null invece di un
// numero inventato.
function estimatedSector3(v) {
  if (v.bestLapTime == null || v.bestLapTime <= 0) return null;
  if (v.bestLapSector1 == null || v.bestLapSector1 <= 0) return null;
  if (v.bestLapSector2 == null || v.bestLapSector2 <= 0) return null;
  return v.bestLapTime - v.bestLapSector1 - v.bestLapSector2;
}

// Viola = miglior tempo di settore di TUTTA la sessione (qualunque pilota,
// qualunque giro) — stesso significato "purple sector" delle schermate F1.
// Verde = miglior tempo di settore personale del pilota stesso, ma non il
// migliore assoluto. Nessun colore = né l'uno né l'altro.
function sectorClass(value, sessionBest, styles) {
  if (value == null || value <= 0) return undefined;
  if (sessionBest != null && value <= sessionBest + 0.0005) return styles.sectorPurple;
  return styles.sectorGreen;
}

// Le sessioni registrate arrivano dal backend in millisecondi (stessa
// convenzione lap_time_ms di BestLaps/LapData) — il live feed invece manda
// secondi grezzi dallo Scoring buffer, da cui fmtLapTime() sopra.
function fmtLapTimeMs(ms) {
  if (ms == null || ms <= 0) return '—';
  return fmtLapTime(ms / 1000);
}

function fmtCapturedAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function PitWall() {
  usePageMeta({
    title: 'Pit Wall — Virtual Sim Driver',
    description: 'Classifica live, gap e stato pit in tempo reale da Le Mans Ultimate.',
  });

  const { status, payload } = usePitwallBridge();
  const vehicles = useMemo(() => payload?.vehicles ?? [], [payload]);

  const classes = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.vClass).filter(Boolean))),
    [vehicles]
  );
  const [classFilter, setClassFilter] = useState('');

  const rows = useMemo(() => {
    if (!classFilter) return vehicles;
    return vehicles.filter((v) => v.vClass === classFilter);
  }, [vehicles, classFilter]);

  return (
    <div className={styles.pageWrap}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>PIT WALL</div>
          <h1 className={styles.title}>Pit Wall</h1>
          <p className={styles.sub}>
            Classifica, gap e stato pit in tempo reale — richiede il VSD Pitwall Bridge
            attivo su questo stesso PC (funziona solo in locale, non è un servizio cloud).
          </p>
          <Link to="/carburante-energia" className={styles.fuelLink}>
            ⛽ Vedi anche il pannello Carburante/Energia (consumo, stint) →
          </Link>
        </header>

        <StatusBanner status={status} />

        {payload && (
          <>
            <SessionInfo payload={payload} />
            {classes.length > 1 && (
              <section className={styles.selectorRow}>
                <label className={styles.selectorLabel}>Classe</label>
                <select
                  className={styles.select}
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="">Tutte</option>
                  {classes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </section>
            )}
            <ClassificaTable rows={rows} />
            <MyCarPanel myCar={payload.myCar} />
          </>
        )}

        {!payload && status === 'connected' && (
          <div className={styles.hint}>Connesso al bridge, in attesa dei primi dati da LMU...</div>
        )}

        <SessionsHistory />
      </div>
    </div>
  );
}

/**
 * SessionsHistory — sessioni passate registrate dal bridge a fine sessione
 * (best lap di ogni pilota in griglia, vedi apps-script/PitwallSessions.js).
 * Dato "grezzo" separato dal Muro dei Record: nessuna promozione automatica
 * a record ufficiale, solo storico di quello che è successo in pista.
 */
function SessionsHistory() {
  const sessionsQuery = usePitwallSessions();
  const [selectedId, setSelectedId] = useState('');
  const detailQuery = usePitwallSession(selectedId);

  const sessions = sessionsQuery.data?.sessions || [];

  if (sessionsQuery.isLoading) return null; // niente skeleton, non è il contenuto principale della pagina
  if (sessions.length === 0) return null; // ancora nessuna sessione registrata: niente da mostrare

  return (
    <section className={styles.panel}>
      <div className={styles.panelTitle}>Sessioni registrate</div>
      <div className={styles.selectorRow}>
        <label className={styles.selectorLabel}>Sessione</label>
        <select
          className={styles.select}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">— Seleziona —</option>
          {sessions.map((s) => (
            <option key={s.session_id} value={s.session_id}>
              {fmtCapturedAt(s.captured_at)} — {s.track_name || '?'} · {sessionLabel(s.session_type)} · {s.driver_count} piloti
            </option>
          ))}
        </select>
      </div>

      {selectedId && detailQuery.isLoading && (
        <div className={styles.hint}>Caricamento classifica...</div>
      )}

      {selectedId && detailQuery.data && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pos</th>
                <th>Pilota</th>
                <th>Vettura</th>
                <th>Classe</th>
                <th>Giri</th>
                <th>Miglior giro</th>
              </tr>
            </thead>
            <tbody>
              {detailQuery.data.drivers.map((d, i) => (
                <tr key={`${d.driver_id || d.driver_name_external}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{d.driver_name_external || '—'}</td>
                  <td>{d.vehicle_name || '—'}</td>
                  <td>{d.vehicle_class || '—'}</td>
                  <td>{d.laps_completed}</td>
                  <td>{fmtLapTimeMs(d.best_lap_time_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// "La tua vettura" — carburante e gomme, dato letto dal Telemetry buffer
// (separato dallo Scoring buffer usato per la classifica). Affidabile SOLO
// per la vettura di chi lancia il bridge: se sei in sessione ma non stai
// guidando (spettatore), myCar è null dal backend e il pannello non si
// mostra — non è un bug, è il limite noto del gioco (vedi
// vsd-pitwall-bridge/RF2Telemetry.cs).
function MyCarPanel({ myCar }) {
  if (!myCar) return null;

  const fuelPct =
    myCar.fuelL != null && myCar.fuelCapacityL
      ? Math.round((myCar.fuelL / myCar.fuelCapacityL) * 100)
      : null;

  return (
    <section className={styles.panel}>
      <div className={styles.panelTitle}>La tua vettura</div>
      <p className={styles.hint} style={{ marginBottom: 10 }}>
        Solo per chi guida — il gioco garantisce questi dati solo per la vettura del giocatore locale.
        Le "zone" danno sono un conteggio, non una mappa (il gioco non documenta quale zona è quale punto dell'auto).
      </p>
      <div className={styles.sessionGrid}>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Carburante</span>
          <span className={styles.sessionValue}>
            {myCar.fuelL != null ? myCar.fuelL.toFixed(1) : '—'}
            {myCar.fuelCapacityL != null ? ` / ${myCar.fuelCapacityL.toFixed(0)} L` : ' L'}
            {fuelPct != null ? ` (${fuelPct}%)` : ''}
          </span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Acqua motore</span>
          <span className={styles.sessionValue}>
            {myCar.engineWaterTempC != null ? myCar.engineWaterTempC.toFixed(0) : '—'}°C
          </span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Olio motore</span>
          <span className={styles.sessionValue}>
            {myCar.engineOilTempC != null ? myCar.engineOilTempC.toFixed(0) : '—'}°C
          </span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Danni</span>
          <span className={styles.sessionValue}>
            {myCar.dentedZones > 0 ? `${myCar.dentedZones}/8 zone` : 'Nessuno'}
          </span>
        </div>
      </div>

      {(myCar.overheating || myCar.bodyDetached || myCar.dentedZones > 0 || myCar.lastImpactMagnitude != null) && (
        <div className={styles.tireWarning} style={{ marginTop: 4 }}>
          {myCar.overheating && 'MOTORE IN SURRISCALDAMENTO  '}
          {myCar.bodyDetached && 'CARROZZERIA DANNEGGIATA  '}
          {myCar.dentedZones > 0 &&
            `DANNI: ${myCar.dentedZones}/8 zone (gravità max ${myCar.maxDentSeverity})  `}
          {myCar.lastImpactMagnitude != null &&
            `ULTIMO URTO: magnitudo ${myCar.lastImpactMagnitude.toFixed(1)}${
              myCar.lastImpactSecondsAgo != null ? `, ${Math.round(myCar.lastImpactSecondsAgo)}s fa` : ''
            }`}
        </div>
      )}

      <div className={styles.tireGrid}>
        {myCar.tires.map((t) => (
          <div key={t.pos} className={styles.tireCard}>
            <div className={styles.tireLabel}>{t.pos}</div>
            <div className={styles.tireRow}>
              <span>Pressione</span>
              <span>{t.pressureKpa != null ? `${t.pressureKpa.toFixed(0)} kPa` : '—'}</span>
            </div>
            <div className={styles.tireRow}>
              <span>Usura</span>
              <span>{t.wearPct != null ? `${t.wearPct}%` : '—'}</span>
            </div>
            <div className={styles.tireRow}>
              <span>Freno</span>
              <span>{t.brakeTempC != null ? `${t.brakeTempC.toFixed(0)}°C` : '—'}</span>
            </div>
            <div className={styles.tireRow}>
              <span>Temp. (sx/centro/dx)</span>
              <span>
                {[t.tempLeftC, t.tempCenterC, t.tempRightC]
                  .map((v) => (v != null ? v.toFixed(0) : '—'))
                  .join('/')}
                °C
              </span>
            </div>
            {(t.flat || t.detached) && (
              <div className={styles.tireWarning}>
                {t.flat ? 'FORATA ' : ''}
                {t.detached ? 'STACCATA' : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusBanner({ status }) {
  if (status === 'connected') return null; // niente banner quando tutto ok
  const label = status === 'connecting' ? 'Connessione al bridge...' : 'Bridge non raggiungibile';
  return (
    <div className={styles.statusBanner} data-status={status}>
      <span className={styles.statusDot} data-status={status} />
      <span>
        {label} — avvia <code>dotnet run -c Release</code> nella cartella{' '}
        <code>vsd-pitwall-bridge/</code> su questo PC, con LMU già in sessione.
      </span>
    </div>
  );
}

function SessionInfo({ payload }) {
  const yellow = payload.yellowFlagState !== 0;
  // mRaining e' una frazione 0..1 per convenzione rF2 — non ancora
  // confermata con pioggia reale in sessione di test (vedi bridge README).
  const rainingPct = payload.raining > 0 ? Math.round(payload.raining * 100) : 0;

  return (
    <section className={styles.panel}>
      <div className={styles.sessionGrid}>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Pista</span>
          <span className={styles.sessionValue}>{payload.track || '—'}</span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Sessione</span>
          <span className={styles.sessionValue}>{sessionLabel(payload.session)}</span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Bandiera</span>
          <span className={`${styles.sessionValue} ${yellow ? styles.flagYellow : styles.flagGreen}`}>
            {yellow ? 'GIALLA' : 'VERDE'}
          </span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Asfalto</span>
          <span className={styles.sessionValue}>{payload.trackTemp?.toFixed(1)}°C</span>
        </div>
        <div className={styles.sessionItem}>
          <span className={styles.sessionLabel}>Aria</span>
          <span className={styles.sessionValue}>{payload.ambientTemp?.toFixed(1)}°C</span>
        </div>
        {rainingPct > 0 && (
          <div className={styles.sessionItem}>
            <span className={styles.sessionLabel}>Pioggia</span>
            <span className={styles.sessionValue}>{rainingPct}%</span>
          </div>
        )}
      </div>
    </section>
  );
}

function ClassificaTable({ rows }) {
  // Miglior tempo di settore dell'intera sessione (tutti i piloti nel
  // filtro classe corrente) — ricalcolato ad ogni render, costo
  // trascurabile per una griglia di poche decine di vetture.
  //
  // Usiamo bestLapSector1/2 (settori DEL giro migliore, campo mBestLapSector1/2
  // — vedi RF2Scoring.cs) invece di bestSector1/2 ("miglior settore mai segnato,
  // non per forza nello stesso giro"). Con lastSector1/2 (giro appena
  // completato) il viola compariva solo nell'istante esatto in cui un pilota
  // migliorava il record e spariva al giro successivo — osservato dal vivo
  // il 02/09: "non vedo mai viola". Il settore del giro migliore invece resta
  // stabile finché il record non viene battuto da qualcun altro, come nelle
  // schermate F1/WEC.
  const sessionBestS1 = useMemo(() => {
    const vals = rows.map((v) => v.bestLapSector1).filter((t) => t != null && t > 0);
    return vals.length ? Math.min(...vals) : null;
  }, [rows]);
  const sessionBestS2 = useMemo(() => {
    const vals = rows.map((v) => v.bestLapSector2).filter((t) => t != null && t > 0);
    return vals.length ? Math.min(...vals) : null;
  }, [rows]);

  return (
    <section className={styles.panel}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Pilota</th>
              <th>Vettura</th>
              <th>Classe</th>
              <th>Giri</th>
              <th>Gap Leader</th>
              <th>Intervallo</th>
              <th>S1</th>
              <th>S2</th>
              <th>S3*</th>
              <th>Ultimo</th>
              <th>Miglior</th>
              <th>Pit</th>
              <th>Pen.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const s3 = estimatedSector3(v);
              const rowClass = [v.inPits && styles.rowInPits, v.underYellow && styles.rowUnderYellow]
                .filter(Boolean)
                .join(' ') || undefined;
              return (
                <tr key={v.id} className={rowClass}>
                  <td>
                    {v.place}
                    {FINISH_LABELS[v.finishStatus] && (
                      <span className={styles.finishTag}> {FINISH_LABELS[v.finishStatus]}</span>
                    )}
                  </td>
                  <td>{v.driver || '—'}</td>
                  <td className={styles.truncate} title={v.vehicle || undefined}>{v.vehicle || '—'}</td>
                  <td>{v.vClass || '—'}</td>
                  <td>{v.laps}</td>
                  <td>{fmtGap(v)}</td>
                  <td>{fmtInterval(v)}</td>
                  <td className={sectorClass(v.bestLapSector1, sessionBestS1, styles)}>
                    {v.bestLapSector1 > 0 ? v.bestLapSector1.toFixed(3) : '—'}
                  </td>
                  <td className={sectorClass(v.bestLapSector2, sessionBestS2, styles)}>
                    {v.bestLapSector2 > 0 ? v.bestLapSector2.toFixed(3) : '—'}
                  </td>
                  <td>{s3 != null && s3 > 0 ? s3.toFixed(3) : '—'}</td>
                  <td>{fmtLapTime(v.lastLapTime)}</td>
                  <td>{fmtLapTime(v.bestLapTime)}</td>
                  <td>{v.inPits ? <span className={styles.pitBadge}>BOX</span> : ''}</td>
                  <td>{v.numPenalties > 0 ? v.numPenalties : ''}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className={styles.hint}>Nessuna vettura in classifica.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className={styles.hint} style={{ marginTop: 8 }}>
        S1/S2/S3 sono i settori del giro migliore di ciascun pilota (stesso giro di "Miglior").
        Viola = record assoluto della sessione, verde = record personale.
        *S3 stimato (giro − S1 − S2), non riportato a parte dal gioco.
        Riga con bordo giallo a sinistra = quel pilota è sotto bandiera gialla in questo momento
        (per vettura, non "gialla ovunque in pista" — dato diretto dal gioco).
      </p>
    </section>
  );
}
