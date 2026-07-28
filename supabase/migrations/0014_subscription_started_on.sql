-- =====================================================================
-- Migration 14: subscription purchase date
-- =====================================================================
alter table customers add column if not exists subscription_started_on date;