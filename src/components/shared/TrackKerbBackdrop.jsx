import './TrackKerbBackdrop.css';

/**
 * TrackKerbBackdrop — motivo decorativo di sfondo: un cordolo di pista
 * (rosso/bianco, come i kerb reali) che sparisce in una dissolvenza verso
 * il buio, in un angolo dell'hero. Puramente illustrativo/vettoriale —
 * NON una foto — per due motivi: zero rischio di diritti d'autore su
 * immagini non nostre, e resta nitido a qualsiasi opacità mentre una
 * foto a bassa opacità tende a "sporcarsi".
 *
 * Uso: dentro un contenitore con `position: relative; overflow: hidden`
 * (lo stesso pattern di .hero-bg-glow in DriverProfile.css). Puramente
 * decorativo — aria-hidden, pointer-events: none, non porta contenuto.
 *
 * @param {'br'|'bl'} [corner='br'] - angolo in cui ancorare il motivo
 * @param {string} [color='var(--vsd-red)'] - colore del cordolo. Usato da
 *   RaceDetail.jsx con trackAccentColor() per dare a ogni pista una
 *   variante di colore riconoscibile senza bisogno di foto per pista.
 */
export default function TrackKerbBackdrop({ corner = 'br', color = 'var(--vsd-red)' }) {
  const flip = corner === 'bl';
  return (
    <svg
      className={`track-kerb-backdrop track-kerb-backdrop-${corner}`}
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <defs>
        <linearGradient id="kerbFade" x1="0" y1="1" x2="0.3" y2="0">
          <stop offset="0%" stopColor="var(--vsd-bg)" stopOpacity="0" />
          <stop offset="75%" stopColor="var(--vsd-bg)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--vsd-bg)" stopOpacity="1" />
        </linearGradient>
      </defs>
      <g opacity="0.5">
        <path
          d="M -20 280 C 90 280, 140 190, 210 160 S 320 70, 420 10"
          fill="none"
          stroke={color}
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d="M -20 280 C 90 280, 140 190, 210 160 S 320 70, 420 10"
          fill="none"
          stroke="#e8edf5"
          strokeWidth="22"
          strokeLinecap="round"
          strokeDasharray="18 18"
        />
      </g>
      <rect x="0" y="0" width="400" height="300" fill="url(#kerbFade)" />
    </svg>
  );
}
