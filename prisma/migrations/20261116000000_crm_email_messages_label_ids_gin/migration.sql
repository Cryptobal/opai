-- Las derivaciones de estado de hilo filtran por `label_ids @> ARRAY['INBOX']`.
-- Sin GIN, cada pasada es seq scan sobre crm.email_messages.
-- Prisma no modela índices GIN sobre String[]; ver comentario en schema.prisma.
CREATE INDEX IF NOT EXISTS "idx_crm_email_messages_label_ids"
  ON "crm"."email_messages" USING GIN ("label_ids");
