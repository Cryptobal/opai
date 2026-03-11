-- AlterTable: Add walk route and route snapshot to OpsRondaEjecucion
ALTER TABLE "ops"."ronda_ejecuciones" ADD COLUMN IF NOT EXISTS "walk_route" JSONB;
ALTER TABLE "ops"."ronda_ejecuciones" ADD COLUMN IF NOT EXISTS "route_snapshot" JSONB;
