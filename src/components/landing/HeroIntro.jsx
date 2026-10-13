import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CountdownLive from '../shared/CountdownLive';
import './HeroIntro.css';

// ═══════════════════════════════════════════════════════════
// Intro "cinematografica" dell'hero pubblico (13/10/2026, simulazione
// approvata da Demetrio): griglia in prospettiva, linee di velocità,
// traiettoria luminosa, logo con riflesso, titolo lettera per lettera,
// semafori di partenza che si spengono e rivelano la prossima gara,
// numeri del team che salgono da zero.
//
// Si vede per intero solo alla PRIMA apertura della sessione (flag in
// sessionStorage): tornando alla home dopo aver navigato, tutto compare
// subito. Con "riduci movimento" attivo nel sistema: niente animazioni.
// ═══════════════════════════════════════════════════════════

// Linee di velocità: posizioni pseudo-casuali ma deterministiche (stesse a
// ogni render, nessun Math.random durante il render).
const frac = (n) => n - Math.floor(n);
const STREAKS = Array.from({ length: 16 }, (_, i) => ({
  top: `${(frac(Math.sin(i * 12.9898) * 43758.5453) * 100).toFixed(1)}%`,
  width: `${Math.round(80 + frac(Math.sin(i * 78.233) * 12345.678) * 220)}px`,
  animationDelay: `${(frac(Math.sin(i * 3.17) * 9871.3) * 1.6).toFixed(2)}s`,
  animationDuration: `${(1 + frac(Math.sin(i * 5.91) * 4567.1) * 1.2).toFixed(2)}s`,
}));

const RACING_PATH = 'M-40 520 C 220 520 300 380 520 400 S 860 560 1080 430 S 1360 250 1560 300';

/** Livelli decorativi dietro al contenuto dell'hero. */
export function IntroLayers() {
  return (
    <div className="hi-layers" aria-hidden="true">
      <div className="hi-grid" />
      <div className="hi-streaks">
        {STREAKS.map((s, i) => <i key={i} className="hi-streak" style={s} />)}
      </div>
      <svg className="hi-line" viewBox="0 0 1500 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="hiLineGrad" x1="0" x2="1">
            <stop offset="0" stopColor="#00d4ff" stopOpacity="0" />
            <stop offset=".5" stopColor="#00d4ff" />
            <stop offset="1" stopColor="#3b8bff" />
          </linearGradient>
        </defs>
        <path d={RACING_PATH} />
        <circle className="hi-dot" r="7">
          <animateMotion dur="2.4s" begin="0.3s" fill="freeze" path={RACING_PATH} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".6 .05 .3 1" />
        </circle>
      </svg>
    </div>
  );
}

// Colori ufficiali del logo VSD (lettere "VSD": blu → ciano → giallo → rosso).
const BRAND_STOPS = [[30, 107, 255], [0, 212, 255], [255, 210, 63], [255, 45, 61]];

function brandColorAt(t) {
  const seg = Math.min(BRAND_STOPS.length - 2, Math.floor(t * (BRAND_STOPS.length - 1)));
  const local = t * (BRAND_STOPS.length - 1) - seg;
  const [a, b] = [BRAND_STOPS[seg], BRAND_STOPS[seg + 1]];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * local));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Titolo che entra lettera per lettera, sfumato con i colori del logo. */
export function SplitTitle({ text, baseDelay = 2.6, className = '' }) {
  const chars = [...text];
  return (
    <h1 className={`hi-title ${className}`} aria-label={text}>
      {chars.map((c, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{ '--d': `${baseDelay + i * 0.04}s`, color: brandColorAt(chars.length > 1 ? i / (chars.length - 1) : 0) }}
        >
          {c === ' ' ? ' ' : c}
        </span>
      ))}
    </h1>
  );
}

/** Numero che sale da 0 al valore, dopo `delay` secondi (solo in modalità full). */
export function CountUp({ to, delay = 0, play }) {
  const target = Number(to) || 0;
  const [value, setValue] = useState(play ? 0 : target);
  const raf = useRef(null);
  useEffect(() => {
    if (!play) return undefined;
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 1200);
        setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    }, delay * 1000);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf.current); };
  }, [play, target, delay]);
  return <>{play ? value : target}</>;
}

/**
 * Semafori di partenza: 5 rossi in sequenza, poi "lights out" (con la
 * pausa leggermente casuale delle partenze vere) e compare la prossima gara.
 */
export function StartLights({ race, play }) {
  const [lit, setLit] = useState(play ? 0 : 5);
  const [out, setOut] = useState(!play);
  useEffect(() => {
    if (!play) return undefined;
    const timers = [];
    for (let i = 1; i <= 5; i++) timers.push(setTimeout(() => setLit(i), 4000 + (i - 1) * 450));
    timers.push(setTimeout(() => setOut(true), 4000 + 5 * 450 + 600 + Math.random() * 400));
    return () => timers.forEach(clearTimeout);
  }, [play]);

  return (
    <div className="hi-start">
      <div className={`hi-lights${out ? ' is-out' : ''}`} aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => <i key={i} className={`hi-light${i < lit ? ' is-on' : ''}`} />)}
      </div>
      {race && (
        <div className={`hi-next${out ? ' is-shown' : ''}`}>
          <div className="hi-next-label">Prossima gara</div>
          <Link to={`/race/${encodeURIComponent(race.race_id)}`} className="hi-next-name">
            {race.race_name || race.title}
          </Link>
          <CountdownLive targetIso={race.date} size="lg" />
        </div>
      )}
    </div>
  );
}
