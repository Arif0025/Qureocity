-- =====================================================================
-- Migration 12: customer visit history for staff search
-- =====================================================================

create or replace function customer_visit_history(p_customer_id uuid)
returns json
language sql
stable
as $$
  select coalesce(json_agg(row_data), '[]'::json)
  from (
    select json_build_object(
      'child_name', ch.name,
      'checked_in_at', ps.start_time,
      'checked_out_at', coalesce(ps.ended_at, ps.end_time),
      'status', ps.status::text,
      'visit_day', date(ps.start_time),
      'intended_duration_mins', ps.duration_mins,
      'actual_duration_mins', case
        when ps.ended_at is not null then greatest(
          0,
          floor(extract(epoch from (ps.ended_at - ps.start_time)) / 60)::int
        )
        when ps.end_time is not null then greatest(
          0,
          floor(extract(epoch from (ps.end_time - ps.start_time)) / 60)::int
        )
        else null
      end
    ) as row_data
    from play_sessions ps
    join children ch on ch.id = ps.child_id
    where ch.customer_id = p_customer_id
    order by ps.start_time desc
    limit 50
  ) results;
$$;

grant execute on function customer_visit_history(uuid) to authenticated;
