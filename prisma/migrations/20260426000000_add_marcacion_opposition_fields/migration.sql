-- OpsMarcacion — Campos de oposición del trabajador (Res. N°38 art. 19)
ALTER TABLE "ops"."marcaciones" ADD COLUMN "opposition_token" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "opposed_at" TIMESTAMPTZ(6);
ALTER TABLE "ops"."marcaciones" ADD COLUMN "opposed_by" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "opposition_reason" TEXT;
ALTER TABLE "ops"."marcaciones" ADD COLUMN "consolidated_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "marcaciones_opposition_token_key" ON "ops"."marcaciones"("opposition_token");
