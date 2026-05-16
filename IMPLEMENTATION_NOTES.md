# Banca / Conciliación — Implementación nocturna (16 may 2026)

## Branch usada

`claude/banking-reconciliation-merge-13UfZ` (designada por el harness
remoto). El prompt original pedía `feat/banca-conciliacion-mejoras-v1`,
pero las reglas del entorno requieren la branch asignada por el sistema.
Sin impacto en el contenido — todos los cambios se commitearon ahí.

## Cambios incluidos en este commit

1. ✅ Categorizar manual fluido (eliminado paso "Tipo", indicador inline de
   flujo de caja, botón "Guardar como regla")
2. ✅ Wizard "Guardar como regla" desde tx individual con criterios pre-llenados
3. ✅ Conteo en sub-tabs (Reconocidos resalta en amarillo, hint banner mobile)
4. ✅ Editor de Reglas con AccountPlanCombobox + tooltip prioridad + preview en vivo
5. ✅ Detección de RUT duplicados cross-tabla + banner en conciliación
6. ✅ Modal post-creación de regla con 3 opciones (Solo futuros / Sugerir /
   Aplicar directo)
7. ⏳ Constraint unique en `CrmAccount.rut`: DEFERIDO. Ver
   `prisma/migrations/PENDING-crm-account-rut-unique.sql` para los pasos
   manuales.

8. ✅ Auto-aplicar reglas al crear/editar regla (fix bug "tx fantasma")
   - Endpoint nuevo `POST /api/finance/banking/automatch-rules/run-rules-only`
   - POST/PATCH de regla ahora corre evaluación contra histórico (cap 500,
     header `x-skip-historical: 1` para desactivar en tests/scripts).
   - Botón "Re-evaluar reglas" en pestaña Movimientos (más rápido que
     "Auto-conciliar visible": no consulta DTE ni turno extra).
   - Banner informativo en sub-tab "Sin reconocer" cuando hay reglas
     activas y tx UNMATCHED.
   - GET `/automatch-rules` ahora acepta `?enabled=true&countOnly=1`.

9. ✅ Fixes UX adicionales en lista de movimientos
   - Badge "RUT no reconocido" → "RUT reglado" cuando hay regla aplicable.
   - Columna Referencia con `truncate` + tooltip (max-w-[140px]).
   - Warning si el hard cap de 500 deja tx sin procesar al importar.

10. ✅ Limpieza de código
    - Eliminado reason "negative_amount" en `auto-match-payment.service.ts`
      (estaba en comentario/type/branch pero nunca se retornaba — el
      matcher pasó a buscar DTEs RECEIVED para egresos hace iteraciones).
    - Test actualizado para reflejar comportamiento real (egreso sin DTE
      RECEIVED candidato devuelve `no_candidate`, no `negative_amount`).

## Endpoints nuevos

- `POST /api/finance/banking/cashflow-preview` — predice impacto en flujo
  de caja al elegir una cuenta contable.
- `GET  /api/finance/banking/transactions/counts` — conteos por sub-tab.
- `GET  /api/finance/banking/rut-occupants?rut=...` — ocupantes de un RUT.
- `GET  /api/finance/admin/rut-duplicates` — diagnóstico de duplicados.

Endpoint extendido:

- `POST /api/finance/banking/automatch-rules/run-historical` ahora acepta
  `ruleId` opcional (valida pertenencia al tenant; el motor sigue
  corriendo todas las reglas activas — ver TODO en el archivo).

## Archivos nuevos

- `src/components/finance/SaveAsRuleModal.tsx`
- `src/modules/finance/banking/rut-conflict-detector.ts`
- `src/app/api/finance/banking/cashflow-preview/route.ts`
- `src/app/api/finance/banking/transactions/counts/route.ts`
- `src/app/api/finance/banking/rut-occupants/route.ts`
- `src/app/api/finance/admin/rut-duplicates/route.ts`
- `prisma/migrations/PENDING-crm-account-rut-unique.sql` (TODO manual)

## Archivos modificados

- `src/components/finance/BankTxReconcileSheet.tsx`
  (categorizar manual + indicador + save-as-rule + banner conflictos RUT)
- `src/components/finance/BankRulesClient.tsx`
  (combobox + tooltip + preview en vivo + post-create modal)
- `src/components/finance/BancosClient.tsx`
  (conteo en sub-tabs + nomenclatura "Auto-conciliar visible" + hint mobile)
- `src/app/api/finance/banking/automatch-rules/run-historical/route.ts`
  (acepta `ruleId`)

## Validación

- ✅ `npx tsc --noEmit` — sin errores.
- ⚠️ Tests — 28 tests fallan, pero todos PRE-EXISTENTES (verificado con
  `git stash` antes y después: mismo set falla en main). No introducimos
  regresiones. Falla principalmente en `auto-match-payment.test.ts`
  (mocks incompletos), tests de SII (cert/env), cashflow tests
  pre-existentes, nav builder, etc.
- ✅ `npm run check-ds` — sin errores. Warnings de `text-[11px]` en otros
  módulos son pre-existentes; mis archivos usan solo `text-[12px]` y
  superiores.
- ⚠️ `npm run lint` no se pudo correr — ESLint v10 instalado pero el repo
  todavía tiene `.eslintrc.json` (formato v8). No es bloqueante: TS check
  cubre type safety.

## Pasos pendientes (no incluidos en este commit)

1. **Manual**: identificar y resolver RUTs duplicados consumiendo
   `/api/finance/admin/rut-duplicates` (curl/Postman). Una UI para esto
   queda fuera del scope nocturno.
2. **Manual**: ejecutar la migración SQL del archivo `PENDING-...sql` SOLO
   cuando la query devuelva 0 duplicados.
3. **Refinamiento**: en `run-historical`, hoy si se pasa `ruleId` igual se
   evalúan todas las reglas activas. Para aislar la regla nueva habría que
   hacer un `findMatchingRule` por subset. No es bloqueante.
4. **E2E**: agregar Playwright para "Crear regla desde tx" y "Indicador de
   cashflow live".

## Cosas para validar en navegador (no automatizable acá)

- [ ] Drawer Conciliar movimiento en 375px (iPhone SE)
- [ ] Drawer Conciliar movimiento en 768px (iPad portrait)
- [ ] Toggle light/dark en cada nueva UI
- [ ] Indicador de flujo de caja con cuenta mapeada (verde)
- [ ] Indicador de flujo de caja con cuenta sin mapping (rojo)
- [ ] Wizard "Guardar como regla" con descripción solamente
- [ ] Wizard "Guardar como regla" con RUT detectado
- [ ] Conteo de sub-tabs actualizándose después de conciliar
- [ ] Banner de RUT duplicado cuando aplica
- [ ] Modal post-creación con 3 opciones

## Decisiones tomadas

- En el endpoint `run-historical` con `ruleId`, no aislé la regla porque
  habría requerido refactorear `bulkAutoMatchBankTransactions` y agregar
  side-effects al motor. Dejé TODO explícito.
- El campo `manualAccountType` (que filtraba el combobox por tipo
  contable antes de elegir cuenta) lo eliminé completamente — el
  combobox ya filtra por signo del monto, no aporta el paso extra.
- Para el wizard `SaveAsRuleModal`, asumí siempre `handlingMode:
  "CATEGORIZED"` (no `RECOGNIZED`), porque el flujo viene de
  Categorizar manual donde se eligió cuenta contable. Si en el futuro
  queremos soportar reglas RECOGNIZED desde acá, hay que agregar un
  toggle en el modal.
- El badge numérico en sub-tabs usa `text-[12px]` (no `text-[11px]`
  como contemplaba el prompt original) para respetar el límite del DS
  sin necesidad de marker `@ds-allow-legacy`.
