-- ═══════════════════════════════════════════════════════════
-- VSD-Paddock Cloud — Auth: collegamento automatico Discord→driver
-- ═══════════════════════════════════════════════════════════
-- Quando un pilota fa login con Discord per la prima volta, Supabase
-- Auth crea una riga in auth.users. Questo trigger collega quella
-- riga alla riga drivers ESISTENTE con lo stesso discord_id (import
-- one-off da Drivers sheet, vedi cloud/README punto 2) — non crea
-- mai un driver nuovo da solo: un account Discord senza un driver
-- corrispondente nel team resta semplicemente non collegato
-- (auth_user_id null), niente self-service signup implicito.
--
-- NOTA: il nome del campo con l'id Discord dentro raw_user_meta_data
-- va verificato al primo login reale una volta configurato il
-- provider (dashboard → Authentication → Users → riga nuova →
-- Raw User Meta Data) — 'provider_id'/'sub' sono i nomi standard
-- usati da Supabase per il provider Discord, ma vanno confermati
-- prima di fidarsi in produzione.
-- ═══════════════════════════════════════════════════════════

create or replace function link_driver_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  discord_id_value text;
begin
  discord_id_value := coalesce(
    new.raw_user_meta_data ->> 'provider_id',
    new.raw_user_meta_data ->> 'sub'
  );

  if discord_id_value is not null then
    update drivers
       set auth_user_id = new.id,
           updated_at = now()
     where drivers.discord_id = discord_id_value
       and drivers.auth_user_id is null;
  end if;

  return new;
end;
$$;

comment on function link_driver_on_signup() is 'Collega auth.users.id a drivers.auth_user_id per discord_id, solo se il driver esiste già e non è già collegato. Mai crea un driver nuovo.';

drop trigger if exists on_auth_user_created_link_driver on auth.users;

create trigger on_auth_user_created_link_driver
  after insert on auth.users
  for each row execute function link_driver_on_signup();
