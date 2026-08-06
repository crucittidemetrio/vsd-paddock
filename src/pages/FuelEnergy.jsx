import { useState } from 'react';
import FuelPanel from '../components/fuel/FuelPanel';
import { usePageMeta } from '../hooks/usePageMeta';
import styles from './FuelEnergy.module.css';

const SESSION_KEY = 'vsd_fuel_session_id';
const CAR_KEY = 'vsd_fuel_car_number';

/**
 * FuelEnergy — pannello carburante/energia aperto a qualsiasi pilota
 * VSD, non solo admin, e non legato al calendario gare ufficiali.
 *
 * L'"ID sessione" è un'etichetta libera: per una gara ufficiale si può
 * usare il race_id del calendario (stessi dati visti in Admin →
 * Gestione stint), per una sessione di prova basta inventarsi
 * un'etichetta qualsiasi — l'importante è che combaci ESATTAMENTE con
 * quella messa in companion/config.json.
 */
export default function FuelEnergy() {
  usePageMeta({
    title: 'Carburante / Energia — VSD Paddock',
    description: 'Consumo medio e autonomia stimata in tempo reale durante gara o test.',
  });

  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY) || '');
  const [carNumber, setCarNumber] = useState(() => localStorage.getItem(CAR_KEY) || '');

  function handleSessionChange(e) {
    const v = e.target.value;
    setSessionId(v);
    localStorage.setItem(SESSION_KEY, v);
  }

  function handleCarChange(e) {
    const v = e.target.value;
    setCarNumber(v);
    localStorage.setItem(CAR_KEY, v);
  }

  const ready = sessionId.trim() && carNumber.trim();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>CARBURANTE / ENERGIA</div>
        <h1 className={styles.title}>Consumo live</h1>
        <p className={styles.sub}>
          Funziona in gara come nelle sessioni di prova — non serve un evento
          ufficiale in calendario. Serve solo il companion app avviato con lo
          stesso ID sessione e numero vettura impostati qui sotto.
        </p>
      </header>

      <div className={styles.setupBox}>
        <div className={styles.field}>
          <label htmlFor="fuel-session">ID sessione</label>
          <input
            id="fuel-session"
            type="text"
            value={sessionId}
            onChange={handleSessionChange}
            placeholder="es. RACE_2026_08_14 (gara ufficiale) oppure TEST-monza-06-08"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="fuel-car">Numero vettura</label>
          <input
            id="fuel-car"
            type="text"
            value={carNumber}
            onChange={handleCarChange}
            placeholder="es. 7"
          />
        </div>
        <p className={styles.hint}>
          Per una gara ufficiale VSD, usa lo stesso race_id che vedi nel
          calendario (i dati coincidono con quelli visti dallo staff in
          Admin → Gestione stint). Per un test libero, scegli un'etichetta a
          piacere — basta che coincida con quella scritta in{' '}
          <code>companion/config.json</code> sul tuo PC.
        </p>
      </div>

      {ready ? (
        <FuelPanel raceId={sessionId.trim()} carNumber={carNumber.trim()} />
      ) : (
        <div className={styles.empty}>
          Compila ID sessione e numero vettura per vedere i dati.
        </div>
      )}
    </div>
  );
}
