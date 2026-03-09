-- AlterTable
ALTER TABLE "chat"."push_subscriptions" ADD COLUMN "portal_type" TEXT;

-- Backfill existing subscriptions with inferred portal_type
UPDATE "chat"."push_subscriptions" SET "portal_type" = 'app' WHERE "subscriber_type" = 'ADMIN' AND "portal_type" IS NULL;
UPDATE "chat"."push_subscriptions" SET "portal_type" = 'guardia' WHERE "subscriber_type" = 'GUARD' AND "portal_type" IS NULL;
UPDATE "chat"."push_subscriptions" SET "portal_type" = 'cliente' WHERE "subscriber_type" = 'CLIENT' AND "portal_type" IS NULL;
