-- AlterTable: fijar hilos del asistente
ALTER TABLE "public"."AiChatConversation" ADD COLUMN IF NOT EXISTS "pinned_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "idx_ai_chat_conv_pinned"
  ON "public"."AiChatConversation"("tenantId", "userId", "pinned_at");

-- CreateTable: confirmaciones web (espejo de slack_pending_actions)
CREATE TABLE IF NOT EXISTS "public"."ai_pending_actions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "message_id" TEXT,
    "kind" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "tool_args" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_pending_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ai_pending_tenant_user_status"
  ON "public"."ai_pending_actions"("tenant_id", "user_id", "status");

CREATE INDEX IF NOT EXISTS "idx_ai_pending_expires"
  ON "public"."ai_pending_actions"("expires_at");

DO $$ BEGIN
  ALTER TABLE "public"."ai_pending_actions"
    ADD CONSTRAINT "ai_pending_actions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
