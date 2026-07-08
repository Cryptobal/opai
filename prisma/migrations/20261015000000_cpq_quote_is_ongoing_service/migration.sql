-- ──────────────────────────────────────────────────────────────────────
-- Continuidad del servicio en la cotización: distingue servicio CONTINUO
-- (indefinido, default) de PLAZO DEFINIDO (termina a los contractDuration
-- meses). Alimenta el canvas de Slack ("servicio continuo" vs "N meses ·
-- hasta Y"). 100% aditiva: ADD COLUMN con default true, IF NOT EXISTS.
--
-- ⚠️ HARD STOP: NO aplicar automáticamente. Aplicar contra la BD solo tras
--    revisión humana (Bloque 4 del plan de instalación/continuidad).
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "cpq"."quotes"
  ADD COLUMN IF NOT EXISTS "is_ongoing_service" BOOLEAN NOT NULL DEFAULT true;
