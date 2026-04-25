import './CategoryPill.css';

/**
 * Pill per categoria auto: GT3, LMP2, Hypercar, F1, ecc.
 * Colore deterministico basato su categoria.
 */
const CATEGORY_COLORS = {
  GT3: 'var(--vsd-cyan)',
  GT4: 'var(--vsd-blue)',
  LMP2: 'var(--vsd-orange)',
  LMH: 'var(--vsd-red)',
  Hypercar: 'var(--vsd-red)',
  F1: '#7b5bff',
  Formula: '#7b5bff',
  Prototype: 'var(--vsd-orange)',
  TCR: '#34d399',
  Other: 'var(--color-text-muted)',
};

export default function CategoryPill({ category }) {
  if (!category) return null;
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
  return (
    <span className="category-pill" style={{ color, borderColor: color }}>
      {category}
    </span>
  );
}