-- Durable, employee-scoped inbox for automated alerts and direct admin messages.
create table if not exists public.employee_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.employees(id) on delete cascade,
  category text not null check (category in ('admin', 'system')),
  title text not null,
  body text not null default '',
  target_url text not null default '/employee?tab=home',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists employee_notifications_inbox_idx
  on public.employee_notifications(user_id, created_at desc);
create index if not exists employee_notifications_unread_idx
  on public.employee_notifications(user_id, created_at desc)
  where read_at is null;

alter table public.employee_notifications enable row level security;
revoke all on public.employee_notifications from anon, authenticated;
grant select on public.employee_notifications to authenticated;

drop policy if exists "employees read own notifications" on public.employee_notifications;
create policy "employees read own notifications"
  on public.employee_notifications for select to authenticated
  using (user_id = auth.uid());

create or replace function public.employee_notification_mark_read(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  update public.employee_notifications
     set read_at = coalesce(read_at, now())
   where id = p_id and user_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;
revoke all on function public.employee_notification_mark_read(uuid) from public, anon;
grant execute on function public.employee_notification_mark_read(uuid) to authenticated;

-- Only clients with notifications open receive the live row event; normal
-- browsing does not add an always-on database subscription.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'employee_notifications'
     ) then
    alter publication supabase_realtime add table public.employee_notifications;
  end if;
end $$;

do $$
begin
  perform cron.schedule(
    'employee-inbox-retention',
    '0 * * * *',
    $job$delete from public.employee_notifications where created_at < now() - interval '2 days';$job$
  );
exception when others then
  raise notice 'Could not schedule employee inbox cleanup (%). If pg_cron is enabled, schedule employee_notifications retention manually.', sqlerrm;
end $$;

notify pgrst, 'reload schema';
