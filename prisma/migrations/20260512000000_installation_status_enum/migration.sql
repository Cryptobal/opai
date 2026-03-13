-- Fase 5.1: Migrar CrmInstallation.isActive (boolean) a status (enum)
-- Mapeo: isActive=false → prospect, isActive=true → active

-- 0. Eliminar triggers que dependen de is_active
DROP TRIGGER IF EXISTS "trg_installation_requires_active_account" ON "crm"."installations" CASCADE;
DROP TRIGGER IF EXISTS "trg_deactivate_installations_on_account_inactive" ON "crm"."accounts" CASCADE;

-- 1. Crear tipo enum en schema crm
CREATE TYPE crm."CrmInstallationStatus" AS ENUM ('prospect', 'active', 'inactive');

-- 2. Agregar columna status (nullable temporalmente)
ALTER TABLE "crm"."installations" ADD COLUMN "status" crm."CrmInstallationStatus";

-- 3. Migrar datos existentes
UPDATE "crm"."installations"
SET "status" = CASE
  WHEN "is_active" = true THEN 'active'::crm."CrmInstallationStatus"
  ELSE 'prospect'::crm."CrmInstallationStatus"
END;

-- 4. Hacer NOT NULL y default
ALTER TABLE "crm"."installations" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "crm"."installations" ALTER COLUMN "status" SET DEFAULT 'prospect';

-- 5. Eliminar índice antiguo
DROP INDEX IF EXISTS "crm"."idx_crm_installations_is_active";

-- 6. Eliminar columna is_active
ALTER TABLE "crm"."installations" DROP COLUMN "is_active";

-- 7. Crear índice en status (para filtros frecuentes)
CREATE INDEX "idx_crm_installations_status" ON "crm"."installations"("status");

-- 8. Recrear función ensure_installation_account_active (usa status en vez de is_active)
CREATE OR REPLACE FUNCTION "crm"."ensure_installation_account_active"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_active BOOLEAN;
BEGIN
  IF NEW.account_id IS NULL OR NEW.status IS DISTINCT FROM 'active'::crm."CrmInstallationStatus" THEN
    RETURN NEW;
  END IF;

  SELECT a.is_active
  INTO account_active
  FROM "crm"."accounts" a
  WHERE a.id = NEW.account_id;

  IF COALESCE(account_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'Cannot set installation active for inactive account (%).', NEW.account_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_installation_requires_active_account"
BEFORE INSERT OR UPDATE OF status, account_id
ON "crm"."installations"
FOR EACH ROW
EXECUTE FUNCTION "crm"."ensure_installation_account_active"();

-- 9. Recrear función deactivate_account_installations (usa status en vez de is_active)
CREATE OR REPLACE FUNCTION "crm"."deactivate_account_installations"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
    UPDATE "crm"."installations"
    SET status = 'inactive'::crm."CrmInstallationStatus"
    WHERE account_id = NEW.id
      AND status = 'active'::crm."CrmInstallationStatus";
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_deactivate_installations_on_account_inactive"
AFTER UPDATE OF is_active
ON "crm"."accounts"
FOR EACH ROW
EXECUTE FUNCTION "crm"."deactivate_account_installations"();
