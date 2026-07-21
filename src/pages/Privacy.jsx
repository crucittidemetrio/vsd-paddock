import './Page.css';
import './Privacy.css';

const CONTACT = 'https://discord.gg/gs5rR3DQay';
const LAST_UPDATE = '21 Luglio 2026';

export default function Privacy() {
  return (
    <div className="page privacy-page">
      <div className="page-header">
        <div className="page-eyebrow">TRASPARENZA DATI</div>
        <h1 className="page-title">Privacy &amp; Trattamento Dati</h1>
        <p className="page-sub">
          Come VSD-Paddock raccoglie, usa e conserva i dati dei membri del team.
        </p>
      </div>

      <section className="privacy-section">
        <h2>Cosa raccogliamo</h2>
        <ul>
          <li>Nome/nickname pilota e display name utilizzato in gara</li>
          <li>Discord ID e username, per l'accesso e l'associazione ai risultati</li>
          <li>Tempi sul giro, risultati gara, statistiche di performance</li>
          <li>Dati di telemetria sincronizzati da Garage61, quando collegato</li>
        </ul>
      </section>

      <section className="privacy-section">
        <h2>Perché li raccogliamo</h2>
        <p>
          Per gestire il roster del team, generare classifiche e report di gara,
          pianificare gli stint nelle endurance e confrontare le performance tra
          piloti. Sono trattamenti funzionali all'attività sportiva del team, non
          usiamo i dati per finalità commerciali o pubblicitarie.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Chi può vedere cosa</h2>
        <ul>
          <li>
            <strong>Pubblico</strong> (senza login): roster, calendario, risultati
            gara, classifiche best laps.
          </li>
          <li>
            <strong>Piloti autenticati</strong>: report di gara dettagliati, training,
            academy.
          </li>
          <li>
            <strong>Staff/Admin</strong>: strumenti di gestione, import risultati,
            pianificazione stint, dashboard team.
          </li>
        </ul>
      </section>

      <section className="privacy-section">
        <h2>Dove sono conservati</h2>
        <p>
          I dati sono conservati su infrastruttura Google (Google Sheets) con
          accesso limitato al team, e sull'applicazione VSD-Paddock ospitata su
          Vercel. L'accesso è protetto da autenticazione Discord OAuth e da un
          sistema di ruoli (pilota / staff / admin).
        </p>
      </section>

      <section className="privacy-section">
        <h2>Conservazione e cancellazione</h2>
        <p>
          I dati dei piloti in stato "trial" o "inactive" vengono conservati solo
          per la durata utile a scopi statistici/storici del team. Puoi chiedere
          in qualsiasi momento la correzione o la cancellazione dei tuoi dati
          personali scrivendo su {' '}
          <a href={CONTACT} target="_blank" rel="noopener noreferrer">
            Discord
          </a>{' '}
          a uno degli admin del team.
        </p>
      </section>

      <p className="privacy-updated">Ultimo aggiornamento: {LAST_UPDATE}</p>
    </div>
  );
}
