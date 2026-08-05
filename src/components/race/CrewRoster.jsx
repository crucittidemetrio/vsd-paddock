import './CrewRoster.css';

/**
 * CrewRoster — riepilogo pubblico read-only "chi guida quale vettura",
 * per gare endurance dove VSD schiera più equipaggi sullo stesso race_id
 * (es. 8h di Daytona). Non mostra nulla se c'è un solo car_number: in
 * quel caso l'informazione è già ovvia dal Piano Stint, niente da
 * aggiungere. Il roster va compilato in Admin → Gestione stint →
 * Equipaggi, prima ancora di pianificare gli stint.
 *
 * @param {Array}    crews         - [{ crew_id, car_number, driver_id, notes }]
 * @param {Array}    drivers       - roster per join id→nome
 * @param {Function} getDriverName - (driverId, drivers) => string
 */
export default function CrewRoster({ crews, drivers, getDriverName }) {
  const list = Array.isArray(crews) ? crews : [];
  if (list.length === 0) return null;

  const groups = new Map();
  list.forEach(c => {
    const key = String(c.car_number || '').trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  });

  // Con una sola vettura l'informazione è ridondante col Piano Stint.
  if (groups.size <= 1) return null;

  const carNumbers = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return (
    <section className="cr-section">
      <div className="cr-header">
        <h2 className="cr-title">Equipaggi</h2>
        <span className="cr-count">{carNumbers.length} vetture</span>
      </div>

      <div className="cr-grid">
        {carNumbers.map(cn => (
          <div key={cn || '—'} className="cr-card">
            <div className="cr-car-label">Vettura #{cn || '—'}</div>
            <ul className="cr-driver-list">
              {groups.get(cn).map(c => (
                <li key={c.crew_id} className="cr-driver">
                  {getDriverName(c.driver_id, drivers)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
