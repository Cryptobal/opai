-- CreateTable: cpq.quote_additional_lines
CREATE TABLE IF NOT EXISTS "cpq"."quote_additional_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "quote_id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_additional_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_cpq_additional_lines_quote" ON "cpq"."quote_additional_lines"("quote_id");

-- AddForeignKey
ALTER TABLE "cpq"."quote_additional_lines" ADD CONSTRAINT "quote_additional_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "cpq"."quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
