-- ──────────────────────────────────────────────────────────────────────
-- Control de Asistencia operado desde Slack — migración 100% ADITIVA.
--
-- Contenido:
--   1. ops.asistencia_diaria: 3 columnas nullable (contacto de central).
--   2. ops.contacto_central: historial de llamados de central (tabla nueva).
--   3. public.ops_relevo_slack_board: mensaje-ficha del tablero (tabla nueva).
--
-- Sólo ADD COLUMN / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT (todo
-- IF NOT EXISTS). No hay DROP ni ALTER destructivo: no rompe filas existentes.
--
-- ⚠️ HARD STOP: NO aplicar automáticamente. Aplicar contra la BD sólo tras
--    revisión humana (ver Bloque 9 del plan de asistencia-slack).
-- ──────────────────────────────────────────────────────────────────────

-- 1. Columnas de contacto de central en la fuente única de verdad ──────────
ALTER TABLE "ops"."asistencia_diaria"
  ADD COLUMN IF NOT EXISTS "contacto_central_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "contacto_central_by" TEXT,
  ADD COLUMN IF NOT EXISTS "contacto_central_resultado" TEXT;

-- 2. Historial de llamados de central ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ops"."contacto_central" (
  "id"             UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"      TEXT NOT NULL,
  "asistencia_id"  UUID NOT NULL,
  "resultado"      TEXT NOT NULL,
  "minutos_atraso" INTEGER,
  "comentario"     TEXT,
  "operador_id"    TEXT,
  "operador_name"  TEXT,
  "origen"         TEXT NOT NULL DEFAULT 'slack',
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "contacto_central_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ops_contacto_central_tenant"
  ON "ops"."contacto_central" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_contacto_central_asistencia"
  ON "ops"."contacto_central" ("asistencia_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacto_central_asistencia_id_fkey'
  ) THEN
    ALTER TABLE "ops"."contacto_central"
      ADD CONSTRAINT "contacto_central_asistencia_id_fkey"
      FOREIGN KEY ("asistencia_id") REFERENCES "ops"."asistencia_diaria" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Mensaje-ficha del tablero de relevo (auto-editable) ───────────────────
CREATE TABLE IF NOT EXISTS "public"."ops_relevo_slack_board" (
  "id"               TEXT NOT NULL,
  "tenant_id"        TEXT NOT NULL,
  "installation_id"  TEXT NOT NULL,
  "date"             DATE NOT NULL,
  "shift_start"      TEXT NOT NULL,
  "slack_channel_id" TEXT NOT NULL,
  "slack_ts"         TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'OPEN',
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ops_relevo_slack_board_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ops_relevo_board_inst_date_shift"
  ON "public"."ops_relevo_slack_board" ("installation_id", "date", "shift_start");
CREATE INDEX IF NOT EXISTS "idx_ops_relevo_board_tenant"
  ON "public"."ops_relevo_slack_board" ("tenant_id");
