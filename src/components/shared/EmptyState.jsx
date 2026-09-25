import './EmptyState.css';

// Empty-state condiviso (25/09/2026) — prima di questo componente, il
// pattern "icona + titolo + testo" per gli stati vuoti (nessun round,
// nessuna segnalazione, campionato ritirato, ecc.) era duplicato con
// leggere differenze in ogni pagina (classi CSS module diverse, a volte
// solo un h2/p senza icona, a volte un'unica riga di testo piatto).
// Questo componente unifica il linguaggio visivo già stabilito da
// AciLmgt3Challenge/ChampionshipDetail (box elevato, icona, titolo
// display uppercase, testo mono) e lo rende riusabile ovunque, con un
// CTA opzionale per gli stati vuoti che hanno un'azione naturale
// (es. "Nuovo reclamo", "Torna al calendario").
export default function EmptyState({ icon = '∅', title, text, cta }) {
  return (
    <div className="vsd-empty">
      <div className="vsd-empty-icon">{icon}</div>
      {title && <div className="vsd-empty-title">{title}</div>}
      {text && <div className="vsd-empty-text">{text}</div>}
      {cta}
    </div>
  );
}
