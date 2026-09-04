-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Dominio Roster: fix policy + self-edit
-- ═══════════════════════════════════════════════════════════
-- Porting di apps-script/Roster.js. Logica di riferimento reale
-- (non riscritta a memoria — letta dal file sorgente):
--
--   roster.list   → SEMPRE livello 'public', anche per staff/admin
--                    (decisione esplicita: la lista è una directory
--                    leggera, il dettaglio privato sta in roster.get)
--   roster.get    → 'private' se isStaff O isSelf, altrimenti 'public'
--   updateSelf    → solo bio/instagram/facebook/roster_track,
--                    driver_id sempre da ctx mai dal payload,
--                    roster_track vincolato a un enum
--
-- FIX rispetto a 001: la policy SELECT lì definita
-- ("drivers: solo il proprio team") permetteva a QUALSIASI membro
-- del team di leggere le colonne private (real_name/email/
-- can_message) di chiunque altro — non è quello che fa il sistema
-- reale (dove il default è sempre 'public' salvo self/staff). Qui
-- si restringe e si separano i due percorsi di lettura.
-- ═══════════════════════════════════════════════════════════

-- ─── FIX: SELECT sulla tabella base solo per self o staff/admin ───
-- Chiunque altro deve passare dalla vista drivers_public (sotto).

drop policy if exists "drivers: solo il proprio team" on drivers;

create policy "drivers: self o staff/admin leggono il dettaglio privato"
  on drivers for select
  using (
    auth_user_id = auth.uid()
    or exists (
      select 1 from drivers me
      where me.auth_user_id = auth.uid()
        and me.team_id = drivers.team_id
        and me.role in ('staff', 'admin')
    )
  );

-- ─── FIX: drivers_public deve essere security_invoker + team-scoped ───
-- Senza security_invoker, una vista Postgres valuta i permessi con
-- l'identità di chi l'ha CREATA, non di chi la interroga — su questo
-- schema significherebbe bypassare la RLS appena sopra. Il filtro
-- esplicito su team_id è una seconda barriera (difesa in profondità),
-- non ci si affida solo alla RLS della tabella sottostante.

drop view if exists drivers_public;

create view drivers_public
with (security_invoker = true)
as
select
  id, team_id, driver_code, display_name, role, status, join_date,
  nationality, preferred_sims, specialties, avatar_url, bio,
  iracing_id, lmu_id, ace_id, discord_id, race_number,
  instagram, facebook, roster_track,
  (removed_at is not null) as is_ex_driver,
  removed_at
from drivers
where is_system_account = false
  and team_id = current_driver_team_id();

comment on view drivers_public is 'roster.list e vista pubblica di roster.get. security_invoker=true: valuta RLS come il chiamante, non come il proprietario della vista.';

-- ─── Self-edit: roster.updateSelf ───
-- ROSTER_SELF_EDITABLE_FIELDS reale = bio, instagram, facebook,
-- roster_track. Deliberatamente NON avatar_url (vedi commento
-- originale in Roster.js: niente canale di upload libero).

alter table drivers
  add constraint roster_track_enum
  check (roster_track is null or roster_track in ('competitivo', 'amatoriale'));

create policy "drivers: self aggiorna il proprio profilo"
  on drivers for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Grant a livello di COLONNA — non basta la policy sopra: senza
-- questo, la policy permetterebbe a un driver di aggiornare anche
-- role/status/can_message su se stesso. La RLS filtra le RIGHE, i
-- privilegi di colonna filtrano quali COLONNE sono scrivibili.
revoke update on drivers from authenticated;
grant update (bio, instagram, facebook, roster_track) on drivers to authenticated;

-- Staff/admin restano sulla policy "drivers: solo staff/admin
-- possono scrivere" definita in 001 (nessun limite di colonna:
-- servono per role/status/can_message/removed_at).
