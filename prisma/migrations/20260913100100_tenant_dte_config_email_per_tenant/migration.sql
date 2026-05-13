-- Agrega configuración de email per-tenant a TenantDteConfig:
--   - always_bcc:  BCC oculto que se suma a TODO envío DTE.
--   - from_name:   override del nombre del remitente (sobre el address).
--   - reply_to:    override del Reply-To per-tenant.
--
-- Sin data migration: dejamos always_bcc vacío y from_name/reply_to NULL.
-- El servicio dte-email.service.ts hace fallback al env EMAIL_REPLY_TO
-- cuando always_bcc está vacío, así que la migración es retro-compatible
-- aunque ningún tenant configure estos campos.

ALTER TABLE "public"."tenant_dte_configs"
  ADD COLUMN "always_bcc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "from_name"  TEXT,
  ADD COLUMN "reply_to"   TEXT;
