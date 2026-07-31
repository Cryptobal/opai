-- Índice GIN trigram para el texto libre de la bandeja de correos.
-- Expresión IDÉNTICA carácter a carácter a buildTextConditions en
-- src/modules/crm/email/correos-search.ts. Si una cambia, la otra también.
-- Rollback: DROP INDEX IF EXISTS crm.idx_crm_email_messages_body_trgm;
--
-- Requiere: pg_trgm + public.f_unaccent (migración 20260916000000).
-- CREATE INDEX sin CONCURRENTLY sigue la convención del repo (ej.
-- 20260730194800). Toma lock de escritura durante la construcción:
-- ejecutar en ventana de baja actividad.

CREATE INDEX IF NOT EXISTS idx_crm_email_messages_body_trgm
  ON crm.email_messages
  USING gin (
    LOWER(public.f_unaccent(COALESCE(text_body, html_body, ''))) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS idx_crm_email_messages_from_email_trgm
  ON crm.email_messages
  USING gin (LOWER(from_email) gin_trgm_ops);
