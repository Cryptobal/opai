-- AlterTable: add portal_visible to protocol_sections
ALTER TABLE "crm"."protocol_sections" ADD COLUMN "portal_visible" BOOLEAN NOT NULL DEFAULT true;
