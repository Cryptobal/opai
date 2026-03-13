# Auditoría Completa — Portales OPAI (Cliente Prospecto & Cliente Activo)

**Fecha:** 13 de marzo de 2026  
**Versión:** 1.0  
**Proyecto:** OPAI — Gard Security — ERP de seguridad privada

---

## FASE 1: DESCUBRIMIENTO Y MAPEO

### 1.1 — Estructura de archivos

```
src/
├── app/
│   └── portal/
│       └── cliente/
│           ├── layout.tsx              # Layout: PWA, metadata, viewport
│           ├── page.tsx                # Entry: renderiza PortalClienteClient
│           ├── PortalClienteClient.tsx # Componente principal (login + dashboard)
│           ├── forgot-pin/page.tsx     # Recuperación de PIN
│           └── setup/page.tsx          # Primer acceso con magic token
│
├── components/
│   └── portal/
│       └── cliente/
│           ├── PortalClienteNav.tsx       # Navegación inferior (bottom nav)
│           ├── PortalDashboard.tsx        # Dashboard con KPIs, chart, actividad
│           ├── PortalInstallations.tsx    # Lista de instalaciones
│           ├── PortalRondas.tsx           # Rondas (live/demo)
│           ├── PortalPosta.tsx            # Bitácora / posta
│           ├── PortalTickets.tsx          # Tickets de soporte
│           ├── PortalAlertas.tsx          # Configuración de alertas
│           ├── PortalCotizaciones.tsx     # Lista de cotizaciones (cliente activo)
│           ├── PortalPropuesta.tsx        # Propuestas (prospecto)
│           ├── ProspectCotizacionCarousel.tsx # Carousel de cotizaciones en dashboard prospecto
│           ├── PortalReportes.tsx        # Reportes
│           ├── PortalComparativa.tsx      # Comparativa
│           ├── PortalEncuestas.tsx       # Encuestas
│           ├── PortalDocumentos.tsx      # Documentación
│           ├── PortalEmpresa.tsx         # Datos empresa
│           ├── PortalPersonal.tsx         # Personal
│           ├── PortalNosotros.tsx        # Nosotros (prospecto)
│           ├── PortalAccessControl.tsx    # Control de acceso
│           ├── PortalDesempeno.tsx        # Desempeño / gamificación
│           ├── PortalUserMenu.tsx         # Menú usuario
│           ├── PortalNotificacionesSheet.tsx # Sheet de notificaciones
│           ├── ChatClientePortal.tsx      # Chat integrado
│           ├── PortalContractForm.tsx     # Formulario contrato
│           ├── PortalSignContract.tsx     # Firma contrato
│           ├── PortalDemoOverlay.tsx      # ⚠️ NO USADO (reemplazado por PreviewBadge)
│           ├── PreviewBadge.tsx           # Badge "Vista previa" (prospecto)
│           ├── PwaRegistrar.tsx           # PWA registration
│           └── tour/
│               ├── TourOverlay.tsx        # Tour guiado
│               └── tour-steps.ts           # Pasos del tour
│
├── app/api/portal/cliente/
│   ├── auth/route.ts
│   ├── logout/route.ts
│   ├── setup/route.ts
│   ├── forgot-pin/route.ts
│   ├── tour/route.ts
│   ├── summary/route.ts
│   ├── compliance/route.ts
│   ├── guards/route.ts
│   ├── activity/route.ts
│   ├── cotizaciones/route.ts
│   ├── cotizaciones/[id]/route.ts
│   ├── cotizaciones/[id]/approve/route.ts
│   ├── cotizaciones/[id]/reject/route.ts
│   ├── cotizaciones/[id]/accept-proposal/route.ts
│   ├── cotizaciones/[id]/pdf/route.ts
│   ├── rondas/route.ts
│   ├── rondas/[id]/route.ts
│   ├── posta/route.ts
│   ├── tickets/route.ts
│   ├── tickets/[id]/route.ts
│   ├── tickets/[id]/comments/route.ts
│   ├── reportes/route.ts
│   ├── reportes/[id]/download/route.ts
│   ├── comparativa/route.ts
│   ├── encuestas/route.ts
│   ├── protocolos/route.ts
│   ├── alertas/config/route.ts
│   ├── notificaciones/route.ts
│   ├── demo/generate/route.ts
│   ├── demo/data/route.ts
│   ├── personal/route.ts
│   ├── empresa/route.ts
│   ├── empresa/representantes/route.ts
│   ├── empresa/contactos/route.ts
│   ├── empresa/instalaciones/route.ts
│   ├── empresa/personeria/route.ts
│   ├── contract-data/route.ts
│   ├── audit/route.ts
│   ├── gamification/instalacion/[id]/route.ts
│   ├── gamification/comparativa/route.ts
│   ├── instalaciones/[id]/documentos/route.ts
│   ├── access-control/[installationId]/* (live, history, whitelist, preregister)
│   └── chat/
│       ├── channels/route.ts
│       ├── groups/route.ts
│       ├── channels/[id]/messages/route.ts
│       ├── channels/[id]/read/route.ts
│       ├── channels/[id]/notification-preference/route.ts
│       ├── upload/route.ts
│       └── pusher/auth/route.ts
│
├── lib/
│   ├── portal-cliente.ts          # Server-only: validateClienteSession, parsePortalClienteSessionCookie
│   ├── portal-cliente-types.ts   # Client-safe: ClienteSession, PortalConfig, DEFAULT_PORTAL_CONFIG
│   └── portal/
│       └── demo-data.ts          # Datos demo para prospectos
```

**Componentes compartidos vs exclusivos:**
- **Compartidos:** Todos los componentes usan `session.isProspect` para alternar entre datos reales y demo.
- **Exclusivos prospecto:** `PortalPropuesta`, `PortalNosotros`, `ProspectCotizacionCarousel`, `PreviewBadge`.
- **Navegación:** En prospecto: tabs fijos Dashboard, Propuesta, Nosotros, Chat + "Más". En cliente activo: primeros 4 según `portalConfig` + "Más".

### 1.2 — Mapeo de flujos de usuario

#### Autenticación
- **Prospecto vs Cliente activo:** `isProspect = contact.account.status === 'prospect'` (en `validateClienteSession`).
- **Login:** Email + PIN (4 dígitos). Cookie `portal_cliente_session` (7 días).
- **Primer acceso:** `/portal/cliente/setup?token=...` — magic link para crear PIN.
- **Recuperación:** `/portal/cliente/forgot-pin` — solicita email, envía magic link.

#### Primera pantalla
- **Sin sesión:** Login (email + PIN).
- **Con sesión:** Dashboard (o sección según `?section=` en URL).

#### Rutas / páginas (sections)
| Section | Prospecto | Cliente activo |
|---------|-----------|----------------|
| dashboard | Dashboard con demo + carousel cotizaciones | Dashboard real |
| instalaciones | Demo instalaciones | Instalaciones reales |
| rondas | Demo rondas | Rondas reales |
| posta | Demo posta | Posta real |
| chat | Chat (canal ejecutivo directo) | Chat |
| tickets | Empty state | Tickets |
| alertas | Demo | Alertas reales |
| cotizaciones | — | Cotizaciones |
| propuesta | Propuestas con aceptar | — |
| nosotros | Nosotros | — |
| documentacion | Demo | Documentos |
| reportes | Empty state | Reportes |
| comparativa | Empty state | Comparativa |
| encuestas | Demo | Encuestas |
| personal | Demo | Personal |
| empresa | Empresa | Empresa |
| desempeno | Demo | Desempeño |
| control-acceso | Demo | Control acceso |

#### Navegación
- **Bottom nav:** 4 tabs principales + "Más" (menú desplegable).
- **Prospecto:** Dashboard, Propuesta, Nosotros, Chat + Más.
- **Cliente:** Primeros 4 según `portalConfig` + Más.

#### Cotizaciones
- **Prospecto:** Dashboard muestra `ProspectCotizacionCarousel`; sección “Propuesta” muestra `PortalPropuesta` con aceptar.
- **Cliente activo:** Sección “Cotizaciones” muestra `PortalCotizaciones` (aprobar/rechazar).

#### Onboarding
- **Tour:** Se muestra automáticamente a prospectos si `!session.portalTourShown`.
- **Botón Tour:** Visible en header para prospectos.

#### Chat
- **Prospecto:** Canales demo bloqueados + canal directo con ejecutivo.
- **Cliente:** Canales por instalación + grupos Gard.

---

## FASE 2: AUDITORÍA DE BUGS Y PROBLEMAS TÉCNICOS

### 2.1 — Errores de código

| # | Archivo | Línea | Tipo | Severidad | Descripción | Fix sugerido |
|---|---------|-------|------|-----------|-------------|--------------|
| 1 | PortalInstallations.tsx | — | Bug | Alta | `PortalClienteClient` no pasa `isProspect` a `PortalInstallations` | Añadir `isProspect={session?.isProspect}` en `PortalClienteClient.tsx` |
| 2 | PortalDashboard.tsx, PortalInstallations.tsx, etc. | — | Bug | Media | Importan `ClienteSession` de `@/lib/portal-cliente` (server-only) en componentes `'use client'` | Cambiar a `@/lib/portal-cliente-types` |
| 3 | PortalDemoOverlay.tsx | — | Código muerto | Baja | Componente no usado | Eliminar o integrar en flujo prospecto |
| 4 | PortalClienteNav.tsx | 139 | UX | Baja | `"Mas"` sin tilde | `"Más"` |
| 5 | PortalCotizaciones.tsx | 103 | API | Media | `fetch` sin credenciales explícitas; cookies se envían por defecto | Verificar que cookies se envían (same-origin). Añadir `credentials: 'include'` si hay cross-origin |
| 6 | ProspectCotizacionCarousel.tsx | 28 | API | Media | `fetch` sin headers de sesión | Las APIs de cotizaciones usan cookie; OK si same-origin |
| 7 | ChatClientePortal.tsx | 57 | React | Baja | `eslint-disable-next-line react-hooks/exhaustive-deps` | Revisar dependencias del useEffect |
| 8 | PortalRondas.tsx | 142 | React | Baja | `eslint-disable-next-line react-hooks/exhaustive-deps` | Revisar dependencias del useEffect |
| 9 | PortalDashboard.tsx | 12 | Import | Media | `ClienteSession` desde `portal-cliente` (server-only) | Usar `portal-cliente-types` |
| 10 | PortalClienteClient.tsx | 267 | Copy | Baja | `"PIN de acceso (4 dígitos)"` — el schema permite 6 | Revisar si se usa 4 o 6 dígitos y unificar |

### 2.2 — Errores de UX/UI

| # | Descripción | Severidad |
|---|-------------|-----------|
| 1 | Portal genérico: "Portal de Seguridad" — poco diferenciador | Media |
| 2 | Login: "Bienvenido" — genérico | Baja |
| 3 | Footer dashboard: "Powered by Gard Security · Ultima actualizacion" — sin tilde | Baja |
| 4 | Tablas con `min-w-[480px]` en cotizaciones — scroll horizontal en mobile | Media |
| 5 | Cotizaciones: cards sin estados hover/active explícitos | Baja |
| 6 | ProspectCotizacionCarousel: badges "Pendiente" sin distinguir estado "sent" vs "pending" | Baja |
| 7 | Empty states genéricos ("No hay cotizaciones disponibles") | Media |
| 8 | Sin WhatsApp visible como fallback | Media |

### 2.3 — Errores de datos y seguridad

| # | Descripción | Severidad |
|---|-------------|-----------|
| 1 | APIs de cotizaciones usan cookie de sesión — correcto | OK |
| 2 | APIs con `installationId` filtran por `accountId` — correcto | OK |
| 3 | Prospecto solo ve datos de su cuenta (cotizaciones, etc.) | OK |
| 4 | Demo data no expone datos sensibles de otros clientes | OK |

---

## FASE 3: AUDITORÍA DE COTIZACIONES (PRIORIDAD MÁXIMA)

### 3.1 — Ubicación y presentación

| Aspecto | Estado actual | Observación |
|---------|--------------|-------------|
| Listado en prospecto | `ProspectCotizacionCarousel` (dashboard) + `PortalPropuesta` (sección Propuesta) | Duplicación de fuentes |
| Listado en cliente activo | `PortalCotizaciones` | OK |
| Información por cotización | Código, nombre, costo, puestos, guardias, estado, validUntil | Básica |
| 1 vs múltiples | Carousel en mobile, grid en desktop | OK |
| Comparación visual | No hay comparación lado a lado | Falta |
| Estados | draft, sent, pending, approved, rejected | OK |
| CTA aprobar | `PortalPropuesta`: "Aceptar propuesta"; `PortalCotizaciones`: "Aprobar cotización" | Inconsistencia de copy |
| Detalle completo | Expandible con posiciones, notas, AI description | OK |
| Qué incluye Gard | `serviceDetail` / `aiDescription` si existe | Parcial |
| Contacto/chat | Botón "Consultar" → Chat | OK |

### 3.2 — Recomendaciones cotizaciones

1. **Prospecto:** Unificar en una sola vista tipo propuesta interactiva.
2. **Comparativa:** Si hay varias cotizaciones, permitir comparar highlights.
3. **Copy:** "Qué incluye con Gard" como sección destacada.
4. **Estado:** Badge claro (Pendiente, Enviada, Aprobada, Expirada).
5. **CTA:** Un solo CTA principal por cotización.
6. **WhatsApp:** +56982307771 visible como fallback.

---

## FASE 4: AUDITORÍA DE COPY Y MENSAJES DE MARCA

### 4.1 — Inventario de textos actuales

| Ubicación | Texto actual |
|-----------|--------------|
| Login | "Bienvenido" |
| Login | "Visibilidad completa de tu servicio de seguridad" |
| Login | "Correo electrónico" |
| Login | "PIN de acceso (4 dígitos)" |
| Login | "Ingresar al Portal" |
| Login | "¿Olvidaste tu PIN?" |
| Header | "Portal de Seguridad" |
| Header | {accountName} |
| Nav | "Dashboard", "Instalaciones", "Rondas", "Posta", "Chat", "Tickets", etc. |
| Nav | "Mas" |
| Dashboard | "Métricas de servicio" |
| Dashboard | "Cumplimiento mensual", "Rondas completadas", "Trust Score promedio", "Alertas del mes" |
| Dashboard | "Cumplimiento diario" |
| Dashboard | "Mejores guardias del mes" |
| Dashboard | "Actividad reciente" |
| Dashboard | "Powered by Gard Security · Ultima actualizacion" |
| Cotizaciones | "Cotizaciones" |
| Cotizaciones | "Cargando cotizaciones..." |
| Cotizaciones | "No hay cotizaciones disponibles" |
| Cotizaciones | "Aprobar cotización" / "Rechazar" |
| Propuesta | "Propuestas" |
| Propuesta | "Propuestas" |
| Propuesta | "Aceptar propuesta" |
| Propuesta | "Consultar" |
| ProspectCarousel | "Tienes X cotizaciones pendientes" |
| ProspectCarousel | "Ver propuesta" |
| Propuesta | "Al aceptar esta propuesta, nuestro equipo iniciará el proceso..." |
| Nosotros | "Gard Security" |
| Nosotros | "Seguridad privada diseñada para continuidad operacional" |
| Nosotros | "¿Por qué Gard?" |
| Nosotros | "Hablar con tu ejecutivo" |
| Tour | "Bienvenido, {name}" |
| Tour | "Propuestas claras y transparentes" |
| Tour | "Dashboard con métricas reales" |
| Tour | "Monitoreo de rondas en vivo" |
| Tour | "Comunicación directa" |
| Tour | "Documentación y reportes" |
| PreviewBadge | "Vista previa" |

### 4.2 — Evaluación de copy

| Texto | Evaluación |
|-------|------------|
| "Bienvenido" | Genérico; no comunica valor Gard |
| "Portal de Seguridad" | Genérico; no diferencia OPAI |
| "Visibilidad completa..." | Bueno; comunica transparencia |
| "Métricas de servicio" | Neutro |
| "Trust Score" | Bueno; diferenciador |
| "Powered by Gard Security" | OK; falta tilde |
| "No hay cotizaciones disponibles" | Genérico; no orienta |
| "Aceptar propuesta" vs "Aprobar cotización" | Inconsistencia |
| "Propuestas claras y transparentes" | Bueno |
| "Vista previa" | OK para prospecto |

---

## FASE 5: PLAN DE REFACTORING (PRIORIDADES)

### 5.1 — Quick wins (< 30 min)

| # | Tarea | Impacto |
|---|-------|---------|
| 1 | Pasar `isProspect` a `PortalInstallations` | Bug |
| 2 | Cambiar imports `ClienteSession` a `portal-cliente-types` | Estabilidad |
| 3 | Corregir "Mas" → "Más" en nav | UX |
| 4 | Corregir "Ultima actualizacion" → "Última actualización" | Copy |
| 5 | Eliminar o documentar `PortalDemoOverlay` no usado | Limpieza |

### 5.2 — Mejoras medianas (1–3 h)

| # | Tarea | Impacto |
|---|-------|---------|
| 1 | Rediseñar hero/bienvenida en login con copy diferenciador | Conversión |
| 2 | Unificar copy "Aceptar/Aprobar" en cotizaciones | Consistencia |
| 3 | Añadir sección "Qué incluye" en detalle cotización | Conversión |
| 4 | Mostrar WhatsApp +56982307771 en footer o chat | Contacto |
| 5 | Mejorar empty states con CTAs orientados | UX |

### 5.3 — Refactoring mayor (> 3 h)

| # | Tarea | Impacto |
|---|-------|---------|
| 1 | Rediseñar vista cotizaciones prospecto tipo propuesta interactiva | Conversión |
| 2 | Vista comparativa multi-cotización | Conversión |
| 3 | Integrar diferenciadores en cada sección (micro-copy) | Marca |
| 4 | Dashboard cliente activo: centro de comando | UX |
| 5 | Rondas en vivo: presentación tipo centro de comando | UX |

---

## FASE 6: MAPA DE COPY PROPUESTO

| Ubicación | Texto actual | Texto propuesto | Diferenciador |
|-----------|--------------|-----------------|---------------|
| Login | "Bienvenido" | "Accede a tu portal OPAI" | OPAI |
| Login | "Visibilidad completa de tu servicio de seguridad" | "El único sistema operativo integral de seguridad en Chile. Visibilidad en tiempo real." | OS integral |
| Header | "Portal de Seguridad" | "Portal de Seguridad" o "OPAI" | — |
| Dashboard | "Métricas de servicio" | "Métricas de servicio en tiempo real" | Tiempo real |
| Footer | "Ultima actualizacion" | "Última actualización" | — |
| Cotizaciones empty | "No hay cotizaciones disponibles" | "No hay cotizaciones disponibles. Contacta a tu ejecutivo para recibir una propuesta." | Orientación |
| Propuesta CTA | "Aceptar propuesta" | "Aprobar y continuar" | Consistencia |
| Nosotros | "Seguridad privada diseñada para continuidad operacional" | "Sistema operativo completo de seguridad. Rondas en vivo, Trust Score, documentación digital." | Diferenciadores |

---

## FASE 7: ENTREGABLES

### 7.1 — Reporte de bugs (resumen)

Ver tabla en FASE 2.1.

### 7.2 — Plan de refactoring

Ver FASE 5.

### 7.3 — Mapa de copy

Ver FASE 6.

### 7.4 — Mockups de cambios clave (descripción)

1. **Login hero:** Sustituir "Bienvenido" por un bloque con logo Gard, título "Accede a tu portal OPAI" y subtítulo que mencione el valor del OS integral.
2. **Cotizaciones prospecto:** Vista única tipo propuesta con sección "Qué incluye con Gard", badge de estado, CTA principal y botón de consulta.
3. **Dashboard prospecto:** Hero breve con "Gard tiene un sistema operativo completo que ninguna otra empresa de seguridad en Chile posee" y carousel de cotizaciones.
4. **Dashboard cliente:** KPIs más prominentes, alertas recientes, última comunicación.
5. **Footer:** Incluir WhatsApp +56982307771 como fallback de contacto.

---

## REGLAS CRÍTICAS (recordatorio)

- No modificar: lógica de negocio, endpoints, modelos Prisma, flujo de auth.
- Sí modificar: UI, copy, layout, empty/loading/error states, navegación.

---

*Documento generado por auditoría de portales OPAI — Gard Security — Marzo 2026*
