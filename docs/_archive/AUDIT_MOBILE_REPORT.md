# AUDITORÍA UX MÓVIL — OPAI / Gard Security

**Fecha:** 2026-02-27
**Auditor:** Claude (Audit Agent)
**Plataforma principal:** Safari iOS (ejecutivos de venta en terreno)
**Plataformas secundarias:** Chrome Android, Samsung Internet, Desktop browsers
**Framework:** Next.js 15.4.11 + Tailwind CSS 3.4 + shadcn/ui + Radix UI

---

## RESUMEN EJECUTIVO

El proyecto OPAI presenta **problemas críticos de UX móvil** que afectan directamente a los ejecutivos en terreno. El hallazgo más grave es la **ausencia del viewport meta tag** en el layout raíz (Next.js Viewport API no configurada), lo que causa que el rendering móvil no se escale correctamente. Además, los **3 componentes base de formulario** (Input, Select, Textarea) usan `text-sm` (14px), disparando el **auto-zoom de iOS Safari en CADA campo de formulario** del sistema. El módulo de notas ejecuta **refetch completo** de hasta 50 notas en cada acción (reacción, pin, edición), causando re-renders masivos innecesarios. Se encontraron **18 llamadas a `router.refresh()`** en el CRM que recargan páginas completas. Múltiples grids y contenedores con anchos fijos desbordan en pantallas de 320px. En total se identificaron **68 problemas**: 12 ALTA, 31 MEDIA, 25 BAJA severidad.

---

## PROBLEMAS POR CATEGORÍA

---

### ZOOM — Zoom involuntario en iOS Safari

> **Regla crítica:** iOS Safari aplica auto-zoom cuando un input/select/textarea tiene `font-size < 16px`.

| # | Archivo | Línea | Descripción | Severidad |
|---|---------|-------|-------------|-----------|
| Z-01 | `src/app/layout.tsx` | — | **No existe `export const viewport`** (Next.js 15 Viewport API). No se genera `<meta name="viewport">` en el HTML. Sin viewport tag, las media queries no funcionan correctamente y el escalado móvil falla. | **ALTA** |
| Z-02 | `src/components/ui/input.tsx` | 13 | Clase `text-sm` (14px) en el componente base `<Input>`. Afecta a **TODOS** los inputs del sistema. iOS hará auto-zoom al tocar cualquier input. | **ALTA** |
| Z-03 | `src/components/ui/select.tsx` | 19 | Clase `text-sm` (14px) en `<SelectTrigger>`. Afecta a **TODOS** los selects del sistema. iOS hará auto-zoom al abrir cualquier select. | **ALTA** |
| Z-04 | `src/components/ui/textarea.tsx` | 12 | Clase `text-sm` (14px) en `<Textarea>`. iOS hará auto-zoom al tocar cualquier textarea. | **ALTA** |
| Z-05 | `src/components/config/TicketTypesConfigClient.tsx` | 278, 300, 323, 339 | Campos con `h-8 text-xs` (12px). Formulario de pasos de aprobación con font-size extremadamente bajo para móvil. | **ALTA** |
| Z-06 | `src/components/cpq/CpqQuoteDetail.tsx` | 1237, 1252, 1278, 1625, 1662 | Inputs y textareas con `text-xs` (12px). Campos de cotización compactos que causan zoom severo. | **ALTA** |
| Z-07 | `src/components/finance/CreditNoteForm.tsx` | 280, 288, 297, 305, 353, 363, 372 | 7 campos con `h-8 text-xs` (12px). Formulario de notas de crédito. | **MEDIA** |
| Z-08 | `src/components/finance/DteForm.tsx` | 366, 375, 382, 391, 400, 439, 449, 458, 467 | 9 campos con `h-8 text-xs` (12px). Formulario DTE. | **MEDIA** |
| Z-09 | `src/components/finance/JournalEntryForm.tsx` | 247, 257, 267, 340, 351, 362 | 6 campos con `h-8 text-xs` (12px). Formulario de asientos contables. | **MEDIA** |
| Z-10 | `src/components/crm/CrmDealDetailClient.tsx` | 685, 747 | Campos con `h-8 text-xs` (12px) en detalle de deal. | **MEDIA** |
| Z-11 | `src/components/crm/CrmContactDetailClient.tsx` | 596, 699, 727 | Campos con `h-7`/`h-9 text-xs` (12px) en detalle de contacto. | **MEDIA** |
| Z-12 | `src/components/ops/OpsPautaDiariaClient.tsx` | 386, 753, 768, 801, 820, 843 | 6 campos con `h-8 text-xs` (12px) en pauta diaria. | **MEDIA** |
| Z-13 | `src/components/ops/GuardiasClient.tsx` | 388, 401 | Campos con `h-8 px-2 text-xs` (12px) en módulo guardias. | **MEDIA** |
| Z-14 | `src/components/ops/OpsMarcacionesClient.tsx` | 401, 411, 424 | Campos con `h-8 text-xs` (12px) en marcaciones. | **MEDIA** |
| Z-15 | `src/components/ops/guard-events/GuardEventsTab.tsx` | 225, 241 | Campos con `h-8 w-[140px] text-xs` (12px) en eventos de guardia. | **MEDIA** |
| Z-16 | `src/components/ops/guardia-sections/DocumentosSection.tsx` | 204, 219, 228, 232 | Campos con `h-8 text-xs` (12px) en documentos de guardia. | **MEDIA** |
| Z-17 | `src/components/opai/AiHelpChatWidget.tsx` | 401, 504 | Input del chat AI con `h-8 text-xs` (12px). | **MEDIA** |
| Z-18 | `src/components/ops/OpsControlNocturnoDetailClient.tsx` | 771, 781, 920, 930, 989, 1289, 1303 | 7 inputs con `text-xs` (12px) en control nocturno. | **MEDIA** |
| Z-19 | `src/components/payroll/PayrollPeriodDetailClient.tsx` | 494, 498, 502 | Campos con `h-8 text-xs` (12px) en nóminas. | **MEDIA** |
| Z-20 | `src/components/shared/FilterPills.tsx` | 36 | Select trigger con `h-8 text-xs` (12px). Usado globalmente en filtros. | **MEDIA** |
| Z-21 | `src/components/ui/MapsUrlPasteInput.tsx` | 181, 201, 209 | Input con `text-sm` (14px) y labels con `text-xs` (12px). | **BAJA** |
| Z-22 | `src/components/crm/CrmAccountDetailClient.tsx` | 699, 727, 949 | Campos inline con `text-xs`/`text-sm` (12-14px). | **BAJA** |
| Z-23 | `src/components/ops/ControlNocturnoKpisClient.tsx` | 454 | Select con `h-8 text-xs` (12px). | **BAJA** |
| Z-24 | `src/styles/globals.css` | — | **No existe media query** que fuerce `font-size: 16px` en inputs/selects en mobile. No hay override global que proteja contra auto-zoom. | **ALTA** |

---

### OVERFLOW — Elementos que desbordan el viewport móvil

| # | Archivo | Línea | Descripción | Severidad |
|---|---------|-------|-------------|-----------|
| O-01 | `src/app/(app)/hub/_components/HubOperationsSection.tsx` | 109, 128 | `grid-cols-4` sin prefix responsive. 4 columnas a 320px = ~80px cada una, desborda con gaps. | **ALTA** |
| O-02 | `src/app/(app)/hub/_components/HubTicketsSection.tsx` | 27 | `grid-cols-3` sin prefix responsive. Apretado en 320px. | **MEDIA** |
| O-03 | `src/app/(app)/hub/_components/HubPipelineSection.tsx` | 123 | `grid-cols-3` sin prefix responsive. | **MEDIA** |
| O-04 | `src/components/crm/CrmDealsClient.tsx` | 222 | `min-w-[250px]` en tarjetas de deals. Desborda en 320px dentro de contenedor con padding. | **ALTA** |
| O-05 | `src/components/crm/CrmToolbar.tsx` | 63 | `min-w-[220px]` en barra de búsqueda. Puede exceder viewport con padding lateral. | **MEDIA** |
| O-06 | `src/components/admin/DashboardHeader.tsx` | 164 | Dropdown con `w-96` (384px) en elemento `fixed`. Excede dispositivos de 375px. | **MEDIA** |
| O-07 | `src/components/admin/DashboardHeader.tsx` | 231 | Modal con `max-w-2xl` en posición fixed. Excede viewports móviles. | **MEDIA** |
| O-08 | `src/components/admin/TemplateSidebar.tsx` | 210 | Sidebar fijo con `w-80` (320px). No deja espacio para contenido en 320px. | **MEDIA** |
| O-09 | `src/components/opai/SectionNav.tsx` | 406 | Nav expandible con `w-[220px]` sin manejo móvil específico. | **BAJA** |
| O-10 | `src/components/crm/CrmLeadDetailClient.tsx` | 1106 | Select con `max-w-[280px]` que puede desbordar en 320px con padding. | **BAJA** |
| O-11 | `src/components/cpq/CpqQuoteDetail.tsx` | 1003 | Popover con `absolute right-0 top-full` y `min-w-[180px]`. Puede salirse por el borde derecho. | **BAJA** |
| O-12 | `src/components/opai/AppSidebar.tsx` | 486 | Tooltip con `fixed left-[72px]` y `min-w-[180px]`. Sin verificación de límite derecho. | **BAJA** |
| O-13 | `src/components/docs/DocDetailClient.tsx` | 309 | Select con `w-[160px]` fijo sin breakpoint móvil. | **BAJA** |
| O-14 | `src/components/ops/guard-events/GuardEventsTab.tsx` | 225 | Select con `w-[140px]` fijo. | **BAJA** |
| O-15 | `src/components/ops/tickets/TicketsClient.tsx` | 197 | Select con `w-[140px]` fijo. | **BAJA** |

---

### RECARGAS — Recargas innecesarias de componentes/página

| # | Archivo | Línea | Descripción | Severidad |
|---|---------|-------|-------------|-----------|
| R-01 | `src/components/notes/NoteItem.tsx` | 316 | **Reacción (emoji):** `ctx.fetchNotes()` refetch de 50 notas completas al agregar/quitar una reacción. Debería ser actualización local del estado. | **ALTA** |
| R-02 | `src/components/notes/NoteItem.tsx` | 262 | **Edición de nota:** `ctx.fetchNotes()` refetch completo tras editar. El API ya retorna la nota actualizada. | **MEDIA** |
| R-03 | `src/components/notes/NoteItem.tsx` | 280 | **Eliminación de nota:** `ctx.fetchNotes()` refetch completo. Debería ser `filter()` local. | **MEDIA** |
| R-04 | `src/components/notes/NoteItem.tsx` | 299 | **Pin/unpin:** `ctx.fetchNotes()` refetch completo al anclar/desanclar nota. | **MEDIA** |
| R-05 | `src/components/notes/NoteItem.tsx` | 196 | **Toggle tarea completada:** `ctx.fetchNotes()` refetch completo para cambiar un checkbox. | **MEDIA** |
| R-06 | `src/components/crm/NotesSection.tsx` | 356 | **Crear nota (legacy):** `fetchNotes()` refetch de todas las notas tras crear una. | **MEDIA** |
| R-07 | `src/components/crm/NotesSection.tsx` | 386 | **Crear respuesta (legacy):** `fetchNotes()` refetch completo para añadir un reply. | **MEDIA** |
| R-08 | `src/components/crm/NotesSection.tsx` | 415 | **Editar nota (legacy):** `fetchNotes()` refetch completo. | **BAJA** |
| R-09 | `src/components/crm/NotesSection.tsx` | 434 | **Eliminar nota (legacy):** `fetchNotes()` refetch completo. | **BAJA** |
| R-10 | `src/components/crm/CrmInstallationDetailClient.tsx` | 538 | `router.refresh()` tras asignar guardia. Recarga toda la página. | **MEDIA** |
| R-11 | `src/components/crm/CrmInstallationDetailClient.tsx` | 571 | `router.refresh()` tras desasignar guardia. | **MEDIA** |
| R-12 | `src/components/crm/CrmInstallationDetailClient.tsx` | 1102 | `router.refresh()` tras crear puesto. | **BAJA** |
| R-13 | `src/components/crm/CrmInstallationDetailClient.tsx` | 1128 | `router.refresh()` tras eliminar puesto. | **BAJA** |
| R-14 | `src/components/crm/CrmInstallationDetailClient.tsx` | 1243 | `router.refresh()` tras desactivar puesto. | **BAJA** |
| R-15 | `src/components/crm/CrmInstallationDetailClient.tsx` | 1667, 1704, 1771, 1799 | 4x `router.refresh()` tras acciones de instalación (estado, control nocturno, edición, contacto). | **BAJA** |
| R-16 | `src/components/crm/CrmDealDetailClient.tsx` | 448, 465, 1045 | 3x `router.refresh()` tras operaciones de cotización. | **BAJA** |
| R-17 | `src/components/crm/CrmAccountDetailClient.tsx` | 346, 372, 420, 451 | 4x `router.refresh()` tras actualizar cuenta (datos web, descripción AI, tipo, estado). | **BAJA** |
| R-18 | `src/components/crm/InstallationEditButton.tsx` | 112 | `router.refresh()` tras editar instalación. | **BAJA** |
| R-19 | `src/components/crm/CrmInstallationsListClient.tsx` | 146 | `router.refresh()` tras crear instalación. | **BAJA** |

---

### TOUCH — Problemas de interacción táctil

| # | Archivo | Línea | Descripción | Severidad |
|---|---------|-------|-------------|-----------|
| T-01 | `src/components/opai/AppSidebar.tsx` | 230-234, 288-292 | **Flyout de sidebar solo en hover.** `onMouseEnter`/`onMouseLeave` para abrir/cerrar menú. En móvil, el flyout nunca se muestra. Navegación principal inaccesible en sidebar colapsado. | **ALTA** |
| T-02 | `src/components/crm/CrmInstallationDetailClient.tsx` | 762 | **Tooltip con `hidden group-hover:block`** sobre campo de fecha. Información importante invisible en touch. | **MEDIA** |
| T-03 | `src/components/opai/KpiCard.tsx` | 105, 138 | **Tooltips informativos con `hidden group-hover:block`**. Info de KPI cards invisible en dispositivos touch. | **MEDIA** |
| T-04 | `src/components/opai/SectionNav.tsx` | 479 | **Tooltip de navegación con `hidden group-hover/tip:block`**. Labels de sección invisibles en touch. | **MEDIA** |
| T-05 | `src/components/crm/NotesSection.tsx` | varias | **`onMouseDown` para selección de menciones.** Puede causar latencia en dispositivos touch vs. `onClick`. | **BAJA** |
| T-06 | `src/components/docs/EditorToolbar.tsx` | varias | **`onMouseDown` en botones de toolbar.** Puede interferir con interacciones touch. | **BAJA** |
| T-07 | `src/components/ui/SearchableSelect.tsx` | varias | **`onMouseDown` para selección de opciones.** Puede causar problemas sutiles en touch. | **BAJA** |
| T-08 | `src/components/opai/AppShell.tsx` | 73-78 | **Scroll lock incompleto en iOS.** Solo usa `overflow: hidden` en body. En iOS Safari necesita `position: fixed; width: 100%` para prevenir scroll-through. | **MEDIA** |
| T-09 | `src/components/opai/command-palette/CommandPaletteProvider.tsx` | 44-51 | **Mismo patrón de scroll lock incompleto** en command palette. | **BAJA** |
| T-10 | `src/components/cpq/QuoteNotesDrawer.tsx` | 54-57 | **Mismo patrón de scroll lock incompleto** en drawer de notas. | **BAJA** |
| T-11 | `src/components/notes/NotesPanel.tsx` | 96-99 | **Mismo patrón de scroll lock incompleto** en panel de notas. | **BAJA** |

---

### CSS — Inconsistencias globales de CSS

| # | Archivo | Línea | Descripción | Severidad |
|---|---------|-------|-------------|-----------|
| C-01 | `src/styles/globals.css` | — | **No existe `@media (hover: hover)`** para aislar estilos hover. Todos los `hover:` de Tailwind se aplican en touch, causando estados visuales incorrectos (sticky hover). | **MEDIA** |
| C-02 | `src/components/notes/NoteItem.tsx` | 553, 585 | **Botones con `opacity-0 group-hover:opacity-100`**. Acciones de nota invisibles hasta hover (inalcanzables en touch sin long-press). | **MEDIA** |
| C-03 | `src/components/ui/dialog.tsx` | 73 | **Botón cerrar con `opacity-70 hover:opacity-100`**. En touch, siempre se ve al 70% de opacidad. | **BAJA** |
| C-04 | `src/components/ui/sheet.tsx` | 68 | **Misma situación** que dialog: botón cerrar semi-transparente. | **BAJA** |
| C-05 | `src/styles/globals.css` | — | **No hay safe-area-inset-top** en layout global. Solo bottom/left/right cubiertos en componentes específicos. | **BAJA** |
| C-06 | `src/components/opai/AppShell.tsx` | 225 | **Padding asimétrico:** `pl-2 pr-4` (8px vs 16px) en mobile. Menor que sm: `pl-3 pr-6`. Inconsistencia visual perceptible. | **BAJA** |

---

## CONTEO TOTAL DE PROBLEMAS

| Severidad | Cantidad | Porcentaje |
|-----------|----------|------------|
| **ALTA** | 12 | 18% |
| **MEDIA** | 31 | 46% |
| **BAJA** | 25 | 37% |
| **TOTAL** | **68** | 100% |

### Distribución por categoría:

| Categoría | ALTA | MEDIA | BAJA | Total |
|-----------|------|-------|------|-------|
| ZOOM | 7 | 13 | 4 | 24 |
| OVERFLOW | 2 | 6 | 7 | 15 |
| RECARGAS | 1 | 8 | 10 | 19 |
| TOUCH | 1 | 4 | 6 | 11 |
| CSS | 0 | 2 | 4 | 6 |

---

## HALLAZGOS POSITIVOS

Cabe destacar las áreas donde el proyecto ya implementa buenas prácticas móviles:

- **Dialog mobile-first** (`dialog.tsx:59-60`): Bottom-sheet en móvil, modal centrado en desktop
- **Sheet responsive** (`sheet.tsx:41-43`): `w-3/4 sm:max-w-sm` con buen manejo
- **Select collision padding** (`select.tsx:80`): `collisionPadding={12}` previene que dropdowns se salgan
- **Safe area insets** en BottomNav, NotesFloatingButton, AppShell, AiHelpChatWidget
- **100dvh** en vez de 100vh para viewport dinámico (address bar iOS)
- **DnD touch sensors** configurados correctamente con `@dnd-kit` (delay + tolerance)
- **`-webkit-tap-highlight-color: transparent`** en globals.css
- **`text-size-adjust: 100%`** en html base
- **`overflow-x: hidden`** en body para prevenir scroll horizontal
- **Active states** (`active:scale-95`) en botones de navegación móvil
- **Minimum tap targets** (`min-h-[44px] min-w-[44px]`) en botones de topbar móvil
- **Prefers-reduced-motion** media query implementada
- **Z-index organizado** con jerarquía clara (9→20→30→40→50→60)

---

## PRIORIZACIÓN SUGERIDA PARA FIXES

### Sprint 1 — Impacto inmediato (resuelve zoom y viewport)

| Prioridad | Fix | Problemas que resuelve | Esfuerzo |
|-----------|-----|------------------------|----------|
| **P0** | Agregar `export const viewport` en `layout.tsx` con `width: 'device-width', initialScale: 1` | Z-01 | 5 min |
| **P0** | Agregar media query global en `globals.css` que fuerce `font-size: 16px` en inputs/selects/textareas en mobile (`@media (max-width: 767px)`) | Z-02, Z-03, Z-04, Z-24 y todos los Z-07 a Z-23 | 15 min |
| **P1** | Actualizar componentes base `input.tsx`, `select.tsx`, `textarea.tsx` con `text-base md:text-sm` | Z-02, Z-03, Z-04 | 15 min |
| **P1** | Agregar prefijos responsive a grids del Hub: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` | O-01, O-02, O-03 | 30 min |

### Sprint 2 — Optimización de recargas (resuelve lentitud)

| Prioridad | Fix | Problemas que resuelve | Esfuerzo |
|-----------|-----|------------------------|----------|
| **P1** | Implementar updates locales en `NoteItem.tsx`: actualizar estado local tras reacciones, ediciones, pins, deletes en vez de `ctx.fetchNotes()` | R-01 a R-05 | 2-3 hrs |
| **P1** | Implementar updates locales en `NotesSection.tsx` (legacy) | R-06 a R-09 | 1-2 hrs |
| **P2** | Reemplazar `router.refresh()` por state updates en CRM components | R-10 a R-19 | 4-6 hrs |

### Sprint 3 — Touch y hover (resuelve interacciones)

| Prioridad | Fix | Problemas que resuelve | Esfuerzo |
|-----------|-----|------------------------|----------|
| **P1** | Convertir flyout de sidebar a click/tap toggle en móvil | T-01 | 1-2 hrs |
| **P2** | Convertir tooltips hover-only a Popover con click en touch, usando `@media (hover: hover)` | T-02, T-03, T-04 | 2-3 hrs |
| **P2** | Hacer visibles acciones de notas en touch (quitar `opacity-0 group-hover:opacity-100` en móvil) | C-02 | 30 min |
| **P2** | Mejorar scroll lock en iOS con `position: fixed` pattern | T-08 a T-11 | 1 hr |

### Sprint 4 — Overflow y polish

| Prioridad | Fix | Problemas que resuelve | Esfuerzo |
|-----------|-----|------------------------|----------|
| **P2** | Agregar `max-w-[95vw]` o responsive widths a modales y dropdowns con ancho fijo > 320px | O-04 a O-08 | 2 hrs |
| **P3** | Agregar breakpoints responsive a selects y contenedores con width fijo | O-09 a O-15 | 1-2 hrs |
| **P3** | Agregar `@media (hover: hover)` wrapper global para estilos hover-only | C-01 | 1 hr |

---

## NOTAS TÉCNICAS

### Sobre el viewport meta tag (Z-01)
En Next.js 15, el viewport debe exportarse separadamente del metadata:
```typescript
// src/app/layout.tsx
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // NO agregar maximumScale: 1 ni userScalable: false (accesibilidad)
};
```

### Sobre el fix global de font-size (Z-24)
La solución más eficiente es un override global:
```css
/* globals.css */
@media (max-width: 767px) {
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  textarea,
  select {
    font-size: 16px !important;
  }
}
```
Esto resuelve Z-02 a Z-23 de un solo golpe sin modificar componentes individuales.

### Sobre las recargas del módulo de notas (R-01)
El flujo actual de reacción es:
```
Click emoji → POST /api/notes/{id}/reactions → ctx.fetchNotes() → GET 50 notas → Re-render completo
```
El flujo óptimo sería:
```
Click emoji → Optimistic update local → POST /api/notes/{id}/reactions → Confirm/rollback
```

---

*Fin del reporte. Este documento es solo de auditoría — no se modificó ningún archivo del proyecto.*
