-- Portal Cliente Extensions: Task 1
-- Add portalConfig to CrmAccount
ALTER TABLE "crm"."accounts" ADD COLUMN IF NOT EXISTS "portal_config" JSONB;

-- Add magic link and rate limiting fields to CrmContact
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_magic_token" TEXT;
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_magic_token_exp" TIMESTAMPTZ;
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "crm"."contacts" ADD COLUMN IF NOT EXISTS "portal_locked_until" TIMESTAMPTZ;

-- Create PortalClienteAlertConfig table
CREATE TABLE IF NOT EXISTS "crm"."portal_cliente_alert_configs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "alert_type" TEXT NOT NULL,
  "channels" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "portal_cliente_alert_configs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_portal_alert_config_tenant" ON "crm"."portal_cliente_alert_configs"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_portal_alert_config_contact" ON "crm"."portal_cliente_alert_configs"("contact_id");

-- Create PortalClienteReporte table
CREATE TABLE IF NOT EXISTS "crm"."portal_cliente_reportes" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "installation_id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "pdf_url" TEXT,
  "generated_at" TIMESTAMPTZ,
  "sent_at" TIMESTAMPTZ,
  "data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "portal_cliente_reportes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_portal_reporte_tenant" ON "crm"."portal_cliente_reportes"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_portal_reporte_account" ON "crm"."portal_cliente_reportes"("account_id");

-- Create PortalClienteDemoData table
CREATE TABLE IF NOT EXISTS "crm"."portal_cliente_demo_data" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "demo_data" JSONB NOT NULL,
  "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "portal_cliente_demo_data_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "portal_cliente_demo_data_contact_id_key" ON "crm"."portal_cliente_demo_data"("contact_id");
CREATE INDEX IF NOT EXISTS "idx_portal_demo_data_tenant" ON "crm"."portal_cliente_demo_data"("tenant_id");

-- Create PortalClienteAuditLog table
CREATE TABLE IF NOT EXISTS "crm"."portal_cliente_audit_logs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource" TEXT,
  "metadata" JSONB,
  "ip" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "portal_cliente_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_portal_audit_log_tenant" ON "crm"."portal_cliente_audit_logs"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_portal_audit_log_contact" ON "crm"."portal_cliente_audit_logs"("contact_id");
