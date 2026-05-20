-- Toggles de correos transaccionales por tenant
CREATE TABLE "public"."tenant_transactional_email_config" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "kind"       TEXT NOT NULL,
    "enabled"    BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_by" TEXT,
    CONSTRAINT "tenant_transactional_email_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_tenant_tx_email_kind" ON "public"."tenant_transactional_email_config"("tenant_id", "kind");
CREATE INDEX "idx_tenant_tx_email_tenant" ON "public"."tenant_transactional_email_config"("tenant_id");

-- Log unificado de envíos vía sendTenantEmail
CREATE TABLE "public"."tenant_email_log" (
    "id"              TEXT NOT NULL,
    "tenant_id"       TEXT NOT NULL,
    "module"          TEXT NOT NULL,
    "kind"            TEXT NOT NULL,
    "to_addresses"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cc_addresses"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "bcc_addresses"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "from_address"    TEXT NOT NULL,
    "reply_to"        TEXT,
    "subject"         TEXT NOT NULL,
    "resend_id"       TEXT,
    "status"          TEXT NOT NULL DEFAULT 'SENT',
    "error_message"   TEXT,
    "sent_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "delivered_at"    TIMESTAMPTZ(6),
    "opened_at"       TIMESTAMPTZ(6),
    "open_count"      INTEGER NOT NULL DEFAULT 0,
    "bounced_at"      TIMESTAMPTZ(6),
    "complained_at"   TIMESTAMPTZ(6),
    CONSTRAINT "tenant_email_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_tenant_email_log_tenant_sent" ON "public"."tenant_email_log"("tenant_id", "sent_at" DESC);
CREATE INDEX "idx_tenant_email_log_tenant_module_kind" ON "public"."tenant_email_log"("tenant_id", "module", "kind");
CREATE UNIQUE INDEX "uq_tenant_email_log_resend" ON "public"."tenant_email_log"("resend_id") WHERE "resend_id" IS NOT NULL;
