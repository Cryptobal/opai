-- Add overtime and time-source fields to asistencia_diaria
ALTER TABLE "ops"."asistencia_diaria"
  ADD COLUMN IF NOT EXISTS "check_in_source" TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "check_out_source" TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "planned_shift_start" TEXT,
  ADD COLUMN IF NOT EXISTS "planned_shift_end" TEXT,
  ADD COLUMN IF NOT EXISTS "planned_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "worked_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "late_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "hours_calculated_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "idx_ops_asistencia_date_overtime"
  ON "ops"."asistencia_diaria"("date", "overtime_minutes");
