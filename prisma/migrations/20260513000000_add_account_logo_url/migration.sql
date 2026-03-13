-- AlterTable: add logo_url column to crm.accounts
ALTER TABLE "crm"."accounts" ADD COLUMN IF NOT EXISTS "logo_url" TEXT;
