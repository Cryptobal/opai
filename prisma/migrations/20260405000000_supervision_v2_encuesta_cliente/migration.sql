-- AlterTable: add installationStateNotes to visitas_supervision
ALTER TABLE "ops"."visitas_supervision"
ADD COLUMN IF NOT EXISTS "installation_state_notes" TEXT;

-- CreateTable: encuestas_cliente
CREATE TABLE IF NOT EXISTS "ops"."encuestas_cliente" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "visit_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "account_id" UUID,
    "contact_name" TEXT NOT NULL,
    "contact_role" TEXT,
    "service_quality" INTEGER,
    "schedule_compliance" INTEGER,
    "personal_presentation" INTEGER,
    "professionalism" INTEGER,
    "supervision_presence" INTEGER,
    "incident_response" INTEGER,
    "has_urgent_risk" BOOLEAN,
    "urgent_risk_detail" TEXT,
    "nps_score" INTEGER,
    "additional_comments" TEXT,
    "signature_url" TEXT,
    "client_photo_url" TEXT,
    "average_score" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encuestas_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "encuestas_cliente_visit_id_key" ON "ops"."encuestas_cliente"("visit_id");
CREATE INDEX IF NOT EXISTS "idx_encuestas_cliente_tenant" ON "ops"."encuestas_cliente"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_encuestas_cliente_installation" ON "ops"."encuestas_cliente"("installation_id");
CREATE INDEX IF NOT EXISTS "idx_encuestas_cliente_account" ON "ops"."encuestas_cliente"("account_id");

-- AddForeignKey
ALTER TABLE "ops"."encuestas_cliente"
ADD CONSTRAINT "encuestas_cliente_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."encuestas_cliente"
ADD CONSTRAINT "encuestas_cliente_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."encuestas_cliente"
ADD CONSTRAINT "encuestas_cliente_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."encuestas_cliente"
ADD CONSTRAINT "encuestas_cliente_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "crm"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
