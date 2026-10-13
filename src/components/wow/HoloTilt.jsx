import { useRef } from 'react';
import './HoloTilt.css';

// Stesso effetto della card pilota (inclinazione 3D + riflesso olografico
// + bagliore che segue mouse/dito) applicabile a qualsiasi card esistente
// senza cambiarne il contenuto: <HoloTilt as={Link} to=... className=...>.
// `max` = gradi massimi di inclinazione (le card larghe vogliono meno).
export default function HoloTilt({ as: Tag = 'div', max = 8, className = '', children, ...rest }) {
  const ref = useRef(null);

  function move(clientX, clientY) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    el.style.setProperty('--ht-rx', `${(0.5 - y) * max * 2}deg`);
    el.style.setProperty('--ht-ry', `${(x - 0.5) * max * 2}deg`);
    el.style.setProperty('--ht-mx', `${x * 100}%`);
    el.style.setProperty('--ht-my', `${y * 100}%`);
    el.classList.add('is-tilting');
  }
  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--ht-rx', '0deg');
    el.style.setProperty('--ht-ry', '0deg');
    el.classList.remove('is-tilting');
  }

  return (
    <Tag
      ref={ref}
      className={`holo-tilt ${className}`}
      onMouseMove={e => move(e.clientX, e.clientY)}
      onMouseLeave={reset}
      onTouchMove={e => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }}
      onTouchEnd={reset}
      {...rest}
    >
      <span className="holo-tilt-holo" aria-hidden="true" />
      <span className="holo-tilt-shine" aria-hidden="true" />
      {children}
    </Tag>
  );
}
