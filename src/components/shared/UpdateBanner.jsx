import { useServiceWorkerUpdate } from '../../hooks/useServiceWorkerUpdate';
import styles from './UpdateBanner.module.css';

/**
 * #377 — vedi useServiceWorkerUpdate.js per il perché. Montato una
 * sola volta a livello App (fuori da AppShell/Routes) così è visibile
 * su OGNI pagina, incluse quelle standalone (/login, /admin/social-manager).
 */
export default function UpdateBanner() {
  const { updateAvailable, reload } = useServiceWorkerUpdate();

  if (!updateAvailable) return null;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>
        Nuova versione disponibile — alcune pagine potrebbero mostrare dati non aggiornati.
      </span>
      <button type="button" className={styles.button} onClick={reload}>
        Aggiorna
      </button>
    </div>
  );
}
