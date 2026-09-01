-- Portal público de fiscalización DT (Res. Ex. N°38 Arts. 17, 22–28)
-- Migración aditiva: campos Art. 26 en Tenant + bitácora, claves e incidentes.

CREATE SCHEMA IF NOT EXISTS "dt";

ALTER TABLE "public"."Tenant"
  ADD COLUMN IF NOT EXISTS "fantasy_name" TEXT,
  ADD COLUMN IF NOT EXISTS "hq_address" TEXT,
  ADD COLUMN IF NOT EXISTS "dt_service_type" TEXT NOT NULL DEFAULT 'cloud',
  ADD COLUMN IF NOT EXISTS "dt_contract_start" DATE,
  ADD COLUMN IF NOT EXISTS "dt_contract_end" DATE,
  ADD COLUMN IF NOT EXISTS "dt_notice_email" TEXT,
  ADD COLUMN IF NOT EXISTS "dt_daily_report_email" TEXT;

CREATE TABLE IF NOT EXISTS "dt"."fiscalizacion_access_codes" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "used_at" TIMESTAMPTZ(6),
  "request_ip" TEXT,
  CONSTRAINT "fiscalizacion_access_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_dt_access_code_email_exp"
  ON "dt"."fiscalizacion_access_codes"("email", "expires_at");
CREATE INDEX IF NOT EXISTS "idx_dt_access_code_hash"
  ON "dt"."fiscalizacion_access_codes"("code_hash");

CREATE TABLE IF NOT EXISTS "dt"."fiscalizacion_access_logs" (
  "id" TEXT NOT NULL,
  "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "email" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "tenant_id" TEXT,
  "tenant_rut" TEXT,
  "ip" TEXT,
  "user_agent" TEXT,
  "meta" JSONB,
  CONSTRAINT "fiscalizacion_access_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_dt_access_log_at"
  ON "dt"."fiscalizacion_access_logs"("at");
CREATE INDEX IF NOT EXISTS "idx_dt_access_log_email_at"
  ON "dt"."fiscalizacion_access_logs"("email", "at");
CREATE INDEX IF NOT EXISTS "idx_dt_access_log_tenant_at"
  ON "dt"."fiscalizacion_access_logs"("tenant_id", "at");

ALTER TABLE "dt"."fiscalizacion_access_logs"
  DROP CONSTRAINT IF EXISTS "fiscalizacion_access_logs_tenant_id_fkey";
ALTER TABLE "dt"."fiscalizacion_access_logs"
  ADD CONSTRAINT "fiscalizacion_access_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "dt"."incidentes_tecnicos" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "ended_at" TIMESTAMPTZ(6),
  "description" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "incidentes_tecnicos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_dt_incidente_started"
  ON "dt"."incidentes_tecnicos"("started_at");
CREATE INDEX IF NOT EXISTS "idx_dt_incidente_tenant_started"
  ON "dt"."incidentes_tecnicos"("tenant_id", "started_at");

ALTER TABLE "dt"."incidentes_tecnicos"
  DROP CONSTRAINT IF EXISTS "incidentes_tecnicos_tenant_id_fkey";
ALTER TABLE "dt"."incidentes_tecnicos"
  ADD CONSTRAINT "incidentes_tecnicos_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
