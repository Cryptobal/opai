-- AlterTable: OpsControlNocturnoRonda — add rondaExpected flag
ALTER TABLE "ops"."control_nocturno_rondas" ADD COLUMN "ronda_expected" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: OpsControlNocturnoInstalacion — add monitoreo type fields
ALTER TABLE "ops"."control_nocturno_instalaciones" ADD COLUMN "monitoreo_type" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "ops"."control_nocturno_instalaciones" ADD COLUMN "ronda_frecuencia" INTEGER;
ALTER TABLE "ops"."control_nocturno_instalaciones" ADD COLUMN "rondas_esperadas" INTEGER NOT NULL DEFAULT 0;
