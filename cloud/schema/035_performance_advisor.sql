-- #470 (07/10/2026) — correzioni Performance Advisor Supabase.
-- 1) Indici su tutte le 55 chiavi esterne senza indice (join/delete più veloci).
-- 2) RLS: auth.uid()/auth.role() valutati una volta per query (select ...) invece
--    che per riga; le due policy UPDATE permissive su drivers unite in una
--    (stessa semantica: self OPPURE staff/admin del proprio team).

create index if not exists idx_audit_log_driver_id on public.audit_log (driver_id);
create index if not exists idx_best_lap_submissions_driver_id on public.best_lap_submissions (driver_id);
create index if not exists idx_best_lap_submissions_reviewed_by on public.best_lap_submissions (reviewed_by);
create index if not exists idx_best_laps_team_id on public.best_laps (team_id);
create index if not exists idx_best_laps_driver_id on public.best_laps (driver_id);
create index if not exists idx_best_laps_verified_by on public.best_laps (verified_by);
create index if not exists idx_candidates_updated_by on public.candidates (updated_by);
create index if not exists idx_championship_interest_driver_id on public.championship_interest (driver_id);
create index if not exists idx_clash_participants_driver_id on public.clash_participants (driver_id);
create index if not exists idx_clash_results_driver_id on public.clash_results (driver_id);
create index if not exists idx_clash_results_entered_by on public.clash_results (entered_by);
create index if not exists idx_consents_driver_id on public.consents (driver_id);
create index if not exists idx_driver_elo_history_driver_id on public.driver_elo_history (driver_id);
create index if not exists idx_driver_elo_ratings_driver_id on public.driver_elo_ratings (driver_id);
create index if not exists idx_driver_safety_rank_history_incident_resolution_id on public.driver_safety_rank_history (incident_resolution_id);
create index if not exists idx_driver_safety_rank_history_driver_id on public.driver_safety_rank_history (driver_id);
create index if not exists idx_driver_safety_ranks_driver_id on public.driver_safety_ranks (driver_id);
create index if not exists idx_drivers_auth_user_id on public.drivers (auth_user_id);
create index if not exists idx_endurance_auditions_created_by on public.endurance_auditions (created_by);
create index if not exists idx_endurance_participants_driver_id on public.endurance_participants (driver_id);
create index if not exists idx_endurance_participants_added_by on public.endurance_participants (added_by);
create index if not exists idx_endurance_stints_created_by on public.endurance_stints (created_by);
create index if not exists idx_endurance_stints_driver_id on public.endurance_stints (driver_id);
create index if not exists idx_fuel_live_pings_driver_id on public.fuel_live_pings (driver_id);
create index if not exists idx_fuel_log_driver_id on public.fuel_log (driver_id);
create index if not exists idx_incident_reports_team_id_championship_id on public.incident_reports (team_id, championship_id);
create index if not exists idx_incident_resolutions_team_id on public.incident_resolutions (team_id);
create index if not exists idx_incident_resolutions_penalized_driver_id on public.incident_resolutions (penalized_driver_id);
create index if not exists idx_incident_resolutions_resolved_by on public.incident_resolutions (resolved_by);
create index if not exists idx_lap_data_driver_id on public.lap_data (driver_id);
create index if not exists idx_pitwall_sessions_driver_id on public.pitwall_sessions (driver_id);
create index if not exists idx_prequal_candidates_created_by on public.prequal_candidates (created_by);
create index if not exists idx_race_crews_team_id on public.race_crews (team_id);
create index if not exists idx_race_crews_driver_id on public.race_crews (driver_id);
create index if not exists idx_race_crews_added_by on public.race_crews (added_by);
create index if not exists idx_race_reports_race_id on public.race_reports (race_id);
create index if not exists idx_race_reports_driver_id on public.race_reports (driver_id);
create index if not exists idx_race_reports_updated_by on public.race_reports (updated_by);
create index if not exists idx_race_results_race_id on public.race_results (race_id);
create index if not exists idx_race_results_driver_id on public.race_results (driver_id);
create index if not exists idx_race_rsvps_team_id on public.race_rsvps (team_id);
create index if not exists idx_race_rsvps_driver_id on public.race_rsvps (driver_id);
create index if not exists idx_report_reactions_driver_id on public.report_reactions (driver_id);
create index if not exists idx_session_rsvps_driver_id on public.session_rsvps (driver_id);
create index if not exists idx_skill_index_history_driver_id on public.skill_index_history (driver_id);
create index if not exists idx_social_media_uploaded_by on public.social_media (uploaded_by);
create index if not exists idx_social_metrics_recorded_by on public.social_metrics (recorded_by);
create index if not exists idx_social_plan_dismissed_race_id on public.social_plan_dismissed (race_id);
create index if not exists idx_social_plan_dismissed_dismissed_by on public.social_plan_dismissed (dismissed_by);
create index if not exists idx_social_posts_created_by on public.social_posts (created_by);
create index if not exists idx_social_posts_race_id on public.social_posts (race_id);
create index if not exists idx_sponsors_updated_by on public.sponsors (updated_by);
create index if not exists idx_team_sessions_team_id on public.team_sessions (team_id);
create index if not exists idx_team_sessions_created_by on public.team_sessions (created_by);
create index if not exists idx_treasury_entries_updated_by on public.treasury_entries (updated_by);

-- RLS
drop policy if exists "cars: lettura per chiunque autenticato" on public.cars;
create policy "cars: lettura per chiunque autenticato" on public.cars
  for select using ((select auth.role()) = 'authenticated');

drop policy if exists "tracks: lettura per chiunque autenticato" on public.tracks;
create policy "tracks: lettura per chiunque autenticato" on public.tracks
  for select using ((select auth.role()) = 'authenticated');

drop policy if exists "drivers: self o staff/admin leggono il dettaglio privato" on public.drivers;
create policy "drivers: self o staff/admin leggono il dettaglio privato" on public.drivers
  for select using (
    auth_user_id = (select auth.uid())
    or (team_id = public.current_driver_team_id() and public.current_driver_is_staff_or_admin())
  );

drop policy if exists "drivers: self aggiorna il proprio profilo" on public.drivers;
drop policy if exists "drivers: solo staff/admin possono scrivere" on public.drivers;
create policy "drivers: update self o staff/admin del team" on public.drivers
  for update
  using (
    auth_user_id = (select auth.uid())
    or (team_id = public.current_driver_team_id() and public.current_driver_is_staff_or_admin())
  )
  with check (
    auth_user_id = (select auth.uid())
    or (team_id = public.current_driver_team_id() and public.current_driver_is_staff_or_admin())
  );
