-- Coords opcionales de Google Places para visitas a terreno (dirección libre).
-- Aditiva: columnas nullable, sin backfill.
ALTER TABLE "public"."agenda_visitas" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "public"."agenda_visitas" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
