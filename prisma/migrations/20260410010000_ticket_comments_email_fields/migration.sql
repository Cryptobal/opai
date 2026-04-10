-- AlterTable: Add email conversation fields to ops_ticket_comments
ALTER TABLE "ops"."ops_ticket_comments"
  ADD COLUMN "body_html" TEXT,
  ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN "from_email" TEXT,
  ADD COLUMN "from_name" TEXT,
  ADD COLUMN "to_emails" TEXT[] DEFAULT '{}',
  ADD COLUMN "cc_emails" TEXT[] DEFAULT '{}',
  ADD COLUMN "bcc_emails" TEXT[] DEFAULT '{}',
  ADD COLUMN "subject" TEXT,
  ADD COLUMN "message_id" TEXT,
  ADD COLUMN "in_reply_to_message_id" TEXT,
  ADD COLUMN "thread_message_ids" TEXT[] DEFAULT '{}',
  ADD COLUMN "attachments" JSONB,
  ADD COLUMN "sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "delivery_status" TEXT,
  ADD COLUMN "delivery_error" TEXT,
  ADD COLUMN "resend_id" TEXT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

-- CreateIndex
CREATE UNIQUE INDEX "idx_ops_ticket_comments_message_id" ON "ops"."ops_ticket_comments"("message_id");
CREATE INDEX "idx_ops_ticket_comments_ticket_dir" ON "ops"."ops_ticket_comments"("ticket_id", "direction");
