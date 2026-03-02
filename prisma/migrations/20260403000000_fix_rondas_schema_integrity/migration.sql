-- Step 1: Add FK relation for OpsControlNocturnoRonda.ejecucionRondaId (was orphan FK)
ALTER TABLE "ops"."control_nocturno_rondas"
  ADD CONSTRAINT "control_nocturno_rondas_ejecucion_ronda_id_fkey"
  FOREIGN KEY ("ejecucion_ronda_id")
  REFERENCES "ops"."ronda_ejecuciones"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 2: Add installationId column to ronda_incidentes + FK + index
ALTER TABLE "ops"."ronda_incidentes"
  ADD COLUMN "installation_id" UUID;

ALTER TABLE "ops"."ronda_incidentes"
  ADD CONSTRAINT "ronda_incidentes_installation_id_fkey"
  FOREIGN KEY ("installation_id")
  REFERENCES "crm"."installations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_ops_ronda_incidente_installation"
  ON "ops"."ronda_incidentes"("installation_id");

-- Step 3: Fix OpsSupervisionFinding.updatedAt — drop @default(now()), Prisma @updatedAt handles it at app level
-- (No SQL needed: @updatedAt is enforced by Prisma client, not a DB default)
ALTER TABLE "ops"."supervision_findings"
  ALTER COLUMN "updated_at" DROP DEFAULT;

-- Step 4: Replace index with unique constraint on OpsMarcacionCheckpoint(ejecucionId, checkpointId)
DROP INDEX IF EXISTS "ops"."idx_ops_marcacion_cp_ej_cp";

CREATE UNIQUE INDEX "uq_ops_marcacion_cp_ej_cp"
  ON "ops"."marcacion_checkpoints"("ejecucion_id", "checkpoint_id");

-- Step 5: alertas Json field on OpsRondaEjecucion — kept as-is (still used by code), only marked deprecated in schema

-- Step 6: Add missing index on OpsAlertaRonda.guardiaId
CREATE INDEX "idx_ops_alerta_ronda_guardia"
  ON "ops"."alertas_ronda"("guardia_id");
