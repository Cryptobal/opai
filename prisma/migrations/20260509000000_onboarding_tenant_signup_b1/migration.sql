-- Onboarding tenant — base backend (Noche 1, Bloque 1)
--
-- 1) Extiende Tenant con campos comerciales/operativos top-level y tracking
--    del signup público.
-- 2) Crea PendingSignup: registros previos a la verificación de email.
-- 3) Crea AdminOnboardingState: estado del first-run wizard por admin.
-- 4) Crea AdminTourState: estado de tours guiados por módulo.
--
-- Idempotente (IF NOT EXISTS) para que se pueda re-ejecutar sin romper
-- entornos donde ya se aplicó parcialmente vía db push.

-- ── Tenant: nuevos campos ──
ALTER TABLE "public"."Tenant"
  ADD COLUMN IF NOT EXISTS "legal_name" TEXT,
  ADD COLUMN IF NOT EXISTS "company_rut" TEXT,
  ADD COLUMN IF NOT EXISTS "industry" TEXT,
  ADD COLUMN IF NOT EXISTS "estimated_guards" TEXT,
  ADD COLUMN IF NOT EXISTS "signup_source" TEXT,
  ADD COLUMN IF NOT EXISTS "signup_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "signup_utm" JSONB,
  ADD COLUMN IF NOT EXISTS "custom_domain" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_custom_domain_key" ON "public"."Tenant"("custom_domain");
CREATE INDEX IF NOT EXISTS "Tenant_signup_completed_at_idx" ON "public"."Tenant"("signup_completed_at");
CREATE INDEX IF NOT EXISTS "Tenant_custom_domain_idx" ON "public"."Tenant"("custom_domain");

-- ── PendingSignup ──
CREATE TABLE IF NOT EXISTS "public"."pending_signups" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "owner_name" TEXT NOT NULL,
  "owner_phone" TEXT,
  "legal_name" TEXT,
  "company_rut" TEXT,
  "commercial_name" TEXT NOT NULL,
  "proposed_slug" TEXT NOT NULL,
  "industry" TEXT,
  "estimated_guards" TEXT,
  "address" TEXT,
  "commune" TEXT,
  "city" TEXT,
  "giro" TEXT,
  "source" TEXT,
  "utm_source" TEXT,
  "utm_campaign" TEXT,
  "utm_medium" TEXT,
  "ip" TEXT,
  "user_agent" TEXT,
  "sii_data" JSONB,
  "verification_token" TEXT NOT NULL,
  "verification_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verified_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "resent_count" INTEGER NOT NULL DEFAULT 0,
  "last_resend_at" TIMESTAMP(3),
  "requires_review" BOOLEAN NOT NULL DEFAULT false,
  "review_reason" TEXT,
  "provisioned_tenant_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pending_signups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pending_signups_verification_token_key" ON "public"."pending_signups"("verification_token");
CREATE INDEX IF NOT EXISTS "pending_signups_email_idx" ON "public"."pending_signups"("email");
CREATE INDEX IF NOT EXISTS "pending_signups_verification_token_idx" ON "public"."pending_signups"("verification_token");
CREATE INDEX IF NOT EXISTS "pending_signups_expires_at_idx" ON "public"."pending_signups"("expires_at");
CREATE INDEX IF NOT EXISTS "pending_signups_verified_at_idx" ON "public"."pending_signups"("verified_at");
CREATE INDEX IF NOT EXISTS "pending_signups_requires_review_idx" ON "public"."pending_signups"("requires_review");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pending_signups_provisioned_tenant_id_fkey'
  ) THEN
    ALTER TABLE "public"."pending_signups"
      ADD CONSTRAINT "pending_signups_provisioned_tenant_id_fkey"
      FOREIGN KEY ("provisioned_tenant_id") REFERENCES "public"."Tenant"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── AdminOnboardingState ──
CREATE TABLE IF NOT EXISTS "public"."admin_onboarding_state" (
  "id" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "welcome_started_at" TIMESTAMP(3),
  "welcome_completed_at" TIMESTAMP(3),
  "welcome_skipped_at" TIMESTAMP(3),
  "logo_uploaded" BOOLEAN NOT NULL DEFAULT false,
  "first_installation" BOOLEAN NOT NULL DEFAULT false,
  "first_guard" BOOLEAN NOT NULL DEFAULT false,
  "first_invite" BOOLEAN NOT NULL DEFAULT false,
  "demo_data_loaded" BOOLEAN NOT NULL DEFAULT false,
  "checklist_dismissed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_onboarding_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_onboarding_state_admin_id_key" ON "public"."admin_onboarding_state"("admin_id");
CREATE INDEX IF NOT EXISTS "admin_onboarding_state_admin_id_idx" ON "public"."admin_onboarding_state"("admin_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_onboarding_state_admin_id_fkey'
  ) THEN
    ALTER TABLE "public"."admin_onboarding_state"
      ADD CONSTRAINT "admin_onboarding_state_admin_id_fkey"
      FOREIGN KEY ("admin_id") REFERENCES "public"."Admin"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── AdminTourState ──
CREATE TABLE IF NOT EXISTS "public"."admin_tour_state" (
  "id" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "tour_key" TEXT NOT NULL,
  "completed_at" TIMESTAMP(3),
  "skipped_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_tour_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_tour_state_admin_id_tour_key_key" ON "public"."admin_tour_state"("admin_id", "tour_key");
CREATE INDEX IF NOT EXISTS "admin_tour_state_admin_id_idx" ON "public"."admin_tour_state"("admin_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_tour_state_admin_id_fkey'
  ) THEN
    ALTER TABLE "public"."admin_tour_state"
      ADD CONSTRAINT "admin_tour_state_admin_id_fkey"
      FOREIGN KEY ("admin_id") REFERENCES "public"."Admin"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
