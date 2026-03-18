-- Prospectos e inactivas no deben tener control nocturno ni chat activos.
-- 1. Corregir prospectos e inactivas existentes
UPDATE "crm"."installations"
SET "nocturno_enabled" = false, "chat_enabled" = false
WHERE "status" IN ('prospect'::crm."CrmInstallationStatus", 'inactive'::crm."CrmInstallationStatus");

-- 2. Cambiar default de nocturno_enabled para nuevas instalaciones
ALTER TABLE "crm"."installations"
  ALTER COLUMN "nocturno_enabled" SET DEFAULT false;
