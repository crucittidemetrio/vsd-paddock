// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Stato pilota (attivo vs ex-VSD)
// ═══════════════════════════════════════════════════════════
// Un unico criterio condiviso per decidere se un pilota è "in squadra
// adesso" — usato per escludere ex-tesserati dai confronti competitivi
// (Best Laps, Muro dei Record, Attività Team in Landing.jsx) senza mai
// toccare/cancellare i loro dati storici (restano nello sheet, solo
// non compaiono nelle viste di confronto tra compagni attuali).

/**
 * @param {Object} driver - riga da useDrivers({ includeRemoved: true })
 * @returns {boolean} true se il pilota è attualmente un tesserato attivo
 */
export function isActiveDriver(driver) {
  if (!driver) return false;
  if (driver.is_ex_vsd || driver.removed_at) return false;
  return driver.status === 'active';
}

/**
 * @param {Array} drivers - roster completo (includeRemoved: true)
 * @returns {Set<string>} driver_id di tutti i tesserati attivi
 */
export function activeDriverIdSet(drivers) {
  const set = new Set();
  (drivers || []).forEach(d => {
    if (isActiveDriver(d)) set.add(d.driver_id);
  });
  return set;
}
