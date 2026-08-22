import { useState, useEffect, useRef } from 'react';
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
 * Il video copre l'intero hero (non più un riquadro d'angolo come la foto
 * statica) con un overlay scuro sopra, sullo stesso schema di NextRaceHero:
 * serve a garantire leggibilità di titolo/pulsanti/statistiche SOPRA il
 * video, e a renderlo visibile davvero invece che nascosto sotto gli altri
 * elementi.
 *
 * Autoplay: per policy di tutti i browser un video con audio NON può
 * partire da solo — deve essere muto. Di default parte muto; se il file ha
 * una traccia audio, viene mostrato un pulsante 🔈 per attivarla su
 * richiesta (richiede un click dell'utente, non aggirabile).
 *
 * Specifiche consigliate per il file:
 * - Formato: MP4 (H.264), yuv420p. Audio opzionale (AAC) se si vuole il
 *   pulsante di attivazione — altrimenti va bene anche senza.
 * - Durata: 8-15s, loop che si ricongiunge bene (stesso inquadratura a
 *   inizio/fine clip, altrimenti si vede lo "scatto" ad ogni giro).
 * - Peso: sotto ~6-8MB — è la home pubblica, il primo caricamento conta.
 * - Inquadratura: orizzontale, pensata per riempire l'intero hero (non più
 *   un ritaglio d'angolo).
 *
 * @param {'br'|'bl'} [corner='br'] - angolo per il fallback fotografico
 */
export default function HeroBackdrop({ corner = 'br' }) {
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [unmuted, setUnmuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function handleLoadedMetadata() {
    const el = videoRef.current;
    // webkitAudioDecodedByteCount/mozHasAudio: fallback per browser che non
    // espongono audioTracks. Se nessuno è disponibile, il pulsante resta
    // nascosto (nessun danno: significa solo che il file non ha audio).
    const tracks = el?.audioTracks;
    const detected =
      (tracks && tracks.length > 0) ||
      el?.webkitAudioDecodedByteCount > 0 ||
      el?.mozHasAudio === true;
    setHasAudio(!!detected);
  }

  function toggleAudio() {
    const el = videoRef.current;
    if (!el) return;
    const next = !unmuted;
    el.muted = !next;
    setUnmuted(next);
  }

  if (videoFailed || reducedMotion) {
    return <TrackPhotoBackdrop corner={corner} />;
  }

  return (
    <>
      <video
        ref={videoRef}
        className="hero-backdrop-video"
        src="/videos/hero-loop.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        onError={() => setVideoFailed(true)}
        onLoadedMetadata={handleLoadedMetadata}
      />
      <div className="hero-backdrop-overlay" aria-hidden="true" />
      {hasAudio && (
        <button
          type="button"
          className="hero-backdrop-sound"
          onClick={toggleAudio}
          aria-label={unmuted ? 'Disattiva audio video' : 'Attiva audio video'}
        >
          {unmuted ? '🔊' : '🔈'}
        </button>
      )}
    </>
  );
}
