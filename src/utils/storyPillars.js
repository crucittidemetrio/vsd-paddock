// Capitoli "story book" — sfida ACI LMGT3 Challenge 2026 (piloti VSD che
// tentano di qualificarsi a un campionato reale organizzato da ACI Sport).
// A differenza dei pilastri editoriali "normali" (SocialManager.jsx), non
// hanno né una data fissa né una cadenza: dipendono da eventi reali
// imprevedibili (si passano le prequalifiche o no, quando arriva il
// prossimo risultato). Per questo sono "a milestone" — una lista curata
// di capitoli possibili, creabili a mano quando succede qualcosa di vero
// da raccontare, e ripetibili (es. un weekend di gara per ogni round)
// invece che un solo slot per pilastro.
//
// Fonte unica condivisa da SocialManager.jsx (dove i capitoli vengono
// scritti, come post con status bozza/programmato/pubblicato) e da
// AciLmgt3Challenge.jsx (dove i capitoli con status "pubblicato" vengono
// letti in ordine cronologico come un libro, per il pubblico).
export const STORY_PILLARS = [
  { id: 'story_prequalifiche', label: 'Prequalifiche — esito', icon: '📖',
    hint: 'Il capitolo che tutti aspettano: chi ce l\'ha fatta?' },
  { id: 'story_qualifiche', label: 'Qualifiche ACI', icon: '📖',
    hint: 'Round di ingresso al campionato vero e proprio' },
  { id: 'story_weekend', label: 'Weekend di gara ACI', icon: '📖',
    hint: 'Un capitolo per ogni round — ripetibile' },
  { id: 'story_bilancio', label: 'Bilancio di fine avventura', icon: '📖',
    hint: 'Come è andata, cosa resta alla squadra' },
];

export const STORY_PILLAR_IDS = STORY_PILLARS.map(p => p.id);

export function storyPillarLabel(pillarId) {
  return STORY_PILLARS.find(p => p.id === pillarId)?.label || pillarId;
}

export function storyTopic(pillarId) {
  const p = STORY_PILLARS.find(s => s.id === pillarId);
  return p ? `${p.label} — ${p.hint}` : '';
}
