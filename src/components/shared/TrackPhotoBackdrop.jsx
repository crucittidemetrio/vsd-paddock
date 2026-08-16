import './TrackPhotoBackdrop.css';

/**
 * TrackPhotoBackdrop — motivo decorativo di sfondo fotografico: un cordolo
 * rosso/bianco bagnato al tramonto, con dissolvenza verso il buio, ancorato
 * a un angolo dell'hero. Sostituisce TrackKerbBackdrop (vettoriale) dove si
 * vuole un'atmosfera più fotografica/cinematografica.
 *
 * Foto: StockCake, licenza CC0/free-use, ritagliata e trattata (luminosità,
 * saturazione, dissolvenza alpha) per intonarsi alla palette VSD.
 *
 * Uso: dentro un contenitore con `position: relative; overflow: hidden`
 * (stesso pattern di TrackKerbBackdrop). Puramente decorativo — aria-hidden,
 * pointer-events: none, non porta contenuto.
 *
 * @param {'br'|'bl'} [corner='br'] - angolo in cui ancorare il motivo
 */
export default function TrackPhotoBackdrop({ corner = 'br' }) {
  const flip = corner === 'bl';
  return (
    <img
      src="/backgrounds/track-kerb-sunset.webp"
      alt=""
      aria-hidden="true"
      className={`track-photo-backdrop track-photo-backdrop-${corner}`}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
}
