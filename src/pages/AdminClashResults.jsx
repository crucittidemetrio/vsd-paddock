import { useState, useEffect, useMemo } from 'react';
import {
  useClashParticipants,
  useClashSubmitRoundResults,
  useClashIncidents,
} from '../hooks/useClashOfClasses';
import styles from './AdminClashResults.module.css';

const ROUNDS = [
  { round: 1, label: 'Round 1 — Silverstone' },
  { round: 2, label: 'Round 2 — Imola' },
  { round: 3, label: 'Round 3 — Spa-Francorchamps' },
];

function emptyRowFromParticipant(p) {
  return {
    participant_id: p.participant_id,
    driver_id: p.driver_id || '',
    display_name: p.display_name,
    class: p.class,
    excluded: false,
    finish_position_class: '',
    finish_position_overall: '',
    pole_class: false,
    fastest_lap_class: false,
    finisher: true,
    dnf: false,
  };
}

export default function AdminClashResults() {
  const [tab, setTab] = useState('results');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Clash of Classes — Gestione evento</h1>
        <p className={styles.subtitle}>Inserimento risultati per round e revisione segnalazioni incidenti.</p>
      </header>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'results' ? styles.tabActive : ''}`}
          onClick={() => setTab('results')}
        >
          Risultati
        </button>
        <button
          className={`${styles.tab} ${tab === 'incidents' ? styles.tabActive : ''}`}
          onClick={() => setTab('incidents')}
        >
          Segnalazioni incidenti
        </button>
      </div>

      {tab === 'results' ? <ResultsTab /> : <IncidentsTab />}
    </div>
  );
}

function ResultsTab() {
  const [round, setRound] = useState(1);
  const { data: participantsData, isLoading: loadingParticipants } = useClashParticipants();
  const submitMutation = useClashSubmitRoundResults();
  const [rows, setRows] = useState([]);
  const [feedback, setFeedback] = useState(null);

  const participants = useMemo(
    () => (participantsData?.participants || []).filter(p => p.status !== 'withdrawn'),
    [participantsData]
  );

  // Ricostruisce le righe editabili quando cambiano round o partecipanti.
  // Sync intenzionale stato-locale-da-server (form editabile derivato),
  // non un side-effect esterno — vedi pattern analoghi già accettati nel
  // repo (es. AdminEnduranceForm, AuthContext).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(participants.map(emptyRowFromParticipant));
    setFeedback(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, participants.length]);

  function updateRow(participantId, patch) {
    setRows(prev => prev.map(r => (r.participant_id === participantId ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setFeedback(null);
    const results = rows
      .filter(r => !r.excluded)
      .map(r => ({
        driver_id: r.driver_id || undefined,
        display_name: r.display_name,
        class: r.class,
        finish_position_class: r.finish_position_class === '' ? null : Number(r.finish_position_class),
        finish_position_overall: r.finish_position_overall === '' ? null : Number(r.finish_position_overall),
        pole_class: !!r.pole_class,
        fastest_lap_class: !!r.fastest_lap_class,
        finisher: !!r.finisher,
        dnf: !!r.dnf,
      }));

    if (results.length === 0) {
      setFeedback({ ok: false, message: 'Nessuna riga da inviare (tutte escluse).' });
      return;
    }

    try {
      const res = await submitMutation.mutateAsync({ round, results });
      setFeedback({ ok: true, message: `Round ${round}: ${res.inserted} righe salvate.` });
    } catch (err) {
      setFeedback({ ok: false, message: err.message || 'Errore durante il salvataggio.' });
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.toolbar}>
        <label className={styles.label} htmlFor="admin-coc-round">Round</label>
        <select
          id="admin-coc-round"
          className={styles.select}
          value={round}
          onChange={e => setRound(Number(e.target.value))}
        >
          {ROUNDS.map(r => <option key={r.round} value={r.round}>{r.label}</option>)}
        </select>
        <span className={styles.hint}>
          Reinviare un round sostituisce interamente i risultati già salvati per quel round.
        </span>
      </div>

      {loadingParticipants && <p className={styles.hint}>Caricamento iscritti…</p>}

      {!loadingParticipants && rows.length === 0 && (
        <p className={styles.hint}>Nessun iscritto trovato. Vai su /clash-of-classes per registrarne.</p>
      )}

      {!loadingParticipants && rows.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Pilota</th>
                  <th>Classe</th>
                  <th>Pos. classe</th>
                  <th>Pos. assoluta</th>
                  <th>Pole</th>
                  <th>Giro veloce</th>
                  <th>Finisher</th>
                  <th>DNF</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.participant_id} className={r.excluded ? styles.rowExcluded : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.excluded}
                        onChange={e => updateRow(r.participant_id, { excluded: e.target.checked })}
                        title="Escludi (non ha corso questo round)"
                      />
                    </td>
                    <td>{r.display_name} <span className={styles.classBadge}>{r.class}</span></td>
                    <td>{r.class}</td>
                    <td>
                      <input
                        type="number" min="1" className={styles.numInput}
                        value={r.finish_position_class}
                        disabled={r.excluded}
                        onChange={e => updateRow(r.participant_id, { finish_position_class: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="1" className={styles.numInput}
                        value={r.finish_position_overall}
                        disabled={r.excluded}
                        onChange={e => updateRow(r.participant_id, { finish_position_overall: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox" checked={r.pole_class} disabled={r.excluded}
                        onChange={e => updateRow(r.participant_id, { pole_class: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox" checked={r.fastest_lap_class} disabled={r.excluded}
                        onChange={e => updateRow(r.participant_id, { fastest_lap_class: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox" checked={r.finisher} disabled={r.excluded}
                        onChange={e => updateRow(r.participant_id, { finisher: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox" checked={r.dnf} disabled={r.excluded}
                        onChange={e => updateRow(r.participant_id, { dnf: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Salvataggio…' : `Salva risultati Round ${round}`}
            </button>
          </div>

          {feedback && (
            <div className={feedback.ok ? styles.success : styles.error}>{feedback.message}</div>
          )}
        </>
      )}
    </section>
  );
}

function IncidentsTab() {
  const { data, isLoading, error } = useClashIncidents();
  const reports = data?.reports || [];

  return (
    <section className={styles.card}>
      {isLoading && <p className={styles.hint}>Caricamento segnalazioni…</p>}
      {error && <div className={styles.error}>{error.message}</div>}
      {!isLoading && reports.length === 0 && <p className={styles.hint}>Nessuna segnalazione ricevuta.</p>}

      {!isLoading && reports.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Round</th>
                <th>Segnalante</th>
                <th>Segnalato</th>
                <th>Descrizione</th>
                <th>Replay</th>
                <th>Inviata</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.report_id}>
                  <td>{r.round}</td>
                  <td>{r.reporting_name}</td>
                  <td>{r.reported_name}</td>
                  <td className={styles.descCell}>{r.description}</td>
                  <td>
                    {r.replay_url
                      ? <a href={r.replay_url} target="_blank" rel="noopener noreferrer">link</a>
                      : '—'}
                  </td>
                  <td>{new Date(r.submitted_at).toLocaleString('it-IT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
