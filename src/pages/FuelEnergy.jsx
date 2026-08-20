import FuelPanel from '../components/fuel/FuelPanel';
import { useMySession } from '../hooks/useFuelLog';
import { usePageMeta } from '../hooks/usePageMeta';
import styles from './FuelEnergy.module.css';

/**
 * FuelEnergy — pannello carburante/energia aperto a qualsiasi pilota
 * VSD, non solo admin, e non legato al calendario gare ufficiali.
 *
 * Nessun ID sessione o numero vettura da digitare: il companion app
 * (companion/fuel_bridge.py), lanciato con config.json senza race_id,
 * gira in "modalità personale" e apre da solo una sessione ogni volta
 * che serve — il sito la riconosce tramite fuel.mySession, che usa
 * solo il driver_id già dentro il token di login, senza bisogno di
 * nessuna etichetta condivisa da far coincidere a mano.
 *
 * Per le gare ufficiali multi-pilota lo staff continua a usare
 * Admin → Gestione stint, che resta su race_id di calendario +
 * car_number esplicito (qui non tocca nulla).
 */
export default function FuelEnergy() {
  usePageMeta({
    title: 'Carburante / Energia — VSD Paddock',
    description: 'Consumo medio e autonomia stimata in tempo reale durante gara o test.',
  });

  const { data: session, isLoading, error } = useMySession();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>
          CARBURANTE / ENERGIA
          <span className={styles.liveBadge}>● strumento da gara</span>
        </div>
        <h1 className={styles.title}>Consumo live</h1>
        <p className={styles.sub}>
          Funziona in gara come nelle sessioni di prova — non serve un evento
          ufficiale in calendario, né digitare un ID sessione: basta avviare
          il companion app (config.json senza race_id) mentre sei loggato
          qui, e la tua sessione compare da sola appena finisci il primo
          giro.
        </p>
      </header>

      {session?.active && (
        <div className={styles.setupBox}>
          <div className={styles.field}>
            <label>Sessione rilevata</label>
            <div className={styles.sessionValue}>
              {[session.vehicle_name, session.track_name].filter(Boolean).join(' · ') || session.race_id}
            </div>
          </div>
          <p className={styles.hint}>
            Rilevata automaticamente dal tuo companion app. Se cambi vettura
            o pista, si aggiorna da sola al giro successivo — se resta ferma
            oltre 30 minuti senza nuovi giri, alla ripresa se ne apre una
            nuova.
          </p>
        </div>
      )}

      {session?.active ? (
        <FuelPanel raceId={session.race_id} carNumber={session.car_number} />
      ) : (
        <div className={styles.empty}>
          {isLoading ? (
            'Verifica sessione…'
          ) : error ? (
            `Impossibile verificare la sessione (${error.message || 'errore sconosciuto'}). Prova a ricaricare la pagina.`
          ) : (
            <>
              Nessuna sessione personale attiva. Avvia il companion app con
              l'ID sessione lasciato vuoto (modalità personale — vedi{' '}
              <code>companion/README.md</code>) ed entra in pista: la
              sessione comparirà qui appena completi il primo giro.
              <br />
              Per una gara ufficiale VSD con equipaggio, usa invece Admin →
              Gestione stint.
            </>
          )}
        </div>
      )}
    </div>
  );
}
