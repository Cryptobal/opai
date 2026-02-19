-- AlterTable
ALTER TABLE "ops"."personas" ADD COLUMN "regimen_previsional" TEXT,
ADD COLUMN "tipo_pension" TEXT,
ADD COLUMN "is_jubilado" BOOLEAN,
ADD COLUMN "cotiza_afp" BOOLEAN,
ADD COLUMN "cotiza_afc" BOOLEAN,
ADD COLUMN "cotiza_salud" BOOLEAN DEFAULT true;
