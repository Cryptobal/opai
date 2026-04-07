# OPAI — Auditoria Completa del Sistema

**Fecha:** 2026-04-04
**Version analizada:** commit `927ae9a32` (feat: add opai.cl marketing landing page)
**Package version:** 0.1.0
**Stack:** Next.js 16.1.6 (App Router, Turbopack), TypeScript 5.6, Prisma 6.19, Tailwind CSS, Vercel

---

## Resumen Ejecutivo

### 1. Los 5 modulos mas completos y maduros

1. **Operaciones (Guardias + Pautas + Marcaciones)** — 88 modelos Prisma, 167 API routes. Sistema completo de fichas OS10, pautas mensuales drag-drop, marcaciones GPS con foto, Face ID (AWS Rekognition), alertas de cobertura con oleadas WhatsApp automaticas.
2. **CRM + CPQ** — 45 + 19 modelos, 75 + 38 API routes. Pipeline de ventas completo, cotizaciones con PDFs generados por Playwright, propuestas comerciales interactivas, follow-up automatico por email.
3. **Finanzas + Facturacion** — 46 modelos, 63 API routes. Contabilidad de partida doble, plan de cuentas jerarquico, DTE electronico, conciliacion bancaria, rendiciones con aprobaciones, pagos a proveedores, factoring.
4. **Rondas GPS** — Sub-modulo de Ops con checkpoints QR/GPS, monitoreo en tiempo real con Leaflet, IA para analisis nocturno, anomaly detection (velocidad, geo-fence, tiempo), PDFs automaticos de turno.
5. **Chat Interno** — 13 modelos, 22 API routes. Chat real-time con Pusher, canales publicos/privados/DM/broadcast, menciones, reacciones, push notifications (web + mobile), preferencias de notificacion por canal.

### 2. Modulos incompletos o en construccion

- **Gamificacion** — Schema completo (badges, desafios, rankings, beneficios, canje) pero las APIs (15 routes) parecen parcialmente implementadas. La configuracion existe pero el flujo end-to-end no esta completo.
- **Control de Acceso** — 8 modelos + 26 API routes + OCR IA (placas patente, MRZ). La logica de dispositivos y preregistro existe, pero la integracion con hardware fisico (torniquetes) es placeholder.
- **Fiscalizacion DT** — 2 modelos (DtInspectorSession, SystemIncident), 5 API routes. El portal de inspector existe con sesiones temporales, pero es esqueletico.
- **Patrullaje/PPC** — Tiene modelo OpsPatrullajeSesion y geolocation hooks, pero la UI parece minimal.

### 3. Funcionalidades en el codigo que NO estan en la landing

- **AWS Rekognition Face ID** para marcaciones biometricas (activo en produccion)
- **OCR con IA** para lectura de patentes y documentos MRZ (control de acceso)
- **Sistema de notas unificado** (11 modelos) con menciones, reacciones, threads — funciona cross-entity
- **Rendiciones de gastos** con flujo de aprobacion multi-nivel
- **Conciliacion bancaria automatica** con matching de transacciones
- **Factoring** de facturas
- **Examenes y capacitaciones** para guardias
- **Sistema de tickets internos** con workflows de aprobacion configurables
- **Onboarding digital** de guardias con pasos y tracking

### 4. Integraciones configuradas que no se mencionan comercialmente

| Integracion | En el codigo | Mencionada comercialmente |
|---|---|---|
| AWS Rekognition (Face ID) | Activa | No |
| Fintoc (banca) | Mencionada en landing | Schema parcial |
| Capacitor (app nativa iOS/Android) | Activa | Solo "app iOS y Android" |
| Sentry (observabilidad) | Activa | No |
| Svix (webhooks) | Activa | No |
| pgvector (embeddings IA) | Activa | No |
| Gmail OAuth | Activa | No |

### 5. Diferenciadores tecnicos vs ERP generico

1. **Geo-fence con accuracy-aware validation** — No solo distancia, sino confianza basada en precision del GPS del dispositivo
2. **Anomaly detection en rondas** — Velocidad entre checkpoints, tiempo fuera de rango, geo-fence violations → trustScore 0-100
3. **IA operacional real** — No es solo chat: analiza rondas nocturnas, genera resumenes ejecutivos con 7 dias de contexto historico, escala modelo (gpt-4o-mini → gpt-4o) automaticamente por frustration detection
4. **Multi-provider IA** — Soporta OpenAI, Anthropic (Claude) y Google AI con abstraccion transparente
5. **Alertas de cobertura con oleadas** — Cuando falta un guardia, envia WhatsApp a pools de reemplazos en oleadas escalonadas, con tracking de aceptacion
6. **Portales especializados por rol** — 6 portales distintos (cliente, guardia, supervisor, marcacion, rondas, acceso) con auth independiente (PIN, device token, NextAuth)
7. **Compliance LRE** — Payroll chileno con liquidaciones segun ley vigente + limpieza biometrica automatica (Resolucion N38, 90-120 dias post-termino)
8. **PWA con service worker** — Pre-cache de portales, push notifications agrupadas por tag, soporte offline

### 6. Estado de la IA

**La IA es operacional, no cosmetica.** Esta integrada en el flujo de trabajo real:

- **Help Chat con RAG** — Busca en documentacion indexada con embeddings (pgvector + text-embedding-3-small), escala modelo automaticamente si detecta frustracion del usuario (35+ patrones en espanol)
- **Control Nocturno** — Genera resumenes ejecutivos de compliance de rondas con contexto historico de 7 dias
- **OCR en Control de Acceso** — Lee patentes y documentos MRZ con fallback multi-proveedor (OpenAI → Anthropic)
- **CRM Enrichment** — Enriquece leads automaticamente
- **Generacion de amonestaciones** — Redacta previews de documentos disciplinarios
- **Estimacion de costos** — Infiere costos de proyectos desde datos de leads

**NO hay decisiones financieras automaticas** — toda la IA genera sugerencias que requieren validacion humana.

### 7. Conteo de modelos Prisma

**259 modelos** en **13 schemas** + **35 enums**

| Schema | Modelos |
|---|---|
| ops | 88 |
| finance | 46 |
| crm | 45 |
| public | 21 |
| cpq | 19 |
| payroll | 15 |
| inventory | 15 |
| chat | 13 |
| notes | 11 |
| docs | 9 |
| access_control | 8 |
| fx | 2 |
| dt | 2 |

### 8. Conteo de API routes

**801 route.ts files** en 40 modulos

| Modulo | Routes |
|---|---|
| ops | 167 |
| portal | 135 |
| crm | 75 |
| finance | 63 |
| cpq | 38 |
| personas | 26 |
| access-control | 26 |
| public | 25 |
| docs | 25 |
| payroll | 22 |
| cron | 22 |
| chat | 22 |
| installations | 19 |
| gamification | 15 |
| notes | 14 |
| reportes | 12 |
| te | 10 |
| ai | 10 |
| devices | 9 |
| config | 9 |
| operacional | 7 |
| notifications | 6 |
| admin | 6 |
| fiscalizacion | 5 |
| webhook | 4 |
| otros | 29 |

### 9. Funcionalidades planificadas pero no implementadas

- **MercadoPago/Stripe** — El campo `mpSubscriptionId` existe en TenantPlan pero no hay integracion de pagos
- **Subdominio por tenant** — `tenant-resolver.ts` tiene logica para `securitas.opai.cl` pero no hay middleware de routing por subdominio
- **App white-label** — Mencionada en add-ons pero no hay sistema de temas por tenant
- **Reportes avanzados** — El add-on existe en pricing pero no hay dashboards ejecutivos personalizables
- **Prediccion de ausentismo** — Mencionada en la landing/IA pero no hay modelo predictivo implementado
- **Multi-idioma** — Todo esta en espanol, no hay i18n

### 10. Diferenciadores competitivos no comunicados

1. **Face ID para marcaciones** — AWS Rekognition con quality checks, threshold 95%, completamente funcional
2. **Compliance automatica de datos biometricos** — Cron que destruye datos faciales 90-120 dias post-termino (Resolucion N38)
3. **Sistema de notas unificado cross-entity** — Mismo sistema de comentarios/threads/menciones en 20+ tipos de entidad
4. **Conciliacion bancaria automatica** — Matching exacto, parcial, reverso con reconciliacion por periodo
5. **Factoring de facturas** — Modelo y operaciones de factoring integradas
6. **Frustration detection en IA** — El chat detecta 35+ patrones de frustracion y escala automaticamente el modelo

---

## Modulos del Sistema

### OPERACIONES

#### Gestion de Guardias
- **Schema:** ops
- **Modelos:** OpsPersona, OpsGuardia, OpsGuardiaFlag, OpsGuardiaHistory, OpsComentarioGuardia, OpsDocumentoPersona, OpsCuentaBancaria, OpsOnboardingStatus
- **APIs:** /api/ops/guardias/*, /api/personas/*
- **Sub-funcionalidades:**
  - Fichas completas (datos personales, previsionales, tallas, contacto)
  - Documentos con vencimiento y alertas automaticas
  - Historial de cambios (audit trail por campo)
  - Flags y blacklist
  - Lifecycle: postulante → activo → terminado
  - Face ID registration/verification (AWS Rekognition)
  - Onboarding digital con pasos y reminders (cron cada 6h)
  - Cuentas bancarias para payroll
- **Portales:** ERP Admin, Portal Guardia
- **Integraciones:** AWS Rekognition, Resend (emails), Cloudflare R2 (documentos)
- **Geolocalizacion:** No directa (las marcaciones son otro modulo)
- **IA:** No directa
- **Estado:** ✅ Completo

#### Puestos Operativos
- **Schema:** ops
- **Modelos:** OpsPuestoOperativo, OpsAsignacionGuardia
- **APIs:** /api/ops/puestos/*
- **Sub-funcionalidades:**
  - Definicion de puestos por instalacion
  - Asignacion guardia-puesto con fechas
  - Vinculo con PayrollSalaryStructure
- **Estado:** ✅ Completo

#### Pautas Mensuales
- **Schema:** ops
- **Modelos:** OpsPautaMensual, OpsAsistenciaDiaria, OpsPpcSnapshot
- **APIs:** /api/ops/pauta-mensual/*, /api/ops/pauta-diaria/*, /api/ops/pautas/*, /api/ops/audit-pautas/*
- **Sub-funcionalidades:**
  - Planificacion mensual drag-drop
  - Series de asignacion
  - Pauta diaria (vista del dia)
  - PPC (precio por contrato) snapshots
  - Auditoria de pautas
- **Estado:** ✅ Completo

#### Marcaciones GPS
- **Schema:** ops
- **Modelos:** OpsMarcacion, DevicePairing
- **APIs:** /api/ops/marcaciones/*, /api/public/marcacion/*
- **Sub-funcionalidades:**
  - Check-in/out con GPS + foto
  - Validacion geo-fence contra coordenadas de instalacion
  - Metodo: GPS, QR, PIN, Face ID
  - Oposicion (disputa de marcacion con token)
  - Consolidacion automatica (cron horario)
  - Emails diferidos de marcacion (cron cada 5min)
- **Portales:** Portal Guardia, Portal Marcacion (kiosko)
- **Integraciones:** AWS Rekognition, Capacitor GPS/Camera
- **Geolocalizacion:** Core del modulo — latitude, longitude, gpsAccuracy almacenados
- **Estado:** ✅ Completo

#### Rondas GPS
- **Schema:** ops
- **Modelos:** OpsRondaTemplate, OpsRondaCheckpoint, OpsCheckpoint, OpsCheckpointTask, OpsRondaProgramacion, OpsRondaEjecucion, OpsRondaTracking, OpsMarcacionCheckpoint, OpsAlertaRonda, OpsAlertaLog, OpsRondaIncidente
- **APIs:** /api/ops/rondas/* (templates, checkpoints, programacion, monitoreo, alertas, reportes, centro-ia)
- **Sub-funcionalidades:**
  - Templates de ronda con checkpoints secuenciales
  - Checkpoints con tareas (QR scan, foto, respuestas)
  - Programacion automatica (cron cada 10min)
  - Ejecucion desde Portal Rondas con mapa Leaflet
  - Monitoreo en tiempo real con geo-fence visualization
  - Anomaly detection: velocidad entre checkpoints, geo-fence violation, tiempo fuera de rango
  - Trust score 0-100 por checkpoint
  - Alertas automaticas con severidad
  - Cierre automatico de rondas (3 crons cada 15min: libres, atrasadas, en curso)
  - Centro IA: resumen nocturno con contexto historico
  - Reportes con heatmap de densidad
  - Audit trail con mapa
- **Portales:** ERP Admin (monitoreo), Portal Rondas (ejecucion), Portal Supervisor
- **Integraciones:** Leaflet/OpenStreetMap, OpenAI (gpt-4o-mini), Playwright (PDFs)
- **Geolocalizacion:** Core — geo-fence validation con accuracy-aware tolerance, haversine distance, speed calculation
- **IA:** Resumen nocturno ejecutivo con 7 dias de contexto, anomaly detection
- **Estado:** ✅ Completo

#### Supervision de Campo
- **Schema:** ops
- **Modelos:** OpsAsignacionSupervisor, OpsVisitaSupervision, OpsVisitaImagen, OpsSupervisionGuardEvaluation, OpsSupervisionFinding, OpsSupervisionChecklistResult, OpsSupervisionPhoto, OpsInstallationChecklistItem, OpsInstallationPhotoCategory, OpsInstallationHealthScore, OpsEncuestaCliente
- **APIs:** /api/ops/supervision/* (dashboard, asignaciones, visitas, hallazgos, reportes, historial, nearby)
- **Sub-funcionalidades:**
  - Asignacion supervisor-guardia-instalacion
  - Visitas tecnicas con checkin GPS
  - Evaluacion de guardias con score
  - Hallazgos con tipo, severidad, descripcion, fotos
  - Checklists por instalacion con resultados por visita
  - Fotos por categoria
  - Health score por instalacion
  - Encuestas de satisfaccion cliente
  - Busqueda de instalaciones cercanas (nearby)
- **Portales:** ERP Admin, Portal Supervisor
- **Geolocalizacion:** Check-in GPS en visitas, busqueda por radio
- **Estado:** ✅ Completo

#### Alertas de Cobertura
- **Schema:** ops
- **Modelos:** OpsAlertaCobertura, OpsAlertaAceptacion, OpsAlertaNotificacion, OpsAlertaOleadaLog
- **APIs:** /api/ops/alertas-cobertura/*
- **Cron jobs:**
  - `/api/cron/alertas-cobertura/escalar` — cada minuto, escala alertas no cubiertas
  - `/api/cron/alertas-cobertura/expirar` — cada 5min, expira alertas vencidas
  - `/api/cron/alertas-cobertura/confirmar` — cada 5min, confirma aceptaciones
- **Sub-funcionalidades:**
  - Deteccion automatica de puestos sin cobertura
  - Oleadas de WhatsApp a pools de guardias disponibles
  - Tracking de aceptacion/rechazo por guardia
  - Escalamiento automatico a siguiente oleada
  - Log completo de oleadas
- **Integraciones:** Twilio WhatsApp, Resend (email), Web Push
- **Estado:** ✅ Completo

#### Control Nocturno
- **Schema:** ops
- **Modelos:** OpsControlNocturno, OpsControlNocturnoInstalacion, OpsControlNocturnoGuardia, OpsControlNocturnoRonda
- **APIs:** /api/ops/control-nocturno/*
- **Sub-funcionalidades:**
  - Registro de control nocturno con supervisor
  - Verificacion por instalacion, guardia y ronda
  - KPIs de cumplimiento
  - Resumen ejecutivo IA con contexto historico
  - PDF de cierre de turno (Playwright)
- **IA:** gpt-4o-mini genera resumen nocturno
- **Estado:** ✅ Completo

#### Refuerzos y Turnos Extra
- **Schema:** ops
- **Modelos:** OpsTurnoExtra, OpsRefuerzoSolicitud, OpsSerieAsignacion, OpsPagoTeLote, OpsPagoTeItem
- **APIs:** /api/ops/turnos-extra/*, /api/te/*
- **Sub-funcionalidades:**
  - Solicitud de refuerzos por cuenta CRM
  - Asignacion de turnos extra con horas
  - Pagos TE en lotes
  - Aprobaciones y pagos
- **Estado:** ✅ Completo

#### Tickets Internos
- **Schema:** ops
- **Modelos:** OpsTicketType, OpsTicketTypeApprovalStep, OpsTicket, OpsTicketApproval, OpsTicketComment
- **APIs:** /api/ops/tickets/*
- **Sub-funcionalidades:**
  - Tipos de ticket configurables por tenant
  - Workflow de aprobacion multi-paso
  - Comentarios con autor
  - Estados: pendiente, aprobado, rechazado
- **Estado:** ✅ Completo

#### Inventario
- **Schema:** inventory
- **Modelos:** InventoryProduct, InventoryProductSize, InventoryProductVariant, InventoryWarehouse, InventoryStock, InventoryPurchase, InventoryPurchaseLine, InventoryMovement, InventoryMovementLine, InventoryGuardiaAssignment, InventoryAsset, InventoryAssetAssignment, InventoryAssetStatusHistory, InventoryPhoneLine, InventoryPhoneLineAssignment
- **APIs:** /api/ops/inventario/* (productos, bodegas, stock, activos, compras, entregas, lineas)
- **Sub-funcionalidades:**
  - Productos con tallas y variantes
  - Bodegas con supervisor asignado
  - Stock con umbrales minimos
  - Ordenes de compra con lineas
  - Movimientos de inventario
  - Asignacion de inventario a guardias (uniformes, equipamiento)
  - Activos con historial de estado
  - Lineas telefonicas con asignacion
- **Estado:** ✅ Completo

#### Gamificacion
- **Schema:** ops (inferred)
- **Modelos:** GamificacionConfig, GamificacionScoreGuardia, GamificacionEvento, GamificacionBadge, GamificacionGuardiaBadge, GamificacionReconocimiento, GamificacionFondoPremio, GamificacionSugerenciaBono, GamificacionDesafio, GamificacionDesafioParticipacion, GamificacionBeneficio, GamificacionCanje
- **APIs:** /api/gamification/* (15 routes)
- **Sub-funcionalidades:**
  - Scores por guardia
  - Badges con criterios
  - Desafios con participacion y progreso
  - Reconocimientos
  - Fondo de premios
  - Sugerencia de bonos basada en performance
  - Beneficios canjeables
  - Configuracion por tenant
- **Estado:** 🔨 En construccion (schema robusto, UI parcial)

#### Fiscalizacion DT
- **Schema:** dt
- **Modelos:** DtInspectorSession, SystemIncident
- **APIs:** /api/fiscalizacion/* (5 routes)
- **Sub-funcionalidades:**
  - Sesiones temporales de inspector (credenciales con expiracion)
  - Login especial con prefijo `dt_` en auth.ts
  - Datos verificables con hash auditables
  - Reportes DT: asistencia diaria, jornada diaria, domingos/festivos, modificaciones de turnos
- **Estado:** 🔨 En construccion (auth funcional, datos expuestos, UI basica)

#### Control de Acceso
- **Schema:** access_control
- **Modelos:** AccessControlConfig, AccessControlList, AccessControlRecord, AccessControlDeniedAttempt, AccessControlPreregistration, AccessControlKnownVisitor, AccessControlPairingCode, AccessControlDevice
- **APIs:** /api/access-control/* (26 routes)
- **Sub-funcionalidades:**
  - Configuracion por instalacion
  - Whitelist de visitantes
  - Pre-registro digital
  - Historial de accesos denegados
  - OCR de placas patente (IA: gpt-4o-mini + Claude fallback)
  - OCR de documentos MRZ (IA)
  - Pairing de dispositivos con codigo
  - Visitantes conocidos
- **IA:** OCR multi-proveedor para patentes y MRZ
- **Estado:** 🔨 En construccion (logica completa, sin integracion hardware real)

#### Patrullaje / PPC
- **Schema:** ops
- **Modelos:** OpsPatrullajeSesion, OpsPpcSnapshot
- **APIs:** /api/patrol/* (3 routes)
- **Sub-funcionalidades:**
  - Sesiones de patrullaje con GPS tracking
  - Geolocation hooks (browser + Capacitor)
  - PPC snapshots
- **Estado:** 🔨 En construccion

---

### PERSONAL (RRHH)

#### Gestion de Personas / Onboarding
- **Schema:** ops
- **Modelos:** OpsPersona, OpsOnboardingStatus, OpsDocumentoPersona
- **APIs:** /api/personas/* (26 routes)
- **Sub-funcionalidades:**
  - Datos completos: personales, previsionales, tallas, direccion (Google Places)
  - Onboarding con pasos y reminders automaticos (cron cada 6h)
  - Documentos con tipos y vencimientos
  - Alertas de documentos por vencer (cron 6 AM)
- **Cron:** `/api/cron/onboarding-reminder` (cada 6h), `/api/cron/guardia-doc-notifications` (6 AM)
- **Estado:** ✅ Completo

#### Comunicaciones con Personal
- **APIs:** /api/personas/comunicaciones/*
- **Sub-funcionalidades:**
  - Templates de comunicacion
  - Envio masivo o individual
- **Estado:** ✅ Completo

#### Eventos Laborales
- **Modelos:** OpsEventoRrhh, OpsGuardEvent
- **Sub-funcionalidades:**
  - Eventos: contratacion, termino, amonestacion, etc.
  - Generacion IA de previews de amonestaciones
- **IA:** gpt-4o-mini para redaccion de documentos
- **Estado:** ✅ Completo

---

### FINANZAS

#### Payroll / Remuneraciones
- **Schema:** payroll
- **Modelos:** PayrollPeriod, PayrollLiquidacion, PayrollSalaryStructure, PayrollSalaryStructureBono, PayrollSalaryComponent, PayrollBonoCatalog, PayrollParameterVersion, PayrollAssumption, PayrollSimulation, PayrollAttendanceImport, PayrollAttendanceRecord, PayrollAttendancePeriod, PayrollHoliday
- **APIs:** /api/payroll/* (22 routes)
- **Sub-funcionalidades:**
  - Periodos de pago con estados (abierto, cerrado)
  - Liquidaciones individuales con gross/net
  - Estructuras salariales con bonos
  - Simulador de remuneraciones
  - Importacion de asistencia
  - Calendario de feriados
  - Parametros y supuestos configurables
  - Exportacion Excel (ExcelJS)
- **Estado:** ✅ Completo

#### Anticipos
- **Modelos:** PayrollAnticipoProcess, PayrollAnticipoItem
- **Sub-funcionalidades:**
  - Procesos de anticipo en lote
  - Items individuales por guardia
  - Vinculo con periodo de pago
- **Estado:** ✅ Completo

#### Rendiciones de Gastos
- **Schema:** finance
- **Modelos:** FinanceRendicion, FinanceRendicionItem, FinanceRendicionConfig, FinanceRendicionHistory, FinanceApproval, FinanceTrip, FinanceAttachment
- **APIs:** /api/finance/rendiciones/*
- **Sub-funcionalidades:**
  - Configuracion de tipos de rendicion
  - Submission con items y montos
  - Workflow de aprobacion multi-nivel
  - Historial de estados
  - Trips con ruta en mapa (TripRouteMap con Leaflet)
  - Attachments (R2)
- **Cron:** `/api/cron/finance-alerts` (8 AM)
- **Estado:** ✅ Completo

#### Facturacion Electronica DTE
- **Schema:** finance
- **Modelos:** FinanceDte, FinanceDteLine, FinancePendingBillableItem
- **APIs:** /api/finance/facturacion/*
- **Sub-funcionalidades:**
  - Emision de facturas
  - Notas de credito y debito
  - Lineas con cuenta contable
  - Status SII (pending, submitted, rejected, accepted)
  - Items facturables pendientes
- **Estado:** ✅ Completo

#### Contabilidad
- **Schema:** finance
- **Modelos:** FinanceAccountPlan, FinanceAccountingPeriod, FinanceJournalEntry, FinanceJournalLine
- **Sub-funcionalidades:**
  - Plan de cuentas jerarquico (auto-referenciante)
  - Periodos contables con estados
  - Asientos con partida doble (debe/haber)
  - Tipos de asiento: manual, sistema, importacion
- **Estado:** ✅ Completo

#### Bancos y Conciliacion
- **Schema:** finance
- **Modelos:** FinanceBankAccount, FinanceBankTransaction, FinanceReconciliation, FinanceReconciliationMatch
- **Sub-funcionalidades:**
  - Cuentas bancarias con tipo
  - Transacciones con origen (feed, manual, reconciliacion)
  - Conciliacion por periodo con matching automatico
  - Tipos de match: exacto, parcial, reverso, sin match
- **Estado:** ✅ Completo

#### Pagos a Proveedores
- **Schema:** finance
- **Modelos:** FinancePaymentRecord, FinancePaymentAllocation, FinanceSupplier
- **Sub-funcionalidades:**
  - Proveedores con cuentas contables (pagable + gasto)
  - Pagos con metodo (cheque, transferencia, efectivo, tarjeta)
  - Asignacion de pagos a DTEs
- **Estado:** ✅ Completo

#### Factoring
- **Schema:** finance
- **Modelos:** FinanceFactoringOperation
- **Sub-funcionalidades:**
  - Operaciones de factoring sobre DTEs
  - Monto, tasa de descuento, fecha
  - Estados: pending, approved, funded, repaid
- **Estado:** ✅ Completo

---

### CRM & COMERCIAL

#### CRM
- **Schema:** crm
- **Modelos:** CrmLead, CrmAccount, CrmContact, CrmDeal, CrmDealContact, CrmDealStageHistory, CrmPipelineStage, CrmTask, CrmNote, CrmHistoryLog, CrmCustomField, CrmCustomFieldValue, CrmFollowUpConfig, CrmFollowUpLog, CrmEmailAccount, CrmEmailThread, CrmEmailMessage, CrmEmailTemplate, CrmEmailSignature, CrmWhatsAppTemplate, CrmFile, CrmFileLink, DocumentFolder
- **APIs:** /api/crm/* (75 routes)
- **Sub-funcionalidades:**
  - Leads con source tracking y AI enrichment
  - Accounts con RUT, representantes legales, personeria
  - Contacts con roles
  - Deals con pipeline configurable y stage history
  - Tasks por deal
  - Follow-up automatico configurable (cron cada 15min)
  - Email threads y mensajes
  - Campos customizados por entidad
  - Archivos en carpetas jerarquicas
  - Firmas de email por usuario
  - Templates WhatsApp
  - Inbound email auto-lead creation (webhook Resend)
- **Integraciones:** Gmail OAuth, Resend, OpenAI (enrichment), Svix (webhooks)
- **IA:** Lead enrichment con gpt-4o-mini, inbound email extraction
- **Cron:** `/api/cron/followup-emails` (cada 15min)
- **Estado:** ✅ Completo

#### Instalaciones
- **Schema:** crm
- **Modelos:** CrmInstallation
- **APIs:** /api/installations/* (19 routes)
- **Sub-funcionalidades:**
  - Coordenadas GPS (lat, lng)
  - Geo-fence radius configurable
  - Codigo de marcacion unico (QR)
  - Pairing code
  - Monto TE
  - Control nocturno enabled
  - Chat enabled
  - Vinculo con checkpoints, puestos, supervision, inventario
- **Estado:** ✅ Completo

#### CPQ / Cotizaciones
- **Schema:** cpq
- **Modelos:** CpqQuote, CpqPosition, CpqCargo, CpqRol, CpqCatalogItem, CpqQuoteParameters, CpqQuoteUniformItem, CpqQuoteExamItem, CpqQuoteCostItem, CpqQuoteMeal, CpqQuoteVehicle, CpqQuoteInfrastructure, CpqQuoteAdditionalLine, CpqQuoteAttachment, CpqProposalTemplate, CpqIncludesSuggestion, CpqQuoteIncludesItem, CpqCostCategory, CpqPuestoTrabajo
- **APIs:** /api/cpq/* (38 routes)
- **Sub-funcionalidades:**
  - Cotizaciones con posiciones multi-linea
  - Items: uniformes, examenes, costos, alimentacion, vehiculos, infraestructura
  - Catalogo de items con precios base
  - Templates de propuesta
  - Generacion PDF con React-PDF y Playwright
  - Envio por email con tracking de apertura
  - Presentaciones interactivas con unique URL
- **Integraciones:** Resend, Playwright/Chromium, React-PDF
- **Estado:** ✅ Completo

---

### DOCUMENTOS Y COMUNICACIONES

#### Gestion de Documentos
- **Schema:** docs
- **Modelos:** DocCategory, DocTemplate, DocTemplateVersion, Document, DocSignatureRequest, DocSignatureRecipient, DocAssociation, DocHistory, ContractSuggestion
- **APIs:** /api/docs/* (25 routes)
- **Sub-funcionalidades:**
  - Categorias y templates versionados
  - Documentos con firma electronica
  - Solicitudes de firma con multiples recipientes
  - Asociacion de documentos a cualquier entidad
  - Historial de cambios
  - Sugerencias de clausulas por IA
  - Reminders automaticos de firma (cron diario)
- **Cron:** `/api/cron/signature-reminders` (diario), `/api/cron/document-alerts` (8 AM)
- **Estado:** ✅ Completo

#### Chat Interno
- **Schema:** chat
- **Modelos:** ChatChannel, ChatMessage, ChatMessageReaction, ChatReadCursor, ChatMention, ChatNotificationPreference, ChatPushSubscription, ChatDmParticipant, ChatChannelParticipant, ChatChannelArchive
- **APIs:** /api/chat/* (22 routes)
- **Sub-funcionalidades:**
  - Canales: publico, privado, DM, broadcast
  - Mensajes con metadata (tipo, adjuntos)
  - Reacciones emoji
  - Menciones (@user, @all, @role)
  - Cursor de lectura por usuario por canal
  - Preferencias de notificacion por canal (muted, mentions-only, enabled)
  - Push subscriptions (VAPID)
  - Participantes con roles (owner, moderator, member)
  - Archivado de canales
- **Integraciones:** Pusher (real-time), Web Push (VAPID)
- **Estado:** ✅ Completo

#### Notas Unificadas
- **Schema:** notes
- **Modelos:** Note, NoteMention, NoteReadStatus, NoteReaction, NoteEntityReference, EntityFollower, AiContextSummary
- **APIs:** /api/notes/* (14 routes)
- **Sub-funcionalidades:**
  - Notas en 20+ tipos de entidad (lead, account, deal, guard, ticket, etc.)
  - Threads (respuestas a notas)
  - Menciones (@user, @all, @role)
  - Reacciones emoji
  - Estado de lectura por usuario
  - Visibilidad: publica, privada, grupo
  - Tipos: general, alerta, decision, tarea
  - Followers por entidad
  - Resumenes de contexto IA
- **Estado:** ✅ Completo

---

### PORTALES

| Portal | Ruta | Dirigido a | Funcionalidades |
|---|---|---|---|
| **ERP Admin** | /opai/*, /hub, /ops, /crm, /finanzas, /payroll, /personas | Admins, owners, editores | Toda la funcionalidad del ERP |
| **Portal Cliente** | /portal/cliente | Clientes finales | Guardias activos, rondas, incidentes, documentos, comunicacion |
| **Portal Guardia** | /portal/guardia | Guardias de seguridad | Marcaciones, documentos, liquidaciones, chat |
| **Portal Supervisor** | /portal/supervisor | Supervisores de campo | Visitas, evaluaciones, equipo, novedades |
| **Portal Marcacion** | /portal/marcacion | Instalaciones (kiosko) | Clock in/out con PIN o QR |
| **Portal Rondas** | /portal/rondas | Guardias ejecutando rondas | Mapa con checkpoints, ejecucion de ronda |
| **Portal Acceso** | /portal/acceso | Control de acceso fisico | Registro de accesos, dispositivos |

**Auth por portal:**
- ERP Admin y Supervisor: NextAuth (email + password)
- Cliente: PIN
- Guardia: PIN
- Marcacion: Device token
- Rondas: Session del guardia
- Acceso: Device token

---

## Integraciones Externas

| Servicio | Uso en OPAI | Archivos principales | Estado |
|---|---|---|---|
| **OpenAI** | Help Chat RAG, Control Nocturno IA, OCR, CRM enrichment, amonestaciones, cost inference | src/lib/ai/, src/lib/openai.ts, src/lib/ai-service.ts | ✅ Activo |
| **Anthropic (Claude)** | Fallback para OCR (patentes, MRZ) | src/lib/ai-service.ts | ✅ Activo |
| **Google AI (Gemini)** | Proveedor alternativo IA | src/lib/ai-service.ts | ✅ Configurado |
| **Pusher** | Chat real-time, typing indicators, presencia | src/lib/chat.ts | ✅ Activo |
| **Resend** | Emails transaccionales, seguimiento, inbound leads | src/lib/resend.ts | ✅ Activo |
| **Twilio** | WhatsApp alertas de cobertura | src/lib/alertas-cobertura/whatsapp.service.ts | ✅ Activo |
| **AWS Rekognition** | Face ID guardias (registro + verificacion) | src/lib/services/rekognition.ts | ✅ Activo |
| **Cloudflare R2** | Almacenamiento de archivos (docs, fotos, attachments) | src/lib/storage.ts | ✅ Activo |
| **Web Push (VAPID)** | Push notifications browser + mobile | src/lib/pwa/push-service.ts | ✅ Activo |
| **Gmail OAuth** | Integracion email tenant-configurable | src/lib/gmail.ts | ✅ Activo |
| **Sentry** | Monitoring, error tracking, replay | sentry.server.config.ts | ✅ Activo |
| **Svix** | Verificacion de webhooks (Resend) | api/webhook/resend/route.ts | ✅ Activo |
| **Playwright + Chromium** | Generacion PDF (reportes, cotizaciones, turnos) | src/lib/control-nocturno-pdf.ts, src/lib/rondas/ | ✅ Activo |
| **React-PDF** | Rendering PDF (propuestas, cotizaciones) | src/lib/pdf/templates/ | ✅ Activo |
| **ExcelJS** | Exportacion Excel (payroll, attendance, finance) | Varios | ✅ Activo |
| **Capacitor** | App nativa iOS/Android (GPS, camera, biometrics, push) | src/lib/capacitor/ | ✅ Activo |
| **Leaflet** | Mapas (rondas, supervision, checkpoints, heatmap) | src/components/portal/rondas/, src/components/ops/rondas/ | ✅ Activo |
| **pgvector** | Embeddings para RAG del Help Chat | Via Prisma, AiDocChunk model | ✅ Activo |
| **CMF API** | Valor UF del dia | src/lib/uf.ts | ✅ Activo |
| **Sharp** | Procesamiento de imagenes (WebP→PNG para PDFs) | next.config.js | ✅ Activo |

---

## Cron Jobs y Automatizaciones

| Job | Schedule | Que hace | Modulo |
|---|---|---|---|
| FX Sync | 12:00, 18:00 | Sincroniza UF/UTM desde CMF | fx |
| Follow-up Emails | cada 15min | Envia follow-ups CRM programados | crm |
| Document Alerts | 8 AM | Alerta documentos por vencer | docs |
| Marcacion Emails | cada 5min | Envia emails diferidos de marcacion | ops |
| Generar Rondas | cada 10min | Genera ejecuciones de rondas programadas | ops/rondas |
| Finance Alerts | 8 AM | Alertas de rendiciones pendientes | finance |
| SLA Monitor | cada 15min | Detecta breaches de SLA y notifica | ops |
| Guard Doc Notifications | 6 AM | Notifica documentos de guardia por vencer | personas |
| Cerrar Rondas Libres | cada 15min | Cierra turnos libres/sin asignar | ops/rondas |
| Cerrar Rondas Atrasadas | cada 15min | Cierra turnos atrasados | ops/rondas |
| Cerrar Rondas En Curso | cada 15min | Cierra turnos en progreso | ops/rondas |
| Consolidar Marcaciones | cada hora | Consolida datos de asistencia | ops |
| Biometric Cleanup | 3 AM | Destruye datos faciales 90-120d post-termino (Res. N38) | ops |
| Jornada Alerts | cada hora | Alertas de jornada laboral | ops |
| Onboarding Reminder | cada 6h | Reminder 48h onboarding guardias | personas |
| Escalar Alertas Cobertura | cada minuto | Escala alertas de cobertura no cubiertas | ops |
| Expirar Alertas Cobertura | cada 5min | Expira alertas vencidas | ops |
| Confirmar Alertas Cobertura | cada 5min | Confirma aceptaciones de cobertura | ops |

---

## Sistema de IA

### Modelos Usados

| Modelo | Proveedor | Donde se usa |
|---|---|---|
| gpt-4o-mini | OpenAI | Help Chat (default), Control Nocturno, OCR, CRM enrichment, amonestaciones, cost inference |
| gpt-4o | OpenAI | Help Chat (escalado por frustracion o retrieval debil) |
| text-embedding-3-small | OpenAI | Embeddings para RAG del Help Chat |
| claude-sonnet-4 | Anthropic | Fallback OCR (patentes, MRZ) |

### Features con IA Real

1. **Help Chat con RAG** — Indexa docs markdown con embeddings, busqueda dual (keyword + semantica), streaming, herramientas de datos (UF/UTM, metricas guardias, aprobaciones pendientes), frustration detection con 35+ patrones
2. **Control Nocturno** — Analiza compliance de rondas nocturnas, genera resumen ejecutivo con 7 dias de contexto
3. **OCR Patentes** — Extrae numero de placa de foto, multi-proveedor con fallback
4. **OCR MRZ** — Extrae datos de zona MRZ de documentos de identidad
5. **CRM Enrichment** — Enriquece notas de leads automaticamente
6. **Amonestaciones** — Genera preview de documentos disciplinarios
7. **Cost Inference** — Estima costos de proyectos desde datos de leads
8. **Document Processing** — Analiza PDFs con IA (base64 → prompt)

### Decision: Texto vs Accion

**Toda la IA genera texto/sugerencias — ninguna toma decisiones financieras o operacionales automaticas.** El humano siempre valida.

---

## Capacidades de Geolocalizacion

### Donde se usa GPS

| Modulo | Uso | Almacenamiento |
|---|---|---|
| Marcaciones | Check-in/out con lat/lng/accuracy | OpsMarcacion |
| Rondas | Checkpoint completion con geo-fence validation | OpsRondaTracking |
| Supervision | Check-in de visita en instalacion | OpsVisitaSupervision |
| Instalaciones | Coordenadas del sitio + radio geo-fence | CrmInstallation |
| Patrullaje | Tracking continuo de sesion | OpsPatrullajeSesion |

### Geo-fence Validation

- **Simple:** `isWithinGeoRadius(lat, lng, targetLat, targetLng, radiusM)` — distancia haversine vs radio
- **Accuracy-aware:** `validateGeofenceWithAccuracy()` — ajusta tolerancia segun precision del GPS:
  - GPS accuracy < radio → tolerancia 50%, confianza "high"
  - GPS accuracy >= radio → tolerancia 100%, confianza "low"
  - Sin accuracy → check estandar, confianza "unknown"
- **Speed check:** Velocidad entre checkpoints con threshold de 150m distancia y 30m accuracy minima

### Mapas (Leaflet + OpenStreetMap)

7 componentes de mapa:
- RondaMap (ejecucion de ronda con trail GPS)
- CheckpointMapCreator (creacion de checkpoints)
- MonitoreoMap (monitoreo en tiempo real)
- RondasReportesHeatmap (densidad de ejecucion)
- RondaAuditMapModal (audit trail)
- TripRouteMap (rutas de viaje finance)
- AlertGeofenceMap (visualizacion de geo-fence)

---

## Sistema de Permisos y Roles

### Roles Activos (7)

| Rol | Rank | Apps | Descripcion |
|---|---|---|---|
| owner | 4 | Todas | Dueno del tenant, acceso total |
| admin | 3 | Todas | Administrador con acceso completo |
| editor | 2 | hub, docs, crm, cpq, ops, finance, payroll | Editor multi-modulo |
| jefe_operaciones | 2 | hub, ops, crm, finance | Jefe de operaciones |
| central_monitoreo | 1 | hub, ops | Central de monitoreo |
| supervisor | 1 | hub, ops, crm, finance | Supervisor de campo |
| viewer | 0 | hub, ops, crm, docs | Solo lectura |

### Roles Legacy (8)
rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll

### Niveles de Permiso
- `none` (0) — Sin acceso
- `view` (1) — Solo lectura
- `edit` (2) — Crear/actualizar
- `full` (3) — Eliminar + todo

### Modulos y Submodulos

10 modulos con 56 submodulos:
- **ops** (16): puestos, pauta_mensual, pauta_diaria, turnos_extra, marcaciones, ppc, guardias, rondas, control_nocturno, tickets, supervision, inventario, eventos_laborales, gamificacion, installations, alertas_cobertura
- **crm** (8): leads, accounts, installations, dotacion, contacts, deals, quotes, prospecting
- **finance** (8): rendiciones, aprobaciones, pagos, reportes, configuracion, contabilidad, facturacion, proveedores
- **config** (13): usuarios, grupos, integraciones, firmas, categorias, crm, cpq, payroll, notificaciones, ops, tipos_ticket, finanzas, alertas_cobertura
- **fiscalizacion** (7): marcaciones, asistencia, guardias, instalaciones, payroll, auditlog, incidentes
- **docs** (2), **payroll** (2), **hub** (0), **cpq** (0), **reportes_dt** (0)

### 37 Capabilities
Permisos especificos como: guardias_manage, rondas_configure, rondas_monitor, rondas_resolve_alerts, rendicion_approve, ticket_approve, supervision_checkin, alerta_cobertura_crear, etc.

### RoleTemplates (Roles Custom)
- Cada tenant puede crear roles personalizados con permisos granulares
- Se almacenan como JSON en RoleTemplate.permissions
- Cache en memoria con TTL de 5 minutos
- El owner siempre retiene acceso total

---

## Capacidades Mobile (Capacitor)

| Feature | Plugin | Uso |
|---|---|---|
| GPS | @capacitor/geolocation | Marcaciones, rondas, supervision |
| Camera | @capacitor/camera | Evidencia fotografica, Face ID, incidentes |
| Biometrics | capacitor-native-biometric | Fingerprint/Face auth para guardias |
| Push Notifications | @capacitor/push-notifications | Alertas real-time |
| Platform Detection | @capacitor/core | Feature gating iOS/Android/Web |

### Service Worker (PWA)
- Pre-cache: todos los portales + login
- API: Network-first con cache fallback
- Static: Cache-first
- Navigation: Network-first con offline fallback
- Push: Agrupadas por tag (anti-spam)

---

## Modulos por Madurez

### ✅ Completos (25+)
- Gestion de Guardias
- Puestos Operativos
- Pautas Mensuales
- Marcaciones GPS
- Rondas GPS
- Supervision de Campo
- Alertas de Cobertura
- Control Nocturno
- Refuerzos y Turnos Extra
- Tickets Internos
- Inventario
- Gestion de Personas / Onboarding
- Comunicaciones
- Eventos Laborales
- Payroll / Remuneraciones
- Anticipos
- Rendiciones de Gastos
- Facturacion DTE
- Contabilidad
- Bancos y Conciliacion
- Pagos a Proveedores
- Factoring
- CRM completo
- CPQ / Cotizaciones
- Documentos con Firma
- Chat Interno
- Notas Unificadas

### 🔨 En Construccion (5)
- Gamificacion (schema robusto, UI parcial)
- Control de Acceso (logica completa, sin hardware)
- Fiscalizacion DT (auth funcional, UI basica)
- Patrullaje/PPC (geolocation hooks, UI minimal)
- Panel Superadmin / Plataforma (sin implementar)

### 📋 Planificado (4)
- Billing SaaS (MercadoPago/Stripe) — campo en schema, sin integracion
- Subdominio por tenant — resolver implementado, sin middleware
- App white-label — mencionada comercialmente, sin implementacion
- Prediccion de ausentismo IA — mencionada, sin modelo predictivo

---

## Diferenciadores Competitivos Confirmados por Codigo

1. **Face ID con AWS Rekognition** para marcaciones biometricas (threshold 95%, quality checks)
2. **Anomaly detection en rondas** con trust score 0-100 (velocidad, geo-fence, tiempo)
3. **Geo-fence accuracy-aware** — ajusta tolerancia segun precision real del GPS
4. **IA operacional multi-proveedor** (OpenAI/Anthropic/Google) con frustration detection automatico
5. **RAG con pgvector** para Help Chat con busqueda semantica
6. **Alertas de cobertura con oleadas WhatsApp** automaticas y tracking de aceptacion
7. **6 portales especializados** con auth independiente por rol
8. **Compliance biometrica automatica** — destruccion de datos faciales post-termino (Resolucion N38)
9. **259 modelos Prisma en 13 schemas** — profundidad de dominio excepcional para seguridad privada
10. **18 cron jobs** que automatizan: rondas, alertas, documentos, marcaciones, biometria, follow-ups, SLA
11. **Sistema de notas unificado** cross-entity con 20+ tipos de contexto
12. **PWA con service worker** y soporte offline para portales

---

*Auditoria generada por Claude Opus 4.6. Archivos analizados: ~900+. 5 agentes de exploracion paralelos.*
*Agentes: rutas (172 pages), API routes (801 routes), schema (259 modelos), integraciones (14 servicios), AI/geo/permisos/mobile.*
