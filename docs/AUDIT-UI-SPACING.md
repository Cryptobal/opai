# AUDITORÍA EXHAUSTIVA DE UI/SPACING — OPAI Suite

**Fecha:** 2026-02-26
**Objetivo:** Mapeo completo del stack, design system, componentes, módulos y problemas de spacing antes de refactorización global.
**Regla:** Este documento es solo diagnóstico. NO se modificó ningún archivo.

---

## PARTE 1: STACK TÉCNICO

### 1.1 Framework Principal

| Aspecto | Detalle |
|---------|---------|
| **Framework** | Next.js 15.4.11 (App Router) |
| **React** | 18.3.1 |
| **Lenguaje** | TypeScript 5.6.3 |
| **ORM** | Prisma 6.19.2 |
| **Auth** | NextAuth v5 (beta 30) |
| **Runtime** | Node.js |
| **Deployment** | Vercel |

### 1.2 Sistema de Estilos

| Aspecto | Detalle |
|---------|---------|
| **CSS Framework** | Tailwind CSS 3.4.17 |
| **Config** | `tailwind.config.js` (personalizado) |
| **Plugins** | `@tailwindcss/typography`, `@tailwindcss/forms`, `tailwindcss-animate` |
| **Utilities** | `tailwind-merge` 3.4.0, `clsx` 2.1.1, `class-variance-authority` 0.7.1 |
| **PostCSS** | `postcss` 8.4.31, `autoprefixer` 10.4.21 |
| **Variables CSS** | Sí, definidas en `src/styles/globals.css` (light + dark theme) |
| **Dark Mode** | Sí, via clase `.dark` (class-based) |

### 1.3 Librería de UI

| Aspecto | Detalle |
|---------|---------|
| **UI Base** | shadcn/ui (Radix UI primitives) |
| **Componentes Radix** | `alert-dialog`, `dialog`, `dropdown-menu`, `popover`, `select`, `slot` |
| **Iconos** | Lucide React 0.563.0 |
| **Animaciones** | Framer Motion 12.31.0 |
| **Charts** | Recharts 3.7.0 |
| **Toasts** | Sonner 2.0.7 |
| **Drag & Drop** | @dnd-kit 6.3.1 (core + sortable) |
| **Rich Text** | Tiptap 3.19.0 (con extensiones: tables, color, highlight, mentions, etc.) |
| **Command Menu** | cmdk 1.1.1 |

### 1.4 Estructura del Proyecto

```
src/
├── app/                          # Next.js App Router
│   ├── (app)/                    # Rutas protegidas (auth required)
│   │   ├── cpq/                  # Módulo CPQ (Configure-Price-Quote)
│   │   ├── crm/                  # Módulo CRM
│   │   ├── finanzas/             # Módulo Finanzas
│   │   ├── hub/                  # Dashboard principal
│   │   ├── opai/                 # Configuración, documentos, perfil
│   │   ├── ops/                  # Módulo Operaciones
│   │   ├── payroll/              # Módulo Payroll
│   │   ├── personas/             # Módulo Personas
│   │   ├── te/                   # Módulo Turnos Extra
│   │   └── layout.tsx            # Layout protegido (auth + permisos)
│   ├── (templates)/              # Rutas públicas de presentaciones
│   ├── api/                      # API Routes (~30 subdirectorios)
│   ├── marcar/                   # Marcación pública por QR
│   ├── opai/                     # Login, forgot/reset password
│   ├── portal/                   # Portal guardia
│   ├── postulacion/              # Postulación pública
│   ├── ronda/                    # Rondas públicas por código
│   └── layout.tsx                # Root layout
│
├── components/
│   ├── admin/                    # Dashboard admin (8 componentes)
│   ├── config/                   # Configuración (2 componentes)
│   ├── cpq/                      # CPQ (8 componentes)
│   ├── crm/                      # CRM (18 componentes)
│   ├── docs/                     # Documentos/firmas (14 componentes)
│   ├── finance/                  # Finanzas (16 componentes)
│   ├── inventario/               # Inventario (8 componentes)
│   ├── layout/                   # Layout presentaciones (2 componentes)
│   ├── opai/                     # Componentes core OPAI (38 componentes)
│   ├── ops/                      # Operaciones (15+ componentes)
│   │   ├── guard-contracts/      # Contratos guardia
│   │   ├── guard-events/         # Eventos laborales
│   │   ├── rondas/               # Rondas (7 componentes)
│   │   └── tickets/              # Tickets
│   ├── payroll/                  # Payroll (componentes)
│   ├── pdf/                      # Generación PDF
│   ├── perfil/                   # Perfil usuario
│   ├── portal/                   # Portal público
│   ├── presentation/             # Presentaciones comerciales
│   │   ├── sections/             # Secciones de presentación
│   │   └── shared/               # Componentes compartidos (12)
│   ├── preview/                  # Preview de templates
│   ├── public/                   # Componentes públicos
│   ├── search/                   # Búsqueda global
│   ├── shared/                   # Componentes compartidos (5)
│   ├── supervision/              # Supervisión
│   ├── ui/                       # shadcn/ui primitives (17 componentes)
│   └── usuarios/                 # Gestión usuarios
│
├── emails/                       # Templates React Email
├── lib/                          # Utilidades, auth, prisma, permisos
│   ├── ai/                       # Integración OpenAI
│   ├── docs/                     # Utilidades documentos
│   ├── ops/                      # Utilidades operaciones
│   ├── payroll/                  # Motor payroll
│   ├── rondas/                   # Utilidades rondas
│   └── validations/              # Validaciones Zod
├── modules/                      # Módulos de dominio
│   ├── cpq/costing/              # Costeo CPQ
│   ├── finance/                  # Finanzas (accounting, banking, billing, payables)
│   └── payroll/engine/           # Motor de cálculo payroll
├── styles/
│   └── globals.css               # CSS global + custom properties
└── types/                        # Tipos TypeScript
```

**Dónde están los componentes compartidos/reutilizables:**
- `src/components/ui/` — 17 shadcn/ui primitives
- `src/components/opai/` — 38 componentes OPAI (PageHeader, KpiCard, SectionNav, DetailLayout, AppShell, etc.)
- `src/components/shared/` — 5 componentes (ListToolbar, FilterPills, SortSelect, ViewToggle, PuestoFormModal)
- `src/components/crm/` — Componentes reutilizados por otros módulos (CollapsibleSection, DetailField, CrmDetailLayout)

**Dónde están las vistas/páginas:**
- Cada módulo en `src/app/(app)/[modulo]/` con Next.js file-based routing

**Carpeta de estilos globales:**
- `src/styles/globals.css` (único archivo CSS, 260 líneas)

---

## PARTE 2: DESIGN SYSTEM ACTUAL

### 2.1 Colores

#### CSS Custom Properties — Light Theme (`:root` en `src/styles/globals.css:8-63`)

| Token | HSL | Hex Aprox. | Uso |
|-------|-----|-----------|-----|
| `--background` | `0 0% 99%` | `#fcfcfc` | Fondo principal (warm off-white) |
| `--foreground` | `220 20% 10%` | `#151a23` | Texto principal |
| `--card` | `0 0% 100%` | `#ffffff` | Fondo de cards |
| `--card-foreground` | `220 20% 10%` | `#151a23` | Texto en cards |
| `--popover` | `0 0% 100%` | `#ffffff` | Fondo popovers |
| `--popover-foreground` | `220 20% 10%` | `#151a23` | Texto popovers |
| `--border` | `220 13% 87%` | `#d9dde4` | Bordes |
| `--input` | `220 13% 85%` | `#d3d8e0` | Borde inputs |
| `--muted` | `220 14% 96%` | `#f2f4f7` | Background muted |
| `--muted-foreground` | `215 16% 43%` | `#5c6b82` | Texto secundario/disabled |
| `--accent` | `220 14% 93%` | `#ebeef3` | Hover/active states |
| `--accent-foreground` | `220 20% 10%` | `#151a23` | Texto en accent |
| `--primary` | `166 76% 40%` | `#189a79` | **Color primario (Teal)** |
| `--primary-foreground` | `0 0% 100%` | `#ffffff` | Texto sobre primary |
| `--secondary` | `220 14% 93%` | `#ebeef3` | Acción secundaria |
| `--secondary-foreground` | `220 20% 10%` | `#151a23` | Texto secundario |
| `--destructive` | `0 72% 51%` | `#dc2626` | **Rojo destructivo** |
| `--destructive-foreground` | `0 0% 100%` | `#ffffff` | Texto sobre destructive |
| `--ring` | `166 76% 40%` | `#189a79` | Focus ring (= primary) |
| `--radius` | `0.5rem` | — | Border radius base |
| `--chart-1` | `166 76% 40%` | — | Teal (gráficos) |
| `--chart-2` | `217 91% 50%` | — | Blue |
| `--chart-3` | `142 71% 38%` | — | Green |
| `--chart-4` | `38 92% 45%` | — | Amber |
| `--chart-5` | `340 82% 45%` | — | Pink |

#### CSS Custom Properties — Dark Theme (`.dark` en `src/styles/globals.css:65-116`)

| Token | HSL | Hex Aprox. |
|-------|-----|-----------|
| `--background` | `220 20% 6%` | `#0d1017` |
| `--foreground` | `210 40% 98%` | `#f8fafc` |
| `--card` | `220 18% 10%` | `#151a23` |
| `--border` | `220 13% 18%` | `#262d3a` |
| `--input` | `220 13% 20%` | `#2b3341` |
| `--muted` | `220 13% 15%` | `#212735` |
| `--muted-foreground` | `215 16% 57%` | `#8493a8` |
| `--accent` | `220 13% 17%` | `#252c38` |
| `--primary` | `166 76% 47%` | `#1db990` |
| `--primary-foreground` | `220 20% 6%` | `#0d1017` |
| `--secondary` | `220 13% 18%` | `#262d3a` |
| `--destructive` | `0 72% 51%` | `#dc2626` |
| `--ring` | `166 76% 47%` | `#1db990` |

#### GARD Brand Colors (solo templates/emails, `tailwind.config.js:60-90`)

| Token | Valor | Uso |
|-------|-------|-----|
| `gard.blue.500` | `#0056e0` | Azul principal GARD |
| `gard.teal.500` | `#00d4aa` | Teal acento |
| `premium.dark` | `#0a0e17` | Premium backgrounds |
| `premium.darker` | `#050810` | Premium más oscuro |
| `premium.light` | `#1a1f2e` | Premium claro |

#### Colores de Variante KPI (`src/components/opai/KpiCard.tsx:54-85`)

| Variante | Background | Icon BG | Text |
|----------|------------|---------|------|
| `default` | `border-border bg-card` | `bg-muted` | `text-foreground` |
| `blue` | `border-blue-500/25 bg-blue-500/10` | `bg-blue-500/15 text-blue-400` | `text-blue-400` |
| `emerald` | `border-emerald-500/25 bg-emerald-500/10` | `bg-emerald-500/15 text-emerald-400` | `text-emerald-400` |
| `purple` | `border-purple-500/25 bg-purple-500/10` | `bg-purple-500/15 text-purple-400` | `text-purple-400` |
| `amber` | `border-amber-500/25 bg-amber-500/10` | `bg-amber-500/15 text-amber-400` | `text-amber-400` |
| `indigo` | `border-indigo-500/25 bg-indigo-500/10` | `bg-indigo-500/15 text-indigo-400` | `text-indigo-400` |
| `sky` | `border-sky-500/25 bg-sky-500/10` | `bg-sky-500/15 text-sky-400` | `text-sky-400` |
| `teal` | `border-primary/25 bg-primary/10` | `bg-primary/15 text-primary` | `text-primary` |

### 2.2 Tipografía

| Aspecto | Detalle | Archivo |
|---------|---------|---------|
| **Fuente principal** | Inter Variable | `@fontsource-variable/inter` importada en `globals.css:1` |
| **Fuente mono** | JetBrains Mono / Fira Code | `tailwind.config.js:99` |
| **Font features** | `cv02`, `cv03`, `cv04`, `cv11` | `globals.css:133` |
| **Rendering** | Antialiased | `globals.css:136-137` |

#### Escala Tipográfica (documentada en `PageHeader.tsx:19-26`)

| Nivel | Tailwind | Tamaño | Uso |
|-------|----------|--------|-----|
| H1 (page) | `text-xl font-semibold` | 20px | PageHeader título |
| H2 (card) | `text-base font-semibold` | 16px | CardTitle |
| H3 (section) | `text-sm font-semibold` | 14px | Secciones internas |
| Body | `text-sm` | 14px | Texto principal |
| Caption | `text-xs` | 12px | Labels, metadata |
| Micro | `text-[11px]` | 11px | Badges, bottom nav |

#### Font Weights

| Weight | Tailwind | Uso |
|--------|----------|-----|
| 400 | `font-normal` | Texto body |
| 500 | `font-medium` | Texto enfatizado |
| 600 | `font-semibold` | Subtítulos, títulos |
| 700 | `font-bold` | Headings (raro) |

### 2.3 Spacing

#### Escala de Spacing (Tailwind estándar, no hay custom en tailwind.config)

NO hay una escala custom de spacing en `tailwind.config.js`. Se usa la escala estándar de Tailwind (4px base).

#### Convenciones de spacing documentadas

| Gap | Uso documentado |
|-----|----------------|
| `gap-4` (16px) | Spacing interno de componentes |
| `gap-6` (24px) | Entre grupos de elementos |
| `gap-8` (32px) | Entre secciones dentro de una página |
| `gap-12` (48px) | Entre secciones principales |

#### Padding del contenido principal (`AppShell.tsx:214`)

```
Mobile:     px-4 py-6         (16px × 24px)
sm:         px-6              (24px)
lg:         px-8              (32px)
xl:         px-10             (40px)
2xl:        px-12             (48px)
Bottom:     pb-24 lg:pb-6     (96px mobile para bottom nav, 24px desktop)
```

#### Border Radius (`tailwind.config.js:92-96`)

| Token | Valor |
|-------|-------|
| `lg` | `var(--radius)` = `0.5rem` (8px) |
| `md` | `calc(var(--radius) - 2px)` = 6px |
| `sm` | `calc(var(--radius) - 4px)` = 4px |

### 2.4 Componentes Compartidos que Ya Existen

#### UI Primitives (`src/components/ui/`, 17 componentes)

| Componente | Archivo | Props principales | Descripción | Imports |
|------------|---------|-------------------|-------------|---------|
| **Button** | `ui/button.tsx` | `variant` (6), `size` (4), `asChild` | Botón con CVA variants | ~158 |
| **Card** | `ui/card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter | Container con header/content/footer. Padding: `p-4 sm:p-5` | ~98 |
| **Input** | `ui/input.tsx` | HTMLInputAttributes | Input de texto | ~95 |
| **Label** | `ui/label.tsx` | HTMLLabelAttributes | Label de formulario | ~79 |
| **Badge** | `ui/badge.tsx` | `variant` (6: default, secondary, destructive, outline, success, warning) | Badge/tag | ~77 |
| **Dialog** | `ui/dialog.tsx` | Dialog, Trigger, Content, Header, Footer, Title, Description | Modal (bottom sheet en mobile) | ~66 |
| **Select** | `ui/select.tsx` | Select, Trigger, Content, Item, Group, Separator | Dropdown select | ~32 |
| **DropdownMenu** | `ui/dropdown-menu.tsx` | Menu completo con items, checkboxes, radios, separators | Menú contextual | ~17 |
| **ConfirmDialog** | `ui/confirm-dialog.tsx` | `open`, `title`, `description`, `onConfirm`, `variant`, `loading` | Diálogo de confirmación | ~14 |
| **Sheet** | `ui/sheet.tsx` | `side` (4 lados), Content, Header, Footer | Panel lateral | ~2 |
| **Popover** | `ui/popover.tsx` | Trigger, Content, Anchor | Panel flotante | ~0 |
| **Textarea** | `ui/textarea.tsx` | HTMLTextareaAttributes | Textarea | ~4 |
| **Toaster** | `ui/toaster.tsx` | (global) | Host de notificaciones toast | global |
| **AddressAutocomplete** | `ui/AddressAutocomplete.tsx` | `value`, `onChange`, `showMap` | Google Places + mapa | ~12 |
| **SearchableSelect** | `ui/SearchableSelect.tsx` | `value`, `options`, `onChange` | Select con búsqueda | ~1 |
| **MapCoordinatePicker** | `ui/MapCoordinatePicker.tsx` | `lat`, `lng`, `onChange` | Selector de coordenadas | ~1 |
| **MapsUrlPasteInput** | `ui/MapsUrlPasteInput.tsx` | `onResolve` | Pegar URL de Google Maps | ~5 |

#### Componentes OPAI Core (`src/components/opai/`, exportados en `index.ts`)

| Componente | Archivo | Props principales | Descripción |
|------------|---------|-------------------|-------------|
| **AppShell** | `opai/AppShell.tsx` | `sidebar`, `children`, `userName`, `userRole` | Layout principal (sidebar + content + mobile) |
| **AppSidebar** | `opai/AppSidebar.tsx` | `navItems`, `userName`, `isSidebarOpen` | Sidebar con navegación multinivel, flyout, accordion |
| **PageHeader** | `opai/PageHeader.tsx` | `title`, `description`, `actions`, `backHref`, `backLabel` | Encabezado estándar de página |
| **KpiCard** | `opai/KpiCard.tsx` | `title`, `value`, `icon`, `trend`, `variant` (8), `size` | Card para métricas/KPIs |
| **SectionNav** | `opai/SectionNav.tsx` | `sections[]`, `onSectionClick`, `extraAction` | Tabs horizontales sticky con intersection observer |
| **DetailLayout** | `opai/DetailLayout.tsx` | `header`, `sections[]`, `pageType`, `fixedSectionKey` | Layout de detalle con secciones colapsables y reordenables (DnD) |
| **EmptyState** | `opai/EmptyState.tsx` | `icon`, `title`, `description`, `action`, `compact` | Estado vacío estándar |
| **LoadingState** | `opai/LoadingState.tsx` | (loading indicator) | Indicador de carga |
| **StatusBadge** | `opai/StatusBadge.tsx` | `status` (24 estados mapeados) | Badge con mapping automático de estados |
| **Breadcrumb** | `opai/Breadcrumb.tsx` | `items[]` ({label, href}) | Navegación contextual |
| **Avatar** | `opai/Avatar.tsx` | — | Avatar de usuario |
| **Stepper** | `opai/Stepper.tsx` | — | Stepper de pasos |
| **SubNav** | `opai/SubNav.tsx` | — | Sub-navegación |
| **BottomNav** | `opai/BottomNav.tsx` | `userRole` | Navegación inferior mobile |
| **CommandPalette** | `opai/CommandPalette.tsx` | `userRole` | Paleta de comandos (Cmd+K) |
| **ThemeProvider** | `opai/ThemeProvider.tsx` | — | Provider de tema light/dark |
| **ThemeToggle** | `opai/ThemeToggle.tsx` | `compact` | Toggle light/dark |
| **NotificationBell** | `opai/NotificationBell.tsx` | `compact` | Campana de notificaciones |
| **TopbarActions** | `opai/TopbarActions.tsx` | `userName`, `userEmail`, `userRole` | Acciones del topbar desktop |
| **ConfigBackLink** | `opai/ConfigBackLink.tsx` | — | Link "volver" en configuración |
| **GlobalIndicators** | `opai/GlobalIndicators.tsx` | — | Indicadores globales |

#### Componentes Shared (`src/components/shared/`)

| Componente | Archivo | Props principales | Descripción |
|------------|---------|-------------------|-------------|
| **ListToolbar** | `shared/ListToolbar.tsx` | `search`, `filters`, `sortOptions`, `viewModes`, `actionSlot` | Toolbar completo: búsqueda + filtros + sort + vista |
| **FilterPills** | `shared/FilterPills.tsx` | `options[]`, `active`, `onChange` | Pills de filtro (horizontal en desktop, select en mobile) |
| **SortSelect** | `shared/SortSelect.tsx` | `options[]`, `active`, `onChange` | Select de ordenamiento |
| **ViewToggle** | `shared/ViewToggle.tsx` | `modes[]`, `view`, `onChange` | Toggle list/cards/kanban |
| **PuestoFormModal** | `shared/PuestoFormModal.tsx` | (formulario complejo) | Modal para crear/editar puestos operativos |

#### Componentes CRM reutilizados por otros módulos

| Componente | Archivo | Descripción | Usado por |
|------------|---------|-------------|-----------|
| **CollapsibleSection** | `crm/CollapsibleSection.tsx` | Sección colapsable con Card + Framer Motion | Personas, CRM, Instalaciones |
| **CrmDetailLayout** | `crm/CrmDetailLayout.tsx` | Wrapper para páginas de detalle con secciones | Personas, CRM entities |
| **CrmRecordHeader** | `crm/CrmRecordHeader.tsx` | Header sticky con título, badge, acciones | Personas, CRM entities |
| **DetailField** | `crm/DetailField.tsx` | Campo label:valor con grid | Personas, CRM entities |
| **NotesSection** | `crm/NotesSection.tsx` | Sección de notas/comentarios con @mentions | Personas, CRM, Instalaciones |

---

## PARTE 3: MAPEO COMPLETO DE MÓDULOS Y VISTAS

### MÓDULO: Hub (Dashboard)

**Ruta base:** `/hub`
**Archivos principales:** `src/app/(app)/hub/page.tsx`, `src/app/(app)/hub/_components/`

**Vistas/Páginas:**

| Vista | Ruta | Archivo | Componentes |
|-------|------|---------|-------------|
| Hub Dashboard | `/hub` | `hub/page.tsx` | `HubClientWrapper`, `HubExecutiveSnapshot`, `HubDocsSection`, `SupervisorHub` |

- Tiene cards/cajas: Sí (KPIs, módulos)
- Tiene tablas: No directamente, delega a componentes hijos
- Tiene KPIs: Sí (executive snapshot)
- PROBLEMAS: Se delega todo a componentes client; necesita auditoría individual de cada sub-componente

---

### MÓDULO: CRM (Comercial)

**Ruta base:** `/crm`
**Archivos principales:** `src/app/(app)/crm/`, `src/components/crm/`

**Vistas/Páginas:**

| Vista | Ruta | Archivo | Componentes |
|-------|------|---------|-------------|
| CRM Dashboard | `/crm` | `crm/page.tsx` | PageHeader, KPI divs custom, CrmDashboardCharts |
| Leads - Lista | `/crm/leads` | `crm/leads/page.tsx` | PageHeader, CrmLeadsClient (ListToolbar) |
| Lead - Detalle | `/crm/leads/[id]` | `crm/leads/[id]/page.tsx` | CrmDetailLayout, CrmLeadDetailClient |
| Cuentas - Lista | `/crm/accounts` | `crm/accounts/page.tsx` | PageHeader, CrmAccountsClient |
| Cuenta - Detalle | `/crm/accounts/[id]` | `crm/accounts/[id]/page.tsx` | CrmDetailLayout, CrmAccountDetailClient |
| Contactos - Lista | `/crm/contacts` | `crm/contacts/page.tsx` | PageHeader, CrmContactsClient |
| Contacto - Detalle | `/crm/contacts/[id]` | `crm/contacts/[id]/page.tsx` | CrmDetailLayout, CrmContactDetailClient |
| Instalaciones - Lista | `/crm/installations` | `crm/installations/page.tsx` | PageHeader, CrmInstallationsClient |
| Instalación - Detalle | `/crm/installations/[id]` | `crm/installations/[id]/page.tsx` | CrmDetailLayout, CrmInstallationDetailClient |
| Negocios - Lista | `/crm/deals` | `crm/deals/page.tsx` | PageHeader, CrmDealsClient |
| Negocio - Detalle | `/crm/deals/[id]` | `crm/deals/[id]/page.tsx` | CrmDetailLayout, CrmDealDetailClient |
| Cotizaciones - Lista | `/crm/cotizaciones` | `crm/cotizaciones/page.tsx` | PageHeader, CrmCotizacionesClient |
| Cotización - Detalle | `/crm/cotizaciones/[id]` | `crm/cotizaciones/[id]/page.tsx` | CrmDetailLayout |

**PROBLEMAS DETECTADOS:**
1. **CRM Dashboard (`/crm`):** KPIs usan `<div>` custom con `p-4 rounded-xl border` en lugar del componente `KpiCard` estandarizado → inconsistente con el resto de la app
2. **Chart cards:** CardHeader con `pb-2` + CardContent con `pt-0` crea spacing muy ajustado entre título y gráfico
3. Las vistas de lista usan ListToolbar consistentemente (bien)
4. Las vistas de detalle usan CrmDetailLayout → CollapsibleSection → spacing consistente internamente

---

### MÓDULO: Operaciones

**Ruta base:** `/ops`
**Archivos principales:** `src/app/(app)/ops/`, `src/components/ops/`

**Vistas/Páginas:**

| Vista | Ruta | Archivo | Componentes |
|-------|------|---------|-------------|
| Ops Dashboard | `/ops` | `ops/page.tsx` | PageHeader, OpsGlobalSearch, Card (KPIs custom), Card (módulos) |
| Pauta Mensual | `/ops/pauta-mensual` | `ops/pauta-mensual/page.tsx` | PageHeader, OpsPautaMensualClient |
| Pauta Diaria | `/ops/pauta-diaria` | `ops/pauta-diaria/page.tsx` | PageHeader, OpsPautaDiariaClient |
| Turnos Extra | `/ops/turnos-extra` | `ops/turnos-extra/page.tsx` | PageHeader, TeTurnosClient |
| Refuerzos | `/ops/refuerzos` | `ops/refuerzos/page.tsx` | PageHeader, OpsRefuerzosClient |
| Marcaciones | `/ops/marcaciones` | `ops/marcaciones/page.tsx` | PageHeader, OpsMarcacionesClient |
| PPC | `/ops/ppc` | `ops/ppc/page.tsx` | PageHeader, OpsPpcClient |
| Puestos | `/ops/puestos` | `ops/puestos/page.tsx` | Redirect a `/crm/installations` |
| Rondas - Dashboard | `/ops/rondas` | `ops/rondas/page.tsx` | RondasDashboardClient |
| Rondas - Monitoreo | `/ops/rondas/monitoreo` | `ops/rondas/monitoreo/page.tsx` | RondasMonitoreoClient |
| Rondas - Alertas | `/ops/rondas/alertas` | `ops/rondas/alertas/page.tsx` | RondasAlertasClient |
| Rondas - Checkpoints | `/ops/rondas/checkpoints` | `ops/rondas/checkpoints/page.tsx` | RondasCheckpointsClient |
| Rondas - Templates | `/ops/rondas/templates` | `ops/rondas/templates/page.tsx` | RondasTemplatesClient |
| Rondas - Programación | `/ops/rondas/programacion` | `ops/rondas/programacion/page.tsx` | RondasProgramacionClient |
| Rondas - Reportes | `/ops/rondas/reportes` | `ops/rondas/reportes/page.tsx` | RondasReportesClient |
| Control Nocturno - Lista | `/ops/control-nocturno` | `ops/control-nocturno/page.tsx` | OpsControlNocturnoListClient |
| Control Nocturno - Detalle | `/ops/control-nocturno/[id]` | `ops/control-nocturno/[id]/page.tsx` | OpsControlNocturnoDetailClient |
| Control Nocturno - KPIs | `/ops/control-nocturno/kpis` | `ops/control-nocturno/kpis/page.tsx` | ControlNocturnoKpisClient |
| Tickets - Lista | `/ops/tickets` | `ops/tickets/page.tsx` | TicketsClient |
| Tickets - Detalle | `/ops/tickets/[id]` | `ops/tickets/[id]/page.tsx` | TicketDetailClient |
| Inventario - Dashboard | `/ops/inventario` | `ops/inventario/page.tsx` | InventarioKpisCard, Cards módulo |
| Inventario - Productos | `/ops/inventario/productos` | `ops/inventario/productos/page.tsx` | InventarioProductosClient |
| Inventario - Producto detalle | `/ops/inventario/productos/[id]` | `ops/inventario/productos/[id]/page.tsx` | InventarioProductoSizesClient |
| Inventario - Bodegas | `/ops/inventario/bodegas` | `ops/inventario/bodegas/page.tsx` | InventarioBodegasClient |
| Inventario - Compras | `/ops/inventario/compras` | `ops/inventario/compras/page.tsx` | InventarioComprasClient |
| Inventario - Entregas | `/ops/inventario/entregas` | `ops/inventario/entregas/page.tsx` | InventarioEntregasClient |
| Inventario - Stock | `/ops/inventario/stock` | `ops/inventario/stock/page.tsx` | InventarioStockClient |
| Inventario - Activos | `/ops/inventario/activos` | `ops/inventario/activos/page.tsx` | InventarioActivosClient |
| Supervisión - Dashboard | `/ops/supervision` | `ops/supervision/page.tsx` | SupervisionDashboardClient |
| Supervisión - Detalle | `/ops/supervision/[id]` | `ops/supervision/[id]/page.tsx` | VisitaDetailActions |
| Supervisión - Mis Visitas | `/ops/supervision/mis-visitas` | `ops/supervision/mis-visitas/page.tsx` | SupervisorMisVisitasClient |
| Supervisión - Nueva Visita | `/ops/supervision/nueva-visita` | `ops/supervision/nueva-visita/page.tsx` | NuevaVisitaClient |
| Supervisión - Reportes | `/ops/supervision/reportes` | `ops/supervision/reportes/page.tsx` | SupervisionReportesClient |
| Supervisión - Asignaciones | `/ops/supervision/asignaciones` | `ops/supervision/asignaciones/page.tsx` | SupervisorAssignmentsClient |

**PROBLEMAS DETECTADOS:**

1. **Ops Dashboard (`/ops`):** KPIs usan Card + CardContent con override `pt-4 pb-3` en vez del componente `KpiCard` estándar
2. **Pauta Mensual:** Usa `-mt-4 space-y-3` (margen negativo) y `mb-1` custom en PageHeader → lucha contra el spacing padre
3. **Refuerzos:** Card stats grid usa `grid-cols-3 gap-2 text-xs` — padding inconsistente con KpiCard
4. **Marcaciones:** Filtros con `px-4 pb-4 pt-0` — asimétrico
5. **Tables en Rondas:** Celdas con `px-3 py-2` — consistente internamente pero diferente al patrón de otras tablas
6. **Ops Dashboard módulo cards:** `pt-5` en CardContent → diferente al `pt-4 pb-3` de los KPIs en la misma página

---

### MÓDULO: Personas

**Ruta base:** `/personas`
**Archivos principales:** `src/app/(app)/personas/`, `src/components/ops/GuardiaDetailClient.tsx`

**Vistas/Páginas:**

| Vista | Ruta | Archivo |
|-------|------|---------|
| Redirect | `/personas` | `personas/page.tsx` → redirect a `/personas/guardias` |
| Lista de Guardias | `/personas/guardias` | `personas/guardias/page.tsx` |
| Ficha de Persona | `/personas/guardias/[id]` | `personas/guardias/[id]/page.tsx` |
| Sueldos por RUT | `/personas/guardias/sueldos-rut` | `personas/guardias/sueldos-rut/page.tsx` |
| Ingreso TE | `/personas/guardias/ingreso-te` | `personas/guardias/ingreso-te/page.tsx` |

**PROBLEMAS DETECTADOS:**
1. La lista usa ListToolbar + grid cards/list view — generalmente bien
2. La ficha de detalle es extremadamente larga (2,652 líneas en `GuardiaDetailClient.tsx`) — ver Parte 4

---

### MÓDULO: Payroll

**Ruta base:** `/payroll`
**Archivos principales:** `src/app/(app)/payroll/`

**Vistas/Páginas:**

| Vista | Ruta | Archivo |
|-------|------|---------|
| Payroll Dashboard | `/payroll` | `payroll/page.tsx` |
| Períodos | `/payroll/periodos` | `payroll/periodos/page.tsx` |
| Período Detalle | `/payroll/periodos/[id]` | `payroll/periodos/[id]/page.tsx` |
| Anticipos | `/payroll/anticipos` | `payroll/anticipos/page.tsx` |
| Simulador | `/payroll/simulator` | `payroll/simulator/page.tsx` |
| Parámetros | `/payroll/parameters` | `payroll/parameters/page.tsx` |

**PROBLEMAS DETECTADOS:**
1. Dashboard usa `pt-5` en CardContent para módulo cards + `p-4` en info card → inconsistente

---

### MÓDULO: Finanzas

**Ruta base:** `/finanzas`
**Archivos principales:** `src/app/(app)/finanzas/`, `src/components/finance/`

**Vistas/Páginas:**

| Vista | Ruta | Archivo |
|-------|------|---------|
| Finanzas Dashboard | `/finanzas` | `finanzas/page.tsx` |
| Rendiciones - Lista | `/finanzas/rendiciones` | `finanzas/rendiciones/page.tsx` |
| Rendición - Detalle | `/finanzas/rendiciones/[id]` | `finanzas/rendiciones/[id]/page.tsx` |
| Nueva Rendición | `/finanzas/rendiciones/nueva` | `finanzas/rendiciones/nueva/page.tsx` |
| Aprobaciones | `/finanzas/aprobaciones` | `finanzas/aprobaciones/page.tsx` |
| Pagos | `/finanzas/pagos` | `finanzas/pagos/page.tsx` |
| Facturación | `/finanzas/facturacion` | `finanzas/facturacion/page.tsx` |
| Emitir DTE | `/finanzas/facturacion/emitir` | `finanzas/facturacion/emitir/page.tsx` |
| Notas de Crédito | `/finanzas/facturacion/notas/credito` | `finanzas/facturacion/notas/credito/page.tsx` |
| Notas de Débito | `/finanzas/facturacion/notas/debito` | `finanzas/facturacion/notas/debito/page.tsx` |
| Proveedores | `/finanzas/proveedores` | `finanzas/proveedores/page.tsx` |
| Pagos Proveedores | `/finanzas/pagos-proveedores` | `finanzas/pagos-proveedores/page.tsx` |
| Bancos | `/finanzas/bancos` | `finanzas/bancos/page.tsx` |
| Conciliación | `/finanzas/conciliacion` | `finanzas/conciliacion/page.tsx` |
| Contabilidad | `/finanzas/contabilidad` | `finanzas/contabilidad/page.tsx` |
| Nuevo Asiento | `/finanzas/contabilidad/asientos/nuevo` | `finanzas/contabilidad/asientos/nuevo/page.tsx` |
| Reportes | `/finanzas/reportes` | `finanzas/reportes/page.tsx` |

**PROBLEMAS DETECTADOS:**
1. Dashboard: info card usa `p-4` directo en Card, módulo cards usan `pt-5` en CardContent → inconsistente
2. Mismo patrón que Payroll dashboard

---

### MÓDULO: Documentos

**Ruta base:** `/opai/inicio`, `/opai/documentos`
**Archivos principales:** `src/app/(app)/opai/`, `src/components/docs/`, `src/components/opai/Documentos*`

**Vistas/Páginas:**

| Vista | Ruta | Archivo |
|-------|------|---------|
| Envíos (Docs Home) | `/opai/inicio` | `opai/inicio/page.tsx` |
| Gestión Documentos | `/opai/documentos` | `opai/documentos/page.tsx` |
| Documento Detalle | `/opai/documentos/[id]` | `opai/documentos/[id]/page.tsx` |
| Nuevo Documento | `/opai/documentos/nuevo` | `opai/documentos/nuevo/page.tsx` |
| Templates | `/opai/documentos/templates` | `opai/documentos/templates/page.tsx` |
| Template Detalle | `/opai/documentos/templates/[id]` | `opai/documentos/templates/[id]/page.tsx` |
| Nuevo Template | `/opai/documentos/templates/nuevo` | `opai/documentos/templates/nuevo/page.tsx` |

---

### MÓDULO: CPQ

**Ruta base:** `/cpq`

| Vista | Ruta | Archivo |
|-------|------|---------|
| CPQ Dashboard | `/cpq` | `cpq/page.tsx` |
| CPQ Detalle | `/cpq/[id]` | `cpq/[id]/page.tsx` |
| CPQ Config | `/cpq/config` | `cpq/config/page.tsx` |

---

### MÓDULO: TE (Turnos Extra gestionados)

**Ruta base:** `/te`

| Vista | Ruta | Archivo |
|-------|------|---------|
| TE Dashboard | `/te` | `te/page.tsx` |
| Registro | `/te/registro` | `te/registro/page.tsx` |
| Lotes | `/te/lotes` | `te/lotes/page.tsx` |
| Aprobaciones | `/te/aprobaciones` | `te/aprobaciones/page.tsx` |
| Pagos | `/te/pagos` | `te/pagos/page.tsx` |

---

### MÓDULO: Configuración

**Ruta base:** `/opai/configuracion`

| Vista | Ruta |
|-------|------|
| Config Home | `/opai/configuracion` |
| Empresa | `/opai/configuracion/empresa` |
| Usuarios | `/opai/configuracion/usuarios` |
| Roles | `/opai/configuracion/roles` |
| Grupos | `/opai/configuracion/grupos` |
| Integraciones | `/opai/configuracion/integraciones` |
| Notificaciones | `/opai/configuracion/notificaciones` |
| Asistente IA | `/opai/configuracion/asistente-ia` |
| Auditoría | `/opai/configuracion/auditoria` |
| Firmas | `/opai/configuracion/firmas` |
| Categorías Plantillas | `/opai/configuracion/categorias-plantillas` |
| Email Templates | `/opai/configuracion/email-templates` |
| CRM Config | `/opai/configuracion/crm` |
| CPQ Config | `/opai/configuracion/cpq` |
| Payroll Config | `/opai/configuracion/payroll` |
| Ops Config | `/opai/configuracion/ops` |
| Tipos Ticket | `/opai/configuracion/tipos-ticket` |
| Finanzas Config | `/opai/configuracion/finanzas` |

---

### MÓDULO: Notificaciones / Perfil

| Vista | Ruta |
|-------|------|
| Notificaciones | `/opai/notificaciones` |
| Perfil | `/opai/perfil` |
| Preferencias Notif. | `/opai/perfil/notificaciones` |

---

## PARTE 4: DETALLE DEL MÓDULO PERSONAS

### 4.1 Ficha de Persona (Vista de detalle)

**Archivo principal:** `src/components/ops/GuardiaDetailClient.tsx` (2,652 líneas)
**Layout usado:** `CrmDetailLayout` → `DetailLayout` → `SectionNav` + `CollapsibleSection`

#### Todas las secciones (17-19 según permisos)

| # | Key | Label | Tipo | Componente | Campos/Info |
|---|-----|-------|------|------------|-------------|
| 1 | `datos` | Datos personales | **FIJA** (siempre abierta, no colapsable) | Inline JSX | Identificación, Contacto, Previsional, Laboral, Bancarios, Domicilio |
| 2 | `asignacion` | Asignación | Colapsable | Inline JSX | Asignación actual (puesto, instalación, turno), historial de asignaciones |
| 3 | `uniformes` | Uniformes asignados | **Condicional** (si tiene acceso inventario) | `InventarioGuardiaAssignmentsSection` | Uniformes/equipamiento entregado |
| 4 | `marcacion` | Marcación de asistencia | Colapsable | Inline JSX | PIN de marcación, estado, botón reset |
| 5 | `rondas` | Marcación de rondas | Colapsable | Inline JSX | Link móvil para rondas, QR code |
| 6 | `contratos` | Contratos | Colapsable | `GuardContractsTab` | Tipo contrato, períodos, fechas, documentos vinculados |
| 7 | `estructura-sueldo` | Estructura de sueldo | Colapsable | `GuardiaSalaryTab` | Base, colación, movilización, gratificación, bonos |
| 8 | `liquidaciones` | Liquidaciones | Colapsable | `GuardiaLiquidacionesTab` | Liquidaciones por período (API lazy load) |
| 9 | `eventos-laborales` | Eventos laborales | Colapsable | `GuardEventsTab` | Vacaciones, licencias, amonestaciones |
| 10 | `documentos` | Ficha de documentos | Colapsable | Inline JSX | Upload, listado docs (antecedentes, OS-10, cédula, CV, etc.) |
| 11 | `docs-vinculados` | Documentos vinculados (Docs) | Colapsable | Inline JSX | Documentos del módulo Docs vinculados |
| 12 | `communication` | Comunicación con guardia | Colapsable | Inline JSX | Envío email/WhatsApp, historial comunicaciones |
| 13 | `comentarios` | Comentarios internos | Colapsable | `NotesSection` | Notas internas con @mentions |
| 14 | `dias-trabajados` | Días trabajados | Colapsable | Inline JSX | Resumen mensual + tabla detallada (últimos 12 meses) |
| 15 | `turnos-extra` | Turnos extra | Colapsable | Inline JSX | Tabla de turnos extra con estado/monto |
| 16 | `rendiciones` | Rendiciones de gastos | **Condicional** (si persona es admin) | `PersonaRendicionesTab` | Rendiciones vinculadas |
| 17 | `historial` | Historial del guardia | Colapsable | Inline JSX | Timeline de eventos históricos |

#### Cómo se navegan las secciones

- **Mecanismo:** Tabs horizontales sticky (`SectionNav`)
- **Componente:** `src/components/opai/SectionNav.tsx`
- **Posición:** `sticky top-[113px]` (debajo del header + topbar desktop)
- **Comportamiento:** Intersection Observer trackea qué sección es visible. Click en tab → smooth scroll + auto-expand sección
- **Overflow:** Menú dropdown "..." cuando hay muchas secciones y no caben horizontalmente
- **Extra:** Botón "Restablecer orden" para reset del drag-and-drop

#### ¿Cada sección es un componente separado?

- Sí conceptualmente, pero **NO** todas son componentes independientes:
  - **Componentes separados:** `GuardContractsTab`, `GuardiaSalaryTab`, `GuardiaLiquidacionesTab`, `GuardEventsTab`, `PersonaRendicionesTab`, `InventarioGuardiaAssignmentsSection`, `NotesSection`
  - **Inline JSX dentro de GuardiaDetailClient:** `datos`, `asignacion`, `marcacion`, `rondas`, `documentos`, `docs-vinculados`, `communication`, `dias-trabajados`, `turnos-extra`, `historial`

### 4.2 Problemas Específicos de Personas

1. **Archivo monolítico:** `GuardiaDetailClient.tsx` tiene 2,652 líneas — difícil de mantener
2. **Secciones inline vs componentes:** Mezcla de JSX inline y componentes importados
3. **CollapsibleSection padding:**
   - Header: `p-4 pb-0 sm:p-6 sm:pb-0`
   - Content: `px-4 pt-4 sm:px-6`
   - El padding es adecuado pero hay diferencia entre mobile (p-4) y desktop (sm:p-6)
4. **`defaultCollapsedSectionKeys={true}`:** TODAS las secciones empiezan colapsadas excepto `datos` — usuario debe abrir manualmente cada una
5. **Subsecciones de "Datos personales":** Separadas por `border-t border-border` con `space-y-6` entre grupos — adecuado
6. **Detail fields:** Usan `DetailFieldGrid` con `columns={3}` y gaps `gap-x-6 gap-y-4` — bien espaciados
7. **Document cards:** `p-3` con grids `md:grid-cols-3` — padding ligeramente ajustado
8. **Form labels:** `text-xs text-muted-foreground block mb-1` — solo 4px entre label e input (tight)
9. **Tables en "Días trabajados":** Celdas `px-3 py-2` — consistente con tablas de Operaciones

---

## PARTE 5: LAYOUT PRINCIPAL

### 5.1 Layout/Shell de la Aplicación

#### Sidebar (`src/components/opai/AppSidebar.tsx`, 664 líneas)

| Aspecto | Detalle |
|---------|---------|
| **Expandido** | `w-64` (256px) |
| **Colapsado** | `w-[72px]` (72px, solo iconos) |
| **Posición** | `fixed left-0 top-0 z-30` |
| **Transición** | `duration-200 ease-out` |
| **Niveles** | 3 niveles de navegación (módulo → sub-módulo → sub-sub-módulo) |
| **Accordion** | Solo 1 módulo expandido a la vez |
| **Flyout** | Cuando colapsado, hover muestra menú flotante |
| **User footer** | Avatar + nombre + email + toggle sidebar |

#### Header/Topbar

- **Mobile:** `src/components/opai/AppShell.tsx` — Sticky topbar con logo, theme toggle, notifications, search, refresh, hamburger menu
- **Desktop:** Topbar sticky con búsqueda global, notificaciones, perfil (`TopbarActions`)

#### Contenedor del contenido (`AppShell.tsx:202-218`)

```jsx
<div className={cn(
  'transition-[padding] duration-200 ease-out min-w-0 overflow-x-hidden',
  isSidebarOpen ? 'lg:pl-64' : 'lg:pl-[72px]',
)}>
  <div className="hidden lg:flex sticky top-0 z-20 h-12 ...">
    <TopbarActions />
  </div>
  <main className="flex-1 min-w-0 overflow-x-hidden">
    <div className="px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pb-24 lg:pb-6 animate-in-page min-w-0 overflow-x-hidden">
      {children}
    </div>
  </main>
</div>
```

**Padding del área de contenido:**

| Breakpoint | Padding horizontal | Padding vertical |
|------------|-------------------|-----------------|
| Base (mobile) | `px-4` (16px) | `py-6` (24px) + `pb-24` (96px para bottom nav) |
| `sm` (640px) | `px-6` (24px) | — |
| `lg` (1024px) | `px-8` (32px) | `pb-6` (24px, sin bottom nav) |
| `xl` (1280px) | `px-10` (40px) | — |
| `2xl` (1536px) | `px-12` (48px) | — |

#### ¿Es responsive?

Sí, breakpoints estándar de Tailwind:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px (desktop threshold: sidebar visible)
- `xl`: 1280px
- `2xl`: 1536px

**Mobile:** Hamburger menu → drawer sidebar + bottom nav
**Desktop:** Sidebar fija (expandible/colapsable) + topbar

### 5.2 Enrutamiento

- **Sistema:** Next.js App Router (file-based routing)
- **Route groups:** `(app)` para rutas protegidas, `(templates)` para presentaciones públicas
- **Auth:** Middleware + layout check via `auth()` de NextAuth
- **Permisos:** `resolvePermissions()` en layout, `PermissionsProvider` context

#### TODAS las rutas (92+ rutas)

**Rutas protegidas (app):**
```
/hub
/opai/notificaciones
/opai/perfil
/opai/perfil/notificaciones
/opai/inicio
/opai/documentos
/opai/documentos/[id]
/opai/documentos/nuevo
/opai/documentos/templates
/opai/documentos/templates/[id]
/opai/documentos/templates/nuevo
/opai/templates
/opai/configuracion
/opai/configuracion/empresa
/opai/configuracion/usuarios
/opai/configuracion/roles
/opai/configuracion/grupos
/opai/configuracion/integraciones
/opai/configuracion/notificaciones
/opai/configuracion/asistente-ia
/opai/configuracion/auditoria
/opai/configuracion/firmas
/opai/configuracion/categorias-plantillas
/opai/configuracion/email-templates
/opai/configuracion/crm
/opai/configuracion/cpq
/opai/configuracion/payroll
/opai/configuracion/ops
/opai/configuracion/tipos-ticket
/opai/configuracion/finanzas
/crm
/crm/leads
/crm/leads/[id]
/crm/accounts
/crm/accounts/[id]
/crm/contacts
/crm/contacts/[id]
/crm/installations
/crm/installations/[id]
/crm/deals
/crm/deals/[id]
/crm/cotizaciones
/crm/cotizaciones/[id]
/cpq
/cpq/[id]
/cpq/config
/ops
/ops/pauta-mensual
/ops/pauta-diaria
/ops/turnos-extra
/ops/refuerzos
/ops/marcaciones
/ops/ppc
/ops/puestos
/ops/rondas
/ops/rondas/monitoreo
/ops/rondas/alertas
/ops/rondas/checkpoints
/ops/rondas/templates
/ops/rondas/programacion
/ops/rondas/reportes
/ops/control-nocturno
/ops/control-nocturno/[id]
/ops/control-nocturno/kpis
/ops/tickets
/ops/tickets/[id]
/ops/inventario
/ops/inventario/productos
/ops/inventario/productos/[id]
/ops/inventario/bodegas
/ops/inventario/compras
/ops/inventario/entregas
/ops/inventario/stock
/ops/inventario/activos
/ops/supervision
/ops/supervision/[id]
/ops/supervision/mis-visitas
/ops/supervision/nueva-visita
/ops/supervision/reportes
/ops/supervision/asignaciones
/personas
/personas/guardias
/personas/guardias/[id]
/personas/guardias/sueldos-rut
/personas/guardias/ingreso-te
/payroll
/payroll/periodos
/payroll/periodos/[id]
/payroll/anticipos
/payroll/simulator
/payroll/parameters
/finanzas
/finanzas/rendiciones
/finanzas/rendiciones/[id]
/finanzas/rendiciones/nueva
/finanzas/aprobaciones
/finanzas/pagos
/finanzas/facturacion
/finanzas/facturacion/emitir
/finanzas/facturacion/notas/credito
/finanzas/facturacion/notas/debito
/finanzas/proveedores
/finanzas/pagos-proveedores
/finanzas/bancos
/finanzas/conciliacion
/finanzas/contabilidad
/finanzas/contabilidad/asientos/nuevo
/finanzas/reportes
/te
/te/registro
/te/lotes
/te/aprobaciones
/te/pagos
```

**Rutas públicas:**
```
/opai/login
/opai/forgot-password
/opai/reset-password
/activate
/marcar/[code]
/portal/guardia
/postulacion/[token]
/ronda/[code]
/p/[uniqueId]  (presentaciones)
/sign/[token]  (firma documentos)
/signed/[documentId]/[viewToken]
```

---

## PARTE 6: RESUMEN DE PROBLEMAS

### 6.1 Problemas Globales (afectan toda la app)

| # | Problema | Vistas afectadas | Gravedad |
|---|---------|-----------------|----------|
| G1 | **KPIs NO usan el componente `KpiCard` estandarizado** — Dashboard Ops usa Card+CardContent custom, CRM usa `<div>` custom, cada uno con padding diferente | `/ops`, `/crm`, `/finanzas`, `/payroll` | ALTA |
| G2 | **Padding de CardContent inconsistente** — Algunos usan `pt-4 pb-3`, otros `pt-5`, otros `p-4` directo en Card | Dashboards de todos los módulos | ALTA |
| G3 | **No hay un componente DataTable/Table estandarizado** — Cada vista implementa tablas con `<table>` + clases inline o card-based lists con padding ad-hoc | Marcaciones, Rondas, Días trabajados, Turnos extra, etc. | ALTA |
| G4 | **Form label spacing demasiado tight** — `mb-1` (4px) entre label e input en muchos formularios | Ficha persona, modales de creación, formularios de edición | MEDIA |
| G5 | **Inconsistencia en spacing entre secciones de página** — Algunos `space-y-6`, otros `space-y-4`, otros `space-y-3` | Pauta mensual vs resto | MEDIA |
| G6 | **Negative margins** — Pauta mensual usa `-mt-4` para ajustar spacing | `/ops/pauta-mensual` | MEDIA |
| G7 | **Badge sizing inconsistente** — Algunos `text-xs`, otros `text-[10px]`, padding varía entre `px-2 py-0.5` y `px-2.5 py-1.5` | Global, en todas las tablas y listas | BAJA |

### 6.2 Problemas por Módulo

#### Operaciones
- Dashboard KPIs: Card custom con `pt-4 pb-3` en vez de `KpiCard`
- Dashboard módulo cards: `pt-5` (diferente de KPIs en la misma página)
- Pauta Mensual: `-mt-4 space-y-3` + `mb-1` custom en PageHeader
- Refuerzos: Stats grid con `grid-cols-3 gap-2 text-xs` — no usa KpiCard
- Marcaciones: Filtros con padding asimétrico `px-4 pb-4 pt-0`
- Rondas: Tablas consistentes internamente (`px-3 py-2`) pero no estandarizadas

#### CRM
- Dashboard: KPIs con `<div>` custom en vez de `KpiCard`
- Chart cards: `CardHeader pb-2` + `CardContent pt-0` = spacing muy tight
- Detail views: Usan CrmDetailLayout → consistentes entre sí

#### Personas
- GuardiaDetailClient: 2,652 líneas monolíticas
- Document cards: `p-3` ligeramente ajustado
- Form labels: `mb-1` tight
- Tablas inline: `px-3 py-2` — ok pero no estandarizado

#### Finanzas
- Dashboard: Info card con `p-4` en Card vs módulo cards con `pt-5` en CardContent
- Mismo patrón inconsistente que Payroll

#### Payroll
- Dashboard: Mismo patrón inconsistente que Finanzas (info card vs módulo cards)

### 6.3 Componentes que Faltan o Necesitan Estandarización

#### Componentes que DEBERÍAN existir y NO existen:

| Componente | Justificación |
|------------|---------------|
| **DataTable** / **StandardTable** | No hay un componente de tabla reutilizable. Cada vista implementa `<table>` con clases inline. Se necesita uno con headers, celdas, sorting, responsive, padding consistente. |
| **StatGrid** / **KpiGrid** | Grid estandarizado para KPI cards con responsive columns. Actualmente cada dashboard define su propia grid. |
| **ModuleCard** / **DashboardModuleCard** | Card de navegación a módulos (ícono + título + descripción + link). Repetido en Ops, Finanzas, Payroll, Inventario con slight variations. |
| **FilterBar** | Contenedor estandarizado para barras de filtros con padding consistente. |
| **FormField** | Wrapper label + input con spacing estandarizado (actualmente `mb-1` ad-hoc). |

#### Componentes que EXISTEN pero no se usan consistentemente:

| Componente | Problema |
|------------|---------|
| **KpiCard** | Existe y es bueno, pero NO se usa en dashboards de Ops, CRM, Finanzas ni Payroll — usan Card custom en su lugar |
| **Card (shadcn)** | Se usa pero con overrides constantes de padding (`pt-4 pb-3`, `pt-5`, `p-4`) en vez de usar CardHeader/CardContent estándar |
| **PageHeader** | Se usa en casi todas las páginas — BIEN. Pero Pauta Mensual le pone `className="mb-1"` custom |
| **ListToolbar** | Se usa en listas del CRM y Personas — BIEN. Pero no en todas las listas de Ops. |
| **Breadcrumb** | Existe como componente pero se usa poco; muchas páginas usan back links ad-hoc en PageHeader |

### 6.4 Prioridad Sugerida de Refactorización

#### PRIORIDAD 1 — ALTO IMPACTO, FUNDACIONAL
1. **Crear componente `DataTable`** estándar con padding consistente (`px-4 py-3` headers, `px-4 py-2.5` celdas) — afecta ~15 vistas
2. **Estandarizar uso de `KpiCard`** en TODOS los dashboards — actualmente solo se usa en páginas individuales, no en dashboards principales
3. **Crear `ModuleCard`** estándar y reemplazar en Ops, Finanzas, Payroll, Inventario

#### PRIORIDAD 2 — CONSISTENCIA GLOBAL
4. **Eliminar overrides de CardContent** — Que todos los Card usen `CardHeader` + `CardContent` sin overrides de padding
5. **Estandarizar `FormField`** — Wrapper con label spacing consistente (`mb-1.5` o `mb-2` en vez de `mb-1`)
6. **Estandarizar `StatGrid`** — Grid responsive para KPIs (`grid-cols-2 md:grid-cols-4 gap-3`)
7. **Estandarizar `FilterBar`** — Contenedor con padding `p-3` y `gap-3` consistente

#### PRIORIDAD 3 — MÓDULOS ESPECÍFICOS
8. **Ficha Persona** — Refactorizar GuardiaDetailClient.tsx (2,652 líneas) separando secciones inline en componentes
9. **Pauta Mensual** — Eliminar `-mt-4` y estandarizar spacing
10. **CRM Dashboard** — Reemplazar `<div>` KPIs custom por `KpiCard`

#### PRIORIDAD 4 — REFINAMIENTO
11. **Badge sizing** — Estandarizar a `text-xs px-2 py-0.5`
12. **Table cell padding** — Estandarizar a `px-4 py-2.5` (actualmente `px-3 py-2`)
13. **Chart card spacing** — Arreglar `pb-2` + `pt-0` tight en CRM

#### Orden de módulos por gravedad:

1. **Operaciones** — Más vistas, más inconsistencias, negative margins
2. **CRM** — Dashboard con KPIs custom, chart spacing
3. **Personas** — Archivo monolítico, muchas secciones
4. **Finanzas/Payroll** — Dashboard padding inconsistente
5. **Configuración** — Generalmente ok, usa patrones estándar
6. **Documentos** — Generalmente ok
7. **Hub** — Delega a componentes, revisar individualmente

---

## APÉNDICE: REFERENCIA RÁPIDA DE PADDINGS

### Paddings actuales del componente Card (`ui/card.tsx`)

```
CardHeader:   p-4 sm:p-5       (16px → 20px)
CardContent:  p-4 pt-0 sm:p-5 sm:pt-0  (sides 16px→20px, top 0)
CardFooter:   p-4 pt-0 sm:p-5 sm:pt-0  (same as content)
```

### CollapsibleSection padding (`crm/CollapsibleSection.tsx`)

```
Header:  p-4 pb-0 sm:p-6 sm:pb-0     (16px→24px sides, 0 bottom)
Content: px-4 pt-4 sm:px-6            (16px→24px horizontal, 16px top)
```

### KpiCard padding (`opai/KpiCard.tsx`)

```
sm: p-3       (12px)
md: p-3       (12px) — mismo que sm
lg: p-4       (16px)
```

### Table cells (actual, ad-hoc)

```
Headers:  px-3 py-2  (12px × 8px)   — en Marcaciones, Rondas, Días trabajados
Data:     px-3 py-2  (12px × 8px)   — mismo
```

### Animaciones

```
fast:      150ms  — micro-interactions (focus, color)
normal:    200ms  — sidebar, padding transitions
emphasis:  300ms  — modals, drawers
page:      300ms  — page entrance (fadeInUp 8px)
```
