-- Portal Cliente · Fase 1 · Reportería on-demand
-- Extiende PortalClienteReporte con type/status/params/xlsxUrl/errorMessage/requestedBy
-- y permite que installationId sea nullable (reportes multi-instalación).

ALTER TABLE "crm"."portal_cliente_reportes"
  ALTER COLUMN "installation_id" DROP NOT NULL;

ALTER TABLE "crm"."portal_cliente_reportes"
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'cumplimiento_mensual',
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS "params" JSONB,
  ADD COLUMN IF NOT EXISTS "xlsx_url" TEXT,
  ADD COLUMN IF NOT EXISTS "error_message" TEXT,
  ADD COLUMN IF NOT EXISTS "requested_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "requested_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "idx_portal_reporte_type"
  ON "crm"."portal_cliente_reportes" ("tenant_id", "account_id", "type");

CREATE INDEX IF NOT EXISTS "idx_portal_reporte_status"
  ON "crm"."portal_cliente_reportes" ("status");
