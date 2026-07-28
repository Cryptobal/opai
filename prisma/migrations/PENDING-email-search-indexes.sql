-- ============================================================================
-- PENDING MIGRATION — ÍNDICES DE BÚSQUEDA DE CORREO (C15 / PR-07 + híbrida)
-- Aplicar MANUALMENTE en producción, fuera de prisma migrate deploy.
-- ============================================================================
--
-- ESTADO (2026-07-28): a la fecha de la búsqueda híbrida, NINGUNO de estos
-- índices estaba verificado como aplicado en producción. El proyecto Neon
-- accesible desde el entorno del agente no expone el schema `crm` (solo
-- `public`), así que no se pudo confirmar con `\di+` / `pg_indexes`. Antesir
-- en producción antes de aplicar:
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'crm' AND indexname LIKE 'idx_crm_email_%';
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--
-- La búsqueda server-side de la bandeja (src/modules/crm/email/correos-search.ts)
-- funciona sin estos índices (queda acotada por casilla), pero en casillas
-- grandes estos índices evitan degradación:
--
--   1. idx_crm_email_threads_mailbox_recent — el ORDER BY last_message_at DESC
--      LIMIT N de la lista y de la búsqueda camina este índice y corta temprano
--      (top-N por casilla), en vez de ordenar todo el resultado.
--   2. idx_crm_email_threads_subject_trgm — texto libre / subject: sobre asunto
--      (LOWER(f_unaccent(subject)) LIKE %...%), mismo patrón trigram del
--      buscador global (migración 20260916000000).
--   3. idx_crm_email_messages_from_trgm — operador from: y rama remitente del
--      texto libre (LOWER(from_email) LIKE %...%).
--   4. idx_crm_email_messages_body_trgm — rama de cuerpo del texto libre
--      (text_body ILIKE %...%). Es el índice MÁS PESADO de los cuatro: los
--      cuerpos son textos largos y el sync inserta mensajes continuamente.
--      Evaluar el costo de escritura del sync antes de aplicarlo. Si resulta
--      prohibitivo, la alternativa es acotar la rama de cuerpo a los mensajes
--      recientes del hilo (p. ej. últimos N días) en correos-search.ts.
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

-- Índice de cuerpo: el más costoso en escritura. Aplicar con ventana controlada.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_email_messages_body_trgm
  ON crm.email_messages USING gin (LOWER(text_body) gin_trgm_ops);
