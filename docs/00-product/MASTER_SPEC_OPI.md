# MASTER SPEC — Plataforma OPI/OPAI (Todas las Fases)

> **Este es el documento maestro definitivo.** Define qué hará la plataforma al completar TODAS sus fases.  
> **Fecha:** 2026-03-04  
> **Estado:** Vigente — fuente única de verdad para roadmap completo

---

## 0) Propósito

Construir la plataforma OPI para Gard con enfoque mobile-first y separación de dominios, permitiendo:

1. **CRM comercial** — Pipeline de ventas, cuentas, contactos, deals, cotizaciones, email tracking, follow-ups
2. **CPQ** — Configure, Price, Quote: cotizador con cálculo de costo empleador
3. **Presentaciones comerciales** — Propuestas dinámicas con tracking de vistas y emails
4. **Documentos legales** — Contratos, templates con tokens, versionado, firma digital
5. **Payroll** — Simulador de liquidaciones Chile, parámetros legales
6. **Estructura operacional** — Puestos operativos por instalación
7. **Planificación y cobertura** — Pauta mensual y asistencia diaria
8. **PPC y Turnos Extra** — Gestión de puestos por cubrir y pagos de TE
9. **Personas** — Postulantes, guardias, OS10, documentos, cuenta bancaria, lista negra
10. **Marcación digital** — Asistencia por RUT+PIN+geolocalización, cumplimiento Res. Exenta N°38 DT
11. **Rondas** — Control de rondas con checkpoints, QR, plantillas, programación, monitoreo y reportes
12. **Tickets** — Seguimiento transversal con SLA, aprobaciones multi-paso y categorías
13. **Notificaciones** — Sistema unificado bell + email con preferencias por usuario
14. **Finanzas** — Rendiciones de gastos, aprobaciones, pagos, exportación bancaria
15. **ERP Financiero-Contable** — Plan de cuentas, facturación DTE, tesorería, conciliación, factoring
16. **Portal guardias** — Comunicados, solicitudes RRHH, tickets (sin pauta)
17. **Inventario** — Stock, kits de uniforme, asignación por guardia/instalación

---

## 1) Estado actual vs Fases planificadas

### Mapa completo de implementación

```
 IMPLEMENTADO                          POR IMPLEMENTAR
 ============                          ===============

 [Hub]           ██████████ 100%
 [Presentaciones]██████████ 100%
 [CRM]           ██████████ 100%       [Reportes CRM]     ░░░░░░░░░░ 0%
 [CPQ]           ██████████ 100%
 [Documentos]    ██████████ 100%
 [Payroll]       ██████░░░░  60%       [Completitud legal] ░░░░░░░░░░
 [FX]            ██████████ 100%
 [Auth/RBAC]     ██████████ 100%
 [Config]        ██████████ 100%

 --- MÓDULOS OPI ---

 [Ops + TE + Personas]    ██████████ 100%   (MVP v1 + v2 refactorizado)
 [Marcación digital]      ██████████ 100%   ✅ Completado
 [Rondas]                 ██████████ 100%   ✅ Completado
 [Tickets + SLA]          ██████████ 100%   ✅ Completado
 [Notificaciones]         ██████████ 100%   ✅ Completado
 [Finanzas Rendiciones]   ██████████ 100%   ✅ Completado

 --- POR IMPLEMENTAR ---

 [ERP Financiero-Contable] ░░░░░░░░░░ 0%   📋 Diseño completo listo
 [Portal guardias mejorado]██░░░░░░░░ 15%   Portal básico de tickets existe
 [Portal cliente]          ██████████ 100%  Dashboard, contratos, chat
 [Inventario Ops]          ██████████ 100%  Bodegas, productos, stock, compras
 [Inventario extensiones]  ░░░░░░░░░░ 0%   Kits, mínimos
 [Certificación DT]        ░░░░░░░░░░ 0%   Pendiente para pre-certificación
```

### Lo que YA existe en producción/repositorio

| Módulo | Estado | Nota |
|--------|:------:|------|
| Hub | ✅ 100% | Operativo |
| CRM | ✅ 100% | Operativo |
| CPQ | ✅ 100% | Operativo |
| Presentaciones | ✅ 100% | Operativo |
| Documentos | ✅ 100% | Operativo (incluye firma digital) |
| Payroll | ⚠️ 60% | Parcial (simulador + parámetros) |
| FX (UF/UTM) | ✅ 100% | Operativo |
| Config | ✅ 100% | Operativo |
| Auth | ✅ 100% | 13 roles RBAC |
| Ops + TE + Personas | ✅ 100% | MVP v1 + v2 refactorizado |
| Marcación digital | ✅ 100% | Completado, cumple Res. Exenta N°38 |
| Rondas | ✅ 100% | Checkpoints, plantillas, programación, monitoreo, alertas, reportes |
| Tickets + SLA | ✅ 100% | Tipos configurables, aprobaciones, SLA automático |
| Notificaciones | ✅ 100% | 23 tipos, bell + email, preferencias |
| Finanzas (Rendiciones) | ✅ 100% | Rendiciones, aprobaciones, pagos, exportación Santander |
| Portal cliente | ✅ 100% | Dashboard, contratos visibles, chat |
| Inventario (Ops) | ✅ 100% | Bodegas, productos, stock, compras, entregas |
| **Totales técnicos** | ✅ | ~195 modelos, 11 schemas, ~493 endpoints, ~148 páginas |

### Lo que FALTA

| Prioridad | Módulo | Estado | Dependencias |
|:---------:|--------|:------:|-------------|
| 1 | ERP Financiero-Contable | 📋 Diseño listo | Finanzas (existe) |
| 2 | Completitud Payroll | ❌ | Ninguna |
| 3 | Portal guardias (comunicados, solicitudes RRHH) | ⚠️ Parcial | Personas |
| 4 | Inventario extensiones (kits por guardia/instalación, mínimos) | ❌ | Inventario Ops (existe) |
| 5 | Certificación DT marcación | ❌ | Marcación (existe) |
| 6 | Reportes CRM | ❌ | CRM (existe) |

---

## 2) Principios de arquitectura (invariantes)

### 2.1 Ejes canónicos
- **Instalación:** eje operativo y postventa
- **Puesto Operativo (PO):** eje de planificación/cobertura
- **Asistencia Diaria:** eje de realidad operacional (fuente canónica para TE y Payroll)
- **Guardia:** eje de personas/eligibilidad/portal

### 2.2 Separación de dominios
- **Comercial (IMPLEMENTADO):** CRM, CPQ, Presentaciones, Documentos
- **Personas:** identidad/estado laboral/documentos/OS10/cuentas/lista negra/comentarios
- **Ops:** estructura de servicio (PO), pauta mensual, asistencia diaria, PPC y generación de TE
- **TE & Pagos:** aprobación RRHH, lotes de pago, marcado pagado, historial
- **Marcación:** marcación digital RUT+PIN+geo, hash de integridad, integración con asistencia
- **Rondas:** checkpoints, plantillas, programación, monitoreo, alertas, reportes
- **Tickets:** seguimiento transversal (interno y desde guardias) con SLA
- **Finanzas:** rendiciones, aprobaciones, pagos, centros de costo
- **ERP (planificado):** contabilidad, facturación DTE, tesorería, conciliación, factoring
- **Inventario (futuro):** compras, stock, kits, asignaciones, mínimos
- **Portal Guardias (sub-app):** comunicados + solicitudes RRHH + tickets

### 2.3 Mobile-first
- Supervisores: check-in/out, bitácora, tickets, solicitudes en terreno con 3-4 acciones máximo
- Guardias: portal minimalista: comunicados, solicitudes, tickets
- Marcación: página pública mobile-first sin app nativa

---

## 3) Glosario canónico

### Puesto Operativo (PO)
Entidad permanente que representa una obligación de cobertura de una instalación:
- horario (inicio/fin), días semana, patrón (4x4, 5x2, etc.)
- se crea desde estructura de servicio al cerrar contrato
- si hay dotación simultánea (ej: 2 puestos iguales), se crean 2 PO distintos

### Guardia
Persona contratada. No puede cubrir dos PO el mismo día. Descanso: inicialmente se bloquea doble asignación diaria.

### PPC (Puesto Por Cubrir)
Estado de un PO cuando no está cubierto efectivamente en una fecha. Se deriva, no es tabla propia.

### Turno Extra (TE)
Cobertura por guardia "no base" en una fecha. Monto TE: fijo por instalación (se snapshot en TE).

### Lista Negra
Bloquea contratación, TE y portal. Sin apelación. Solo Admin/SuperAdmin revierte. Siempre auditado.

### Marcación
Registro digital de entrada/salida de un guardia en una instalación. Requiere RUT+PIN+geolocalización.

### Ronda
Recorrido programado por checkpoints de una instalación. Ejecutada por guardias mediante escaneo de QR.

### SLA (Service Level Agreement)
Tiempo máximo de resolución de un ticket según su tipo y prioridad. Monitoreado automáticamente.

---

## 4) Módulos y páginas (visión completa)

### Implementados (producción)

| Ruta | Módulo | Estado |
|------|--------|:------:|
| `/hub` | Centro de control ejecutivo | ✅ |
| `/crm/*` | CRM (leads, accounts, contacts, deals, installations, cotizaciones) | ✅ |
| `/cpq/*` | Configure, Price, Quote | ✅ |
| `/opai/documentos/*` | Documentos y templates legales | ✅ |
| `/opai/inicio` | Dashboard de presentaciones | ✅ |
| `/payroll/*` | Simulador de liquidaciones | ⚠️ |
| `/opai/configuracion/*` | Configuración (usuarios, integraciones, firmas, etc.) | ✅ |
| `/opai/perfil` | Perfil de usuario | ✅ |
| `/opai/perfil/notificaciones` | Preferencias de notificaciones | ✅ |
| `/p/[uniqueId]` | Vista pública de presentación | ✅ |
| `/personas/guardias` | Gestión de guardias (360) | ✅ |
| `/personas/lista-negra` | Lista negra | ✅ |
| `/ops/puestos` | Puestos operativos | ✅ |
| `/ops/pauta-mensual` | Planificación mensual | ✅ |
| `/ops/pauta-diaria` | Asistencia diaria | ✅ |
| `/ops/ppc` | Puestos por cubrir | ✅ |
| `/ops/turnos-extra` | Turnos extra | ✅ |
| `/ops/marcaciones` | Tabla de marcaciones admin | ✅ |
| `/ops/rondas` | Dashboard de rondas | ✅ |
| `/ops/rondas/monitoreo` | Monitoreo en tiempo real | ✅ |
| `/ops/rondas/alertas` | Alertas de incumplimiento | ✅ |
| `/ops/rondas/checkpoints` | Gestión de checkpoints | ✅ |
| `/ops/rondas/templates` | Plantillas de rondas | ✅ |
| `/ops/rondas/programacion` | Programación de rondas | ✅ |
| `/ops/rondas/reportes` | Reportes de cumplimiento | ✅ |
| `/ops/control-nocturno` | Control nocturno | ✅ |
| `/ops/tickets` | Bandeja de tickets | ✅ |
| `/ops/tickets/[id]` | Detalle de ticket | ✅ |
| `/te/registro` | Registro de turnos extra | ✅ |
| `/te/aprobaciones` | Aprobación RRHH de TE | ✅ |
| `/te/lotes` | Lotes de pago semanales | ✅ |
| `/te/pagos` | Pagos y exportación Santander | ✅ |
| `/finanzas/rendiciones` | Rendiciones de gastos | ✅ |
| `/finanzas/aprobaciones` | Aprobaciones de rendiciones | ✅ |
| `/finanzas/pagos` | Pagos de rendiciones | ✅ |
| `/finanzas/reportes` | Reportes financieros | ✅ |
| `/marcar/[code]` | Marcación pública (RUT+PIN+geo) | ✅ |
| `/ronda/[code]` | Ejecución pública de ronda (QR) | ✅ |
| `/postulacion/[token]` | Portal de postulación | ✅ |

### Por implementar

| Ruta | Módulo | Estado |
|------|--------|:------:|
| `/finanzas/contabilidad/*` | ERP: Plan de cuentas, libro diario/mayor | 📋 Diseño listo |
| `/finanzas/facturacion/*` | ERP: Emisión DTE, notas de crédito/débito | 📋 Diseño listo |
| `/finanzas/tesoreria/*` | ERP: Cuentas bancarias, conciliación | 📋 Diseño listo |
| `/finanzas/proveedores/*` | ERP: Proveedores y cuentas por pagar | 📋 Diseño listo |
| `/portal/comunicados` | Comunicados para guardias | ❌ |
| `/portal/solicitudes` | Solicitudes RRHH | ❌ |
| `/inventario/*` | Catálogo, stock, kits, asignaciones | ❌ |

---

## 5) Modelo de datos

### Schemas existentes (143 modelos en producción)

| Schema | Modelos | Propósito |
|--------|:-------:|-----------|
| `public` | 10 | Tenant, Admin, AuditLog, Presentations, Templates, Settings, UserNotificationPreferences |
| `crm` | 27 | Leads, Accounts, Contacts, Deals, Installations, Pipeline, Email, Files, Custom Fields, Notes |
| `cpq` | 11 | Quotes, Positions, Catalog, Puestos, Cargos, Roles, Parameters |
| `docs` | 6 | DocTemplate, Document, DocCategory, Associations, History |
| `payroll` | 4 | Parameters, Assumptions, Simulations, Salary Components |
| `fx` | 2 | UF Rates, UTM Rates |
| `ops` | 38 | Puestos, Pauta, Asistencia, TE, Guardias, Personas, Marcaciones, Rondas, Checkpoints, Tickets, SLA |
| `finance` | 45 | Rendiciones, Centros de Costo, Aprobaciones, Plan de Cuentas (schema ready), DTE, Tesorería |

---

## 6) Reglas de negocio (hard rules)

### 6.1 Asignación pauta mensual
Un guardia no puede estar asignado a 2 PO en la misma fecha. Validación al guardar batch.

### 6.2 Derivación asistencia diaria
- Base: pauta mensual
- Overrides: eventos RRHH
- Señales: OpsMarcacion (RUT+PIN+geo) — fuente digital de entrada/salida
- Manual Ops (cuando no existe señal digital confiable)

### 6.3 Generación TE
Se crea/actualiza TE cuando asistencia_diaria.guardia_reemplazo_id está definido, o estado refleja PPC y se asigna una cobertura. TE guarda monto_snapshot desde instalación.

### 6.4 Portal guardias
Acceso si: guardia.estado = activo, tiene relación contractual activa, no lista negra.

### 6.5 Lista negra
Bloquea: asignación en pauta, selección como reemplazo, autenticación portal.

### 6.6 SLA de tickets
Cada tipo de ticket define `slaHours`. Al crear ticket, `slaDueAt = createdAt + slaHours`. Monitor automático cada 15 min marca breach y envía notificaciones.

### 6.7 Marcación digital
Geolocalización obligatoria y bloqueante. Sin GPS = no puede marcar. Fuera de radio = rechazado (403). Hash SHA-256 inmutable por registro.

---

## 7) Seguridad y roles

### Roles actuales (implementados)

| Rol | Acceso |
|-----|--------|
| `owner` | Todo |
| `admin` | Todo excepto settings avanzados |
| `editor` | Hub, Docs, CRM, CPQ, Payroll |
| `viewer` | Hub, Docs (solo lectura) |
| `operaciones` | Ops, Personas, TE |
| `rrhh` | Personas, TE aprobaciones |
| `reclutamiento` | Pipeline postulantes |
| `finanzas` | Finanzas completo |
| `solo_finanzas` | Solo módulo finanzas |
| `supervisor` | Ops lectura, tickets, rondas |
| + 3 roles adicionales | Combinaciones específicas por tenant |

---

## 8) Fases de ejecución

### Pre-fases: OPAI Suite (COMPLETADO)

Lo que ya existe y funciona en producción:

- ✅ Hub ejecutivo (KPIs, quick actions, apps launcher)
- ✅ CRM completo (leads, accounts, contacts, deals, installations, pipeline, email, follow-ups, WhatsApp)
- ✅ CPQ completo (cotizaciones, posiciones, catálogo, cálculo employer cost)
- ✅ Presentaciones comerciales (templates, tracking, email, vistas públicas)
- ✅ Documentos legales (templates Tiptap, tokens, versionado, categorías, firma digital)
- ✅ Payroll parcial (simulador de liquidaciones, parámetros legales Chile)
- ✅ FX (UF/UTM automático)
- ✅ Auth + RBAC (13 roles, invitaciones, activación)
- ✅ Configuración (usuarios, integraciones Gmail, firmas, categorías)

### Fase 1 — Ops + TE + Personas (COMPLETADO)

- ✅ DB core + Ops + TE
- ✅ UI pauta mensual + diaria (v2 refactorizado con matriz spreadsheet)
- ✅ TE generado desde asistencia
- ✅ Aprobación RRHH + lote semanal + marcar pagado + exportación Santander
- ✅ Personas: guardia 360, cuenta, docs, flags, lista negra
- ✅ Asignación de guardias a puestos con historial

**Plan:** `docs/05-etapa-1/ETAPA_1_IMPLEMENTACION.md`

### Fase 2 — Marcación digital (COMPLETADO)

- ✅ Marcación de entrada/salida vía web (RUT + PIN + geolocalización)
- ✅ Modelo `OpsMarcacion` con hash de integridad SHA-256
- ✅ Página pública `/marcar/[code]` mobile-first
- ✅ QR por instalación con geofence
- ✅ Captura de foto de evidencia (cámara frontal)
- ✅ Comprobante por email automático
- ✅ Integración automática con `OpsAsistenciaDiaria`
- ✅ Gestión de PIN y código de instalación desde admin
- ✅ Cumplimiento Resolución Exenta N°38 DT Chile (10/13 requisitos, 3 pendientes para certificación)

**Plan:** `docs/07-etapa-3/ETAPA_3_MARCACION.md`

### Fase 3 — Rondas + Tickets + SLA (COMPLETADO)

- ✅ Rondas: checkpoints, plantillas, programación, monitoreo, alertas, reportes
- ✅ Ejecución pública de rondas por QR (`/ronda/[code]`)
- ✅ Control nocturno por instalación
- ✅ Tickets con tipos configurables, prioridad, equipo asignado, SLA en horas
- ✅ Workflow de aprobación multi-paso
- ✅ Monitor SLA automático (cron cada 15 min) con notificaciones
- ✅ Portal de guardia para crear tickets

### Fase 4 — Notificaciones + Finanzas (COMPLETADO)

- ✅ Sistema unificado de notificaciones (bell + email)
- ✅ 23 tipos de notificación en 4 módulos
- ✅ Preferencias por usuario con UI de configuración
- ✅ Rendiciones de gastos (compras y kilometraje)
- ✅ Centros de costo, aprobación multi-nivel
- ✅ Exportación bancaria Santander (formato ABM)
- ✅ Alertas de finanzas automáticas

### Fase 5 — ERP Financiero-Contable (PLANIFICADO)

**Entregables:**
- Plan de cuentas contable chileno (80+ cuentas base)
- Libro diario/mayor con partida doble
- Períodos contables con apertura/cierre
- Emisión de DTE (facturas electrónicas SII) vía proveedor (Facto u otro)
- Notas de crédito/débito
- Proveedores y cuentas por pagar
- Tesorería (cuentas bancarias, conciliación bancaria)
- Factoring
- Integración contable automática (factura → asiento)

**Estado:** 📋 Diseño completo y plan de implementación listos
**Plan:** `docs/plans/2026-02-15-erp-financiero-contable-design.md`

### Fase 6 — Portal guardias + Comunicados + Solicitudes

**Entregables:**
- Comunicados internos para guardias
- Solicitudes RRHH (permiso/vacaciones/licencia) + estado
- Mejora del portal de guardia existente

**Estado:** ❌ No iniciado (portal básico de tickets ya existe)

### Fase 7 — Inventario

**Entregables:**
- Catálogo + variantes + compras + stock_ledger
- kit_template + asignación a guardia
- KPI básico stock mínimo

**Estado:** ❌ No iniciado

### Fase 8 — Certificación DT marcación

**Entregables:**
- Portal web para fiscalizador DT con credenciales especiales
- Alertas automáticas de jornada excedida
- Comprobante semanal consolidado
- Firma electrónica avanzada en reportes
- Procedimiento auditable de corrección de marcaciones

**Estado:** ❌ No iniciado (se implementará con certificador independiente)

---

## 9) APIs OPI (estado actual y roadmap)

### Implementadas

**Ops:**
- `GET/POST /api/ops/instalaciones`
- `PATCH /api/ops/instalaciones/:id`
- `POST /api/ops/puestos/bulk-create`
- `GET /api/ops/pauta-mensual?instalacion_id&mes&anio`
- `POST /api/ops/pauta-mensual/generar`
- `POST /api/ops/pauta-mensual/guardar`
- `GET /api/ops/asistencia?fecha&instalacion_id`
- `PATCH /api/ops/asistencia/:id`

**TE & Pagos:**
- `GET /api/te?desde&hasta&estado`
- `PATCH /api/te/:id/aprobar`
- `PATCH /api/te/:id/rechazar`
- `POST /api/te/lotes`
- `GET /api/te/lotes/:id/export-santander`
- `PATCH /api/te/lotes/:id/marcar-pagado`

**Marcación digital:**
- `POST /api/public/marcacion/validar`
- `POST /api/public/marcacion/registrar`
- `GET /api/public/marcacion/estado`
- `GET /api/public/marcacion/mis-marcaciones`
- `POST /api/ops/marcacion/pin`
- `GET /api/ops/marcacion/reporte`
- `POST /api/ops/installations/:id/generar-codigo`

**Rondas:**
- `GET/POST /api/ops/rondas/checkpoints`
- `GET/POST /api/ops/rondas/templates`
- `GET/POST /api/ops/rondas/programacion`
- `GET /api/ops/rondas/monitoreo`
- `GET /api/ops/rondas/alertas`
- `GET /api/ops/rondas/reportes`
- `POST /api/public/rondas/ejecutar`

**Tickets:**
- `GET/POST /api/ops/tickets`
- `GET/PATCH /api/ops/tickets/:id`
- `GET/POST /api/ops/tickets/:id/approvals`
- `GET/POST /api/ops/ticket-types`
- `POST /api/portal/guardia/tickets`

**Notificaciones:**
- `GET /api/notifications`
- `GET/PUT /api/notifications/user-preferences`

**Finanzas:**
- `GET/POST /api/finance/rendiciones`
- `GET/POST /api/finance/aprobaciones`
- `POST /api/finance/pagos`
- `GET /api/finance/reportes`

### Planificadas (ERP)

- `GET/POST /api/finance/accounting/accounts`
- `POST /api/finance/accounting/accounts/seed`
- `GET/POST /api/finance/accounting/periods`
- `GET/POST /api/finance/accounting/journal`
- `POST /api/finance/billing/issued`
- `POST /api/finance/billing/credit-note`
- `GET/POST /api/finance/purchases/suppliers`
- Ver `docs/plans/2026-02-15-erp-fase1-implementation-plan.md`

---

## 10) Jobs/Automatismos

| Job | Estado | Frecuencia | Propósito |
|-----|:------:|-----------|-----------|
| `fx_sync` | ✅ | 2x/día (12:00, 18:00) | Sync UF/UTM desde SBIF/SII |
| `followup_emails` | ✅ | Cada 2 horas | Follow-up emails CRM |
| `document_alerts` | ✅ | Diario 8:00 | Alertas de vencimiento de documentos |
| `marcacion_emails` | ✅ | Cada 5 min | Comprobantes de marcación por email |
| `rondas_generar` | ✅ | Cada 10 min | Generación automática de rondas programadas |
| `finance_alerts` | ✅ | Diario 8:00 | Alertas de rendiciones y finanzas |
| `sla_monitor` | ✅ | Cada 15 min | Monitoreo de SLA de tickets, breach y approaching |

---

## 11) Estructura del repositorio

```
opai/
├── prisma/
│   └── schema.prisma          ← 143 modelos, 8 schemas
├── src/
│   ├── app/
│   │   ├── (app)/             ← Rutas protegidas (103 páginas)
│   │   │   ├── hub/
│   │   │   ├── crm/
│   │   │   ├── cpq/
│   │   │   ├── payroll/
│   │   │   ├── opai/          ← documentos, configuración, perfil, notificaciones
│   │   │   ├── ops/           ← puestos, pauta, asistencia, marcaciones, rondas, tickets
│   │   │   ├── personas/      ← guardias, lista negra
│   │   │   ├── te/            ← turnos extra, lotes, pagos
│   │   │   └── finanzas/      ← rendiciones, aprobaciones, pagos, reportes
│   │   ├── (templates)/       ← Rutas públicas (presentaciones)
│   │   ├── marcar/            ← Marcación pública
│   │   ├── ronda/             ← Rondas públicas (QR)
│   │   ├── postulacion/       ← Portal de postulación
│   │   └── api/               ← 318 endpoints
│   ├── components/            ← ~268 componentes
│   ├── lib/                   ← Utilidades, auth, RBAC, validaciones, notification-service
│   ├── modules/               ← Engines (payroll, cpq, finance)
│   ├── emails/                ← Templates de email (React Email)
│   └── types/
├── docs/                      ← Documentación organizada
└── public/
```

---

## 12) Convenciones

- **Naming DB:** `{Domain}{Entity}` en Prisma. Ej: `CrmDeal`, `OpsTicket`
- **Schema DB:** Un schema por dominio: `public`, `crm`, `cpq`, `docs`, `payroll`, `fx`, `ops`, `finance`
- **IDs:** UUID (uuid_generate_v4()) para schemas CRM/CPQ/Docs/Ops/Finance, CUID para schema public
- **APIs:** `/api/{module}/{resource}` (ej: `/api/crm/deals`, `/api/ops/tickets`)
- **Páginas:** `/src/app/(app)/{module}/` con layout compartido
- **Componentes:** `/src/components/{module}/` por dominio
- **Validaciones:** Zod schemas en `/src/lib/validations/{module}.ts`
- **Notificaciones:** Usar `sendNotification()` de `notification-service.ts` para notificar eventos
- **Mobile-first:** Todas las páginas nuevas deben ser responsive

---

*Este documento reemplaza y consolida toda la documentación previa como fuente única de verdad para la visión completa de la plataforma. Actualizado: 2026-02-18.*
