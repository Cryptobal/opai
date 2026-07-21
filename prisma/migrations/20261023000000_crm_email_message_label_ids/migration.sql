-- Labels Gmail por mensaje: fuente local para derivar estado de hilo
-- sin depender de listados globales INBOX/TRASH/SPAM.
ALTER TABLE "crm"."email_messages"
  ADD COLUMN IF NOT EXISTS "label_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
