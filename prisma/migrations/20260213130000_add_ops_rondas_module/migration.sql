-- ============================================
-- OPS - Control de rondas de seguridad
-- ============================================

CREATE TABLE IF NOT EXISTS "ops"."checkpoints" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "qr_code" TEXT NOT NULL,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "geo_radius_m" INTEGER NOT NULL DEFAULT 30,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ops"."ronda_templates" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "order_mode" TEXT NOT NULL DEFAULT 'flexible',
  "estimated_duration_min" INTEGER,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ronda_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ops"."ronda_checkpoints" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "ronda_template_id" UUID NOT NULL,
  "checkpoint_id" UUID NOT NULL,
  "order_index" INTEGER NOT NULL DEFAULT 1,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "max_time_minutes" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ronda_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ops"."ronda_programaciones" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "ronda_template_id" UUID NOT NULL,
  "dias_semana" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "hora_inicio" TEXT NOT NULL,
  "hora_fin" TEXT NOT NULL,
  "frecuencia_minutos" INTEGER NOT NULL DEFAULT 120,
  "tolerancia_minutos" INTEGER NOT NULL DEFAULT 10,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ronda_programaciones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ops"."ronda_ejecuciones" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "ronda_template_id" UUID NOT NULL,
  "programacion_id" UUID,
  "guardia_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'pendiente',
  "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "checkpoints_total" INTEGER NOT NULL DEFAULT 0,
  "checkpoints_completados" INTEGER NOT NULL DEFAULT 0,
  "porcentaje_completado" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "trust_score" INTEGER NOT NULL DEFAULT 0,
  "device_info" JSONB,
  "alertas" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ronda_ejecuciones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ops"."marcacion_checkpoints" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "ejecucion_id" UUID NOT NULL,
  "checkpoint_id" UUID NOT NULL,
  "guardia_id" UUID NOT NULL,
  "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "geo_validada" BOOLEAN NOT NULL DEFAULT false,
  "geo_distancia_m" DOUBLE PRECISION,
  "battery_level" INTEGER,
  "motion_data" JSONB,
  "speed_from_prev_kmh" DOUBLE PRECISION,
  "time_from_prev_sec" INTEGER,
  "foto_evidencia_url" TEXT,
  "hash_integridad" TEXT NOT NULL,
  "anomalias" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marcacion_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ops"."alertas_ronda" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "ejecucion_id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "tipo" TEXT NOT NULL,
  "severidad" TEXT NOT NULL DEFAULT 'warning',
  "mensaje" TEXT NOT NULL,
  "data" JSONB,
  "resuelta" BOOLEAN NOT NULL DEFAULT false,
  "resuelta_por" TEXT,
  "resuelta_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alertas_ronda_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ops"."ronda_incidentes" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "ejecucion_id" UUID,
  "ronda_template_id" UUID,
  "checkpoint_id" UUID,
  "guardia_id" UUID NOT NULL,
  "tipo" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "foto_url" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'abierto',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ronda_incidentes_pkey" PRIMARY KEY ("id")
);

-- Uniques
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ops_checkpoint_tenant_qr"
  ON "ops"."checkpoints" ("tenant_id", "qr_code");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ops_ronda_checkpoint"
  ON "ops"."ronda_checkpoints" ("ronda_template_id", "checkpoint_id");

-- Checkpoints
CREATE INDEX IF NOT EXISTS "idx_ops_checkpoints_tenant" ON "ops"."checkpoints" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_checkpoints_tenant_installation" ON "ops"."checkpoints" ("tenant_id", "installation_id");
CREATE INDEX IF NOT EXISTS "idx_ops_checkpoints_installation" ON "ops"."checkpoints" ("installation_id");
CREATE INDEX IF NOT EXISTS "idx_ops_checkpoints_active" ON "ops"."checkpoints" ("is_active");

-- Templates
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_templates_tenant" ON "ops"."ronda_templates" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_templates_tenant_installation" ON "ops"."ronda_templates" ("tenant_id", "installation_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_templates_installation" ON "ops"."ronda_templates" ("installation_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_templates_active" ON "ops"."ronda_templates" ("is_active");

-- Template checkpoints
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_checkpoints_tenant" ON "ops"."ronda_checkpoints" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_checkpoints_template" ON "ops"."ronda_checkpoints" ("ronda_template_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_checkpoints_checkpoint" ON "ops"."ronda_checkpoints" ("checkpoint_id");

-- Programaciones
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_programaciones_tenant" ON "ops"."ronda_programaciones" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_programaciones_template" ON "ops"."ronda_programaciones" ("ronda_template_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_programaciones_active" ON "ops"."ronda_programaciones" ("is_active");

-- Ejecuciones
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_ejecuciones_tenant" ON "ops"."ronda_ejecuciones" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_ejecuciones_template" ON "ops"."ronda_ejecuciones" ("ronda_template_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_ejecuciones_programacion" ON "ops"."ronda_ejecuciones" ("programacion_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_ejecuciones_guardia" ON "ops"."ronda_ejecuciones" ("guardia_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_ejecuciones_scheduled_at" ON "ops"."ronda_ejecuciones" ("scheduled_at");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_ejecuciones_status" ON "ops"."ronda_ejecuciones" ("status");

-- Marcaciones checkpoint
CREATE INDEX IF NOT EXISTS "idx_ops_marcacion_checkpoint_tenant" ON "ops"."marcacion_checkpoints" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_marcacion_checkpoint_ejecucion" ON "ops"."marcacion_checkpoints" ("ejecucion_id");
CREATE INDEX IF NOT EXISTS "idx_ops_marcacion_checkpoint_checkpoint" ON "ops"."marcacion_checkpoints" ("checkpoint_id");
CREATE INDEX IF NOT EXISTS "idx_ops_marcacion_checkpoint_guardia" ON "ops"."marcacion_checkpoints" ("guardia_id");
CREATE INDEX IF NOT EXISTS "idx_ops_marcacion_checkpoint_timestamp" ON "ops"."marcacion_checkpoints" ("timestamp");

-- Alertas
CREATE INDEX IF NOT EXISTS "idx_ops_alerta_ronda_tenant" ON "ops"."alertas_ronda" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_alerta_ronda_ejecucion" ON "ops"."alertas_ronda" ("ejecucion_id");
CREATE INDEX IF NOT EXISTS "idx_ops_alerta_ronda_installation" ON "ops"."alertas_ronda" ("installation_id");
CREATE INDEX IF NOT EXISTS "idx_ops_alerta_ronda_severidad" ON "ops"."alertas_ronda" ("severidad");
CREATE INDEX IF NOT EXISTS "idx_ops_alerta_ronda_resuelta" ON "ops"."alertas_ronda" ("resuelta");

-- Incidentes
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_incidente_tenant" ON "ops"."ronda_incidentes" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_incidente_ejecucion" ON "ops"."ronda_incidentes" ("ejecucion_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_incidente_guardia" ON "ops"."ronda_incidentes" ("guardia_id");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_incidente_status" ON "ops"."ronda_incidentes" ("status");

-- Foreign keys
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkpoints_installation_id_fkey') THEN
    ALTER TABLE "ops"."checkpoints"
      ADD CONSTRAINT "checkpoints_installation_id_fkey"
      FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_templates_installation_id_fkey') THEN
    ALTER TABLE "ops"."ronda_templates"
      ADD CONSTRAINT "ronda_templates_installation_id_fkey"
      FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_checkpoints_ronda_template_id_fkey') THEN
    ALTER TABLE "ops"."ronda_checkpoints"
      ADD CONSTRAINT "ronda_checkpoints_ronda_template_id_fkey"
      FOREIGN KEY ("ronda_template_id") REFERENCES "ops"."ronda_templates"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_checkpoints_checkpoint_id_fkey') THEN
    ALTER TABLE "ops"."ronda_checkpoints"
      ADD CONSTRAINT "ronda_checkpoints_checkpoint_id_fkey"
      FOREIGN KEY ("checkpoint_id") REFERENCES "ops"."checkpoints"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_programaciones_ronda_template_id_fkey') THEN
    ALTER TABLE "ops"."ronda_programaciones"
      ADD CONSTRAINT "ronda_programaciones_ronda_template_id_fkey"
      FOREIGN KEY ("ronda_template_id") REFERENCES "ops"."ronda_templates"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_ejecuciones_ronda_template_id_fkey') THEN
    ALTER TABLE "ops"."ronda_ejecuciones"
      ADD CONSTRAINT "ronda_ejecuciones_ronda_template_id_fkey"
      FOREIGN KEY ("ronda_template_id") REFERENCES "ops"."ronda_templates"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_ejecuciones_programacion_id_fkey') THEN
    ALTER TABLE "ops"."ronda_ejecuciones"
      ADD CONSTRAINT "ronda_ejecuciones_programacion_id_fkey"
      FOREIGN KEY ("programacion_id") REFERENCES "ops"."ronda_programaciones"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_ejecuciones_guardia_id_fkey') THEN
    ALTER TABLE "ops"."ronda_ejecuciones"
      ADD CONSTRAINT "ronda_ejecuciones_guardia_id_fkey"
      FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marcacion_checkpoints_ejecucion_id_fkey') THEN
    ALTER TABLE "ops"."marcacion_checkpoints"
      ADD CONSTRAINT "marcacion_checkpoints_ejecucion_id_fkey"
      FOREIGN KEY ("ejecucion_id") REFERENCES "ops"."ronda_ejecuciones"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marcacion_checkpoints_checkpoint_id_fkey') THEN
    ALTER TABLE "ops"."marcacion_checkpoints"
      ADD CONSTRAINT "marcacion_checkpoints_checkpoint_id_fkey"
      FOREIGN KEY ("checkpoint_id") REFERENCES "ops"."checkpoints"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marcacion_checkpoints_guardia_id_fkey') THEN
    ALTER TABLE "ops"."marcacion_checkpoints"
      ADD CONSTRAINT "marcacion_checkpoints_guardia_id_fkey"
      FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alertas_ronda_ejecucion_id_fkey') THEN
    ALTER TABLE "ops"."alertas_ronda"
      ADD CONSTRAINT "alertas_ronda_ejecucion_id_fkey"
      FOREIGN KEY ("ejecucion_id") REFERENCES "ops"."ronda_ejecuciones"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alertas_ronda_installation_id_fkey') THEN
    ALTER TABLE "ops"."alertas_ronda"
      ADD CONSTRAINT "alertas_ronda_installation_id_fkey"
      FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_incidentes_ejecucion_id_fkey') THEN
    ALTER TABLE "ops"."ronda_incidentes"
      ADD CONSTRAINT "ronda_incidentes_ejecucion_id_fkey"
      FOREIGN KEY ("ejecucion_id") REFERENCES "ops"."ronda_ejecuciones"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_incidentes_ronda_template_id_fkey') THEN
    ALTER TABLE "ops"."ronda_incidentes"
      ADD CONSTRAINT "ronda_incidentes_ronda_template_id_fkey"
      FOREIGN KEY ("ronda_template_id") REFERENCES "ops"."ronda_templates"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_incidentes_checkpoint_id_fkey') THEN
    ALTER TABLE "ops"."ronda_incidentes"
      ADD CONSTRAINT "ronda_incidentes_checkpoint_id_fkey"
      FOREIGN KEY ("checkpoint_id") REFERENCES "ops"."checkpoints"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_incidentes_guardia_id_fkey') THEN
    ALTER TABLE "ops"."ronda_incidentes"
      ADD CONSTRAINT "ronda_incidentes_guardia_id_fkey"
      FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
