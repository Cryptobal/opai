-- ============================================================================
-- PENDING MIGRATION — ÍNDICES DE BÚSQUEDA DE CORREO (C15 / PR-07)
-- Aplicar MANUALMENTE en producción, fuera de prisma migrate deploy.
-- ============================================================================
--
-- La búsqueda server-side de la bandeja (src/modules/crm/email/correos-search.ts)
-- funciona sin estos índices (queda acotada por casilla), pero en casillas
-- grandes estos índices evitan degradación:
--
--   1. idx_crm_email_threads_mailbox_recent — el ORDER BY last_message_at DESC
--      LIMIT N de la lista y de la búsqueda camina este índice y corta temprano
--      (top-N por casilla), en vez de ordenar todo el resultado.
--   2. idx_crm_email_threads_subject_trgm — texto libre sobre asunto
--      (LOWER(f_unaccent(subject)) LIKE %...%), mismo patrón trigram del
--      buscador global (migración 20260916000000).
--   3. idx_crm_email_messages_from_trgm — operador from: y rama remitente del
--      texto libre (LOWER(from_email) LIKE %...%).
--
-- Se eligió pg_trgm sobre tsvector porque los operadores from:/to:/domain:
-- necesitan substring matching (tsvector tokeniza emails completos) y porque
-- pg_trgm + f_unaccent ya son la infraestructura de búsqueda del repo.
--
-- CÓMO APLICAR (producción):
--   - CREATE INDEX CONCURRENTLY no puede correr dentro de una transacción:
--     ejecutar cada statement por separado (psql con autocommit, o el editor
--     SQL de Neon/Supabase statement a statement).
--   - Son idempotentes (IF NOT EXISTS). En tablas grandes CONCURRENTLY tarda
--     pero no bloquea escrituras.
--   - Verificar después con: \di+ crm.idx_crm_email_*
--   - Si un CONCURRENTLY falla a medias deja un índice INVALID: detectarlo con
--     `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;` y
--     hacer DROP INDEX + reintentar.
--
-- Requiere: extensiones pg_trgm + función public.f_unaccent (ya creadas por
-- la migración 20260916000000_add_search_unaccent_normalization).
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_email_threads_mailbox_recent
  ON crm.email_threads (email_account_id, last_message_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_email_threads_subject_trgm
  ON crm.email_threads USING gin (LOWER(public.f_unaccent(subject)) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_email_messages_from_trgm
  ON crm.email_messages USING gin (LOWER(from_email) gin_trgm_ops);
