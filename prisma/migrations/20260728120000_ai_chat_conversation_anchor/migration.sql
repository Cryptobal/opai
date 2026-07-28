-- Ancla opcional de conversaciones IA a entidades de negocio (aditivo, nullable).
ALTER TABLE "public"."AiChatConversation"
  ADD COLUMN IF NOT EXISTS "anchor_type" TEXT,
  ADD COLUMN IF NOT EXISTS "anchor_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_ai_chat_conv_anchor"
  ON "public"."AiChatConversation"("tenantId", "anchor_type", "anchor_id");
