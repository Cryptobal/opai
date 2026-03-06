-- CreateTable
CREATE TABLE IF NOT EXISTS chat."push_subscriptions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "subscriber_type" chat."ChatSenderType" NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_chat_push_subscription_endpoint" ON chat."push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_chat_push_subscriptions_subscriber" ON chat."push_subscriptions"("tenant_id", "subscriber_type", "subscriber_id");
