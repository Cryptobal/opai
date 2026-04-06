-- Indeed ATS integration (per-tenant OAuth, feed, Indeed Apply)
CREATE TABLE "ops"."ats_indeed_integrations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "indeed_account_id" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMPTZ(6),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feed_source_id" TEXT,
    "feed_status" TEXT NOT NULL DEFAULT 'pending',
    "indeed_apply_enabled" BOOLEAN NOT NULL DEFAULT false,
    "api_token_client_id" TEXT,
    "api_token_secret" TEXT,
    "last_sync_at" TIMESTAMPTZ(6),
    "last_error_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "job_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ats_indeed_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ats_indeed_integrations_tenant_id_key" ON "ops"."ats_indeed_integrations"("tenant_id");

ALTER TABLE "ops"."ats_indeed_integrations" ADD CONSTRAINT "ats_indeed_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
