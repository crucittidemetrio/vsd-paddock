import { Link } from 'react-router-dom';
import styles from './LoginPrompt.module.css';

/**
 * Fallback standard per sezioni gated dentro pagine pubbliche.
 * Mostra messaggio + bottone "Accedi con Discord" che porta a /login.
 *
 * Props:
 *   feature  — descrizione di cosa è gated (es. "i report qualitativi")
 *   compact  — true per layout inline più piccolo
 */
export default function LoginPrompt({ feature = 'questa sezione', compact = false }) {
  return (
    <div className={`${styles.prompt} ${compact ? styles.compact : ''}`}>
      <div className={styles.icon}>🔒</div>
      <div className={styles.body}>
        <h3 className={styles.title}>Accesso riservato</h3>
        <p className={styles.message}>
          Per accedere a {feature} effettua il login con il tuo account Discord.
        </p>
        <Link to="/login" className={styles.button}>
          Accedi con Discord
        </Link>
      </div>
    </div>
  );
}
