-- AlterTable: make rondaTemplateId nullable and add isAdHoc to OpsRondaEjecucion
ALTER TABLE ops."ronda_ejecuciones"
    ALTER COLUMN "ronda_template_id" DROP NOT NULL;

ALTER TABLE ops."ronda_ejecuciones"
    ADD COLUMN "is_ad_hoc" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: make ejecucionId nullable on OpsAlertaRonda
ALTER TABLE ops."alertas_ronda"
    ALTER COLUMN "ejecucion_id" DROP NOT NULL;
