-- ──────────────────────────────────────────────────────────────────────
-- Canvas de Inicio de servicio: guarda el canvas_id del canal por negocio,
-- para que la Ficha de Inicio sea idempotente (no crear dos) y re-renderizable
-- (canvases.edit). 100% aditiva: ADD COLUMN nullable, IF NOT EXISTS.
--
-- ⚠️ HARD STOP: NO aplicar automáticamente. Aplicar contra la BD solo tras
--    revisión humana (ver Bloque 6 del plan del canvas de inicio).
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."crm_deal_slack_rooms"
  ADD COLUMN IF NOT EXISTS "start_canvas_id" TEXT;
