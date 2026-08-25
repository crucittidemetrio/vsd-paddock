import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useInterestList, useInterestRegister, useInterestUpdate } from '../../hooks/useChampionshipInterest';
// Riuso deliberato del CSS module di ACI LMGT3 Challenge (stesso file
// importato da AciLmgt3Challenge.jsx ed EraSeason3.jsx) — contiene già
// le classi form/registrationLayout/countCard copiate da ClashOfClasses,
// così questo componente resta visivamente coerente con entrambe le
// pagine che lo montano senza duplicare CSS.
import styles from '../../pages/AciLmgt3Challenge.module.css';

const ALREADY_REGISTERED_ERROR = 'Ti sei già segnalato per questo campionato';

/**
 * Manifestazione di interesse per un campionato ESTERNO (VSD non lo
 * organizza — es. ACI LMGT3 Challenge, ERA Season 3). A differenza del
 * form di iscrizione di Clash of Classes (evento organizzato DA VSD,
 * con griglia reale), questo NON è l'iscrizione ufficiale: raccoglie
 * solo un segnale interno — "chi del team ci prova/partecipa" — utile
 * allo staff per seguire l'andamento fin da subito. Il link al canale
 * ufficiale (officialUrl) resta sempre l'unico modo per essere
 * davvero in griglia.
 *
 * Categoria e vettura: il pilota può indicarle subito, oppure tornare
 * in seguito e ripetere l'invio per aggiornarle — per i piloti VSD
 * loggati, un secondo invio su una segnalazione già esistente non dà
 * errore ma aggiorna categoria/vettura/discord della riga esistente
 * (interest.update, vedi apps-script/ChampionshipInterest.js). Per chi
 * si segnala da anonimo (senza login) questo non è possibile: un
 * secondo invio resta un duplicato rifiutato, come prima.
 *
 * @param {Object} props
 * @param {string} props.championshipKey - chiave dominio backend (es. 'aci-lmgt3-challenge-2026')
 * @param {string} [props.anchorId] - id sezione per link #ancora dall'hero
 * @param {string} [props.eyebrow]
 * @param {string} [props.title]
 * @param {string} props.introText - spiega cosa fa il form
 * @param {string} [props.categoryLabel] - etichetta del select categoria (es. "Classe")
 * @param {string[]} [props.categories] - opzioni categoria; se assente/1 elemento il selettore non viene mostrato
 * @param {string} [props.vehicleLabel] - etichetta del campo vettura (es. "Vettura", "Modello vettura")
 * @param {Object.<string,string[]>} [props.vehiclesByCategory] - modelli per categoria; se la categoria scelta non ha una lista, il campo diventa testo libero
 * @param {string} props.officialUrl - link all'iscrizione ufficiale esterna
 * @param {string} props.officialLabel - testo del bottone verso l'iscrizione ufficiale
 * @param {string} props.disclaimerText - testo esplicito "questa non è l'iscrizione ufficiale"
 */
export default function ChampionshipInterestSection({
  championshipKey,
  anchorId = 'interesse',
  eyebrow = 'Ci provi anche tu?',
  title = 'Facci sapere che ci sei',
  introText,
  categoryLabel = 'Categoria',
  categories,
  vehicleLabel = 'Vettura',
  vehiclesByCategory,
  officialUrl,
  officialLabel = 'Iscrizione ufficiale',
  disclaimerText,
}) {
  const { driver, isVsdPilot } = useAuth();
  const { data, isLoading } = useInterestList(championshipKey);
  const registerMutation = useInterestRegister(championshipKey);
  const updateMutation = useInterestUpdate(championshipKey);

  const hasCategoryChoice = Array.isArray(categories) && categories.length > 1;
  const fixedCategory = Array.isArray(categories) && categories.length === 1 ? categories[0] : '';

  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState(fixedCategory);
  const [vehicle, setVehicle] = useState('');
  const [discordHandle, setDiscordHandle] = useState('');
  const [feedback, setFeedback] = useState(null);

  const interests = data?.interests || [];
  const count = data?.count ?? 0;

  const effectiveCategory = category || fixedCategory;
  const vehicleOptions = (vehiclesByCategory && vehiclesByCategory[effectiveCategory]) || null;

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    const name = isVsdPilot ? (driver?.display_name || displayName) : displayName;
    if (!name?.trim()) {
      setFeedback({ ok: false, message: 'Inserisci un nome.' });
      return;
    }
    const payload = {
      display_name: name.trim(),
      category: effectiveCategory,
      vehicle: vehicle,
      discord_handle: discordHandle.trim(),
    };
    try {
      await registerMutation.mutateAsync(payload);
      setFeedback({ ok: true, message: 'Segnalazione registrata — grazie!' });
      setDisplayName('');
      setDiscordHandle('');
    } catch (err) {
      // Un pilota VSD loggato che invia di nuovo su una segnalazione già
      // esistente non deve vedersi rifiutata la richiesta: è il modo in
      // cui aggiunge/corregge categoria e vettura "in seguito".
      if (isVsdPilot && err.message === ALREADY_REGISTERED_ERROR) {
        try {
          await updateMutation.mutateAsync({
            category: effectiveCategory,
            vehicle: vehicle,
            discord_handle: discordHandle.trim(),
          });
          setFeedback({ ok: true, message: 'Segnalazione aggiornata — grazie!' });
        } catch (err2) {
          setFeedback({ ok: false, message: err2.message || 'Errore durante l’aggiornamento.' });
        }
        return;
      }
      setFeedback({ ok: false, message: err.message || 'Errore durante l’invio.' });
    }
  }

  return (
    <section id={anchorId} className={styles.section}>
      <div className={styles.sectionEyebrow}>{eyebrow}</div>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {introText && <p className={styles.prequalIntro}>{introText}</p>}

      {disclaimerText && (
        <p className={styles.formNote}>
          ⚠️ {disclaimerText}
          {officialUrl && (
            <>
              {' '}
              <a href={officialUrl} target="_blank" rel="noopener noreferrer" className={styles.disclaimerLink}>
                {officialLabel} ↗
              </a>
            </>
          )}
        </p>
      )}

      <div className={styles.registrationLayout} style={{ marginTop: 20 }}>
        <form className={styles.form} onSubmit={handleSubmit}>
          {!isVsdPilot && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${anchorId}-name`}>Nome pilota</label>
              <input
                id={`${anchorId}-name`}
                type="text"
                className={styles.input}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Nome e cognome o nickname"
                maxLength={80}
                required
              />
            </div>
          )}
          {isVsdPilot && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Pilota</label>
              <div className={styles.formStaticValue}>{driver?.display_name} (roster VSD)</div>
            </div>
          )}

          {hasCategoryChoice && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${anchorId}-category`}>
                {categoryLabel} (opzionale)
              </label>
              <select
                id={`${anchorId}-category`}
                className={styles.select}
                value={category}
                onChange={e => { setCategory(e.target.value); setVehicle(''); }}
              >
                <option value="">Nessuna preferenza</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor={`${anchorId}-vehicle`}>
              {vehicleLabel} (opzionale)
            </label>
            {vehicleOptions && vehicleOptions.length > 0 ? (
              <select
                id={`${anchorId}-vehicle`}
                className={styles.select}
                value={vehicle}
                onChange={e => setVehicle(e.target.value)}
              >
                <option value="">Nessuna preferenza</option>
                {vehicleOptions.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                id={`${anchorId}-vehicle`}
                type="text"
                className={styles.input}
                value={vehicle}
                onChange={e => setVehicle(e.target.value)}
                placeholder="Es. modello e classe, se già scelti"
                maxLength={80}
              />
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor={`${anchorId}-discord`}>Discord (opzionale)</label>
            <input
              id={`${anchorId}-discord`}
              type="text"
              className={styles.input}
              value={discordHandle}
              onChange={e => setDiscordHandle(e.target.value)}
              placeholder="username#0000"
              maxLength={60}
            />
          </div>

          {isVsdPilot && (
            <p className={styles.formHint}>
              Non hai ancora scelto categoria/vettura? Puoi inviare ora e tornare in seguito per aggiornarle.
            </p>
          )}

          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={registerMutation.isPending || updateMutation.isPending}
          >
            {(registerMutation.isPending || updateMutation.isPending) ? 'Invio…' : 'Segnala la tua partecipazione'}
          </button>

          {feedback && (
            <div className={feedback.ok ? styles.formSuccess : styles.formError}>
              {feedback.message}
            </div>
          )}
        </form>

        <div className={styles.registrationCounts}>
          <div className={styles.countCard}>
            <div className={styles.countValue}>{isLoading ? '—' : count}</div>
            <div className={styles.countLabel}>Segnalazioni VSD</div>
          </div>
        </div>
      </div>

      {!isLoading && interests.length > 0 && (
        <div className={styles.interestListWrap}>
          <ul className={styles.interestList}>
            {interests.map(p => (
              <li key={p.interest_id} className={styles.interestPill}>
                {p.display_name}
                {(p.category || p.vehicle) && (
                  <span className={styles.interestPillVehicle}>
                    · {[p.category, p.vehicle].filter(Boolean).join(' · ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
