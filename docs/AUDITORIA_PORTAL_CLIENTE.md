# Auditoría OPAI — Portal Cliente

Documento generado para mapear lo existente antes de desarrollar el Portal Cliente. Rutas, modelos y componentes son reales del codebase.

---

## 1. Arquitectura General

### Lo que encontré

- **Framework:** Next.js **15.4.11** (package.json), App Router.
- **React:** 18.3.1 (overrides en package.json).
- **Estructura principal:**
  - **`/src/app`:** App Router.
    - `(app)/` — Rutas protegidas (hub, crm, cpq, ops, finanzas, opai, portales, etc.).
    - `(templates)/` — Presentaciones, preview, sign, signed, p.
    - `opai/` — Login, forgot-password, reset-password.
    - `portal/` — Portal guardia, **portal/cliente**, portal/rondas.
    - `marcar/[code]`, `ronda/[code]` — Marcación y rondas públicas.
    - `api/` — API routes (ver abajo).
  - **`/src/components`:** UI compartida.
    - `opai/` — Design system (PageHeader, KpiGrid, DataTable, ModuleCard, AppLayoutClient, etc.).
    - `ui/` — shadcn (button, dialog, input, select, card, etc.).
    - `crm/`, `chat/`, `portal/`, `ops/`, `docs/`, `finance/`, etc.
  - **`/src/lib`** — Auth, prisma, permissions, resend, storage, portal-cliente, etc.
- **ORM:** Prisma (multiSchema: public, payroll, fx, cpq, crm, docs, ops, finance, inventory, notes, chat).
- **Base de datos:** PostgreSQL (README: Neon en prod; AGENTS.md: Docker pgvector/pg16 local).
- **API routes (carpetas principales):**  
  `api/auth`, `api/crm`, `api/cpq`, `api/docs`, `api/ops`, `api/portal` (guardia, cliente, rondas), `api/chat`, `api/notifications`, `api/finance`, `api/personas`, `api/installations`, `api/public`, `api/patrol`, `api/cron`, `api/config`, `api/search`, etc.
- **Server vs Client:** Mix. Layouts y páginas usan Server Components; formularios, chat, portales y dashboards usan `"use client"`. Ejemplo: `(app)/layout.tsx` es Server; `AppLayoutClient`, `PortalClienteClient`, `GuardPortalClient` son Client.
- **UI/estilos:** Tailwind CSS + Radix UI + componentes tipo shadcn (`src/components/ui/`). Design system en `src/components/opai/` (KpiCard, DataTable, ModuleCard, etc.).
- **Temas/dark mode:** `ThemeProvider`, `ThemeToggle`, `ThemeLogo` en `src/components/opai/`; toaster con tema dark en `src/components/ui/toaster.tsx`.

### Lo que NO encontré

- No hay `manifest.json` ni configuración PWA explícita en la raíz del proyecto.

### Observaciones

- Portal Cliente ya tiene ruta `src/app/portal/cliente/` con layout (viewport, themeColor `#0a0a0f`) y cliente en `PortalClienteClient.tsx`. La auditoría sirve para extenderlo sin duplicar.

---

## 2. Sistema de Autenticación

### Lo que encontré

- **Sistema:** Auth.js v5 (NextAuth) — `next-auth@5.0.0-beta.30`. Credentials con tabla `Admin` y bcrypt.
- **Implementación:**
  - Config: `src/lib/auth.ts` (providers Credentials, callbacks jwt/session, session strategy JWT, maxAge 30 días).
  - Route handler: `src/app/api/auth/[...nextauth]/route.ts` (GET/POST).
  - Login: `src/app/opai/login/page.tsx`, `LoginForm.tsx`, `actions.ts` (server action `authenticate` con `signIn('credentials', ...)`).
- **RUT + PIN (portal cliente):** No es NextAuth. Es auth propia del Portal Cliente:
  - `src/lib/portal-cliente.ts`: `validateClienteSession(rut, pin, ip?)`. Busca `CrmContact` con `portalEnabled: true` y cuenta con RUT coincidente; valida PIN contra `portalPin` (bcrypt) o `portalPinVisible`; actualiza `portalLastAccessAt`, `portalLastAccessIp`.
  - API: `src/app/api/portal/cliente/auth/route.ts` — POST body `{ rut, pin }`, devuelve `{ success, data: session }` con `contactId`, `tenantId`, `accountId`, `accountName`, `firstName`, `lastName`, `email`, `installations`, `authenticatedAt`.
- **Roles:** Definidos en `src/lib/permissions.ts`. Roles “legacy” con `DEFAULT_ROLE_PERMISSIONS`: owner, admin, editor, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, solo_finanzas, supervisor, viewer. También `RoleTemplate` en BD (schema public) con `permissions` JSON por tenant para roles custom.
- **Middleware:** `src/middleware.ts`. Usa `auth()` de Auth.js; `isPublicPath()` permite `/portal/`, `/api/portal`, `/api/auth`, `/api/public`, etc. Rutas protegidas sin sesión redirigen a `/opai/login`. Para APIs aplica `apiPathToModule` / `apiPathToSubmodule` y permisos (view/edit/delete) por rol; roles custom (roleTemplateId) no se resuelven en middleware (la API valida por BD).
- **Sesión:** JWT (strategy: jwt), cookie de sesión NextAuth. Portal Cliente no usa sesión NextAuth; usa estado en cliente + sesión devuelta por `/api/portal/cliente/auth` (sin cookie de sesión persistente en el sentido NextAuth).
- **Permisos:** Granular por módulo/submódulo (view | edit | full) y capabilities (invite_users, te_approve, rendicion_approve, etc.) en `permissions.ts`; roles custom en `RoleTemplate.permissions` (JSON).

### Lo que NO encontré

- No hay Clerk ni Supabase Auth. Portal Cliente no usa NextAuth; es flujo RUT+PIN propio.

### Observaciones

- Para el Portal Cliente la identidad es `CrmContact` (portalEnabled + portalPin). Reutilizar `validateClienteSession` y la API de auth existente; cualquier “rol” cliente sería a nivel de contacto/cuenta, no de Admin.

---

## 3. Módulo CRM

### Lo que encontré

- **Cuentas (empresas/clientes):**
  - **Modelo:** `CrmAccount` (schema `crm`, tabla `accounts`).
  - **Campos principales:** id, tenantId, name, rut, legalName, legalRepresentativeName/Rut, notaryName, notaryDate, industry, size, segment, ownerId, type (prospect/default), status (prospect | client_active | client_inactive), isActive, website, address, commune, notes, startDate, endDate, createdAt, updatedAt.
  - **Relaciones:** contacts, deals, installations, opsRefuerzoSolicitudes, encuestasCliente.
- **Contactos:**
  - **Modelo:** `CrmContact` (schema `crm`, tabla `contacts`).
  - **Campos:** id, tenantId, accountId, firstName, lastName, email, phone, roleTitle, isPrimary, portalPin, portalPinVisible, portalEnabled, portalLastAccessAt, portalLastAccessIp, createdAt, updatedAt.
  - **Vinculación:** `accountId` → CrmAccount. Relación account + dealContacts (CrmDealContact) y deals como primary contact.
- **Negocios/Oportunidades:**
  - **Modelo:** `CrmDeal` (schema `crm`, tabla `deals`).
  - **Campos:** id, tenantId, accountId, primaryContactId, title, amount, activeQuotationId, stageId, probability, expectedCloseDate, status, lostReason, proposalLink, proposalSentAt, dealType, notes, driveFolderLink, installationName, technicalVisitDate, service, street, address, city, commune, lat, lng, installationWebsite, totalPuestos, createdAt, updatedAt.
  - **Etapas:** `CrmPipelineStage` (name, order, color, isClosedWon, isClosedLost). Deal tiene stageId.
  - **Cotizaciones:** `CrmDealQuote` relaciona deal con cotización (CpqQuote); Deal.activeQuotationId.
- **Componentes CRM reutilizables (rutas reales):**  
  `src/components/crm/`: CrmAccountDetailClient, CrmAccountsClient, AccountPortalSection, AccountContractsSection, CrmContactDetailClient, CrmDealDetailClient, CrmDealsClient, CrmInstallationDetailClient, CrmInstallationsClient, CrmPipelineTab, CrmActivityTimeline, DetailField, FilterPills, FileAttachments, CreateDealModal, CollapsibleSection, etc.

### Lo que NO encontré

- N/A (CRM está bien modelado y usado).

### Observaciones

- `AccountPortalSection` y `AccountContractsSection` son los que más tocan el mundo “portal cliente” desde el back-office (habilitar portal, PIN, contratos visibles). Reutilizar patrones de detalle (DetailLayout, DetailField) para vistas de solo lectura en el portal.

---

## 4. Módulo de Cotizaciones (CPQ)

### Lo que encontré

- **Cotizaciones:**
  - **Modelo:** `CpqQuote` (schema `cpq`, tabla `quotes`). Campos: id, tenantId, code, name, status, clientName, validUntil, notes, totalPositions, totalGuards, monthlyCost, accountId, contactId, dealId, installationId, createdFromLeadId, currency, aiDescription, serviceDetail, createdAt, updatedAt.
  - **Líneas y totales:** `CpqPosition`, `CpqQuoteParameters`, `CpqQuoteUniformItem`, `CpqQuoteExamItem`, `CpqQuoteCostItem`, `CpqQuoteMeal`, `CpqQuoteVehicle`, `CpqQuoteInfrastructure`, `CpqQuoteAdditionalLine`. Costos calculados por `computeCpqQuoteCosts` (módulo cpq).
  - **Relación con negocios/cuentas:** accountId, contactId, dealId, installationId opcionales.
- **Envío por email:**  
  `src/app/api/cpq/quotes/[id]/send-email/route.ts` — POST, requiere negocio y contacto con email; usa `computeCpqQuoteCosts`, genera PDF (vía otro flujo si aplica), envía con Resend. Template: `src/emails/CpqQuoteEmail.tsx` (React Email).
- **Aprobación de cotizaciones:** No hay flujo explícito de “aprobación de cotización” como estado; el deal tiene etapas (CrmPipelineStage) con isClosedWon/isClosedLost. La cotización se asocia al deal (CrmDealQuote, activeQuotationId).
- **Template de email:** `src/emails/CpqQuoteEmail.tsx` (React Email).

### Lo que NO encontré

- No hay un estado “pending_approval” en CpqQuote ni un flujo de aprobación multi-paso específico para cotizaciones.

### Observaciones

- Si el Portal Cliente debe “aprobar” o “rechazar” cotizaciones, habría que definir si eso mueve el deal de etapa o agrega un estado en quote/custom.

---

## 5. Módulo de Contratos

### Lo que encontré

- **Contratos (documentos legales):** No existe un modelo `Contract` o `CrmAccountContract`. Los “contratos” son **documentos** del módulo docs:
  - **Modelo:** `Document` (schema `docs`, tabla `documents`). Campos: id, tenantId, uniqueId, templateId, title, content (Tiptap JSON), tokenValues, module, category, status (draft, review, approved, active, expiring, expired, renewed), effectiveDate, expirationDate, renewalDate, alertDaysBefore, signatureStatus, signedAt, signedBy, signatureData, pdfUrl, pdfGeneratedAt, signedViewToken, **portalVisible**, createdBy, approvedBy, approvedAt, createdAt, updatedAt.
  - **Vinculación a cuentas/instalaciones:** `DocAssociation` (documentId, entityType, entityId, role). entityType: "crm_account", "crm_deal", "crm_installation", "crm_contact".
  - **Templates:** `DocTemplate` (schema docs): name, description, content (JSON), module, category, tokensUsed, isActive, isDefault, usageSlug, etc. Versiones en `DocTemplateVersion`.
- **Categorías de contrato visibles en portal:** En `src/app/api/portal/cliente/contracts/route.ts`: contrato_cliente, contrato_servicio, contrato_confidencialidad, acuerdo_nivel_servicio, adendum.
- **Firma electrónica:** `DocSignatureRequest`, `DocSignatureRecipient` (token, status, signedAt, signatureMethod, etc.). API de firma por token: `src/app/api/docs/sign/[token]/route.ts`; envío de email de firma: `src/lib/docs-signature-email.ts`, resend desde `src/app/api/docs/documents/[id]/signature-request/resend/...`.
- **Vencimientos/renovaciones:** Document tiene expirationDate, renewalDate, alertDaysBefore, status expiring/expired/renewed. No hay modelo separado de “renovación”; es estado del documento.
- **API Portal Cliente contratos:** GET `/api/portal/cliente/contracts?tenantId=&accountId=` devuelve documentos con module=crm, category en CONTRACT_CATEGORIES, portalVisible=true y asociación entityType=crm_account, entityId=accountId.
- **Sección en back-office:** `src/components/crm/AccountContractsSection.tsx` (lista, subir, generar desde template, marcar portal visible, eliminar). API interna: `src/app/api/crm/accounts/[id]/contracts/route.ts`.

### Lo que NO encontré

- No hay tabla `contracts` ni modelo Prisma “Contract”. Todo es Document + DocAssociation.

### Observaciones

- Portal Cliente ya puede listar contratos vía `/api/portal/cliente/contracts`. Solo falta UI en `PortalClienteClient` (ya existe pestaña “contratos” y `PortalContractsSection`). Revisar si el cliente debe poder descargar PDF (pdfUrl) o solo ver estado.

---

## 6. Instalaciones

### Lo que encontré

- **Modelo:** `CrmInstallation` (schema `crm`, tabla `installations`). Campos: id, tenantId, accountId, leadId, name, address, city, commune, lat, lng, isActive, geoRadiusM, marcacionCode, teMontoClp, notes, metadata (JSON), nocturnoEnabled, chatEnabled, startDate, endDate, createdAt, updatedAt.
- **Relaciones:** account, lead, quotes, opsPuestos (OpsPuestoOperativo), opsPautas, opsAsistencias, opsTurnosExtra, opsRefuerzoSolicitudes, opsAsignacionGuardias, opsMarcaciones, opsCheckpoints, opsRondaTemplates, guardiasActuales (OpsGuardia), opsControlNocturnoInstalaciones, supervisionVisits, protocolDocuments, exams, chatChannel (ChatChannel), etc.
- **Estados:** isActive (boolean). No hay enum de estados; se deriva de isActive y fechas startDate/endDate.
- **Asignación de guardias:** Por puestos: `OpsPuestoOperativo` (installationId); `OpsAsignacionGuardia` (guardia en puesto); pauta en `OpsPautaMensual` y asistencia en `OpsAsistenciaDiaria` (plannedGuardiaId, actualGuardiaId por puesto/slot/fecha).

### Lo que NO encontré

- No hay estado “suspendido” o “pendiente_activación” como valor discreto; solo isActive + fechas.

### Observaciones

- En Portal Cliente la sesión incluye `installations` (id, name) de la cuenta; el dashboard filtra por installationId. Reutilizar mismo modelo para cualquier vista por instalación.

---

## 7. Guardias

### Lo que encontré

- **Modelo:** `OpsGuardia` (schema `ops`). Campos: id, tenantId, personaId (OpsPersona), rut, firstName, lastName, email, phone, currentInstallationId, status, pin (hash), pinVisible, lastLoginAt, documentación (contratos, anexos, certificaciones) vía relación `documents` → `OpsDocumentoPersona` (tipo, nombre, url, etc.).
- **Documentación:** `OpsDocumentoPersona` (personaId/guardiaId, tipo, name, fileUrl, storageKey, etc.). No hay tabla “certificaciones” separada; es por tipo en OpsDocumentoPersona.
- **Liquidaciones:** `PayrollLiquidacion` (schema payroll) vinculado a guardia/periodo; módulo payroll. No hay tabla “liquidación por instalación” como tal; la asignación es puesto/instalación y la liquidación es por persona/periodo.
- **Asistencia:** `OpsAsistenciaDiaria` (schema ops): installationId, puestoId, slotNumber, date, plannedGuardiaId, actualGuardiaId, replacementGuardiaId, attendanceStatus, checkInAt, checkOutAt, plannedMinutes, workedMinutes, overtimeMinutes, etc.
- **Pautas:** `OpsPautaMensual` (por puesto/slot, fechas); `OpsSerieAsignacion` (guardia en serie). Pauta diaria vista en ops/pauta-diaria.
- **Exámenes/evaluaciones:** `Exam`, `ExamQuestion`, `ExamAssignment` (schema crm). API portal guardia: `src/app/api/portal/guardia/exams/route.ts`, submit en `exams/[id]/submit/route.ts`. Los exámenes están asociados a instalaciones (`installations/[id]/exams`).

### Lo que NO encontré

- No hay modelo “Evaluación IA” separado; los exámenes son Exam/ExamAssignment.

### Observaciones

- Portal Cliente no necesita CRUD de guardias; solo puede mostrar “quién está en mi instalación” (guards en dashboard). API existente: `/api/portal/cliente/guards`.

---

## 8. Rondas 2.0

### Lo que encontré

- **Modelos:**  
  - `OpsCheckpoint` (installationId, name, qrCode, lat, lng, geoRadiusM, verificationType, isCritical, sortOrder).  
  - `OpsRondaTemplate` (installationId, name, orderMode, estimatedDurationMin, qrRequerido).  
  - `OpsRondaCheckpoint` (rondaTemplateId, checkpointId, orderIndex, isRequired, maxTimeMinutes).  
  - `OpsRondaProgramacion` (rondaTemplateId, diasSemana JSON, horaInicio, horaFin, frecuenciaMinutos, toleranciaMinutos).  
  - `OpsRondaEjecucion` (rondaTemplateId, programacionId, guardiaId, status: pendiente | en_curso | completada | incompleta | no_realizada, scheduledAt, startedAt, completedAt, checkpointsTotal/Completados, porcentajeCompletado, **trustScore**, trustBreakdown JSON, durationMinutes, isOfflineSync, installationId, deviceInfo, alertas JSON).  
  - `OpsMarcacionCheckpoint` (ejecucionId, checkpointId, guardiaId, timestamp, lat, lng, geoValidada, geoDistanciaM, fotoEvidenciaUrl, etc.).  
  - `OpsAlertaRonda` (ejecucionId, installationId, guardiaId, tipo, severidad, mensaje, data, resuelta, isAcknowledged).  
  - `OpsRondaIncidente` (ejecucionId, rondaTemplateId, checkpointId, guardiaId, installationId, tipo, descripcion, fotoUrl, status).
- **Trust scoring / geofencing:** trustScore y trustBreakdown en OpsRondaEjecucion; geoValidada, geoDistanciaM en OpsMarcacionCheckpoint; geoRadiusM en OpsCheckpoint.
- **API tiempo real:** Chat usa **Pusher** (`pusher`, `pusher-js` en package.json). Rutas: `src/app/api/chat/pusher/auth/route.ts`, `src/app/api/portal/guardia/chat/pusher/auth/route.ts`, `src/app/api/portal/cliente/chat/pusher/auth/route.ts`. Rondas: no hay WebSockets/SSE específicos; se consultan por API REST (ej. cron que genera ejecuciones).
- **Vista de ronda:** Monitoreo en `src/app/(app)/ops/rondas/` (configuración, reportes, etc.); ejecuciones y cierre de turno en API y componentes en `src/components/ops/rondas/` (CheckpointMapCreator, RondaMap, etc.). Portal Rondas: `src/app/portal/rondas`, `src/components/portal/rondas/` (LoginScreen, RondaMap, etc.).
- **Componentes UI:** `CheckpointMapCreator`, `RondaMap`, y componentes de listado/reportes en `ops/rondas`.

### Lo que NO encontré

- No hay API de tiempo real (WebSocket/SSE) dedicada a “ronda en vivo” para el Portal Cliente; el cliente vería datos por polling o por resumen (summary/compliance/activity ya expuestos).

### Observaciones

- Portal Cliente ya tiene summary, compliance, guards, activity por instalación. Si se quiere “ronda en vivo”, habría que añadir polling o un canal Pusher/SSE para ejecuciones.

---

## 9. Posta (Bitácora)

### Lo que encontré

- **Control nocturno (bitácora):** No hay modelo “Posta” con ese nombre. El equivalente es **OpsControlNocturno** (schema ops, tabla `control_nocturno`): id, tenantId, date, centralOperatorName, centralLabel, shiftStart, shiftEnd, status (borrador, enviado, aprobado, rechazado), generalNotes, submittedAt, approvedAt, etc.  
  - **OpsControlNocturnoInstalacion** (controlNocturnoId, installationId, installationName, ...).  
  - **OpsControlNocturnoGuardia** (por instalación).  
  - **OpsControlNocturnoRonda** (vincula a OpsRondaEjecucion).
- Es un reporte **por fecha y central**, no “posta diaria” por instalación como entidad separada; las instalaciones y rondas se vinculan al control nocturno.

### Lo que NO encontré

- No hay tabla “posta” ni “bitácora” con nombre así; el concepto está cubierto por control nocturno.

### Observaciones

- Si el Portal Cliente debe ver “bitácora” o “posta”, habría que definir si es solo lectura del control nocturno por instalación/cuenta o un resumen derivado.

---

## 10. Sistema de Chat

### Lo que encontré

- **Tecnología:** **Pusher** (pusher + pusher-js). Cliente: `src/components/chat/lib/chat-pusher.ts`, hooks `usePusher`, `useChatChannel`, `useChatTyping`. Auth: `src/app/api/chat/pusher/auth/route.ts`, `src/app/api/portal/guardia/chat/pusher/auth/route.ts`, `src/app/api/portal/cliente/chat/pusher/auth/route.ts`.
- **Modelos (schema `chat`):**  
  - `ChatChannel`: id, tenantId, channelType (INSTALLATION | GROUP | DIRECT), installationId (unique), groupId, name, isActive, lastMessageAt, lastMessagePreview, messageCount.  
  - `ChatMessage`: channelId, senderType (ADMIN | GUARD | CLIENT | SYSTEM), senderAdminId, senderGuardiaId, senderContactId, senderName, senderAvatar, content, contentHtml, replyToId, threadRootId, replyCount, lastReplyAt, attachments, systemEventType/Data, isEdited, deletedAt.  
  - `ChatReadCursor`, `ChatMessageReaction`, `ChatMention`, `ChatNotificationPreference`, `ChatPushSubscription`, `ChatDmParticipant`.
- **Canales/conversaciones:** Un canal por instalación (ChatChannel.installationId); también GROUP y DIRECT (groupId, dmParticipants).
- **Grupos:** channelType GROUP con groupId; no se vio en el código cómo se crean (probablemente desde back-office).
- **Componentes UI:** `ChatConversation`, `ChatMessageList`, `ChatMessage`, `ChatInput`, `ChatFloatingPanel`, `ChatFloatingButton`, `ChatFloatingProvider`, `ChatChannelList`, `ChatThreadPanel`, `ChatClienteSection` (portales), `ChatGuardSection` (portal guardia).
- **Vinculación con instalación:** CrmInstallation.chatEnabled y relación chatChannel (1:1). Portal Cliente usa `/api/portal/cliente/chat/channels`, `channels/[id]/messages`, upload, read, pusher auth. El cliente se identifica por contactId (senderContactId en mensajes).

### Lo que NO encontré

- No hay Supabase Realtime ni otro provider de tiempo real para chat; solo Pusher.

### Observaciones

- Portal Cliente ya tiene pestaña “chat” y `ChatClienteSection`; reutilizar mismo flujo de canales por instalación y auth Pusher para cliente.

---

## 11. Módulo de Tickets

### Lo que encontré

- **Modelo:** `OpsTicket` (schema ops, tabla `ops_tickets`). Campos: id, tenantId, code, ticketTypeId, status, priority (p3 por defecto), title, description, assignedTeam, assignedTo, installationId, source, sourceGuardEventId, guardiaId, reportedBy, slaDueAt, slaBreached, resolvedAt, closedAt, resolutionNotes, tags, currentApprovalStep, approvalStatus, metadata, createdAt, updatedAt.
- **Tipos:** `OpsTicketType` (name, slug, description, etc.) con `OpsTicketTypeApprovalStep` (approverGroup, stepOrder, etc.).
- **Estados/prioridades:** status (open, etc.), priority; categorías vía ticketTypeId.
- **Relaciones:** installationId (CrmInstallation), guardiaId (OpsGuardia), ticketType; approvals (OpsTicketApproval), comments (OpsTicketComment); refuerzoSolicitud, supervisionFindings.
- **Componentes UI:** `src/components/ops/tickets/` (TicketDetailClient, etc.); listado en ops/tickets. Portal guardia: `/api/portal/guardia/tickets` (listar, aceptar rechazo, apelar).

### Lo que NO encontré

- No hay API de tickets para Portal Cliente; solo para guardia (ver sus tickets, apelar, aceptar rechazo).

### Observaciones

- Si el cliente debe ver o crear tickets (ej. por instalación), habría que añadir rutas bajo `/api/portal/cliente/tickets` y reutilizar OpsTicket (installationId, reportedBy podría ser contactId o “cliente”).

---

## 12. Encuestas de Satisfacción

### Lo que encontré

- **Modelo:** `OpsEncuestaCliente` (schema ops, tabla `encuestas_cliente`). Campos: id, tenantId, visitId (unique), installationId, accountId, contactName, contactRole, serviceQuality, scheduleCompliance, personalPresentation, professionalism, supervisionPresence, incidentResponse, hasUrgentRisk, urgentRiskDetail, npsScore, additionalComments, signatureUrl, clientPhotoUrl, averageScore, createdAt. Relación con `OpsVisitaSupervision` (visitId).
- **Uso:** Se rellenan en contexto de visita de supervisión (encuesta al cliente en sitio). No hay flujo “enviar encuesta por email” ni “recopilar por link” en el codebase revisado.

### Lo que NO encontré

- No hay módulo de “envío de encuesta por email” ni “encuesta autoservicio” desde el portal; la encuesta existe como formulario asociado a visita de supervisión.

### Observaciones

- Para que el cliente responda encuestas desde el portal habría que definir flujo (link por email, lista en portal, etc.) y posiblemente un estado “pendiente” por contacto/cuenta.

---

## 13. Componentes Reutilizables

### Lo que encontré

- **Design system (`src/components/opai/`):**  
  - **KpiGrid:** `KpiGrid.tsx` — grid responsive para KpiCards.  
  - **DataTable:** `DataTable.tsx` + tipo `DataTableColumn` — tablas con columnas configurables.  
  - **ModuleCard:** `ModuleCard.tsx` — tarjetas de módulo (hub, etc.).  
  - **PageHeader:** `PageHeader.tsx`.  
  - **KpiCard:** `KpiCard.tsx` (con trend).  
  - **EmptyState, LoadingState, LoadingSpinner:** `EmptyState.tsx`, `LoadingState.tsx`, `LoadingSpinner.tsx`.  
  - **Avatar, Stepper, Breadcrumb, StatusBadge.**  
  - **ThemeProvider, useTheme, ThemeToggle, ThemeLogo.**  
  - **AppShell, AppSidebar, AppLayoutClient.**  
  - **SubNav, BottomNav, CommandPalette.**  
  - **DetailLayout, SectionNav, FilterBar (en opai).**  
  - **DocumentosContent, DocumentosSubnav, ConfigBackLink, etc.**  
  Export central: `src/components/opai/index.ts`.
- **UI base (`src/components/ui/`):** button, card, dialog, input, label, select, textarea, popover, dropdown-menu, sheet, badge, skeleton, toaster (Sonner), confirm-dialog, SearchableSelect, MapCoordinatePicker, FilePreviewModal, etc.
- **Sidebar / navegación:** `AppSidebar`, `AppLayoutClient` (sidebar + topbar), `AppNavigation`, `BottomNav` (móvil). Navbar: `RoleSwitcher`, `SimulationBanner`.
- **Modales/formularios:** dialog (ui), confirm-dialog; formularios por módulo (CreateDealModal, etc.). Selectores: SearchableSelect, FilterBar.
- **Notificaciones toast:** **Sonner** — `import { toast } from "sonner"`; host en `src/components/ui/toaster.tsx` (tema dark). Uso en muchos componentes (Config, CRM, Finance, Portal Guardia, etc.).
- **Notificaciones push:** Modelo `ChatPushSubscription` (chat); librería `web-push` en package.json. Servicio de notificaciones: `src/lib/notification-service.ts`; tipos de notificación y preferencias en `UserNotificationPreference` (public). No se revisó si el Portal Cliente tiene suscripción push.

### Lo que NO encontré

- No hay componente “ModuleCard” con otro nombre; está en opai/ModuleCard.

### Observaciones

- Para el Portal Cliente conviene reutilizar KpiCard/KpiGrid para resúmenes, EmptyState/LoadingState, y el mismo patrón de tabs/pestañas que ya usa PortalClienteClient (dashboard, chat, contratos). Toast ya es Sonner; si el cliente usa la misma app, el Toaster ya está en layout.

---

## 14. Sistema de Documentos/Archivos

### Lo que encontré

- **Almacenamiento:** **Cloudflare R2** (S3-compatible). `src/lib/storage.ts`: S3Client con endpoint R2, `PutObjectCommand`, `DeleteObjectCommand`, `buildStorageKey(prefix)` (formato prefix/YYYY/MM/uuid.ext). Variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.
- **Uso:** Adjuntos CRM (`api/crm/files`, upload), protocol documents (`api/installations/[id]/protocol/documents`), chat upload (`api/chat/upload`, `api/portal/guardia/chat/upload`, `api/portal/cliente/chat/upload`), notas, postulación, supervisión (fotos), finance attachments, config global-documents, documentos guardia (`personas/guardias/upload`).
- **Gestión documental:** Módulo docs: DocCategory, DocTemplate, DocTemplateVersion, Document, DocSignatureRequest, DocSignatureRecipient, DocAssociation, DocHistory. Documentos se vinculan a entidades vía DocAssociation (entityType, entityId).
- **Vinculación:** A cuentas/instalaciones/contactos/deals vía DocAssociation. A guardias: OpsDocumentoPersona. ProtocolDocument/ProtocolVersion para instalaciones (protocolo de servicio).

### Lo que NO encontré

- No hay almacenamiento local ni Supabase Storage; solo R2.

### Observaciones

- Cualquier “descarga” de contrato (PDF) en el portal debería usar pdfUrl del Document (que puede estar en R2 o en otra URL según cómo se genere el PDF). Ver cómo se expone pdfUrl de forma segura (signedViewToken o similar).

---

## 15. Sistema de Email

### Lo que encontré

- **Servicio:** **Resend** — `resend` (package `resend`). Config: `src/lib/resend.ts` (RESEND_API_KEY, EMAIL_CONFIG.from/replyTo). Config por tenant: `getTenantEmailConfig(tenantId)` (desde tenant-config, cache 5 min).
- **Templates:** React Email en `src/emails/` (ej. `CpqQuoteEmail.tsx`, `PresentationEmail.tsx`). Render con `@react-email/render`. Preview: `src/app/(templates)/templates/email/preview/page.tsx`.
- **Lógica de envío:** En cada feature: `src/app/api/cpq/quotes/[id]/send-email/route.ts`, `src/app/api/presentations/send-email/route.ts`, `src/lib/docs-signature-email.ts`, `src/lib/notification-service.ts`, `src/lib/control-nocturno-email.ts`, `src/lib/docs-alert-email.ts`, forgot-password, etc. Webhook inbound: `src/app/api/webhook/inbound-email/route.ts`, `src/app/api/webhook/resend/route.ts`.

### Lo que NO encontré

- No hay SendGrid ni Nodemailer como provider principal; solo Resend.

### Observaciones

- Para emails desde el Portal Cliente (ej. “solicitar contacto” o notificaciones al cliente) usar Resend y getTenantEmailConfig; opcionalmente crear templates en `src/emails/` y rutas de envío bajo `/api/portal/cliente/...`.

---

## 16. PWA / Mobile

### Lo que encontré

- **PWA:** No hay `manifest.json` ni service worker en la raíz del repo (búsqueda con glob no encontró manifest).
- **Portales:** Son **rutas dentro de la misma app** Next.js:  
  - **Portal Guardia:** `src/app/portal/guardia/page.tsx` → `GuardPortalClient`; layout en `src/app/portal/` (si existe) o heredado. APIs bajo `api/portal/guardia/` (auth, schedule, marcaciones, chat, tickets, liquidaciones, protocol, exams, documents, extra-shifts, attendance, etc.).  
  - **Portal Rondas:** `src/app/portal/rondas` (y posiblemente `src/app/ronda/[code]` para flujo público); APIs `api/portal/rondas/` (auth, mis-rondas, marcar, incidente, sync) y `api/public/ronda/...`, `api/patrol/...`.  
  - **Portal Cliente:** `src/app/portal/cliente/` con layout (viewport, themeColor), página que renderiza `PortalClienteClient`; APIs `api/portal/cliente/` (auth, summary, compliance, guards, activity, contracts, chat/*).  
  - **Supervisores:** Vista en `src/app/(app)/ops/supervision/` (dashboard, mis-visitas, asignaciones, historial); no es un “portal” separado sino parte del (app) con sesión Admin.
- **Viewport móvil:** Layout del portal cliente define viewport (device-width, initialScale 1, maximumScale 1, userScalable false, themeColor #0a0a0f).

### Lo que NO encontré

- No hay manifest.json ni service worker; no hay build PWA explícito.
- No hay apps separadas (React Native, etc.); todo es la misma app Next.js.

### Observaciones

- Los portales están optimizados para móvil vía viewport y diseño responsive. Si se quiere PWA instalable, habría que añadir manifest y service worker y, si aplica, notificaciones push para cliente (web-push ya existe para notificaciones en la app).

---

## Resumen para el Portal Cliente

| Área              | Reutilizar / Adaptar                                                                 | Crear desde cero / Definir                                      |
|-------------------|--------------------------------------------------------------------------------------|------------------------------------------------------------------|
| Auth              | `validateClienteSession`, POST `/api/portal/cliente/auth`, sesión en cliente        | —                                                                |
| Dashboard         | APIs summary, compliance, guards, activity; KpiCard, KpiGrid, gráficos Recharts     | Nuevas métricas o vistas si se piden                            |
| Contratos         | GET `/api/portal/cliente/contracts`, Document + DocAssociation, PortalContractsSection | Descarga segura de PDF (signedViewToken o similar) si no existe |
| Chat              | Pusher auth y canales por instalación, ChatClienteSection                           | —                                                                |
| Tickets           | Modelo OpsTicket, UI de guardia                                                       | API y UI de listado/creación para cliente si aplica             |
| Encuestas         | Modelo OpsEncuestaCliente                                                            | Flujo “encuesta desde portal” o por link                         |
| Notificaciones    | Sonner (toast); web-push si se quiere push para cliente                              | Preferencias de notificación para contacto (opcional)           |
| Documentos/PDF    | R2, Document.pdfUrl, DocSignature*                                                  | Política de acceso a PDF para cliente (token, signed view)      |

Si quieres, el siguiente paso puede ser un plan de tareas (por fases) para ampliar el Portal Cliente sobre esta base.
