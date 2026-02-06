-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");
CREATE INDEX "Tenant_active_idx" ON "Tenant"("active");

-- AlterTable WebhookSession: add tenantId (nullable)
ALTER TABLE "WebhookSession" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "WebhookSession_tenantId_idx" ON "WebhookSession"("tenantId");
ALTER TABLE "WebhookSession" ADD CONSTRAINT "WebhookSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Template: add tenantId (nullable)
ALTER TABLE "Template" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Template_tenantId_idx" ON "Template"("tenantId");
ALTER TABLE "Template" ADD CONSTRAINT "Template_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Presentation: add tenantId (nullable)
ALTER TABLE "Presentation" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Presentation_tenantId_idx" ON "Presentation"("tenantId");
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Admin: add tenantId (nullable)
ALTER TABLE "Admin" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Admin_tenantId_idx" ON "Admin"("tenantId");
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable AuditLog: add tenantId (nullable)
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Setting: add tenantId (nullable)
ALTER TABLE "Setting" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "Setting_tenantId_idx" ON "Setting"("tenantId");
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
