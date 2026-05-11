-- Unifica las categorías "contrato_servicio" y "contrato_cliente" en una sola
-- ("contrato_cliente"). El usuario reportó que conceptualmente son el mismo
-- documento; mantener ambas creaba confusión al subir contratos y al
-- enviarlos a firma.
--
-- Aplica a:
--   - docs.documents.category
--   - docs.doc_templates.category (si la columna existe)
--
-- Seguro de re-correr (idempotente vía WHERE).
UPDATE "docs"."documents"
SET "category" = 'contrato_cliente'
WHERE "category" = 'contrato_servicio';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'docs'
      AND table_name = 'doc_templates'
      AND column_name = 'category'
  ) THEN
    EXECUTE $sql$
      UPDATE "docs"."doc_templates"
      SET "category" = 'contrato_cliente'
      WHERE "category" = 'contrato_servicio'
    $sql$;
  END IF;
END $$;
