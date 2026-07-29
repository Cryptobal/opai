-- ============================================================================
-- PENDING MIGRATION — ÍNDICES DE BÚSQUEDA DE CORREO (C15 / PR-07 + híbrida)
-- Aplicar MANUALMENTE en producción, fuera de prisma migrate deploy.
-- ============================================================================
--
-- ESTADO (2026-07-29): a la fecha del brief de buscador+asistente, NINGUNO de
-- estos índices estaba verificado como aplicado en producción. Antesir antes
-- de aplicar:
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'crm' AND indexname LIKE 'idx_crm_email_%';
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--
-- Las expresiones de los índices GIN DEBEN coincidir carácter por carácter
-- con las de `buildTextConditions` / `buildStructuralConditions` en
-- `src/modules/crm/email/correos-search.ts`. Un índice sobre LOWER(col)
-- NO sirve para `col ILIKE` — el planner no reescribe.
--
-- ORDEN DE APLICACIÓN (uno por vez, ventana de baja actividad):
--   1. idx_crm_email_threads_mailbox_recent  — barato, alivia ORDER BY
--   2. idx_crm_email_threads_subject_trgm    — asunto
--   3. idx_crm_email_messages_from_trgm      — remitente
--   4. idx_crm_email_messages_text_body_trgm — cuerpo texto (PESADO)
--   5. idx_crm_email_messages_html_body_trgm — cuerpo HTML (PESADO)
-- Tras cada CREATE: verificar `indisvalid` y latencia del sync Gmail.
-- Los índices de cuerpo son los más costosos en escritura: el sync inserta
-- continuamente. Si la latencia del sync sube de más, DROP INDEX CONCURRENTLY
-- del cuerpo y evaluar acotar la rama de cuerpo a mensajes recientes.
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
-- Si existía el índice legacy `idx_crm_email_messages_body_trgm` (LOWER(text_body)
-- sin f_unaccent / COALESCE), dropearlo antes de crear el nuevo:
--   DROP INDEX CONCURRENTLY IF EXISTS crm.idx_crm_email_messages_body_trgm;
--
-- Requiere: extensiones pg_trgm + función public.f_unaccent IMMUTABLE (migración
-- 20260916000000_add_search_unaccent_normalization). Verificar con `\df+ public.f_unaccent`.
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_email_threads_mailbox_recent
  ON crm.email_threads (email_account_id, last_message_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_email_threads_subject_trgm
  ON crm.email_threads USING gin (LOWER(public.f_unaccent(subject)) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_email_messages_from_trgm
  ON crm.email_messages USING gin (LOWER(from_email) gin_trgm_ops);

-- Cuerpo texto: expresión idéntica a la rama de cuerpo en correos-search.ts.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_email_messages_text_body_trgm
  ON crm.email_messages USING gin (LOWER(public.f_unaccent(COALESCE(text_body,''))) gin_trgm_ops);

-- Cuerpo HTML: correos solo-HTML (sin text_body) quedan buscables.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_email_messages_html_body_trgm
  ON crm.email_messages USING gin (LOWER(public.f_unaccent(COALESCE(html_body,''))) gin_trgm_ops);
