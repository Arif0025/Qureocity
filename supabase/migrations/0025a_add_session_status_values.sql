-- =====================================================================
-- Migration 25a: add new session_status enum values
-- =====================================================================
-- Split out from the rest of migration 25 on purpose: Postgres will not
-- let a newly-added enum value be referenced (e.g. in a function's
-- DEFAULT clause) inside the same transaction/script that added it
-- ("unsafe use of new value ... must be committed before they can be
-- used"). Run this file, let it commit on its own, THEN run
-- 0025b_pending_confirmations_and_attendance_fixes.sql.
-- =====================================================================

alter type session_status add value if not exists 'pending_payment';
alter type session_status add value if not exists 'discarded';