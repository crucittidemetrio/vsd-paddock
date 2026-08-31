// ═══════════════════════════════════════════════════════════
// VSD PADDOCK — Setup Folders (Google Drive)
// ═══════════════════════════════════════════════════════════
// Genera/mantiene la struttura di cartelle per i setup auto del
// team dentro la cartella Drive "VSD-Paddock Setup":
//
//   VSD-Paddock Setup/
//     └── <Circuito>/
//           └── <Categoria>/
//                 └── <Auto>/
//
// Perché SOLO LMU e non anche IRC/ACE: LMU è l'unico simulatore su
// cui lo sviluppo del team è attivo (vedi standing priority "Garage61
// è solo per IRC, tutto il resto si concentra su LMU"). Una struttura
// completa su tutti e 3 i simulatori userebbe la stessa cardinalità
// di Circuito×Categoria×Auto ma con IRC da solo (~130 circuiti) a
// gonfiare il totale di migliaia di cartelle quasi tutte vuote per
// anni — quindi qui restiamo scoped a LMU. Se in futuro servirà
// anche per IRC/ACE, si clona lo stesso pattern con un altro sim.
//
// Non tocca i 7 file .svm già presenti nella root della cartella:
// restano dove sono, la struttura nuova si popola da qui in avanti.
//
// Funzione IDEMPOTENTE e SICURA da rieseguire più volte: prima di
// creare una cartella controlla se esiste già (per nome) sotto lo
// stesso genitore. Se Tracks/Cars cambiano (nuovo circuito o auto
// omologata), rieseguire semplicemente aggiunge le cartelle mancanti
// senza toccare quelle esistenti (e i file già caricati dentro).
//
// Al primo avvio da editor Apps Script chiederà l'autorizzazione
// allo scope Google Drive (nuovo, mai usato finora dal progetto) —
// è normale, va autorizzato una tantum con l'account che possiede la
// cartella (v.sim.driver@gmail.com).
// ═══════════════════════════════════════════════════════════

// ID della cartella Drive "VSD-Paddock Setup" (proprietario
// v.sim.driver@gmail.com). Se la cartella viene ricreata altrove,
// aggiornare solo questa costante.
const SETUP_ROOT_FOLDER_ID = '15nJLO2Ew11UXu7F-uApmeia6O-4iRs5z';

/**
 * Ritorna una mappa {nome: DriveFolder} dei figli diretti (solo
 * cartelle) di parent, con una singola scansione — evita di chiamare
 * getFoldersByName() una volta per figlio (lento su strutture larghe:
 * qui ogni "Circuito" ha ~5 categorie, ogni categoria fino a ~13 auto).
 */
function listChildFolders_(parent) {
  const map = {};
  const it = parent.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    map[f.getName()] = f;
  }
  return map;
}

/**
 * Crea la struttura Circuito/Categoria/Auto per LMU dentro
 * SETUP_ROOT_FOLDER_ID, usando i dati reali (e sempre aggiornati)
 * dei fogli Tracks e Cars. Da eseguire manualmente dall'editor Apps
 * Script (menu a tendina delle funzioni) — non è un'azione esposta
 * via ACTIONS/webapp, è manutenzione una tantum come le altre
 * funzioni setupXxx del progetto.
 *
 * Esecuzioni consumer Apps Script hanno un limite di 6 minuti: con
 * ~34 circuiti × ~5 categorie × auto per categoria (~1000+ cartelle
 * al primo run) è possibile che serva più di un'esecuzione. Nessun
 * problema: rilanciarla semplicemente riprende da dove si era
 * fermata, grazie a listChildFolders_ che salta ciò che esiste già.
 */
function setupLmuSetupFolders() {
  const root = DriveApp.getFolderById(SETUP_ROOT_FOLDER_ID);

  const tracks = sheetToObjects(SHEETS.TRACKS)
    .filter(t => t.sim === 'LMU' && (t.active === true || t.active === 'TRUE'));
  const cars = sheetToObjects(SHEETS.CARS)
    .filter(c => c.sim === 'LMU' && (c.active === true || c.active === 'TRUE'));

  if (tracks.length === 0 || cars.length === 0) {
    Logger.log('⚠️  Nessun circuito/auto LMU attivo trovato in Tracks/Cars — controlla i fogli prima di rieseguire.');
    return;
  }

  // Nomi circuito unici (alcuni tracciati hanno più varianti/layout in
  // righe distinte — qui raggruppiamo per track_name: la cartella
  // setup è per circuito, non per singolo layout).
  const trackNames = Array.from(new Set(tracks.map(t => String(t.track_name || '').trim()).filter(Boolean))).sort();

  // Categorie realmente presenti tra le auto LMU attive (es. GTE, GT3,
  // LMP3, LMP2, LMH) — non hardcoded, così se ne arriva una nuova nel
  // foglio Cars la struttura la include automaticamente.
  const categories = Array.from(new Set(cars.map(c => String(c.category || '').trim()).filter(Boolean))).sort();

  // Auto per categoria.
  const carsByCategory = {};
  categories.forEach(cat => { carsByCategory[cat] = []; });
  cars.forEach(c => {
    const cat = String(c.category || '').trim();
    const name = String(c.car_name || '').trim();
    if (cat && name && carsByCategory[cat] && carsByCategory[cat].indexOf(name) === -1) {
      carsByCategory[cat].push(name);
    }
  });

  Logger.log(`Struttura da generare: ${trackNames.length} circuiti × ${categories.length} categorie, auto totali: ${cars.length}`);

  let createdTracks = 0, createdCategories = 0, createdCars = 0, skipped = 0;
  const rootChildren = listChildFolders_(root);

  trackNames.forEach(trackName => {
    let trackFolder = rootChildren[trackName];
    if (!trackFolder) {
      trackFolder = root.createFolder(trackName);
      rootChildren[trackName] = trackFolder;
      createdTracks++;
    } else {
      skipped++;
    }

    const trackChildren = listChildFolders_(trackFolder);
    categories.forEach(cat => {
      let catFolder = trackChildren[cat];
      if (!catFolder) {
        catFolder = trackFolder.createFolder(cat);
        trackChildren[cat] = catFolder;
        createdCategories++;
      } else {
        skipped++;
      }

      const catChildren = listChildFolders_(catFolder);
      (carsByCategory[cat] || []).forEach(carName => {
        if (!catChildren[carName]) {
          catFolder.createFolder(carName);
          catChildren[carName] = true; // segna come creata, non serve l'oggetto
          createdCars++;
        } else {
          skipped++;
        }
      });
    });
  });

  Logger.log(`✅ Fatto. Creati: ${createdTracks} circuiti, ${createdCategories} cartelle categoria, ${createdCars} cartelle auto. Già esistenti (saltati): ${skipped}.`);
  Logger.log('Se l\'esecuzione si è fermata per timeout (6 minuti), rilancia semplicemente setupLmuSetupFolders(): riprende da dove si era fermata.');
}
