-- AlterTable: Add obligatorio_en_visita to tipos_doc_operacional
ALTER TABLE "ops"."tipos_doc_operacional" ADD COLUMN "obligatorio_en_visita" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ops"."doc_verificacion_fisica" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenantId" TEXT NOT NULL,
    "tipoDocId" UUID,
    "guardiaDocType" TEXT,
    "capa" TEXT NOT NULL,
    "installationId" UUID NOT NULL,
    "guardiaId" UUID,
    "presente" BOOLEAN NOT NULL,
    "photoUrl" TEXT,
    "photoKey" TEXT,
    "notes" TEXT,
    "supervisionId" UUID NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "hallazgoId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_verificacion_fisica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doc_verificacion_fisica_hallazgoId_key" ON "ops"."doc_verificacion_fisica"("hallazgoId");

-- CreateIndex
CREATE INDEX "doc_verificacion_fisica_tenantId_installationId_idx" ON "ops"."doc_verificacion_fisica"("tenantId", "installationId");

-- CreateIndex
CREATE INDEX "doc_verificacion_fisica_tenantId_installationId_guardiaId_idx" ON "ops"."doc_verificacion_fisica"("tenantId", "installationId", "guardiaId");

-- CreateIndex
CREATE INDEX "doc_verificacion_fisica_tenantId_tipoDocId_idx" ON "ops"."doc_verificacion_fisica"("tenantId", "tipoDocId");

-- CreateIndex
CREATE INDEX "doc_verificacion_fisica_tenantId_supervisionId_idx" ON "ops"."doc_verificacion_fisica"("tenantId", "supervisionId");

-- AddForeignKey
ALTER TABLE "ops"."doc_verificacion_fisica" ADD CONSTRAINT "doc_verificacion_fisica_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."doc_verificacion_fisica" ADD CONSTRAINT "doc_verificacion_fisica_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "crm"."installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."doc_verificacion_fisica" ADD CONSTRAINT "doc_verificacion_fisica_supervisionId_fkey" FOREIGN KEY ("supervisionId") REFERENCES "ops"."visitas_supervision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."doc_verificacion_fisica" ADD CONSTRAINT "doc_verificacion_fisica_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "public"."Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."doc_verificacion_fisica" ADD CONSTRAINT "doc_verificacion_fisica_tipoDocId_fkey" FOREIGN KEY ("tipoDocId") REFERENCES "ops"."tipos_doc_operacional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."doc_verificacion_fisica" ADD CONSTRAINT "doc_verificacion_fisica_guardiaId_fkey" FOREIGN KEY ("guardiaId") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."doc_verificacion_fisica" ADD CONSTRAINT "doc_verificacion_fisica_hallazgoId_fkey" FOREIGN KEY ("hallazgoId") REFERENCES "ops"."supervision_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
