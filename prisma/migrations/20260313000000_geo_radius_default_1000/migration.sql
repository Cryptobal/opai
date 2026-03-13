-- Cambiar default de geo_radius_m de 100 a 1000 metros para instalaciones
ALTER TABLE "crm"."installations" ALTER COLUMN "geo_radius_m" SET DEFAULT 1000;
