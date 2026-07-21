-- ──────────────────────────────────────────────────────────────────────
-- Licitación → Calendar — rango multi-día persistente (ADITIVA).
--
--   public.agenda_event_links.range_start_ymd
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."agenda_event_links"
  ADD COLUMN IF NOT EXISTS "range_start_ymd" TEXT;
