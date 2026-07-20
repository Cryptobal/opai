-- URL del evento en Google Calendar (para "Ver en Google Calendar").
-- Aditiva: columna nullable, sin backfill.
ALTER TABLE "public"."agenda_event_links" ADD COLUMN "html_link" TEXT;
