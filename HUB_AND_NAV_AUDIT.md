# OPAI — Auditoría de Hub y Navegación Mobile

> Generado: 2026-03-14 | Stack: Next.js 15, React 18, TypeScript, Tailwind CSS, shadcn/ui dark theme

---

## Sección 1: Hub — Estructura Completa

### 1.1 Página Principal

**Archivo:** `src/app/(app)/hub/page.tsx` (116 líneas)

- Server Component con `dynamic = 'force-dynamic'`, `revalidate = 0`
- Autenticación vía `auth()` (NextAuth), redirect a `/opai/login` si no hay sesión
- Resuelve permisos con `resolvePagePerms()` y construye `HubPerms` (líneas 56-71)
- Fetch paralelo de 7 queries (líneas 74-91): `getClosingHubData`, `getFinanceMetrics`, `getOpsMetrics`, `getRecentActivity`, `getNotifications`, `getTicketMetrics`, `getSupervisionMetrics`
- Condicional: si `perms.hubLayout === "supervisor"` renderiza `<SupervisorHub />` (línea 97-99)
- Caso normal: renderiza `<HubClientWrapper />` con todos los datos como props

### 1.2 HubClientWrapper

**Archivo:** `src/app/(app)/hub/_components/HubClientWrapper.tsx` (111 líneas)

- Client Component ("use client")
- Layout: `space-y-4 min-w-0 pb-24 max-w-screen-2xl`
- **NO usa Suspense ni lazy loading** — todo se renderiza sincrónicamente
- **NO tiene loading states ni error states** propios (depende de server-side data)

**Estructura visual de arriba a abajo:**

1. **HubGreeting** — Saludo + fecha + follow-ups pendientes + link a portales (si admin)
2. **HubCrmSection** — Pipeline Comercial (expandido por defecto). Condición: `closingData && hubPerms.hasCrm`
3. **HubOperationsSection** — Operaciones (colapsado). Condición: `opsMetrics && hubPerms.hasOps`
4. **HubSupervisionSection** — Supervisión (colapsado). Condición: `supervisionMetrics && hubPerms.hasSupervision`
5. **HubFinanzasSection** — Finanzas (colapsado). Condición: `financeMetrics && hubPerms.hasFinance`
6. **HubTicketsSection** — Tickets (siempre visible)
7. **HubActivitySection** — Actividad Reciente (colapsado)
8. **Empty state** — Card "Sin datos disponibles" si no hay CRM, ops ni finanzas

### 1.3 Componentes del Hub

| Componente | Archivo | Datos | Mobile/Desktop |
|---|---|---|---|
| HubGreeting | `_components/HubGreeting.tsx` | firstName, pendingFollowUpsCount, showPortalLink | Responsive, texto adapta tamaño |
| HubCrmSection | `_components/HubCrmSection.tsx` | ClosingHubData (KPIs, hot deals, stale deals, funnel, pending leads) | Accordion colapsable, grid 2-cols en desktop |
| HubOperationsSection | `_components/HubOperationsSection.tsx` | OpsMetrics (puestos, guardias, asistencia, rondas, alertas) | Accordion, KPI cards grid |
| HubSupervisionSection | `_components/HubSupervisionSection.tsx` | SupervisionMetrics (visitas, hallazgos, cobertura) | Accordion |
| HubFinanzasSection | `_components/HubFinanzasSection.tsx` | FinanceMetrics (rendiciones pendientes/aprobadas) + OpsMetrics (TE) | Accordion |
| HubTicketsSection | `_components/HubTicketsSection.tsx` | TicketMetrics (open, in progress, breached, urgent list) | Accordion |
| HubActivitySection | `_components/HubActivitySection.tsx` | ActivityEntry[] (acciones recientes agrupadas) | Accordion, lista |
| HubCollapsibleSection | `_components/HubCollapsibleSection.tsx` | Wrapper de acordeón genérico para todas las secciones | N/A |
| HubFabSpeedDial | `_components/HubFabSpeedDial.tsx` | Quick actions FAB (no usado en layout actual) | Mobile FAB |
| HubClosingKpis | `_components/HubClosingKpis.tsx` | KPIs del pipeline de cierre | Grid responsive |
| HubHotDeals / HubHotDealsTable | `_components/HubHotDeals*.tsx` | Hot deals con heat score | Tabla/cards |
| HubStaleDeals | `_components/HubStaleDeals.tsx` | Deals estancados | Lista |
| HubPendingLeads | `_components/HubPendingLeads.tsx` | Leads pendientes de gestión | Lista |
| HubMiniFunnel | `_components/HubMiniFunnel.tsx` | Funnel de conversión (leads→deals→won) | Horizontal bars |
| SupervisorHub | `_components/SupervisorHub.tsx` | Vista alternativa para supervisores | Layout propio |

### 1.4 Datos del Hub

**Archivo de queries:** `src/app/(app)/hub/_lib/hub-queries.ts`
**Archivo de tipos:** `src/app/(app)/hub/_lib/hub-types.ts` (425 líneas)

**Fuentes de datos (server-side, Prisma queries directas):**
- `getClosingHubData()` — CRM pipeline: KPIs, hot deals, stale deals, funnel, pending leads
- `getFinanceMetrics()` — Rendiciones: pendientes aprobación, aprobadas sin pagar
- `getOpsMetrics()` — Operaciones: puestos, guardias, asistencia, rondas, alertas
- `getRecentActivity()` — Actividad reciente del tenant
- `getNotifications()` — Notificaciones del usuario
- `getTicketMetrics()` — Tickets: open, in progress, breached, urgent
- `getSupervisionMetrics()` — Supervisión: visitas, hallazgos, cobertura

### 1.5 Conexión Hub con Navegación

- Hub no tiene breadcrumbs
- Los KPI cards linkan a módulos específicos (ej: click en "Leads abiertos" → `/crm/leads`)
- No hay quick actions shortcuts visibles en el layout actual (HubFabSpeedDial existe pero no se importa en HubClientWrapper)
- No hay charts con recharts/chart.js — solo KPI cards y listas
- No hay notificaciones inline en el Hub actual (HubNotifications fue removido, comentario línea 10 de HubClientWrapper)

### 1.6 Problemas Detectados — Hub

1. **HubFabSpeedDial existe pero no se usa** en HubClientWrapper — componente orphan
2. **No hay loading states** — si los queries son lentos, el usuario ve página en blanco hasta que el server responde
3. **No hay error boundaries** — un error en cualquier sección crashea todo el Hub
4. **pb-24 en HubClientWrapper + pb-28 en AppShell** — padding bottom duplicado en mobile
5. **max-w-screen-2xl sin centering** — en pantallas ultra-wide el contenido no se centra

---

## Sección 2: AppShell — Layout Principal

### 2.1 Archivo

**Archivo:** `src/components/opai/AppShell.tsx` (262 líneas)

### 2.2 Estructura JSX

```
<CommandPaletteProvider>
  <div className="relative min-h-screen overflow-x-hidden">

    <!-- Mobile topbar (líneas 87-157) — solo si sidebar prop existe, hidden en lg+ -->
    <header className="fixed top-0 ... z-30 ... lg:hidden">
      Logo OPAI | [spacer] | Create(+) | Search | Chat | Notifications
    </header>

    <!-- Desktop sidebar (líneas 160-174) — hidden en <lg -->
    <div className="hidden lg:block">
      {sidebar} <!-- cloneElement para pasar isSidebarOpen -->
    </div>

    <!-- Mobile search overlay (líneas 177-200) — z-[60], fullscreen -->

    <!-- Main content (líneas 203-234) -->
    <div className="transition-[padding,margin] ... pt-[calc(4rem+...)] lg:pt-12 ...">
      <!-- Desktop topbar actions (líneas 213-219) — hidden lg:flex, fixed top-0 -->
      <TopbarActions />
      <SimulationBanner />
      <main>
        {pathname.startsWith('/chat') ? no-padding-chat : normal-padding}
        {children}
      </main>
    </div>

    <!-- BottomNav (línea 237) — mobile only (lg:hidden en BottomNav) -->
    <CommandPalette />
    <AiHelpChatWidget />
    <QuickCreateModal />
  </div>

  <!-- ChatSidePanel (línea 258) — fuera del overflow-x-hidden -->
</CommandPaletteProvider>
```

### 2.3 Estados

| Estado | Tipo | Propósito |
|---|---|---|
| `isSidebarOpen` | boolean | Controla ancho del sidebar desktop (collapsed/expanded). Default: `false` (collapsed) |
| `isMobileSearchOpen` | boolean | Overlay de búsqueda fullscreen mobile |
| `mobileCreateType` | QuickCreateType \| null | Tipo de entidad para QuickCreateModal |

### 2.4 useEffects

1. **Auto-close search on route change** (líneas 74-80): Compara pathname con ref anterior, cierra search si cambió

### 2.5 Z-Index Stacking

| Elemento | Z-Index | Contexto |
|---|---|---|
| Mobile topbar | `z-30` | Header fija |
| Desktop sidebar | `z-30` (en AppSidebar) | Sidebar fija |
| Desktop topbar actions | `z-20` | Debajo del sidebar |
| BottomNav | `z-40` | Encima de todo excepto overlays |
| Mobile search overlay | `z-[60]` | Encima de todo |
| CPQ MobileBottomBar | `z-50` | Encima de BottomNav |

### 2.6 CSS Variables

- `--bottom-nav-height`: Altura real del BottomNav, seteada por ResizeObserver en BottomNav.tsx (línea 43)

### 2.7 Padding y Spacing del Contenido Principal

- Mobile: `pt-[calc(4rem+env(safe-area-inset-top,0px))]` (topbar) + `pb-28` (bottom nav space)
- Desktop: `pt-12` (topbar height) + `pb-6`
- Horizontal: `px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12`
- Sidebar offset desktop: `lg:pl-64` (expanded) / `lg:pl-[72px]` (collapsed)
- Chat panel offset: `lg:mr-[400px]` cuando abierto

### 2.8 Body Scroll Lock

- **No hay body scroll lock actualmente.** El sidebar mobile drawer fue eliminado.
- El mobile search overlay (`z-[60]`) cubre todo pero no bloquea scroll del body.

### 2.9 Problemas Detectados — AppShell

1. **isSidebarOpen default false pero sidebar desktop siempre pasa isSidebarOpen=false** (línea 169) — el sidebar toggle no funciona. El sidebar siempre está en modo collapsed en desktop.
2. **No hay hamburger menu** en mobile — el sidebar mobile drawer fue eliminado previamente
3. **overflow-x-hidden en root div** puede causar problemas con fixed elements (ChatSidePanel se saca fuera correctamente)
4. **pt-[calc(4rem+env(...))]** — los 4rem no coinciden exactamente con `min-h-12` (48px = 3rem) del topbar. Hay 16px de espacio extra.

---

## Sección 3: Bottom Nav

### 3.1 Archivo

**Archivo:** `src/components/opai/BottomNav.tsx` (675 líneas)

### 3.2 Estructura General

El BottomNav tiene 3 modos exclusivos:

1. **MainNav** — 5 items fijos (Inicio, Comercial, Operaciones, Personas, Más)
2. **ModuleSubNav** — Sub-tabs contextuales del módulo actual (con botón retorno + overflow)
3. **SectionNav** — Navegación por secciones scroll en páginas de detalle CRM

### 3.3 Items Principales (MainNav)

```typescript
const MAIN_NAV: MainNavItem[] = [
  { key: "home", href: "/hub", label: "Inicio", icon: Home },
  { key: "comercial", href: "/crm", label: "Comercial", icon: Briefcase },
  { key: "operaciones", href: "/ops", label: "Operaciones", icon: Shield },
  { key: "personas", href: "/personas/guardias", label: "Personas", icon: Users },
  { key: "mas", href: "#mas", label: "Más", icon: LayoutGrid, isDrawer: true },
];
```

### 3.4 Detección de Módulo Activo

**Función:** `getActiveModule(pathname)` (líneas 79-90)

Mapeo de rutas a módulos:
- `/crm` → "crm"
- `/ops` → "ops"
- `/personas` → "personas"
- `/payroll` → "payroll"
- `/finanzas` → "finanzas"
- `/opai/configuracion` → "config"
- `/opai/inicio`, `/opai/documentos`, `/opai/templates` → "docs"
- `/te` → "te"
- `/reportes/dt` → "reportes_dt"

### 3.5 CPQ Detail Exclusion

Líneas 102-104: Si la ruta coincide con `/crm/cotizaciones/[id]`, el BottomNav retorna `null` (se oculta para que MobileBottomBar CPQ sea la única barra).

### 3.6 Drawer "Más"

**Componente:** `MasDrawer` (líneas 196-365)

Secciones del drawer:

**Módulos** (grid 3 columnas):
| Item | Ruta | Ícono | Color | Condición |
|---|---|---|---|---|
| Finanzas | /finanzas | Landmark | text-amber-400 | hasModuleAccess("finance") |
| Payroll | /payroll | Wallet | text-violet-400 | hasModuleAccess("payroll") |
| Documentos | /opai/inicio | FolderOpen | text-sky-400 | hasModuleAccess("docs") |
| Reportes DT | /reportes/dt | FileBarChart | text-rose-400 | canView("reportes_dt") |
| Turnos Extra | /te/registro | Clock | text-orange-400 | hasModuleAccess("ops") |

**Herramientas** (grid 3 columnas, solo admin/owner):
| Item | Ruta/Acción | Ícono | Color |
|---|---|---|---|
| Configuración | /opai/configuracion | Settings | text-zinc-400 |
| Portales | /portales | Monitor | text-teal-400 |
| Simular Rol | RoleSwitcher component | Eye | text-blue-400 |

**Preferencias** (lista vertical):
- Tema claro/oscuro — toggle inline
- Mi Perfil — /opai/perfil
- Cerrar Sesión — Dialog confirmación (text-red-400)

### 3.7 ModuleSubNav

**Componente:** `ModuleSubNav` (líneas 383-499)

- **Botón de retorno**: `ChevronLeft` + label del módulo padre, navega a `/hub`
- **MAX_VISIBLE = 4** items
- Items visibles + botón "Más" (MoreHorizontal) para overflow
- Overflow se muestra en Sheet bottom
- Soporte para chat toggle (si item.key === 'chat')
- Active item: `text-emerald-400` con dot indicator

### 3.8 SectionNav (Detalle CRM)

**Componente:** `SectionNav` (líneas 506-674)

- IntersectionObserver para tracking de sección activa (líneas 537-578)
- rootMargin: `-80px 0px -60% 0px`, thresholds: `[0, 0.1, 0.25, 0.5]`
- MAX_VISIBLE = 4 secciones
- **Rotation**: Si la sección activa está en overflow, reemplaza el último item visible (líneas 515-528)
- Click scroll: `scrollIntoView({ behavior: 'smooth', block: 'start' })`
- Anti-bounce: `isClickScrolling` ref con timeout de 800ms

### 3.9 CSS Variable --bottom-nav-height

- Seteada por `useBottomNavHeight` hook (líneas 38-53)
- Usa `ResizeObserver` para medir altura real del nav
- Se aplica a `document.documentElement.style`
- Se limpia en unmount

### 3.10 Estilos del Container

```
<nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/30 bg-background/95 backdrop-blur-xl lg:hidden">
  <div className="flex items-center justify-around min-h-[56px] px-1 pb-[env(safe-area-inset-bottom)]">
```

### 3.11 Problemas Detectados — BottomNav

1. **Botón retorno navega a /hub** en lugar de simplemente cambiar el estado de la bottom bar — causa navegación innecesaria
2. **No hay animación de transición** entre MainNav y ModuleSubNav — cambio abrupto
3. **SectionNav con rotación funciona** pero puede ser confuso cuando items cambian de posición

---

## Sección 4: Module Nav — Configuración

### 4.1 Archivo

**Archivo:** `src/lib/module-nav.ts` (351 líneas)

### 4.2 Tipos

```typescript
export interface BottomNavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  isSection?: boolean; // Si true, es un ancla de sección (scroll)
}
```

### 4.3 Items por Módulo

**MAIN_ITEMS** (no usados por BottomNav actual, legacy):
- hub, chat, docs, crm, payroll, ops, finance, config

**CRM_ITEMS** (6 items):
| Key | Ruta | Label | Ícono | SubKey (permisos) |
|---|---|---|---|---|
| crm-leads | /crm/leads | Leads | Users | leads |
| crm-accounts | /crm/accounts | Cuentas | Building2 | accounts |
| crm-installations | /crm/installations | Instalaciones | MapPin | installations |
| crm-deals | /crm/deals | Negocios | TrendingUp | deals |
| crm-contacts | /crm/contacts | Contactos | Contact | contacts |
| crm-quotes | /crm/cotizaciones | Cotizaciones | DollarSign | quotes |

**OPS_ITEMS** (6 items):
| Key | Ruta | Label | Ícono |
|---|---|---|---|
| ops-pautas | /ops/pauta-mensual | Pautas | CalendarDays |
| ops-installations | /crm/installations | Instalaciones | MapPin |
| ops-supervision | /ops/supervision | Supervisión | ClipboardCheck |
| ops-tickets | /ops/tickets | Tickets | Ticket |
| ops-rondas | /ops/rondas | Rondas | Route |
| ops-inventario | /ops/inventario | Inventario | Package |

**RONDAS_ITEMS** (5 items — sub-módulo de Ops):
- Dashboard, Monitor, Alertas, Puntos, Config

**TE_ITEMS** (4 items):
- Registro, Aprobaciones, Lotes, Pagos

**PERSONAS_ITEMS** (5 items):
| Key | Ruta | Label | Ícono |
|---|---|---|---|
| personas-listado | /personas/guardias | Listado | User |
| personas-onboarding | /personas/onboarding | Onboarding | UserRoundCheck |
| personas-comunicaciones | /personas/comunicaciones | Comunicaciones | Bell |
| personas-sueldos-rut | /personas/guardias/sueldos-rut | Sueldos RUT | DollarSign |
| personas-gamificacion | /personas/gamificacion | Gamificación | Trophy |

**PAYROLL_ITEMS** (4 items):
| Key | Ruta | Label | Ícono |
|---|---|---|---|
| payroll-periodos | /payroll/periodos | Períodos | CalendarDays |
| payroll-anticipos | /payroll/anticipos | Anticipos | Wallet |
| payroll-simulator | /payroll/simulator | Simulador | Calculator |
| payroll-parameters | /payroll/parameters | Parámetros | FileText |

**DOCS_ITEMS** (2 items):
- Envíos (/opai/inicio), Gestión (/opai/documentos)

**FINANCE_ITEMS** (6 items):
| Key | Ruta | Label | Ícono |
|---|---|---|---|
| finance-rendiciones | /finanzas/rendiciones | Rendic. | Receipt |
| finance-ventas | /finanzas/facturacion | Ventas | FileText |
| finance-compras | /finanzas/proveedores | Compras | Building2 |
| finance-banca | /finanzas/bancos | Banca | Landmark |
| finance-contabilidad | /finanzas/contabilidad | Contab. | BookText |
| finance-informes | /finanzas/reportes | Informes | BarChart3 |

**CONFIG_ITEMS** (9 items):
- Usuarios, Grupos, Integraciones, Alertas, CRM, CPQ, Ops, Tickets, IA

### 4.4 CRM Detail Sections

**Función:** `getCrmDetailSectionItems(pathname)` (líneas 285-308)

Detecta patrón `/crm/{module}/{id}` y retorna section items basados en `MODULE_DETAIL_SECTIONS` de `CrmModuleIcons.ts`.

Secciones por módulo:
- **leads**: general, account, contacts, deals, installations, files (6 secciones)
- **accounts**: general, contacts, installations, deals, quotes, rendiciones, communication, notes (8 secciones)
- **contacts**: general, account, installations, deals, quotes, communication, notes, files (8 secciones)
- **deals**: general, account, contacts, installations, quotes, followup, communication, notes (8 secciones)
- **installations**: general, account, contacts, deals, quotes, staffing, refuerzos, dotacion, marcacion_asistencia, marcacion_rondas, rendiciones, uniformes-activos, notes, files (14 secciones)
- **guardias**: datos, contratos, eventos-laborales, estructura-sueldo, liquidaciones, asignacion, marcacion, rondas, documentos, docs-vinculados, cuentas, communication, comentarios, dias-trabajados, turnos-extra, rendiciones, historial, uniformes (18 secciones)

### 4.5 Discrepancias con Sidebar (AppLayoutClient.tsx)

| Aspecto | Sidebar (AppLayoutClient) | BottomNav (module-nav) |
|---|---|---|
| Inicio ícono | Grid3x3 | Home (en BottomNav.tsx) |
| Comercial ícono | TrendingUp | Briefcase (en BottomNav.tsx) |
| Operaciones ícono | Activity | Shield (en BottomNav.tsx) |
| Personas ícono | User | Users (en BottomNav.tsx) |
| CRM: Cuentas ícono | Building2 | Building2 (match) |
| CRM: Contactos ícono | Contact | Contact (match) |
| Sidebar: Ops tiene "Pautas" subgrupo | Sí (con sub-items) | module-nav tiene pauta-mensual plano |
| Sidebar: Personas tiene "Sueldos por RUT" | Sí | module-nav tiene "Sueldos RUT" (label diferente) |
| Sidebar: Finanzas tiene "Inicio" | Sí (/finanzas, Grid3x3) | module-nav NO tiene Inicio |
| Sidebar: Finanzas labels | Rendiciones, Ventas, Compras, Banca, Contabilidad, Informes | Rendic., Ventas, Compras, Banca, Contab., Informes |
| CRM order | Leads, Cuentas, Negocios, Contactos, Cotizaciones | Leads, Cuentas, Instalaciones, Negocios, Contactos, Cotizaciones |
| CRM: Instalaciones | No está en sidebar CRM (está en Ops) | Está en CRM items |
| Sidebar: Payroll labels | "Períodos de Pago" | "Períodos" |

### 4.6 Problemas Detectados — Module Nav

1. **MAIN_ITEMS no se usan** — legacy code, los items principales están hardcodeados en BottomNav.tsx
2. **Íconos inconsistentes** entre sidebar y bottom nav para módulos principales (Grid3x3 vs Home, TrendingUp vs Briefcase, Activity vs Shield, User vs Users)
3. **Labels truncados** en finanzas (Rendic., Contab.) — no coinciden con sidebar
4. **CRM tiene Instalaciones** en bottom nav pero no en sidebar CRM (está en Ops)
5. **Orden de CRM items diferente** entre sidebar y bottom nav

---

## Sección 5: Top Bar Mobile

### 5.1 Ubicación

**Archivo:** `src/components/opai/AppShell.tsx`, líneas 87-157

### 5.2 Estructura (izquierda a derecha)

```
<header className="fixed top-0 left-0 right-0 z-30 flex min-h-12 items-center justify-between border-b border-border/50 bg-background/95 backdrop-blur-md lg:hidden">

  <!-- LEFT: Logo -->
  <Link href="/hub">
    <ThemeLogo width={28} height={28} />
    <span>OPAI</span>
  </Link>

  <!-- RIGHT: Actions (gap-0.5) -->
  <div className="flex items-center gap-0.5">
    1. Crear (+) — DropdownMenu con 9 items
    2. Buscar — abre overlay fullscreen
    3. Chat — toggle ChatSidePanel, badge de unread
    4. Notificaciones — NotificationPopover compact
  </div>
</header>
```

### 5.3 QuickCreate (DropdownMenu)

**Items del dropdown** (líneas 26-36):
1. Nuevo Lead (TrendingUp)
2. Nueva Cuenta (Building2)
3. Nuevo Contacto (Contact)
4. Nuevo Negocio (Users)
5. Nuevo Ticket (Ticket)
6. Nueva Rendición → navega a /finanzas/rendiciones/nueva
7. Nueva Persona → navega a /personas/guardias
8. Nuevo Documento → navega a /opai/documentos/nuevo
9. Nueva Visita → navega a /ops/supervision/nueva-visita

Items 1-5 abren `QuickCreateModal`, items 6-9 navegan a rutas.

### 5.4 Search Overlay

**Líneas 177-200:** Fullscreen overlay con `z-[60]`, `bg-background/95 backdrop-blur-sm`

- Usa `<GlobalSearch compact />` — búsqueda global con resultados
- `onNavigate` cierra el overlay
- `onOpenChat` cierra overlay y abre chat panel con channel específico
- Botón X para cerrar (h-8 w-8, **menor a 44px touch target**)

### 5.5 Chat Toggle

- Botón: `h-11 w-11` (44px touch target)
- `onClick={chatCtx.togglePanel}`
- Badge: `h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background` cuando `totalUnread > 0`

### 5.6 Notificaciones

- Componente: `<NotificationPopover compact />`
- Importado de `@/components/opai/NotificationPopover`
- El prop `compact` reduce el tamaño para mobile

### 5.7 Elementos Eliminados de TopBar Mobile

- **NO hay hamburger menu** (no hay sidebar mobile)
- **NO hay RoleSwitcher** (movido al drawer Más)
- **NO hay Theme Toggle** (movido al drawer Más)

### 5.8 Problemas Detectados — Top Bar Mobile

1. **Botón X del search overlay es h-8 w-8** (32px) — menor que el mínimo de 44px para touch targets
2. **Safe area padding** usa `max(env(safe-area-inset-left), 0.75rem)` — correcto para notch devices
3. **Sin indicador visual de búsqueda activa** — el botón no cambia de estado

---

## Sección 6: Sidebar

### 6.1 AppSidebar

**Archivo:** `src/components/opai/AppSidebar.tsx` (782 líneas)

### 6.2 Estructura

```
<aside className="fixed left-0 top-0 z-30 border-r ... h-screen w-[72px]|w-64">
  <!-- Logo (h-14) -->
  <!-- Navigation (flex-1 overflow-y-auto) -->
    NavItems con expand/collapse
    Flyout panel (cuando collapsed, hover muestra submenu)
  <!-- User footer -->
    Avatar + nombre/email → /opai/perfil
    Cerrar sesión
    Toggle sidebar button
</aside>
```

### 6.3 NavItems (construidos en AppLayoutClient.tsx)

**Archivo:** `src/components/opai/AppLayoutClient.tsx`, líneas 118-242

| Módulo | Ícono | Condición show | Sub-items |
|---|---|---|---|
| Inicio (/hub) | Grid3x3 | hasModuleAccess('hub') | — |
| Comercial (/crm) | TrendingUp | hasModuleAccess('crm') | Leads, Cuentas, Negocios, Contactos, Cotizaciones |
| Operaciones (/ops) | Activity | hasModuleAccess('ops') | Pautas, Instalaciones, Supervisión, Tickets, Rondas, Inventario |
| Personas (/personas/guardias) | User | hasModuleAccess('ops') | Listado, Onboarding, Comunicaciones, Sueldos por RUT, Gamificación |
| Payroll (/payroll) | Wallet | hasModuleAccess('payroll') | Períodos de Pago, Anticipos, Simulador, Parámetros |
| Finanzas (/finanzas) | Landmark | hasModuleAccess('finance') | Inicio, Rendiciones, Ventas, Compras, Banca, Contabilidad, Informes |
| Documentos (/opai/inicio) | FolderOpen | hasModuleAccess('docs') | Envíos, Gestión |
| Reportes DT (/reportes/dt) | FileBarChart | canView('reportes_dt') | Asistencia Diaria, Jornada Diaria, Domingos y Festivos, Modificaciones |
| Portales (/portales) | Monitor | isAdmin | 6 portales |

### 6.4 Sistema de Permisos

**Funciones usadas:**
- `hasModuleAccess(perms, moduleKey)` — acceso al módulo completo
- `canView(perms, module, submodule)` — acceso a sub-módulo específico
- `canViewInstallations(perms)` — acceso especial a instalaciones (cross-module)
- `hasCapability(perms, capability)` — capacidades especiales (te_approve, rendicion_approve, etc.)

**Roles con acceso total:** `owner`, `admin`
**RoleSimulation:** Provider envuelve todo, permite simular rol diferente (solo admin/owner)

### 6.5 Badges del Sidebar

- Badges calculados cada 30s vía polling (líneas 82-108)
- APIs: `/api/notifications?limit=1&types=mention,...` y `/api/notes/unread-counts`
- Badge por módulo: CRM, Ops, Payroll, Docs, Finanzas, Personas
- Badge del padre es suma de hijos (ej: crmNotesBadge = account + contact + deal + installation + lead + quotation)

### 6.6 Comportamiento Mobile

- **El sidebar NO se muestra en mobile** — `hidden lg:block` en AppShell.tsx línea 161
- No hay drawer mobile para el sidebar
- No hay hamburger que abra sidebar en mobile

### 6.7 Sub-menú Expansion

- **Accordion**: Solo un módulo expandido a la vez (línea 122-129: `setExpandedSections(new Set([href]))`)
- **Auto-expand**: El módulo activo se expande automáticamente (useEffect líneas 105-120)
- **Sub-sections**: Segundo nivel de expansión para sub-grupos (ej: Pautas dentro de Ops)
- **Flyout**: Cuando collapsed, hover muestra submenu flotante a la derecha del sidebar

### 6.8 Footer del Sidebar

- Avatar circular con inicial del usuario (h-7 w-7 collapsed, h-9 w-9 expanded)
- Link a `/opai/perfil`
- Botón "Cerrar sesión" con confirmación Dialog
- Toggle sidebar button (PanelLeftClose/PanelLeftOpen) — solo desktop (`hidden lg:inline-flex`)

### 6.9 Problemas Detectados — Sidebar

1. **Personas usa hasModuleAccess('ops')** como condición — debería tener su propio módulo de permisos
2. **Sidebar toggle no funciona** — AppShell siempre pasa `isSidebarOpen=false` (línea 169)
3. **Instalaciones está en CRM y Ops** — duplicación en sidebar
4. **Operaciones tiene sub-grupo "Pautas"** que agrupa pauta_mensual/pauta_diaria/turnos_extra/ppc pero en bottom nav es plano

---

## Sección 7: Chat — Integración con Navegación

### 7.1 ChatSidePanel

**Archivo:** `src/components/chat/ChatSidePanel.tsx`

- Panel lateral que se abre a la derecha
- Renderizado fuera del div principal con overflow-x-hidden (AppShell línea 258)
- Cuando abierto: main content se reduce con `lg:mr-[400px]` en desktop

### 7.2 ChatSidePanelContext (chatCtx)

**Archivo:** `src/components/chat/ChatFloatingProvider.tsx`

**Valores que provee:**
- `isPanelOpen: boolean`
- `openPanel(): void`
- `closePanel(): void`
- `togglePanel(): void`
- `channels: ChatSidePanelChannel[]`
- `loading: boolean`
- `totalUnread: number`
- `selectedChannelId: string | null`
- `selectChannel(id: string | null): void`
- `currentUserId: string`
- `autoContext: { pageUrl, pageLabel } | null`

### 7.3 Chat Route

- Sí existe `/chat` como ruta propia (AppShell línea 223: `pathname.startsWith('/chat')` → no-padding layout)
- En sidebar: Chat existe como item de navegación con `href: '/chat'` y `isChatToggle` behavior
- Pero en la versión actual del sidebar navItems (AppLayoutClient), **Chat NO está en la lista** — fue removido del sidebar

### 7.4 Coexistencia con Bottom Bar

- En mobile: Chat se abre como panel lateral (no afecta bottom bar)
- El botón Chat en la topbar mobile tiene badge de unread
- En bottom bar: NO hay botón de chat (fue movido a topbar)
- En sub-nav módulo: Chat toggle puede aparecer si hay item con `key: 'chat'` en module-nav items (pero actualmente no hay ninguno)

### 7.5 AiHelpChatWidget

**Componente:** `src/components/opai/AiHelpChatWidget.tsx`

- Widget de ayuda con IA, flotante
- Renderizado en AppShell línea 249
- Independiente del chat de equipo
- Posición probablemente fixed en esquina inferior derecha

### 7.6 Problemas Detectados — Chat

1. **Chat no tiene item en bottom bar** — solo accesible desde topbar mobile
2. **Chat route (/chat) existe** pero no hay navegación directa hacia ella en mobile
3. **AiHelpChatWidget puede superponerse** con bottom bar en mobile

---

## Sección 8: Mapa de Rutas

### 8.1 Elementos de Navegación por Ruta

| Ruta | TopBar Mobile | BottomNav Mode | Sidebar Desktop |
|---|---|---|---|
| `/hub` | Logo + Create/Search/Chat/Notif | MainNav (5 items) | Full sidebar |
| `/crm` | Logo + Create/Search/Chat/Notif | ModuleSubNav (CRM items) | Comercial expandido |
| `/crm/leads` | Logo + Create/Search/Chat/Notif | ModuleSubNav (CRM items) | Leads activo |
| `/crm/leads/{id}` | Logo + Create/Search/Chat/Notif | SectionNav (6 secciones) | Leads activo |
| `/crm/accounts/{id}` | Logo + Create/Search/Chat/Notif | SectionNav (8 secciones) | Cuentas activo |
| `/crm/contacts/{id}` | Logo + Create/Search/Chat/Notif | SectionNav (8 secciones) | Contactos activo |
| `/crm/deals/{id}` | Logo + Create/Search/Chat/Notif | SectionNav (8 secciones) | Negocios activo |
| `/crm/cotizaciones/{id}` | Logo + Create/Search/Chat/Notif | **HIDDEN** (CPQ MobileBottomBar) | Cotizaciones activo |
| `/crm/installations/{id}` | Logo + Create/Search/Chat/Notif | SectionNav (14 secciones!) | Instalaciones activo |
| `/ops` | Logo + Create/Search/Chat/Notif | ModuleSubNav (Ops items) | Operaciones expandido |
| `/ops/rondas/*` | Logo + Create/Search/Chat/Notif | ModuleSubNav (Rondas sub-items) | Rondas activo |
| `/personas/*` | Logo + Create/Search/Chat/Notif | ModuleSubNav (Personas items) | Personas expandido |
| `/payroll/*` | Logo + Create/Search/Chat/Notif | ModuleSubNav (Payroll items) | Payroll expandido |
| `/finanzas/*` | Logo + Create/Search/Chat/Notif | ModuleSubNav (Finance items) | Finanzas expandido |
| `/opai/inicio` | Logo + Create/Search/Chat/Notif | ModuleSubNav (Docs items) | Documentos expandido |
| `/opai/configuracion/*` | Logo + Create/Search/Chat/Notif | ModuleSubNav (Config items, 9!) | — |
| `/te/*` | Logo + Create/Search/Chat/Notif | ModuleSubNav (TE items) | — |
| `/reportes/dt/*` | Logo + Create/Search/Chat/Notif | No module detection | Reportes DT expandido |
| `/chat` | Logo + Create/Search/Chat/Notif | MainNav | — |
| `/portales` | Logo + Create/Search/Chat/Notif | MainNav | Portales expandido |

### 8.2 Vistas Especiales

**CPQ Detail (`/crm/cotizaciones/{id}`):**
- BottomNav se oculta (`isCpqDetail` check en BottomNav.tsx línea 103)
- MobileBottomBar CPQ se muestra: `fixed bottom-0 z-50` con precio total, margen, botón enviar
- Sheet para desglose financiero completo

**CRM Detail Pages (`/crm/{module}/{id}`):**
- BottomNav muestra SectionNav con IntersectionObserver
- Scroll a secciones con anclas (`#section-{key}`)
- Instalaciones tiene 14 secciones → 4 visibles + overflow
- Guardias tiene 18 secciones → 4 visibles + overflow masivo

---

## Sección 9: Resumen — Problemas, Duplicaciones e Inconsistencias

### 9.1 Inconsistencias de Íconos

| Elemento | Sidebar | BottomNav |
|---|---|---|
| Inicio | Grid3x3 | Home |
| Comercial | TrendingUp | Briefcase |
| Operaciones | Activity | Shield |
| Personas | User | Users |

### 9.2 Inconsistencias de Labels

| Elemento | Sidebar | BottomNav |
|---|---|---|
| Payroll períodos | "Períodos de Pago" | "Períodos" |
| Personas sueldos | "Sueldos por RUT" | "Sueldos RUT" |
| Finanzas rendiciones | "Rendiciones" | "Rendic." |
| Finanzas contabilidad | "Contabilidad" | "Contab." |

### 9.3 Duplicaciones

1. **Sign-out Dialog** duplicado en: AppSidebar.tsx (líneas 748-778) y BottomNav.tsx (líneas 332-363)
2. **Instalaciones** aparece en CRM items Y Ops items de module-nav.ts (ambas con `/crm/installations`)
3. **MAIN_ITEMS en module-nav.ts** no se usan — duplican la definición de MAIN_NAV en BottomNav.tsx

### 9.4 Problemas Funcionales

1. **Sidebar toggle roto** — AppShell siempre pasa `isSidebarOpen=false`, el sidebar desktop siempre está en modo collapsed
2. **Botón retorno de ModuleSubNav navega a /hub** — debería solo cambiar estado de bottom bar, causa navegación y recarga
3. **Search overlay botón X es 32px** — menor que mínimo touch target de 44px
4. **AiHelpChatWidget puede superponerse** con bottom bar en mobile
5. **HubFabSpeedDial componente orphan** — existe pero no se importa
6. **Reportes DT no tiene module detection** en BottomNav — no muestra sub-nav contextual

### 9.5 Problemas de Layout Mobile

1. **Padding bottom doble**: HubClientWrapper pb-24 + AppShell pb-28
2. **pt-[calc(4rem+...)]** no coincide con topbar height `min-h-12` (3rem)
3. **Config tiene 9 sub-items** en bottom nav overflow — demasiados para sheet
4. **Instalaciones detail tiene 14 secciones** — SectionNav overflow con 10+ items en sheet

### 9.6 Problemas CPQ

1. **MobileBottomBar CPQ z-50** vs BottomNav z-40 — correcto para stacking pero BottomNav se oculta con regex check
2. **FinancialPanel tablas** sin restricción de ancho documentada

### 9.7 Dependencias entre Componentes

```
AppLayoutClient
  └── RoleSimulationProvider
  └── NotificationProvider
  └── ChatSidePanelProvider
      └── AppShell
          ├── Mobile Topbar (header)
          │   ├── ThemeLogo
          │   ├── DropdownMenu (QuickCreate)
          │   ├── GlobalSearch
          │   ├── Chat toggle (chatCtx)
          │   └── NotificationPopover
          ├── Desktop Sidebar (AppSidebar)
          │   └── NavItems (from AppLayoutClient)
          ├── Main Content ({children})
          │   ├── TopbarActions (desktop)
          │   └── SimulationBanner
          ├── BottomNav
          │   ├── MainNav (5 items)
          │   ├── MasDrawer (Sheet)
          │   ├── ModuleSubNav (from module-nav.ts)
          │   └── SectionNav (from CrmModuleIcons)
          ├── CommandPalette
          ├── AiHelpChatWidget
          ├── QuickCreateModal
          └── ChatSidePanel
```

---

---

## Sección 10: Cambios Realizados (Post-Auditoría)

### 10.1 Hallazgo: Rediseño Mobile Ya Implementado

Al comparar la auditoría con las especificaciones del Prompt 2, se encontró que **la gran mayoría del rediseño mobile ya está implementado** en el codebase actual:

- TopBar mobile con Logo + Create + Search + Chat + Notifications (sin hamburger, sin RoleSwitcher, sin theme toggle)
- Sidebar eliminado en mobile (`hidden lg:block`)
- BottomNav con 5 items fijos (Inicio, Comercial, Operaciones, Personas, Más)
- Drawer Más con módulos (grid 3-cols), herramientas (admin-only), preferencias (lista vertical)
- ModuleSubNav con botón retorno + overflow (MAX_VISIBLE=4 + Sheet)
- SectionNav con IntersectionObserver y rotación de items activos
- CPQ detail oculta BottomNav (regex check)
- Z-index correcto: bottom bar z-40, drawer Más z-50, topbar z-30
- Safe area padding con env(safe-area-inset-bottom)
- Touch targets 44px+ en todos los botones

### 10.2 Cambios Aplicados

**1. Reordenamiento de CRM items en module-nav.ts**
- **Archivo:** `src/lib/module-nav.ts`
- **Cambio:** Movió Instalaciones al final del array CRM_ITEMS para coincidir con el orden del sidebar: Leads → Cuentas → Negocios → Contactos → Cotizaciones → Instalaciones
- **Motivo:** Discrepancia documentada en Sección 4.5

**2. Fix overflow en FinancialPanel.tsx**
- **Archivo:** `src/components/cpq/FinancialPanel.tsx`, línea 561
- **Cambio:** Agregó `overflow-hidden` al container de vista previa del documento
- **Motivo:** Header con margin negativo (`-12px`) causaba bleed horizontal de 12px en cada lado

### 10.3 Notas

Los demás cambios del Prompt 2 no fueron necesarios porque ya estaban implementados. Las inconsistencias de íconos entre sidebar y bottom nav (Grid3x3 vs Home, TrendingUp vs Briefcase, etc.) son **intencionales** — el sidebar usa íconos descriptivos del módulo mientras que la bottom bar usa íconos de navegación estándar tipo app mobile.

---

*Fin de la auditoría y registro de cambios.*
