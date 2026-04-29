-- 1) Flag "useAsAiKnowledge" sobre tipos de documento operacional
ALTER TABLE "ops"."tipos_doc_operacional"
  ADD COLUMN IF NOT EXISTS "use_as_ai_knowledge" BOOLEAN NOT NULL DEFAULT false;

-- 2) Activar el flag para los tipos cuyo prefijo claramente pertenece a la
--    categoría "Protocolos y Seguridad". Esto evita que la IA empiece a leer
--    pólizas, OS-10, certificados administrativos, etc. por accidente.
UPDATE "ops"."tipos_doc_operacional"
SET "use_as_ai_knowledge" = true
WHERE
  codigo LIKE 'protocolo%'
  OR codigo LIKE 'plan_evacuacion%'
  OR codigo LIKE 'plan_contingencia%'
  OR codigo LIKE 'plan_emergencia%'
  OR codigo LIKE 'matriz_riesgo%'
  OR codigo LIKE 'manual_seguridad%'
  OR codigo LIKE 'evac%'
  OR codigo LIKE 'emergencia%'
  OR codigo LIKE 'seguridad%';

-- 3) Tabla de trazabilidad de fuentes usadas por la IA al generar un examen
CREATE TABLE IF NOT EXISTS "crm"."exam_source_documents" (
  "id"                    TEXT PRIMARY KEY,
  "exam_id"               TEXT NOT NULL,
  "doc_operacional_id"    UUID,
  "protocol_document_id"  TEXT,
  "file_name_snapshot"    TEXT NOT NULL,
  "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "exam_source_documents_exam_id_fkey"
    FOREIGN KEY ("exam_id") REFERENCES "crm"."exams"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_exam_source_doc_exam"
  ON "crm"."exam_source_documents" ("exam_id");
CREATE INDEX IF NOT EXISTS "idx_exam_source_doc_op"
  ON "crm"."exam_source_documents" ("doc_operacional_id");
CREATE INDEX IF NOT EXISTS "idx_exam_source_doc_legacy"
  ON "crm"."exam_source_documents" ("protocol_document_id");

-- 4) Criticidad y obligación legal en items de protocolo (BLOQUE 7)
ALTER TABLE "crm"."protocol_items"
  ADD COLUMN IF NOT EXISTS "criticality" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "crm"."protocol_items"
  ADD COLUMN IF NOT EXISTS "legal_requirement" BOOLEAN NOT NULL DEFAULT false;
