import logoSrc from '../../assets/vsd-logo.png';

/**
 * Logo VSD ufficiale.
 * - size: altezza in px (la larghezza è auto)
 * - withWordmark: se true, aggiunge "VSD · PADDOCK" accanto
 * - glow: alone cyan dietro al logo (per hero/landing)
 */
export default function Logo({ size = 40, withWordmark = false, glow = false }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <img
        src={logoSrc}
        alt="VSD"
        height={size}
        style={{
          height: size,
          width: 'auto',
          display: 'block',
          filter: glow ? 'drop-shadow(0 0 16px rgba(0, 212, 255, 0.45))' : 'none',
        }}
      />
      {withWordmark && (
        <div style={{ lineHeight: 1.05, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.3em',
              color: 'var(--vsd-cyan)',
            }}
          >
            VSD
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.05em',
              background: 'linear-gradient(90deg, var(--vsd-cyan), var(--vsd-blue))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            PADDOCK
          </span>
        </div>
      )}
    </div>
  );
}