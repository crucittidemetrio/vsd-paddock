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
  const [facebook, setFacebook] = useState(driver?.facebook || '');
  const [rosterTrack, setRosterTrack] = useState(driver?.roster_track || '');
  const { mutate: save, isPending, error } = useUpdateMyProfile();
  const [success, setSuccess] = useState(false);

  function handleOpen() {
    setBio(driver?.bio || '');
    setInstagram(driver?.instagram || '');
    setFacebook(driver?.facebook || '');
    setRosterTrack(driver?.roster_track || '');
    setSuccess(false);
    setEditing(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSuccess(false);
    const payload = {
      bio: bio.trim(),
      instagram: instagram.trim().replace(/^@/, ''),
      facebook: facebook.trim(),
    };
    // roster_track è un enum lato backend: mandarlo solo se l'utente ha
    // scelto un'opzione, altrimenti il backend lo scarta comunque ma
    // meglio non inviare stringa vuota inutilmente.
    if (rosterTrack) payload.roster_track = rosterTrack;
    save(payload, {
      onSuccess: () => {
        setSuccess(true);
        setEditing(false);
      },
    });
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
          <label className="epp-label">Percorso nel team</label>
          <div className="epp-track-options">
            <label className={`epp-track-option ${rosterTrack === 'competitivo' ? 'epp-track-option-active' : ''}`}>
              <input
                type="radio"
                name="epp-roster-track"
                value="competitivo"
                checked={rosterTrack === 'competitivo'}
                onChange={() => setRosterTrack('competitivo')}
              />
              <span className="epp-track-label">🏆 Roster Competitivo</span>
              <span className="epp-track-desc">Campionati, allenamento strutturato, categorie di rating</span>
            </label>
            <label className={`epp-track-option ${rosterTrack === 'amatoriale' ? 'epp-track-option-active' : ''}`}>
              <input
                type="radio"
                name="epp-roster-track"
                value="amatoriale"
                checked={rosterTrack === 'amatoriale'}
                onChange={() => setRosterTrack('amatoriale')}
              />
              <span className="epp-track-label">🎮 Roster Amatoriale</span>
              <span className="epp-track-desc">Sessioni in compagnia, senza pressione del risultato</span>
            </label>
          </div>
          {!rosterTrack && (
            <div className="epp-track-hint">Non ancora dichiarato — scegli il percorso in cui ti riconosci.</div>
          )}
        </div>

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

        <div className="epp-field">
          <label className="epp-label" htmlFor="epp-fb">Facebook</label>
          <input
            id="epp-fb"
            type="text"
            className="epp-input"
            value={facebook}
            onChange={e => setFacebook(e.target.value)}
            maxLength={200}
            placeholder="Link al profilo o nome pagina"
          />
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
