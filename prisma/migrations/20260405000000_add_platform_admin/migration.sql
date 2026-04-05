-- PlatformAdmin model
CREATE TABLE "public"."platform_admins" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "last_login_at" TIMESTAMP(3),

  CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on email
CREATE UNIQUE INDEX "platform_admins_email_key" ON "public"."platform_admins"("email");

-- Index on email for lookups
CREATE INDEX "platform_admins_email_idx" ON "public"."platform_admins"("email");

-- Extend Tenant with billing/support fields
ALTER TABLE "public"."Tenant" ADD COLUMN "billing_email" TEXT;
ALTER TABLE "public"."Tenant" ADD COLUMN "support_email" TEXT;
ALTER TABLE "public"."Tenant" ADD COLUMN "notes" TEXT;
ALTER TABLE "public"."Tenant" ADD COLUMN "suspended_at" TIMESTAMP(3);
ALTER TABLE "public"."Tenant" ADD COLUMN "suspended_reason" TEXT;
ALTER TABLE "public"."Tenant" ADD COLUMN "onboarded_by" TEXT;
ALTER TABLE "public"."Tenant" ADD COLUMN "last_activity_at" TIMESTAMP(3);
