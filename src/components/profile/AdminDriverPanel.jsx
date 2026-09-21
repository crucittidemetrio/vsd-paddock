import { useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAdminUpdateDriver, useAdminDeleteDriver } from '../../hooks/useRoster';
import { useBlobUpload } from '../../hooks/useBlobUpload';
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
 *
 * Avatar (#381, 21/09/2026, richiesto da Demetrio): prima l'UNICO modo
 * di impostare avatar_url era un edit diretto su Supabase — nessuna UI.
 * Scelta esplicita già in 002_roster_policies.sql/EditProfilePanel.jsx:
 * l'avatar resta gestito dallo STAFF, mai self-service — coerente qui,
 * upload disponibile solo in questo pannello (staff/admin), mai in
 * EditProfilePanel. Stesso pattern Vercel Blob già in produzione per
 * Social Manager e galleria foto Gare (#380), via useBlobUpload.
 */
export default function AdminDriverPanel({ driver }) {
  const { isStaff, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(driver?.status || DRIVER_STATUS.ACTIVE);
  const [isExVsd, setIsExVsd] = useState(!!(driver?.is_ex_vsd || driver?.removed_at));
  const [role, setRole] = useState(driver?.role || ROLES.DRIVER);
  const [avatarUrl, setAvatarUrl] = useState(driver?.avatar_url || null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const avatarInputRef = useRef(null);

  const { mutate: save, isPending, error, isSuccess } = useAdminUpdateDriver();
  const { mutate: doDelete, isPending: isDeleting, error: deleteError } = useAdminDeleteDriver();
  const { uploadFiles, uploading, progress, error: uploadError, setError: setUploadError } = useBlobUpload();

  if (!isStaff && !isAdmin) return null;
  if (driver?.is_system_account) return null;

  function handleOpen() {
    setStatus(driver?.status || DRIVER_STATUS.ACTIVE);
    setIsExVsd(!!(driver?.is_ex_vsd || driver?.removed_at));
    setRole(driver?.role || ROLES.DRIVER);
    setAvatarUrl(driver?.avatar_url || null);
    setConfirmDelete(false);
    setUploadError(null);
    setOpen(true);
  }

  async function handleAvatarChange(e) {
    const files = e.target.files;
    try {
      const results = await uploadFiles(files);
      if (results.length > 0) setAvatarUrl(results[0].url);
    } catch {
      // errore già in uploadError, mostrato sotto
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      driver_id: driver.driver_id,
      status,
      removed_at: isExVsd ? (driver?.removed_at || new Date().toISOString()) : null,
    };
    if (isAdmin && role !== driver?.role) payload.role = role;
    if (avatarUrl !== (driver?.avatar_url || null)) payload.avatar_url = avatarUrl;
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
          <label className="adp-label">Foto profilo</label>
          <div className="adp-avatar-row">
            <div className="adp-avatar-preview">
              {avatarUrl
                ? <img src={avatarUrl} alt="" className="adp-avatar-img" />
                : <span className="adp-avatar-placeholder">?</span>}
            </div>
            <div className="adp-avatar-actions">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarChange}
                disabled={uploading}
                className="adp-avatar-input"
                id="adp-avatar-input"
              />
              <label htmlFor="adp-avatar-input" className="adp-avatar-upload-btn">
                {uploading ? (progress || 'Caricamento…') : avatarUrl ? 'Cambia foto' : 'Carica foto'}
              </label>
              {avatarUrl && !uploading && (
                <button
                  type="button"
                  className="adp-avatar-remove-btn"
                  onClick={() => setAvatarUrl(null)}
                >
                  Rimuovi
                </button>
              )}
            </div>
          </div>
          {uploadError && <div className="adp-error">{uploadError}</div>}
        </div>

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
