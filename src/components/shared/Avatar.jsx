import './Avatar.css';

/**
 * Avatar con iniziali generate dal display_name.
 * Color hash deterministico: stesso pilota → stesso gradient sempre.
 */
const PALETTES = [
  ['#00d4ff', '#3b8bff'],   // cyan → blu
  ['#3b8bff', '#7b5bff'],   // blu → viola
  ['#f5a623', '#ef3340'],   // arancio → rosso
  ['#34d399', '#00d4ff'],   // verde → cyan
  ['#ef3340', '#7b5bff'],   // rosso → viola
  ['#00d4ff', '#34d399'],   // cyan → verde
];

function hashPalette(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(h) % PALETTES.length];
}

function getInitials(name) {
  if (!name) return '?';
  // Estrae iniziali ignorando "soprannomi" tra virgolette
  const clean = name.replace(/["']/g, '');
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name, driverId, size = 40, ring = false }) {
  const initials = getInitials(name);
  const [c1, c2] = hashPalette(driverId || name || '');
  return (
    <div
      className={`avatar${ring ? ' avatar-ring' : ''}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        fontSize: Math.round(size * 0.36),
      }}
      title={name}
    >
      {initials}
    </div>
  );
}