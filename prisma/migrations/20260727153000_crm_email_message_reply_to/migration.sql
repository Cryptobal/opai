-- AlterTable
ALTER TABLE "crm"."email_messages" ADD COLUMN IF NOT EXISTS "reply_to_email" TEXT;
