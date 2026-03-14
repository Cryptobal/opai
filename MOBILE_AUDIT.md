# OPAI Mobile Audit Report

**Fecha:** 2026-03-14
**Alcance:** Auditoría exhaustiva de TODO el codebase — 156 page.tsx + 13 layout.tsx
**Stack:** Next.js 15, React 18, TypeScript, Tailwind CSS, shadcn/ui (dark theme)
**Viewport de referencia:** 375px (iPhone SE / estándar mobile)

---

## Resumen

| Severidad | Cantidad | Resueltos |
|-----------|----------|-----------|
| **CRÍTICO** (rompe UX) | 28 | 22 |
| **MEDIO** (molesto) | 38 | 30 |
| **MENOR** (cosmético) | 29 | 18 |
| **Total** | **95** | **70** |

- **Total de rutas auditadas:** 156 page.tsx + 13 layout.tsx = 169 archivos de ruta
- **Componentes compartidos auditados:** ~30 componentes clave (DataTable, AppShell, AppSidebar, BottomNav, SubNav, KpiCard, Dialog, Popover, FilterPills, ListToolbar, etc.)

---

## Problemas Globales

> Problemas que afectan múltiples páginas y se pueden resolver con fixes transversales.

### G1. ~~[CRÍTICO]~~ ✅ AppShell — Padding asimétrico en contenido principal (~156 páginas)
- **Archivo:** `src/components/opai/AppShell.tsx:306`
- **Problema:** `pl-2 pr-4 sm:pl-3 sm:pr-6` — padding izquierdo de solo 2px en mobile. Contenido se ve pegado al borde izquierdo. No usa `env(safe-area-inset-left/right)` en el área de contenido.
- **Impacto:** Todo el contenido de la app se ve asimétrico y apretado en mobile.

### G2. ~~[CRÍTICO]~~ ✅ DataTable — Sin vista mobile alternativa (~40+ páginas)
- **Archivo:** `src/components/opai/DataTable.tsx:75`
- **Problema:** Solo tiene layout de tabla desktop con `overflow-x-auto`. No hay fallback tipo card para mobile. Columnas no se ocultan responsivamente. Falta `min-w-0` en el `<table>`.
- **Impacto:** Tablas ilegibles en 375px — scroll horizontal forzado sin indicadores visuales.

### G3. ~~[CRÍTICO]~~ ✅ Dialog/Modal — No optimizado para keyboard mobile (~25+ páginas)
- **Archivo:** `src/components/ui/dialog.tsx:60`
- **Problema:** `max-h-[90vh]` puede ser empujado fuera de pantalla por el teclado virtual. No hay manejo de `visualViewport` para ajustar posición cuando el teclado aparece.
- **Impacto:** Modales con formularios quedan parcialmente ocultos detrás del teclado en iOS/Android.

### G4. ~~[CRÍTICO]~~ ✅ Portal Layouts — Sin safe-area integration (6 portales)
- **Archivos:**
  - `src/app/portal/acceso/layout.tsx:28`
  - `src/app/portal/cliente/layout.tsx:28`
  - `src/app/portal/guardia/layout.tsx:28`
  - `src/app/portal/marcacion/layout.tsx:28`
  - `src/app/portal/rondas/layout.tsx:28`
  - `src/app/portal/supervisor/layout.tsx:38`
- **Problema:** Usan `min-h-dvh` pero no definen padding para safe-areas (notch, Dynamic Island). Contenido puede quedar detrás del notch.
- **Impacto:** En iPhone 14 Pro+, iPhone 15+, y Android con notch, contenido es ilegible en la parte superior.

### G5. ~~[CRÍTICO]~~ ✅ AppShell — Body scroll lock causa layout shift en iOS
- **Archivo:** `src/components/opai/AppShell.tsx:85-99`
- **Problema:** Usa `position: fixed` con inline styles para bloquear scroll cuando sidebar está abierto. Causa bounce scroll en iOS Safari, layout reflow, y viewport shift.
- **Impacto:** Experiencia rota al abrir/cerrar sidebar en iOS.

### G6. ~~[MEDIO]~~ ✅ Touch targets inconsistentes — Muchos < 44px (~50+ páginas)
- **Archivos:**
  - `src/components/opai/AppSidebar.tsx:206-214` — botón cerrar `h-9 w-9` (36px)
  - `src/components/shared/FilterPills.tsx:34-50` — Select `h-8` (32px)
  - `src/components/shared/ListToolbar.tsx:52-59` — Input `h-9` (36px)
  - `src/components/crm/CrmToolbar.tsx:63` — Input `h-9` (36px)
- **Problema:** Elementos interactivos por debajo del mínimo de 44x44px recomendado por Apple/Google para touch targets.
- **Impacto:** Mis-taps frecuentes, dificultad para interactuar en mobile.

### G7. ~~[MEDIO]~~ ✅ SubNav — Sin indicador visual de scroll horizontal
- **Archivo:** `src/components/opai/SubNav.tsx:34`
- **Problema:** `scrollbar-hide` remueve scrollbar pero no hay snap scrolling ni affordance visual de que hay más items. Usuarios no descubren que pueden hacer scroll.
- **Impacto:** Items de navegación ocultos sin que el usuario lo sepa.

### G8. ~~[MEDIO]~~ ✅ BottomNav — Items overflow no manejado
- **Archivo:** `src/components/opai/BottomNav.tsx:85-91`
- **Problema:** Con `compact = true` (>5 items), usa `overflow-x-auto scrollbar-hide` sin snap ni indicador. En teléfonos angostos (360px), items se vuelven demasiado pequeños para tap (<44px).
- **Impacto:** Items de navegación inaccesibles en pantallas angostas.

### G9. ~~[MEDIO]~~ ✅ Missing `min-w-0` en flex/grid containers — Texto desborda
- **Alcance:** Múltiples componentes en todo el codebase
- **Problema:** Containers flex/grid sin `min-w-0` impiden que `truncate` funcione, causando overflow de texto.
- **Archivos ejemplo:**
  - `src/components/usuarios/UsersTable.tsx:124-126`
  - Múltiples CRM client components
- **Impacto:** Textos largos (nombres, emails, direcciones) desbordan contenedores en mobile.

### G10. ~~[MEDIO]~~ ✅ AiHelpChatWidget — Sin alternativa mobile (already has FAB + fullscreen mobile view)
- **Archivo:** `src/components/opai/AiHelpChatWidget.tsx:378`
- **Problema:** `hidden md:flex` con `w-[420px]`. Widget completamente oculto en mobile sin alternativa.
- **Impacto:** Feature de ayuda IA inaccesible en mobile.

### G11. [MEDIO] Filter pills/tabs — Sin affordance de scroll
- **Archivos:**
  - `src/components/admin/PresentationsList.tsx:256-270`
  - `src/components/docs/DocsClient.tsx:232-246`
  - Múltiples páginas con filtros
- **Problema:** `overflow-x-auto scrollbar-hide` sin gradiente fade-out ni indicadores visuales de que hay más contenido.
- **Impacto:** Filtros parecen "atascados" — usuarios no saben que pueden hacer scroll.

### G12. ~~[MEDIO]~~ ✅ Formularios — Inputs sin `touch-action: manipulation`
- **Alcance:** Inputs de búsqueda y formularios en general
- **Problema:** Sin `touch-action: manipulation`, mobile browsers aplican 100ms delay en touch y permiten zoom accidental en double-tap.
- **Impacto:** Interacción lenta y zoom no deseado.

### G13. ~~[MENOR]~~ ✅ Text selection no deshabilitada en elementos interactivos
- **Alcance:** Sidebar submenus, action bars, toolbars
- **Problema:** Divs con `cursor-pointer` y `role="button"` sin `user-select-none`. Usuarios seleccionan texto accidentalmente al intentar hacer tap.
- **Impacto:** Feedback visual confuso en interacciones táctiles.

### G14. [MENOR] Sin virtualización para listas largas
- **Archivo:** `src/components/opai/DataTable.tsx`
- **Problema:** DataTable renderiza todas las filas de una vez. Con 100+ registros, rendering es lento en mobile. Sin react-window o paginación.
- **Impacto:** Jank en Android mid-range con tablas de 50+ filas (CRM Accounts, Leads, Finance).

### G15. ~~[MENOR]~~ ✅ `100dvh` sin fallback para iOS < 15.4
- **Archivo:** `src/components/opai/AppShell.tsx:115,245`
- **Problema:** Mobile drawer usa `h-[100dvh]` que no es soportado en iOS Safari < 15.4. Sin fallback `100vh`.
- **Impacto:** Drawer overflow en dispositivos iOS antiguos.

### G16. ~~[MENOR]~~ ✅ Decorative blur elements — Performance mobile
- **Archivos:**
  - `src/components/presentation/sections/Section04Riesgo.tsx:14-16`
  - `src/components/presentation/sections/Section28Cierre.tsx:12-15`
  - `src/components/presentation/DownloadPresentationSection.tsx:76`
- **Problema:** Elementos de `w-[600px] h-[600px] blur-3xl` se renderizan en mobile. `blur-3xl` es costoso en GPU mobile.
- **Impacto:** Jank durante scroll en presentaciones en mobile.

---

## Por Portal / Por Ruta

---

### Portal Acceso (`/portal/acceso`)

- [x] [CRÍTICO] Main container sin `overflow-hidden` — puede causar scroll horizontal — `src/app/portal/acceso/_components/AccessPortalApp.tsx:414`
- [x] [CRÍTICO] FAB button `fixed bottom-24 right-4` sin safe-area inset para notch — `src/app/portal/acceso/_components/AccessPortalApp.tsx:467-475`
- [x] [CRÍTICO] `text-[#F9FAFB]` puede no aplicar correctamente como color arbitrario de Tailwind — `src/app/portal/acceso/layout.tsx:28`
- [ ] [MEDIO] Bottom tab bar safe-area puede recortar labels en phones con notch extremo — `src/app/portal/acceso/_components/BottomTabBar.tsx:20`
- [ ] [MEDIO] Flex items inconsistentes con `min-w-0` — textos largos desbordan en tabs — `src/app/portal/acceso/_components/tabs/MasTab.tsx:64-84`

---

### Portal Cliente (`/portal/cliente`)

- [x] [CRÍTICO] Header no trunca texto — nombre de cuenta e instalación desbordan en 375px — `src/app/portal/cliente/PortalClienteClient.tsx:335-395`
- [x] [CRÍTICO] Select de instalación `pr-7` — flecha dropdown superpuesta con texto en pantallas angostas — `src/app/portal/cliente/PortalClienteClient.tsx:362-372`
- [x] [CRÍTICO] Menú "Más" posicionado `absolute bottom-14 right-0` sin boundary check — desborda viewport — `src/components/portal/cliente/PortalClienteNav.tsx:142`
- [x] [CRÍTICO] Tabs de filtro con scrollbar visible (sin scrollbar-hide) — `src/components/portal/cliente/PortalCotizaciones.tsx:212`
- [x] [CRÍTICO] Tabla de posiciones `min-w-[480px]` en viewport de 375px — scroll horizontal forzado — `src/components/portal/cliente/cotizaciones/CotizacionCard.tsx:246`
- [x] [CRÍTICO] Tabs de control de acceso con scrollbar visible — `src/components/portal/cliente/PortalAccessControl.tsx:105`
- [x] [MEDIO] Main content `pb-20` fijo sin ajuste responsive — espacio vacío excesivo — `src/app/portal/cliente/PortalClienteClient.tsx:404`
- [x] [MEDIO] Dashboard grid salta de 2 a 4 columnas sin paso intermedio (md:grid-cols-3) — `src/components/portal/cliente/PortalDashboard.tsx:400`
- [x] [MEDIO] Chart height `h-[200px]` fijo — no escala con viewport — `src/components/portal/cliente/PortalDashboard.tsx:435`
- [x] [MEDIO] Cards de cotizaciones `min-w-[280px]` con snap — en 375px deja solo 95px de scroll room — `src/components/portal/cliente/cotizaciones/DashboardCotizacionesPendientes.tsx:72`
- [ ] [MEDIO] Botones de acción pueden desbordar container en phones angostos — `src/components/portal/cliente/cotizaciones/CotizacionCard.tsx:400-466`
- [ ] [MEDIO] Tour modal `max-w-md` (448px) > 375px viewport — requiere `mx-4` para funcionar — `src/components/portal/cliente/tour/TourOverlay.tsx:138`
- [ ] [MENOR] Setup page padding `p-4` sin ajuste responsive para <375px — `src/app/portal/cliente/setup/page.tsx:37`
- [x] [MENOR] `scrollbarWidth: "none"` inline no funciona en Chrome/Safari — `src/components/portal/cliente/cotizaciones/DashboardCotizacionesPendientes.tsx:73`

---

### Portal Guardia (`/portal/guardia`)

- [x] [CRÍTICO] Tabla de solicitudes/tickets con scrollbar visible sin scroll-hide — `src/components/portal/GuardPortalClient.tsx:965`
- [x] [MEDIO] Main content `pb-20` fijo — excesivo en páginas cortas — `src/components/portal/GuardPortalClient.tsx:161`
- [ ] [MEDIO] Label "PDF" con `hidden sm:inline` — solo icono en mobile sin affordance clara — `src/components/portal/GuardPortalClient.tsx:1349`

---

### Portal Supervisor (`/portal/supervisor`)

- [x] [CRÍTICO] Grid de pauta mensual con columnas `min-w-[28px]` × 30+ días + `min-w-[100px]` puesto — tabla completamente inutilizable en mobile — `src/components/portal/supervisor/SupervisorPautaGrid.tsx:198-316`
- [x] [MEDIO] Sheet "Más opciones" — `pb-safe` CSS class puede no existir — verificar — `src/components/portal/supervisor/PortalSupervisorClient.tsx:351`
- [x] [MEDIO] Grid de opciones `grid-cols-3 gap-3` — cada columna ~95px en 375px, muy apretado — `src/components/portal/supervisor/PortalSupervisorClient.tsx:355`

---

### Portal Rondas (`/portal/rondas`)

- [x] [CRÍTICO] Banner offline `fixed top-0` sin `pt-[env(safe-area-inset-top)]` — oculto detrás de status bar en iOS — `src/components/portal/rondas/RondasPortalClient.tsx:554-562`
- [x] [CRÍTICO] Banner pánico `fixed top-0 z-[65]` sin safe-area — mismo problema — `src/components/portal/rondas/RondasPortalClient.tsx:564-583`
- [x] [MEDIO] Toast de incidente `fixed top-4` sin safe-area — puede quedar detrás del notch — `src/components/portal/rondas/RondasPortalClient.tsx:696-713`
- [ ] [MEDIO] Guard selector header puede tener text overflow — requiere verificar componente — `src/components/portal/rondas/RondasPortalClient.tsx:585-593`

---

### Portal Marcación (`/portal/marcacion`)

- [x] [MENOR] Loading screen usa inline style `background: "#060a13"` en vez de clase Tailwind — `src/app/portal/marcacion/_components/MarcacionPortalApp.tsx:117`

---

### Chat (`/(app)/chat`)

- Sin problemas mobile específicos detectados (página de redirección simple).

---

### CPQ (`/(app)/cpq`)

- [x] [CRÍTICO] MobileBottomBar `fixed bottom-14` sin safe-area para notch — contenido puede ser cortado — `src/components/cpq/CpqQuoteDetail.tsx:51`
- [ ] [CRÍTICO] CpqPositionCard y FinancialPanel pueden tener fixed widths que desbordan — `src/components/cpq/CpqQuoteDetail.tsx:1-150+`
- [ ] [MEDIO] Modal sizing para formularios puede exceder 375px — `src/components/cpq/` (varios)

---

### CRM (`/(app)/crm`)

- [x] [CRÍTICO] Dashboard charts (LeadsByMonthChart, QuotesByMonthChart) pueden desbordar horizontalmente sin `overflow-x-hidden` — `src/app/(app)/crm/page.tsx:182-307`
- [x] [CRÍTICO] Kanban drag-and-drop con @dnd-kit causa scroll no deseado en mobile — no hay ajustes de touch events — `src/components/crm/CrmDealsClient.tsx`
- [x] [CRÍTICO] Cards de cuentas con `max-w-[200px]` hardcoded — desborda en 375px — `src/components/crm/CrmAccountsClient.tsx:414,499`
- [ ] [MEDIO] KpiGrid 2 columnas en mobile con gap-3 — uso ineficiente del espacio en 430-640px — `src/components/opai/KpiGrid.tsx:33-36`
- [x] [MEDIO] CrmToolbar input `h-9` (36px) — bajo el mínimo de 44px touch target — `src/components/crm/CrmToolbar.tsx:69`
- [ ] [MEDIO] DialogContent `sm:max-w-lg` (512px) sin ajuste mobile — puede exceder 375px — `src/components/crm/CrmAccountsClient.tsx:247`
- [x] [MEDIO] EntityDetailLayout tabs sin `overflow-x-auto` — tabs se salen si no caben — `src/components/crm/EntityDetailLayout.tsx`
- [ ] [MEDIO] CrmAccountDetailClient — paneles laterales (contacts, deals) no convierten a full-width en mobile — `src/components/crm/CrmAccountDetailClient.tsx`
- [ ] [MEDIO] Email history puede tener min-width fijo en message bubbles — `src/components/crm/EmailHistoryList.tsx`
- [x] [MENOR] Nombres de cuenta sin `truncate` en vista lista — wrap feo — `src/components/crm/CrmAccountsClient.tsx:396`
- [ ] [MENOR] Badges como `text-amber-400` pueden tener contraste insuficiente bajo luz solar directa
- [ ] [MENOR] BottomNav content sin `pb-14` safety margin — contenido oculto detrás del nav — `src/components/opai/BottomNav.tsx`

---

### Finanzas (`/(app)/finanzas`)

- [x] [CRÍTICO] Tablas de finanzas (rendiciones, facturación, pagos) sin responsive column hiding — ilegibles en 375px — `src/components/finance/RendicionesClient.tsx` (already has mobile cards)
- [x] [MEDIO] RendicionDetail formulario sin `grid-cols-1` fallback mobile — campos apretados — `src/components/finance/RendicionDetail.tsx` (already responsive)
- [ ] [MEDIO] Reportes financieros con tablas sin truncación — `src/app/(app)/finanzas/reportes/page.tsx`

---

### OPS (`/(app)/ops`)

#### Pauta Mensual
- [ ] [CRÍTICO] Tabla de pauta mensual con 40+ columnas de fecha — `table-fixed` en mobile fuerza celdas microscópicas — completamente inutilizable — `src/components/ops/OpsPautaMensualClient.tsx:~1200+`
- [x] [MEDIO] Input de búsqueda instalación `min-w-[200px]` sin breakpoint — desborda en <320px — `src/components/ops/OpsPautaMensualClient.tsx:~200-300`
- [ ] [MEDIO] Selectores de cliente/instalación sin responsive handling — `src/components/ops/OpsPautaMensualClient.tsx:~300-400`

#### Supervisión
- [ ] [CRÍTICO] SupervisionGrilla calendario con `min-w-[150px]` sticky + `min-w-[32px]` × 30+ días — requiere ~1000px mínimo — sin fallback mobile — `src/components/supervision/SupervisionGrilla.tsx:204-246`
- [ ] [MEDIO] CellTooltip con positioning `fixed` sin viewport bounds checking — puede salir de pantalla — `src/components/supervision/SupervisionGrilla.tsx:74-90`
- [ ] [MEDIO] Double-click vs single-click en celdas — confuso en mobile — `src/components/supervision/SupervisionGrilla.tsx:259-282`
- [ ] [MENOR] PhotoGallery puede no tener `max-w-full` en imágenes — `src/components/supervision/PhotoGallery.tsx`
- [ ] [MENOR] Nueva visita wizard `max-w-2xl` sin padding mobile — en 320px queda muy apretado — `src/app/(app)/ops/supervision/nueva-visita/page.tsx:19`

#### Rondas
- [ ] [MEDIO] RondasSubnav `hidden md:block` sin alternativa mobile — navegación inaccesible — `src/app/(app)/ops/rondas/monitoreo/page.tsx:182-184`
- [ ] [MEDIO] MonitoreoGrid sticky columns `min-w-[140px]` toman 43% del viewport en 320px — `src/components/ops/rondas/MonitoreoGrid.tsx:~250-280`
- [ ] [MEDIO] RondasReportesTable sin responsive column hiding — `src/components/ops/rondas/RondasReportesTable.tsx:308-309`
- [ ] [MENOR] MobileMonitorView tabs sin preservación de scroll position — `src/components/ops/rondas/MobileMonitorView.tsx:40-75`
- [ ] [MENOR] MonitoreoMap lazy load sin Suspense fallback visible — `src/components/ops/rondas/MobileMonitorView.tsx:8-10`
- [ ] [MENOR] isMobile detection `window.innerWidth < 768` sin debounce — jank en orientation change — `src/components/ops/rondas/RondasMonitoreoClient.tsx:98`

#### Inventario
- [ ] [MENOR] Card layout sin min-width constraints — cards pueden ser demasiado anchas/angostas — `src/components/inventario/InventarioProductosClient.tsx:100+`

#### Audit Pautas
- [x] [MEDIO] Columnas de tabla sin truncación para texto largo en `details` — `src/app/(app)/ops/audit-pautas/page.tsx:72-108`

#### Tickets
- [x] [MENOR] DataTable touch feedback — solo `hover:bg-muted/30` sin estado active/pressed para touch — `src/components/opai/DataTable.tsx:87-94`

#### Dashboard OPS
- [ ] [MENOR] Algunos dashboards no usan `compactOnMobile` en ModuleCard (ej: inventario) — `src/app/(app)/ops/inventario/page.tsx:79-89`

---

### OPAI Admin (`/(app)/opai`)

#### Dashboard/Inicio
- [ ] [MENOR] `space-y-6` (24px gap) puede ser excesivo en mobile — mejor `space-y-4 sm:space-y-6` — `src/app/(app)/opai/page.tsx:92`

#### Documentos
- [x] [MENOR] Sticky header `top-0` no compensa height del topbar mobile (~48px) — debería ser `top-12` — `src/components/opai/DocumentosContent.tsx:66` (already properly implemented)

#### Configuración
- [x] [MEDIO] Grids de configuración con `grid-cols-2` sin breakpoint mobile — `src/components/shared/PuestoFormModal.tsx:408`

#### Templates/Presentaciones
- [x] [MENOR] PageHeader `text-xl` sin escala responsive — debería ser `text-lg sm:text-xl` — `src/components/opai/PageHeader.tsx:50`

---

### Payroll (`/(app)/payroll`)

- [x] [CRÍTICO] Tablas de parámetros, tramos asignación familiar, tramos impuesto — 4-6 columnas sin mobile fallback — `src/components/opai/DataTable.tsx` (usado en payroll) — resolved via G2 DataTable mobile card view
- [ ] [MEDIO] Formularios de simulador sin responsive grid fallback — campos apretados en mobile

---

### Personas (`/(app)/personas`)

- [x] [MEDIO] UsersTable mobile cards sin `min-w-0` consistente — texto desborda — `src/components/usuarios/UsersTable.tsx:124-126` (already has min-w-0)
- [ ] [MENOR] Gamificación cards pueden no tener responsive sizing

---

### Reportes DT (`/(app)/reportes/dt`)

- [ ] [MENOR] Layout retorna solo `<>{children}</>` sin wrapper — sin hooks para padding/layout consistente — `src/app/(app)/reportes/dt/layout.tsx:10`

---

### TE (`/(app)/te`)

- [x] [MEDIO] Tablas de registro/lotes/pagos usan DataTable sin mobile fallback — mismos problemas globales G2 — resolved via G2

---

### Hub (`/(app)/hub`)

- Sin problemas específicos adicionales — usa componentes compartidos (problemas globales aplican).

---

### Fiscalización (`/(app)/fiscalizacion`)

- Sin problemas específicos adicionales — usa componentes compartidos (problemas globales aplican).

---

### Templates/Presentaciones (`/(templates)`)

- [x] [CRÍTICO] Section23PropuestaEconomica tabla `min-w-[480px]` con `px-4 py-5` — horizontal scroll forzado en mobile — `src/components/presentation/sections/Section23PropuestaEconomica.tsx:106`
- [x] [CRÍTICO] PreviewSidebar `w-full` en mobile — cubre 100% del viewport sin close affordance visible — `src/components/preview/PreviewSidebar.tsx:45`
- [x] [CRÍTICO] PresentationHeader — textos de empresa/deal/instalación sin truncate — desbordan en <640px — `src/components/layout/PresentationHeader.tsx:49-114`
- [x] [MEDIO] Section05FallasModelo y Section25Comparacion — tablas `hidden md:block` sin card fallback — contenido invisible en mobile — `src/components/presentation/sections/Section05FallasModelo.tsx:38` (already has mobile cards)
- [ ] [MEDIO] PreviewActions `fixed bottom-0` sin manejo de keyboard iOS — cubierto por teclado virtual — `src/components/preview/PreviewActions.tsx:90`
- [x] [MEDIO] StickyCTA "Agendar visita" sin `min-w-0` — texto puede desbordar en <360px — `src/components/presentation/StickyCTA.tsx:57-76`
- [x] [MEDIO] Presentation tables `px-6 py-4` padding hardcoded — excesivo en mobile — `src/components/presentation/shared/ComparisonTable.tsx:33` y `PricingTable.tsx:26`
- [ ] [MENOR] NavigationDots `hidden xl:block` — sin navegación mobile alternativa entre secciones — `src/components/presentation/NavigationDots.tsx:67`
- [x] [MENOR] WhatsApp/email CTAs son emoji-only sin aria-label — `src/components/layout/PresentationHeader.tsx:140-155`
- [x] [MENOR] Email preview iframe `h-[800px]` hardcoded — nested scroll en mobile — `src/app/(templates)/preview/[sessionId]/email-preview/page.tsx:84`

---

### Auth (`/opai/login`, `/opai/forgot-password`, `/opai/reset-password`)

- [x] [MEDIO] Sin `viewport-fit: cover` meta tag — contenido no extiende a safe areas en notch devices — `src/app/opai/login/page.tsx`
- [ ] [MENOR] Padding `px-4` sin ajuste para <375px — `src/app/opai/reset-password/page.tsx`

---

### Páginas Públicas

#### Descargar (`/descargar`)
- [ ] [MENOR] Nested layout con `<html>` y `<body>` duplicados — puede causar hydration errors — `src/app/descargar/layout.tsx:3-5`
- [ ] [MENOR] PWA icon `w-24 h-24` sin responsive sizing — grande en <360px — `src/components/pwa/PWAInstallBanner.tsx:57`

#### Postulación (`/postulacion/[token]`)
- [ ] [MEDIO] AddressAutocomplete dropdown positioning no testeado con keyboard mobile — puede quedar oculto — `src/components/public/PostulacionPublicForm.tsx:74-99`

#### Marcación oposición (`/marcacion/oposicion/[token]`)
- [x] [MEDIO] Nombres de guardia e instalación sin truncate en layout `flex justify-between` — `src/components/ops/OpposicionMarcacionForm.tsx:103-106`

#### Marcar (`/marcar/[code]`)
- Sin problemas específicos adicionales.

#### Ronda (`/ronda/[code]`)
- Sin problemas específicos adicionales.

#### Activate (`/activate`)
- [ ] [MENOR] Mismos problemas de padding que auth pages.

#### Welcome (`/welcome`)
- Sin problemas específicos adicionales.

---

## Componentes Compartidos — Resumen de Impacto

| Componente | Problema Principal | Páginas Afectadas | Severidad |
|---|---|---|---|
| `AppShell.tsx` | Padding asimétrico, body lock iOS, sidebar 320px | ~156 | CRÍTICO |
| `DataTable.tsx` | Sin vista mobile, sin virtualización | ~40+ | CRÍTICO |
| `dialog.tsx` | Keyboard pushes off-screen | ~25+ | CRÍTICO |
| `BottomNav.tsx` | Items overflow, badge 9px ilegible | ~30+ | MEDIO |
| `SubNav.tsx` | Scroll sin affordance visual | ~20+ | MEDIO |
| `AppSidebar.tsx` | Close button 36px, text truncation, flyout width | Global | MEDIO |
| `FilterPills.tsx` | Select h-8 (32px), sin scroll indicator | ~15 | MEDIO |
| `ListToolbar.tsx` | Input h-9 (36px), sin touch-action | ~20+ | MEDIO |
| `KpiCard.tsx` | Tooltip w-64 puede desbordar en mobile | ~10+ | MEDIO |
| `NotificationPopover.tsx` | Width apretado en phones angostos | Global | MENOR |
| `popover.tsx` | Max-width sigue trigger width — squeeze en mobile | ~8 | MENOR |

---

## Priorización de Fixes Recomendada

### Fase 1 — Críticos (Rompen UX Mobile)
1. **AppShell padding** — Simetrizar a `px-4 sm:px-6 lg:px-8`
2. **Safe-area integration** — Agregar en todos los portal layouts y elementos `fixed`
3. **DataTable mobile** — Crear fallback card view con `md:hidden` / `hidden md:table`
4. **Dialog keyboard** — Implementar `visualViewport` listener para ajustar posición
5. **Body scroll lock** — Reemplazar `position: fixed` con `overflow: hidden` en `<html>`
6. **Tablas complejas** (pauta mensual, supervision grilla) — Vista alternativa mobile

### Fase 2 — Medios (Degradan Experiencia)
7. **Touch targets 44px** — Estandarizar todos los botones, inputs, selects
8. **Scroll affordance** — Gradientes fade-out en SubNav, FilterPills, tabs
9. **min-w-0** — Audit y fix en todos los flex containers con texto variable
10. **BottomNav compact** — Mejorar sizing y descubribilidad de items
11. **Kanban touch** — Agregar `touch-action: manipulation` y prevenir scroll durante drag
12. **Responsive grids** — Agregar breakpoints mobile a todos los `grid-cols-N` hardcoded

### Fase 3 — Menores (Polish)
13. **Typography scale** — `text-lg sm:text-xl lg:text-2xl` en headers
14. **Spacing responsive** — `space-y-4 sm:space-y-6` en dashboards
15. **Virtualización** — react-window para DataTable con >50 filas
16. **Performance** — Ocultar blur decorativos en mobile, lazy load pesados
17. **dvh fallback** — Agregar `100vh` como fallback para iOS < 15.4
