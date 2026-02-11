# Estado General del Proyecto — OPAI Suite

> **Fecha:** 2026-02-11  
> **Estado:** Vigente — se actualiza con cada implementación  
> **Referencia:** `docs/00-product/MASTER_SPEC_OPI.md`

---

## Resumen Ejecutivo

OPAI Suite es una plataforma SaaS para empresas de seguridad que opera en `opai.gard.cl`. Actualmente tiene **9 módulos en producción** y **5 fases futuras** planificadas para expandir hacia operaciones (OPI).

| Dato | Valor |
|------|-------|
| Páginas implementadas | 44 |
| Endpoints API | 81 |
| Modelos de datos (Prisma) | 56 |
| Componentes UI | ~160 |
| Schemas PostgreSQL | 6 (public, crm, cpq, docs, payroll, fx) |
| Roles RBAC | 4 (owner, admin, editor, viewer) |
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
| **Páginas** | 12 |
| **APIs** | 33 endpoints |
| **Modelos** | 25 (schema `crm`) |
| **Acceso** | owner, admin, editor |

**Funcionalidades implementadas:**
- **Leads:** Creación pública/interna, aprobación, conversión a Account+Contact+Deal
- **Accounts:** CRUD completo, RUT, razón social, representante legal, industria, segmento
- **Contacts:** CRUD, vinculación a accounts, roles (primary, participant, decision_maker)
- **Deals:** Pipeline con stages configurables, historial de cambios, probabilidad, cotizaciones vinculadas
- **Installations:** CRUD, geolocalización (lat/lng), vinculación a accounts/leads, metadata
- **Pipeline:** Stages configurables por tenant, marcadores closed-won/closed-lost
- **Email:** Cuentas Gmail OAuth, threads, mensajes, envío, tracking (Resend webhooks)
- **Follow-ups:** Configuración automática por tenant, 2 secuencias, templates personalizables
- **WhatsApp:** Templates editables por tenant con tokens dinámicos
- **Custom Fields:** Campos personalizados configurables por entidad
- **Files:** Upload y vinculación de archivos a entidades
- **Search:** Búsqueda global unificada
- **Industries:** Catálogo de industrias configurable

**Pendiente:**
- Reportes CRM (marcado como disabled en UI)

---

### CPQ (Configure, Price, Quote)

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Ruta** | `/cpq/*`, `/crm/cotizaciones/*` |
| **Páginas** | 3 (+2 en CRM) |
| **APIs** | 22 endpoints |
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
| **Páginas** | 6 |
| **APIs** | 7 endpoints |
| **Modelos** | 3 (schema `public`) |
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
| **Páginas** | 6 |
| **APIs** | 8 endpoints |
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
- **Firma digital de documentos:** Solo estructura en DB (`signatureStatus`, `signedAt`, `signedBy`, `signatureData`). No hay flujo implementado (ni UI ni API para firmar). Ver sección "Pendiente" más abajo.
- **PDF:** Generación de PDF del documento
- **Historial:** Auditoría de cambios por documento

---

### Payroll (Liquidaciones Chile)

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ⚠️ Parcial (60%) — Fase 1 del módulo completada |
| **Ruta** | `/payroll/*` |
| **Páginas** | 3 |
| **APIs** | 3 endpoints |
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
| **APIs** | 3 endpoints |
| **Modelos** | 2 (schema `fx`) |

**Funcionalidades:**
- UF diaria (fuente SBIF)
- UTM mensual (fuente SII)
- Sync automático
- Indicadores globales en UI

---

### Configuración

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Ruta** | `/opai/configuracion/*` |
| **Páginas** | 9 |
| **Acceso** | owner, admin |

**Funcionalidades:**
- **Usuarios:** CRUD, invitación por email, activación, roles, desactivación
- **Integraciones:** Gmail OAuth (connect, sync, send)
- **Firmas de email:** Editor Tiptap para pie de correo (firmas de email), default por usuario. No es firma digital de contratos.
- **Categorías:** Gestión de categorías de documentos por módulo
- **CRM Config:** Follow-up config, WhatsApp templates
- **CPQ Config:** Catálogo, roles, puestos de trabajo, cargos
- **Payroll Config:** Parámetros legales
- **Email Templates:** Templates de email CRM editables

---

### Auth y RBAC

| Aspecto | Detalle |
|---------|---------|
| **Estado** | ✅ Completo |
| **Páginas** | 4 (login, forgot, reset, activate) |
| **Modelos** | 3 (Admin, UserInvitation, PasswordResetToken) |

**Funcionalidades:**
- Auth.js v5 con Credentials (bcrypt)
- Sesión JWT con id, email, name, role, tenantId
- 4 roles jerárquicos: owner > admin > editor > viewer
- 10 permisos granulares
- Control de acceso a módulos por rol (app-access)
- Control de acceso a submodules (module-access)
- Invitación por email con token seguro
- Activación de cuenta
- Reset de contraseña
- Auditoría de acciones

---

## Qué falta por terminar (de lo que ya tenemos)

Resumen de lo incompleto dentro de los módulos actuales:

| Área | Qué falta | Prioridad sugerida |
|------|-----------|:------------------:|
| **Documentos — Firma digital** | Flujo completo de firma: pantalla "Firmar documento", captura de firma (canvas o proveedor externo), API para actualizar `signatureStatus`/`signedAt`/`signedBy`/`signatureData`, y opcionalmente integración con proveedor (ej. PandaDoc, Firma.cl). Hoy solo existen los campos en el modelo `Document`. | Alta si necesitas contratos firmados desde OPAI |
| **Payroll** | Asignación Familiar (cálculo real desde tramos IPS), Horas Extra con validaciones, días trabajados/ausencias, descuentos voluntarios, APV, pensión alimenticia, mutual completo. | Alta para liquidaciones reales |
| **CRM — Reportes** | Módulo de reportes (conversión pipeline, métricas por etapa, etc.). En la UI está deshabilitado. | Media |
| **Testing** | Tests automatizados (unit + e2e). No hay cobertura actual. | Media |

---

## Tecnologías y Dependencias Principales

| Categoría | Tecnología | Versión |
|-----------|-----------|---------|
| Framework | Next.js | 15.x |
| Lenguaje | TypeScript | 5.6 |
| ORM | Prisma | 6.19 |
| Base de datos | PostgreSQL (Neon) | — |
| Auth | Auth.js (NextAuth) | 5.0 beta |
| UI | Tailwind CSS + Radix UI + shadcn/ui | 3.4 |
| Animaciones | Framer Motion | 12.x |
| Editor | Tiptap | — |
| Email | Resend | 6.9 |
| AI | OpenAI | 6.18 |
| PDF | Playwright + Chromium | 1.58 |
| Validación | Zod | 4.3 |
| Google | googleapis (Gmail OAuth) | 171.x |
| Deploy | Vercel | — |

---

## Cron Jobs Activos

| Job | Endpoint | Frecuencia | Estado |
|-----|----------|-----------|:------:|
| Follow-up emails | `/api/cron/followup-emails` | Diario | ✅ Activo |
| Document alerts | `/api/cron/document-alerts` | Diario | ✅ Activo |

---

## Revisión de avances Fase 1 (2026-02-11)

Resultado de implementación real en repositorio (DB + API + UI):

| Ítem Fase 1 | Evidencia en repositorio | Estado |
|-------------|--------------------------|:------:|
| Modelos `ops`/`personas`/`te` en Prisma | `prisma/schema.prisma` + migración `20260223000000_phase1_ops_te_personas` | ✅ |
| APIs Fase 1 | Rutas `/api/ops/*`, `/api/te/*`, `/api/personas/*` implementadas | ✅ |
| UI Fase 1 | Pantallas `/ops/*`, `/te/*`, `/personas/*` implementadas en `src/app/(app)` | ✅ |
| Control de acceso | Sidebar, command palette y navegación móvil integradas con módulo `ops` | ✅ |
| Base comercial actual | Hub/CRM/CPQ/Docs/Config continúan operativos | ✅ |

### Avances recientes (Fase 1)

Se implementó el flujo MVP end-to-end:

- Puestos operativos (estructura base por instalación).
- Pauta mensual (generación y asignación).
- Asistencia diaria con reemplazo y generación automática de TE.
- Registro y aprobación/rechazo de TE.
- Lotes de pago TE, marcado pagado y exportación CSV bancaria.
- Gestión de guardias y lista negra.

---

## Qué sigue (recomendación actualizada)

Con Fase 1 MVP v1 implementada, el siguiente bloque recomendado es:

1. **Hardening Fase 1 (QA + cobertura de tests)**  
   Tests unitarios/e2e para pauta, asistencia, TE y pagos.
2. **RBAC operacional fino**  
   Incorporar roles específicos (`rrhh`, `operaciones`, `reclutamiento`) y permisos granulares.
3. **Optimización UX móvil de Ops/TE/Personas**  
   Mejoras de productividad para supervisores en terreno.
4. **Inicio Fase 2**  
   Postventa + Tickets sobre la base operativa ya implementada.

Plan de Fase 1 actualizado: `docs/05-etapa-1/ETAPA_1_IMPLEMENTACION.md`  
Roadmap completo: `docs/00-product/MASTER_SPEC_OPI.md`

---

*Este documento refleja el estado real del repositorio al 2026-02-11.*
