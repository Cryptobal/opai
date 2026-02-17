-- OPS: Supervisión en terreno (hub + visitas georreferenciadas)

CREATE TABLE "ops"."asignacion_supervisores" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "supervisor_id" TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "asignacion_supervisores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ops"."visitas_supervision" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "supervisor_id" TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "check_in_at" TIMESTAMPTZ(6) NOT NULL,
  "check_in_lat" DECIMAL(10,7) NOT NULL,
  "check_in_lng" DECIMAL(10,7) NOT NULL,
  "check_in_geo_validada" BOOLEAN NOT NULL DEFAULT false,
  "check_in_distancia_m" DOUBLE PRECISION,
  "check_out_at" TIMESTAMPTZ(6),
  "check_out_lat" DECIMAL(10,7),
  "check_out_lng" DECIMAL(10,7),
  "check_out_geo_validada" BOOLEAN,
  "check_out_distancia_m" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'in_progress',
  "general_comments" TEXT,
  "guards_counted" INTEGER,
  "installation_state" TEXT,
  "ratings" JSONB,
  "started_via" TEXT,
  "completed_via" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "visitas_supervision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ops"."visita_imagenes" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "visita_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT,
  "size" INTEGER,
  "storage_key" TEXT NOT NULL,
  "public_url" TEXT NOT NULL,
  "caption" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "visita_imagenes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_ops_asignacion_supervisor_pair"
  ON "ops"."asignacion_supervisores" ("supervisor_id", "installation_id");
CREATE INDEX "idx_ops_asignacion_supervisor_tenant"
  ON "ops"."asignacion_supervisores" ("tenant_id");
CREATE INDEX "idx_ops_asignacion_supervisor_supervisor"
  ON "ops"."asignacion_supervisores" ("supervisor_id");
CREATE INDEX "idx_ops_asignacion_supervisor_installation"
  ON "ops"."asignacion_supervisores" ("installation_id");
CREATE INDEX "idx_ops_asignacion_supervisor_active"
  ON "ops"."asignacion_supervisores" ("is_active");

CREATE INDEX "idx_ops_visitas_supervision_tenant"
  ON "ops"."visitas_supervision" ("tenant_id");
CREATE INDEX "idx_ops_visitas_supervision_supervisor"
  ON "ops"."visitas_supervision" ("supervisor_id");
CREATE INDEX "idx_ops_visitas_supervision_installation"
  ON "ops"."visitas_supervision" ("installation_id");
CREATE INDEX "idx_ops_visitas_supervision_status"
  ON "ops"."visitas_supervision" ("status");
CREATE INDEX "idx_ops_visitas_supervision_checkin"
  ON "ops"."visitas_supervision" ("check_in_at");

CREATE INDEX "idx_ops_visita_imagen_tenant"
  ON "ops"."visita_imagenes" ("tenant_id");
CREATE INDEX "idx_ops_visita_imagen_visita"
  ON "ops"."visita_imagenes" ("visita_id");

ALTER TABLE "ops"."asignacion_supervisores"
  ADD CONSTRAINT "asignacion_supervisores_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."asignacion_supervisores"
  ADD CONSTRAINT "asignacion_supervisores_supervisor_id_fkey"
  FOREIGN KEY ("supervisor_id") REFERENCES "public"."Admin"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."asignacion_supervisores"
  ADD CONSTRAINT "asignacion_supervisores_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."visitas_supervision"
  ADD CONSTRAINT "visitas_supervision_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."visitas_supervision"
  ADD CONSTRAINT "visitas_supervision_supervisor_id_fkey"
  FOREIGN KEY ("supervisor_id") REFERENCES "public"."Admin"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."visitas_supervision"
  ADD CONSTRAINT "visitas_supervision_installation_id_fkey"
  FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."visita_imagenes"
  ADD CONSTRAINT "visita_imagenes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ops"."visita_imagenes"
  ADD CONSTRAINT "visita_imagenes_visita_id_fkey"
  FOREIGN KEY ("visita_id") REFERENCES "ops"."visitas_supervision"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
