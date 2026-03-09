-- CreateTable: ops.device_pairings
CREATE TABLE "ops"."device_pairings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "device_token" TEXT,
    "pairing_code" TEXT,
    "pairing_code_expires_at" TIMESTAMPTZ(6),
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "portal_rondas_enabled" BOOLEAN NOT NULL DEFAULT true,
    "portal_acceso_enabled" BOOLEAN NOT NULL DEFAULT true,
    "device_model" TEXT,
    "android_version" TEXT,
    "browser_version" TEXT,
    "screen_resolution" TEXT,
    "cpu_cores" INTEGER,
    "ram_gb" DOUBLE PRECISION,
    "pairing_latitude" DOUBLE PRECISION,
    "pairing_longitude" DOUBLE PRECISION,
    "device_fingerprint" TEXT,
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMPTZ(6),
    "last_battery_level" DOUBLE PRECISION,
    "last_connection_type" TEXT,
    "last_ip_address" TEXT,
    "current_guard_id" UUID,
    "guard_selected_at" TIMESTAMPTZ(6),
    "linked_at" TIMESTAMPTZ(6),
    "linked_by_user_id" TEXT,
    "migrated_from_device_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "device_pairings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ops.guard_selection_logs
CREATE TABLE "ops"."guard_selection_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "device_pairing_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "from_guard_id" UUID,
    "to_guard_id" UUID,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guard_selection_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_pairings_device_token_key" ON "ops"."device_pairings"("device_token");

-- CreateIndex
CREATE UNIQUE INDEX "device_pairings_pairing_code_key" ON "ops"."device_pairings"("pairing_code");

-- CreateIndex
CREATE INDEX "idx_device_pairing_token" ON "ops"."device_pairings"("device_token");

-- CreateIndex
CREATE INDEX "idx_device_pairing_code" ON "ops"."device_pairings"("pairing_code");

-- CreateIndex
CREATE INDEX "idx_device_pairing_installation" ON "ops"."device_pairings"("installation_id");

-- CreateIndex
CREATE INDEX "idx_device_pairing_tenant" ON "ops"."device_pairings"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_device_pairing_status" ON "ops"."device_pairings"("status");

-- CreateIndex
CREATE INDEX "idx_guard_selection_log_device" ON "ops"."guard_selection_logs"("device_pairing_id");

-- CreateIndex
CREATE INDEX "idx_guard_selection_log_installation" ON "ops"."guard_selection_logs"("installation_id");

-- CreateIndex
CREATE INDEX "idx_guard_selection_log_timestamp" ON "ops"."guard_selection_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "ops"."device_pairings" ADD CONSTRAINT "device_pairings_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."device_pairings" ADD CONSTRAINT "device_pairings_current_guard_id_fkey" FOREIGN KEY ("current_guard_id") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."guard_selection_logs" ADD CONSTRAINT "guard_selection_logs_device_pairing_id_fkey" FOREIGN KEY ("device_pairing_id") REFERENCES "ops"."device_pairings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."guard_selection_logs" ADD CONSTRAINT "guard_selection_logs_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "crm"."installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."guard_selection_logs" ADD CONSTRAINT "guard_selection_logs_from_guard_id_fkey" FOREIGN KEY ("from_guard_id") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops"."guard_selection_logs" ADD CONSTRAINT "guard_selection_logs_to_guard_id_fkey" FOREIGN KEY ("to_guard_id") REFERENCES "ops"."guardias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
