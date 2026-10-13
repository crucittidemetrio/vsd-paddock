import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRaceResults } from '../../hooks/useRaceResults';
import { useConsentSocialFlags } from '../../hooks/useConsent';
import { resolvePhotoUrl } from '../../utils/driverPhotos';
import './RaceRecap.css';

// Riepilogo animato della gara (13/10/2026, simulazione approvata):
// podio che sale, "Pilota VSD della gara" con posizioni guadagnate
// (rispetto alla qualifica, se importata) e piloti VSD con i punti.
// Si anima quando entra nello schermo. Dati solo da race_results: nessun
// giro-per-giro (non disponibile), quindi niente sorpassi in gara.

function nameOf(r, drivers) {
  if (r.is_vsd_driver && drivers?.[r.driver_id]) return drivers[r.driver_id].display_name || r.driver_name_external;
  return r.driver_name_external || '—';
}

export default function RaceRecap({ raceId, drivers }) {
  const { data } = useRaceResults({ race_id: raceId });
  const { data: flagsData } = useConsentSocialFlags();
  const socialFlags = flagsData?.flags || {};
  const ref = useRef(null);
  const [go, setGo] = useState(false);
  const [gainShown, setGainShown] = useState(0);

  const recap = useMemo(() => {
    const all = data?.results || [];
    const race = all.filter(r => (r.session_type || 'race') === 'race' && !r.dns && r.finish_position != null);
    if (!race.length) return null;
    const quali = all.filter(r => r.session_type === 'qualifying');

    // Classe di riferimento: quella con più piloti VSD (a parità, la più numerosa).
    const byClass = {};
    race.forEach(r => { (byClass[r.car_class || '—'] ||= []).push(r); });
    const cls = Object.keys(byClass).sort((a, b) => {
      const va = byClass[a].filter(r => r.is_vsd_driver).length;
      const vb = byClass[b].filter(r => r.is_vsd_driver).length;
      return vb - va || byClass[b].length - byClass[a].length;
    })[0];
    const rows = byClass[cls].sort((a, b) => a.finish_position - b.finish_position);
    const podium = rows.slice(0, 3);
    const vsd = rows.filter(r => r.is_vsd_driver);
    if (!vsd.length && podium.length < 3) return null;

    const key = r => (r.driver_id || r.driver_name_external || '').toString().toLowerCase();
    const qualiPos = {};
    quali.filter(q => (q.car_class || '—') === cls && q.finish_position != null)
      .forEach(q => { qualiPos[key(q)] = q.finish_position; });

    const star = vsd[0] || null;
    const starGrid = star ? qualiPos[key(star)] : undefined;
    const gain = star && starGrid != null ? starGrid - star.finish_position : null;
    return { cls: cls.replace(/\s*-\s*.*$/, ''), podium, vsd, star, starGrid, gain };
  }, [data]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !recap) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      const t = setTimeout(() => { setGo(true); setGainShown(recap.gain || 0); }, 0);
      return () => clearTimeout(t);
    }
    let timer;
    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      setGo(true);
      if (recap.gain > 0) {
        let n = 0;
        setTimeout(() => {
          timer = setInterval(() => { n += 1; setGainShown(n); if (n >= recap.gain) clearInterval(timer); }, 120);
        }, 1900);
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => { io.disconnect(); clearInterval(timer); };
  }, [recap]);

  if (!recap) return null;
  const order = [recap.podium[1], recap.podium[0], recap.podium[2]];
  const steps = ['p2', 'p1', 'p3'];
  const starPhoto = recap.star ? resolvePhotoUrl(recap.star.driver_id, socialFlags) : null;

  return (
    <section ref={ref} className={`rr-recap${go ? ' is-go' : ''}`} aria-label="Riepilogo gara">
      <div className="rr-eyebrow">RACE RECAP · {recap.cls}</div>
      <div className="rr-podium">
        {order.map((r, i) => r && (
          <div key={r.result_id || i} className={`rr-step rr-${steps[i]}${r.is_vsd_driver ? ' is-vsd' : ''}`}>
            <div className="rr-who">
              <b>{nameOf(r, drivers)}{r.is_vsd_driver ? ' · VSD' : ''}</b>
              <small>{r.car_external_name || ''}</small>
            </div>
            <div className="rr-block">{r.finish_position}</div>
          </div>
        ))}
      </div>

      {recap.star && (
        <div className="rr-star">
          {starPhoto
            ? <img src={starPhoto} alt="" />
            : <div className="rr-star-fallback">{nameOf(recap.star, drivers).slice(0, 1)}</div>}
          <div>
            <div className="rr-star-label">Pilota VSD della gara</div>
            {drivers?.[recap.star.driver_id]
              ? <Link to={`/roster/${recap.star.driver_id}`} className="rr-star-name">{nameOf(recap.star, drivers)}</Link>
              : <div className="rr-star-name">{nameOf(recap.star, drivers)}</div>}
            <div className="rr-star-sub">
              {recap.starGrid != null
                ? `Partito ${recap.starGrid}° → arrivato ${recap.star.finish_position}°`
                : `Arrivato ${recap.star.finish_position}°`}
            </div>
          </div>
          {recap.gain > 0 && (
            <div className="rr-gain"><b>+{gainShown}</b><small>POSIZIONI</small></div>
          )}
        </div>
      )}

      {recap.vsd.length > 0 && (
        <div className="rr-list">
          {recap.vsd.map((r, i) => (
            <div key={r.result_id || i} style={{ transitionDelay: `${2 + i * 0.12}s` }}>
              <span>{r.finish_position}° {nameOf(r, drivers)}</span>
              {r.point_total != null && <b>{Number(r.point_total)} pt</b>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
