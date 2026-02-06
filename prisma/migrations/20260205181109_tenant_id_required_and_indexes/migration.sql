-- Migración 3: Convertir tenantId a NOT NULL (post-backfill) y añadir índices compuestos

-- Template: NOT NULL
ALTER TABLE "Template" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX "Template_tenantId_active_idx" ON "Template"("tenantId", "active");

-- Presentation: NOT NULL
ALTER TABLE "Presentation" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX "Presentation_tenantId_status_idx" ON "Presentation"("tenantId", "status");
CREATE INDEX "Presentation_tenantId_createdAt_idx" ON "Presentation"("tenantId", "createdAt");

-- WebhookSession: NOT NULL
ALTER TABLE "WebhookSession" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX "WebhookSession_tenantId_createdAt_idx" ON "WebhookSession"("tenantId", "createdAt");

-- Admin: NOT NULL
ALTER TABLE "Admin" ALTER COLUMN "tenantId" SET NOT NULL;
