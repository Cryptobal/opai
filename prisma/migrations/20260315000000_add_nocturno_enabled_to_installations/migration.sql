-- Add nocturno_enabled flag to installations.
-- Default TRUE so existing installations keep being included in night reports.
-- Set to FALSE for daytime-only installations to exclude them.

ALTER TABLE "crm"."installations"
ADD COLUMN "nocturno_enabled" BOOLEAN NOT NULL DEFAULT TRUE;
