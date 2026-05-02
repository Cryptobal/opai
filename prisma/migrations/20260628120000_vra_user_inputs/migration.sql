-- Módulo VRA — Bloque 4: hallazgos y fotos cargados directamente al informe
-- por el usuario (wizard) o importados desde visitas técnicas.

-- 1) report_findings
CREATE TABLE IF NOT EXISTS "vra"."report_findings" (
  "id"                       uuid           NOT NULL DEFAULT uuid_generate_v4(),
  "report_id"                uuid           NOT NULL,
  "description"              text           NOT NULL,
  "severity"                 text           NOT NULL DEFAULT 'medium',
  "location"                 text,
  "sector_tag"               text,
  "category"                 text,
  "aggravating_factors"      text,
  "imported_from_finding_id" uuid,
  "sort_order"               integer        NOT NULL DEFAULT 0,
  "created_by"               text,
  "created_at"               timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"               timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "report_findings_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_findings_report_id_fkey'
  ) THEN
    ALTER TABLE "vra"."report_findings"
      ADD CONSTRAINT "report_findings_report_id_fkey"
        FOREIGN KEY ("report_id") REFERENCES "vra"."reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_vra_report_findings_report"
  ON "vra"."report_findings" ("report_id");
CREATE INDEX IF NOT EXISTS "idx_vra_report_findings_order"
  ON "vra"."report_findings" ("report_id", "sort_order");
CREATE INDEX IF NOT EXISTS "idx_vra_report_findings_severity"
  ON "vra"."report_findings" ("severity");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_vra_report_findings_updated_at') THEN
    CREATE TRIGGER "tg_vra_report_findings_updated_at"
      BEFORE UPDATE ON "vra"."report_findings"
      FOR EACH ROW EXECUTE FUNCTION "vra"."set_updated_at"();
  END IF;
END $$;

-- 2) report_photos
CREATE TABLE IF NOT EXISTS "vra"."report_photos" (
  "id"                     uuid           NOT NULL DEFAULT uuid_generate_v4(),
  "report_id"              uuid           NOT NULL,
  "storage_key"            text           NOT NULL,
  "public_url"             text           NOT NULL,
  "file_name"              text,
  "mime_type"              text,
  "file_size"              integer,
  "caption"                text,
  "linked_finding_ids"     text[]         NOT NULL DEFAULT ARRAY[]::text[],
  "gps_lat"                numeric(10, 7),
  "gps_lng"                numeric(10, 7),
  "taken_at"               timestamptz(6),
  "imported_from_visit_id" uuid,
  "imported_from_photo_id" uuid,
  "sort_order"             integer        NOT NULL DEFAULT 0,
  "created_by"             text,
  "created_at"             timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"             timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "report_photos_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_photos_report_id_fkey'
  ) THEN
    ALTER TABLE "vra"."report_photos"
      ADD CONSTRAINT "report_photos_report_id_fkey"
        FOREIGN KEY ("report_id") REFERENCES "vra"."reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_vra_report_photos_report"
  ON "vra"."report_photos" ("report_id");
CREATE INDEX IF NOT EXISTS "idx_vra_report_photos_order"
  ON "vra"."report_photos" ("report_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_vra_report_photos_updated_at') THEN
    CREATE TRIGGER "tg_vra_report_photos_updated_at"
      BEFORE UPDATE ON "vra"."report_photos"
      FOR EACH ROW EXECUTE FUNCTION "vra"."set_updated_at"();
  END IF;
END $$;
