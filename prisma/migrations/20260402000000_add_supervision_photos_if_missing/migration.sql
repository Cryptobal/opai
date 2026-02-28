-- Fix: Create ops.supervision_photos if missing (P2021 - table does not exist)
-- This can happen when migrations have ordering issues or db push wasn't run.
-- Safe to run: idempotent (IF NOT EXISTS / conditional constraints).

CREATE TABLE IF NOT EXISTS "ops"."supervision_photos" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "visit_id" UUID NOT NULL,
  "category_id" UUID,
  "category_name" TEXT,
  "photo_url" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "file_name" TEXT,
  "mime_type" TEXT,
  "size" INTEGER,
  "gps_lat" DECIMAL(10,7),
  "gps_lng" DECIMAL(10,7),
  "taken_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supervision_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_supervision_photos_visit" ON "ops"."supervision_photos" ("visit_id");
CREATE INDEX IF NOT EXISTS "idx_supervision_photos_category" ON "ops"."supervision_photos" ("category_id");

-- Add foreign keys only if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supervision_photos_tenant_id_fkey') THEN
    ALTER TABLE "ops"."supervision_photos"
      ADD CONSTRAINT "supervision_photos_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supervision_photos_visit_id_fkey') THEN
    ALTER TABLE "ops"."supervision_photos"
      ADD CONSTRAINT "supervision_photos_visit_id_fkey"
      FOREIGN KEY ("visit_id") REFERENCES "ops"."visitas_supervision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'ops' AND table_name = 'installation_photo_categories')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supervision_photos_category_id_fkey') THEN
    ALTER TABLE "ops"."supervision_photos"
      ADD CONSTRAINT "supervision_photos_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "ops"."installation_photo_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
