-- ============================================================================
-- PENDING MIGRATION — FLAGS DE VISIBILIDAD DE HILOS DE CORREO (Lector v3, Bloque 5)
-- Aplicar MANUALMENTE en producción, fuera de prisma migrate deploy.
-- ============================================================================
--
-- Cambios SOLO aditivos (dos columnas boolean con DEFAULT true). Modelo
-- aprobado: "asociar = compartir" — el hilo asociado a una cuenta/entidad es
-- visible en su ficha (sección "Conversaciones") para quienes tengan acceso a
-- ella; la casilla del usuario sigue siendo privada. El toggle deja el hilo
-- privado sin desasociar.
--
--   1. crm.email_threads.shared_with_account  — visibilidad del hilo en la
--      ficha de la CUENTA asociada.
--   2. crm.email_thread_links.visible_on_entity — visibilidad del hilo en la
--      ficha de la ENTIDAD vinculada (instalación, etc.).
--
-- Ambas con DEFAULT true: los hilos ya asociados quedan visibles (sin backfill).
-- Reversible con DROP COLUMN. Idempotentes (IF NOT EXISTS).
--
-- CÓMO APLICAR (producción): ejecutar los dos statements (no requieren
-- CONCURRENTLY ni bloqueo relevante en tablas de correo).
-- ============================================================================

ALTER TABLE crm.email_threads
  ADD COLUMN IF NOT EXISTS shared_with_account boolean NOT NULL DEFAULT true;

ALTER TABLE crm.email_thread_links
  ADD COLUMN IF NOT EXISTS visible_on_entity boolean NOT NULL DEFAULT true;
