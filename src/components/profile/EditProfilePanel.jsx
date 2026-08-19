import { useState } from 'react';
import { useUpdateMyProfile } from '../../hooks/useRoster';
import './EditProfilePanel.css';

/**
 * EditProfilePanel — self-edit del proprio profilo: bio e Instagram.
 * Visibile SOLO sul proprio profilo (gate fatto dal chiamante,
 * DriverProfile.jsx). Niente upload avatar qui per scelta esplicita —
 * la foto profilo resta gestita manualmente dallo staff.
 */
export default function EditProfilePanel({ driver }) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(driver?.bio || '');
  const [instagram, setInstagram] = useState(driver?.instagram || '');
  const { mutate: save, isPending, error } = useUpdateMyProfile();
  const [success, setSuccess] = useState(false);

  function handleOpen() {
    setBio(driver?.bio || '');
    setInstagram(driver?.instagram || '');
    setSuccess(false);
    setEditing(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSuccess(false);
    save(
      { bio: bio.trim(), instagram: instagram.trim().replace(/^@/, '') },
      {
        onSuccess: () => {
          setSuccess(true);
          setEditing(false);
        },
      }
    );
  }

  if (!editing) {
    return (
      <div className="epp-section">
        <button type="button" className="epp-open-btn" onClick={handleOpen}>
          ✎ Modifica profilo
        </button>
        {success && <span className="epp-success">✓ Profilo aggiornato</span>}
      </div>
    );
  }

  return (
    <div className="epp-section">
      <div className="epp-header">
        <h2 className="epp-title">Modifica profilo</h2>
      </div>

      <form onSubmit={handleSubmit} className="epp-form">
        <div className="epp-field">
          <label className="epp-label" htmlFor="epp-bio">Bio</label>
          <textarea
            id="epp-bio"
            className="epp-textarea"
            value={bio}
            onChange={e => setBio(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Qualche riga su di te — sim preferiti, esperienza, obiettivi in griglia…"
          />
          <div className="epp-counter">{bio.length}/500</div>
        </div>

        <div className="epp-field">
          <label className="epp-label" htmlFor="epp-ig">Instagram</label>
          <div className="epp-ig-input">
            <span className="epp-ig-prefix">@</span>
            <input
              id="epp-ig"
              type="text"
              className="epp-input"
              value={instagram}
              onChange={e => setInstagram(e.target.value)}
              maxLength={60}
              placeholder="tuoprofilo"
            />
          </div>
        </div>

        {error && <div className="epp-error">Errore: {error.message}</div>}

        <div className="epp-actions">
          <button type="submit" className="epp-save-btn" disabled={isPending}>
            {isPending ? 'Salvataggio…' : 'Salva'}
          </button>
          <button
            type="button"
            className="epp-cancel-btn"
            onClick={() => setEditing(false)}
            disabled={isPending}
          >
            Annulla
          </button>
        </div>
      </form>
    </div>
  );
}
