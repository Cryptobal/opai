-- Estilo de respuesta IA de Correos (Correos V4).
-- Tabla aditiva crm.email_ai_styles: tono/tratamiento/extensión para generateDraftReply.
-- Scope: tenant (user_id NULL) + override personal.
-- Sin backfill: ausencia de fila ≡ DEFAULT_CORREO_AI_STYLE en código.
--
-- Índice único parcial para la fila de tenant (PostgreSQL no colisiona NULLs
-- en UNIQUE estándar, así que UNIQUE(tenant_id, user_id) no protege user_id IS NULL).

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
