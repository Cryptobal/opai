-- CreateTable
CREATE TABLE "crm"."protocol_acceptances" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "protocol_version_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "firmante_nombre" TEXT NOT NULL,
    "firmante_rut" TEXT,
    "firmante_email" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_protocol_acceptance_tenant" ON "crm"."protocol_acceptances"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_protocol_acceptance_account" ON "crm"."protocol_acceptances"("account_id");

-- CreateIndex
CREATE INDEX "idx_protocol_acceptance_installation" ON "crm"."protocol_acceptances"("installation_id");

-- CreateIndex
CREATE INDEX "idx_protocol_acceptance_contact" ON "crm"."protocol_acceptances"("contact_id");

-- CreateIndex
CREATE INDEX "idx_protocol_acceptance_version" ON "crm"."protocol_acceptances"("protocol_version_id");

-- CreateIndex
CREATE INDEX "idx_protocol_acceptance_inst_version" ON "crm"."protocol_acceptances"("installation_id", "version_number");

-- AddForeignKey
ALTER TABLE "crm"."protocol_acceptances" ADD CONSTRAINT "protocol_acceptances_protocol_version_id_fkey" FOREIGN KEY ("protocol_version_id") REFERENCES "crm"."protocol_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
