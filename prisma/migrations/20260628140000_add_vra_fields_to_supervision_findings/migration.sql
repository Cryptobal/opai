-- Bloque 5: campos VRA opcionales en supervision_findings
-- Nullable, no rompen flujo regular. Solo se usan cuando la visita
-- es vulnerability_assessment.

ALTER TABLE "ops"."supervision_findings"
  ADD COLUMN IF NOT EXISTS "location" text,
  ADD COLUMN IF NOT EXISTS "sector_tag" text,
  ADD COLUMN IF NOT EXISTS "aggravating_factors" text;
