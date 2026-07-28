-- ============================================================================
-- PENDING MIGRATION — ESTILO DE RESPUESTA IA DE CORREOS (Correos V4)
-- Aplicar MANUALMENTE en producción, fuera de prisma migrate deploy.
-- ============================================================================
--
-- Tabla aditiva crm.email_ai_styles: estilo de tono/tratamiento/extensión
-- para generateDraftReply. Scope: tenant (user_id NULL) + override personal.
--
-- Sin backfill: la ausencia de fila equivale al default del código
-- (DEFAULT_CORREO_AI_STYLE), que reproduce el prompt histórico.
--
-- Índice único parcial para la fila de tenant (PostgreSQL no colisiona NULLs
-- en UNIQUE estándar, así que @@unique([tenant_id, user_id]) no protege
-- user_id IS NULL).
--
-- Reversible con DROP TABLE. Idempotente (IF NOT EXISTS).
--
-- CÓMO APLICAR (producción): ejecutar el bloque completo en la BD.
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm.email_ai_styles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   text NOT NULL,
  user_id     text NULL,
  closeness   text NOT NULL DEFAULT 'cercano',
  addressing  text NOT NULL DEFAULT 'nombre',
  length      text NOT NULL DEFAULT 'media',
  avoid_words text[] NOT NULL DEFAULT '{}',
  guidance    text NULL,
  created_at  timestamptz(6) NOT NULL DEFAULT now(),
  updated_at  timestamptz(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_email_ai_style_scope
  ON crm.email_ai_styles (tenant_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_email_ai_style_tenant_default
  ON crm.email_ai_styles (tenant_id)
  WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_email_ai_style_tenant
  ON crm.email_ai_styles (tenant_id);
