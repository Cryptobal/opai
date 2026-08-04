-- CPQ: contador correlativo por tenant+año + unicidad de code por tenant.
-- ADITIVO salvo DROP INDEX de los únicos globales de code (después de crear
-- los índices por tenant). Requiere aprobación explícita antes de producción.

-- 1) Tabla de contadores
CREATE TABLE IF NOT EXISTS "cpq"."document_counters" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "document_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cpq_document_counter"
  ON "cpq"."document_counters" ("tenant_id", "kind", "year");

-- 2) Backfill idempotente desde códigos existentes.
-- Acepta tanto CPQ-YYYY-NNN como CPQ-YYYY-NNN-xxxx (sufijo de clon/lead).
-- El número correlativo es el 3er segmento; códigos no conformes se ignoran.
INSERT INTO "cpq"."document_counters" ("tenant_id", "kind", "year", "last_number", "updated_at")
SELECT
  tenant_id,
  'quote' AS kind,
  split_part(code, '-', 2)::int AS year,
  MAX(split_part(code, '-', 3)::int) AS last_number,
  NOW()
FROM "cpq"."quotes"
WHERE code ~ '^(CPQ|PROP)-[0-9]{4}-[0-9]+'
GROUP BY tenant_id, split_part(code, '-', 2)::int
ON CONFLICT ("tenant_id", "kind", "year")
DO UPDATE SET
  "last_number" = GREATEST("cpq"."document_counters"."last_number", EXCLUDED."last_number"),
  "updated_at" = NOW();

INSERT INTO "cpq"."document_counters" ("tenant_id", "kind", "year", "last_number", "updated_at")
SELECT
  tenant_id,
  'bundle' AS kind,
  split_part(code, '-', 2)::int AS year,
  MAX(split_part(code, '-', 3)::int) AS last_number,
  NOW()
FROM "cpq"."proposal_bundles"
WHERE code ~ '^(CPQ|PROP)-[0-9]{4}-[0-9]+'
GROUP BY tenant_id, split_part(code, '-', 2)::int
ON CONFLICT ("tenant_id", "kind", "year")
DO UPDATE SET
  "last_number" = GREATEST("cpq"."document_counters"."last_number", EXCLUDED."last_number"),
  "updated_at" = NOW();

-- 3) Guarda: no debe haber duplicados (tenant_id, code) antes del índice compuesto
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "cpq"."quotes"
    GROUP BY tenant_id, code
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'cpq.quotes tiene duplicados (tenant_id, code); abortando migración';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "cpq"."proposal_bundles"
    GROUP BY tenant_id, code
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'cpq.proposal_bundles tiene duplicados (tenant_id, code); abortando migración';
  END IF;
END $$;

-- 4) Índices únicos por tenant (antes de dropear los globales)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cpq_quotes_tenant_code"
  ON "cpq"."quotes" ("tenant_id", "code");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cpq_proposal_bundles_tenant_code"
  ON "cpq"."proposal_bundles" ("tenant_id", "code");

-- 5) DROP de únicos globales — IRREVERSIBLE en caliente si ya hay códigos
--    duplicados entre tenants. Solo tras crear los índices por tenant.
DROP INDEX IF EXISTS "cpq"."cpq_quotes_code_key";
DROP INDEX IF EXISTS "cpq"."proposal_bundles_code_key";
