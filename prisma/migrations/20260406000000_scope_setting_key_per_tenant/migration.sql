-- Scope Setting.key uniqueness per tenant.
-- Drops the global unique index on key and replaces it with a composite
-- unique on (tenantId, key) so that two tenants can hold the same key
-- without overwriting each other.

DROP INDEX IF EXISTS "public"."Setting_key_key";

CREATE UNIQUE INDEX "Setting_tenantId_key_key" ON "public"."Setting" ("tenantId", "key");
