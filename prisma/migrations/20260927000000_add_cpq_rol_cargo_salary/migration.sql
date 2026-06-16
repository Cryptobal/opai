-- ──────────────────────────────────────────────────────────────────────
-- CPQ — Sueldos brutos preconfigurados por Rol × Cargo.
--
--   * cpq.rol_cargo_salary: un sueldo día (salary_day) y noche (salary_night)
--     por cada cruce (tenant_id, rol_id, cargo_id).
--   * FKs a cpq.roles / cpq.cargos con ON DELETE CASCADE (si se borra el rol
--     o el cargo, desaparece el cruce preconfigurado).
--   * Único por (tenant_id, rol_id, cargo_id) → upsert idempotente.
--
-- 100% aditiva: tabla nueva, no toca nada existente. Segura sobre prod.
-- ──────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE IF NOT EXISTS "cpq"."rol_cargo_salary" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "rol_id" UUID NOT NULL,
    "cargo_id" UUID NOT NULL,
    "salary_day" INTEGER NOT NULL DEFAULT 0,
    "salary_night" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rol_cargo_salary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rol_cargo_salary"
  ON "cpq"."rol_cargo_salary"("tenant_id", "rol_id", "cargo_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_rol_cargo_salary_tenant"
  ON "cpq"."rol_cargo_salary"("tenant_id");

-- AddForeignKey
ALTER TABLE "cpq"."rol_cargo_salary"
  ADD CONSTRAINT "rol_cargo_salary_rol_id_fkey"
  FOREIGN KEY ("rol_id") REFERENCES "cpq"."roles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cpq"."rol_cargo_salary"
  ADD CONSTRAINT "rol_cargo_salary_cargo_id_fkey"
  FOREIGN KEY ("cargo_id") REFERENCES "cpq"."cargos"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
