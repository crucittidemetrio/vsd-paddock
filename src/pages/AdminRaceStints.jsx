import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  useStints,
  useAddStint,
  useUpdateStint,
  useRemoveStint,
} from '../hooks/useEnduranceStints';
import {
  useRaceCrews,
  useAddCrewMember,
  useRemoveCrewMember,
} from '../hooks/useRaceCrews';
import { useRaces } from '../hooks/useRaces';
import { useDrivers } from '../hooks/useRoster';
import { useNow } from '../hooks/useNow';
import Avatar from '../components/shared/Avatar';
import SwapPilotModal from '../components/race/SwapPilotModal';
import FuelPanel from '../components/fuel/FuelPanel';
import styles from './AdminRaceStints.module.css';

const TIRE_COMPOUNDS = ['soft', 'medium', 'hard', 'wet', 'intermediate'];
const STATUS_OPTIONS = [
  { value: 'planned',   label: 'Pianificato' },
  { value: 'active',    label: 'In corso' },
  { value: 'completed', label: 'Completato' },
  { value: 'aborted',   label: 'Abortito' },
];

export default function AdminRaceStints() {
  const { raceId } = useParams();
  const navigate = useNavigate();

  const { data: racesData } = useRaces();
  const { data: drivers = [] } = useDrivers();
  const { data: stintsResponse, isLoading, isError, error } = useStints(raceId);
  const { data: crews = [] } = useRaceCrews(raceId);

  const races = useMemo(() => {
    if (Array.isArray(racesData)) return racesData;
    return racesData?.races || [];
  }, [racesData]);

  const race = useMemo(() => races.find(r => r.race_id === raceId), [races, raceId]);
  const stints = useMemo(() => stintsResponse?.stints || [], [stintsResponse]);

  const driverById = useMemo(() => {
    const m = {};
    (drivers || []).forEach(d => { m[d.driver_id] = d; });
    return m;
  }, [drivers]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingStintId, setEditingStintId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [swappingStint, setSwappingStint] = useState(null);

  // Vetture distinte presenti su questa gara — unione di stint E roster
  // equipaggi: così i tab compaiono già assegnando i piloti al roster,
  // prima ancora di pianificare il primo stint. Con un solo equipaggio (o
  // dati pre-migration senza car_number, tutti '') il gruppo è unico e i
  // tab restano nascosti — nessun cambiamento visivo per le gare "normali".
  const carNumbers = useMemo(() => {
    const set = new Set([
      ...stints.map(s => String(s.car_number || '').trim()),
      ...crews.map(c => String(c.car_number || '').trim()),
    ]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [stints, crews]);
  const showCarTabs = carNumbers.length > 1;

  const [selectedCar, setSelectedCar] = useState('');
  const activeCar = showCarTabs
    ? (carNumbers.includes(selectedCar) ? selectedCar : carNumbers[0])
    : (carNumbers[0] || '');

  const visibleStints = useMemo(() => {
    if (!showCarTabs) return stints;
    return stints.filter(s => String(s.car_number || '').trim() === activeCar);
  }, [stints, showCarTabs, activeCar]);

  // Stint attualmente in corso per la vettura attiva (planned_start_time
  // <= adesso <= planned_end_time) — usato da FuelPanel per calcolare i
  // giri residui automaticamente invece di farli inserire a mano al
  // pilota. null se non c'è nessuno stint pianificato che copre l'orario
  // corrente (prima che la gara inizi, tra uno stint e l'altro, ecc.).
  const now = useNow(15000);
  const activeStint = useMemo(() => {
    return visibleStints.find(s => {
      const start = new Date(s.planned_start_time).getTime();
      const end = new Date(s.planned_end_time).getTime();
      return !isNaN(start) && !isNaN(end) && start <= now && now <= end;
    }) || null;
  }, [visibleStints, now]);

  const editingStint = useMemo(
    () => stints.find(s => s.stint_id === editingStintId) || null,
    [stints, editingStintId]
  );

  if (!raceId) {
    return <div className={styles.error}>Race ID mancante nell'URL.</div>;
  }

  if (isLoading) {
    return <div className={styles.loading}>Caricamento stint…</div>;
  }

  if (isError) {
    return (
      <div className={styles.error}>
        Errore caricamento stint: {error?.message || 'sconosciuto'}
      </div>
    );
  }

  // Default stint_order per nuovo stint — scopato alla vettura attiva:
  // ogni equipaggio ha la propria numerazione indipendente.
  const nextStintOrder = visibleStints.length === 0
    ? 1
    : Math.max(...visibleStints.map(s => Number(s.stint_order) || 0)) + 1;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>ADMIN — RACE STINTS</div>
          <h1 className={styles.title}>
            {race ? race.race_name : raceId}
          </h1>
          {race && (
            <div className={styles.subtitle}>
              {race.sim} · {race.date?.slice(0, 10)} · {stints.length} stint pianificati
            </div>
          )}
        </div>
        <button
          className={styles.backBtn}
          onClick={() => navigate(`/race/${raceId}`)}
        >
          ← Torna alla gara
        </button>
      </div>

      {actionError && (
        <div className={styles.alertError}>❌ {actionError}</div>
      )}

      {/* ════ EQUIPAGGI — assegna i piloti a una vettura prima di pianificare ════ */}
      <CrewPanel
        raceId={raceId}
        crews={crews}
        drivers={drivers}
        driverById={driverById}
        onError={setActionError}
      />

      {/* ════ TAB VETTURE — solo se la gara ha più equipaggi ════ */}
      {showCarTabs && (
        <div className={styles.tabs}>
          {carNumbers.map(cn => (
            <button
              key={cn || '—'}
              type="button"
              className={`${styles.tab} ${activeCar === cn ? styles.tabActive : ''}`}
              onClick={() => setSelectedCar(cn)}
            >
              Vettura #{cn || '—'}
            </button>
          ))}
        </div>
      )}

      {/* ════ CARBURANTE/ENERGIA — previsione live dal companion app ════ */}
      {activeCar && (
        <FuelPanel
          raceId={raceId}
          carNumber={activeCar}
          plannedEndTime={activeStint?.planned_end_time || null}
        />
      )}

      {/* ════ TABELLA STINT ════ */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            Stint pianificati{showCarTabs ? ` — Vettura #${activeCar || '—'}` : ''}
          </h2>
          <Link to={`/admin/race/${raceId}/stint-planner`} className={styles.addBtn}>
            ⚡ Pianifica automaticamente
          </Link>
          <button
            className={styles.addBtn}
            onClick={() => { setShowAddForm(v => !v); setActionError(null); }}
          >
            {showAddForm ? '× Annulla' : '+ Aggiungi stint'}
          </button>
        </div>

        {showAddForm && (
          <StintForm
            mode="add"
            initialValues={{
              race_id: raceId,
              car_number: activeCar,
              stint_order: nextStintOrder,
              status: 'planned',
            }}
            drivers={drivers}
            existingStints={stints}
            onSubmit={() => setShowAddForm(false)}
            onCancel={() => setShowAddForm(false)}
            onError={setActionError}
          />
        )}

        {visibleStints.length === 0 ? (
          <div className={styles.empty}>
            Nessuno stint pianificato. Click "+ Aggiungi stint" per iniziare.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.stintsTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pilota</th>
                  <th>Pianificato</th>
                  <th>Effettivo</th>
                  <th>Gomme</th>
                  <th>Pit</th>
                  <th>Stato</th>
                  <th>Note</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleStints.map(s => (
                  <StintRow
                    key={s.stint_id}
                    stint={s}
                    driver={driverById[s.driver_id]}
                    onEdit={() => { setEditingStintId(s.stint_id); setActionError(null); }}
                    onRemove={() => setActionError(null)}
                    onError={setActionError}
                    onSwap={(st) => { setSwappingStint(st); setActionError(null); }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ════ EDIT MODAL ════ */}
      {editingStint && (
        <div className={styles.modalBackdrop} onClick={() => setEditingStintId(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Modifica stint #{editingStint.stint_order}</h3>
              <button
                className={styles.closeBtn}
                onClick={() => setEditingStintId(null)}
              >×</button>
            </div>
            <StintForm
              mode="edit"
              initialValues={editingStint}
              drivers={drivers}
              existingStints={stints}
              onSubmit={() => setEditingStintId(null)}
              onCancel={() => setEditingStintId(null)}
              onError={setActionError}
            />
          </div>
        </div>
      )}

   <div className={styles.footnote}>
        <strong>Swap pilota in corso:</strong> chiudi lo stint attuale (status →
        "completato" con orari effettivi) e aggiungi un nuovo stint con il pilota
        sostituto. Re-numbering automatico.
      </div>

      {swappingStint && (
        <SwapPilotModal
          stint={swappingStint}
          raceId={raceId}
          drivers={drivers}
          getDriverName={(id) => driverById[id]?.display_name || id}
          onClose={() => setSwappingStint(null)}
          onSwapped={() => { setSwappingStint(null); setActionError(null); }}
        />
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// STINT FORM (riusato per add ed edit)
// ═══════════════════════════════════════════════════════════

function StintForm({ mode, initialValues, drivers, onSubmit, onCancel, onError }) {
  const addMutation = useAddStint();
  const updateMutation = useUpdateStint();

  const [form, setForm] = useState(() => ({
    car_number:           initialValues.car_number || '',
    driver_id:            initialValues.driver_id || '',
    stint_order:          initialValues.stint_order || 1,
    planned_start_time:   initialValues.planned_start_time || '',
    planned_end_time:     initialValues.planned_end_time || '',
    planned_duration_min: initialValues.planned_duration_min || '',
    actual_start_time:    initialValues.actual_start_time || '',
    actual_end_time:      initialValues.actual_end_time || '',
    actual_duration_min:  initialValues.actual_duration_min || '',
    tire_compound:        initialValues.tire_compound || '',
    pit_stop_at_end:      initialValues.pit_stop_at_end === 'TRUE' || initialValues.pit_stop_at_end === true,
    fuel_loaded_l:        initialValues.fuel_loaded_l || '',
    actual_laps:          initialValues.actual_laps || '',
    best_lap_ms:          initialValues.best_lap_ms || '',
    status:               initialValues.status || 'planned',
    notes:                initialValues.notes || '',
  }));

  function setField(name, value) {
    setForm(f => ({ ...f, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (!String(form.car_number || '').trim()) {
      onError('Numero di gara della vettura obbligatorio (es. "7").');
      return;
    }
    if (!form.driver_id) {
      onError('Seleziona un pilota.');
      return;
    }
    if (!form.stint_order || Number(form.stint_order) < 1) {
      onError('Stint order deve essere >= 1.');
      return;
    }

    const payload = {
      ...form,
      stint_order: Number(form.stint_order),
      pit_stop_at_end: form.pit_stop_at_end ? 'TRUE' : 'FALSE',
    };

    if (mode === 'add') {
      payload.race_id = initialValues.race_id;
      addMutation.mutate(payload, {
        onSuccess: () => onSubmit(),
        onError: (err) => onError(err?.message || 'Errore aggiunta stint'),
      });
    } else {
      payload.stint_id = initialValues.stint_id;
      payload.race_id = initialValues.race_id;
      updateMutation.mutate(payload, {
        onSuccess: () => onSubmit(),
        onError: (err) => onError(err?.message || 'Errore aggiornamento stint'),
      });
    }
  }

  const isBusy = addMutation.isPending || updateMutation.isPending;

  // Drivers selezionabili: attivi + trial.
  // In edit, includi sempre il pilota corrente dello stint anche se nel frattempo
  // è diventato inactive (es. archiviato), altrimenti il <select> cadrebbe su
  // "— Seleziona —" e al salvataggio azzererebbe il driver_id dello stint.
  const activeDrivers = useMemo(() => {
    const base = (drivers || []).filter(d => d.status === 'active' || d.status === 'trial');
    const current = initialValues.driver_id;
    if (current && !base.some(d => d.driver_id === current)) {
      const found = (drivers || []).find(d => d.driver_id === current);
      if (found) return [...base, found];
    }
    return base;
  }, [drivers, initialValues.driver_id]);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formGrid}>

        {/* Numero gara vettura */}
        <div className={styles.field}>
          <label>Numero gara vettura *</label>
          <input
            type="text"
            value={form.car_number}
            onChange={e => setField('car_number', e.target.value)}
            placeholder="es. 7"
            required
          />
        </div>

        {/* Pilota */}
        <div className={styles.field}>
          <label>Pilota *</label>
          <select
            value={form.driver_id}
            onChange={e => setField('driver_id', e.target.value)}
            required
          >
            <option value="">— Seleziona —</option>
            {activeDrivers.map(d => (
              <option key={d.driver_id} value={d.driver_id}>
                {d.display_name} ({d.driver_id}){d.status === 'inactive' ? ' — inattivo' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Stint order */}
        <div className={styles.field}>
          <label>Ordine stint *</label>
          <input
            type="number"
            min="1"
            value={form.stint_order}
            onChange={e => setField('stint_order', e.target.value)}
            required
          />
        </div>

        {/* Planned start */}
        <div className={styles.field}>
          <label>Inizio pianificato</label>
          <input
            type="datetime-local"
            value={form.planned_start_time?.slice(0, 16) || ''}
            onChange={e => setField('planned_start_time', e.target.value)}
          />
        </div>

        {/* Planned end */}
        <div className={styles.field}>
          <label>Fine pianificata</label>
          <input
            type="datetime-local"
            value={form.planned_end_time?.slice(0, 16) || ''}
            onChange={e => setField('planned_end_time', e.target.value)}
          />
        </div>

        {/* Planned duration */}
        <div className={styles.field}>
          <label>Durata pianificata (min)</label>
          <input
            type="number"
            min="0"
            value={form.planned_duration_min}
            onChange={e => setField('planned_duration_min', e.target.value)}
            placeholder="es. 90"
          />
        </div>

        {/* Tire compound */}
        <div className={styles.field}>
          <label>Gomme</label>
          <select
            value={form.tire_compound}
            onChange={e => setField('tire_compound', e.target.value)}
          >
            <option value="">—</option>
            {TIRE_COMPOUNDS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Pit stop */}
        <div className={styles.field}>
          <label>Pit stop a fine stint</label>
          <input
            type="checkbox"
            checked={form.pit_stop_at_end}
            onChange={e => setField('pit_stop_at_end', e.target.checked)}
          />
        </div>

        {/* Fuel */}
        <div className={styles.field}>
          <label>Carburante (L)</label>
          <input
            type="number"
            min="0"
            value={form.fuel_loaded_l}
            onChange={e => setField('fuel_loaded_l', e.target.value)}
            placeholder="opzionale"
          />
        </div>

        {/* Status */}
        <div className={styles.field}>
          <label>Stato</label>
          <select
            value={form.status}
            onChange={e => setField('status', e.target.value)}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Sezione "Risultati effettivi" — visibile solo in edit mode */}
        {mode === 'edit' && (
          <>
            <div className={styles.divider}>Risultati effettivi (post-gara)</div>

            <div className={styles.field}>
              <label>Inizio effettivo</label>
              <input
                type="datetime-local"
                value={form.actual_start_time?.slice(0, 16) || ''}
                onChange={e => setField('actual_start_time', e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label>Fine effettiva</label>
              <input
                type="datetime-local"
                value={form.actual_end_time?.slice(0, 16) || ''}
                onChange={e => setField('actual_end_time', e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label>Durata effettiva (min)</label>
              <input
                type="number"
                min="0"
                value={form.actual_duration_min}
                onChange={e => setField('actual_duration_min', e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label>Giri effettivi</label>
              <input
                type="number"
                min="0"
                value={form.actual_laps}
                onChange={e => setField('actual_laps', e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label>Best lap (ms)</label>
              <input
                type="number"
                min="0"
                value={form.best_lap_ms}
                onChange={e => setField('best_lap_ms', e.target.value)}
                placeholder="es. 103245"
              />
            </div>
          </>
        )}

        {/* Notes */}
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label>Note</label>
          <textarea
            rows="2"
            value={form.notes}
            onChange={e => setField('notes', e.target.value)}
            placeholder="Condizioni meteo, strategia, eventi rilevanti…"
          />
        </div>
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onCancel}
          disabled={isBusy}
        >
          Annulla
        </button>
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={isBusy}
        >
          {isBusy ? 'Salvataggio…' : (mode === 'add' ? 'Crea stint' : 'Salva modifiche')}
        </button>
      </div>
    </form>
  );
}


// ═══════════════════════════════════════════════════════════
// STINT ROW (riga tabella con azioni inline)
// ═══════════════════════════════════════════════════════════

function StintRow({ stint, driver, onEdit, onError, onSwap }) {
  const removeMutation = useRemoveStint();
  const canSwap = stint.status === 'planned' || stint.status === 'active';

  function handleRemove() {
    const label = driver?.display_name || stint.driver_id;
    const ok = window.confirm(
      `Eliminare lo stint #${stint.stint_order} di ${label}?\nGli stint successivi verranno re-numerati automaticamente.`
    );
    if (!ok) return;
   removeMutation.mutate({ stint_id: stint.stint_id, race_id: stint.race_id }, {
      onError: (err) => onError(err?.message || 'Errore rimozione stint'),
    });
  }

  const statusClass = `${styles.statusBadge} ${styles['status_' + stint.status]}`;

  return (
    <tr>
      <td className={styles.colOrder}>{stint.stint_order}</td>
      <td>
        {driver ? (
          <div className={styles.driverCell}>
            <Avatar name={driver.display_name} driverId={driver.driver_id} size={24} />
            <span>{driver.display_name}</span>
          </div>
        ) : stint.driver_id}
      </td>
      <td className={styles.timeCell}>
        {formatRange(stint.planned_start_time, stint.planned_end_time)}
      </td>
      <td className={styles.timeCell}>
        {stint.actual_start_time || stint.actual_end_time
          ? formatRange(stint.actual_start_time, stint.actual_end_time)
          : '—'}
      </td>
      <td>{stint.tire_compound || '—'}</td>
      <td>{(stint.pit_stop_at_end === 'TRUE' || stint.pit_stop_at_end === true) ? '✓' : '—'}</td>
      <td>
        <span className={statusClass}>
          {STATUS_OPTIONS.find(s => s.value === stint.status)?.label || stint.status}
        </span>
      </td>
      <td className={styles.notesCell}>
        {stint.notes ? (
          <span title={stint.notes}>{truncate(stint.notes, 30)}</span>
        ) : '—'}
      </td>
      <td className={styles.actionsCell}>
        <button
          className={styles.editBtn}
          onClick={onEdit}
          disabled={removeMutation.isPending}
          title="Modifica"
        >✎</button>
         {canSwap && (
          <button
            className={styles.swapBtn}
            onClick={() => onSwap(stint)}
            title="Sostituisci pilota (swap in corso gara)"
          >⇄</button>
        )}
        <button
          className={styles.removeBtn}
          onClick={handleRemove}
          disabled={removeMutation.isPending}
          title="Elimina"
        >×</button>
      </td>
    </tr>
  );
}


// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function formatRange(start, end) {
  if (!start && !end) return '—';
  const fmt = (iso) => {
    if (!iso) return '?';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };
  return `${fmt(start)} → ${fmt(end)}`;
}

function truncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}


// ═══════════════════════════════════════════════════════════
// EQUIPAGGI — assegna piloti a una vettura PRIMA di pianificare stint
// ═══════════════════════════════════════════════════════════

function CrewPanel({ raceId, crews, drivers, driverById, onError }) {
  const [carNumber, setCarNumber] = useState('');
  const [driverId, setDriverId] = useState('');
  const addMutation = useAddCrewMember();
  const removeMutation = useRemoveCrewMember();

  const grouped = useMemo(() => {
    const m = new Map();
    crews.forEach(c => {
      const key = String(c.car_number || '').trim();
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(c);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [crews]);

  // Attivi + trial, coerente col resto della pagina (StintForm)
  const selectableDrivers = useMemo(
    () => (drivers || []).filter(d => d.status === 'active' || d.status === 'trial'),
    [drivers]
  );

  function handleAdd(e) {
    e.preventDefault();
    if (!carNumber.trim()) return onError('Numero di gara della vettura obbligatorio.');
    if (!driverId) return onError('Seleziona un pilota.');

    addMutation.mutate(
      { race_id: raceId, car_number: carNumber.trim(), driver_id: driverId },
      {
        onSuccess: () => setDriverId(''),
        onError: (err) => onError(err?.message || 'Errore assegnazione pilota'),
      }
    );
  }

  function handleRemove(crew) {
    const label = driverById[crew.driver_id]?.display_name || crew.driver_id;
    const ok = window.confirm(`Rimuovere ${label} dalla vettura #${crew.car_number}?`);
    if (!ok) return;
    removeMutation.mutate(
      { crew_id: crew.crew_id, race_id: raceId },
      { onError: (err) => onError(err?.message || 'Errore rimozione pilota') }
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Equipaggi</h2>
      </div>

      {grouped.length > 0 && (
        <div className={styles.crewGroups}>
          {grouped.map(([cn, members]) => (
            <div key={cn || '—'} className={styles.crewGroup}>
              <div className={styles.crewGroupTitle}>Vettura #{cn || '—'}</div>
              <div className={styles.crewChips}>
                {members.map(c => (
                  <span key={c.crew_id} className={styles.crewChip}>
                    {driverById[c.driver_id]?.display_name || c.driver_id}
                    <button
                      type="button"
                      className={styles.crewChipRemove}
                      onClick={() => handleRemove(c)}
                      disabled={removeMutation.isPending}
                      title="Rimuovi"
                    >×</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <form className={styles.crewAddForm} onSubmit={handleAdd}>
        <input
          type="text"
          className={styles.crewAddInput}
          value={carNumber}
          onChange={e => setCarNumber(e.target.value)}
          placeholder="Numero gara (es. 7)"
        />
        <select
          className={styles.crewAddSelect}
          value={driverId}
          onChange={e => setDriverId(e.target.value)}
        >
          <option value="">— Seleziona pilota —</option>
          {selectableDrivers.map(d => (
            <option key={d.driver_id} value={d.driver_id}>{d.display_name}</option>
          ))}
        </select>
        <button type="submit" className={styles.addBtn} disabled={addMutation.isPending}>
          {addMutation.isPending ? '…' : '+ Assegna'}
        </button>
      </form>
    </section>
  );
}
