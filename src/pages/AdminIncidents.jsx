import { useState } from 'react';
import { useIncidents, useResolveIncident } from '../hooks/useIncidents';
import { SIM_LIST } from '../utils/constants';
import styles from './AdminIncidents.module.css';

const STATUSES = [
  { value: 'open', label: 'Aperti' },
  { value: 'reviewing', label: 'In revisione' },
  { value: 'closed', label: 'Chiusi' },
];

const PENALTY_TYPES = ['', 'warning', 'penalità lieve', 'penalità media', 'penalità pesante', 'squalifica', 'nessuna'];

function fmtDate(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(val);
  }
}

export default function AdminIncidents() {
  const [statusFilter, setStatusFilter] = useState('open');

  const query = useIncidents(statusFilter || undefined);
  const incidents = query.data || [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>STEWARD</div>
        <h1 className={styles.title}>Registro incidenti</h1>
        <p className={styles.sub}>
          Legge in sola lettura le segnalazioni del Modulo reclamo pubblico (invariato per i
          piloti) e affianca lo stato formalizzato dallo staff: aperto, in revisione, chiuso con
          penalità. Il "Giudizio DG" mostrato è il verdetto storico scritto a mano, resta come
          riferimento.
        </p>
      </header>

      <div className={styles.summaryRow}>
        <button
          type="button"
          className={`${styles.summaryChip} ${!statusFilter ? styles.summaryChipActive : ''}`}
          onClick={() => setStatusFilter('')}
        >
          Tutti
        </button>
        {STATUSES.map(s => (
          <button
            key={s.value}
            type="button"
            className={`${styles.summaryChip} ${statusFilter === s.value ? styles.summaryChipActive : ''}`}
            onClick={() => setStatusFilter(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {query.isLoading && <div className={styles.loading}>Caricamento…</div>}
      {query.error && <div className={styles.errorBox}>Errore: {query.error.message}</div>}

      {!query.isLoading && !query.error && (
        <div className={styles.list}>
          {incidents.length === 0 && (
            <div className={styles.empty}>Nessuna segnalazione in questa vista.</div>
          )}
          {incidents.map(inc => (
            <IncidentCard key={inc.complaint_key} incident={inc} />
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentCard({ incident: inc }) {
  const resolveMutation = useResolveIncident();
  const [status, setStatus] = useState(inc.status);
  const [penaltyType, setPenaltyType] = useState(inc.penalty_type || '');
  const [penaltyDetail, setPenaltyDetail] = useState(inc.penalty_detail || '');
  const [staffNotes, setStaffNotes] = useState(inc.staff_notes || '');
  const [evidenceUrl, setEvidenceUrl] = useState(inc.evidence_url || '');
  const [sim, setSim] = useState(inc.sim || '');
  // Default: se già riclassificato usa quello salvato, altrimenti assume
  // against_driver_id (caso tipico) SOLO se è un tesserato VSD noto —
  // resta comunque un campo esplicito e modificabile, non un'assunzione
  // silenziosa lato backend (vedi handleIncidentsResolve).
  const [penalizedDriverId, setPenalizedDriverId] = useState(
    inc.penalized_driver_id || inc.against_driver_id || ''
  );

  const dirty =
    status !== inc.status ||
    penaltyType !== (inc.penalty_type || '') ||
    penaltyDetail !== (inc.penalty_detail || '') ||
    staffNotes !== (inc.staff_notes || '') ||
    evidenceUrl !== (inc.evidence_url || '') ||
    sim !== (inc.sim || '') ||
    penalizedDriverId !== (inc.penalized_driver_id || inc.against_driver_id || '');

  // Opzioni "chi penalizzare" — solo i due piloti coinvolti in QUESTA
  // segnalazione, e solo se risolti a un driver_id reale (matchDriverName_
  // lato backend potrebbe non aver trovato una corrispondenza in roster).
  const penalizedOptions = [
    ...(inc.reporter_driver_id
      ? [{ value: inc.reporter_driver_id, label: inc.reporter_sim + ' (segnalante)' }]
      : []),
    ...(inc.against_driver_id
      ? [{ value: inc.against_driver_id, label: inc.against + ' (segnalato)' }]
      : []),
  ];

  function handleSave() {
    resolveMutation.mutate({
      complaint_key: inc.complaint_key,
      status,
      penalty_type: penaltyType,
      penalty_detail: penaltyDetail,
      staff_notes: staffNotes,
      evidence_url: evidenceUrl.trim(),
      sim,
      penalized_driver_id: penalizedDriverId,
    });
  }

  return (
    <div className={`${styles.card} ${styles['status_' + inc.status]}`}>
      <div className={styles.cardHead}>
        <span className={styles.driverName}>{inc.reporter_sim || '—'}</span>
        {inc.reporter_driver_id && <span className={styles.vsdTag}>VSD</span>}
        <span className={styles.arrow}>→</span>
        <span className={styles.driverName}>{inc.against || '—'}</span>
        {inc.against_driver_id && <span className={styles.vsdTag}>VSD</span>}
        {inc.incident_type && <span className={styles.typeTag}>{inc.incident_type}</span>}
      </div>

      <div className={styles.cardHead}>
        {inc.track && <span className={styles.meta}>{inc.track}</span>}
        {inc.lap && <span className={styles.meta}>giro {inc.lap}</span>}
        {inc.time_in_race && <span className={styles.meta}>{inc.time_in_race}</span>}
        {inc.race_date && <span className={styles.meta}>gara del {fmtDate(inc.race_date)}</span>}
      </div>

      {inc.description && <div className={styles.description}>{inc.description}</div>}

      {inc.verdict && (
        <div className={styles.verdictBox}>
          <div className={styles.verdictLabel}>Giudizio DG (storico)</div>
          <div className={styles.verdictText}>{inc.verdict}</div>
          {inc.verdict_en && <div className={styles.verdictText}>{inc.verdict_en}</div>}
        </div>
      )}

      <div className={styles.resolveGrid}>
        <select
          className={styles.select}
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          {STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={penaltyType}
          onChange={e => setPenaltyType(e.target.value)}
        >
          {PENALTY_TYPES.map(p => (
            <option key={p} value={p}>{p || 'Penalità: nessuna scelta'}</option>
          ))}
        </select>
        <input
          type="text"
          className={styles.input}
          placeholder="Dettaglio penalità (es. +5s)"
          value={penaltyDetail}
          onChange={e => setPenaltyDetail(e.target.value)}
        />
        <select
          className={styles.select}
          value={sim}
          onChange={e => setSim(e.target.value)}
          title="Sim in cui è avvenuto — serve per sapere in quale classifica sottrarre i Punti Penalità"
        >
          <option value="">Sim: non specificato</option>
          {SIM_LIST.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={penalizedDriverId}
          onChange={e => setPenalizedDriverId(e.target.value)}
          title="Chi riceve la penalità — non è automatico, un reclamo può anche essere respinto"
          disabled={penalizedOptions.length === 0}
        >
          <option value="">Penalizza: nessuno</option>
          {penalizedOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {penaltyType && penaltyType !== 'nessuna' && (!sim || !penalizedDriverId) && (
        <div className={styles.errorBox}>
          Penalità selezionata ma sim e/o pilota penalizzato non impostati — non contribuirà ai
          Punti Penalità finché non li compili entrambi.
        </div>
      )}
      <textarea
        className={styles.textarea}
        placeholder="Note staff…"
        value={staffNotes}
        onChange={e => setStaffNotes(e.target.value)}
        rows={2}
      />
      <input
        type="url"
        className={styles.input}
        placeholder="Link prova (clip Twitch/YouTube/Discord) — visibile ai piloti coinvolti, non è una nota interna"
        value={evidenceUrl}
        onChange={e => setEvidenceUrl(e.target.value)}
      />

      <div className={styles.footer}>
        <span className={styles.resolvedMeta}>
          {inc.formalized
            ? `Aggiornato ${fmtDate(inc.resolved_at)}`
            : 'Non ancora formalizzato'}
        </span>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!dirty || resolveMutation.isPending}
        >
          {resolveMutation.isPending ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    </div>
  );
}
