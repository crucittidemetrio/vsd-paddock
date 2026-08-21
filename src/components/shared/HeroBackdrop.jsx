import { useState, useEffect } from 'react';
import TrackPhotoBackdrop from './TrackPhotoBackdrop';
import './HeroBackdrop.css';

/**
 * HeroBackdrop — wrapper "drop-in" per il video onboard dell'hero pubblico.
 *
 * COME ATTIVARLO: aggiungere il file
 *   public/videos/hero-loop.mp4
 * Nessuna modifica di codice necessaria. Il componente prova a caricare il
 * video e, finché il file non esiste (404) o se il visitatore ha impostato
 * "riduci il movimento" nel sistema operativo, ricade automaticamente sullo
 * sfondo fotografico statico con Ken Burns già in uso — il sito resta a
 * posto anche prima che il video arrivi, nessun placeholder rotto.
 *
 * Specifiche consigliate per il file:
 * - Formato: MP4 (H.264). L'audio non serve: l'autoplay è comunque muted.
 * - Durata: 8-15s, loop che si ricongiunge bene (stesso inquadratura a
 *   inizio/fine clip, altrimenti si vede lo "scatto" ad ogni giro).
 * - Peso: sotto ~6-8MB — è la home pubblica, il primo caricamento conta.
 * - Inquadratura: onboard o pit-lane, verticale o quadrata — lo spazio è
 *   ancorato in basso a un angolo dell'hero (stesso box della foto attuale).
 *
 * @param {'br'|'bl'} [corner='br'] - angolo in cui ancorare il motivo
 */
export default function HeroBackdrop({ corner = 'br' }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (videoFailed || reducedMotion) {
    return <TrackPhotoBackdrop corner={corner} />;
  }

  const flip = corner === 'bl';

  return (
    <video
      className={`hero-backdrop-video hero-backdrop-video-${corner}`}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      src="/videos/hero-loop.mp4"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      onError={() => setVideoFailed(true)}
    />
  );
}
