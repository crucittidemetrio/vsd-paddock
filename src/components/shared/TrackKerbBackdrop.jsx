import './TrackKerbBackdrop.css';

/**
 * TrackKerbBackdrop — motivo decorativo di sfondo: un cordolo di pista
 * (colore variabile, come i kerb reali) su una banda diagonale. Puramente
 * illustrativo/vettoriale — NON una foto — per due motivi: zero rischio di
 * diritti d'autore su immagini non nostre, e resta nitido a qualsiasi
 * opacità mentre una foto a bassa opacità tende a "sporcarsi".
 *
 * Tarato per contenitori bassi e larghi (barre/header, es. il
 * page-header di RaceDetail.jsx) — preserveAspectRatio="none" fa
 * combaciare l'SVG esattamente col riquadro reale invece di ritagliarlo
 * in modo imprevedibile (bug osservato: con "slice" su un contenitore
 * molto più largo che alto si vedeva solo un frammento minuscolo della
 * curva). La dissolvenza va da sinistra (dove sta il testo, resta pulita)
 * a destra (dove il cordolo è più visibile).
 *
 * Uso: dentro un contenitore con `position: relative; overflow: hidden`.
 * Puramente decorativo — aria-hidden, pointer-events: none, non porta
 * contenuto.
 *
 * @param {'br'|'bl'} [corner='br'] - lato verso cui il cordolo è più
 *   visibile ('br' = dissolvenza a sinistra, visibile a destra; 'bl' =
 *   speculare)
 * @param {string} [color='var(--vsd-red)'] - colore del cordolo. Usato da
 *   RaceDetail.jsx con trackAccentColor() per dare a ogni pista una
 *   variante di colore riconoscibile senza bisogno di foto per pista.
 */
export default function TrackKerbBackdrop({ corner = 'br', color = 'var(--vsd-red)' }) {
  const flip = corner === 'bl';
  return (
    <svg
      className={`track-kerb-backdrop track-kerb-backdrop-${corner}`}
      viewBox="0 0 800 140"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <defs>
        <linearGradient id="kerbFade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--vsd-bg)" stopOpacity="1" />
          <stop offset="30%" stopColor="var(--vsd-bg)" stopOpacity="0.75" />
          <stop offset="65%" stopColor="var(--vsd-bg)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g opacity="0.85">
        <path
          d="M -40 165 C 140 165, 240 70, 400 45 S 660 -10, 860 -20"
          fill="none"
          stroke={color}
          strokeWidth="30"
          strokeLinecap="round"
        />
        <path
          d="M -40 165 C 140 165, 240 70, 400 45 S 660 -10, 860 -20"
          fill="none"
          stroke="#e8edf5"
          strokeWidth="30"
          strokeLinecap="round"
          strokeDasharray="22 22"
        />
      </g>
      <rect x="0" y="0" width="800" height="140" fill="url(#kerbFade)" />
    </svg>
  );
}
