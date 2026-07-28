-- Additive index for productividad audit page queries (tenantId + action prefix + order by createdAt).
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_action_createdAt_idx" ON "public"."AuditLog"("tenantId", "action", "createdAt");
