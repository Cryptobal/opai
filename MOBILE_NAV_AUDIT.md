# OPAI — Auditoría de Navegación Mobile

> Generado: 2026-03-14
> Stack: Next.js 15, React 18, TypeScript, Tailwind CSS, shadcn/ui dark theme
> Archivos clave analizados:
> - `src/components/opai/AppShell.tsx` — Layout principal
> - `src/components/opai/AppSidebar.tsx` — Sidebar
> - `src/components/opai/BottomNav.tsx` — Bottom nav
> - `src/components/opai/TopbarActions.tsx` — Desktop topbar
> - `src/components/opai/AppLayoutClient.tsx` — Construcción de navItems
> - `src/lib/module-nav.ts` — Configuración de bottom nav por módulo
> - `src/components/crm/CrmModuleIcons.ts` — Íconos y secciones CRM

---

## Sección 1: Sidebar

**Componente:** `src/components/opai/AppSidebar.tsx`
**Datos de entrada:** `navItems` construidos en `src/components/opai/AppLayoutClient.tsx` (líneas 118-242)

El sidebar es un componente genérico que recibe `navItems: NavItem[]`. Los items se construyen dinámicamente según los permisos del usuario.

### Items del Sidebar (orden de arriba a abajo)

| # | Label | Ícono (Lucide) | href | Tipo | Condición de visibilidad |
|---|-------|----------------|------|------|--------------------------|
| 1 | Inicio | `Grid3x3` | `/hub` | Enlace directo | `hasModuleAccess(permissions, 'hub')` |
| 2 | Comercial | `TrendingUp` | `/crm` | Con sub-menú (5) | `hasModuleAccess(permissions, 'crm')` |
| 3 | Operaciones | `Activity` | `/ops` | Con sub-menú (6) | `hasModuleAccess(permissions, 'ops')` |
| 4 | Personas | `User` | `/personas/guardias` | Con sub-menú (5) | `hasModuleAccess(permissions, 'ops')` ← ligado a ops |
| 5 | Payroll | `Wallet` | `/payroll` | Con sub-menú (4) | `hasModuleAccess(permissions, 'payroll')` |
| 6 | Finanzas | `Landmark` | `/finanzas` | Con sub-menú (7) | `hasModuleAccess(permissions, 'finance')` |
| 7 | Documentos | `FolderOpen` | `/opai/inicio` | Con sub-menú (2) | `hasModuleAccess(permissions, 'docs')` |
| 8 | Reportes DT | `FileBarChart` | `/reportes/dt` | Con sub-menú (4) | `canView(permissions, 'reportes_dt')` |
| 9 | Portales | `Monitor` | `/portales` | Con sub-menú (6) | Solo `owner` o `admin` |

### Sub-items por módulo

#### Comercial (CRM)
| Sub-item | Ícono | href | Condición |
|----------|-------|------|-----------|
| Leads | `Users` | `/crm/leads` | `canView(permissions, 'crm', 'leads')` |
| Cuentas | `Building2` | `/crm/accounts` | `canView(permissions, 'crm', 'accounts')` |
| Negocios | `TrendingUp` | `/crm/deals` | `canView(permissions, 'crm', 'deals')` |
| Contactos | `Contact` | `/crm/contacts` | `canView(permissions, 'crm', 'contacts')` |
| Cotizaciones | `DollarSign` | `/crm/cotizaciones` | `canView(permissions, 'crm', 'quotes')` |

#### Operaciones
| Sub-item | Ícono | href | Condición |
|----------|-------|------|-----------|
| Pautas (subgrupo nivel 3) | `CalendarDays` | `/ops/pautas` | Cualquiera de: pauta_mensual, pauta_diaria, turnos_extra, ppc |
| Instalaciones | `MapPin` | `/crm/installations` | `canViewInstallations(permissions)` |
| Supervisión | `ClipboardCheck` | `/ops/supervision` | `canView(permissions, 'ops', 'supervision')` |
| Tickets | `Ticket` | `/ops/tickets` | `canView(permissions, 'ops', 'tickets')` |
| Rondas | `Route` | `/ops/rondas` | `canView(permissions, 'ops', 'rondas')` |
| Inventario | `Package` | `/ops/inventario` | `canView(permissions, 'ops', 'inventario')` |

#### Personas
| Sub-item | Ícono | href | Condición |
|----------|-------|------|-----------|
| Listado | `User` | `/personas/guardias` | Siempre visible |
| Onboarding | `UserRoundCheck` | `/personas/onboarding` | Siempre visible |
| Comunicaciones | `Bell` | `/personas/comunicaciones` | Siempre visible |
| Sueldos por RUT | `DollarSign` | `/personas/guardias/sueldos-rut` | Siempre visible |
| Gamificación | `Trophy` | `/personas/gamificacion` | `canView(permissions, 'ops', 'gamificacion')` |

#### Payroll
| Sub-item | Ícono | href | Condición |
|----------|-------|------|-----------|
| Períodos de Pago | `CalendarDays` | `/payroll/periodos` | Siempre visible |
| Anticipos | `Wallet` | `/payroll/anticipos` | Siempre visible |
| Simulador | `Calculator` | `/payroll/simulator` | Siempre visible |
| Parámetros | `FileText` | `/payroll/parameters` | Siempre visible |

#### Finanzas
| Sub-item | Ícono | href | Condición |
|----------|-------|------|-----------|
| Inicio | `Grid3x3` | `/finanzas` | `canView 'reportes'` o `hasCapability 'rendicion_view_all'` |
| Rendiciones | `Receipt` | `/finanzas/rendiciones` | `canView(permissions, 'finance', 'rendiciones')` |
| Ventas | `FileText` | `/finanzas/facturacion` | `canView(permissions, 'finance', 'facturacion')` |
| Compras | `Building2` | `/finanzas/proveedores` | `canView(permissions, 'finance', 'proveedores')` |
| Banca | `Landmark` | `/finanzas/bancos` | `canView(permissions, 'finance', 'contabilidad')` |
| Contabilidad | `BookText` | `/finanzas/contabilidad` | `canView(permissions, 'finance', 'contabilidad')` |
| Informes | `BarChart3` | `/finanzas/reportes` | `canView(permissions, 'finance', 'reportes')` |

#### Documentos
| Sub-item | Ícono | href | Condición |
|----------|-------|------|-----------|
| Envíos | `FileText` | `/opai/inicio` | Siempre visible |
| Gestión | `FolderOpen` | `/opai/documentos` | Siempre visible |

#### Reportes DT
| Sub-item | Ícono | href | Condición |
|----------|-------|------|-----------|
| Asistencia Diaria | `FileBarChart` | `/reportes/dt/asistencia-diaria` | Siempre visible |
| Jornada Diaria | `FileBarChart` | `/reportes/dt/jornada-diaria` | Siempre visible |
| Domingos y Festivos | `FileBarChart` | `/reportes/dt/domingos-festivos` | Siempre visible |
| Modificaciones | `FileBarChart` | `/reportes/dt/modificaciones-turnos` | Siempre visible |

#### Portales (solo admin/owner)
| Sub-item | Ícono | href | Condición |
|----------|-------|------|-----------|
| Portal Guardia | `Shield` | `/portal/guardia` | `isAdmin` |
| Portal Rondas | `Route` | `/portal/rondas` | `isAdmin` |
| Portal Cliente | `Users` | `/portal/cliente` | `isAdmin` |
| Portal Supervisor | `ClipboardCheck` | `/portal/supervisor` | `isAdmin` |
| Portal Marcación | `Fingerprint` | `/portal/marcacion` | `isAdmin` |
| Control de Acceso | `ScanLine` | `/portal/acceso` | `isAdmin` |

### Controles del footer del sidebar

| Control | Ícono | Ubicación | Acción |
|---------|-------|-----------|--------|
| Perfil de usuario | Avatar (iniciales) | Footer, arriba de logout | Navega a `/opai/perfil` |
| Cerrar sesión | `LogOut` | Footer, debajo del perfil | Abre Dialog de confirmación → `signOut({ callbackUrl: '/opai/login' })` |
| Toggle sidebar | `PanelLeftClose` / `PanelLeftOpen` | Footer, esquina inferior | Solo visible en desktop (lg+). Colapsa/expande sidebar |

### Comportamiento en mobile
- El sidebar NO se muestra por defecto en mobile
- Se abre como drawer desde la izquierda al tocar el hamburger (`Menu` icon)
- Ancho: `w-[320px] max-w-[88vw]`
- Z-index: `z-50` (drawer) sobre `z-40` (overlay oscuro)
- Al expandirse muestra close button (`X` icon) arriba a la derecha
- Al navegar se cierra automáticamente (`onNavigate`)

### Sistema de badges
- Badges dinámicos por módulo: conteo de notas/menciones sin leer
- Se obtienen de `/api/notes/unread-counts` cada 30 segundos
- Se actualizan al evento `opai-note-seen`
- Punto rojo animado (`animate-pulse`) cuando hay badge > 0

---

## Sección 2: Bottom Bar

**Componente:** `src/components/opai/BottomNav.tsx`
**Configuración:** `src/lib/module-nav.ts`

### Comportamiento general
- **Visible solo en mobile** (`lg:hidden`)
- **Posición:** `fixed bottom-0 left-0 right-0 z-40`
- **Altura:** `h-14` (56px) + `pb-[env(safe-area-inset-bottom)]`
- **Contexto:** Cambia dinámicamente según la ruta activa (patrón Salesforce/HubSpot)
- Exporta su altura real como CSS variable `--bottom-nav-height`

### Tres modos de operación

#### Modo 1: Navegación principal (rutas generales como `/hub`, `/chat`)
| # | Key | Label | Ícono | href | Condición |
|---|-----|-------|-------|------|-----------|
| 1 | hub | Inicio | `Grid3x3` | `/hub` | `hasModuleAccess 'hub'` |
| 2 | chat | Chat | `MessageCircle` | `/chat` | Siempre visible |
| 3 | docs | Docs | `FileText` | `/opai/inicio` | `hasModuleAccess 'docs'` |
| 4 | crm | CRM | `Building2` | `/crm` | `hasModuleAccess 'crm'` |
| 5 | payroll | Payroll | `Calculator` | `/payroll` | `hasModuleAccess 'payroll'` |
| 6 | ops | Ops | `ClipboardList` | `/ops` | `hasModuleAccess 'ops'` |
| 7 | finance | Finanzas | `Receipt` | `/finanzas` | `hasModuleAccess 'finance'` |
| 8 | config | Config | `Settings` | `/opai/configuracion` | `hasModuleAccess 'config'` |

> **Nota:** Con 8 items potenciales, activa modo compact (`items.length > 5`): fuente `text-[10px]`, íconos `h-4 w-4`, `overflow-x-auto scrollbar-hide`

#### Modo 2: Navegación dentro de un módulo (sub-tabs)

**CRM** (`/crm/*`):
| # | Key | Label | Ícono | href |
|---|-----|-------|-------|------|
| 1 | crm-leads | Leads | `Users` | `/crm/leads` |
| 2 | crm-accounts | Cuentas | `Building2` | `/crm/accounts` |
| 3 | crm-installations | Instalaciones | `MapPin` | `/crm/installations` |
| 4 | crm-deals | Negocios | `TrendingUp` | `/crm/deals` |
| 5 | crm-contacts | Contactos | `Contact` | `/crm/contacts` |
| 6 | crm-quotes | Cotizaciones | `DollarSign` | `/crm/cotizaciones` |

**Ops** (`/ops/*` excepto rondas):
| # | Key | Label | Ícono | href |
|---|-----|-------|-------|------|
| 1 | ops-installations | Instalaciones | `MapPin` | `/crm/installations` |
| 2 | ops-pauta-mensual | Mensual | `CalendarDays` | `/ops/pauta-mensual` |
| 3 | ops-pauta-diaria | Diaria | `UserRoundCheck` | `/ops/pauta-diaria` |
| 4 | ops-refuerzos | Refuerzo | `Clock3` | `/ops/refuerzos` |
| 5 | ops-marcaciones | Marcaciones | `Fingerprint` | `/ops/marcaciones` |
| 6 | ops-ppc | PPC | `ShieldAlert` | `/ops/ppc` |
| 7 | ops-rondas | Rondas | `Route` | `/ops/rondas` |
| 8 | ops-tickets | Tickets | `Ticket` | `/ops/tickets` |

**Rondas** (`/ops/rondas/*`):
| # | Key | Label | Ícono | href |
|---|-----|-------|-------|------|
| 1 | rondas-dashboard | Dashboard | `ClipboardList` | `/ops/rondas` |
| 2 | rondas-monitoreo | Monitor | `Radio` | `/ops/rondas/monitoreo` |
| 3 | rondas-alertas | Alertas | `Bell` | `/ops/rondas/alertas` |
| 4 | rondas-checkpoints | Puntos | `MapPin` | `/ops/rondas/checkpoints` |
| 5 | rondas-config | Config | `Settings` | `/ops/rondas/templates` |

**TE** (`/te/*`):
| # | Key | Label | Ícono | href |
|---|-----|-------|-------|------|
| 1 | te-registro | Registro | `ClipboardList` | `/te/registro` |
| 2 | te-aprobaciones | Aprobaciones | `CheckCircle2` | `/te/aprobaciones` |
| 3 | te-lotes | Lotes | `Layers` | `/te/lotes` |
| 4 | te-pagos | Pagos | `Banknote` | `/te/pagos` |

**Personas** (`/personas/*`):
| # | Key | Label | Ícono | href |
|---|-----|-------|-------|------|
| 1 | personas-listado | Listado | `Shield` | `/personas/guardias` |
| 2 | personas-onboarding | Onboarding | `UserRoundCheck` | `/personas/onboarding` |
| 3 | personas-comunicaciones | Comunicaciones | `Bell` | `/personas/comunicaciones` |
| 4 | personas-sueldos-rut | Sueldos RUT | `DollarSign` | `/personas/guardias/sueldos-rut` |

**Payroll** (`/payroll/*`):
| # | Key | Label | Ícono | href |
|---|-----|-------|-------|------|
| 1 | payroll-periodos | Períodos | `CalendarDays` | `/payroll/periodos` |
| 2 | payroll-anticipos | Anticipos | `Banknote` | `/payroll/anticipos` |
| 3 | payroll-simulator | Simulador | `Calculator` | `/payroll/simulator` |
| 4 | payroll-parameters | Parámetros | `FileText` | `/payroll/parameters` |

**Documentos** (`/opai/inicio`, `/opai/documentos`, `/opai/templates`):
| # | Key | Label | Ícono | href |
|---|-----|-------|-------|------|
| 1 | docs-presentaciones | Envíos | `FileText` | `/opai/inicio` |
| 2 | docs-gestion | Gestión | `FolderOpen` | `/opai/documentos` |

**Finanzas** (`/finanzas/*`):
| # | Key | Label | Ícono | href |
|---|-----|-------|-------|------|
| 1 | finance-rendiciones | Rendic. | `Receipt` | `/finanzas/rendiciones` |
| 2 | finance-ventas | Ventas | `FileText` | `/finanzas/facturacion` |
| 3 | finance-compras | Compras | `Building2` | `/finanzas/proveedores` |
| 4 | finance-banca | Banca | `Landmark` | `/finanzas/bancos` |
| 5 | finance-contabilidad | Contab. | `BookText` | `/finanzas/contabilidad` |
| 6 | finance-informes | Informes | `BarChart3` | `/finanzas/reportes` |

**Configuración** (`/opai/configuracion/*`):
| # | Key | Label | Ícono | href |
|---|-----|-------|-------|------|
| 1 | config-users | Usuarios | `Users` | `/opai/configuracion/usuarios` |
| 2 | config-groups | Grupos | `Users` | `/opai/configuracion/grupos` |
| 3 | config-integrations | Integraciones | `Plug` | `/opai/configuracion/integraciones` |
| 4 | config-notifications | Alertas | `Bell` | `/opai/configuracion/notificaciones` |
| 5 | config-crm | CRM | `TrendingUp` | `/opai/configuracion/crm` |
| 6 | config-cpq | CPQ | `DollarSign` | `/opai/configuracion/cpq` |
| 7 | config-ops | Ops | `ClipboardList` | `/opai/configuracion/ops` |
| 8 | config-ticket-types | Tickets | `Ticket` | `/opai/configuracion/tipos-ticket` |
| 9 | config-ia | IA | `Sparkles` | `/opai/configuracion/inteligencia-artificial` |

#### Modo 3: Navegación de secciones en detalle CRM (scroll a anclas)

En páginas de detalle como `/crm/leads/{id}`, `/crm/accounts/{id}`, etc., la bottom bar muestra secciones del registro con scroll a anclas (`#section-{key}`). Usa `IntersectionObserver` para trackear la sección activa.

**Secciones por tipo de registro:**

| Módulo | Secciones | Cantidad |
|--------|-----------|----------|
| **Leads** | general, account, contacts, deals, installations, files | 6 |
| **Accounts** | general, contacts, installations, deals, quotes, rendiciones, communication, notes | 8 |
| **Contacts** | general, account, installations, deals, quotes, communication, notes, files | 8 |
| **Deals** | general, account, contacts, installations, quotes, followup, communication, notes | 8 |
| **Installations** | general, account, contacts, deals, quotes, staffing, refuerzos, dotacion, marcacion_asistencia, marcacion_rondas, rendiciones, uniformes-activos, notes, files | 14 |
| **Guardias** | datos, contratos, eventos-laborales, estructura-sueldo, liquidaciones, asignacion, marcacion, rondas, documentos, docs-vinculados, cuentas, communication, comentarios, dias-trabajados, turnos-extra, rendiciones, historial, uniformes | 18 |

### Chat como item especial
- El item "Chat" en la bottom bar principal NO navega — es un `<button>` que togglea `chatCtx.togglePanel()`
- Muestra badge rojo con conteo de no leídos (`chatCtx.totalUnread`)
- Badge: `99+` si > 99

### Modo compact
- Se activa cuando `items.length > 5`
- Cambios: fuente `text-[10px]` (vs `text-[11px]`), íconos `h-4 w-4` (vs `h-5 w-5`), padding `px-1.5` (vs `px-3`)
- Contenedor: `overflow-x-auto scrollbar-hide`
- Items con `shrink-0` para permitir scroll horizontal

---

## Sección 3: Top Bar

**Componente:** `src/components/opai/AppShell.tsx` (líneas 129-212) — Mobile
**Componente:** `src/components/opai/TopbarActions.tsx` — Desktop

### Mobile Top Bar (solo visible < lg)

**Posición:** `fixed top-0 left-0 right-0 z-30`, altura `min-h-12`

| # | Posición | Elemento | Ícono | Acción | Tipo |
|---|----------|----------|-------|--------|------|
| 1 | Izquierda | Logo + "OPAI" | ThemeLogo | Navega a `/hub` | Link |
| 2 | Izquierda | Role Switcher | `Eye` / `EyeOff` | Abre dropdown para simular rol | Dropdown (solo owner/admin) |
| 3 | Izquierda | Crear nuevo | `Plus` | Abre menú de creación rápida (9 items) | Dropdown |
| 4 | Derecha | Theme Toggle | `Sun` / `Moon` | Toggle claro/oscuro | Button |
| 5 | Derecha | Buscar | `Search` | Abre overlay de búsqueda fullscreen (z-[60]) | Button → Modal |
| 6 | Derecha | Chat | `MessageCircle` | Toggle ChatSidePanel | Button |
| 7 | Derecha | Notificaciones | `Bell` | Abre popover de notificaciones | Popover |
| 8 | Derecha | Menú hamburger | `Menu` | Abre drawer del sidebar | Button → Drawer |

### Items del menú "Crear nuevo" (Plus)
| # | Label | Ícono | Acción |
|---|-------|-------|--------|
| 1 | Nuevo Lead | `TrendingUp` | Abre QuickCreateModal |
| 2 | Nueva Cuenta | `Building2` | Abre QuickCreateModal |
| 3 | Nuevo Contacto | `Contact` | Abre QuickCreateModal |
| 4 | Nuevo Negocio | `Users` | Abre QuickCreateModal |
| 5 | Nuevo Ticket | `Ticket` | Abre QuickCreateModal |
| 6 | Nueva Rendición | `Receipt` | Navega a `/finanzas/rendiciones/nueva` |
| 7 | Nueva Persona | `Shield` | Navega a `/personas/guardias` |
| 8 | Nuevo Documento | `FileText` | Navega a `/opai/documentos/nuevo` |
| 9 | Nueva Visita | `Activity` | Navega a `/ops/supervision/nueva-visita` |

### Desktop Top Bar (solo visible ≥ lg)

| # | Elemento | Ícono | Acción |
|---|----------|-------|--------|
| 1 | GlobalSearch (w-72) | `Search` | Búsqueda global con resultados inline |
| 2 | Crear nuevo | `Plus` | Dropdown (11 items, incluye Turno Extra, Refuerzo, Visita) |
| 3 | Role Switcher | `Eye` | Simular rol (solo owner/admin) |
| 4 | Fiscalización DT | `Shield` | Solo si `userRole === "inspector_dt"`, navega a `/fiscalizacion` |
| 5 | (spacer) | — | — |
| 6 | Theme Toggle | `Sun`/`Moon` | Toggle tema |
| 7 | Chat | `MessageCircle` | Toggle ChatSidePanel |
| 8 | Notificaciones | `Bell` | Popover |
| 9 | Configuración | `Settings` | Navega a `/opai/configuracion` |
| 10 | Avatar + User Menu | Avatar | Dropdown: Mi perfil, Mis notificaciones, Cerrar sesión |

### El "ojo" (Eye icon)
No es un selector de vista general. Es el **RoleSwitcher**: permite a users `owner`/`admin` simular la interfaz desde la perspectiva de otro rol. Muestra `Eye` + label del rol + `ChevronDown`.

### Z-index hierarchy
| Z-index | Componente |
|---------|-----------|
| z-30 | Mobile topbar |
| z-40 | BottomNav, Chat panel base |
| z-50 | Mobile sidebar drawer, MobileBottomBar (CPQ) |
| z-[60] | Mobile search overlay |
| z-[100] | RoleSwitcher dropdown |
| z-[9999] | GlobalSearch dropdown (portal) |

---

## Sección 4: Navegación por Módulo

### Resumen de sub-tabs por módulo

| Módulo | Sub-tabs en Bottom Nav | Sub-items en Sidebar | Cantidad BN | Cantidad SB |
|--------|------------------------|---------------------|-------------|-------------|
| **CRM** | Leads, Cuentas, Instalaciones, Negocios, Contactos, Cotizaciones | Leads, Cuentas, Negocios, Contactos, Cotizaciones | 6 | 5 |
| **Ops** | Instalaciones, Mensual, Diaria, Refuerzo, Marcaciones, PPC, Rondas, Tickets | Pautas (subgrupo), Instalaciones, Supervisión, Tickets, Rondas, Inventario | 8 | 6 |
| **Rondas** (sub-módulo Ops) | Dashboard, Monitor, Alertas, Puntos, Config | — (navega desde Ops) | 5 | — |
| **TE** | Registro, Aprobaciones, Lotes, Pagos | — (no está en sidebar) | 4 | 0 |
| **Personas** | Listado, Onboarding, Comunicaciones, Sueldos RUT | Listado, Onboarding, Comunicaciones, Sueldos RUT, Gamificación | 4 | 5 |
| **Payroll** | Períodos, Anticipos, Simulador, Parámetros | Períodos, Anticipos, Simulador, Parámetros | 4 | 4 |
| **Documentos** | Envíos, Gestión | Envíos, Gestión | 2 | 2 |
| **Finanzas** | Rendic., Ventas, Compras, Banca, Contab., Informes | Inicio, Rendiciones, Ventas, Compras, Banca, Contabilidad, Informes | 6 | 7 |
| **Config** | Usuarios, Grupos, Integraciones, Alertas, CRM, CPQ, Ops, Tickets, IA | — (no está en sidebar como sub-items) | 9 | 0 |
| **Reportes DT** | — (no hay bottom nav propio) | Asist. Diaria, Jornada, Domingos, Modificaciones | 0 | 4 |

### Módulos con más sub-tabs en Bottom Nav
1. **Config** — 9 items (modo compact obligatorio)
2. **Ops** — 8 items (modo compact obligatorio)
3. **CRM** — 6 items (modo compact obligatorio)
4. **Finanzas** — 6 items (modo compact obligatorio)
5. **Rondas** — 5 items (justo en el límite)
6. **Personas** — 4 items
7. **Payroll** — 4 items
8. **TE** — 4 items
9. **Documentos** — 2 items

### Detalle CRM — secciones más grandes
1. **Guardias** — 18 secciones (scroll horizontal obligatorio)
2. **Installations** — 14 secciones (scroll horizontal obligatorio)
3. **Accounts/Contacts/Deals** — 8 secciones cada uno
4. **Leads** — 6 secciones

---

## Sección 5: Duplicaciones y Conflictos

### Items en AMBOS sidebar y bottom bar

| Item | Sidebar | Bottom Bar | Discrepancia |
|------|---------|------------|-------------|
| Inicio | ✅ `Grid3x3` → `/hub` | ✅ `Grid3x3` → `/hub` | Ninguna |
| CRM/Comercial | ✅ `TrendingUp` → `/crm` label "Comercial" | ✅ `Building2` → `/crm` label "CRM" | **Ícono diferente, label diferente** |
| Ops/Operaciones | ✅ `Activity` → `/ops` label "Operaciones" | ✅ `ClipboardList` → `/ops` label "Ops" | **Ícono diferente, label diferente** |
| Payroll | ✅ `Wallet` → `/payroll` | ✅ `Calculator` → `/payroll` | **Ícono diferente** |
| Finanzas | ✅ `Landmark` → `/finanzas` | ✅ `Receipt` → `/finanzas` | **Ícono diferente** |
| Documentos/Docs | ✅ `FolderOpen` → `/opai/inicio` label "Documentos" | ✅ `FileText` → `/opai/inicio` label "Docs" | **Ícono diferente, label diferente** |
| Config | ✅ No en sidebar top-level | ✅ `Settings` → `/opai/configuracion` | Solo en bottom bar |
| Chat | ✅ Botón en topbar (`MessageCircle`) | ✅ En bottom bar principal (`MessageCircle`) | **Duplicado en topbar Y bottom bar** |

### Items SOLO en sidebar (no en bottom bar principal)
| Item | Sidebar |
|------|---------|
| Personas | `User` → `/personas/guardias` |
| Reportes DT | `FileBarChart` → `/reportes/dt` |
| Portales | `Monitor` → `/portales` (solo admin) |

### Items SOLO en bottom bar (no en sidebar)
| Item | Bottom Bar |
|------|------------|
| Chat | `MessageCircle` → toggle panel (también en topbar) |
| Config | `Settings` → `/opai/configuracion` (como item principal) |

### Sub-items con diferencias sidebar vs bottom bar

| Módulo | Solo Sidebar | Solo Bottom Nav |
|--------|-------------|-----------------|
| **CRM** | — | Instalaciones (`MapPin` → `/crm/installations`) |
| **Ops** | Supervisión, Inventario | Mensual, Diaria, Refuerzo, Marcaciones, PPC |
| **Personas** | Gamificación | — |
| **Finanzas** | Inicio (dashboard) | — |
| **Config** | — (no hay sub-items en sidebar) | 9 sub-items completos |
| **Reportes DT** | 4 sub-items | — (no tiene bottom nav) |
| **TE** | — (no está en sidebar) | 4 sub-items |

### Cuándo se muestra cada componente en mobile

| Componente | Visibilidad | Condición |
|-----------|-------------|-----------|
| Top bar | Siempre visible en mobile | `sidebar` prop exists (siempre en AppShell) |
| Bottom bar | Siempre visible en mobile | `userRole` exists y `pathname` exists |
| Sidebar drawer | Bajo demanda | Al tocar hamburger menu |
| Chat panel | Bajo demanda | Al tocar MessageCircle |

**Conflicto confirmado:** El sidebar drawer Y la bottom bar pueden estar visibles simultáneamente. El sidebar drawer tiene overlay oscuro (z-40) pero la bottom bar (z-40) puede verse por debajo. Sin embargo, el sidebar drawer está posicionado `top-0 h-screen` cubriendo toda la pantalla.

---

## Sección 6: CPQ Mobile

**Componentes clave:**
- `src/components/cpq/CpqQuoteDetail.tsx` — Vista de detalle
- `src/components/cpq/MobileBottomBar.tsx` — Barra fija inferior CPQ
- `src/components/cpq/FinancialPanel.tsx` — Panel financiero con tablas

### Barra fija inferior (MobileBottomBar)

**Posición:** `fixed bottom-14 left-0 right-0 z-50`
- Hardcodeado a `bottom-14` (56px) para sentarse ENCIMA de la BottomNav
- z-50 > z-40 de BottomNav → correcto layering
- **Problema potencial:** si BottomNav cambia de altura (safe-area-inset-bottom), puede haber gap o overlap
- Padding: `px-4 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]`

### Spacing del contenido

```
<div className="space-y-2 pb-20 lg:pb-4">     ← 80px padding bottom mobile
  {/* todo el contenido */}
</div>
<div className="h-28 lg:hidden" />              ← 112px spacer adicional mobile
<MobileBottomBar />                              ← barra fija
```

**Total espacio reservado en mobile:** ~192px de padding + 56px BottomNav + ~48px MobileBottomBar = **~296px** en un viewport de ~667px (iPhone).

### Problemas de overflow-x

**FinancialPanel.tsx** — Tablas con overflow horizontal:

1. **Tabla de posiciones** (líneas 625-681):
   - Envuelta en `<div className="overflow-x-auto">`
   - Columnas: Puesto, G, Cant, Dias, Horario, Precio
   - **Problema:** La columna "Puesto" puede tener nombres largos (40+ caracteres) sin truncamiento
   - Font: `text-[10px]` pero sin `break-words` ni `truncate`

2. **Tabla de servicios adicionales** (líneas 692-735):
   - Columnas: Producto/Servicio, Descripción, Valor Mensual
   - **Problema:** La columna "Descripción" puede ser muy larga sin restricciones de ancho
   - **NO tiene wrapper `overflow-x-auto`** ← bug confirmado

### Elementos con width potencialmente excesivo

- Sticky header: `sticky top-[53px]` z-10 — podría tener conflictos con scroll
- CpqQuoteDetail layout: `min-w-0 lg:pr-5` en columna izquierda
- CpqPositionCard: `flex-1 min-w-0` — correcto para truncamiento
- No se detectaron elementos con `width` fijo > 375px explícito

### Superposición MobileBottomBar vs BottomNav

| Componente | Posición | Z-index | Altura |
|-----------|----------|---------|--------|
| BottomNav | `fixed bottom-0` | z-40 | h-14 (56px) + safe-area |
| MobileBottomBar CPQ | `fixed bottom-14` | z-50 | ~48-56px + safe-area |
| Sheet (modales) | `fixed bottom-0` | z-50 | variable, `max-h-[85vh]` |

**Estado actual:** MobileBottomBar se posiciona arriba de BottomNav. Ambas son visibles simultáneamente en la vista CPQ. No hay overlap directo pero hay **doble safe-area padding** (ambas aplican `env(safe-area-inset-bottom)`).

---

## Sección 7: Portales

Los 6 portales son **PWAs independientes** con sus propios manifests. Ninguno usa el AppShell principal ni el sidebar.

### Portal Guardia (`/portal/guardia`)

| Aspecto | Detalle |
|---------|---------|
| **Bottom Nav** | Sí — 5 items fijos |
| **Sidebar** | No |
| **Manifest** | `manifest-guardia.json` |
| **Logout** | Botón en header/perfil → limpia localStorage |

**Bottom Nav items:**
| # | Label | Ícono |
|---|-------|-------|
| 1 | Inicio | `Home` |
| 2 | Desempeño | `TrendingUp` |
| 3 | Solicitudes | `Ticket` |
| 4 | Chat | `MessageCircle` |
| 5 | Perfil | `User` |

**Secciones adicionales** (accesibles desde lista principal, no en bottom nav): Mi Pauta, Asistencia, Marcaciones, Turnos Extra, Documentos, Mi Protocolo, Exámenes, Mis Resultados, Control Acceso (13 secciones totales).

---

### Portal Supervisor (`/portal/supervisor`)

| Aspecto | Detalle |
|---------|---------|
| **Bottom Nav** | Sí — 4 items + botón "Más" |
| **Sidebar** | No |
| **Manifest** | `manifest-supervisor.json` |
| **Logout** | PIN verification → `LogoutPinModal` |

**Bottom Nav items:**
| # | Label | Ícono |
|---|-------|-------|
| 1 | Inicio | `LayoutDashboard` |
| 2 | Visitas | `ClipboardCheck` |
| 3 | Equipo | `Users` |
| 4 | Chat | `MessageSquare` |
| 5 | Más | `Menu` → abre Sheet overlay |

**Items en "Más":** Pautas (`Calendar`), Turnos Extra (`Clock`), Rendiciones (`Receipt`), Refuerzos (`AlertTriangle`), Instalaciones (`MapPin`), Tickets (`Ticket`), Visita Técnica (`Briefcase`).

---

### Portal Cliente (`/portal/cliente`)

| Aspecto | Detalle |
|---------|---------|
| **Bottom Nav** | Sí — 4 items + menú "Más" expandible |
| **Sidebar** | No |
| **Manifest** | `manifest-cliente.json` |
| **Logout** | User menu en header → POST `/api/portal/cliente/logout` |

**Bottom Nav items:**
| # | Label | Ícono |
|---|-------|-------|
| 1 | Dashboard | `LayoutDashboard` |
| 2 | Instalaciones | `Building2` |
| 3 | Rondas | `MapPin` |
| 4 | Posta | `BookOpen` |

**Items en "Más":** Chat, Tickets, Alertas, Reportes, Comparativa, Desempeño, Encuestas, Documentación, Cotizaciones, Personal, Empresa, Control Acceso. Items gated por `PortalConfig`.

**Especial:** Prospect mode con items únicos (Propuesta, Nosotros).

---

### Portal Marcación (`/portal/marcacion`)

| Aspecto | Detalle |
|---------|---------|
| **Bottom Nav** | **No** — app de propósito único (kiosk) |
| **Sidebar** | No |
| **Manifest** | `manifest-marcacion.json` |
| **Logout** | PIN modal → limpia device token |

**Navegación:** State machine con 8 modos: `loading` → `pairing` → `rut-entry` → `face-verify` → `success`. No hay navegación multi-sección. Face ID + GPS requeridos.

---

### Portal Acceso (`/portal/acceso`)

| Aspecto | Detalle |
|---------|---------|
| **Bottom Nav** | Sí — 4 tabs |
| **Sidebar** | No |
| **Manifest** | `manifest-acceso.json` |
| **Logout** | PIN modal en tab "Más" |

**Bottom Nav items:**
| # | Label | Ícono |
|---|-------|-------|
| 1 | Inicio | `Home` |
| 2 | Registro | `ClipboardList` |
| 3 | En Sitio | `Users` |
| 4 | Más | `MoreHorizontal` |

**Especial:** Modo standby tras 5 min inactividad. Wake lock para kiosk.

---

### Portal Rondas (`/portal/rondas`)

| Aspecto | Detalle |
|---------|---------|
| **Bottom Nav** | Sí — 5 tabs (con botones especiales) |
| **Sidebar** | No |
| **Manifest** | `portal-rondas-manifest.json` |
| **Logout** | PIN modal desde perfil |

**Bottom Nav items:**
| # | Label | Ícono | Estilo especial |
|---|-------|-------|-----------------|
| 1 | Mis Rondas | `MapPin` | Normal |
| 2 | Chat | `MessageCircle` | Normal |
| 3 | Pánico | `AlertTriangle` | **Rojo** — botón de emergencia |
| 4 | Incidente | `FileWarning` | **Ámbar** — reporte rápido |
| 5 | Perfil | `User` | Normal |

**Especial:** Botón de pánico con feedback en tiempo real (Pusher). Tour de onboarding para nuevos guardias.

---

### Resumen Portales

| Portal | Bottom Nav | Items | Sidebar | Logout | Auth |
|--------|:----------:|:-----:|:-------:|--------|------|
| Guardia | ✅ | 5 | ❌ | Header/Perfil | Email+PIN |
| Supervisor | ✅ | 4+7 | ❌ | PIN Modal | Device/API |
| Cliente | ✅ | 4+12 | ❌ | Header menu | Email+PIN |
| Marcación | ❌ | — | ❌ | PIN Modal | Device pairing |
| Acceso | ✅ | 4 | ❌ | PIN en tab Más | Device pairing |
| Rondas | ✅ | 5 | ❌ | PIN en Perfil | Device/Legacy |

---

## Sección 8: Resumen

### Totales de navegación

| Métrica | Valor |
|---------|-------|
| Items top-level en sidebar | 9 módulos |
| Sub-items totales en sidebar | ~43 |
| Items en bottom bar principal | 8 (modo compact) |
| Módulos con sub-nav en bottom bar | 10 (CRM, Ops, Rondas, TE, Personas, Payroll, Docs, Finanzas, Config, detalle CRM) |
| Total sub-items en bottom bar | ~56 |
| Items en topbar mobile | 8 controles |
| Portales con bottom nav propio | 5 de 6 |

### Problemas principales identificados

1. **Inconsistencia de íconos:** CRM usa `TrendingUp` en sidebar pero `Building2` en bottom bar. Lo mismo ocurre con Ops, Payroll, Finanzas y Documentos.

2. **Inconsistencia de labels:** "Comercial" vs "CRM", "Operaciones" vs "Ops", "Documentos" vs "Docs".

3. **Duplicación de Chat:** Aparece en topbar (MessageCircle), en bottom bar principal, Y como toggle — triple presencia en mobile.

4. **Módulos solo en un lugar:**
   - Personas: solo sidebar (no en bottom bar principal)
   - Reportes DT: solo sidebar
   - TE: solo bottom bar (no en sidebar)
   - Config: sus sub-items solo en bottom bar contextual

5. **Overflow en bottom bar:** Config (9 items), Ops (8 items), Guardias detalle (18 secciones), Installations detalle (14 secciones) — todos requieren scroll horizontal.

6. **CPQ barra doble:** En vista cotización hay MobileBottomBar (precio/enviar) + BottomNav visible simultáneamente, consumiendo ~112px de viewport.

7. **Tablas CPQ sin responsive:** FinancialPanel tiene tablas sin restricciones de ancho de columna y una tabla sin `overflow-x-auto`.

### Recomendaciones de agrupación para rediseño

| Grupo sugerido | Módulos | Justificación |
|---------------|---------|---------------|
| **Core** | Inicio, Chat | Acceso universal, siempre visible |
| **Comercial** | CRM + CPQ/Cotizaciones | Mismo flujo de ventas |
| **Operaciones** | Ops + Rondas + Supervisión | Mismo dominio operativo |
| **People** | Personas + Payroll | Gestión de personal |
| **Finance** | Finanzas + TE + Rendiciones | Flujos financieros |
| **Admin** | Config + Documentos + Reportes DT | Administración |

### Arquitectura sugerida para mobile

En mobile, considerar:
- **Bottom bar fija:** 4-5 items máximo (Inicio, Comercial, Ops, People, Más)
- **"Más":** Sheet/drawer con el resto de módulos (patrón Supervisor/Cliente portal)
- **Eliminar sidebar drawer en mobile:** Redundante con bottom bar + "Más"
- **Sub-nav contextual:** Mantener el patrón actual de sub-tabs al entrar a un módulo
- **CPQ:** Integrar MobileBottomBar como parte del content flow, no como fixed
- **Unificar íconos y labels** entre sidebar y bottom bar
