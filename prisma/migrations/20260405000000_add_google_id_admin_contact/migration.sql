-- AlterTable: Add googleId to Admin
ALTER TABLE "public"."Admin" ADD COLUMN "google_id" TEXT;

-- CreateIndex: unique constraint on Admin.googleId
CREATE UNIQUE INDEX "Admin_google_id_key" ON "public"."Admin"("google_id");

-- AlterTable: Add googleId to CrmContact (crm.contacts)
ALTER TABLE "crm"."contacts" ADD COLUMN "google_id" TEXT;

-- CreateIndex: unique constraint on CrmContact.googleId
CREATE UNIQUE INDEX "contacts_google_id_key" ON "crm"."contacts"("google_id");
