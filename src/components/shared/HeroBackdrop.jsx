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
 * partire da solo — deve essere muto. Di default parte muto, con un
 * pulsante 🔈 sempre visibile per attivare l'audio su richiesta (richiede
 * un click dell'utente, non aggirabile). Il rilevamento automatico "il file
 * ha davvero una traccia audio?" non è affidabile cross-browser (le API
 * disponibili — audioTracks, webkitAudioDecodedByteCount — non sono
 * popolate in modo consistente al momento del caricamento), quindi il
 * pulsante si mostra sempre: su un file senza audio è solo un click che
 * non fa nulla di percepibile, innocuo.
 *
 * Specifiche consigliate per il file:
 * - Formato: MP4 (H.264), yuv420p. Se non ha traccia audio va bene
 *   comunque — il pulsante non causerà errori, semplicemente non si sente
 *   nulla quando viene premuto.
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
  const [videoReady, setVideoReady] = useState(false);
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
        onLoadedMetadata={() => setVideoReady(true)}
      />
      <div className="hero-backdrop-overlay" aria-hidden="true" />
      {videoReady && (
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
