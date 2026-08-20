-- Ficha HR: clase económica (costo vs gasto) + vínculo Admin + sueldo staff.
-- Flujo de caja: subfilas canónicas de remuneraciones (guardias vs equipo interno).
-- ADD VALUE va primero y no se usa el enum en el resto de este archivo.

ALTER TYPE "finance"."FlowRowKey" ADD VALUE IF NOT EXISTS 'SUELDO_OPERATIVO';
ALTER TYPE "finance"."FlowRowKey" ADD VALUE IF NOT EXISTS 'SUELDO_ADMIN';
ALTER TYPE "finance"."FlowRowKey" ADD VALUE IF NOT EXISTS 'QUINCENA_OPERATIVO';
ALTER TYPE "finance"."FlowRowKey" ADD VALUE IF NOT EXISTS 'QUINCENA_ADMIN';
ALTER TYPE "finance"."FlowRowKey" ADD VALUE IF NOT EXISTS 'PREVIRED_OPERATIVO';
ALTER TYPE "finance"."FlowRowKey" ADD VALUE IF NOT EXISTS 'PREVIRED_ADMIN';

ALTER TABLE "ops"."personas"
  ADD COLUMN IF NOT EXISTS "labor_class" TEXT NOT NULL DEFAULT 'OPERATIVO',
  ADD COLUMN IF NOT EXISTS "cargo_staff" TEXT,
  ADD COLUMN IF NOT EXISTS "salary_structure_id" UUID,
  ADD COLUMN IF NOT EXISTS "admin_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_ops_personas_tenant_labor_class"
  ON "ops"."personas"("tenant_id", "labor_class");

CREATE UNIQUE INDEX IF NOT EXISTS "personas_admin_id_key"
  ON "ops"."personas"("admin_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'personas_salary_structure_id_fkey'
  ) THEN
    ALTER TABLE "ops"."personas"
      ADD CONSTRAINT "personas_salary_structure_id_fkey"
      FOREIGN KEY ("salary_structure_id")
      REFERENCES "payroll"."salary_structures"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'personas_admin_id_fkey'
  ) THEN
    ALTER TABLE "ops"."personas"
      ADD CONSTRAINT "personas_admin_id_fkey"
      FOREIGN KEY ("admin_id")
      REFERENCES "public"."Admin"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
