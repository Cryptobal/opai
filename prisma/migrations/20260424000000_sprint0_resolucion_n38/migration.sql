-- Sprint 0: Resolución Exenta N°38 — Campos obligatorios

-- =============================================
-- OpsMarcacion — Nuevos campos Res. N°38
-- =============================================
ALTER TABLE "ops"."marcaciones" ADD COLUMN "employer_rut" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "employer_name" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "establishment_address" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "dt_resolution_number" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "mandante_rut" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "mandante_name" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "gps_status" TEXT NOT NULL DEFAULT 'sin_gps';
ALTER TABLE "ops"."marcaciones" ADD COLUMN "distancia_metros" DOUBLE PRECISION;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "gps_accuracy" DOUBLE PRECISION;
-- Soft delete & auditoría
ALTER TABLE "ops"."marcaciones" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."marcaciones" ADD COLUMN "deleted_by" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "modified_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."marcaciones" ADD COLUMN "modified_by" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "modification_reason" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "is_modified" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "idx_ops_marcaciones_deleted_at" ON "ops"."marcaciones"("deleted_at");

-- Change onDelete from Cascade to Restrict for installation FK
ALTER TABLE "ops"."marcaciones" DROP CONSTRAINT IF EXISTS "marcaciones_installation_id_fkey";
ALTER TABLE "ops"."marcaciones" ADD CONSTRAINT "marcaciones_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================
-- OpsGuardia — Jornada excepcional & Face ID
-- =============================================
ALTER TABLE "ops"."guardias" ADD COLUMN "dt_resolucion_jornada" TEXT;
ALTER TABLE "ops"."guardias" ADD COLUMN "dt_resolucion_vigencia" DATE;
ALTER TABLE "ops"."guardias" ADD COLUMN "tipo_jornada" TEXT NOT NULL DEFAULT 'excepcional';
ALTER TABLE "ops"."guardias" ADD COLUMN "max_horas_semanales" DOUBLE PRECISION NOT NULL DEFAULT 42;
ALTER TABLE "ops"."guardias" ADD COLUMN "personal_email" TEXT;
ALTER TABLE "ops"."guardias" ADD COLUMN "face_id_registered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ops"."guardias" ADD COLUMN "face_id_photo_url" TEXT;
ALTER TABLE "ops"."guardias" ADD COLUMN "face_id_aws_id" TEXT;
ALTER TABLE "ops"."guardias" ADD COLUMN "face_id_registered_at" TIMESTAMPTZ(6);

-- =============================================
-- OpsPersona — Email personal (Res. N°38)
-- =============================================
ALTER TABLE "ops"."personas" ADD COLUMN "personal_email" TEXT;

-- =============================================
-- OpsAsistenciaDiaria — Soft delete & auditoría
-- =============================================
ALTER TABLE "ops"."asistencia_diaria" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."asistencia_diaria" ADD COLUMN "deleted_by" TEXT;
ALTER TABLE "ops"."asistencia_diaria" ADD COLUMN "modified_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."asistencia_diaria" ADD COLUMN "modified_by" TEXT;
ALTER TABLE "ops"."asistencia_diaria" ADD COLUMN "modification_reason" TEXT;
ALTER TABLE "ops"."asistencia_diaria" ADD COLUMN "is_modified" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "idx_ops_asistencia_deleted_at" ON "ops"."asistencia_diaria"("deleted_at");

-- Change onDelete from Cascade to Restrict for installation FK
ALTER TABLE "ops"."asistencia_diaria" DROP CONSTRAINT IF EXISTS "asistencia_diaria_installation_id_fkey";
ALTER TABLE "ops"."asistencia_diaria" ADD CONSTRAINT "asistencia_diaria_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================
-- ConfigEmpresa — Tabla de configuración
-- =============================================
CREATE TABLE IF NOT EXISTS "ops"."config_empresa" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "rut" TEXT NOT NULL,
  "razon_social" TEXT NOT NULL,
  "direccion_principal" TEXT NOT NULL,
  "representante_legal" TEXT,
  "giro_comercial" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "config_empresa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_config_empresa_tenant" ON "ops"."config_empresa"("tenant_id");

-- Backfill gpsStatus for existing records based on geoValidada
UPDATE "ops"."marcaciones"
SET "gps_status" = CASE
  WHEN "geo_validada" = true THEN 'dentro_rango'
  WHEN "geo_distancia_m" IS NOT NULL AND "geo_validada" = false THEN 'fuera_rango'
  ELSE 'sin_gps'
END
WHERE "gps_status" = 'sin_gps' AND ("geo_validada" = true OR "geo_distancia_m" IS NOT NULL);

-- Backfill distanciaMetros from existing geoDistanciaM
UPDATE "ops"."marcaciones"
SET "distancia_metros" = "geo_distancia_m"
WHERE "distancia_metros" IS NULL AND "geo_distancia_m" IS NOT NULL;
