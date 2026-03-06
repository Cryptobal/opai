-- Create access_control schema
CREATE SCHEMA IF NOT EXISTS "access_control";

-- AccessControlConfig
CREATE TABLE IF NOT EXISTS access_control."access_control_configs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "enabled_record_types" TEXT[] DEFAULT '{}',
    "use_whitelist" BOOLEAN NOT NULL DEFAULT false,
    "use_blacklist" BOOLEAN NOT NULL DEFAULT false,
    "require_id_validation" BOOLEAN NOT NULL DEFAULT false,
    "require_photo" BOOLEAN NOT NULL DEFAULT false,
    "require_signature" BOOLEAN NOT NULL DEFAULT false,
    "max_stay_hours" INTEGER,
    "auto_report_schedule" TEXT,
    "form_config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "access_control_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "access_control_configs_installation_id_key" ON access_control."access_control_configs"("installation_id");
CREATE INDEX IF NOT EXISTS "idx_ac_configs_tenant" ON access_control."access_control_configs"("tenant_id");

-- AccessControlList (whitelist/blacklist)
CREATE TABLE IF NOT EXISTS access_control."access_control_lists" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID,
    "list_type" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "company" TEXT,
    "block_reason" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'local',
    "valid_from" DATE,
    "valid_until" DATE,
    "allowed_days" INTEGER[] DEFAULT '{}',
    "allowed_time_from" TEXT,
    "allowed_time_to" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "access_control_lists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ac_lists_rut" ON access_control."access_control_lists"("rut");
CREATE INDEX IF NOT EXISTS "idx_ac_lists_installation_type" ON access_control."access_control_lists"("installation_id", "list_type");
CREATE INDEX IF NOT EXISTS "idx_ac_lists_scope" ON access_control."access_control_lists"("scope");
CREATE INDEX IF NOT EXISTS "idx_ac_lists_tenant" ON access_control."access_control_lists"("tenant_id");

-- AccessControlRecord
CREATE TABLE IF NOT EXISTS access_control."access_control_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "record_type" TEXT NOT NULL,
    "rut" TEXT,
    "full_name" TEXT,
    "company" TEXT,
    "document_serial" TEXT,
    "entry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exit_at" TIMESTAMPTZ(6),
    "entry_guard_id" UUID NOT NULL,
    "exit_guard_id" UUID,
    "entry_gps_lat" DOUBLE PRECISION,
    "entry_gps_lng" DOUBLE PRECISION,
    "exit_gps_lat" DOUBLE PRECISION,
    "exit_gps_lng" DOUBLE PRECISION,
    "vehicle_plate" TEXT,
    "vehicle_plate_photo_url" TEXT,
    "vehicle_type" TEXT,
    "vehicle_brand_model" TEXT,
    "visitor_photo_url" TEXT,
    "credential_photo_url" TEXT,
    "entry_signature_url" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "qr_source" TEXT,
    "id_validation_status" TEXT NOT NULL DEFAULT 'not_checked',
    "list_match" TEXT,
    "preregistration_id" UUID,
    "is_synced" BOOLEAN NOT NULL DEFAULT true,
    "device_id" TEXT,
    "offline_created_at" TIMESTAMPTZ(6),
    "entry_observations" TEXT,
    "exit_observations" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "access_control_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ac_records_installation" ON access_control."access_control_records"("installation_id");
CREATE INDEX IF NOT EXISTS "idx_ac_records_rut" ON access_control."access_control_records"("rut");
CREATE INDEX IF NOT EXISTS "idx_ac_records_entry_at" ON access_control."access_control_records"("entry_at");
CREATE INDEX IF NOT EXISTS "idx_ac_records_in_site" ON access_control."access_control_records"("installation_id", "exit_at");
CREATE INDEX IF NOT EXISTS "idx_ac_records_plate" ON access_control."access_control_records"("vehicle_plate");
CREATE INDEX IF NOT EXISTS "idx_ac_records_tenant" ON access_control."access_control_records"("tenant_id");

-- AccessControlDeniedAttempt
CREATE TABLE IF NOT EXISTS access_control."access_control_denied_attempts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "guard_id" UUID NOT NULL,
    "rut" TEXT NOT NULL,
    "full_name" TEXT,
    "blacklist_entry_id" UUID,
    "block_reason" TEXT,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gps_lat" DOUBLE PRECISION,
    "gps_lng" DOUBLE PRECISION,

    CONSTRAINT "access_control_denied_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ac_denied_installation" ON access_control."access_control_denied_attempts"("installation_id");
CREATE INDEX IF NOT EXISTS "idx_ac_denied_rut" ON access_control."access_control_denied_attempts"("rut");
CREATE INDEX IF NOT EXISTS "idx_ac_denied_tenant" ON access_control."access_control_denied_attempts"("tenant_id");

-- AccessControlPreregistration
CREATE TABLE IF NOT EXISTS access_control."access_control_preregistrations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "visitor_rut" TEXT NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "visitor_company" TEXT,
    "host_name" TEXT,
    "host_contact" TEXT,
    "expected_date" DATE NOT NULL,
    "expected_time_from" TEXT,
    "expected_time_to" TEXT,
    "purpose" TEXT,
    "record_type" TEXT NOT NULL DEFAULT 'visit',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_by" TEXT,
    "created_by_client" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "access_control_preregistrations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ac_prereg_installation_date" ON access_control."access_control_preregistrations"("installation_id", "expected_date");
CREATE INDEX IF NOT EXISTS "idx_ac_prereg_rut" ON access_control."access_control_preregistrations"("visitor_rut");
CREATE INDEX IF NOT EXISTS "idx_ac_prereg_tenant" ON access_control."access_control_preregistrations"("tenant_id");

-- AccessControlKnownVisitor
CREATE TABLE IF NOT EXISTS access_control."access_control_known_visitors" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "company" TEXT,
    "last_visit_at" TIMESTAMPTZ(6),
    "visit_count" INTEGER NOT NULL DEFAULT 1,
    "last_photo_url" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "access_control_known_visitors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "access_control_known_visitors_rut_key" ON access_control."access_control_known_visitors"("rut");
CREATE INDEX IF NOT EXISTS "idx_ac_known_visitors_rut" ON access_control."access_control_known_visitors"("rut");
CREATE INDEX IF NOT EXISTS "idx_ac_known_visitors_tenant" ON access_control."access_control_known_visitors"("tenant_id");

-- Foreign keys
ALTER TABLE access_control."access_control_configs"
    ADD CONSTRAINT "access_control_configs_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE access_control."access_control_lists"
    ADD CONSTRAINT "access_control_lists_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE access_control."access_control_records"
    ADD CONSTRAINT "access_control_records_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE access_control."access_control_records"
    ADD CONSTRAINT "access_control_records_preregistration_id_fkey"
    FOREIGN KEY ("preregistration_id") REFERENCES access_control."access_control_preregistrations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE access_control."access_control_denied_attempts"
    ADD CONSTRAINT "access_control_denied_attempts_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE access_control."access_control_denied_attempts"
    ADD CONSTRAINT "access_control_denied_attempts_blacklist_entry_id_fkey"
    FOREIGN KEY ("blacklist_entry_id") REFERENCES access_control."access_control_lists"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE access_control."access_control_preregistrations"
    ADD CONSTRAINT "access_control_preregistrations_installation_id_fkey"
    FOREIGN KEY ("installation_id") REFERENCES crm."installations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
