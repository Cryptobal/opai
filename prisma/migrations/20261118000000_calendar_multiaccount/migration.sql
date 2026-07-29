-- ============================================================================
-- Calendario multicuenta v1
-- - Relaja unique (tenant, user) → (tenant, user, google_email)
-- - Agrega is_default / color / sort_index en google_calendar_accounts
-- - Crea calendar_source_prefs
-- Orden crítico: CREATE índice nuevo ANTES de DROP del viejo.
-- ============================================================================

ALTER TABLE "public"."google_calendar_accounts"
  ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."google_calendar_accounts"
  ADD COLUMN IF NOT EXISTS "color" TEXT;

ALTER TABLE "public"."google_calendar_accounts"
  ADD COLUMN IF NOT EXISTS "sort_index" INTEGER NOT NULL DEFAULT 0;

-- Backfill: fila más antigua por (tenant, user) = default; color cíclico.
WITH ranked AS (
  SELECT
    id,
    tenant_id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, user_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM "public"."google_calendar_accounts"
),
colored AS (
  SELECT
    id,
    (rn = 1) AS is_default,
    (rn - 1)::integer AS sort_index,
    (ARRAY[
      'teal','violet','rose','amber','emerald','sky',
      'indigo','cyan','lime','orange','fuchsia','slate'
    ])[((rn - 1) % 12) + 1] AS color
  FROM ranked
)
UPDATE "public"."google_calendar_accounts" a
SET
  is_default = c.is_default,
  sort_index = c.sort_index,
  color = COALESCE(a.color, c.color)
FROM colored c
WHERE a.id = c.id;

-- Índice nuevo primero (relaja unicidad).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_google_calendar_account_tenant_user_email"
  ON "public"."google_calendar_accounts" ("tenant_id", "user_id", "google_email");

CREATE INDEX IF NOT EXISTS "idx_google_calendar_account_tenant_user"
  ON "public"."google_calendar_accounts" ("tenant_id", "user_id");

-- Soltar el índice destructivo solo después.
DROP INDEX IF EXISTS "public"."uq_google_calendar_account_tenant_user";

CREATE TABLE IF NOT EXISTS "public"."calendar_source_prefs" (
  "id"               TEXT NOT NULL,
  "tenant_id"        TEXT NOT NULL,
  "user_id"          TEXT NOT NULL,
  "source_key"       TEXT NOT NULL,
  "color"            TEXT,
  "hidden"           BOOLEAN NOT NULL DEFAULT false,
  "is_create_target" BOOLEAN NOT NULL DEFAULT false,
  "sort_index"       INTEGER NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "calendar_source_prefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_calendar_source_prefs_user_source"
  ON "public"."calendar_source_prefs" ("tenant_id", "user_id", "source_key");

CREATE INDEX IF NOT EXISTS "idx_calendar_source_prefs_user"
  ON "public"."calendar_source_prefs" ("tenant_id", "user_id");
