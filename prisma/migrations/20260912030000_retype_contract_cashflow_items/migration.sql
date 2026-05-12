-- Fix de tipificación: items del flujo de caja vinculados a contratos del
-- CRM estaban guardándose con `source = 'OTHER'` por un commit del 2026-05-11
-- que migró el modelo de contratos a 100% manuales. Esto causó dos problemas:
--
--   1. Visualmente no se distinguían de "otros" items manuales sueltos.
--   2. El UI permitía editarlos como si fueran manuales, pero los cambios
--      se desalineaban con la fuente real (el contrato PDF en el CRM).
--
-- Esta migración los renombra a `source = 'CONTRACT'` para que:
--   - El frontend muestre el badge "Contrato" y bloquee la edición de monto
--     /recurrencia (ya solo se editan desde el tab Contratos del CRM).
--   - Los endpoints futuros sepan distinguir "contrato del CRM" de "otro
--     item misceláneo".
--
-- Criterio de selección (super conservador, solo cambia items que con
-- seguridad son contratos del CRM):
--   - source = 'OTHER'
--   - sourceRefId apunta a un Document válido del mismo tenant
--   - crmAccountId está poblado
--   - categoría es ING_VENTA_CONTRATO
--
-- NO afecta items "OTHER" reales del usuario (sin crmAccountId o sin
-- categoría de contrato).
--
-- Idempotente: si ya están como CONTRACT, no hace nada.

UPDATE finance.finance_cashflow_items AS i
SET source = 'CONTRACT'
WHERE i.source = 'OTHER'
  AND i.source_ref_id IS NOT NULL
  AND i.crm_account_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM docs.documents d
    WHERE d.id = i.source_ref_id::uuid
      AND d.tenant_id = i.tenant_id
  )
  AND i.category_id IN (
    SELECT id FROM finance.finance_cashflow_categories
    WHERE code = 'ING_VENTA_CONTRATO'
      AND tenant_id = i.tenant_id
  );
