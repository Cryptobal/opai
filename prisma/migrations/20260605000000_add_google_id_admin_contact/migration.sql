-- Add Google OAuth ID to Admin (public schema)
ALTER TABLE "public"."Admin"
ADD COLUMN "google_id" TEXT;

CREATE UNIQUE INDEX "Admin_google_id_key" ON "public"."Admin"("google_id");

-- Add Google OAuth ID to CrmContact (crm schema)
ALTER TABLE "crm"."contacts"
ADD COLUMN "google_id" TEXT;

CREATE UNIQUE INDEX "contacts_google_id_key" ON "crm"."contacts"("google_id");
