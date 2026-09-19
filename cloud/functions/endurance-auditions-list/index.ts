// ═══════════════════════════════════════════════════════════
// SUPERSEDED — questo slug (endurance-auditions-list) è deployato
// su Supabase con il contenuto di cloud/functions/endurance-read/index.ts
// (dispatcher READ consolidato per l'intero dominio #259: Endurance),
// non con questo file locale a singola azione.
//
// Motivo: il progetto Supabase ha raggiunto il tetto di 100 Edge
// Function sul piano free (spend cap disattivato per scelta esplicita
// dell'utente, 17 set 2026) subito dopo il deploy di questo file —
// senza un delete_edge_function disponibile via API, lo slot era
// irrecuperabile, quindi lo slug è stato RIUSATO (redeploy, nuova
// versione) per ospitare il dispatcher consolidato invece che una
// nuova function separata.
//
// Fonte di verità: cloud/functions/endurance-read/index.ts.
// Vedi cloud/README.md per la nota completa sulla deviazione.
// ═══════════════════════════════════════════════════════════
