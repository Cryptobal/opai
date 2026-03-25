-- AlterTable: add optional horarios_custom JSONB column to ronda_programaciones
ALTER TABLE "ops"."ronda_programaciones"
ADD COLUMN "horarios_custom" JSONB;
