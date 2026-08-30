-- PPC operacional: retiro anticipado + filas ad-hoc (inducción/refuerzo)
-- Solo ADD COLUMN; sin backfill.

ALTER TABLE "ops"."asistencia_diaria"
  ADD COLUMN IF NOT EXISTS "early_departure_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "early_departure_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "is_adhoc" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "adhoc_reason" TEXT;
