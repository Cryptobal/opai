# CLEANUP_NOTES — `chore/cleanup-quirurgico`

Notas de la limpieza quirúrgica ejecutada sobre el repo Opai en 2026-04-16.

## Resumen ejecutivo

- **20 commits** en la rama
- **~10,889 archivos eliminados** (neto)
- **~830,949 líneas eliminadas** (la mayoría son build artifacts `.next_*`)
- **Build + typecheck pasan** en cada commit
- **~497 MB liberados** entre disco y tracking
- **Main fue actualizado** en BLOQUE 0 con 2 commits de higiene:
  - `fix(cpq): use costCategoryBreakdown for vehicles and infrastructure fields`
  - `chore: clean sync artifacts and update gitignore` (incluye 7 commits previos sin pushear)

## Bloques ejecutados

### BLOQUE 0 — Pre-flight (mergeado a `main`, ya pusheado)

- Commit `fix(cpq): use costCategoryBreakdown…` — validado y aprobado por el usuario
- Borrado de 65 archivos de sync (iCloud/Dropbox artifacts " 2.*", " 3.*")
  - 61 en `docs/_archive/`
  - 3 en `src/lib/` (`doc-verificacion-helpers 2.ts`, `doc-verificacion-helpers 3.ts`, `quoteStatus 2.ts`)
  - 1 en `docs/superpowers/plans/`
- Nuke de `node_modules_bad_1771520600/` (2.0 GB de instalación rota)
- `.gitignore` actualizado con:
  - `* 2.*`, `* 3.*`, `* 4.*` (prevención de sync artifacts)
  - `.superpowers/` (tooling personal)
- 8 archivos de `.superpowers/brainstorm/` sacados del tracking (scratch, mockups HTML, logs)
- `.worktrees/` y `.claude/worktrees/` NO fueron tocados (preservación de otros branches activos)

### BLOQUE 1 — Build artifacts

- `.next_backup_1772758324/` (~421 MB, ~10,600 archivos)
- `.next_broken_1772762345/` (6.4 MB)
- `.next_old_1772762121/` (5 KB)
- `src/app/page.tsx.bak`
- Nota: queda un `.next_old/` (sin sufijo timestamp) no tracked, listado en `.gitignore` — no se tocó por estar fuera de scope del plan

### BLOQUE 2 — Basura raíz + docs

- `OPAI_LOGO_REDESIGN.html`, `mobile_audit.js`, `estructura_app.txt`, `estructura_components.txt` (0 refs)
- `docs/_archive/` (2.6 MB) y `docs/_deprecated/` (159 KB) — sin links desde docs activos
- `Datos Ops/` **NO se borró**: contiene CSVs reales (`LIBRO_IMPOSICIONES_CENTRALIZADO_F30_202601__CC.csv`, `Libro Remuneración General.csv`, etc.). Es data productiva que debe manejarse aparte — recomendar a los owners moverlo a un storage privado

### BLOQUE 3 — Componentes React huérfanos

59 de 61 componentes borrados (los 2 restantes ya habían sido removidos en la serie "Fase A-G" previa):

- **3a Marketing (11):** `AddOnsSection`, `CtaSection`, `FaqSection`, `HeroSection`, `LoginGate`, `MarketingFooter`, `MarketingNav`, `ModulesSection`, `PortalsSection`, `PricingSection`, `ProblemSection`
- **3b CRM/Config (8):** `CrmConfigClient`, `CrmDetailLayout`, `CustomFieldValue`, `WhatsAppTemplatesSection`, `ConfigSubnav`, `GlobalIndicators`, `ModuleGate`, `NotificationListClient`
- **3c CPQ/Presentation (12):** `CostBreakdownModal`, `CpqPricingCalc`, `QuoteKpiBar`, `QuoteNotesDrawer`, `TemplatePreviewModal`, `DownloadPricingButton`, `DownloadPricingButtonV2`, `Section29Contacto`, `ComparisonTable`, `PhotoMosaic`, `PricingTable`, `ProcessSteps` (+ `SendCpqQuoteModal`, `SendPdfEmailModal` ya eliminados)
- **3d Portal/Chat (10):** `ChatGuardSection`, `PortalEmptyState`, `PwaRegistrar`, `AdditionalServicesPortal`, `CostBreakdownPortal`, `GardServiceIncludes`, `ChatRondasSection`, `InstallBanner`, `SupervisorChat`, `ChatPage`
- **3e Ops/ATS/Finance/Admin (18):** ops (10) + `AccessControlDevicesSection`, `DashboardContent`, `DashboardHeader`, `ExternalJobSearch`, `FinanceSubnav`, `SupervisionDashboardClient`, `SupervisionNewVisitFlow`, `SupervisionReportesClient`

### Cluster Nav v4 — SubNav legacy eliminados

Tras la migración del cluster Nav v4 (registry único + ModuleSubNav primitive),
los siguientes SubNav locales se eliminaron porque ya no se usan:

- `ConfigSubnav`, `DocumentosSubnav`, `OpsSubnav`, `PautasSubnav`, `PayrollSubnav`,
  `PersonasSubnav`, `ReportsTabs`, `RondasSubnav`, `SupervisionSubnav`,
  `TeSubnav`, `TicketsSubnav`, `InventarioSubnav` (12 archivos, ~1.000 LOC).

Toda la nav N3 vive ahora en `src/lib/nav/registry.ts` (single source of
truth). Ver `AGENTS.md` sección "NAVIGATION ARCHITECTURE — Cluster Nav v4".

`npx tsc --noEmit` pasó después de cada sub-batch.

### BLOQUE 4 — API routes muertas

- **4a test/debug (3 routes):** `debug/test-push`, `debug/whatsapp-template`, `notifications/test` (otras 2 ya estaban borradas)
- **4b.1 Reports (3):** `finance/reports/export`, `finance/reports/summary`, `access-control/reports/[installationId]/generate`
- **4b.2 Gamification (2):** `gamification/rankings/instalacion/[id]`, `gamification/rankings/top-movers`
- **4b.3 DT (1):** `admin/dt/crear-acceso-inspector`
- **4b.4 Legacy/AI (3):** `patrol/login`, `notes/ai-context`, `ai/lead-cost-inference`
- **4b.5 Misc (3):** `search/universal`, `docs/templates/seed-labor`, `ops/rondas/incidentes/[id]`

Total: **15 routes borradas**, todas con 0 refs confirmadas en `src/` y sin apps Capacitor locales para verificar.

**NO borrada**: `/api/crm/gmail/callback` — es callback OAuth externo llamado por Google.

Apps Capacitor (`android-terreno`, `android-personas`, `android-erp`, `ios-*`) **no estaban presentes localmente**. Si en el futuro se instalan y alguna llama a una ruta borrada, habrá que recuperar del git log.

### BLOQUE 5 — `public/media/`

- 34 archivos, 16 MB, 0 refs en `src/`

### BLOQUE 6 — Paquetes npm sin uso (11)

- `redux`, `react-redux`, `reselect` (no Redux en el proyecto)
- `@heroicons/react` (solo se usa `lucide-react`)
- `react-email` (solo se usan sub-paquetes `@react-email/*`)
- `react-use-measure`
- `@fontsource/jetbrains-mono`, `@fontsource/plus-jakarta-sans` (solo Inter vía CSS)
- `@tiptap/extension-mention`
- `jsdom`, `csv-parse` (devDeps)

Durante el uninstall hubo un `ENOTEMPTY` en `@heroicons/react` (stale npm state). Se resolvió limpiando manualmente `node_modules/@heroicons/` y re-corriendo.

### BLOQUE 7 — `xlsx` → `exceljs`

El plan identificó 3 archivos. La búsqueda original (`grep -rE "from ['\"]xlsx['\"]"`) **no detectó el import dinámico** en `InventarioComprasClient.tsx`, donde se usaba `await import("xlsx")`. Se migraron **4 archivos** en total:

1. `src/app/api/finance/banking/transactions/import/route.ts` (lectura de cartola Santander; agregado normalizador de celdas para preservar el contrato `(string|number|null)[][]` que espera el parser)
2. `src/app/api/ops/inventario/purchases/template/route.ts` (generación de plantilla xlsx multi-sheet)
3. `src/components/inventario/InventarioLineasClient.tsx` (export de líneas telefónicas — ahora async + download vía Blob)
4. `src/components/inventario/InventarioComprasClient.tsx` (import de compras en bulk — soporta xlsx vía exceljs + CSV vía parser RFC-4180 inline porque exceljs no tiene API de CSV en browser)

`xlsx` removido con `npm uninstall xlsx`. Build pasa.

### BLOQUE 8 — JPG → WebP

4 imágenes convertidas (calidad 82, sharp en lugar de cwebp que no estaba instalado; `sips` de macOS no soporta escritura webp):

| Archivo | JPG | WebP |
|---|---|---|
| `guardia_entrada` | 3.5 MB | 896 KB |
| `guardia_hero` | 2.8 MB | 866 KB |
| `guardia_recepcion` | 2.5 MB | 299 KB |
| `industria_salud` | 2.1 MB | 492 KB |
| **Total** | **10.9 MB** | **2.5 MB** |

Ahorro: **~8.4 MB**.

Refs actualizadas en:
- `src/lib/cpq-mapper.ts` (5 occs)
- `src/lib/mock-data.ts` (6 occs)
- `src/components/presentation/sections/Section21Sectores.tsx` (1 occ — no estaba en el plan, descubierta con grep)

## Decisiones tomadas que no estaban en el plan

1. **Migración de `InventarioComprasClient.tsx`**: no estaba en el plan porque el grep de validación no capturaba `await import("xlsx")`. Se hizo para completar el objetivo "eliminar xlsx".
2. **Parser CSV inline**: al migrar el archivo anterior, no se podía usar exceljs para CSV en el cliente (su API CSV es Node-only). Se añadió parser RFC-4180-ish de ~40 líneas.
3. **Actualización en `Section21Sectores.tsx`**: ref al `industria_salud.jpeg` descubierta por grep, el plan solo mencionaba `cpq-mapper.ts` y `mock-data.ts`.
4. **sharp en lugar de cwebp**: cwebp no estaba instalado; sips (macOS) no escribe webp; sharp ya estaba en `node_modules` y funcionó directo.
5. **node_modules_bad_1771520600/ (2GB)**: off-plan, pero era claramente basura. Se borró del disco.

## Hallazgos pendientes para una próxima iteración

- **Lint roto**: `npm run lint` ejecuta `next lint` que fue removido en Next 16. Reemplazar por `eslint . --ext ts,tsx` o configurar `npm run lint` en `package.json`.
- **Refactor de 4 componentes CRM Detail** (9,384 líneas totales → potencial −60% según auditoría externa)
- **Auditoría Prisma**: 280 modelos, 370 referencias únicas — cruzar para detectar modelos muertos
- **`ts-prune`**: correr para detectar exports muertos dentro de archivos vivos
- **Conversión WebP del resto de `public/`**: ~12 JPG/PNG grandes adicionales que podrían ahorrar varios MB más
- **Análisis de bundle por ruta** (`@next/bundle-analyzer`) para detectar imports pesados en componentes cliente
- **`Datos Ops/`**: mover CSVs sensibles a storage privado (no en git)
- **Limpiar `node_modules/@heroicons`** si aún tiene residuos del uninstall fallido inicial

## Verificaciones finales ejecutadas

- `npx tsc --noEmit` → **EXIT 0**
- `npm run build` → pasa
- `npm run lint` → pre-existente roto (no blocker, no introducido por esta rama)

## Próximo paso

Revisión humana del diff y del commit log, luego:

```bash
git push -u origin chore/cleanup-quirurgico
# Abrir PR apuntando a main linkeando este archivo
```

## Pendientes — Sistema de Tickets (post-auditoría)

Refactor de notificaciones de tickets ya entregado en la rama
`claude/ticket-notifications-refactor-7Mf6v`. Lo siguiente queda registrado
como deuda técnica para iteraciones futuras (no se aborda en este sprint):

1. **Race condition en generación de `code` de ticket**
   - El bloque `findFirst({ orderBy: { createdAt: 'desc' } })` dentro de la
     transacción que genera el siguiente código puede colisionar bajo
     concurrencia (dos hallazgos simultáneos generando el mismo código).
   - Solución correcta: secuencia Postgres por tenant (`tenant_ticket_seq`)
     con `nextval()` dentro de la transacción.
   - Riesgo bajo en el volumen de producción actual; posponemos.

2. **Mention parsing débil**
   - `name.toLowerCase().includes(mentionLower)` matchea por substring y
     puede notificar de más (ej. una mención a "ana" notifica también a
     "Mariana"). El parser no respeta tokens delimitados por espacios o `@`.
   - Solución: parser de tokens delimitados (regex `@[\w.]+` con match
     exacto contra usernames normalizados) o adoptar un editor con `Mention`
     extension (Tiptap, Lexical) que emite IDs serializados.

3. **Tipos separados `ticket_status_changed` y `ticket_comment_added`**
   - Hoy ambos eventos se entregan reutilizando el tipo `ticket_mention`
     (Bloque 5). Funciona, pero impide al usuario silenciar uno sin afectar
     el otro en el panel de preferencias.
   - Cuando se prioricen las preferencias de notificación granular, agregar
     ambos tipos al catálogo (`src/lib/notifications/catalog.ts`,
     `src/lib/notification-types.ts`, `src/app/api/notifications/route.ts`)
     y reemplazar el `type: "ticket_mention"` en
     `src/app/api/ops/tickets/[id]/comments/route.ts` y
     `src/app/api/ops/tickets/[id]/transition/route.ts`.

4. **Reset de `assignedTo` cuando cambia `assignedTeam`**
   - Hoy el PATCH permite cambiar `assignedTeam` sin tocar `assignedTo`,
     dejando al ticket asignado a un admin que potencialmente ya no
     pertenece al nuevo equipo (datos desincronizados).
   - Decisión de UX pendiente: ¿bloquear el cambio si el assignee no es del
     nuevo equipo, limpiarlo automáticamente, o solo advertir en la UI?

5. **Server component padre debe pasar `admins` a `TicketTypesConfigClient`**
   - Bloque 2 dejó la prop `admins?` opcional en
     `src/components/config/TicketTypesConfigClient.tsx` con un TODO al
     final del archivo. El selector "Responsable por defecto" del formulario
     de tipo de ticket sólo se renderiza si la prop llega; sin ella, queda
     oculto sin romper nada.
   - El server component que monta `TicketTypesConfigClient` debe consultar
     `prisma.admin.findMany({ where: { tenantId, status: 'active' }, select: { id, name, email } })`
     y pasarlo como prop.

