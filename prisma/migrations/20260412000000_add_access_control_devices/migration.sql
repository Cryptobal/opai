-- Access Control Pairing Codes (temporary, single-use)
CREATE TABLE IF NOT EXISTS access_control."access_control_pairing_codes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "used_by_device_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_control_pairing_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "access_control_pairing_codes_code_key" ON access_control."access_control_pairing_codes"("code");
CREATE INDEX IF NOT EXISTS "idx_acpc_code" ON access_control."access_control_pairing_codes"("code");
CREATE INDEX IF NOT EXISTS "idx_acpc_tenant" ON access_control."access_control_pairing_codes"("tenant_id");

-- Access Control Devices (permanently paired to installations)
CREATE TABLE IF NOT EXISTS access_control."access_control_devices" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "device_fingerprint" TEXT NOT NULL,
    "device_name" TEXT,
    "device_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "paired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_ip" TEXT,
    "current_guard_id" UUID,
    "guard_selected_at" TIMESTAMPTZ(6),
    "user_agent" TEXT,
    "screen_resolution" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_control_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "access_control_devices_device_token_key" ON access_control."access_control_devices"("device_token");
CREATE INDEX IF NOT EXISTS "idx_acd_token" ON access_control."access_control_devices"("device_token");
CREATE INDEX IF NOT EXISTS "idx_acd_installation" ON access_control."access_control_devices"("installation_id");
CREATE INDEX IF NOT EXISTS "idx_acd_tenant" ON access_control."access_control_devices"("tenant_id");

-- Foreign keys
ALTER TABLE access_control."access_control_pairing_codes"
    ADD CONSTRAINT "access_control_pairing_codes_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE access_control."access_control_pairing_codes"
    ADD CONSTRAINT "access_control_pairing_codes_used_by_device_id_fkey"
    FOREIGN KEY ("used_by_device_id") REFERENCES access_control."access_control_devices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE access_control."access_control_devices"
    ADD CONSTRAINT "access_control_devices_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
