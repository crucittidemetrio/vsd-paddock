import RequireTier from '../components/auth/RequireTier';
import LoginPrompt from '../components/auth/LoginPrompt';
import { usePageMeta } from '../hooks/usePageMeta';
import styles from './Setup.module.css';

// Cartella Drive "VSD-Paddock Setup" (proprietario v.sim.driver@gmail.com).
// Struttura: Circuito/Categoria/Auto, generata per LMU da
// apps-script/SetupFolders.js (setupLmuSetupFolders). Se la cartella
// viene mai ricreata altrove, aggiornare solo questo ID.
const SETUP_FOLDER_ID = '15nJLO2Ew11UXu7F-uApmeia6O-4iRs5z';
const SETUP_FOLDER_VIEW_URL = `https://drive.google.com/drive/folders/${SETUP_FOLDER_ID}`;
const SETUP_FOLDER_EMBED_URL = `https://drive.google.com/embeddedfolderview?id=${SETUP_FOLDER_ID}#list`;

export default function Setup() {
  usePageMeta({
    title: 'Setup — Virtual Sim Driver',
    description: 'Setup auto aggiornati a disposizione del team VSD, organizzati per circuito, categoria e vettura.',
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>RISORSE TEAM</div>
        <h1 className={styles.title}>Setup</h1>
        <p className={styles.sub}>
          I setup auto aggiornati a disposizione del team, organizzati per circuito, categoria e
          vettura nella cartella Drive del team. Contenuto e modifica riservati ai piloti VSD.
        </p>
      </header>

      <RequireTier
        minTier="pilot_vsd"
        fallback={<LoginPrompt feature="i setup auto del team" />}
      >
        <section className={styles.panel}>
          <div className={styles.panelBar}>
            <p className={styles.panelHint}>
              Sfoglia le cartelle qui sotto oppure apri direttamente in Google Drive per scaricare
              o caricare un setup.
            </p>
            <a
              href={SETUP_FOLDER_VIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.driveButton}
            >
              Apri su Google Drive ↗
            </a>
          </div>

          <div className={styles.embedWrap}>
            <iframe
              src={SETUP_FOLDER_EMBED_URL}
              title="Setup auto VSD — Google Drive"
              className={styles.embed}
              loading="lazy"
            />
          </div>

          <p className={styles.note}>
            Non vedi i file o non riesci a caricarne di nuovi? Serve che il tuo account Google
            abbia accesso alla cartella — chiedi allo staff di aggiungerti come editor.
          </p>
        </section>
      </RequireTier>
    </div>
  );
}
