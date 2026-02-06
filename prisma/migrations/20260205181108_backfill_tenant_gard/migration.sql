-- Backfill: crear tenant "gard" si no existe y asignar a todos los registros sin tenantId
-- Seguro: nullable -> backfill -> luego migración 3 hace NOT NULL

-- 1. Crear tenant Gard Security si no existe (id deterministico para backfill)
INSERT INTO "Tenant" (id, slug, name, active, "createdAt", "updatedAt")
SELECT 'clgard00000000000000001', 'gard', 'Gard Security', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Tenant" WHERE slug = 'gard');

-- 2. Asignar tenantId a registros existentes
UPDATE "Template" SET "tenantId" = (SELECT id FROM "Tenant" WHERE slug = 'gard' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "Presentation" SET "tenantId" = (SELECT id FROM "Tenant" WHERE slug = 'gard' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "WebhookSession" SET "tenantId" = (SELECT id FROM "Tenant" WHERE slug = 'gard' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "Admin" SET "tenantId" = (SELECT id FROM "Tenant" WHERE slug = 'gard' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "AuditLog" SET "tenantId" = (SELECT id FROM "Tenant" WHERE slug = 'gard' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "Setting" SET "tenantId" = (SELECT id FROM "Tenant" WHERE slug = 'gard' LIMIT 1) WHERE "tenantId" IS NULL;
