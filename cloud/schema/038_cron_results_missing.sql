-- 10/10/2026 — Avviso staff per gare disputate senza risultati importati
-- (caso Big 6 R3 Silverstone). Ogni giorno alle 09:00 UTC; la function
-- deduplica per gara con TTL 7 giorni (notification_dedup).
select cron.schedule(
  'notif-results-missing',
  '0 9 * * *',
  $$select net.http_post(url:='https://cjbwhrrtxhckbkyxfdgm.supabase.co/functions/v1/notifications-cron?check=resultsMissing', headers:='{"Content-Type":"application/json"}'::jsonb)$$
);
