-- WebhookSession: preview Zoho / CPQ antes de enviar presentación

CREATE TABLE "public"."webhook_sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "zoho_data" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_sessions_session_id_key" ON "public"."webhook_sessions"("session_id");

CREATE INDEX "webhook_sessions_tenant_id_idx" ON "public"."webhook_sessions"("tenant_id");

CREATE INDEX "webhook_sessions_expires_at_idx" ON "public"."webhook_sessions"("expires_at");

ALTER TABLE "public"."webhook_sessions" ADD CONSTRAINT "webhook_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
