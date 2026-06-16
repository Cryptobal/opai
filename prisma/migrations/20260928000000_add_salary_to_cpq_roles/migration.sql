-- ──────────────────────────────────────────────────────────────────────
-- CPQ — Sueldo bruto sugerido por Rol/Turno.
--
--   * cpq.roles.salary: sueldo bruto (CLP) asociado al rol. Lo usa el editor
--     de puestos (PositionMatrix) para autocompletar el bruto al elegir rol.
--
-- 100% aditiva: columna nueva NOT NULL con default 0, segura sobre datos
-- existentes. Reemplaza al esquema rol×cargo (tabla rol_cargo_salary queda
-- en desuso pero no se elimina).
-- ──────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "cpq"."roles"
  ADD COLUMN IF NOT EXISTS "salary" INTEGER NOT NULL DEFAULT 0;
