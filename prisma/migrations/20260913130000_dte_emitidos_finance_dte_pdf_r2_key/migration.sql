-- ──────────────────────────────────────────────────────────────────────────
--  DTE Emitidos · Fase 1.D — Persistir PDF del DTE en R2.
--
--  Hoy el PDF se regenera on-demand cada envío usando pdf-lib + bwip-js
--  desde el XML guardado. Esta columna guarda el R2 key desde el primer
--  envío para reutilizarlo (idempotente) y bajar latencia en reenvíos.
--  NULL = todavía no se persistió (lazy backfill al próximo envío).
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "pdf_r2_key" TEXT;
