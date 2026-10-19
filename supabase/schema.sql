-- Путь: supabase/schema.sql
-- Хранилище данных приложения. Вставить в Supabase → SQL Editor → Run.
--
-- Одна таблица «ключ → JSON» на пользователя. Ключи те же, что в локальном хранилище и в резервной копии
-- (debts-v1, notes-v1, …), поэтому синхронизация — это просто «записать/прочитать значение по ключу».
-- Если позже понадобятся серверные уведомления по срокам, долги можно будет вынести в отдельные таблицы.

create table if not exists public.user_data (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  key        text        not null check (key in (
    'debts-v1', 'notes-v1', 'schedule-lessons-v1', 'schedule-hidden-v1',
    'schedule-teachers-v1', 'schedule-show-matches-v1', 'schedule-own-source-v1', 'notify-v1'
  )),
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Защита от чтения чужого: без правил ниже не видно ничего, с ними — только свои строки
alter table public.user_data enable row level security;

drop policy if exists "user_data: читать своё"   on public.user_data;
drop policy if exists "user_data: добавлять своё" on public.user_data;
drop policy if exists "user_data: менять своё"   on public.user_data;
drop policy if exists "user_data: удалять своё"  on public.user_data;

create policy "user_data: читать своё"   on public.user_data for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "user_data: добавлять своё" on public.user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "user_data: менять своё"   on public.user_data for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_data: удалять своё"  on public.user_data for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Если таблица уже была создана раньше (без ключа notify-v1), расширяем список допустимых ключей
alter table public.user_data drop constraint if exists user_data_key_check;
alter table public.user_data add constraint user_data_key_check check (key in (
  'debts-v1', 'notes-v1', 'schedule-lessons-v1', 'schedule-hidden-v1',
  'schedule-teachers-v1', 'schedule-show-matches-v1', 'schedule-own-source-v1', 'notify-v1'
));

-- Что уже отправлено ботом (чтобы не слать одно и то же дважды). Читает и пишет только серверная функция:
-- RLS включена, правил нет, значит обычным пользователям таблица недоступна.
create table if not exists public.notify_sent (
  user_id uuid        not null references auth.users (id) on delete cascade,
  key     text        not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.notify_sent enable row level security;
revoke all on public.notify_sent from anon, authenticated;

-- Время изменения ставит сервер, а не телефон: часы на устройствах могут отличаться
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before update on public.user_data
  for each row execute function public.touch_updated_at();

-- Анонимным посетителям таблица не нужна вообще
revoke all on public.user_data from anon;
