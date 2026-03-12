-- Fix OpsAsistenciaDiaria → puesto relation from CASCADE to RESTRICT
-- Resolución N°38: attendance records must not be deleted when a puesto is deleted.

ALTER TABLE "ops"."asistencia_diaria" DROP CONSTRAINT IF EXISTS "asistencia_diaria_puesto_id_fkey";
ALTER TABLE "ops"."asistencia_diaria" ADD CONSTRAINT "asistencia_diaria_puesto_id_fkey"
  FOREIGN KEY ("puesto_id") REFERENCES "ops"."puestos_operativos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
