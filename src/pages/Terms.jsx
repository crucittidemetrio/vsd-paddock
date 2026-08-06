import './Page.css';
import './Privacy.css';

const CONTACT = 'https://discord.gg/gs5rR3DQay';
const LAST_UPDATE = '6 Agosto 2026';

export default function Terms() {
  return (
    <div className="page privacy-page">
      <div className="page-header">
        <div className="page-eyebrow">CONDIZIONI D'USO</div>
        <h1 className="page-title">Termini di Servizio</h1>
        <p className="page-sub">
          Condizioni d'uso di VSD-Paddock, la piattaforma interna del team VSD.
        </p>
      </div>

      <section className="privacy-section">
        <h2>Cos'è VSD-Paddock</h2>
        <p>
          VSD-Paddock è l'applicazione interna del team sim racing VSD: gestisce
          risultati gara, statistiche pilota, pianificazione stint, campionati e
          notifiche legate all'attività del team, incluso il bot/webhook Discord
          "VSD Paddock" usato per gli avvisi automatici nei canali del server.
          Non è un prodotto commerciale ed è riservata ai membri e ai piloti del
          team VSD.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Accesso e account</h2>
        <p>
          L'accesso avviene tramite login Discord OAuth. Effettuando l'accesso
          confermi di essere un membro del server Discord VSD e accetti che il
          tuo Discord ID, username e ruolo server vengano usati per determinare
          i permessi (pilota / staff / admin) all'interno dell'app. L'account e
          i relativi permessi possono essere revocati in caso di uscita dal
          team o dal server Discord.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Uso consentito</h2>
        <ul>
          <li>Consultare risultati, classifiche, statistiche e materiale del team</li>
          <li>Inviare tempi, dati di consumo carburante/energia e altri contenuti relativi alla propria attività in pista</li>
          <li>Usare gli strumenti di pianificazione (stint, equipaggi) nell'ambito delle attività ufficiali VSD</li>
        </ul>
        <p>
          È vietato inserire dati falsi o manomessi (tempi, telemetria, risultati),
          usare l'app per finalità estranee all'attività del team, o tentare di
          aggirare i controlli di accesso e i livelli di permesso.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Notifiche e webhook Discord</h2>
        <p>
          Alcuni eventi (nuovi record, validazione Best Laps, avvisi stint)
          generano notifiche automatiche su canali Discord dedicati tramite
          webhook. Questi messaggi sono generati dal sistema e riportano solo
          informazioni relative all'attività sportiva del team, mai dati
          personali sensibili.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Disponibilità e responsabilità</h2>
        <p>
          VSD-Paddock è un progetto interno mantenuto su base volontaria: non
          garantiamo disponibilità continua del servizio né l'assenza di errori
          o interruzioni. I dati e le statistiche mostrate hanno finalità
          sportive/informative e non costituiscono garanzia di accuratezza
          assoluta (es. in caso di telemetria mancante o invii manuali errati).
        </p>
      </section>

      <section className="privacy-section">
        <h2>Modifiche ai termini</h2>
        <p>
          Questi termini possono essere aggiornati per riflettere nuove
          funzionalità dell'app. Le modifiche sostanziali verranno comunicate
          nel canale Discord del team. L'uso continuato dell'app dopo un
          aggiornamento implica l'accettazione dei nuovi termini.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Contatti</h2>
        <p>
          Per domande su questi termini o sull'uso dell'app, scrivi su{' '}
          <a href={CONTACT} target="_blank" rel="noopener noreferrer">
            Discord
          </a>{' '}
          a uno degli admin del team. Per il trattamento dei dati personali vedi
          la pagina <a href="/privacy">Privacy &amp; Trattamento Dati</a>.
        </p>
      </section>

      <p className="privacy-updated">Ultimo aggiornamento: {LAST_UPDATE}</p>
    </div>
  );
}
