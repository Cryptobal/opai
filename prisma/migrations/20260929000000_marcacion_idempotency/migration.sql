-- ──────────────────────────────────────────────────────────────────────
-- Marcación — idempotencia y trazabilidad de marca tardía/offline.
--
--   * idempotency_key: deduplica reintentos del mismo intento de marca
--     (doble-tap, retry de red). Unicidad parcial: ignora NULL y soft-deleted.
--   * origen_marca: origen explícito de la marca para auditoría
--     ('online' | 'offline_queue' | 'retry' | 'sync_diferida').
--
-- 100% aditiva: columnas nullable + índice único parcial. No destructiva.
-- ──────────────────────────────────────────────────────────────────────

-- Idempotency key para deduplicar reintentos del mismo intento de marca
ALTER TABLE "ops"."marcaciones"
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

-- Origen explícito de la marca (manual / retry / cola offline / sync diferida)
ALTER TABLE "ops"."marcaciones"
  ADD COLUMN IF NOT EXISTS "origen_marca" TEXT;

-- Único parcial: una sola marca por (tenant, idempotency_key).
-- Ignora NULL (marcas sin key) y soft-deleted (deleted_at IS NOT NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_marcaciones_idempotency"
  ON "ops"."marcaciones" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL AND "deleted_at" IS NULL;
