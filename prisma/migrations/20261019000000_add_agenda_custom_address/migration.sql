-- Dirección libre para visitas tipo "otra" sin instalación asociada.
-- Aditiva: columna nullable, sin backfill.
ALTER TABLE "public"."agenda_visitas" ADD COLUMN "custom_address" TEXT;
