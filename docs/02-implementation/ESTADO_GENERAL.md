# Estado General del Proyecto — OPAI Suite

> **Fecha:** 2026-02-18  
> **Estado:** Vigente — se actualiza con cada implementación  
> **Referencia:** `docs/00-product/MASTER_SPEC_OPI.md`

---

## Resumen Ejecutivo

OPAI Suite es una plataforma SaaS para empresas de seguridad que opera en `opai.gard.cl`. Actualmente tiene **14 módulos en producción** y **3 fases futuras** planificadas.

| Dato | Valor |
|------|-------|
| Páginas implementadas | 103 |
| Endpoints API | 318 |
| Modelos de datos (Prisma) | 143 |
| Componentes UI | ~268 |
| Schemas PostgreSQL | 8 (public, crm, cpq, docs, payroll, fx, ops, finance) |
| Roles RBAC | 13 |
| Cron Jobs | 8 |
| Stack | Next.js 15, TypeScript, Prisma, Neon PostgreSQL, Auth.js v5 |
| Deploy | Vercel |

---

## Estado por Módulo

### Hub Ejecutivo

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Ruta** | `/hub` |
| **Descripción** | Dashboard ejecutivo con KPIs de presentaciones, work queue, activity feed, app launcher |
| **Acceso** | owner, admin, editor, viewer |

**Funcionalidades:**
- KPIs: total presentaciones, enviadas, vistas, sin leer
- Quick actions: nueva propuesta, invitar usuario
- Apps launcher: acceso a todos los módulos
- Work queue: propuestas pendientes
- Activity feed: visualizaciones recientes
- CRM Global Search integrado

---

### CRM (Customer Relationship Management)

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Ruta** | `/crm/*` |
| **Modelos** | 27 (schema `crm`) |
| **Acceso** | owner, admin, editor |

**Funcionalidades implementadas:**
- **Leads:** Creación pública/interna, aprobación, conversión a Account+Contact+Deal
- **Accounts:** CRUD completo, RUT, razón social, representante legal, industria, segmento
- **Contacts:** CRUD, vinculación a accounts, roles (primary, participant, decision_maker)
- **Deals:** Pipeline con stages configurables, historial de cambios, probabilidad, cotizaciones vinculadas
- **Installations:** CRUD, geolocalización (lat/lng), vinculación a accounts/leads, metadata, geofence para marcación
- **Pipeline:** Stages configurables por tenant, marcadores closed-won/closed-lost
- **Email:** Cuentas Gmail OAuth, threads, mensajes, envío, tracking (Resend webhooks)
- **Follow-ups:** Configuración automática por tenant, 2 secuencias, templates personalizables
- **WhatsApp:** Templates editables por tenant con tokens dinámicos
- **Custom Fields:** Campos personalizados configurables por entidad
- **Files:** Upload y vinculación de archivos a entidades
- **Search:** Búsqueda global unificada
- **Industries:** Catálogo de industrias configurable
- **Notes:** Sistema de notas CRM

**Pendiente:**
- Reportes CRM (marcado como disabled en UI)

---

### CPQ (Configure, Price, Quote)

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Ruta** | `/cpq/*`, `/crm/cotizaciones/*` |
| **Modelos** | 11 (schema `cpq`) |
| **Acceso** | owner, admin, editor |

**Funcionalidades implementadas:**
- **Cotizaciones:** CRUD, código único (CPQ-YYYY-XXX), estados (draft/sent/approved/rejected)
- **Posiciones:** Creación, edición, clonado, cálculo de costo empleador integrado con Payroll
- **Catálogo:** Items configurables (uniformes, exámenes, costos operacionales)
- **Parámetros:** Margen, meses de contrato, horas estándar, cambios de uniforme
- **Comidas:** Configuración por tipo y días de servicio
- **Vehículos:** Renta, combustible, mantención
- **Infraestructura:** Items con combustible (generadores, etc.)
- **AI:** Descripción automática de cotización con OpenAI
- **Export PDF:** Generación de PDF de cotización
- **Envío:** Email de cotización y presentación comercial
- **Clonado:** Clonar cotización completa con posiciones
- **Vinculación CRM:** FK a account, contact, deal, installation

---

### Presentaciones Comerciales

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Ruta** | `/opai/inicio`, `/p/[uniqueId]` |
| **Acceso** | owner, admin, editor (viewer solo lectura); `/p/*` público |

**Funcionalidades implementadas:**
- **Templates:** 29 secciones de presentación comercial de seguridad B2B
- **Generación:** Desde datos de Zoho CRM (webhook) o manual
- **Tracking:** Vistas (IP, device, browser, ubicación), emails (opens, clicks, delivered, bounced)
- **Envío:** Email con template React Email + Resend, CC múltiple
- **Compartir:** WhatsApp directo al contacto, link público copiable
- **Dashboard:** Lista filtrable por vistas, estado email, fecha
- **Preview mode:** Vistas de admin no se contabilizan
- **PDF:** Generación con Playwright + Chromium

---

### Documentos Legales

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Ruta** | `/opai/documentos/*` |
| **Modelos** | 6 (schema `docs`) |
| **Acceso** | owner, admin, editor (viewer solo lectura) |

**Funcionalidades implementadas:**
- **Templates:** Editor Tiptap con tokens dinámicos por módulo
- **Tokens:** Sistema de tokens resolvibles (account.name, contact.firstName, etc.)
- **Versionado:** Historial de versiones de templates con change notes
- **Documentos:** Generación desde template, resolución de tokens, estados (draft→approved→active→expired)
- **Categorías:** Organización por módulo (CRM, payroll, legal, mail)
- **Asociaciones:** Vinculación a entidades CRM (accounts, deals, installations, contacts)
- **Fechas:** Effective date, expiration date, renewal date, alertas automáticas
- **Firma digital:** Flujo de firma con token seguro, captura de firma, almacenamiento
- **PDF:** Generación de PDF del documento
- **Historial:** Auditoría de cambios por documento

---

### Payroll (Liquidaciones Chile)

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ⚠️ Parcial (60%) — Fase 1 del módulo completada |
| **Ruta** | `/payroll/*` |
| **Modelos** | 4 (schema `payroll`) |
| **Acceso** | owner, admin, editor |

**Implementado:**
- **Simulador:** Cálculo completo de liquidación con desglose
- **Engine:** `computeEmployerCost`, `simulatePayslip`, `taxCalculator`
- **Parámetros:** Versionado de parámetros legales con effective dates
- **AFP:** 10 AFPs con tasas actualizadas + comisión
- **SIS:** 1.54%
- **Salud:** Fonasa 7% / Isapre con plan variable
- **AFC:** CIC (3% empleador) + FCS (0.2% / 2.4%)
- **Topes 2026:** 89.9 UF / 135.1 UF
- **Impuesto Único:** 8 tramos
- **Mutual:** Tasa básica 0.95% default

**Pendiente:**
- Asignación Familiar (no implementada)
- Horas Extra (estructura sin validaciones)
- Días trabajados / ausencias
- Descuentos voluntarios (APV, etc.)
- Pensión alimenticia
- Mutual completo (solo tasa default)

---

### FX (Indicadores Financieros)

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Modelos** | 2 (schema `fx`) |

**Funcionalidades:**
- UF diaria (fuente SBIF)
- UTM mensual (fuente SII)
- Sync automático (cron 2x/día)
- Sync manual con autorización válida
- Indicadores globales en UI

---

### Ops (Operaciones)

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo (MVP v1 + v2 refactorizado + extensiones) |
| **Ruta** | `/ops/*` |
| **Modelos** | 38 (schema `ops`) |
| **Acceso** | owner, admin, operaciones |

**Funcionalidades implementadas:**

**Puestos operativos:**
- Navegación jerárquica: Cliente → Instalación → Puestos
- CRUD de puestos con slots múltiples
- Asignación de guardias a puestos/slots con historial
- Vinculación a catálogos CPQ (puesto de trabajo, cargo, rol)
- Badge Día/Noche por puesto

**Pauta mensual:**
- Vista de matriz tipo spreadsheet (filas = puesto/slot/guardia, columnas = días)
- Sistema de pintado de series (4x4, 5x2, 7x7, etc.)
- Colores diferenciados por estado (T, -, V, L, P)
- Días bloqueados (procesados en asistencia) no editables
- Pre-llenado de guardias desde asignaciones

**Asistencia diaria:**
- Vista multi-instalación con selector Cliente/Instalación
- Dashboard de resumen: Total puestos, Cubiertos, PPC, TE, % Cobertura
- Soporte para reemplazo y generación automática de TE
- Integración con marcación digital (checkInAt/checkOutAt)

**Turnos Extra:**
- Generados automáticamente desde asistencia (reemplazos)
- Filtros y acciones de aprobar/rechazar
- Lotes de pago semanales
- Exportación CSV formato Santander
- Marcado como pagado

**PPC (Puestos por Cubrir):**
- Derivado automático de pauta y asistencia
- Vista con filtro día/mes y agrupación por instalación

**Marcación digital (completado):**
- Página pública `/marcar/[code]` mobile-first
- RUT + PIN (bcrypt) + geolocalización obligatoria
- Validación de radio de instalación (geoRadiusM)
- Hash SHA-256 de integridad por marcación
- Captura de foto de evidencia (cámara frontal)
- Integración automática con OpsAsistenciaDiaria
- Comprobante por email automático
- QR por instalación con gestión de código
- Gestión de PIN desde panel admin
- Página `/ops/marcaciones` con tabla detallada y filtros
- Cumplimiento Resolución Exenta N°38 DT Chile

**Rondas (control de rondas):**
- Dashboard de estado general y cumplimiento
- Monitoreo en ejecución en tiempo real
- Alertas de desvíos e incumplimientos
- Checkpoints por instalación con QR
- Plantillas con secuencia de checkpoints
- Programación de frecuencia, días y horarios
- Reportes de cumplimiento histórico
- Generación automática (cron cada 10 min)
- Ejecución pública por QR: `/ronda/[code]`

**Control nocturno:**
- Reporte operativo nocturno por instalación

**Tickets + SLA:**
- Tipos de ticket configurables (slug, nombre, origen, prioridad, SLA, equipo)
- Creación desde panel admin o portal de guardia
- Workflow de aprobación multi-paso (por grupo o usuario)
- SLA automático (horas según tipo de ticket)
- Monitor SLA cada 15 min (cron) con notificaciones de breach y approaching
- Estados: pendiente aprobación → abierto → en progreso → resuelto → cerrado
- Código formato `TK-YYYYMM-####`
- Detalle de ticket con timeline y comentarios

---

### Personas (Guardias y RRHH)

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo (MVP v1) |
| **Ruta** | `/personas/*` |
| **Acceso** | owner, admin, rrhh, reclutamiento |

**Funcionalidades:**
- **Guardias:** CRUD completo, ficha 360 con datos personales, laborales, contacto
- **Estados:** postulante → seleccionado → contratado_activo → inactivo → desvinculado
- **Documentos:** Upload y gestión de documentos por guardia (OS10, contratos, certificados)
- **Cuenta bancaria:** Datos bancarios del guardia para pagos
- **Lista negra:** Bloqueo de contratación, TE y portal con auditoría
- **Asignación:** Historial de asignaciones a puestos operativos
- **Comentarios:** Sistema de comentarios internos por guardia
- **Historial:** Auditoría de cambios de estado
- **PIN de marcación:** Gestión de PIN para marcación digital
- **Alertas de documentos:** Documentos por vencer y vencidos (cron diario)

---

### Finanzas (Rendiciones y Gastos)

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo (Rendiciones) / 📋 Planificado (ERP contable) |
| **Ruta** | `/finanzas/*` |
| **Modelos** | 45 (schema `finance`) |
| **Acceso** | owner, admin, finanzas |

**Implementado (Rendiciones):**
- Rendiciones de gastos (compras y kilometraje)
- Centros de costo
- Aprobación multi-nivel
- Exportación bancaria Santander (formato ABM)
- Alertas de finanzas (cron diario)
- Reportes y pagos

**Planificado (ERP Financiero-Contable):**
- Plan de cuentas contable chileno (80+ cuentas base)
- Libro diario/mayor (partida doble)
- Períodos contables con apertura/cierre
- Emisión de DTE (facturas electrónicas SII)
- Notas de crédito/débito
- Proveedores y cuentas por pagar
- Tesorería (cuentas bancarias, conciliación)
- Factoring
- Integración con proveedor DTE (Facto u otro)
- Ver `docs/plans/2026-02-15-erp-financiero-contable-design.md`

---

### Sistema de Notificaciones

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Ruta** | `/opai/perfil/notificaciones` (preferencias) |
| **Canales** | Bell (in-app) + Email (Resend) |

**Funcionalidades:**
- Servicio unificado de notificaciones (`notification-service.ts`)
- 23 tipos de notificación en 4 módulos (CRM, CPQ, Documentos, Operaciones)
- Preferencias por usuario: activar/desactivar bell y email por tipo
- Filtrado por acceso a módulos (RBAC)
- Template de email con branding OPAI (dark theme)
- Campana de notificaciones en topbar con badge
- Tipos de operaciones: `ticket_created`, `ticket_sla_breached`, `ticket_sla_approaching`, `ticket_approved`, `ticket_rejected`, `new_lead`, `email_opened`, `contract_expiring`, etc.

---

### Configuración

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Ruta** | `/opai/configuracion/*` |
| **Acceso** | owner, admin |

**Funcionalidades:**
- **Usuarios:** CRUD, invitación por email, activación, roles, desactivación
- **Roles:** 13 roles con permisos granulares por módulo
- **Integraciones:** Gmail OAuth (connect, sync, send)
- **Firmas de email:** Editor Tiptap para pie de correo, default por usuario
- **Categorías:** Gestión de categorías de documentos por módulo
- **CRM Config:** Follow-up config, WhatsApp templates
- **CPQ Config:** Catálogo, roles, puestos de trabajo, cargos
- **Payroll Config:** Parámetros legales
- **Ops Config:** Configuración operacional
- **Asistente IA:** Configuración del asistente
- **Auditoría:** Logs de auditoría
- **Notificaciones:** Configuración de preferencias

---

### Auth y RBAC

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Páginas** | 4 (login, forgot, reset, activate) |

**Funcionalidades:**
- Auth.js v5 con Credentials (bcrypt)
- Sesión JWT con id, email, name, role, tenantId
- 13 roles con permisos granulares
- Control de acceso a módulos por rol (app-access)
- Control de acceso a submodules (module-access)
- Invitación por email con token seguro
- Activación de cuenta
- Reset de contraseña
- Auditoría de acciones
- Portal de guardia con autenticación separada

---

## Qué falta por terminar (de lo que ya tenemos)

| Área | Qué falta | Prioridad sugerida |
|------|-----------|:------------------:|
| **Payroll** | Asignación Familiar, Horas Extra con validaciones, días trabajados/ausencias, descuentos voluntarios, APV, pensión alimenticia, mutual completo | Alta para liquidaciones reales |
| **CRM — Reportes** | Módulo de reportes (conversión pipeline, métricas por etapa, etc.) | Media |
| **ERP Financiero-Contable** | Plan de cuentas, libro diario/mayor, facturación DTE, proveedores, tesorería, conciliación, factoring. Diseño completo listo en `docs/plans/` | Alta |
| **Marcación — Certificación DT** | Portal de fiscalización DT, alertas de jornada excedida, comprobante semanal, FEA en reportes, procedimiento de corrección | Media (para certificación) |
| **Testing** | Tests automatizados (unit + e2e). No hay cobertura actual | Media |

---

## Tecnologías y Dependencias Principales

| Categoría | Tecnología | Versión |
|-----------|-----------|---------|
| Framework | Next.js | 15.x |
| Lenguaje | TypeScript | 5.6 |
| ORM | Prisma | 6.x |
| Base de datos | PostgreSQL (Neon) | — |
| Auth | Auth.js (NextAuth) | 5.0 beta |
| UI | Tailwind CSS + Radix UI + shadcn/ui | 3.4 |
| Animaciones | Framer Motion | 12.x |
| Editor | Tiptap | — |
| Email | Resend + React Email | — |
| AI | OpenAI | — |
| PDF | Playwright + Chromium + @react-pdf/renderer | — |
| Almacenamiento | Cloudflare R2 | — |
| Validación | Zod | — |
| Google | googleapis (Gmail OAuth) | — |
| Deploy | Vercel | — |

---

## Cron Jobs Activos

| Job | Endpoint | Frecuencia | Estado |
|-----|----------|-----------|:------:|
| FX sync (mañana) | `/api/fx/sync` | Diario 12:00 | ✅ Activo |
| FX sync (tarde) | `/api/fx/sync` | Diario 18:00 | ✅ Activo |
| Follow-up emails | `/api/cron/followup-emails` | Cada 2 horas | ✅ Activo |
| Document alerts | `/api/cron/document-alerts` | Diario 8:00 | ✅ Activo |
| Marcación emails | `/api/cron/marcacion-emails` | Cada 5 min | ✅ Activo |
| Rondas generator | `/api/cron/rondas/generar` | Cada 10 min | ✅ Activo |
| Finance alerts | `/api/cron/finance-alerts` | Diario 8:00 | ✅ Activo |
| SLA monitor | `/api/cron/sla-monitor` | Cada 15 min | ✅ Activo |

---

## Qué sigue (recomendación actualizada)

Con los módulos operativos completados (marcación, rondas, tickets/SLA, notificaciones), el siguiente bloque recomendado es:

1. **ERP Financiero-Contable** ← 📋 Diseño completo listo  
   Plan de cuentas, libro diario/mayor, facturación DTE, proveedores, tesorería. Ver `docs/plans/2026-02-15-erp-financiero-contable-design.md`.
2. **Completitud Payroll**  
   Asignación Familiar, Horas Extra, APV, pensión alimenticia para liquidaciones reales.
3. **Portal guardias mejorado**  
   Comunicados, solicitudes RRHH (permisos, vacaciones, licencias).
4. **Inventario**  
   Catálogo, stock, kits de uniforme, asignaciones por guardia/instalación.
5. **Certificación marcación DT**  
   Portal fiscalizador, alertas de jornada, FEA en reportes, comprobante semanal.
6. **Hardening + QA**  
   Tests e2e para todos los módulos operativos.

---

*Este documento refleja el estado real del repositorio al 2026-02-18. Última actualización: Sistema de notificaciones unificado, tickets con SLA, rondas completas, marcación digital completada.*
