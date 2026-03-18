-- AlterTable: OpsMonitoreoTurno — add controlNocturnoId (1:1 link to OpsControlNocturno)
ALTER TABLE "ops"."monitoreo_turnos" ADD COLUMN "control_nocturno_id" UUID;
ALTER TABLE "ops"."monitoreo_turnos" ADD CONSTRAINT "monitoreo_turnos_control_nocturno_id_key" UNIQUE ("control_nocturno_id");
ALTER TABLE "ops"."monitoreo_turnos" ADD CONSTRAINT "monitoreo_turnos_control_nocturno_id_fkey"
  FOREIGN KEY ("control_nocturno_id") REFERENCES "ops"."control_nocturno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: OpsControlNocturno — add autoPopulateMode
ALTER TABLE "ops"."control_nocturno" ADD COLUMN "auto_populate_mode" TEXT NOT NULL DEFAULT 'hybrid';

-- AlterTable: OpsControlNocturnoRonda — add auto-populate tracking fields
ALTER TABLE "ops"."control_nocturno_rondas" ADD COLUMN "auto_populated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ops"."control_nocturno_rondas" ADD COLUMN "manual_override" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ops"."control_nocturno_rondas" ADD COLUMN "override_by" TEXT;
ALTER TABLE "ops"."control_nocturno_rondas" ADD COLUMN "override_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."control_nocturno_rondas" ADD COLUMN "trust_score" INTEGER;
ALTER TABLE "ops"."control_nocturno_rondas" ADD COLUMN "trust_color" TEXT;

-- AlterTable: OpsControlNocturnoInstalacion — add autoAsistencia flag
ALTER TABLE "ops"."control_nocturno_instalaciones" ADD COLUMN "auto_asistencia" BOOLEAN NOT NULL DEFAULT false;
