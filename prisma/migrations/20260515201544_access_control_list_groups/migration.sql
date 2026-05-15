-- Group catalogs for whitelist/blacklist reusable assignments
CREATE TABLE IF NOT EXISTS "access_control"."access_control_list_groups" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "list_type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_ac_list_groups_tenant"
  ON "access_control"."access_control_list_groups" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ac_list_groups_type"
  ON "access_control"."access_control_list_groups" ("list_type");
CREATE INDEX IF NOT EXISTS "idx_ac_list_groups_active"
  ON "access_control"."access_control_list_groups" ("is_active");

-- Assign group -> installations (a group can apply to many installations)
CREATE TABLE IF NOT EXISTS "access_control"."access_control_list_group_installations" (
  "group_id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("group_id", "installation_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ac_group_installations_group_fk'
  ) THEN
    ALTER TABLE "access_control"."access_control_list_group_installations"
      ADD CONSTRAINT "ac_group_installations_group_fk"
      FOREIGN KEY ("group_id")
      REFERENCES "access_control"."access_control_list_groups"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ac_group_installations_installation_fk'
  ) THEN
    ALTER TABLE "access_control"."access_control_list_group_installations"
      ADD CONSTRAINT "ac_group_installations_installation_fk"
      FOREIGN KEY ("installation_id")
      REFERENCES "crm"."installations"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_ac_group_installation_installation"
  ON "access_control"."access_control_list_group_installations" ("installation_id");

-- Assign people/list entries -> groups (a person can be in many groups)
CREATE TABLE IF NOT EXISTS "access_control"."access_control_list_group_members" (
  "group_id" UUID NOT NULL,
  "list_entry_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("group_id", "list_entry_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ac_group_members_group_fk'
  ) THEN
    ALTER TABLE "access_control"."access_control_list_group_members"
      ADD CONSTRAINT "ac_group_members_group_fk"
      FOREIGN KEY ("group_id")
      REFERENCES "access_control"."access_control_list_groups"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ac_group_members_entry_fk'
  ) THEN
    ALTER TABLE "access_control"."access_control_list_group_members"
      ADD CONSTRAINT "ac_group_members_entry_fk"
      FOREIGN KEY ("list_entry_id")
      REFERENCES "access_control"."access_control_lists"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_ac_group_member_entry"
  ON "access_control"."access_control_list_group_members" ("list_entry_id");
