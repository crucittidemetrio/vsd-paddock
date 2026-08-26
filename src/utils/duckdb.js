// ===========================================
// VSD PADDOCK — duckdb-wasm setup (ADR-LMU-Integration, Obiettivo 1)
// ===========================================
// Inizializzazione duckdb-wasm per il progetto Vite (non Next.js — il
// pacchetto di riferimento assumeva import.meta.url / URL bundling
// standard, compatibile con Vite tramite i suffissi `?url` sotto).
// Nessuna modifica ad Apps Script: il file .duckdb non lascia mai il
// browser del pilota (vedi ADR, Obiettivo 1 — Opzione A).
//
// ATTENZIONE — SCHEMA NON VERIFICATO (bloccante, vedi ADR §4 punto 1):
// i nomi di tabelle/colonne usati da TelemetryViewer.jsx (stints,
// telemetry_samples, throttle/brake/steering/speed_kmh) sono placeholder
// ragionevoli, MAI validati contro un vero export .duckdb di LMU. Prima
// del rollout va aperto un file reale e corretta la query in
// TelemetryViewer.jsx di conseguenza — questo file (apertura DB/file)
// resta valido a prescindere dallo schema interno.

import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

let dbInstance = null;

/**
 * Inizializza (una sola volta) un'istanza duckdb-wasm nel browser.
 * Riusa la stessa istanza tra navigazioni della pagina /telemetry.
 */
export async function getDuckDB() {
  if (dbInstance) return dbInstance;

  const MANUAL_BUNDLES = {
    mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
    eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
  };

  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  dbInstance = db;
  return db;
}

/**
 * Carica un file .duckdb selezionato/trascinato dal pilota e apre una
 * connessione per interrogarlo. Il file non lascia mai il browser.
 *
 * @param {File} file - file .duckdb da drag&drop o input file
 * @returns {Promise<{db: object, conn: object}>}
 */
export async function openLocalTelemetryFile(file) {
  const db = await getDuckDB();
  const buffer = new Uint8Array(await file.arrayBuffer());

  await db.registerFileBuffer(file.name, buffer);

  const conn = await db.connect();
  // LMU salva il DB come file singolo: lo apriamo come attached database.
  await conn.query(`ATTACH '${file.name}' AS lmu_telemetry (READ_ONLY)`);

  return { db, conn };
}

export async function closeConnection(conn) {
  if (conn) await conn.close();
}
