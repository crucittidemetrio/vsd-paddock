-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Hardening: search_path fisso
-- ═══════════════════════════════════════════════════════════
-- Fix linter Supabase (WARN "function_search_path_mutable"): una
-- funzione SECURITY DEFINER senza search_path fisso è vulnerabile
-- a hijacking — un ruolo malevolo potrebbe creare un oggetto
-- omonimo in uno schema che precede 'public' nel search_path di
-- sessione, e current_driver_team_id() lo userebbe al posto di
-- quello vero. Fissarlo elimina il rischio.
-- ═══════════════════════════════════════════════════════════

alter function current_driver_team_id() set search_path = public, pg_temp;
