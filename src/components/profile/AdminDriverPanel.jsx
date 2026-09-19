import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAdminUpdateDriver, useAdminDeleteDriver } from '../../hooks/useRoster';
import { ROLES, DRIVER_STATUS } from '../../utils/constants';
import './AdminDriverPanel.css';

/**
 * AdminDriverPanel — pannello gestione roster per staff/admin (NUOVO,
 * 19/09/2026). Chiude il gap segnalato da Demetrio: dopo il cutover
 * #329 il Roster leggeva da Supabase ma nessuna funzione scriveva
 * status/role/removed_at — l'unico modo era il vecchio Google Sheet,
 * non più sincronizzato. Visibile su QUALSIASI profilo (anche il
 * proprio) a chi ha isStaff/isAdmin come VIEWER — non va confuso con
 * EditProfilePanel (self-edit di bio/social, sempre attivo per
 * isOwnProfile, mai per status/role).
 *
 * role modificabile SOLO se il viewer è admin. Zona eliminazione
 * (hard-delete) visibile SOLO ad admin e SOLO su un pilota già
 * ex-VSD (removed_at valorizzato) — il backend ri-verifica sempre i
 * contributi reali prima di cancellare, questo pannello non si fida
 * di alcun controllo lato client.
 */
export default function AdminDriverPanel({ driver }) {
  const { isStaff, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(driver?.status || DRIVER_STATUS.ACTIVE);
  const [isExVsd, setIsExVsd] = useState(!!(driver?.is_ex_vsd || driver?.removed_at));
  const [role, setRole] = useState(driver?.role || ROLES.DRIVER);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { mutate: save, isPending, error, isSuccess } = useAdminUpdateDriver();
  const { mutate: doDelete, isPending: isDeleting, error: deleteError } = useAdminDeleteDriver();

  if (!isStaff && !isAdmin) return null;
  if (driver?.is_system_account) return null;

  function handleOpen() {
    setStatus(driver?.status || DRIVER_STATUS.ACTIVE);
    setIsExVsd(!!(driver?.is_ex_vsd || driver?.removed_at));
    setRole(driver?.role || ROLES.DRIVER);
    setConfirmDelete(false);
    setOpen(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      driver_id: driver.driver_id,
      status,
      removed_at: isExVsd ? (driver?.removed_at || new Date().toISOString()) : null,
    };
    if (isAdmin && role !== driver?.role) payload.role = role;
    save(payload, { onSuccess: () => setOpen(false) });
  }

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    doDelete(driver.driver_id, { onSuccess: () => setConfirmDelete(false) });
  }

  const wasExVsd = !!(driver?.is_ex_vsd || driver?.removed_at);

  if (!open) {
    return (
      <div className="adp-section">
        <button type="button" className="adp-open-btn" onClick={handleOpen}>
          🛠 Gestione roster (staff)
        </button>
        {isSuccess && <span className="adp-success">✓ Aggiornato</span>}
      </div>
    );
  }

  return (
    <div className="adp-section">
      <div className="adp-header">
        <h2 className="adp-title">Gestione roster — {driver.display_name}</h2>
      </div>

      <form onSubmit={handleSubmit} className="adp-form">
        <div className="adp-field">
          <label className="adp-label" htmlFor="adp-status">Status</label>
          <select
            id="adp-status"
            className="adp-select"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value={DRIVER_STATUS.ACTIVE}>Attivo</option>
            <option value={DRIVER_STATUS.TRIAL}>In prova</option>
            <option value={DRIVER_STATUS.INACTIVE}>Inattivo</option>
          </select>
        </div>

        <div className="adp-field">
          <label className="adp-checkbox-label">
            <input
              type="checkbox"
              checked={isExVsd}
              onChange={e => setIsExVsd(e.target.checked)}
            />
            Ex VSD (pilota rimosso dal team)
          </label>
        </div>

        {isAdmin && (
          <div className="adp-field">
            <label className="adp-label" htmlFor="adp-role">Ruolo</label>
            <select
              id="adp-role"
              className="adp-select"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value={ROLES.DRIVER}>Pilota</option>
              <option value={ROLES.STAFF}>Staff</option>
              <option value={ROLES.ADMIN}>Team Principal</option>
            </select>
          </div>
        )}

        {error && <div className="adp-error">Errore: {error.message}</div>}

        <div className="adp-actions">
          <button type="submit" className="adp-save-btn" disabled={isPending}>
            {isPending ? 'Salvataggio…' : 'Salva'}
          </button>
          <button
            type="button"
            className="adp-cancel-btn"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Annulla
          </button>
        </div>
      </form>

      {isAdmin && wasExVsd && (
        <div className="adp-danger-zone">
          <div className="adp-danger-title">Zona eliminazione</div>
          <p className="adp-danger-text">
            Elimina definitivamente questo profilo ex-VSD. Possibile SOLO se
            non ha mai generato tempi, risultati gara, RSVP o altri dati
            reali — il server ri-verifica sempre prima di procedere.
            Azione irreversibile.
          </p>
          {deleteError && <div className="adp-error">Errore: {deleteError.message}</div>}
          <button
            type="button"
            className={confirmDelete ? 'adp-delete-btn-confirm' : 'adp-delete-btn'}
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting
              ? 'Verifica in corso…'
              : confirmDelete
                ? '⚠ Conferma eliminazione definitiva'
                : '🗑 Elimina definitivamente'}
          </button>
        </div>
      )}
    </div>
  );
}
