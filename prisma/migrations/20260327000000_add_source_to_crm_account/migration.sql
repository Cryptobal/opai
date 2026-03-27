-- AlterTable: add source column to crm.accounts
ALTER TABLE "crm"."accounts" ADD COLUMN IF NOT EXISTS "source" TEXT;
