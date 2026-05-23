import { useMemo } from 'react';

/**
 * Sparkline SVG inline. Mostra la progressione di una serie di lap_time_ms.
 * - Tempi più veloci (ms bassi) vanno in ALTO nel grafico
 * - Asse X = ordine cronologico (vecchio → recente)
 * - Ultimo punto evidenziato con cerchio pieno
 *
 * @param {number[]} values - lap_time_ms in ordine cronologico ascendente
 * @param {number} [width=80]
 * @param {number} [height=24]
 * @param {string} [color] - colore CSS (var o hex)
 */
export default function Sparkline({ values, width = 80, height = 24, color = 'var(--vsd-cyan)' }) {
  const { points, lastPoint } = useMemo(() => {
    if (!values || values.length < 2) return { points: '', lastPoint: null };

    const nums = values.map(Number).filter(Number.isFinite);
    if (nums.length < 2) return { points: '', lastPoint: null };

    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = max - min || 1;

    const padding = 2;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;

    const coords = nums.map((v, i) => {
      const x = padding + (i / (nums.length - 1)) * innerW;
      // Inverte Y: tempo basso (= veloce) → Y basso (in alto nello SVG)
      const y = padding + ((v - min) / range) * innerH;
      return { x, y };
    });

    return {
      points: coords.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
      lastPoint: coords[coords.length - 1],
    };
  }, [values, width, height]);

  if (!values || values.length === 0) {
    return <span className="sparkline-empty">—</span>;
  }

  // 1 solo dato: punto centrale
  if (values.length === 1) {
    return (
      <svg width={width} height={height} className="sparkline" aria-label="Sparkline trend">
        <circle cx={width / 2} cy={height / 2} r={2.5} fill={color} />
      </svg>
    );
  }

  return (
    <svg width={width} height={height} className="sparkline" aria-label="Sparkline trend">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
      {lastPoint && (
        <circle cx={lastPoint.x} cy={lastPoint.y} r={2.5} fill={color} />
      )}
    </svg>
  );
}