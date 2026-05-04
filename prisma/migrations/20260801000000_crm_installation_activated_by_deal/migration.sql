-- CrmInstallation: tracking del deal que activó la instalación
-- Permite saber qué negocio originó la activación para sincronización
-- Deal ↔ Quote ↔ Installation. Nullable: existing rows no se ven afectadas.

ALTER TABLE "crm"."installations"
  ADD COLUMN IF NOT EXISTS "activated_by_deal_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'installations_activated_by_deal_id_fkey'
      AND conrelid = 'crm.installations'::regclass
  ) THEN
    ALTER TABLE "crm"."installations"
      ADD CONSTRAINT "installations_activated_by_deal_id_fkey"
      FOREIGN KEY ("activated_by_deal_id")
      REFERENCES "crm"."deals" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_crm_installations_activated_by_deal"
  ON "crm"."installations" ("activated_by_deal_id");
