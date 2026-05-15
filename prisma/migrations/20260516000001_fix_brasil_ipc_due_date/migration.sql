-- FIX retroactivo: Embajada Brasil tiene un ajuste IPC APPLIED con
-- dueDate = 2027-05-15 cuando debería ser 2026-05-15 (la fecha real de
-- aplicación). Causa: el modal "Aplicar ajuste de IPC" defaulteaba a
-- la dueDate teórica del PENDING preexistente (1 año en el futuro);
-- el usuario aplicó sin cambiar la fecha. Bug del código corregido en
-- src/components/crm/ApplyIpcDialog.tsx en el mismo commit.
--
-- Item afectado: de94c621-330a-441a-90e3-c678129ec214 (2025_03_13_Contrato_21_2024)
-- Account: Embajada de Brasil (rut 69900700-5)

-- 1. Corregir la dueDate del APPLIED: 2027-05-15 → 2026-05-15
UPDATE finance.finance_contract_ipc_adjustments
SET due_date = '2026-05-15',
    updated_at = NOW()
WHERE item_id = 'de94c621-330a-441a-90e3-c678129ec214'
  AND due_date = '2027-05-15'
  AND status = 'APPLIED';

-- 2. Eliminar el PENDING existente (si lo hay) para recrearlo con la
--    fecha correcta (2027-05-15 = 12 meses después del APPLIED corregido).
DELETE FROM finance.finance_contract_ipc_adjustments
WHERE item_id = 'de94c621-330a-441a-90e3-c678129ec214'
  AND status = 'PENDING';

-- 3. Insertar el PENDING del próximo ciclo a 2027-05-15 (si no existe).
INSERT INTO finance.finance_contract_ipc_adjustments
  (id, tenant_id, item_id, due_date, status, created_at, updated_at)
SELECT
  uuid_generate_v4(),
  'clgard00000000000000001',
  'de94c621-330a-441a-90e3-c678129ec214',
  '2027-05-15',
  'PENDING',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM finance.finance_contract_ipc_adjustments
  WHERE item_id = 'de94c621-330a-441a-90e3-c678129ec214'
    AND due_date = '2027-05-15'
    AND status = 'PENDING'
);
