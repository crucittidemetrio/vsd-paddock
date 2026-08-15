// Driver_id → foto reale disponibile in public/drivers/<driver_id>.jpg.
// Le foto vengono compresse (480x480, JPEG) da media/drivers/ prima di
// finire qui — non aggiungere PNG originali da svariati MB in public/.
// Aggiornare questo elenco quando arrivano nuove foto.
export const DRIVERS_WITH_PHOTO = new Set([
  'VSD005', 'VSD007', 'VSD008', 'VSD009', 'VSD011',
  'VSD013', 'VSD018', 'VSD020', 'VSD021', 'VSD022',
]);

/**
 * URL della foto reale di un pilota, o null se non disponibile.
 * NON tiene conto del consenso — quello è responsabilità di chi
 * chiama (vedi useConsentedDriverPhoto in hooks/useConsent.js), così
 * questa funzione resta un semplice lookup senza dipendenze da rete.
 */
export function driverPhotoUrl(driverId) {
  if (!driverId || !DRIVERS_WITH_PHOTO.has(driverId)) return null;
  return `/drivers/${driverId}.jpg`;
}
