-- Rondas 2.0 Evolution: Schema changes for patrol intelligence system

-- ============================================
-- 1. ALTER existing tables: Add new columns
-- ============================================

-- OpsCheckpoint: Add verification type, critical flag, sort order
ALTER TABLE "ops"."checkpoints"
  ADD COLUMN IF NOT EXISTS "verification_type" TEXT NOT NULL DEFAULT 'GEOFENCE',
  ADD COLUMN IF NOT EXISTS "is_critical" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- OpsRondaEjecucion: Add direct installation ref, trust breakdown, offline sync, etc.
ALTER TABLE "ops"."ronda_ejecuciones"
  ADD COLUMN IF NOT EXISTS "trust_breakdown" JSONB,
  ADD COLUMN IF NOT EXISTS "duration_minutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "is_offline_sync" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "synced_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "installation_id" UUID;

-- OpsMarcacionCheckpoint: Add status, verification method, audio, note, offline
ALTER TABLE "ops"."marcacion_checkpoints"
  ADD COLUMN IF NOT EXISTS "audio_url" TEXT,
  ADD COLUMN IF NOT EXISTS "note" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS "verification_method" TEXT NOT NULL DEFAULT 'QR',
  ADD COLUMN IF NOT EXISTS "is_offline_sync" BOOLEAN NOT NULL DEFAULT false;

-- OpsAlertaRonda: Add guardia ref, acknowledge workflow
ALTER TABLE "ops"."alertas_ronda"
  ADD COLUMN IF NOT EXISTS "guardia_id" UUID,
  ADD COLUMN IF NOT EXISTS "is_acknowledged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "acknowledged_by" TEXT,
  ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMPTZ(6);

-- ============================================
-- 2. CREATE new tables
-- ============================================

-- Dispositivos vinculados a instalaciones
CREATE TABLE IF NOT EXISTS "ops"."dispositivos_instalacion" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "installation_id" UUID NOT NULL,
  "device_id" TEXT NOT NULL,
  "device_name" TEXT,
  "is_authorized" BOOLEAN NOT NULL DEFAULT true,
  "last_access_at" TIMESTAMPTZ(6),
  "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "registered_by" TEXT,
  CONSTRAINT "dispositivos_instalacion_pkey" PRIMARY KEY ("id")
);

-- Sesiones de patrullaje del guardia
CREATE TABLE IF NOT EXISTS "ops"."patrullaje_sesiones" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "guardia_id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "device_id" TEXT,
  "login_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "logout_at" TIMESTAMPTZ(6),
  "login_method" TEXT NOT NULL DEFAULT 'RUT_PIN',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "ip_address" TEXT,
  CONSTRAINT "patrullaje_sesiones_pkey" PRIMARY KEY ("id")
);

-- Turnos de monitoreo
CREATE TABLE IF NOT EXISTS "ops"."monitoreo_turnos" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "operator_id" TEXT NOT NULL,
  "operator_name" TEXT,
  "installation_ids" JSONB NOT NULL DEFAULT '[]',
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMPTZ(6),
  "status" TEXT NOT NULL DEFAULT 'active',
  "total_rounds_monitored" INTEGER NOT NULL DEFAULT 0,
  "total_alerts_handled" INTEGER NOT NULL DEFAULT 0,
  "ai_summary" TEXT,
  "operator_comments" TEXT,
  "email_sent_to" JSONB,
  "email_sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "monitoreo_turnos_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- 3. FOREIGN KEYS
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ronda_ejecuciones_installation_id_fkey') THEN
    ALTER TABLE "ops"."ronda_ejecuciones"
      ADD CONSTRAINT "ronda_ejecuciones_installation_id_fkey"
      FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alertas_ronda_guardia_id_fkey') THEN
    ALTER TABLE "ops"."alertas_ronda"
      ADD CONSTRAINT "alertas_ronda_guardia_id_fkey"
      FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispositivos_instalacion_installation_id_fkey') THEN
    ALTER TABLE "ops"."dispositivos_instalacion"
      ADD CONSTRAINT "dispositivos_instalacion_installation_id_fkey"
      FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patrullaje_sesiones_guardia_id_fkey') THEN
    ALTER TABLE "ops"."patrullaje_sesiones"
      ADD CONSTRAINT "patrullaje_sesiones_guardia_id_fkey"
      FOREIGN KEY ("guardia_id") REFERENCES "ops"."guardias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patrullaje_sesiones_installation_id_fkey') THEN
    ALTER TABLE "ops"."patrullaje_sesiones"
      ADD CONSTRAINT "patrullaje_sesiones_installation_id_fkey"
      FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================
-- 4. INDEXES
-- ============================================

-- OpsRondaEjecucion new indexes
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_ejecuciones_inst_status" ON "ops"."ronda_ejecuciones"("installation_id", "status");
CREATE INDEX IF NOT EXISTS "idx_ops_ronda_ejecuciones_guardia_status" ON "ops"."ronda_ejecuciones"("guardia_id", "status");

-- OpsMarcacionCheckpoint composite index
CREATE INDEX IF NOT EXISTS "idx_ops_marcacion_cp_ej_cp" ON "ops"."marcacion_checkpoints"("ejecucion_id", "checkpoint_id");

-- OpsAlertaRonda new indexes
CREATE INDEX IF NOT EXISTS "idx_ops_alerta_ronda_inst_ack" ON "ops"."alertas_ronda"("installation_id", "is_acknowledged");
CREATE INDEX IF NOT EXISTS "idx_ops_alerta_ronda_sev_ack" ON "ops"."alertas_ronda"("severidad", "is_acknowledged");
CREATE INDEX IF NOT EXISTS "idx_ops_alerta_ronda_created" ON "ops"."alertas_ronda"("created_at");

-- OpsDispositivoInstalacion indexes
CREATE INDEX IF NOT EXISTS "idx_ops_dispositivos_tenant" ON "ops"."dispositivos_instalacion"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_dispositivos_installation" ON "ops"."dispositivos_instalacion"("installation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ops_dispositivo_inst_device" ON "ops"."dispositivos_instalacion"("installation_id", "device_id");

-- OpsPatrullajeSesion indexes
CREATE INDEX IF NOT EXISTS "idx_ops_patrullaje_sesion_tenant" ON "ops"."patrullaje_sesiones"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_patrullaje_sesion_guardia_active" ON "ops"."patrullaje_sesiones"("guardia_id", "is_active");
CREATE INDEX IF NOT EXISTS "idx_ops_patrullaje_sesion_inst_active" ON "ops"."patrullaje_sesiones"("installation_id", "is_active");

-- OpsMonitoreoTurno indexes
CREATE INDEX IF NOT EXISTS "idx_ops_monitoreo_turno_tenant" ON "ops"."monitoreo_turnos"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ops_monitoreo_turno_operator_status" ON "ops"."monitoreo_turnos"("operator_id", "status");
