-- FASE 6: Documentos - Carpetas y Toggle Visibilidad
-- 6.1 DocumentFolder + folderId en OpsDocumentoPersona y CrmFileLink
-- 6.2 portalVisible en OpsDocumentoPersona y CrmFile

-- ============================================
-- 6.1 Crear tabla document_folders (crm)
-- ============================================
CREATE TABLE IF NOT EXISTS "crm"."document_folders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "parent_id" UUID,
    "portal_visible" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

-- Self-referential FK para subcarpetas
ALTER TABLE "crm"."document_folders" ADD CONSTRAINT "document_folders_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "crm"."document_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_document_folders_tenant" ON "crm"."document_folders"("tenant_id");
CREATE INDEX "idx_document_folders_entity" ON "crm"."document_folders"("entity_type", "entity_id");
CREATE INDEX "idx_document_folders_parent" ON "crm"."document_folders"("parent_id");

-- ============================================
-- 6.1 Agregar folder_id a ops.documentos_persona
-- ============================================
ALTER TABLE "ops"."documentos_persona" ADD COLUMN IF NOT EXISTS "folder_id" UUID;

ALTER TABLE "ops"."documentos_persona" ADD CONSTRAINT "documentos_persona_folder_id_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "crm"."document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_ops_docs_persona_folder" ON "ops"."documentos_persona"("folder_id");

-- ============================================
-- 6.1 Agregar folder_id a crm.file_links
-- ============================================
ALTER TABLE "crm"."file_links" ADD COLUMN IF NOT EXISTS "folder_id" UUID;

ALTER TABLE "crm"."file_links" ADD CONSTRAINT "file_links_folder_id_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "crm"."document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_crm_file_links_folder" ON "crm"."file_links"("folder_id");

-- ============================================
-- 6.2 Agregar portal_visible a ops.documentos_persona
-- ============================================
ALTER TABLE "ops"."documentos_persona" ADD COLUMN IF NOT EXISTS "portal_visible" BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- 6.2 Agregar portal_visible a crm.files
-- ============================================
ALTER TABLE "crm"."files" ADD COLUMN IF NOT EXISTS "portal_visible" BOOLEAN NOT NULL DEFAULT false;
