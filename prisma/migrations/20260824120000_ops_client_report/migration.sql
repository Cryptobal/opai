-- Informe operativo automático por instalación (digest cliente)

CREATE TABLE "ops"."client_report_configs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "weekday" INTEGER NOT NULL DEFAULT 0,
    "day_of_month" INTEGER NOT NULL DEFAULT 1,
    "send_hour_chile" INTEGER NOT NULL DEFAULT 8,
    "include_asistencia" BOOLEAN NOT NULL DEFAULT true,
    "include_cobertura" BOOLEAN NOT NULL DEFAULT true,
    "include_rondas" BOOLEAN NOT NULL DEFAULT true,
    "include_incidentes" BOOLEAN NOT NULL DEFAULT true,
    "include_visitas" BOOLEAN NOT NULL DEFAULT true,
    "last_sent_at" TIMESTAMPTZ(6),
    "last_period_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_report_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_report_configs_installation_id_key" ON "ops"."client_report_configs"("installation_id");
CREATE INDEX "idx_ops_client_report_configs_tenant" ON "ops"."client_report_configs"("tenant_id");
CREATE INDEX "idx_ops_client_report_configs_enabled" ON "ops"."client_report_configs"("tenant_id", "enabled");

ALTER TABLE "ops"."client_report_configs"
  ADD CONSTRAINT "client_report_configs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."client_report_configs"
  ADD CONSTRAINT "client_report_configs_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ops"."client_report_recipients" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "contact_id" UUID,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_report_recipients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_ops_client_report_recipients_installation" ON "ops"."client_report_recipients"("installation_id");
CREATE INDEX "idx_ops_client_report_recipients_tenant" ON "ops"."client_report_recipients"("tenant_id");
CREATE INDEX "idx_ops_client_report_recipients_contact" ON "ops"."client_report_recipients"("contact_id");

ALTER TABLE "ops"."client_report_recipients"
  ADD CONSTRAINT "client_report_recipients_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."client_report_recipients"
  ADD CONSTRAINT "client_report_recipients_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."client_report_recipients"
  ADD CONSTRAINT "client_report_recipients_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "crm"."contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
