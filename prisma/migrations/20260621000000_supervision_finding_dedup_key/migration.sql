-- Extensión necesaria para normalizar la descripción (remover acentos) en el backfill
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 1. Columna dedup_key en supervision_findings
ALTER TABLE "ops"."supervision_findings"
  ADD COLUMN IF NOT EXISTS "dedup_key" TEXT;

-- 2. Índice para dedup lookup (tenant + installation + dedupKey + status)
CREATE INDEX IF NOT EXISTS "idx_supervision_findings_dedup_key"
  ON "ops"."supervision_findings" ("tenant_id", "installation_id", "dedup_key", "status");

-- 3. Backfill dedup_key en findings existentes, misma jerarquía que el helper
--    computeFindingDedupKey (tipoDocId > guardiaDocCode > descripción normalizada).
UPDATE "ops"."supervision_findings"
SET "dedup_key" = CASE
  WHEN "tipo_doc_id" IS NOT NULL
    THEN 'doc:' || "tipo_doc_id"::text
  WHEN "guardia_doc_code" IS NOT NULL
    THEN 'guardia:' || COALESCE("guard_id"::text, 'null') || ':' || "guardia_doc_code"
  ELSE
    'desc:' || substring(
      lower(regexp_replace(unaccent(COALESCE("description", '')), '[^a-z0-9]+', ' ', 'g')),
      1, 120
    )
END
WHERE "dedup_key" IS NULL;
