import { useRef } from 'react';
import { Link } from 'react-router-dom';
import './DriverCard.css';

// Card pilota "da collezione" (13/10/2026, simulazione approvata):
// inclinazione 3D + riflesso olografico che segue mouse/dito, bordo nei
// colori del logo per il livello ELITE. Solo dati reali: se un valore
// manca (es. Elo per un visitatore non collegato) la casella non compare.
export const ELITE_ELO = 1540;

// Varianti (13/10/2026): size="grid" per la griglia del Roster (larghezza
// fluida, altezza libera), `to` rende la card un link, `status` va in alto a
// destra accanto al livello, `meta` sostituisce "VIRTUAL SIM DRIVER" (es.
// TEAM PRINCIPAL), `children` ospita badge/sim/specialità, `muted` per gli ex.
export default function DriverCard({
  name, photoUrl, number, elo, safety, races, wins, podiums, className = '',
  size, to, status, meta, children, muted = false,
}) {
  const ref = useRef(null);
  const tier = elo != null ? (elo >= ELITE_ELO ? 'elite' : 'pro') : 'base';
  const tierLabel = tier === 'elite' ? 'ELITE' : tier === 'pro' ? 'PRO' : 'VSD';

  function move(clientX, clientY) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    el.style.setProperty('--rx', `${(0.5 - y) * 22}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 22}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.classList.add('is-active');
  }
  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.classList.remove('is-active');
  }

  const stats = [
    { label: 'Gare', value: races },
    { label: 'Vittorie', value: wins },
    { label: 'Podi', value: podiums },
    { label: 'Safety', value: safety != null ? Math.round(safety) : null },
  ].filter(s => s.value != null);

  const Tag = to ? Link : 'div';
  return (
    <div className={`dcard-wrap${size === 'grid' ? ' dcard-wrap-grid' : ''} ${className}`}>
      <Tag
        {...(to ? { to } : {})}
        ref={ref}
        className={`dcard dcard-${tier}${size === 'grid' ? ' dcard-grid' : ''}${muted ? ' dcard-muted' : ''}`}
        onMouseMove={e => move(e.clientX, e.clientY)}
        onMouseLeave={reset}
        onTouchMove={e => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }}
        onTouchEnd={reset}
        aria-label={`Card pilota ${name}`}
      >
        <div className="dcard-holo" aria-hidden="true" />
        <div className="dcard-shine" aria-hidden="true" />
        <div className="dcard-top">
          {elo != null ? (
            <div className="dcard-elo"><b>{Math.round(elo)}</b><small>ELO LMU</small></div>
          ) : <span />}
          <div className="dcard-top-right">
            {status}
            <div className="dcard-tier">{tierLabel}</div>
          </div>
        </div>
        {photoUrl
          ? <img className="dcard-photo" src={photoUrl} alt="" loading="lazy" />
          : <div className="dcard-photo dcard-photo-fallback">{(name || '?').slice(0, 1)}</div>}
        {number != null && number !== '' && <div className="dcard-num" aria-hidden="true">#{number}</div>}
        <div className="dcard-name">{name}</div>
        <div className={`dcard-meta${meta ? ' dcard-meta-role' : ''}`}>{meta || 'VIRTUAL SIM DRIVER'}</div>
        {children && <div className="dcard-extra">{children}</div>}
        {stats.length > 0 && (
          <div className="dcard-stats" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
            {stats.map(s => (
              <div key={s.label}><b>{s.value}</b><small>{s.label}</small></div>
            ))}
          </div>
        )}
      </Tag>
    </div>
  );
}
