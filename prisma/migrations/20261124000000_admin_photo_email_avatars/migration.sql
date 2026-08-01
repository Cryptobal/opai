-- Foto de perfil de usuarios ERP (Admin)
ALTER TABLE "public"."Admin" ADD COLUMN IF NOT EXISTS "photo_url" TEXT;
ALTER TABLE "public"."Admin" ADD COLUMN IF NOT EXISTS "photo_key" TEXT;

-- Cache de avatares de correo (Admin del tenant + Google People API)
CREATE TABLE IF NOT EXISTS "crm"."email_contact_avatars" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "photo_url" TEXT,
    "source" TEXT NOT NULL DEFAULT 'none',
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_contact_avatars_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_email_contact_avatars_tenant_email"
  ON "crm"."email_contact_avatars"("tenant_id", "email");

CREATE INDEX IF NOT EXISTS "idx_crm_email_contact_avatars_expires"
  ON "crm"."email_contact_avatars"("tenant_id", "expires_at");
