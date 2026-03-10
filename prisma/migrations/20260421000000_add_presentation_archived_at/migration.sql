-- AlterTable: add archived_at column to Presentation
ALTER TABLE "Presentation" ADD COLUMN "archived_at" TIMESTAMP(3);

-- DataMigration: archive presentations linked to closed deals (won/lost)
-- Path 1: Presentation → cpq.quotes → crm.deal_quotes → crm.deals → crm.pipeline_stages
UPDATE "Presentation" p
SET "archived_at" = NOW()
FROM "cpq"."quotes" q
JOIN "crm"."deal_quotes" dq ON dq."quote_id" = q."id"
JOIN "crm"."deals" d ON d."id" = dq."deal_id"
JOIN "crm"."pipeline_stages" ps ON ps."id" = d."stage_id"
WHERE p."quote_id"::uuid = q."id"
  AND (ps."is_closed_won" = true OR ps."is_closed_lost" = true)
  AND p."archived_at" IS NULL;

-- Path 2: Presentation → cpq.quotes (via dealId direct link) → crm.deals → crm.pipeline_stages
UPDATE "Presentation" p
SET "archived_at" = NOW()
FROM "cpq"."quotes" q
JOIN "crm"."deals" d ON d."id" = q."deal_id"
JOIN "crm"."pipeline_stages" ps ON ps."id" = d."stage_id"
WHERE p."quote_id"::uuid = q."id"
  AND (ps."is_closed_won" = true OR ps."is_closed_lost" = true)
  AND p."archived_at" IS NULL;
