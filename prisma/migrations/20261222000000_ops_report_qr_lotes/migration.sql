-- Lotes de QR de incidencias: adhesivos imprimibles que se asignan después.
-- 100% aditivo. Backfill de public_report_token existentes.

CREATE TABLE IF NOT EXISTS "ops"."report_qr_lotes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_qr_lotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ops_report_qr_lotes_tenant_code"
  ON "ops"."report_qr_lotes"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "idx_ops_report_qr_lotes_tenant"
  ON "ops"."report_qr_lotes"("tenant_id");

CREATE TABLE IF NOT EXISTS "ops"."report_qrs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "lote_id" UUID NOT NULL,
    "serial" INTEGER NOT NULL,
    "serial_label" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unassigned',
    "installation_id" UUID,
    "assigned_at" TIMESTAMPTZ(6),
    "assigned_by" TEXT,
    "retired_at" TIMESTAMPTZ(6),
    "retired_by" TEXT,
    "retired_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_qrs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "report_qrs_token_key"
  ON "ops"."report_qrs"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ops_report_qrs_tenant_serial"
  ON "ops"."report_qrs"("tenant_id", "serial");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ops_report_qrs_tenant_serial_label"
  ON "ops"."report_qrs"("tenant_id", "serial_label");
CREATE INDEX IF NOT EXISTS "idx_ops_report_qrs_tenant_status"
  ON "ops"."report_qrs"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_ops_report_qrs_installation"
  ON "ops"."report_qrs"("installation_id");
CREATE INDEX IF NOT EXISTS "idx_ops_report_qrs_lote"
  ON "ops"."report_qrs"("lote_id");

CREATE TABLE IF NOT EXISTS "ops"."report_qr_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "qr_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "installation_id" UUID,
    "actor_id" TEXT NOT NULL,
    "actor_kind" TEXT NOT NULL DEFAULT 'erp',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_qr_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ops_report_qr_events_qr"
  ON "ops"."report_qr_events"("qr_id");
CREATE INDEX IF NOT EXISTS "idx_ops_report_qr_events_tenant"
  ON "ops"."report_qr_events"("tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_qrs_lote_id_fkey'
  ) THEN
    ALTER TABLE "ops"."report_qrs"
      ADD CONSTRAINT "report_qrs_lote_id_fkey"
      FOREIGN KEY ("lote_id") REFERENCES "ops"."report_qr_lotes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_qrs_installation_id_fkey'
  ) THEN
    ALTER TABLE "ops"."report_qrs"
      ADD CONSTRAINT "report_qrs_installation_id_fkey"
      FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_qr_events_qr_id_fkey'
  ) THEN
    ALTER TABLE "ops"."report_qr_events"
      ADD CONSTRAINT "report_qr_events_qr_id_fkey"
      FOREIGN KEY ("qr_id") REFERENCES "ops"."report_qrs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: un lote sintético por tenant y un QR assigned por token legado.
INSERT INTO "ops"."report_qr_lotes" ("tenant_id", "code", "quantity", "note", "created_by")
SELECT i."tenant_id", 'L-MIGRACION', 0, 'Migración de QR de reporte existentes', 'system'
FROM "crm"."installations" i
WHERE i."public_report_token" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ops"."report_qrs" q WHERE q."token" = i."public_report_token"
  )
GROUP BY i."tenant_id"
ON CONFLICT ("tenant_id", "code") DO NOTHING;

INSERT INTO "ops"."report_qrs" (
  "tenant_id", "lote_id", "serial", "serial_label", "token", "status",
  "installation_id", "assigned_at", "assigned_by"
)
SELECT
  i."tenant_id",
  l."id",
  COALESCE((
    SELECT MAX(q."serial") FROM "ops"."report_qrs" q WHERE q."tenant_id" = i."tenant_id"
  ), 0) + n."ord",
  'QR-' || LPAD((
    COALESCE((
      SELECT MAX(q."serial") FROM "ops"."report_qrs" q WHERE q."tenant_id" = i."tenant_id"
    ), 0) + n."ord"
  )::text, 5, '0'),
  i."public_report_token",
  'assigned',
  i."id",
  COALESCE(i."public_report_token_rotated_at", i."created_at"),
  'system'
FROM (
  SELECT
    inst.*,
    ROW_NUMBER() OVER (PARTITION BY inst."tenant_id" ORDER BY inst."created_at", inst."id") AS ord
  FROM "crm"."installations" inst
  WHERE inst."public_report_token" IS NOT NULL
) n
JOIN "crm"."installations" i ON i."id" = n."id"
JOIN "ops"."report_qr_lotes" l
  ON l."tenant_id" = i."tenant_id" AND l."code" = 'L-MIGRACION'
WHERE NOT EXISTS (
  SELECT 1 FROM "ops"."report_qrs" q WHERE q."token" = i."public_report_token"
);

INSERT INTO "ops"."report_qr_events" ("tenant_id", "qr_id", "action", "installation_id", "actor_id", "actor_kind", "note")
SELECT q."tenant_id", q."id", 'assign', q."installation_id", 'system', 'system', 'Migración desde public_report_token'
FROM "ops"."report_qrs" q
WHERE q."assigned_by" = 'system'
  AND NOT EXISTS (
    SELECT 1 FROM "ops"."report_qr_events" e WHERE e."qr_id" = q."id"
  );

UPDATE "ops"."report_qr_lotes" l
SET "quantity" = (
  SELECT COUNT(*)::int FROM "ops"."report_qrs" q WHERE q."lote_id" = l."id"
)
WHERE l."code" = 'L-MIGRACION';
