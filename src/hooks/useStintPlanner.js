import { useState, useCallback } from 'react';
import { api } from '../api/client';
import { validatePlanCoverage, validatePilotLimits } from '../utils/stintValidation';

/**
 * Custom hook per orchestrare il flusso di creazione, modifica e conferma
 * di un piano di stint per gare endurance.
 *
 * Gestisce lo stato in memoria degli stint prima del salvataggio definitivo
 * e i flag di caricamento per le operazioni asincrone.
 *
 * Validazione: STRADA 3 — il piano in memoria è validato lato client
 * (validatePlanCoverage, istantaneo, nessun round-trip). Il validateCoverage
 * backend resta per i piani GIÀ persistiti (es. modifiche manuali in AdminRaceStints).
 *
 * @returns {Object} Stato corrente e funzioni di manipolazione/chiamata API.
 */
export function useStintPlanner() {
  const [plan, setPlan] = useState([]);
  const [validation, setValidation] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const [error, setError] = useState(null);

  /**
   * Genera un nuovo piano di stint tramite chiamata API.
   * Popola il piano in memoria assegnando un _localId univoco a ciascun record.
   *
   * @param {Object} params - { race_id, race_start_time, total_duration_min, target_stint_min, driver_ids }
   */
  const generate = useCallback(async (params) => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await api.endurance.stints.generate(params);
      const newPlan = (response?.stints || []).map((stint, index) => ({
        ...stint,
        _localId: `local_${Date.now()}_${index}`,
      }));
      setPlan(newPlan);
      setValidation(null); // nuovo piano: validazione azzerata
    } catch (err) {
      setError(err.message || 'Errore durante la generazione del piano stint.');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /**
   * Aggiorna in memoria un singolo stint tramite il suo _localId.
   * Azzera la validazione: il piano è cambiato, l'esito precedente è obsoleto.
   *
   * @param {string} localId - ID temporaneo dello stint da modificare.
   * @param {Object} changes - Campi parziali da aggiornare (es. { driver_id: 'VSD006' }).
   */
  const updateStintInPlan = useCallback((localId, changes) => {
    setPlan((prevPlan) =>
      prevPlan.map((stint) =>
        stint._localId === localId ? { ...stint, ...changes } : stint
      )
    );
    setValidation(null);
  }, []);

  /**
   * Valida il piano IN MEMORIA lato client (istantaneo, no rete).
   * Coerente con strada 3: si valida il piano proposto prima della scrittura.
   *
   * @param {Object} raceParams - { race_start_time, total_duration_min }
   */
  const validate = useCallback((raceParams, limits) => {
    const coverage = validatePlanCoverage(
      plan,
      raceParams.race_start_time,
      raceParams.total_duration_min
    );
    const pilot = validatePilotLimits(plan, limits || {});
    const merged = {
      valid: coverage.valid && pilot.valid,
      issues: [...coverage.issues, ...pilot.issues],
    };
    setValidation(merged);
    return merged;
  }, [plan]);

  /**
   * Conferma e scrive il piano in memoria sul backend.
   * Rimuove _localId prima dell'invio.
   *
   * @param {string} raceId
   * @param {boolean} replaceExisting - se true sovrascrive gli stint esistenti della gara.
   * @returns {Promise<Object>} risultato al successo.
   */
  const confirm = useCallback(async (raceId, replaceExisting) => {
    setIsConfirming(true);
    setError(null);
    try {
      const stintsToSave = plan.map(({ _localId, ...rest }) => rest);
      const response = await api.endurance.stints.confirmPlan({
        race_id: raceId,
        stints: stintsToSave,
        replace_existing: replaceExisting,
      });
      return response;
    } catch (err) {
      setError(err.message || 'Errore durante la conferma del piano.');
      throw err;
    } finally {
      setIsConfirming(false);
    }
  }, [plan]);

  /**
   * Resetta completamente lo stato dell'hook.
   */
  const reset = useCallback(() => {
    setPlan([]);
    setValidation(null);
    setError(null);
  }, []);

  return {
    plan,
    validation,
    isGenerating,
    isConfirming,
    error,
    generate,
    updateStintInPlan,
    validate,
    confirm,
    reset,
  };
}
