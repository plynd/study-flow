-- Путь: supabase/notify.sql
-- Планировщик уведомлений: раз в 5 минут вызывает функцию notify.
-- Перед запуском замени два значения ниже (ссылку проекта и тот же CRON_SECRET, что в секретах функции),
-- потом вставить в Supabase → SQL Editor → Run.
-- Расширения pg_cron и pg_net включаются здесь же (Database → Extensions, если команда выдаст ошибку прав).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('notify-every-5-min') where exists (select 1 from cron.job where jobname = 'notify-every-5-min');

select cron.schedule(
  'notify-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://goddfthabodgfpysnemn.supabase.co/functions/v1/notify',
    headers := '{"content-type": "application/json", "x-cron-secret": "B9ZfUVAFsy4LZW2uL8Iz7yNvGKYluTNC"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Остановить уведомления: select cron.unschedule('notify-every-5-min');
