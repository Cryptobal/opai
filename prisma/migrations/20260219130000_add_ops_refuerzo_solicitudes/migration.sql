-- Turnos de Refuerzo (solicitudes comerciales/operativas)
-- Mantiene separado el estado de negocio del estado de pago en ops.turnos_extra.

CREATE TABLE "ops"."refuerzo_solicitudes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "account_id" UUID,
    "puesto_id" UUID,
    "guardia_id" UUID NOT NULL,
    "turno_extra_id" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_by_name" TEXT,
    "request_channel" TEXT,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "guards_count" INTEGER NOT NULL DEFAULT 1,
    "shift_type" TEXT,
    "location_text" TEXT,
    "notes" TEXT,
    "rate_mode" TEXT NOT NULL DEFAULT 'turno',
    "rate_clp" DECIMAL(12,2),
    "estimated_total_clp" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_condition" TEXT,
    "guard_payment_clp" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'solicitado',
    "invoice_number" TEXT,
    "invoice_ref" TEXT,
    "invoiced_at" TIMESTAMPTZ(6),
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "refuerzo_solicitudes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refuerzo_solicitudes_turno_extra_id_key"
ON "ops"."refuerzo_solicitudes"("turno_extra_id");

CREATE INDEX "idx_ops_refuerzo_tenant"
ON "ops"."refuerzo_solicitudes"("tenant_id");

CREATE INDEX "idx_ops_refuerzo_tenant_start"
ON "ops"."refuerzo_solicitudes"("tenant_id", "start_at");

CREATE INDEX "idx_ops_refuerzo_installation_start"
ON "ops"."refuerzo_solicitudes"("tenant_id", "installation_id", "start_at");

CREATE INDEX "idx_ops_refuerzo_status"
ON "ops"."refuerzo_solicitudes"("tenant_id", "status");

CREATE INDEX "idx_ops_refuerzo_invoice_number"
ON "ops"."refuerzo_solicitudes"("tenant_id", "invoice_number");

CREATE INDEX "idx_ops_refuerzo_guardia"
ON "ops"."refuerzo_solicitudes"("guardia_id");

ALTER TABLE "ops"."refuerzo_solicitudes"
ADD CONSTRAINT "fk_ops_refuerzo_installation"
FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."refuerzo_solicitudes"
ADD CONSTRAINT "fk_ops_refuerzo_account"
FOREIGN KEY ("account_id") REFERENCES "crm"."accounts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ops"."refuerzo_solicitudes"
ADD CONSTRAINT "fk_ops_refuerzo_puesto"
FOREIGN KEY ("puesto_id") REFERENCES "ops"."puestos_operativos"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ops"."refuerzo_solicitudes"
ADD CONSTRAINT "fk_ops_refuerzo_guardia"
FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ops"."refuerzo_solicitudes"
ADD CONSTRAINT "fk_ops_refuerzo_turno_extra"
FOREIGN KEY ("turno_extra_id") REFERENCES "ops"."turnos_extra"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Puente opcional hacia facturación
ALTER TABLE "finance"."finance_dte_lines"
ADD COLUMN "refuerzo_solicitud_id" UUID;

CREATE INDEX "idx_finance_dte_line_refuerzo"
ON "finance"."finance_dte_lines"("refuerzo_solicitud_id");

ALTER TABLE "finance"."finance_dte_lines"
ADD CONSTRAINT "fk_finance_dte_line_refuerzo"
FOREIGN KEY ("refuerzo_solicitud_id") REFERENCES "ops"."refuerzo_solicitudes"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
