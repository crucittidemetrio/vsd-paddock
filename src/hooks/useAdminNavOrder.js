import { useState } from 'react';

const STORAGE_KEY = 'vsd_admin_nav_order_v1';

function loadOrder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOrder(order) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // storage pieno/disabilitato — l'ordine personalizzato non persiste,
    // ma la UI resta comunque utilizzabile con l'ordine di default.
  }
}

/**
 * Ordine personalizzabile per le voci della sezione Admin della sidebar.
 * L'ordine scelto vive solo in localStorage di questo browser (preferenza
 * personale, non dato di squadra) — non richiede backend. Nessuna
 * memoizzazione: la lista Admin ha poche voci, non serve ottimizzare.
 *
 * @param {Array<{to: string}>} items - voci Admin visibili all'utente corrente
 *   (già filtrate per ruolo a monte, in Sidebar.jsx)
 * @returns {{ items: Array, move: (to: string, dir: 'up'|'down') => void,
 *   reset: () => void, hasCustomOrder: boolean }}
 */
export function useAdminNavOrder(items) {
  const [order, setOrder] = useState(loadOrder);

  // Voci salvate ma non più presenti (pagina rimossa) vengono scartate;
  // voci nuove non ancora in nessun ordine salvato vengono accodate in
  // fondo, nel loro ordine di default.
  const knownKeys = new Set(items.map(i => i.to));
  const validOrder = order.filter(to => knownKeys.has(to));
  const missing = items.filter(i => !validOrder.includes(i.to)).map(i => i.to);
  const fullOrder = [...validOrder, ...missing];

  const byKey = new Map(items.map(i => [i.to, i]));
  const ordered = fullOrder.map(to => byKey.get(to)).filter(Boolean);

  function move(to, direction) {
    const idx = fullOrder.indexOf(to);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= fullOrder.length) return;
    const next = [...fullOrder];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    saveOrder(next);
    setOrder(next);
  }

  function reset() {
    saveOrder([]);
    setOrder([]);
  }

  return { items: ordered, move, reset, hasCustomOrder: validOrder.length > 0 };
}
