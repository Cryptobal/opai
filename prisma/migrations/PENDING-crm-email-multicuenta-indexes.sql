-- ============================================================================
-- PENDING MIGRATION — ÍNDICES CORREO MULTICUENTA v1
-- Aplicar MANUALMENTE en producción, fuera de prisma migrate deploy.
-- ============================================================================
--
-- ORDEN DE APLICACIÓN (uno por vez, ventana de baja actividad):
--   1. Verificar duplicados (paso 0) — NO aplicar el único si hay filas.
--   2. uq_crm_email_accounts_tenant_user_email
--   3. idx_crm_email_threads_account_last_msg
--
-- CÓMO APLICAR (producción):
--   - CREATE INDEX CONCURRENTLY no puede correr dentro de una transacción:
--     ejecutar cada statement por separado (psql con autocommit, o el editor
--     SQL de Neon/Supabase statement a statement).
--   - Son idempotentes (IF NOT EXISTS).
--   - Si un CONCURRENTLY falla a medias deja un índice INVALID: detectarlo con
--     `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;` y
--     hacer DROP INDEX + reintentar.
--
-- ============================================================================
-- PASO 0 — Verificación de duplicados
-- ============================================================================
-- Si esta consulta devuelve filas, NO aplicar el índice único. Reportar;
-- no borrar filas automáticamente.
--
-- SELECT tenant_id, user_id, provider, email, count(*)
-- FROM crm.email_accounts
-- GROUP BY 1, 2, 3, 4
-- HAVING count(*) > 1;

-- ============================================================================
-- PASO 1 — Único por casilla (solo si el PASO 0 no devolvió filas)
-- ============================================================================
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_crm_email_accounts_tenant_user_email
  ON crm.email_accounts (tenant_id, user_id, provider, email);

-- ============================================================================
-- PASO 2 — Bandeja unificada: ORDER BY last_message_at por casilla
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_email_threads_account_last_msg
  ON crm.email_threads (email_account_id, last_message_at DESC);
