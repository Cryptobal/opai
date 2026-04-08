-- Alertas de Cobertura — Modo Libre (dirección manual) + MIXTO modalidad
--
-- 1) Agregar MIXTO al enum de modalidades (ya existía en el UI pero no en DB).
-- 2) Hacer installation_id opcional para permitir alertas sin instalación asociada.
-- 3) Agregar columnas para dirección libre (lat/lng/address/comuna/ciudad).
-- 4) Agregar CHECK constraint: una alerta debe tener instalación O dirección libre.

-- 1) Enum MIXTO
ALTER TYPE "ops"."OpsAlertaCoberturaModalidad" ADD VALUE IF NOT EXISTS 'MIXTO';

-- 2) Hacer installation_id opcional
ALTER TABLE "ops"."alertas_cobertura"
  ALTER COLUMN "installation_id" DROP NOT NULL;

-- 3) Columnas modo libre
ALTER TABLE "ops"."alertas_cobertura"
  ADD COLUMN IF NOT EXISTS "libre_address" TEXT,
  ADD COLUMN IF NOT EXISTS "libre_lat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "libre_lng" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "libre_comuna" TEXT,
  ADD COLUMN IF NOT EXISTS "libre_ciudad" TEXT;

-- 4) CHECK constraint: debe haber instalación O dirección libre completa
ALTER TABLE "ops"."alertas_cobertura"
  DROP CONSTRAINT IF EXISTS "alertas_cobertura_location_check";

ALTER TABLE "ops"."alertas_cobertura"
  ADD CONSTRAINT "alertas_cobertura_location_check"
  CHECK (
    "installation_id" IS NOT NULL
    OR (
      "libre_address" IS NOT NULL
      AND "libre_lat" IS NOT NULL
      AND "libre_lng" IS NOT NULL
    )
  );
