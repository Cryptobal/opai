# AUDITORÍA PROFUNDA — Portal Cliente (Activo) + Portal Cliente (Prospecto)

**Fecha:** 2026-03-09
**Alcance:** Todos los archivos, rutas, componentes, APIs y hooks de ambos portales
**Stack:** Next.js 15, React 18, TypeScript, Tailwind CSS, shadcn/ui (dark theme), Prisma ORM, PostgreSQL (Neon), Auth.js v5, Pusher real-time

---

## PASO 1: MAPA DE ESTRUCTURA DE ARCHIVOS

### Árbol de archivos del Portal Cliente

```
src/app/portal/cliente/
├── layout.tsx                    # Layout principal con PWA registration & badge clear
├── page.tsx                      # Page wrapper (carga PortalClienteClient)
├── PortalClienteClient.tsx       # Componente principal — router de secciones, auth, estado global
└── login/
    ├── page.tsx                  # Login page wrapper
    └── LoginClientePortal.tsx    # Login form (RUT + PIN de 4 dígitos)

src/components/portal/cliente/
├── PortalDashboard.tsx           # Dashboard con KPIs, gráfico cumplimiento, top guardias, actividad
├── PortalInstallations.tsx       # Lista de instalaciones del cliente
├── PortalRondas.tsx              # Historial de rondas con detalle y checkpoints
├── PortalPosta.tsx               # Bitácora/Posta — entradas diarias
├── ChatClientePortal.tsx         # Chat multi-canal con Pusher real-time
├── PortalTickets.tsx             # Sistema de tickets/soporte
├── PortalCreateTicket.tsx        # Modal de creación de ticket
├── PortalCotizaciones.tsx        # Cotizaciones (portal activo)
├── PortalPropuesta.tsx           # Cotizaciones/Propuesta (portal prospecto)
├── PortalReportes.tsx            # Reportes operacionales mensuales
├── PortalComparativa.tsx         # Comparativa entre instalaciones
├── PortalDesempeno.tsx           # Métricas de desempeño / gamificación
├── PortalEncuestas.tsx           # Encuestas de satisfacción del cliente
├── PortalAlertas.tsx             # Configuración de alertas (email/push/activo)
├── PortalNotificacionesSheet.tsx # Bottom sheet de notificaciones (desde menú usuario)
├── PortalPersonal.tsx            # Lista de guardias asignados con documentos
├── PortalEmpresa.tsx             # Datos de empresa del cliente (5 secciones editables)
├── PortalAccessControl.tsx       # Control de acceso (en vivo, historial, pre-registro, autorizados)
├── PortalNosotros.tsx            # Sección institucional de Gard (estática)
├── PortalContractForm.tsx        # Formulario post-aprobación de cotización
├── PortalSignContract.tsx        # Firma de contrato
├── PortalClienteNav.tsx          # Bottom navigation condicional (prospecto vs activo)
├── PortalUserMenu.tsx            # Menú de usuario (header)
├── PortalDemoOverlay.tsx         # Overlay de datos demo
├── ProspectCotizacionCarousel.tsx# Carrusel de cotizaciones en dashboard prospecto
├── PreviewBadge.tsx              # Badge "Vista previa" en modo prospecto
├── PwaRegistrar.tsx              # Registro PWA
└── tour/
    ├── TourOverlay.tsx           # Tour guiado interactivo (10 pasos)
    └── tour-steps.ts             # Definición de pasos del tour

src/lib/portal/
├── demo-data.ts                  # Datos demo hardcodeados para modo prospecto
└── (portal-cliente-types.ts)     # Tipos de sesión y configuración

src/lib/
├── portal-cliente.ts             # Lógica de validación de sesión
└── portal-cliente-types.ts       # Tipos TypeScript del portal

src/components/portales/
└── PortalContractsSection.tsx    # Sección de contratos/documentos (compartida)
```

### APIs del Portal Cliente

```
src/app/api/portal/cliente/
├── auth/route.ts                 # POST login, GET session check
├── logout/route.ts               # POST logout
├── setup/route.ts                # GET/POST setup de PIN vía magic token
├── forgot-pin/route.ts           # POST solicitar reset de PIN
├── summary/route.ts              # GET KPIs del dashboard
├── compliance/route.ts           # GET métricas de cumplimiento
├── guards/route.ts               # GET top guardias por trust score
├── activity/route.ts             # GET actividad reciente
├── personal/route.ts             # GET guardias asignados
├── rondas/route.ts               # GET lista de rondas
├── rondas/[id]/route.ts          # GET detalle de ronda
├── posta/route.ts                # GET entradas de bitácora
├── tickets/route.ts              # GET/POST tickets
├── tickets/[id]/route.ts         # GET detalle de ticket
├── tickets/[id]/comments/route.ts# POST comentario en ticket
├── cotizaciones/route.ts         # GET lista de cotizaciones
├── cotizaciones/[id]/route.ts    # GET detalle de cotización
├── cotizaciones/[id]/approve/route.ts    # POST aprobar cotización
├── cotizaciones/[id]/accept-proposal/route.ts # POST aceptar propuesta (prospecto→activo)
├── cotizaciones/[id]/reject/route.ts     # POST rechazar cotización
├── contracts/route.ts            # GET lista de contratos
├── contract-data/route.ts        # POST datos de empresa post-aprobación
├── comparativa/route.ts          # GET comparativa entre instalaciones
├── reportes/route.ts             # GET reportes mensuales
├── reportes/[id]/download/route.ts # GET descarga de PDF
├── encuestas/route.ts            # GET encuestas de satisfacción
├── empresa/route.ts              # GET/PUT datos de empresa
├── empresa/representantes/route.ts # GET/POST/DELETE representantes legales
├── empresa/personeria/route.ts   # GET/PUT datos de personería
├── empresa/contactos/route.ts    # PUT datos de contacto
├── empresa/instalaciones/route.ts # PUT datos de instalación
├── alertas/config/route.ts       # GET/PUT configuración de alertas
├── chat/channels/route.ts        # GET canales de chat
├── chat/channels/[id]/messages/route.ts  # GET/POST mensajes
├── chat/channels/[id]/read/route.ts      # POST marcar como leído
├── chat/channels/[id]/notification-preference/route.ts # PUT preferencias
├── chat/groups/route.ts          # GET grupos de chat
├── chat/upload/route.ts          # POST subir archivo
├── chat/pusher/auth/route.ts     # POST auth de Pusher
├── tour/route.ts                 # GET datos del tour
├── audit/route.ts                # GET logs de auditoría
├── demo/data/route.ts            # GET datos demo
├── demo/generate/route.ts        # POST generar datos demo
├── gamification/instalacion/[id]/route.ts  # GET gamificación por instalación
├── gamification/comparativa/route.ts       # GET comparativa de gamificación
├── access-control/[installationId]/live/route.ts        # GET accesos en vivo
├── access-control/[installationId]/history/route.ts     # GET historial de accesos
├── access-control/[installationId]/whitelist/route.ts   # GET/POST whitelist
├── access-control/[installationId]/whitelist/[id]/route.ts # PUT actualizar whitelist
└── access-control/[installationId]/preregister/route.ts # GET/POST pre-registro
```

---

## PASO 2: LAYOUT Y NAVEGACIÓN

### Layout principal (`layout.tsx`)

- **Lógica condicional por portal_status:** NO directamente en layout. El layout es un wrapper simple con PWA registration y badge clear.
- **Determinación del modo:** Se determina en `PortalClienteClient.tsx` leyendo `session.isProspect` (que viene de `account.status === 'prospect'` en `portal-cliente.ts` línea 192).
- **Componentes que envuelve:** Header con logo + menú usuario, contenido de sección dinámica, bottom nav.

### Bottom Navigation (`PortalClienteNav.tsx`)

**Modo Prospecto (4 tabs fijos):**
| # | Tab | Sección | Ícono |
|---|-----|---------|-------|
| 1 | Inicio | `dashboard` | LayoutDashboard |
| 2 | Propuesta | `propuesta` | FileText |
| 3 | Nosotros | `nosotros` | Building2 |
| 4 | Chat | `chat` | MessageSquare |

**Modo Activo (4 tabs visibles + menú "Más"):**
| # | Tab | Sección | Ícono |
|---|-----|---------|-------|
| 1 | Dashboard | `dashboard` | LayoutDashboard |
| 2 | Instalaciones | `instalaciones` | Building2 |
| 3 | Rondas | `rondas` | Route |
| 4 | Posta | `posta` | ClipboardList |
| + | Más | (menú expandible) | MoreHorizontal |

**Implementación:** Líneas 54, 68-73 de PortalClienteNav.tsx:
```typescript
const PROSPECT_MAIN_IDS: PortalSection[] = ['dashboard', 'propuesta', 'nosotros', 'chat']
const mainItems = isProspect
  ? ALL_NAV_ITEMS.filter(item => PROSPECT_MAIN_IDS.includes(item.id))
  : visibleItems.slice(0, 4)
```

### Menú "Más" (portal activo)

Items del menú "Más" (configurable via `portalConfig`):

| Item | Sección | Implementado |
|------|---------|-------------|
| Chat | `chat` | ✅ |
| Tickets | `tickets` | ✅ |
| Documentos | `documentacion` | ✅ |
| Cotizaciones | `cotizaciones` | ✅ |
| Reportes | `reportes` | ✅ |
| Comparativa | `comparativa` | ✅ |
| Desempeño | `desempeno` | ✅ |
| Encuestas | `encuestas` | ✅ |
| Alertas | `alertas` | ✅ |
| Personal | `personal` | ✅ |
| Empresa | `empresa` | ✅ |
| Control de Acceso | `control-acceso` | ✅ |
| **Protocolos** | — | 🔲 **NO EXISTE** |

**Nota:** Items están en lista plana (sin agrupaciones). La visibilidad de cada item se controla por `portalConfig[configKey]`.

---

## PASO 3: AUDITORÍA RUTA POR RUTA — PORTAL ACTIVO

### 1. Dashboard

**Ruta:** `app/portal/cliente?section=dashboard`
**Componente:** `PortalDashboard`
**APIs:** `GET /api/portal/cliente/summary`, `GET /api/portal/cliente/compliance`, `GET /api/portal/cliente/guards`, `GET /api/portal/cliente/activity`
**Estado:** ⚠️ Parcial

**Qué hace:** Muestra KPIs del mes (cumplimiento %, rondas completadas, trust score promedio, alertas), gráfico de cumplimiento diario (7d/14d/30d), ranking de mejores guardias y actividad reciente.

**Qué data consume:**
- `summary`: compliance %, total rounds, trust score avg, alert count (mes actual vs anterior)
- `compliance`: array diario con {date, value}
- `guards`: top 3 guardias por trust score
- `activity`: últimas ejecuciones de ronda + alertas

**Bugs encontrados:**
- ⚠️ Dashboard muestra todo en 0 cuando no hay datos del mes actual. El API retorna 0 como default, no "sin datos". No es un bug del código sino falta de datos de prueba, pero debería mostrar un estado vacío en lugar de zeros.

**Diferencia con spec original:** Implementado según spec. Los 4 KPIs, gráfico, ranking y actividad están presentes.

**Recomendación:** Agregar estado vacío ("No hay datos para este período") cuando `curTotal === 0` en vez de mostrar 0%.

---

### 2. Instalaciones

**Ruta:** `app/portal/cliente?section=instalaciones`
**Componente:** `PortalInstallations`
**APIs:** Ninguna (usa datos de sesión `session.installations`)
**Estado:** ✅ Funciona

**Qué hace:** Lista las instalaciones del cliente. Click selecciona la instalación y redirige al dashboard.

**Qué data consume:** `session.installations[]` con id y name.

**Bugs encontrados:**
- Ninguno. El click handler actualiza `selectedInstallation` y navega a `dashboard`. NO redirige al ERP.

**Recomendación:** Ninguna.

---

### 3. Rondas

**Ruta:** `app/portal/cliente?section=rondas`
**Componente:** `PortalRondas`
**APIs:** `GET /api/portal/cliente/rondas`, `GET /api/portal/cliente/rondas/{id}`
**Estado:** ✅ Funciona

**Qué hace:** Lista historial de rondas con estado, guardia, checkpoints completados y trust score. Vista detalle muestra checkpoints con validación GPS, incidentes y notas.

**Qué data consume:**
- Lista: status, guardFirstName/lastName, checkpointsCompleted/Total, trustScore, scheduledAt
- Detalle: Marcaciones GPS, incidentes (tipo, descripción, foto), notas, duración

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna.

---

### 4. Posta / Bitácora

**Ruta:** `app/portal/cliente?section=posta`
**Componente:** `PortalPosta`
**APIs:** `GET /api/portal/cliente/posta`
**Estado:** ✅ Funciona

**Qué hace:** Muestra entradas diarias de bitácora con estado (normal/novedad/crítico), guardias presentes, operador central y notas.

**Qué data consume:** Status, date, guardsPresent/Required, centralOperatorName, novedades.

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna.

---

### 5. Chat

**Ruta:** `app/portal/cliente?section=chat`
**Componente:** `ChatClientePortal`
**APIs:** `GET /api/portal/cliente/chat/channels`, `GET/POST .../messages`, `POST .../read`, `POST .../upload`, `POST .../pusher/auth`
**Estado:** ✅ Funciona

**Qué hace:** Chat multi-canal en tiempo real vía Pusher. Muestra lista de canales, mensajes con timestamps, envío de texto y archivos.

**Qué data consume:** Canales (INSTALLATION, GROUP, DIRECT), mensajes con cursor pagination.

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna.

---

### 6. Tickets

**Ruta:** `app/portal/cliente?section=tickets`
**Componente:** `PortalTickets`
**APIs:** `GET/POST /api/portal/cliente/tickets`, `GET .../tickets/{id}`, `POST .../tickets/{id}/comments`
**Estado:** ✅ Funciona

**Qué hace:** CRUD completo de tickets de soporte. Lista con filtros por estado, detalle con comentarios, creación via modal `PortalCreateTicket`.

**Qué data consume:** code, title, priority (P1-P4), status, type, comments (no internos).

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna.

---

### 7. Documentos

**Ruta:** `app/portal/cliente?section=documentacion`
**Componente:** `PortalContractsSection` (externo)
**APIs:** `GET /api/portal/cliente/contracts`
**Estado:** ⚠️ Parcial

**Qué hace:** Muestra documentos/contratos compartidos con el cliente. Filtra por categorías de contrato.

**Qué data consume:** Documentos filtrados por categoría: contrato_cliente, contrato_servicio, contrato_confidencialidad, acuerdo_nivel_servicio, adendum.

**Bugs encontrados:**
- ⚠️ Dice "No hay contratos disponibles" — esto es correcto si no hay contratos, pero el nombre de la sección "Documentos" es engañoso. Solo muestra **contratos**, no documentos generales.

**Diferencia con spec original:** La spec dice "Documentos compartidos con el cliente" pero la implementación solo filtra contratos.

**Recomendación:** Renombrar a "Contratos" o expandir el API para incluir documentos generales (manuales, protocolos, informes, etc.).

---

### 8. Cotizaciones

**Ruta:** `app/portal/cliente?section=cotizaciones`
**Componente:** `PortalCotizaciones`
**APIs:** `GET /api/portal/cliente/cotizaciones`, `GET .../cotizaciones/{id}`, `POST .../approve`, `POST .../reject`
**Estado:** ⚠️ Parcial

**Qué hace:** Lista cotizaciones activas e históricas con montos mensuales. Detalle expandible con posiciones, horarios y acciones de aprobación/rechazo.

**Qué data consume:** name, code, status, monthlyCost, currency, validUntil, positions (nombre, guardias, horario, costo).

**Bugs encontrados:**
- ⚠️ **Currency display potencialmente incorrecto**: El campo `currency` existe en el modelo CPQ (`@default("CLP")`) y el formateo es correcto (`formatCurrency(value, quote.currency === "UF" ? "UF" : "CLP")`). Sin embargo, si las cotizaciones se crean sin setear `currency`, defaultean a CLP. El bug reportado (3.947.498,20 UF) probablemente es un error de datos — la cotización tiene montos CLP pero alguien le puso currency="UF" o el display no matchea.

**Recomendación:** Verificar que la creación de cotizaciones CPQ setee `currency` correctamente. Agregar validación en el UI que alerte si un monto > 100 se muestra como UF (UF nunca debería ser >100 para un servicio mensual).

---

### 9. Reportes

**Ruta:** `app/portal/cliente?section=reportes`
**Componente:** `PortalReportes`
**APIs:** `GET /api/portal/cliente/reportes`, `GET .../reportes/{id}/download`
**Estado:** ✅ Funciona

**Qué hace:** Lista reportes mensuales con período, compliance % y botón de descarga PDF.

**Qué data consume:** period (YYYY-MM), compliance %, pdfUrl, generatedAt.

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna.

---

### 10. Comparativa

**Ruta:** `app/portal/cliente?section=comparativa`
**Componente:** `PortalComparativa`
**APIs:** `GET /api/portal/cliente/comparativa?metric=[rondas_cumplimiento|asistencia|tickets]`
**Estado:** ✅ Funciona

**Qué hace:** Compara métricas entre instalaciones del cliente con gráfico de barras y ranking con medallas.

**Qué data consume:** Métricas por instalación (rondas_cumplimiento %, asistencia %, tickets count).

**Bugs encontrados:** Ninguno. Requiere 2+ instalaciones para ser útil.

**Recomendación:** Ninguna.

---

### 11. Desempeño

**Ruta:** `app/portal/cliente?section=desempeno`
**Componente:** `PortalDesempeno`
**APIs:** `GET /api/portal/cliente/gamification/instalacion/{id}`
**Estado:** ⚠️ Parcial

**Qué hace:** Muestra trust score gauge, KPIs (guardias activos, asistencia, rondas completadas, días sin incidentes) y ranking de guardias con nivel y tendencia.

**Qué data consume:** Trust score, KPIs de gamificación, ranking de guardias con nivel/badge/asistencia/trust score/trend.

**Bugs encontrados:**
- ⚠️ **No tiene modo prospecto** — no muestra demo data para prospectos. Muestra "Selecciona una instalación" o estado vacío.
- ⚠️ **Error silencioso** — try/catch con `// silently fail`. Si el API falla, no hay feedback al usuario.
- ⚠️ **Reportado como crash** — No se pudo confirmar crash en el código. El componente tiene manejo de errores. Posible crash si `tenantId` es undefined o si los componentes importados (TrustScoreGauge, NivelBadge, etc.) tienen errores internos.

**Diferencia con spec original:** La spec espera crash reportado pero el código parece defensivo. Puede ser un error en componentes UI importados.

**Recomendación:** Agregar error boundary, logging visible, y modo demo para prospectos. Investigar si TrustScoreGauge o NivelBadge causan el crash.

---

### 12. Alertas / Notificaciones

**Ruta:** `app/portal/cliente?section=alertas`
**Componente:** `PortalAlertas`
**APIs:** `GET/PUT /api/portal/cliente/alertas/config`
**Estado:** ✅ Funciona

**Qué hace:** Configuración de alertas por tipo (guard_absent, ronda_incomplete, checkpoint_missed, incident, new_document, ticket_replied, quote_pending, contract_expiring) con toggles para email, push, activo.

**Qué data consume:** Array de configuraciones con alertType, email, push, isActive.

**Bugs encontrados:**
- ⚠️ **Naming inconsistente**: Item del menú dice "Alertas", pantalla dice "Configuración de alertas". La spec pide "Notificaciones" y separar lista de alertas de configuración.

**Diferencia con spec original:** Solo tiene configuración. No tiene lista de alertas recibidas. Debería tener ambas vistas.

**Recomendación:** Renombrar a "Notificaciones". Agregar tab/vista de "Alertas recientes" junto a "Configuración".

---

### 13. Encuestas

**Ruta:** `app/portal/cliente?section=encuestas`
**Componente:** `PortalEncuestas`
**APIs:** `GET /api/portal/cliente/encuestas`
**Estado:** ✅ Funciona

**Qué hace:** Muestra encuestas de satisfacción con rating de estrellas, NPS y métricas individuales.

**Qué data consume:** Ratings, NPS score, métricas (serviceQuality, scheduleCompliance, etc.), comentarios.

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna. (Nota: No estaba en la spec original del menú "Más" pero está implementado).

---

### 14. Personal

**Ruta:** `app/portal/cliente?section=personal`
**Componente:** `PortalPersonal`
**APIs:** `GET /api/portal/cliente/personal`
**Estado:** ✅ Funciona

**Qué hace:** Lista guardias asignados con avatar, nombre, turno, estado online y documentos expandibles (OS-10, antecedentes, etc.).

**Qué data consume:** Guard name, shift, online status, documents (tipo, fileUrl, status: validated/pending/rejected).

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna.

---

### 15. Empresa

**Ruta:** `app/portal/cliente?section=empresa`
**Componente:** `PortalEmpresa`
**APIs:** `GET/PUT /api/portal/cliente/empresa`, `POST/DELETE .../representantes`, `PUT .../personeria`, `PUT .../contactos`, `PUT .../instalaciones`
**Estado:** ✅ Funciona

**Qué hace:** 5 secciones editables: datos de empresa, representantes legales, personería, contactos, instalaciones.

**Qué data consume:** legalName, rut, address, commune, representantes, fechaEscritura, tipoEscritura, notaria, contactos, instalaciones.

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna.

---

### 16. Accesos / Control de Acceso

**Ruta:** `app/portal/cliente?section=control-acceso`
**Componente:** `PortalAccessControl`
**APIs:** `GET .../access-control/{installationId}/live`, `.../history`, `GET/POST .../whitelist`, `GET/POST .../preregister`
**Estado:** ⚠️ Parcial

**Qué hace:** 4 tabs: En Vivo (accesos actuales), Historial, Pre-registro, Autorizados (whitelist).

**Qué data consume:** Access records, whitelist entries, pre-registrations.

**Bugs encontrados:**
- ❌ **SEGURIDAD: Sin autenticación en endpoints de access-control**. Los endpoints `/live`, `/history`, `/whitelist` y `/preregister` NO verifican la sesión del portal. Solo validan `installationId` y `tenantId` como query params. Cualquiera con estos IDs puede acceder.

**Diferencia con spec original:** Funcionalidad correcta, pero falta auth.

**Recomendación:** CRÍTICO — Agregar verificación de sesión (`portal_cliente_session` cookie) y validar que la instalación pertenezca al account del usuario logueado.

---

### 17. Protocolos

**Ruta:** NO EXISTE
**Componente:** NO EXISTE
**APIs:** NO EXISTE
**Estado:** 🔲 No implementado

**Qué hace:** Debería mostrar los protocolos generados con IA para las instalaciones del cliente.

**Diferencia con spec original:** La spec pide que el cliente pueda ver protocolos de su instalación. No hay nada implementado en el portal cliente. (El portal guardia tiene `/api/portal/guardia/protocol` pero no el cliente).

**Recomendación:** Crear sección de Protocolos en el portal cliente que lea de los mismos datos que el portal guardia.

---

## PASO 4: AUDITORÍA RUTA POR RUTA — PORTAL PROSPECTO

### 1. Dashboard / Inicio

**Ruta:** `app/portal/cliente?section=dashboard` (con `isProspect=true`)
**Componente:** `PortalDashboard` (modo prospecto)
**APIs:** Ninguna (usa datos demo)
**Estado:** ✅ Funciona

**Qué hace:** Muestra datos demo hardcodeados: KPIs (97.3%, 24/28, 8.6, 2 alertas), gráfico de cumplimiento de 30 días, ranking de 4 guardias demo, 4 actividades recientes. Incluye `ProspectCotizacionCarousel` con banner de cotización pendiente.

**Qué data consume:** `DEMO_SUMMARY`, `DEMO_CHART_DATA`, `DEMO_GUARDIAS_RANKING`, `DEMO_ACTIVITY` de `demo-data.ts`.

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna.

---

### 2. Chat

**Ruta:** `app/portal/cliente?section=chat` (con `isProspect=true`)
**Componente:** `ChatClientePortal`
**APIs:** `GET /api/portal/cliente/chat/channels` (retorna canal real + canales locked demo)
**Estado:** ✅ Funciona

**Qué hace:** Muestra un canal REAL de tipo DIRECT con el ejecutivo que envió la cotización (`portalEjecutivoId`). Además muestra canales demo bloqueados (Supervisión, RRHH, Finanzas, Administración) con label "Disponible al activar".

**Qué data consume:** Canal real DIRECT + `DEMO_CHAT_CHANNELS` como canales locked.

**Bugs encontrados:** Ninguno. El chat con el ejecutivo funciona en tiempo real vía Pusher.

**Recomendación:** Ninguna.

---

### 3. Propuesta

**Ruta:** `app/portal/cliente?section=propuesta`
**Componente:** `PortalPropuesta`
**APIs:** `GET /api/portal/cliente/cotizaciones`, `GET .../cotizaciones/{id}`, `POST .../cotizaciones/{id}/accept-proposal`
**Estado:** ⚠️ Parcial

**Qué hace:** Muestra cotizaciones agrupadas por deal. Cotización activa con borde destacado. Detalle expandible con posiciones, horarios y montos. Botones de acción: Ver propuesta, Consultar, Aceptar, Descargar PDF.

**Qué data consume:** Cotizaciones reales del CPQ (no demo). Agrupadas por dealId/dealTitle.

**Bugs encontrados:**
- ❌ **PDF Download no funciona**: El componente llama a `/api/portal/cliente/cotizaciones/{id}/pdf` (línea 202) pero este **endpoint no existe**. Debería proxear a `/api/cpq/quotes/{id}/export-pdf`.
- ❌ **Horario mal formateado**: En `PortalPropuesta.tsx` líneas 81-84, la función `formatHorario` concatena start+end **sin separador**: `${start ?? ""}${end ?? ""}` → produce "08:0020:00". En `PortalCotizaciones.tsx` (portal activo) sí tiene el guión: `${start ?? ""}–${end ?? ""}`.
- ✅ "Ver propuesta" funciona (toggle de detalle expandible)
- ✅ "Consultar" funciona (navega al chat)
- ✅ "Aceptar propuesta" funciona (modal + API + upgrade de account a client_active)

**Diferencia con spec original:** PDF y formato de horario rotos.

**Recomendación:** (1) Crear endpoint de PDF o proxear al existente. (2) Agregar guión separador en formatHorario de PortalPropuesta.tsx.

---

### 4. Nosotros

**Ruta:** `app/portal/cliente?section=nosotros`
**Componente:** `PortalNosotros`
**APIs:** Ninguna (contenido estático)
**Estado:** ✅ Funciona

**Qué hace:** Sección institucional con: hero, cifras clave (15+ años, 200+ clientes, 1,500+ guardias, 96% retención), diferenciadores (OPAI, gamificación, portal, respuesta 24/7), certificaciones (OS-10, D.S. 44, ISO 45001, ACHS).

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna.

---

### 5. Tour Guiado

**Ruta:** Overlay sobre cualquier sección
**Componente:** `TourOverlay` + `tour-steps.ts`
**APIs:** `POST /api/portal/cliente/tour` (marca tour como completado)
**Estado:** ✅ Funciona

**Qué hace:** Tour interactivo de 10 pasos que explica el portal. Se dispara automáticamente 1.2s después del primer login del prospecto si `portalTourShown === false`. Repetible desde botón "Tour" en el header.

**10 pasos del tour:**
1. Bienvenido a tu portal
2. Tus cotizaciones
3. Dashboard operacional
4. Gamificación de guardias
5. Bitácora digital
6. Chat directo
7. Sistema de tickets
8. Reportes mensuales
9. Datos de muestra
10. Comienza ahora

**Bugs encontrados:** Ninguno.

**Recomendación:** Ninguna.

---

## PASO 5: AUDITORÍA DE APIs

### Resumen de todas las APIs del Portal Cliente

| Ruta | Método | Función | Modelo Prisma | Auth | Estado |
|------|--------|---------|---------------|------|--------|
| `/auth` | POST | Login RUT+PIN | CrmContact, CrmAccount | — | ✅ |
| `/auth` | GET | Check session | — | Cookie | ✅ |
| `/logout` | POST | Logout | — | Cookie | ✅ |
| `/setup` | GET/POST | Setup PIN via magic token | CrmContact | Token | ✅ |
| `/forgot-pin` | POST | Reset PIN request | CrmContact | — | ✅ |
| `/summary` | GET | KPIs dashboard | OpsRondaEjecucion, OpsAlertaRonda | Cookie | ✅ |
| `/compliance` | GET | Compliance chart data | OpsRondaEjecucion | Cookie | ✅ |
| `/guards` | GET | Top guards by trust | OpsGuardia | Cookie | ✅ |
| `/activity` | GET | Recent activity | OpsRondaEjecucion, OpsAlertaRonda | Cookie | ✅ |
| `/personal` | GET | Assigned guards | OpsGuardia | Cookie | ✅ |
| `/rondas` | GET | Round list | OpsRondaEjecucion | Headers | ✅ |
| `/rondas/{id}` | GET | Round detail | OpsRondaEjecucion | Headers | ✅ |
| `/posta` | GET | Daily log | ControlNocturno | Cookie | ✅ |
| `/tickets` | GET/POST | Tickets CRUD | OpsTicket | Cookie | ✅ |
| `/tickets/{id}` | GET | Ticket detail | OpsTicket | Cookie | ✅ |
| `/tickets/{id}/comments` | POST | Add comment | OpsTicketComment | Cookie | ✅ |
| `/cotizaciones` | GET | Quote list | CpqQuote | Cookie | ✅ |
| `/cotizaciones/{id}` | GET | Quote detail | CpqQuote, CpqQuotePosition | Cookie | ✅ |
| `/cotizaciones/{id}/approve` | POST | Approve quote | CpqQuote, CrmDeal | Cookie | ✅ |
| `/cotizaciones/{id}/accept-proposal` | POST | Accept proposal (prospecto→activo) | CpqQuote, CrmAccount, ChatChannel | Cookie | ✅ |
| `/cotizaciones/{id}/reject` | POST | Reject quote | CpqQuote | Cookie | ✅ |
| `/contracts` | GET | List contracts | Document | ❌ **SIN AUTH** | ⚠️ |
| `/contract-data` | POST | Submit company data | Document, DocSignatureRequest | Cookie | ✅ |
| `/comparativa` | GET | Installation comparison | OpsRondaEjecucion, OpsTicket | Cookie | ✅ |
| `/reportes` | GET | Monthly reports | PortalClienteReporte | Cookie | ✅ |
| `/reportes/{id}/download` | GET | Download PDF | PortalClienteReporte | Cookie | ✅ |
| `/encuestas` | GET | Customer surveys | OpsEncuestaCliente | Cookie | ✅ |
| `/empresa` | GET/PUT | Company data | CrmAccount | Cookie | ✅ |
| `/empresa/representantes` | GET/POST/DELETE | Legal reps | CrmAccount (jsonb) | Cookie | ✅ |
| `/empresa/personeria` | GET/PUT | Legal docs | CrmAccount (jsonb) | Cookie | ✅ |
| `/empresa/contactos` | PUT | Contact info | CrmContact | Cookie | ✅ |
| `/empresa/instalaciones` | PUT | Installation info | CrmInstallation | Cookie | ✅ |
| `/alertas/config` | GET/PUT | Alert config | PortalAlertConfig | Cookie | ✅ |
| `/chat/channels` | GET | Chat channels | ChatChannel | Cookie | ✅ |
| `/chat/channels/{id}/messages` | GET/POST | Messages | ChatMessage | Cookie | ✅ |
| `/chat/channels/{id}/read` | POST | Mark read | ChatChannel | Cookie | ✅ |
| `/chat/upload` | POST | Upload file | — | Cookie | ✅ |
| `/chat/pusher/auth` | POST | Pusher auth | — | Cookie | ✅ |
| `/tour` | GET | Tour data | CrmAccount | Cookie | ✅ |
| `/audit` | GET | Audit logs | PortalClienteAuditLog | requireAuth | ✅ |
| `/gamification/instalacion/{id}` | GET | Gamification data | OpsGuardia, OpsRondaEjecucion | Cookie | ✅ |
| `/gamification/comparativa` | GET | Gamification compare | Multiple | Cookie | ✅ |
| `/access-control/{id}/live` | GET | Live access | AccessControlRecord | ❌ **SIN AUTH** | ❌ |
| `/access-control/{id}/history` | GET | Access history | AccessControlRecord | ❌ **SIN AUTH** | ❌ |
| `/access-control/{id}/whitelist` | GET/POST | Whitelist | AccessControlList | ❌ **SIN AUTH** | ❌ |
| `/access-control/{id}/whitelist/{wid}` | PUT | Update whitelist | AccessControlList | ❌ **SIN AUTH** | ❌ |
| `/access-control/{id}/preregister` | GET/POST | Pre-registration | PreRegistration | ❌ **SIN AUTH** | ❌ |

### Vulnerabilidades de seguridad detectadas

| Severidad | Endpoint | Problema |
|-----------|----------|----------|
| 🔴 CRÍTICO | `/access-control/*/live` | Sin autenticación — expone registros de acceso en vivo |
| 🔴 CRÍTICO | `/access-control/*/history` | Sin autenticación — expone historial de accesos |
| 🔴 CRÍTICO | `/access-control/*/whitelist` | Sin autenticación — permite ver/crear whitelist |
| 🔴 CRÍTICO | `/access-control/*/preregister` | Sin autenticación — permite ver/crear pre-registros |
| 🟡 MEDIO | `/contracts` | Sin verificación de sesión — solo valida query params |

---

## PASO 6: AUDITORÍA DE DATOS Y MODELOS

### CrmAccount — Campos de portal

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `status` | String | `"prospect"` | Lifecycle: `prospect` \| `client_active` \| `client_inactive` |
| `portalConfig` | Json? | null | Configuración del portal por account |
| `portalEjecutivoId` | String? | null | Link al ejecutivo comercial (Admin model) |
| `portalTourShown` | Boolean | false | Si el tour fue completado |

**Nota:** NO existe campo `portal_status` — se usa `status` directamente. Los valores son `prospect`, `client_active`, `client_inactive`.

### CrmContact — Campos de portal (autenticación)

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `portalPin` | String? | null | Hash bcrypt del PIN |
| `portalPinVisible` | String? | null | PIN visible para operación |
| `portalEnabled` | Boolean | false | Si tiene acceso al portal |
| `portalLastAccessAt` | DateTime? | null | Último acceso |
| `portalLastAccessIp` | String? | null | IP del último acceso |
| `portalMagicToken` | String? | null | Token para primer acceso/reset |
| `portalMagicTokenExp` | DateTime? | null | Expiración del magic token (48h) |
| `portalLoginAttempts` | Int | 0 | Intentos fallidos |
| `portalLockedUntil` | DateTime? | null | Bloqueo por intentos (15 min) |

### CpqQuote — Campos de moneda

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `currency` | String | `"CLP"` | Moneda: `"CLP"` \| `"UF"` |

**El campo existe y se usa correctamente en el frontend.**

### Cadena de relación Account → Installation

```
CrmAccount (1) ←→ (N) CrmInstallation
  accountId en CrmInstallation → FK a CrmAccount.id
  CrmAccount.installations[] ← relación inversa
```

**La relación existe y funciona.** Las queries del portal filtran por `account.installations` para mostrar solo datos del cliente.

---

## PASO 7: VERIFICACIÓN DATOS DEMO VS REALES

### Portal Prospecto — Datos demo

**Archivo:** `src/lib/portal/demo-data.ts`

| Constante | Usada en | Datos |
|-----------|---------|-------|
| `DEMO_SUMMARY` | PortalDashboard | KPIs: 97.3%, 24/28, 8.6, 2 |
| `DEMO_CHART_DATA` | PortalDashboard | 30 días de compliance (92-99%) |
| `DEMO_GUARDIAS_RANKING` | PortalDashboard | 4 guardias ficticios |
| `DEMO_ACTIVITY` | PortalDashboard | 4 actividades recientes |
| `DEMO_RONDAS` | PortalRondas | 5 rondas completadas |
| `DEMO_POSTA` | PortalPosta | 2 cambios de turno |
| `DEMO_PERSONAL` | API /personal | 3 guardias con documentos |
| `DEMO_CHAT_CHANNELS` | API /chat/channels | 4 canales locked |
| `DEMO_INSTALACIONES` | PortalInstallations | 1 instalación demo |

**Separación correcta:** ✅ Los datos demo solo se usan cuando `isProspect === true`. La lógica es:
```typescript
if (isProspect) { /* usar DEMO_* */ return; }
// Si no es prospecto, fetch real data
```

### Portal Activo — Datos reales

**Filtrado por account:** ✅ Las queries filtran por `session.accountId` o `session.installations[].id`. La cadena de validación:
1. Cookie `portal_cliente_session` → decode → `contactId`
2. Contact → Account → `account.installations[]`
3. Queries usan `installationId IN (account.installations)`

**Problema potencial:** El dashboard muestra 0 cuando no hay datos del mes actual. No es un leak de datos demo sino ausencia de datos reales.

---

## PASO 8: VERIFICACIÓN DE BUGS REPORTADOS

### Bug 1: Dashboard activo muestra todo en 0
**Estado:** ⚠️ DISEÑO, NO BUG
**Causa raíz:** El API `/summary` retorna 0 cuando no hay rondas en el mes actual. El código es correcto: `curCompliance = curTotal > 0 ? ... : 0`.
**Fix:** Mostrar estado vacío "No hay datos para este período" en lugar de 0%.

### Bug 2: Instalaciones redirige al módulo principal
**Estado:** ❌ NO CONFIRMADO
**Causa raíz:** El click handler setea `selectedInstallation` y navega a `dashboard` dentro del portal. No hay redirección al ERP.

### Bug 3: Cotizaciones muestra UF incorrecto (3.947.498,20)
**Estado:** ⚠️ PROBABLE ERROR DE DATOS
**Causa raíz:** El campo `currency` existe y el formateo es correcto. El problema es probablemente que la cotización tiene `currency="UF"` pero el monto es en CLP, o viceversa. Verificar datos en BD.
**Fix:** Validación de rango de monto según moneda.

### Bug 4: Horario mal formateado "08:0020:00"
**Estado:** ✅ CONFIRMADO
**Causa raíz:** `PortalPropuesta.tsx` líneas 81-84 — `formatHorario` concatena sin separador: `` `${start ?? ""}${end ?? ""}` ``. En `PortalCotizaciones.tsx` sí tiene el guión.
**Fix:** Cambiar a `` `${start ?? ""}–${end ?? ""}` `` en PortalPropuesta.tsx línea 83.

### Bug 5: Desempeño crashea
**Estado:** ⚠️ NO CONFIRMADO EN CÓDIGO
**Causa raíz:** El componente tiene try/catch y manejo de errores. Posible crash en componentes UI importados (TrustScoreGauge, NivelBadge) o si `tenantId` es undefined.
**Fix:** Agregar error boundary, investigar componentes UI.

### Bug 6: Botones de cotización no funcionan (prospecto)
**Estado:** ❌ NO CONFIRMADO
**Causa raíz:** `ProspectCotizacionCarousel.tsx` tiene onClick handlers correctos: `onViewDetail` navega a propuesta, `onChat` navega a chat. Los callbacks se pasan desde el padre.

### Bug 7: Documentos dice "No hay contratos disponibles"
**Estado:** ⚠️ DISEÑO, NO BUG
**Causa raíz:** La sección "Documentos" usa `PortalContractsSection` que solo filtra contratos (categorías: contrato_cliente, contrato_servicio, etc.). Si no hay contratos, muestra el mensaje correcto.
**Fix:** Expandir para incluir documentos generales o renombrar a "Contratos".

### Bug 8: "1 Issue" de Next.js visible
**Estado:** ⚠️ SOLO DESARROLLO
**Causa raíz:** Indicador del modo development de Next.js. No aparece en producción.
**Fix:** No aplica en producción. Investigar la causa en dev.

---

## PASO 9: COMPONENTES COMPARTIDOS

### Componentes compartidos entre ambos portales

| Componente | Prospecto | Activo | Nota |
|-----------|-----------|--------|------|
| `PortalDashboard` | ✅ (demo) | ✅ (real) | Mismo componente, branch por `isProspect` |
| `PortalClienteNav` | ✅ (4 tabs) | ✅ (4+más) | Mismo componente, nav condicional |
| `PortalUserMenu` | ✅ | ✅ | Idéntico |
| `ChatClientePortal` | ✅ (1 canal) | ✅ (multi) | Mismo componente |
| `PortalRondas` | ✅ (demo) | ✅ (real) | Mismo componente |
| `PortalPosta` | ✅ (demo) | ✅ (real) | Mismo componente |
| `PortalPersonal` | ✅ (demo) | ✅ (real) | Mismo componente |
| `PortalTickets` | ✅ | ✅ | Mismo componente |
| KPI Cards | ✅ | ✅ | Reutilizados |
| Compliance Chart | ✅ | ✅ | Reutilizado (Recharts) |
| `PreviewBadge` | ✅ | — | Solo prospecto |
| `TourOverlay` | ✅ | — | Solo prospecto |
| `ProspectCotizacionCarousel` | ✅ | — | Solo prospecto |
| `PortalNosotros` | ✅ | — | Solo prospecto (via nav) |
| `PortalPropuesta` | ✅ | — | Solo prospecto |

### Componentes exclusivos del portal activo

| Componente | Nota |
|-----------|------|
| `PortalCotizaciones` | Vista de cotizaciones para activo (approve/reject) |
| `PortalComparativa` | Comparativa entre instalaciones |
| `PortalDesempeno` | Gamificación/desempeño |
| `PortalEncuestas` | Encuestas de satisfacción |
| `PortalReportes` | Reportes mensuales |
| `PortalEmpresa` | Datos de empresa editables |
| `PortalAccessControl` | Control de acceso (4 tabs) |
| `PortalAlertas` | Configuración de alertas |
| `PortalNotificacionesSheet` | Bottom sheet de notificaciones |
| `PortalContractForm` | Formulario post-aprobación |
| `PortalSignContract` | Firma de contrato |

### ¿Qué falta crear?

| Componente | Descripción |
|-----------|-------------|
| `PortalProtocolos` | Vista de protocolos IA por instalación |
| `PortalAlertasList` | Lista de alertas recibidas (separada de config) |

---

## RESUMEN EJECUTIVO

### 1. Tabla resumen de estado

| # | Sección | Portal | Estado | Severidad |
|---|---------|--------|--------|-----------|
| 1 | Dashboard | Activo | ⚠️ Muestra 0 sin datos | Media |
| 2 | Dashboard | Prospecto | ✅ Funciona | — |
| 3 | Instalaciones | Activo | ✅ Funciona | — |
| 4 | Rondas | Activo | ✅ Funciona | — |
| 5 | Rondas | Prospecto | ✅ Demo funciona | — |
| 6 | Posta/Bitácora | Activo | ✅ Funciona | — |
| 7 | Posta/Bitácora | Prospecto | ✅ Demo funciona | — |
| 8 | Chat | Ambos | ✅ Funciona | — |
| 9 | Tickets | Activo | ✅ Funciona | — |
| 10 | Documentos | Activo | ⚠️ Solo contratos | Media |
| 11 | Cotizaciones | Activo | ⚠️ Currency posible error datos | Media |
| 12 | Propuesta | Prospecto | ⚠️ PDF roto + horario mal | Alta |
| 13 | Reportes | Activo | ✅ Funciona | — |
| 14 | Comparativa | Activo | ✅ Funciona | — |
| 15 | Desempeño | Activo | ⚠️ Posible crash, sin modo demo | Media |
| 16 | Encuestas | Activo | ✅ Funciona | — |
| 17 | Alertas | Activo | ⚠️ Solo config, sin lista | Baja |
| 18 | Personal | Ambos | ✅ Funciona | — |
| 19 | Empresa | Activo | ✅ Funciona | — |
| 20 | Control Acceso | Activo | ❌ Sin autenticación | **CRÍTICA** |
| 21 | Protocolos | Activo | 🔲 No implementado | Media |
| 22 | Nosotros | Prospecto | ✅ Funciona | — |
| 23 | Tour guiado | Prospecto | ✅ Funciona | — |

### 2. Bugs críticos que bloquean la activación

| # | Bug | Severidad | Sección |
|---|-----|-----------|---------|
| 1 | **Endpoints de access-control sin autenticación** — 5 endpoints expuestos sin verificar sesión | 🔴 CRÍTICO | Control de Acceso |
| 2 | **Endpoint /contracts sin autenticación** — permite consultar contratos de cualquier account | 🔴 CRÍTICO | Documentos |
| 3 | **Horario mal formateado en PortalPropuesta** — "08:0020:00" en vez de "08:00–20:00" | 🟡 ALTO | Propuesta (Prospecto) |
| 4 | **Endpoint PDF de cotización no existe** — `/cotizaciones/{id}/pdf` no implementado | 🟡 ALTO | Propuesta (Prospecto) |
| 5 | **portalPinVisible almacena PIN en texto plano** + fallback a plaintext en auth | 🟡 ALTO | Auth |

### 3. Features faltantes vs spec original

| Feature | Spec | Implementado | Estado |
|---------|------|-------------|--------|
| `portal_status` condicional | Prospecto vs Activo | `account.status` === 'prospect' | ✅ Implementado (distinto nombre) |
| `demo-data.ts` con datos hardcodeados | Datos demo para prospecto | `src/lib/portal/demo-data.ts` | ✅ Implementado |
| `use-portal-mode.ts` hook | Hook para determinar modo | Inline en session: `isProspect` | ⚠️ No es hook separado |
| Tour guiado auto + manual | 10 pasos, auto en primer login | TourOverlay + tour-steps.ts | ✅ Implementado |
| Bottom nav condicional | 4 tabs prospecto, 4+más activo | PortalClienteNav | ✅ Implementado |
| Protocolos IA | Vista de protocolos por instalación | — | 🔲 No implementado |
| Lista de alertas recibidas | Separada de configuración | Solo configuración | 🔲 Parcial |
| Documentos generales | Más allá de contratos | Solo contratos | 🔲 Parcial |

### 4. Componentes compartibles

| Ya existe y se comparte | Falta crear |
|------------------------|-------------|
| PortalDashboard (branch prospecto/activo) | PortalProtocolos |
| PortalClienteNav (nav condicional) | PortalAlertasList |
| ChatClientePortal | — |
| KPI Cards | — |
| Compliance Chart (Recharts) | — |
| PortalRondas / PortalPosta / PortalPersonal | — |

### 5. Estimación de esfuerzo por sección para producción

| Sección | Esfuerzo | Qué hacer |
|---------|----------|-----------|
| Auth security (access-control) | **L** | Agregar auth a 5+ endpoints, validar ownership |
| Auth security (contracts) | **S** | Agregar verificación de sesión |
| Propuesta - PDF endpoint | **M** | Crear endpoint o proxy al CPQ export |
| Propuesta - formatHorario | **S** | 1 línea: agregar guión separador |
| Dashboard - estado vacío | **S** | Condicional para mostrar "sin datos" |
| Desempeño - investigar crash | **M** | Debug + error boundary + modo demo |
| Documentos - expandir | **M** | Agregar categorías de documentos generales |
| Alertas - lista de alertas | **M** | Nueva vista con alertas recibidas |
| Protocolos - crear sección | **L** | Nuevo componente + endpoint + nav item |
| Currency validation | **S** | Validación de rango en UI |
| PIN plaintext cleanup | **M** | Migrar PINs a bcrypt, eliminar fallback |

### 6. Orden de prioridad para Fase 2 (fix funcional)

**Prioridad 1 — Seguridad (bloquean producción):**
1. 🔴 Agregar autenticación a endpoints de access-control
2. 🔴 Agregar autenticación a endpoint de contracts
3. 🔴 Eliminar fallback a PIN plaintext en auth

**Prioridad 2 — Bugs visibles al usuario:**
4. 🟡 Fix formatHorario en PortalPropuesta (1 línea)
5. 🟡 Crear endpoint PDF para cotizaciones
6. 🟡 Dashboard: estado vacío en vez de zeros
7. 🟡 Investigar y fixear crash de Desempeño

**Prioridad 3 — Completitud funcional:**
8. 🟢 Expandir Documentos para incluir docs generales
9. 🟢 Separar Alertas en lista + configuración
10. 🟢 Validación de currency (UF vs CLP sanity check)

**Prioridad 4 — Features nuevas:**
11. 🔵 Crear sección Protocolos en portal cliente
12. 🔵 Renaming "Alertas" → "Notificaciones"

---

*Auditoría completada. No se realizó ninguna corrección. Este documento sirve como base para la Fase 2 de corrección funcional.*
