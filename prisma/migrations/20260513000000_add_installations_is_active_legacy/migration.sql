-- Restaurar is_active como columna legacy derivada de status.
-- Compatibilidad con código/cliente que aún referencia is_active.
-- La migración 20260512 eliminó is_active; esta la restaura como columna sincronizada.
-- Solo aplica si status existe (20260512 aplicada).

DO $$
BEGIN
  -- Solo si status existe (migración 20260512 aplicada)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'crm' AND table_name = 'installations' AND column_name = 'status'
  ) THEN
    -- 1. Agregar is_active si no existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'crm' AND table_name = 'installations' AND column_name = 'is_active'
    ) THEN
      ALTER TABLE "crm"."installations" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT false;
      UPDATE "crm"."installations" SET "is_active" = (status = 'active'::crm."CrmInstallationStatus");
    END IF;

    -- 2. Función y trigger para mantener is_active sincronizado
    CREATE OR REPLACE FUNCTION "crm"."sync_installation_is_active_from_status"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.is_active := (NEW.status = 'active'::crm."CrmInstallationStatus");
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS "trg_sync_installation_is_active" ON "crm"."installations";
    CREATE TRIGGER "trg_sync_installation_is_active"
    BEFORE INSERT OR UPDATE OF status
    ON "crm"."installations"
    FOR EACH ROW
    EXECUTE FUNCTION "crm"."sync_installation_is_active_from_status"();

    -- 3. Índice
    CREATE INDEX IF NOT EXISTS "idx_crm_installations_is_active" ON "crm"."installations"("is_active");
  END IF;
END $$;
