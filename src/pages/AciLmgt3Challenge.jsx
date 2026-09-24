import { usePageMeta } from '../hooks/usePageMeta';
import { SOCIAL_LINKS } from '../utils/constants';
import styles from './AciLmgt3Challenge.module.css';

// ═══════════════════════════════════════════════════════════
// ACI LMGT3 Challenge 2026 — pagina di RITIRO (25/09/2026)
// ═══════════════════════════════════════════════════════════
// VSD Racing si ritira dal campionato: per cause di forza maggiore
// nessuno dei 4 alfieri iscritti (in prequalifica sull'entry list
// Apex) potrà più parteciparvi — comunicazione esplicita di Demetrio.
//
// Scelta deliberata (AskUserQuestion, 25/09/2026): la route
// /aci-lmgt3-challenge resta viva — non un redirect/404 — sostituita
// da un breve avviso, così chi ha salvato il link (piloti, community,
// eventuali link condivisi su Discord) trova una spiegazione invece
// di una pagina rotta. Il campionato risulta 'cancelled' lato
// Supabase (vedi migrazione championships_status_add_cancelled) — si
// sfila già da solo dai selettori attivi (calendario, reclami, ecc.)
// grazie al fix del 25/09/2026 su IncidentReportSection.
//
// Tutta la vecchia pagina promozionale (regolamento ACI, calendario
// gare, iscrizioni, Story Book, classifica live, form prequalifiche)
// è stata rimossa: non ha più senso promuovere un'iscrizione o
// mostrare un percorso che non esiste più. I contenuti storici
// (candidati in prequalifica, eventuali post Story Book già scritti)
// restano nel database, semplicemente non più esposti qui.
export default function AciLmgt3Challenge() {
  usePageMeta({
    title: 'ACI LMGT3 Challenge — Campionato ritirato | VSD',
    description: 'VSD Racing si è ritirata dall\'ACI LMGT3 Challenge 2026 per cause di forza maggiore.',
  });

  return (
    <div className={styles.page}>

      {/* ════ HERO ════ */}
      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>VSD RACING</div>
        <h1 className={styles.heroTitle}>
          ACI LMGT3 Challenge
        </h1>
        <p className={styles.heroSub}>
          Le Mans Ultimate · Campionato Ufficiale ACI Sport
        </p>
        <div className={styles.heroOpen}>
          <span className={styles.heroBadge}>🚫 Campionato ritirato</span>
        </div>
      </section>

      {/* ════ AVVISO ════ */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Comunicazione</div>
        <h2 className={styles.sectionTitle}>VSD Racing si ritira dalla competizione</h2>
        <div className={styles.emptyBox}>
          <div className={styles.emptyIcon}>🏳️</div>
          <div className={styles.emptyTitle}>Nessun nostro pilota potrà scendere in pista</div>
          <div className={styles.emptyText}>
            Per cause di forza maggiore, nessuno dei quattro alfieri VSD iscritti alla
            competizione — Silvio Tuveri, Francesco Mastrangelo, Simone Pelloni e
            Simone Mazzola — potrà parteciparvi. VSD Racing non sarà quindi presente
            all'ACI LMGT3 Challenge 2026.
            <br /><br />
            Un ringraziamento a chi si era messo in gioco fin dalle prequalifiche: il
            tentativo resta un merito, a prescindere da come è andata a finire.
            <br /><br />
            Il campionato resta indetto da ACI Sport e gestito operativamente da Apex
            Italia Simracing — per chi fosse comunque interessato a seguirlo o
            parteciparvi come pilota indipendente, il regolamento ufficiale resta
            pubblicato su acisport.it.
          </div>
        </div>
      </section>

      {/* ════ CTA ════ */}
      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>Il resto della stagione VSD continua</h2>
        <p className={styles.ctaText}>
          UE144, ACE, Clash of Classes e tutto il resto del calendario proseguono normalmente —
          per domande su questo ritiro, passa dal nostro Discord.
        </p>
        <div className={styles.ctaActions}>
          <a href={SOCIAL_LINKS.DISCORD} target="_blank" rel="noopener noreferrer" className={styles.btn}>
            Discord VSD
          </a>
        </div>
      </section>

    </div>
  );
}
