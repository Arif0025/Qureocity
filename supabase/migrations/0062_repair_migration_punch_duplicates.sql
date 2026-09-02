-- Migration 62: remove duplicate rows created when migration 61 repaired
-- pre-existing duplicate open punches.

-- Migration 61 marked repaired rows as both admin-punched-out and
-- admin-edited. Remove only such a closed row when the same employee still
-- has an open row with the exact same punch-in timestamp. A legitimate
-- completed shift is left untouched.
delete from attendance_logs repaired
where repaired.punch_out is not null
  and repaired.admin_punched_out = true
  and repaired.admin_edited = true
  and exists (
    select 1
    from attendance_logs open_log
    where open_log.employee_id = repaired.employee_id
      and open_log.punch_out is null
      and open_log.punch_in = repaired.punch_in
  );

notify pgrst, 'reload schema';