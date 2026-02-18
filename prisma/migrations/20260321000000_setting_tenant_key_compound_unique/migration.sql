-- DropIndex: remove the old global unique constraint on "key"
DROP INDEX IF EXISTS "Setting_key_key";

-- CreateIndex: compound unique on (tenantId, key) for multi-tenant isolation
CREATE UNIQUE INDEX "Setting_tenant_key" ON "Setting"("tenantId", "key");
