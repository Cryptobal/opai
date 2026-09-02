-- Cámaras IP (fase 1): visualización en vivo por instalación.
-- Aditivo. Requiere uuid-ossp (ya presente en el schema).

CREATE TABLE "ops"."camaras" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'nvr',
    "brand" TEXT NOT NULL DEFAULT 'generic',
    "host" TEXT NOT NULL,
    "rtsp_port" INTEGER NOT NULL DEFAULT 554,
    "onvif_port" INTEGER,
    "channel" INTEGER NOT NULL DEFAULT 1,
    "stream_quality" TEXT NOT NULL DEFAULT 'sub',
    "custom_path" TEXT,
    "username" TEXT NOT NULL,
    "password_enc" TEXT NOT NULL,
    "ptz_capable" BOOLEAN NOT NULL DEFAULT false,
    "stream_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'untested',
    "last_seen_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "camaras_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "camaras_stream_name_key" ON "ops"."camaras"("stream_name");
CREATE INDEX "idx_ops_camara_tenant" ON "ops"."camaras"("tenant_id");
CREATE INDEX "idx_ops_camara_inst_active" ON "ops"."camaras"("installation_id", "is_active");

ALTER TABLE "ops"."camaras"
  ADD CONSTRAINT "camaras_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ops"."camaras_layouts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grid_size" INTEGER NOT NULL DEFAULT 4,
    "camera_ids" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "camaras_layouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_ops_camara_layout_tenant_user" ON "ops"."camaras_layouts"("tenant_id", "user_id");
