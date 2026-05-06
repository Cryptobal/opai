# Módulo de Cesión de Facturas — Resumen V1

## Status

**Branch**: `feat/factoring-cesion-mvp`
**Commits del feature**: 16 (4 del Bloque 0 + 9 de los bloques 1-9 + 1 del summary + 2 commits intermedios revertidos)
**Bloque 0 validado al 100% contra producción**: TrackId real `11998878336` (cesión Gard → SCF Servicios Financieros Chile, factura 1632 por $6.897.240, anotada por SII el 06/05/2026 12:42:27) → SII confirmó **EOK** vía SOAP `wsRPETCConsulta` (ver `tmp/check-prod-cesion/REPORTE_FINAL.md`).

## Mapa de commits

| Commit | Bloque | Descripción | Files |
|---|---|---|---|
| `62fcd67f2` | B0 | Sandbox CLI end-to-end con SOAP RPETC | 7 |
| `11733d87e` | B0 | Modo `--check-only` para SOAP RPETC | 5 |
| `e928a4418` | B0 | Script `extract-cert` para sandbox local | 2 |
| `d3bdcf682` | B0 | **Fix C14N + KeyValue para auth SII** (descubierto contra prod real) | 2 |
| `1d908a892` | B1 | Schema Prisma + migration | 2 |
| `d01ff6de8` | B2 | Adapter SimpleAPI cesión | 3 |
| `3a402c104` | B3 | Services (cession, operations, factoring-companies) | 3 |
| `84762ed2d` | B4 | API routes (12 endpoints) | 30 ⚠️ |
| `a37b4ace3` | B5 | UI catálogo factorings | 3 |
| `19b4aad9d` | B6 | UI listado cesiones con KPIs | 2 |
| `fcc87fb86` | B7 | UI detalle cesión con timeline | 3 |
| `3797c82fd` | B8 | Botón Ceder en ficha DTE | 3 |
| `0588a688f` | B9 | SOAP `wsRPETCConsulta` + cron status | 5 |
| `fbf596025` | B10 | Summary + verificación final | 1 |

⚠️ El commit B4 absorbió 18 archivos WIP no relacionados con el módulo (`dte-pdf-renderer.ts`, `dte-xml-parser.ts`, `dte-preflight.ts`, suites de tests, etc.) que estaban en el working tree por un cambio de rama accidental durante el flujo. **Son trabajo legítimo previo tuyo**, no se descartan; quedan como parte de la branch. Para extraerlos a otra rama: `git rebase -i 84762ed2d~1` y separar el commit.

## Archivos creados / modificados (factoring puro, B1-B9)

### Schema + migration
```
prisma/schema.prisma                                                            (+68/-4)
prisma/migrations/20260506184657_factoring_cesion_mvp/migration.sql             (NUEVO, 64 líneas)
```

### Adapter SimpleAPI
```
src/modules/finance/shared/adapters/dte-provider.adapter.ts                     (+79)
src/modules/finance/shared/adapters/simpleapi-cesion.ts                         (NUEVO, 288)
src/modules/finance/shared/adapters/simpleapi.provider.ts                       (+35)
```

### Services
```
src/modules/finance/factoring/cession.service.ts                                (NUEVO, 299)
src/modules/finance/factoring/operations.service.ts                             (NUEVO, 227)
src/modules/finance/factoring/factoring-companies.service.ts                    (NUEVO, 251)
```

### Validations + API routes
```
src/lib/validations/factoring.ts                                                (NUEVO, 62)
src/app/api/finance/factoring/companies/route.ts                                (NUEVO, 68)
src/app/api/finance/factoring/companies/[id]/route.ts                           (NUEVO, 98)
src/app/api/finance/factoring/operations/route.ts                               (NUEVO, 66)
src/app/api/finance/factoring/operations/[id]/route.ts                          (NUEVO, 42)
src/app/api/finance/factoring/operations/[id]/mark-funded/route.ts              (NUEVO, 43)
src/app/api/finance/factoring/operations/[id]/mark-collected/route.ts           (NUEVO, 43)
src/app/api/finance/factoring/operations/[id]/mark-closed/route.ts              (NUEVO, 43)
src/app/api/finance/factoring/operations/[id]/cancel/route.ts                   (NUEVO, 47)
src/app/api/finance/factoring/operations/[id]/aec/route.ts                      (NUEVO, 45)
src/app/api/finance/factoring/kpis/route.ts                                     (NUEVO, 29)
src/app/api/finance/billing/issued/[id]/cede/route.ts                           (NUEVO, 65)
src/app/api/finance/billing/issued/route.ts                                     (extendido para canBeCeded + activeCession)
```

### UI
```
src/app/(app)/finanzas/facturacion/cesiones/factorings/page.tsx                 (NUEVO, 73)
src/app/(app)/finanzas/facturacion/cesiones/page.tsx                            (NUEVO, 88)
src/app/(app)/finanzas/facturacion/cesiones/[id]/page.tsx                       (NUEVO, 96)
src/components/finance/factoring/FactoringCompaniesClient.tsx                   (NUEVO, 245)
src/components/finance/factoring/FactoringCompanyForm.tsx                       (NUEVO, 251)
src/components/finance/factoring/FactoringOperationsClient.tsx                  (NUEVO, 290)
src/components/finance/factoring/FactoringOperationDetail.tsx                   (NUEVO, 351)
src/components/finance/factoring/FactoringTimeline.tsx                          (NUEVO, 126)
src/components/finance/factoring/CederDteDialog.tsx                             (NUEVO, 280)
src/components/finance/IssuedDteDetailDialog.tsx                                (+30: state + botón + render)
```

### Cron + SOAP
```
src/lib/sii/soap-client.ts                                                      (NUEVO, 286)
src/modules/finance/factoring/sii-soap.service.ts                               (NUEVO, 114)
src/modules/finance/factoring/cession-status-poll.service.ts                    (NUEVO, 110)
src/app/api/cron/finance-cession-rpetc-status/route.ts                          (NUEVO, 44)
vercel.json                                                                     (+entry cron horario)
```

## Comandos de migración

```bash
git checkout feat/factoring-cesion-mvp
npm install
npx prisma migrate deploy   # aplica el migration nuevo a la DB de Vercel
npx prisma generate
```

En el deploy de Vercel se ejecuta automáticamente como parte del script `build` (incluye `prisma migrate deploy`).

## Variables de entorno

**Ninguna nueva.** El módulo reusa:
- `SIMPLEAPI_KEY` (ya existente, para los pasos `dte/cesion/generar` y `cesion/enviar`)
- `DTE_ENCRYPTION_KEY` (ya existente, para descifrar `TenantDteCertificate.pfxDataEnc`)
- `CRON_SECRET` (ya existente, para auth del cron)

## Capabilities afectadas

| Capability | Endpoints / pages |
|---|---|
| `facturacion_view` | GET cesiones, KPIs, AEC, listado/detalle UI |
| `facturacion_issue` | POST cede, mark-funded/collected/closed, cancel |
| `facturacion_configure` | POST/PATCH/DELETE companies (catálogo) |

## Verificación end-to-end manual

### 1. Bloque 0 (ya validado contra producción)
TrackId 11998878336 confirma EOK en producción real. Evidencia en `tmp/check-prod-cesion/REPORTE_FINAL.md`.

### 2. Crear empresa de factoring de prueba
- Navegar a `/finanzas/facturacion/cesiones/factorings`
- Click "Nuevo factoring"
- Completar datos (RUT, razón social, opcionalmente tasas default)
- Verificar que aparece en el listado

### 3. Verificar pre-condiciones del DTE
- Tenant Gard tiene `TenantDteConfig` activo + `TenantDteCertificate` cargado + DTE tipo 33 con `siiStatus=ACCEPTED` y `dteXml` no nulo en BD

### 4. Probar cesión desde Opai
- Ir a `/finanzas/facturacion`
- Abrir el detalle de un DTE 33 cedible (ACEPTADO + con XML)
- En el footer aparece botón "Ceder a factoring" (visible solo si `canManage` y se cumplen las condiciones)
- Click → modal `CederDteDialog`
- Seleccionar factoring del catálogo, ajustar fechas y tasas
- Cálculos en vivo del neto a girar
- Click "Ceder" → POST a `/api/finance/billing/issued/[id]/cede` → genera AEC + envía a RPETC SII
- Toast con TrackId + redirect a `/finanzas/facturacion/cesiones/[opId]`

### 5. Verificar la operación creada
- Aparece en `/finanzas/facturacion/cesiones`
- Status: SUBMITTED, fechaCesion = hoy
- AEC descargable (botón "Descargar AEC" en el detalle)
- TrackId asignado, banner SII "Verificando…"

### 6. Esperar el cron (próxima ejecución)
- Cron horario `/api/cron/finance-cession-rpetc-status` consulta SII
- Si SII confirma EOK → operación pasa a APPROVED automáticamente
- Banner SII en detalle muestra "Estado SII: EOK — Anotación de Cesión Aceptada"
- Botón "Marcar girada" aparece (status APPROVED)

### 7. Transiciones manuales
- APPROVED → FUNDED (factoring giró el anticipo a tu cuenta)
- FUNDED → COLLECTED (cliente pagó al factoring)
- COLLECTED → CLOSED (retención liberada, lifecycle cerrado)
- En cualquier momento (excepto FUNDED+) → CANCELLED con razón

## Estados oficiales SII (ws_consulta_estado_aec.pdf v1.2)

| Código | Descripción | Mapeo interno |
|---|---|---|
| EOK | Envío Aceptado (terminal) | → APPROVED |
| EPR | Envío en Proceso de Carga (terminal aceptado) | → APPROVED |
| UPL/RCP/SOK/FSO/COK/VDC/VCS | En proceso (no terminal) | mantiene SUBMITTED |
| RSC/RFS/RCR/RDC/RCS/EAN | Rechazado (terminal) | mantiene SUBMITTED + flag error (acción humana) |

## Limitaciones V1

- Solo cesión TOTAL (no parcial)
- Solo Secuencia=1 (no re-cesión)
- Solo tipos DTE 33, 34, 43, 46
- Sin cesiones recibidas (lado deudor)
- Sin asientos contables automáticos vinculados (FactoringOperation tiene `journalEntryId` opcional, sin auto-build)
- Sin notificaciones in-app por evento
- Sin manejo completo de RECOURSE / aval / mora
- Sin TIR efectiva
- Sin vista por factoring (analytics)

## Próximos pasos V2

- Cesiones recibidas (lado deudor)
- Asientos contables automáticos vinculados a operaciones
- Inbound email parser para correos del SII (Resend webhook)
- Cesión parcial / re-cesión (Secuencia > 1)
- Aging alerts (cesiones SUBMITTED > 7 días sin movimiento)
- TIR efectiva por operación / por factoring
- Vista por factoring con analytics (volumen, tasas promedio, mora)
- Migración formal de los helpers SOAP del sandbox a re-export desde `src/lib/sii/`

## Verificación TS (al cierre de B10)

- Mis archivos del feature (factoring): **0 errores**
- Baseline TS del repo: ~80 errores pre-existentes (todos en `.next/types/validator.ts` regenerado por Next dev, untracked WIPs tuyos en `src/components/admin/*` y `src/lib/notification-service.ts`, y 4 errores nuevos del WIP de Carlos en `duplicate-as-draft/route.ts` y `email-log/route.ts`).
- Comparación de errores en `src/modules/finance/factoring/`, `src/lib/sii/`, `src/components/finance/factoring/`, `src/app/api/finance/factoring/`, `prisma/schema.prisma`: **0 regresiones introducidas**.
- `npm run build` integral NO se corrió (requiere DB activa, falla por baseline pre-existente y mi código vive en paths que se compilan correctamente en aislamiento). Vercel lo correrá durante el deploy.

## Limpieza pendiente

- `scripts/factoring/sii-soap-helpers.ts` y `sii-soap-auth.ts` **siguen ahí intactos** para que el sandbox CLI `--check-only` siga funcionando sin cambios. Hay duplicación con `src/lib/sii/soap-client.ts`. En V2 el sandbox debería re-exportar desde `@/lib/sii/soap-client` para tener single source of truth.

## Notas técnicas (descubrimientos del Bloque 0 contra producción real)

Durante la validación contra el SII real se descubrieron y fixearon dos bugs latentes que NO estaban en el plan original:

1. **C14N mal implementado en la firma del getToken**. El SignedInfo se firmaba con self-closing tags (`<CanonicalizationMethod ... />`), pero el SII canonicaliza el bloque antes de validar (xml-c14n RFC 3076), expandiendo a tags pares. Los bytes firmados no coincidían con los verificados por SII → firma inválida. El SII reportaba un mensaje confuso (`"XML Inválido, elemento 'Certificate' no existe, función getCertificado"`) que en realidad significaba "firma RSA inválida".

   **Fix**: emitir SignedInfo en forma canónica (todos los tags pares) y firmar ese exact string.

2. **Doble-escape no aplicado en `getSeed`/`getToken`**. El SII envuelve el XML interno doble-escapado (`&lt;SEMILLA&gt;...`) dentro del SOAP return value. Las regex no des-escapaban antes de matchear. Resuelto con helper `unescapeSiiInnerXml` reutilizado en los 3 endpoints SOAP.

3. **Defensa en profundidad**: agregado `<KeyValue><RSAKeyValue>` con modulus + exponent del cert (mismo patrón que LibreDTE/Acepta), además del `<X509Certificate>`.

Sin la validación end-to-end del Bloque 0, estos bugs habrían fallado en runtime sólo cuando el cron polled por primera vez, con un error críptico difícil de debuggear en producción.
