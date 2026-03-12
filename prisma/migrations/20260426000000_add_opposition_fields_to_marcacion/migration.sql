-- AlterTable: add opposition fields to ops.ops_marcaciones (Res. N°38 Art. 5)
ALTER TABLE "ops"."ops_marcaciones"
  ADD COLUMN "opposition_token" TEXT,
  ADD COLUMN "opposed_at" TIMESTAMPTZ(6),
  ADD COLUMN "opposed_by" TEXT,
  ADD COLUMN "opposition_reason" TEXT,
  ADD COLUMN "consolidated_at" TIMESTAMPTZ(6);

-- CreateIndex: unique constraint on opposition_token
CREATE UNIQUE INDEX "ops_marcaciones_opposition_token_key" ON "ops"."ops_marcaciones"("opposition_token");
