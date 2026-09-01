-- Res. Ex. N°38: región de instalación, fecha de resolución DT,
-- alertas 45.1, respaldos 14 b, índice de hash y trigger append-only (Art. 14 a ii).

ALTER TABLE "crm"."installations"
  ADD COLUMN IF NOT EXISTS "region" TEXT;

ALTER TABLE "ops"."marcaciones"
  ADD COLUMN IF NOT EXISTS "dt_resolution_date" DATE;

CREATE INDEX IF NOT EXISTS "idx_ops_marcaciones_hash"
  ON "ops"."marcaciones"("hash_integridad");

CREATE TABLE IF NOT EXISTS "ops"."marcacion_alerta_envios" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "guardia_id" UUID NOT NULL,
  "asistencia_id" UUID,
  "fecha" DATE NOT NULL,
  "turno_key" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marcacion_alerta_envios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ops_marcacion_alerta_envio"
  ON "ops"."marcacion_alerta_envios"("tenant_id", "guardia_id", "fecha", "turno_key", "tipo");

CREATE INDEX IF NOT EXISTS "idx_ops_marcacion_alerta_envio_tenant"
  ON "ops"."marcacion_alerta_envios"("tenant_id");

CREATE TABLE IF NOT EXISTS "ops"."marcacion_respaldos" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "period_year" INTEGER NOT NULL,
  "period_month" INTEGER NOT NULL,
  "storage_key" TEXT NOT NULL,
  "manifest_key" TEXT NOT NULL,
  "file_sha256" TEXT NOT NULL,
  "manifest_sha256" TEXT NOT NULL,
  "record_count" INTEGER NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "date_from" DATE NOT NULL,
  "date_to" DATE NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marcacion_respaldos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ops_marcacion_respaldo_period"
  ON "ops"."marcacion_respaldos"("tenant_id", "period_year", "period_month");

CREATE INDEX IF NOT EXISTS "idx_ops_marcacion_respaldo_tenant"
  ON "ops"."marcacion_respaldos"("tenant_id");

CREATE OR REPLACE FUNCTION ops.enforce_marcaciones_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed text[] := ARRAY[
    'deleted_at',
    'deleted_by',
    'modified_at',
    'modified_by',
    'modification_reason',
    'is_modified',
    'opposition_token',
    'opposed_at',
    'opposed_by',
    'opposition_reason',
    'consolidated_at',
    'timestamp'
  ];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE físico de ops.marcaciones está prohibido (Res. Ex. N°38 Art. 14 a ii)';
  END IF;

  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Solo se permiten cambios de auditoría en ops.marcaciones (Res. Ex. N°38 Art. 14 a ii)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marcaciones_append_only ON ops.marcaciones;
CREATE TRIGGER trg_marcaciones_append_only
  BEFORE UPDATE OR DELETE ON ops.marcaciones
  FOR EACH ROW
  EXECUTE FUNCTION ops.enforce_marcaciones_append_only();
