**PROMPT DE EJECUCIÓN**

**Portal Cliente OPAI**

Basado en auditoría del codebase real

Gard Security --- OPAI ERP

Versión 1.0 --- Marzo 2026

Next.js 15 • Prisma • PostgreSQL • Pusher • R2 • Resend

+-----------------------------------------------------------------------------------------------------+
| **INSTRUCCIONES PARA CURSOR**                                                                       |
|                                                                                                     |
| Este documento es un prompt de ejecución. Reférencia archivos, modelos y rutas reales del codebase. |
|                                                                                                     |
| Ejecutar por fases. Cada fase tiene criterios de aceptación específicos.                            |
|                                                                                                     |
| NUNCA duplicar lógica existente. Reutilizar componentes y APIs ya creados.                          |
|                                                                                                     |
| Antes de crear algo nuevo, verificar si ya existe en el codebase.                                   |
+-----------------------------------------------------------------------------------------------------+

**1. Contexto del Proyecto**

**1.1 Stack Tecnológico Confirmado**

-   **Framework:** Next.js 15.4.11, App Router, React 18.3.1

-   **ORM:** Prisma (multi-schema: public, payroll, fx, cpq, crm, docs, ops, finance, inventory, notes, chat)

-   **DB:** PostgreSQL (Neon prod, Docker pgvector local)

-   **UI:** Tailwind CSS + Radix UI + shadcn + Design System OPAI (src/components/opai/)

-   **Auth:** Auth.js v5 (NextAuth) para admin; RUT+PIN custom para portales

-   **Real-time:** Pusher (chat)

-   **Storage:** Cloudflare R2 (S3-compatible)

-   **Email:** Resend + React Email templates

-   **Tema:** Dark theme con ThemeProvider

**1.2 Estado Actual del Portal Cliente**

Ya existe una base funcional en el codebase:

-   **Ruta:** src/app/portal/cliente/

-   **Layout:** viewport móvil, themeColor #0a0a0f

-   **Componente principal:** PortalClienteClient.tsx

-   **Auth:** src/lib/portal-cliente.ts (validateClienteSession)

-   **API Auth:** src/app/api/portal/cliente/auth/route.ts

-   **APIs existentes:** summary, compliance, guards, activity, contracts, chat (channels, messages, upload, read, pusher auth)

-   **Chat:** ChatClienteSection (ya funcional con Pusher)

-   **Contratos:** PortalContractsSection (lee Document + DocAssociation)

**1.3 Mapa de Existencia vs Creación**

  ----------------------------------------- ---------------- -----------------------
  **Componente / Recurso**                  **Estado**       **Acción**

  Auth RUT+PIN + validateClienteSession     **Existe**       Extender a PIN 6 díg

  API auth portal cliente                   **Existe**       Agregar magic link

  Dashboard (summary, compliance, guards)   **Existe**       Extender KPIs

  Chat por instalación (Pusher)             **Existe**       Reutilizar

  Chat con grupos Gard                      **Parcial**      Crear canales GROUP

  Contratos (Document + DocAssociation)     **Existe**       Agregar firma

  Cotizaciones en portal                    **No existe**    Crear API + UI

  Tickets portal cliente                    **No existe**    Crear API + UI

  Rondas portal cliente                     **No existe**    Crear API + UI

  Posta/Bitácora portal cliente             **No existe**    Crear API + UI

  Config visibilidad por cliente            **No existe**    Crear

  Flujo comercial (prospección)             **No existe**    Crear

  Datos demo IA                             **No existe**    Crear

  Formulario datos contractuales            **No existe**    Crear

  Reportes mensuales PDF                    **No existe**    Crear

  Vista comparativa instalaciones           **No existe**    Crear

  Alertas configurables                     **No existe**    Crear

  Firma electrónica                         **Parcial**      Integrar DocSignature

  Encuestas desde portal                    **Parcial**      Crear flujo

  PWA (manifest + SW)                       **No existe**    Crear
  ----------------------------------------- ---------------- -----------------------

**2. Cambios en Schema Prisma**

**2.1 Extender CrmAccount (schema crm)**

Agregar campo de configuración de visibilidad del portal cliente:

// prisma/schema.prisma --- model CrmAccount

portalConfig Json? // Configuración de visibilidad del portal

Estructura del JSON portalConfig:

{ dashboard: true, guardias: true, liquidaciones: false, asistencia: true,

pautas: true, examenes: false, rondas: true, posta: true,

documentacion: true, cotizaciones: true, chat_instalacion: true,

chat_grupos: true, tickets: true, encuestas: true,

reportes: true, comparativa: true, alertas: true }

**2.2 Extender CrmContact (schema crm)**

Campos para magic link y PIN de 6 dígitos:

portalMagicToken String? // Token único para primer acceso

portalMagicTokenExp DateTime? // Expiración del magic link (48h)

NOTA: portalPin ya existe y soporta bcrypt. Validar que acepte 6 dígitos (actualmente no hay restricción de longitud en el hash).

**2.3 Nuevos Modelos**

**PortalClienteAlertConfig (schema crm)**

model PortalClienteAlertConfig {

id String \@id \@default(cuid())

tenantId String

contactId String // CrmContact que configura

accountId String

alertType String // guard_absent, ronda_incomplete, checkpoint_missed,

// incident, new_document, ticket_replied,

// quote_pending, contract_expiring

channels Json // { push: true, email: false }

isActive Boolean \@default(true)

createdAt DateTime \@default(now())

}

**PortalClienteReporte (schema crm)**

model PortalClienteReporte {

id String \@id \@default(cuid())

tenantId String

accountId String

installationId String

period String // \'2026-03\'

pdfUrl String?

generatedAt DateTime?

sentAt DateTime?

data Json // KPIs del periodo

createdAt DateTime \@default(now())

}

**PortalClienteDemoData (schema crm)**

model PortalClienteDemoData {

id String \@id \@default(cuid())

tenantId String

contactId String \@unique

demoData Json // Datos generados por IA

generatedAt DateTime \@default(now())

}

**3. Autenticación Extendida**

**3.1 Magic Link de Primer Acceso**

Archivo a modificar: src/lib/portal-cliente.ts

**Flujo:**

1.  Al enviar cotización (src/app/api/cpq/quotes/\[id\]/send-email/route.ts), generar portalMagicToken (crypto.randomUUID) y portalMagicTokenExp (now + 48h) en el CrmContact.

2.  Incluir en el email de cotización (CpqQuoteEmail.tsx) un botón/link: /portal/cliente/setup?token={portalMagicToken}

3.  Crear ruta src/app/portal/cliente/setup/page.tsx que: valide el token, muestre el RUT pre-cargado, pida al usuario crear PIN de 6 dígitos, hashee con bcrypt y guarde en portalPin, marque portalEnabled=true, invalide el magic token, autentique automáticamente.

4.  API: POST /api/portal/cliente/setup --- body { token, pin }.

**3.2 Login Existente**

Modificar src/app/api/portal/cliente/auth/route.ts para:

-   Validar que el PIN sea de 6 dígitos

-   Rate limiting: máximo 5 intentos fallidos por RUT en 15 minutos

-   Agregar campo portalLoginAttempts y portalLockedUntil en CrmContact

-   Recuperación de PIN: POST /api/portal/cliente/forgot-pin --- envía email con magic link para resetear PIN

**3.3 Sesión del Cliente**

La sesión actual retorna: contactId, tenantId, accountId, accountName, firstName, lastName, email, installations. Extender para incluir:

-   portalConfig (configuración de visibilidad de la cuenta)

-   isProspect: boolean (true si la cuenta tiene status=\'prospect\')

-   hasDemoData: boolean

**4. Sistema de Visibilidad Configurable**

**4.1 Panel Admin (lado Gard)**

Modificar: src/components/crm/AccountPortalSection.tsx

Agregar dentro de la sección del portal de la cuenta una grilla de toggles para cada módulo. Los toggles guardan/leen de CrmAccount.portalConfig (JSON).

**API:**

PATCH /api/crm/accounts/\[id\]/portal-config

Body: { portalConfig: { dashboard: true, rondas: false, \... } }

**4.2 Template por Defecto**

Crear un default en src/lib/portal-cliente.ts:

const DEFAULT_PORTAL_CONFIG = {

dashboard: true, guardias: true, liquidaciones: false,

asistencia: true, pautas: false, examenes: false,

rondas: true, posta: true, documentacion: true,

cotizaciones: true, chat_instalacion: true, chat_grupos: true,

tickets: true, encuestas: false, reportes: true,

comparativa: true, alertas: true

}

Si portalConfig es null, usar el default. El admin puede copiar la config de un cliente a otro.

**4.3 Uso en el Frontend**

En PortalClienteClient.tsx, leer portalConfig desde la sesión y renderizar condicionalmente cada sección/tab. La navegación lateral/inferior se adapta dinámicamente.

**5. Nuevas APIs del Portal Cliente**

Todas las APIs van bajo src/app/api/portal/cliente/. Cada endpoint debe validar sesión (validateClienteSession) y filtrar estrictamente por accountId.

**5.1 Rondas**

GET /api/portal/cliente/rondas?installationId=&from=&to=

Lee OpsRondaEjecucion filtrado por installationId (que pertenezca a la cuenta del cliente). Retorna: ejecuciones con status, trustScore, porcentajeCompletado, checkpoints, timestamps.

GET /api/portal/cliente/rondas/\[id\]

Detalle de una ejecución: checkpoints marcados (OpsMarcacionCheckpoint), mapa, trust breakdown.

GET /api/portal/cliente/rondas/live?installationId=

Ejecuciones con status=en_curso para la instalación. Para tiempo real, implementar polling cada 30s o canal Pusher dedicado.

**5.2 Posta / Bitácora**

GET /api/portal/cliente/posta?installationId=&from=&to=

Lee OpsControlNocturno + OpsControlNocturnoInstalacion filtrado por installationId. Retorna registros agrupados por fecha con novedades, rondas vinculadas, guardias.

**5.3 Tickets**

GET /api/portal/cliente/tickets?installationId=&status=

Lee OpsTicket filtrado por installationId (de la cuenta del cliente). Retorna: code, title, status, priority, assignedTeam, createdAt, resolvedAt.

POST /api/portal/cliente/tickets

Crea nuevo OpsTicket con source=\'portal_cliente\', installationId, reportedBy=contactId. Body: { installationId, ticketTypeId, title, description, priority }.

GET /api/portal/cliente/tickets/\[id\]

Detalle del ticket con comentarios (OpsTicketComment).

POST /api/portal/cliente/tickets/\[id\]/comments

El cliente agrega comentario al ticket.

**5.4 Cotizaciones**

GET /api/portal/cliente/cotizaciones

Lee CpqQuote filtrado por accountId. Incluir status, monthlyCost, validUntil, deal asociado.

GET /api/portal/cliente/cotizaciones/\[id\]

Detalle completo de la cotización con líneas (CpqPosition, etc.) y costos calculados (computeCpqQuoteCosts).

POST /api/portal/cliente/cotizaciones/\[id\]/approve

Aprueba la cotización: actualiza CpqQuote.status a \'approved\', mueve el CrmDeal a la etapa isClosedWon (o una etapa intermedia \'approved_by_client\'), dispara el flujo de formulario contractual.

POST /api/portal/cliente/cotizaciones/\[id\]/reject

Rechaza: actualiza status, opcionalmente pide razón.

**5.5 Formulario Datos Contractuales**

POST /api/portal/cliente/contract-data

Body con los datos del formulario post-aprobación:

{ quoteId, companyRut, legalName, representatives: \[{ name, rut, role }\],

legalPersonality, notary, notaryDate, legalAddress,

billingData: { \... }, operativeContacts: \[{ name, email, phone, installationId }\] }

Al recibir: actualiza CrmAccount con datos legales, genera Document desde DocTemplate (usageSlug: \'contrato_cliente\'), vincula con DocAssociation, crea DocSignatureRequest.

**5.6 Firma Electrónica**

Reutilizar el flujo existente: DocSignatureRequest + DocSignatureRecipient. El contrato generado se presenta en el portal y el cliente firma vía src/app/api/docs/sign/\[token\]/route.ts (ya existe). Integrar la UI de firma dentro del portal en lugar de la página externa.

**5.7 Reportes Mensuales**

GET /api/portal/cliente/reportes?installationId=

Lista PortalClienteReporte por cuenta/instalación.

GET /api/portal/cliente/reportes/\[id\]/download

Retorna el PDF (pdfUrl de R2).

Generación: cron job mensual (src/app/api/cron/) que por cada cuenta activa con reportes habilitados genera PDF con KPIs del periodo, lo sube a R2, guarda en PortalClienteReporte, y envía email al cliente.

**5.8 Alertas**

GET /api/portal/cliente/alertas/config

PUT /api/portal/cliente/alertas/config

CRUD de PortalClienteAlertConfig para el contacto autenticado.

GET /api/portal/cliente/alertas/history?from=&to=

Historial de alertas disparadas (leer OpsAlertaRonda por installationId de la cuenta + alertas custom).

**5.9 Vista Comparativa**

GET /api/portal/cliente/comparativa?metric=&from=&to=

Agrega datos de múltiples instalaciones para comparación. Metrics: rondas_cumplimiento, asistencia, tickets, incidentes. Retorna array con installationId, installationName, value, trend.

**5.10 Datos Demo IA**

POST /api/portal/cliente/demo/generate

Genera datos demo con IA (Anthropic API) para el prospecto. Llama a Claude con prompt específico para generar instalaciones, guardias, rondas, KPIs ficticios pero realistas. Cachea en PortalClienteDemoData.

GET /api/portal/cliente/demo/data

Retorna los datos demo cacheados. El frontend los usa en lugar de APIs reales cuando isProspect=true.

**5.11 Encuestas**

GET /api/portal/cliente/encuestas

Lista OpsEncuestaCliente por accountId.

GET /api/portal/cliente/encuestas/pendientes

Encuestas pendientes de responder (si se implementa flujo autoservicio).

**5.12 Guardias --- Documentación Extendida**

GET /api/portal/cliente/guards/\[id\]/documents

Lista OpsDocumentoPersona del guardia (filtrado por tipo según portalConfig: liquidaciones, contratos, certificaciones).

GET /api/portal/cliente/guards/\[id\]/attendance?from=&to=

Lee OpsAsistenciaDiaria del guardia en instalaciones de la cuenta.

GET /api/portal/cliente/guards/\[id\]/exams

Lee ExamAssignment del guardia (resultados de evaluaciones).

**6. Frontend --- Estructura de Componentes**

**6.1 Estructura de Archivos**

Todo bajo src/app/portal/cliente/ y src/components/portal/cliente/:

src/app/portal/cliente/

layout.tsx ← Ya existe, agregar metadata PWA

page.tsx ← Ya existe, renderiza PortalClienteClient

setup/page.tsx ← NUEVO: magic link + crear PIN

forgot-pin/page.tsx ← NUEVO: recuperar PIN

src/components/portal/cliente/

PortalClienteClient.tsx ← Ya existe, REFACTORIZAR

PortalClienteNav.tsx ← NUEVO: navegación dinámica

PortalDashboard.tsx ← NUEVO: dashboard con KPIs

PortalInstallations.tsx ← NUEVO: listado instalaciones

PortalInstallationDetail.tsx ← NUEVO: detalle instalación

PortalGuards.tsx ← NUEVO: guardias por instalación

PortalGuardDetail.tsx ← NUEVO: detalle guardia

PortalRondas.tsx ← NUEVO: rondas por instalación

PortalRondaDetail.tsx ← NUEVO: detalle ejecución

PortalPosta.tsx ← NUEVO: bitácora

PortalContractsSection.tsx ← Ya existe, EXTENDER

PortalCotizaciones.tsx ← NUEVO: cotizaciones

PortalCotizacionDetail.tsx ← NUEVO: detalle + aprobar

PortalContractForm.tsx ← NUEVO: formulario datos contractuales

PortalSignContract.tsx ← NUEVO: firma electrónica

ChatClienteSection.tsx ← Ya existe, reutilizar

PortalTickets.tsx ← NUEVO: tickets

PortalTicketDetail.tsx ← NUEVO: detalle ticket

PortalCreateTicket.tsx ← NUEVO: crear ticket

PortalReportes.tsx ← NUEVO: reportes mensuales

PortalComparativa.tsx ← NUEVO: vista comparativa

PortalAlertas.tsx ← NUEVO: config alertas

PortalEncuestas.tsx ← NUEVO: encuestas

PortalDemoOverlay.tsx ← NUEVO: banner/overlay datos demo

**6.2 Navegación Dinámica**

PortalClienteNav.tsx lee portalConfig de la sesión y renderiza solo los ítems habilitados. En desktop: sidebar colapsable (patrón AppSidebar). En móvil: bottom nav con 5 items principales + menú \'Más\' para el resto.

**Items de navegación (orden sugerido):**

-   Dashboard (icono: LayoutDashboard)

-   Instalaciones (icono: Building2)

-   Rondas (icono: MapPin)

-   Chat (icono: MessageSquare)

-   Tickets (icono: Ticket)

-   Documentos (icono: FileText)

-   Cotizaciones (icono: Receipt)

-   Reportes (icono: BarChart3)

-   Comparativa (icono: GitCompare)

-   Alertas (icono: Bell)

**6.3 Dashboard Principal**

Componente: PortalDashboard.tsx. Reutiliza KpiCard y KpiGrid de src/components/opai/.

**KPIs a mostrar (datos de APIs summary + compliance + guards):**

-   Cumplimiento de rondas % (con trend vs mes anterior)

-   Asistencia % del mes

-   Tickets abiertos / resueltos

-   Incidentes del mes

-   Guardias activos total

-   Próximos vencimientos

**Componentes visuales:**

-   KpiGrid con 6 KpiCards

-   Gráfico Recharts: cumplimiento de rondas últimos 6 meses (LineChart)

-   Lista de alertas recientes (OpsAlertaRonda)

-   Quick links a cada instalación

**6.4 Modo Prospecto (Datos Demo)**

Cuando isProspect=true en la sesión:

-   PortalDemoOverlay muestra banner fijo arriba: \'Datos de demostración --- Contrata para ver tus datos reales\'

-   Todas las secciones usan demoData en lugar de APIs reales

-   La sección de cotizaciones muestra la cotización real del prospecto

-   El chat está activo con el equipo comercial (canal real, no demo)

-   Al aprobar cotización, los datos demo se reemplazan progresivamente por datos reales

**7. Flujo Comercial Detallado**

**7.1 Modificaciones al Envío de Cotización**

Archivo: src/app/api/cpq/quotes/\[id\]/send-email/route.ts

Template: src/emails/CpqQuoteEmail.tsx

**Cambios en la API de envío:**

1.  Verificar que el contacto (CrmContact) existe y tiene email

2.  Generar portalMagicToken (crypto.randomUUID()) y portalMagicTokenExp (Date.now() + 48h) en el contacto

3.  Marcar portalEnabled = true en el contacto

4.  Incluir en el email el link al portal: {baseUrl}/portal/cliente/setup?token={portalMagicToken}

5.  El texto del email debe incluir sección persuasiva invitando a explorar el portal

**7.2 Página de Setup (Primer Acceso)**

Archivo nuevo: src/app/portal/cliente/setup/page.tsx

-   Valida token contra CrmContact.portalMagicToken

-   Si expirado o inválido: muestra error con opción de reenviar

-   Si válido: muestra RUT pre-cargado (solo lectura), campo para crear PIN de 6 dígitos con confirmación

-   Al confirmar: hashea PIN con bcrypt, guarda en portalPin, invalida magic token, crea sesión automática

-   Redirige al dashboard del portal

**7.3 Flujo Post-Aprobación**

Cuando el cliente aprueba una cotización (POST /api/portal/cliente/cotizaciones/\[id\]/approve):

1.  CpqQuote.status → \'approved\'

2.  CrmDeal: mover a etapa \'Aprobado por Cliente\' (crear si no existe en CrmPipelineStage)

3.  Notificar al equipo comercial (Pusher + email)

4.  En el portal, mostrar automáticamente PortalContractForm.tsx

5.  El formulario recopila: RUT empresa, razón social, representantes legales (dinámico, puede ser +1), personalidad jurídica, notaría, fecha notaría, dirección legal, datos facturación, contactos operativos por instalación

6.  POST /api/portal/cliente/contract-data guarda datos, genera contrato desde DocTemplate, crea DocSignatureRequest

7.  El contrato se presenta para firma electrónica en el portal

8.  Al firmar: actualizar CrmDeal a etapa final, notificar equipo Gard, iniciar flujo de activación

**8. Reportes Mensuales y Vista Comparativa**

**8.1 Generación Automática de Reportes**

Cron job: src/app/api/cron/portal-reportes/route.ts

Ejecutar el día 1 de cada mes a las 06:00 para el periodo anterior.

**Por cada cuenta activa con reportes habilitados en portalConfig:**

1.  Por cada instalación activa de la cuenta:

2.  Calcular KPIs del periodo: cumplimiento rondas (OpsRondaEjecucion), asistencia (OpsAsistenciaDiaria), tickets (OpsTicket), incidentes (OpsRondaIncidente + OpsAlertaRonda)

3.  Generar PDF con React Email o librería PDF (ej. \@react-pdf/renderer)

4.  Subir a R2 con key: reportes/{tenantId}/{accountId}/{installationId}/{period}.pdf

5.  Crear registro PortalClienteReporte

6.  Enviar email al contacto principal con link al reporte en el portal

**8.2 Vista Comparativa**

Componente: PortalComparativa.tsx

Para clientes con 2+ instalaciones. Usa Recharts para gráficos comparativos.

-   Selector de métrica (rondas, asistencia, tickets, incidentes)

-   Selector de periodo (mes actual, últimos 3/6/12 meses)

-   Tabla con ranking de instalaciones por la métrica seleccionada

-   Gráfico de barras agrupadas o líneas superpuestas por instalación

**9. Configuración PWA**

**9.1 Archivos a Crear**

-   public/manifest.json --- name: \'Portal Cliente Gard\', short_name: \'Gard Portal\', start_url: \'/portal/cliente\', display: \'standalone\', theme_color: \'#0a0a0f\', background_color: \'#0a0a0f\'

-   public/sw.js --- Service worker con caché de assets estáticos y datos críticos (instalaciones, guardias, últimos KPIs)

-   Iconos PWA en public/icons/ (192x192, 512x512)

**9.2 Registro**

En el layout del portal cliente (src/app/portal/cliente/layout.tsx):

-   Agregar \<link rel=\'manifest\' href=\'/manifest.json\' /\>

-   Agregar meta tags PWA (apple-mobile-web-app-capable, etc.)

-   Registrar service worker en el componente cliente

**10. Seguridad**

**10.1 Aislamiento de Datos**

REGLA CRÍTICA: Cada API del portal cliente DEBE filtrar por accountId de la sesión. Nunca aceptar accountId como parámetro del request; siempre derivarlo de la sesión autenticada.

**Patrón obligatorio en cada endpoint:**

const session = await validateClienteSession(rut, pin);

// Usar session.accountId para TODOS los queries

// NUNCA usar req.query.accountId o req.body.accountId

**10.2 Rate Limiting**

-   Login: 5 intentos fallidos → bloqueo 15 minutos

-   APIs: rate limit por sesión (ej. 100 req/min)

-   Magic links: 1 solo uso, expiran en 48h

**10.3 Auditoría**

Crear tabla PortalClienteAuditLog (schema crm):

model PortalClienteAuditLog {

id String \@id \@default(cuid())

tenantId String

contactId String

action String // login, view_dashboard, view_guard, download_doc, etc.

resource String? // installationId, guardiaId, documentId, etc.

metadata Json?

ip String?

createdAt DateTime \@default(now())

}

**11. Fases de Ejecución**

**Fase 1: Fundación (Semanas 1--3)**

-   Schema Prisma: portalConfig en CrmAccount, magic link fields en CrmContact, PortalClienteAuditLog

-   Auth extendida: magic link setup, PIN 6 dígitos, rate limiting, forgot-pin

-   Config visibilidad: panel admin en AccountPortalSection + API PATCH portal-config

-   Refactorizar PortalClienteClient.tsx: navegación dinámica (PortalClienteNav), routing por sección

-   Dashboard: PortalDashboard.tsx con KPIs (reutilizar APIs summary/compliance/guards existentes)

-   Instalaciones: PortalInstallations.tsx + PortalInstallationDetail.tsx

-   Guardias: PortalGuards.tsx + PortalGuardDetail.tsx con docs/asistencia/exams

**Fase 2: Operaciones (Semanas 4--6)**

-   Rondas: API + PortalRondas.tsx + PortalRondaDetail.tsx (mapa, checkpoints, trust score)

-   Posta: API + PortalPosta.tsx (leer OpsControlNocturno por instalación)

-   Tickets: API CRUD + PortalTickets.tsx + PortalTicketDetail.tsx + PortalCreateTicket.tsx

-   Chat con grupos Gard: crear canales GROUP predefinidos (admin_finanzas, rrhh, comercial, operaciones)

-   Alertas: schema + API + PortalAlertas.tsx (config de notificaciones por tipo)

**Fase 3: Comercial (Semanas 7--9)**

-   Modificar envío de cotización para incluir invitación al portal

-   Cotizaciones en portal: API + PortalCotizaciones.tsx + PortalCotizacionDetail.tsx + aprobar/rechazar

-   Datos demo IA: API de generación + PortalDemoOverlay.tsx + lógica de switch real/demo

-   Formulario contractual: PortalContractForm.tsx + API contract-data

-   Generación de contrato desde template: reutilizar DocTemplate + Document + DocAssociation

-   Firma electrónica: integrar DocSignatureRequest en PortalSignContract.tsx

**Fase 4: Inteligencia (Semanas 10--12)**

-   Reportes mensuales: cron + PDF generation + PortalReportes.tsx

-   Vista comparativa: API + PortalComparativa.tsx (Recharts)

-   Encuestas: flujo portal + PortalEncuestas.tsx

-   PWA: manifest, service worker, iconos, offline cache

-   Auditoría: PortalClienteAuditLog + vista en back-office para Gard (inteligencia comercial)

**12. Criterios de Aceptación por Fase**

**Fase 1:**

-   Un prospecto recibe email con cotización, hace clic en magic link, crea PIN, y accede al portal

-   El admin de Gard puede habilitar/deshabilitar módulos por cliente con toggles

-   El dashboard muestra KPIs reales si es cliente activo

-   El cliente ve sus instalaciones y los guardias asignados con documentación

-   100% aislamiento de datos entre cuentas

**Fase 2:**

-   El cliente ve rondas históricas y en curso con mapa y trust score

-   El cliente ve bitácora/posta por instalación

-   El cliente crea y da seguimiento a tickets

-   El cliente se comunica con departamentos de Gard via chat grupal

-   El cliente configura qué alertas quiere recibir

**Fase 3:**

-   El prospecto ve datos demo realistas generados con IA

-   El prospecto aprueba cotización desde el portal sin intervención humana

-   El CRM se actualiza automáticamente al aprobar

-   El formulario contractual recopila todos los datos necesarios

-   El contrato se genera desde template y se firma electrónicamente

**Fase 4:**

-   Reportes PDF se generan y envían automáticamente cada mes

-   Clientes con múltiples instalaciones pueden comparar KPIs lado a lado

-   El portal es instalable como PWA en Android/iOS

-   Gard puede ver el log de actividad del cliente para inteligencia comercial