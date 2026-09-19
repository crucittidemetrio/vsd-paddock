import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAvailableSlots, useAdminCreateDriver } from '../../hooks/useRoster';
import { ROLES, DRIVER_STATUS, SIM_LIST } from '../../utils/constants';
import './AddDriverPanel.css';

/**
 * AddDriverPanel — form "Aggiungi pilota" per staff/admin (NUOVO,
 * 19/09/2026). Chiude il gap segnalato da Demetrio: non esisteva
 * ALCUN modo di aggiungere un pilota nuovo dal sito — il login
 * Discord collega solo un driver GIÀ esistente (vedi
 * 005_link_discord_signup.sql), non ne crea mai uno.
 *
 * Il pannello mostra il prossimo driver_code libero (riusando i
 * buchi lasciati da un hard-delete) e i numeri gara già assegnati,
 * così Demetrio non deve più tenerne traccia a mente — richiesta
 * esplicita sua ("un sistema automatico che mi dica quali
 * race_number e quali driver_id siano disponibili").
 */
export default function AddDriverPanel() {
  const { isStaff, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [driverCode, setDriverCode] = useState('');
  const [raceNumber, setRaceNumber] = useState('');
  const [status, setStatus] = useState(DRIVER_STATUS.TRIAL);
  const [role, setRole] = useState(ROLES.DRIVER);
  const [sims, setSims] = useState([]);

  const { data: slots, isLoading: slotsLoading } = useAvailableSlots(open);
  const { mutate: create, isPending, error, isSuccess, reset } = useAdminCreateDriver();

  const usedRaceNumbers = new Set(slots?.used_race_numbers || []);
  const raceNumberTaken = raceNumber !== '' && usedRaceNumbers.has(Number(raceNumber));

  useEffect(() => {
    if (open && slots?.next_driver_code && !driverCode) {
      setDriverCode(slots.next_driver_code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slots]);

  if (!isStaff && !isAdmin) return null;

  function handleOpen() {
    setDisplayName('');
    setDriverCode('');
    setRaceNumber('');
    setStatus(DRIVER_STATUS.TRIAL);
    setRole(ROLES.DRIVER);
    setSims([]);
    reset();
    setOpen(true);
  }

  function toggleSim(id) {
    setSims(cur => cur.includes(id) ? cur.filter(s => s !== id) : [...cur, id]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (raceNumberTaken) return;
    const payload = {
      display_name: displayName.trim(),
      status,
      preferred_sims: sims,
    };
    if (driverCode.trim()) payload.driver_id = driverCode.trim();
    if (raceNumber !== '') payload.race_number = raceNumber;
    if (isAdmin && role !== ROLES.DRIVER) payload.role = role;
    create(payload, { onSuccess: () => setOpen(false) });
  }

  if (!open) {
    return (
      <div className="adnp-section">
        <button type="button" className="adnp-open-btn" onClick={handleOpen}>
          ➕ Aggiungi pilota
        </button>
        {isSuccess && <span className="adnp-success">✓ Pilota aggiunto</span>}
      </div>
    );
  }

  return (
    <div className="adnp-section">
      <div className="adnp-header">
        <h2 className="adnp-title">Aggiungi pilota</h2>
      </div>

      <form onSubmit={handleSubmit} className="adnp-form">
        <div className="adnp-field">
          <label className="adnp-label" htmlFor="adnp-name">Nome visualizzato *</label>
          <input
            id="adnp-name"
            className="adnp-input"
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="es. Mario R."
            required
          />
        </div>

        <div className="adnp-field">
          <label className="adnp-label" htmlFor="adnp-code">Driver code</label>
          <input
            id="adnp-code"
            className="adnp-input"
            type="text"
            value={driverCode}
            onChange={e => setDriverCode(e.target.value.toUpperCase())}
            placeholder={slotsLoading ? 'Calcolo…' : 'VSD0XX'}
          />
          {!slotsLoading && slots?.free_driver_codes?.length > 0 && (
            <div className="adnp-hint">
              Liberi (ex piloti eliminati): {slots.free_driver_codes.join(', ')}
            </div>
          )}
        </div>

        <div className="adnp-field">
          <label className="adnp-label" htmlFor="adnp-race-number">Numero gara</label>
          <input
            id="adnp-race-number"
            className="adnp-input"
            type="number"
            min="0"
            value={raceNumber}
            onChange={e => setRaceNumber(e.target.value)}
            placeholder="es. 42"
          />
          {raceNumberTaken && (
            <div className="adnp-hint adnp-hint-error">Numero già assegnato a un altro pilota</div>
          )}
          {!slotsLoading && !raceNumberTaken && slots?.free_race_numbers_sample?.length > 0 && (
            <div className="adnp-hint">
              Liberi (1-99): {slots.free_race_numbers_sample.join(', ')}…
            </div>
          )}
        </div>

        <div className="adnp-field">
          <label className="adnp-label" htmlFor="adnp-status">Status</label>
          <select
            id="adnp-status"
            className="adnp-select"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value={DRIVER_STATUS.TRIAL}>In prova</option>
            <option value={DRIVER_STATUS.ACTIVE}>Attivo</option>
            <option value={DRIVER_STATUS.INACTIVE}>Inattivo</option>
          </select>
        </div>

        <div className="adnp-field">
          <div className="adnp-label">Sim preferite</div>
          <div className="adnp-sim-pills">
            {SIM_LIST.map(s => (
              <button
                type="button"
                key={s.id}
                className={`adnp-sim-pill${sims.includes(s.id) ? ' is-active' : ''}`}
                onClick={() => toggleSim(s.id)}
              >
                {s.short}
              </button>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="adnp-field">
            <label className="adnp-label" htmlFor="adnp-role">Ruolo</label>
            <select
              id="adnp-role"
              className="adnp-select"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value={ROLES.DRIVER}>Pilota</option>
              <option value={ROLES.STAFF}>Staff</option>
              <option value={ROLES.ADMIN}>Team Principal</option>
            </select>
          </div>
        )}

        {error && <div className="adnp-error">Errore: {error.message}</div>}

        <div className="adnp-actions">
          <button type="submit" className="adnp-save-btn" disabled={isPending || !displayName.trim() || raceNumberTaken}>
            {isPending ? 'Creazione…' : 'Crea pilota'}
          </button>
          <button
            type="button"
            className="adnp-cancel-btn"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Annulla
          </button>
        </div>
      </form>
    </div>
  );
}
