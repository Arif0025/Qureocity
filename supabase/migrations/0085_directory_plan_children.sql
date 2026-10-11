-- Preserve the paged customer browse response while adding each child's
-- own recurring and special-pass plan IDs. This lets plan filters show
-- only the child registered in that plan, without a second client query.
create or replace function directory_browse_customers_with_plans(
  p_query text default null,
  p_plan_id uuid default null,
  p_members_only boolean default false,
  p_created_since timestamptz default null,
  p_expiring_before date default null,
  p_on_site_first boolean default false,
  p_limit int default 30,
  p_offset int default 0
)
returns json
language sql
stable
as $$
  with base as (
    select directory_browse_customers(
      p_query, p_plan_id, p_members_only, p_created_since,
      p_expiring_before, p_on_site_first, p_limit, p_offset
    )::jsonb as rows
  ),
  customers as (
    select parent.value as record, parent.ordinality as position
    from base
    cross join lateral jsonb_array_elements(base.rows) with ordinality as parent(value, ordinality)
  ),
  enriched as (
    select customers.position,
      jsonb_set(
        customers.record,
        '{children}',
        coalesce((
          select jsonb_agg(
            child.value || jsonb_build_object(
              'plan_id', cs.plan_id,
              'special_plan_ids', coalesce((
                select jsonb_agg(csp.plan_id order by csp.event_date, csp.plan_id)
                from child_special_passes csp
                where csp.child_id = ch.id
              ), '[]'::jsonb)
            ) order by child.ordinality
          )
          from jsonb_array_elements(coalesce(customers.record->'children', '[]'::jsonb))
            with ordinality as child(value, ordinality)
          join children ch on ch.id = (child.value->>'id')::uuid
          left join child_subscriptions cs on cs.child_id = ch.id
        ), '[]'::jsonb)
      ) as record
    from customers
  )
  select coalesce(jsonb_agg(enriched.record order by enriched.position), '[]'::jsonb)::json
  from enriched;
$$;

revoke all on function directory_browse_customers_with_plans(text, uuid, boolean, timestamptz, date, boolean, int, int) from public, anon;
grant execute on function directory_browse_customers_with_plans(text, uuid, boolean, timestamptz, date, boolean, int, int) to authenticated;

notify pgrst, 'reload schema';
