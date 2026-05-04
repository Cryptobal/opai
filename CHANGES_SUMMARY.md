# Sincronización Deal ↔ Quote ↔ Installation — Resumen de cambios

Rama: `claude/sync-deal-quote-installation-2YI6P`

## Archivos modificados / creados

### Schema y migración
- `prisma/schema.prisma` — agrega `CrmInstallation.activatedByDealId` (nullable),
  relación `activatedByDeal` y relación inversa `activatedInstallations` en `CrmDeal`.
- `prisma/migrations/20260801000000_crm_installation_activated_by_deal/migration.sql`
  — `ALTER TABLE` idempotente: columna nullable + FK SET NULL + índice.

### Lógica core
- `src/lib/crm/deal-propagation.ts` — `propagateDealWon`, `propagateDealLost` y
  re-export de helpers públicos (161 líneas).
- `src/lib/crm/deal-propagation-helpers.ts` — `pickWinningQuote`,
  `hasOperationalActivity`, `hasOtherWonDealUsingInstallation`,
  `collectSiblingQuoteIds`, `collectOpenQuoteIds` (163 líneas).

### Integración en endpoints
- `src/app/api/crm/deals/[id]/stage/route.ts` — invoca propagación al cambiar
  stage; devuelve `deactivationCandidate` en el payload cuando el deal
  pasa a perdido.
- `src/app/api/portal/cliente/cotizaciones/[id]/approve/route.ts` —
  propaga deal won si la stage destino es de cierre ganado.
- `src/app/api/portal/cliente/cotizaciones/[id]/reject/route.ts` —
  propaga deal lost; candidata a desactivación se loguea (sin modal en portal).

### UI
- `src/components/crm/DeactivateInstallationDialog.tsx` — modal liquid glass
  (clases `opai-liquid-glass` + `opai-liquid-glass-button`), 137 líneas.
- `src/components/crm/CrmDealDetailClient.tsx` — abre modal cuando el endpoint
  de stage retorna `deactivationCandidate`.
- `src/app/(app)/crm/installations/[id]/page.tsx` — incluye
  `activatedByDealId` y `activatedByDeal{id,title}` en el `select`.
- `src/components/crm/CrmInstallationDetailClient.tsx` — agrega tipo
  `activatedByDeal` y card "Activada por negocio" con link al deal.

### Reconciliación
- `scripts/reconcile-deal-quote-installation.ts` — script CLI con flag
  `--dry-run`, emite reporte JSON en `/tmp/`.
- `src/app/api/platform/admin/reconcile-crm/route.ts` — endpoint admin
  protegido por `requirePlatformAuth`.

## Reglas implementadas

**Al ganar un deal** (`propagateDealWon`):
1. Identifica quote ganadora (prioridad: `activeQuotationId` → `approved` → única `sent` → `sent` más reciente).
2. Marca ganadora como `approved`.
3. Marca hermanas en `draft`/`sent` como `rejected`.
4. Si la instalación está en `prospect`/`inactive` → activa + setea `activatedByDealId` + habilita nocturno + chat.
5. Si la instalación está activa sin `activatedByDealId` → solo setea el campo.
6. Si está activa con otro `activatedByDealId` → no toca.
7. Setea `deal.activeQuotationId` a la ganadora.

**Al perder un deal** (`propagateDealLost`):
1. Marca quotes en `draft`/`sent` como `rejected`.
2. Identifica candidata a desactivación (3 condiciones obligatorias):
   - `activatedByDealId === deal.id`
   - Sin operación real (sin pautas, asistencias ni marcaciones)
   - Ningún otro deal won del tenant tiene quote `approved` apuntando a ella
3. **NUNCA desactiva automáticamente.** Devuelve la candidata para que la UI confirme.

## Aplicar reconciliación a Gard

```bash
# Instalar deps si hace falta
npm install

# Generar Prisma client + aplicar migración
npx prisma migrate deploy
npx prisma generate

# Dry-run: solo imprime los deals que procesaría, no muta
npx tsx scripts/reconcile-deal-quote-installation.ts <GARD_TENANT_ID> --dry-run

# Ejecución real: aplica cambios y emite reporte JSON en /tmp/
npx tsx scripts/reconcile-deal-quote-installation.ts <GARD_TENANT_ID>
```

> **Nota:** la rama del prompt original era `feat/crm-deal-quote-installation-sync`,
> pero se desarrolló en `claude/sync-deal-quote-installation-2YI6P` por
> instrucciones del harness. Asimismo, el repo usa **npm** (`package-lock.json`),
> no `pnpm` — los comandos se ajustaron a `npx` / `npm`.

## Validaciones manuales recomendadas en Ametel (tenant Gard)

Después de correr la reconciliación, verificar:

1. **Servicio de Se… → Peñablanca**: la quote ganadora debe quedar `approved`
   y la instalación Ametel-villa alemana debe quedar `active`.
2. **Algarrobo (active)** no debe tocarse: tiene operación o no fue activada
   por el deal perdido.
3. **Deals perdidos sin instalación**: cotizaciones a `rejected`.
4. **Detalle de instalación**: el card "Activada por negocio" aparece en las
   instalaciones que tienen `activatedByDealId`.
5. **Detalle de deal perdido nuevo**: al cambiar stage a "Perdido" debe abrir
   el modal liquid glass solo cuando la instalación cumple las 3 condiciones.

## Garantías de seguridad

- **Datos operativos sagrados**: ninguna instalación con pauta, asistencia
  o marcación se desactiva automáticamente.
- **Multi-tenant strict**: todas las queries filtran por `tenantId`.
- **Sin breaking changes**: todos los cambios son aditivos (campo nullable,
  helpers nuevos, modal opcional).
- **Reconciliación reversible**: `--dry-run` para simulación + reporte JSON
  con detalle de cada cambio.
- **Confirmación humana**: la desactivación pasa por modal con opción
  "Mantener activa".

## Notas de verificación local

- `npx tsc --noEmit` pasa limpio en cada bloque.
- `npx next build` falla en este sandbox por falta de red para Google Fonts
  (`DM Sans`, `Exo 2`, `JetBrains Mono`); no relacionado con los cambios.
  En CI o local con red el build debe completar.
- DS Guard emite advertencias `[no-tiny-text]` y similares en
  `CrmDealDetailClient.tsx` y `CrmInstallationDetailClient.tsx` que son
  pre-existentes en esos archivos. Las clases `opai-liquid-glass*` del modal
  son dark-only por diseño (Design System v3); el guard las marca como
  "fix-when-you-can".
