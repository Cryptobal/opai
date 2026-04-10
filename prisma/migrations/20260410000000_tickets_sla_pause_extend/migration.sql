-- AlterTable: Add SLA pause, extend, snooze fields to ops_tickets
ALTER TABLE "ops"."ops_tickets"
  ADD COLUMN "sla_paused_at" TIMESTAMPTZ(6),
  ADD COLUMN "sla_paused_reason" TEXT,
  ADD COLUMN "sla_paused_total_ms" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "sla_extensions" JSONB,
  ADD COLUMN "snoozed_until" TIMESTAMPTZ(6),
  ADD COLUMN "last_sla_notified_at" TIMESTAMPTZ(6);
