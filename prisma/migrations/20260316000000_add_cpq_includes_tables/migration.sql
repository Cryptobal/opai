-- CreateTable
CREATE TABLE "cpq"."includes_suggestions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT,
    "text" TEXT NOT NULL,
    "category" TEXT,
    "service_type" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "includes_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cpq"."quote_includes_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "quote_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "show_in_pdf" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'suggestion',
    "suggestion_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_includes_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_cpq_includes_suggestions_tenant" ON "cpq"."includes_suggestions"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_cpq_includes_suggestions_active_sort" ON "cpq"."includes_suggestions"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "idx_cpq_quote_includes_items_quote" ON "cpq"."quote_includes_items"("quote_id");

-- CreateIndex
CREATE INDEX "idx_cpq_quote_includes_items_sort" ON "cpq"."quote_includes_items"("quote_id", "sort_order");

-- AddForeignKey
ALTER TABLE "cpq"."quote_includes_items" ADD CONSTRAINT "quote_includes_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "cpq"."quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cpq"."quote_includes_items" ADD CONSTRAINT "quote_includes_items_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "cpq"."includes_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate existing includedItems data from quotes to new table
INSERT INTO "cpq"."quote_includes_items" ("id", "quote_id", "text", "sort_order", "show_in_pdf", "source", "updated_at")
SELECT
    uuid_generate_v4(),
    q."id",
    unnest(q."included_items"),
    row_number() OVER (PARTITION BY q."id" ORDER BY ordinality) - 1,
    true,
    'custom',
    NOW()
FROM "cpq"."quotes" q,
     unnest(q."included_items") WITH ORDINALITY
WHERE array_length(q."included_items", 1) > 0;
