-- ──────────────────────────────────────────────────────────────────────
-- Servidor MCP (Fase 3) — API keys por tenant.
--
--   * mcp_api_keys : una key por tenant/Admin para operar OPAI vía MCP.
--                    La key nunca se guarda en claro: solo su sha256
--                    (key_hash, unique) + prefijo visible (key_prefix).
--                    scope READ | READ_WRITE controla el acceso a tools de
--                    escritura. revoked_at != NULL corta el acceso.
--
-- Frontera de aislamiento: la key resuelve el tenant_id; toda ejecución
-- corre con los permisos del Admin creador (created_by_admin_id).
-- 100% aditiva: CREATE TABLE/INDEX IF NOT EXISTS. Sin DROP ni ALTER destructivo.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."mcp_api_keys" (
  "id"                   TEXT NOT NULL,
  "tenant_id"            TEXT NOT NULL,
  "name"                 TEXT NOT NULL,
  "key_hash"             TEXT NOT NULL,
  "key_prefix"           TEXT NOT NULL,
  "scope"                TEXT NOT NULL DEFAULT 'READ',
  "created_by_admin_id"  TEXT NOT NULL,
  "last_used_at"         TIMESTAMP(3),
  "revoked_at"           TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mcp_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_api_keys_key_hash_key"
  ON "public"."mcp_api_keys" ("key_hash");
CREATE INDEX IF NOT EXISTS "idx_mcp_api_keys_tenant_revoked"
  ON "public"."mcp_api_keys" ("tenant_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "idx_mcp_api_keys_hash"
  ON "public"."mcp_api_keys" ("key_hash");
