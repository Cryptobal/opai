# Auditoría Completa - Opai CRM
**Fecha:** 2026-02-27
**Aplicación:** opai.gard.cl

---

## PARTE A: Auditoría de Relaciones entre Entidades del CRM

---

### CUENTA (vista detalle)

**Archivo:** `src/app/(app)/crm/accounts/[id]/page.tsx`
**Componente:** `src/components/crm/CrmAccountDetailClient.tsx` (1,118 líneas)

**Tabs disponibles:** General, Contactos, Instalaciones, Negocios, Cotizaciones, Comunicación, Rendiciones, Notas, Archivos

#### Muestra:
- **Contactos** - Tab con grid de cards. Cada card muestra nombre, rol, email, teléfono y badge "Principal"
- **Instalaciones** - Tab con lista de cards. Muestra nombre, estado (Activa/Inactiva), dirección, mapa estático de Google Maps, botón activar/desactivar
- **Negocios** - Tab con grid de cards. Muestra título, etapa, monto (CLP), badge de estado (Ganado/Perdido)
- **Cotizaciones** - Tab con grid de cards. Muestra código, nombre cliente, costo mensual, badge de estado (borrador/enviada/aprobada)
- **Comunicación** - Historial de emails enviados/recibidos con tracking (opens, clicks, bounces)
- **Rendiciones** - KPIs (total, pagado, pendiente) + tabla con código, fecha, monto, estado
- **Notas** - Sistema de notas con hilos, @menciones de usuarios y grupos
- **Archivos** - Drag-and-drop upload, listado con preview, descarga, eliminación

#### Falta:
- **Nada** - La vista de Cuenta muestra todas las entidades relacionadas requeridas por el modelo (Instalaciones, Contactos, Negocios, Cotizaciones)

#### Crear desde aquí:
- **Contacto** - SI. Botón "+" verde en tab Contactos. Modal con: Nombre*, Apellido, Email*, Teléfono, Cargo, Checkbox principal. API: `POST /api/crm/contacts`
- **Instalación** - SI. Botón "+" verde en tab Instalaciones. Modal con: Nombre*, Dirección (autocomplete Google Maps), Ciudad, Comuna, Notas, paste URL Google Maps. API: `POST /api/crm/installations`
- **Negocio** - SI. Botón "+" verde en tab Negocios. Modal con: Nombre cliente (pre-llenado), Título negocio. Auto-navega al detalle del negocio. API: `POST /api/crm/deals`
- **Cotización** - SI. Botón en tab Cotizaciones. Usa `CreateQuoteModal` con cuenta pre-seleccionada. API: `POST /api/cpq/quotes`

#### Navegación:
- Contactos → `/crm/contacts/{id}` - **FUNCIONA**
- Instalaciones → `/crm/installations/{id}` - **FUNCIONA** (nombre e imagen de mapa son clickeables)
- Negocios → `/crm/deals/{id}` - **FUNCIONA**
- Cotizaciones → `/crm/cotizaciones/{id}` - **FUNCIONA**
- Rendiciones → `/finanzas/rendiciones/{id}` - **FUNCIONA** (link al módulo de finanzas)

---

### INSTALACION (vista detalle)

**Archivo:** `src/app/(app)/crm/installations/[id]/page.tsx`
**Componente:** `src/components/crm/CrmInstallationDetailClient.tsx`

**Tabs disponibles:** General, Cuenta, Negocios, Cotizaciones, Puestos, Refuerzos, Dotación, Marcación, Rendiciones, Uniformes, Notas, Archivos (12 tabs)

#### Muestra:
- **Cuenta** - Tab con card `CrmRelatedRecordCard`. Muestra nombre de la cuenta, badge tipo (Cliente/Prospecto)
- **Negocios** - Tab con grid de cards. Muestra deals del `account` asociado: título, etapa, monto, badge estado
- **Cotizaciones** - Tab con grid de cards. Muestra cotizaciones vinculadas: código, N° puestos/guardias, fecha, badge estado
- **Puestos Operativos** - Gestión completa de puestos con salarios, turnos, cargos, roles
- **Refuerzos** - Gestión de turnos extra (solicitudes, estados)
- **Dotación** - Asignación de guardias a puestos con slots
- **Marcación** - Códigos QR de asistencia y rondas
- **Rendiciones** - Gastos de la instalación
- **Uniformes** - Inventario (condicional a permisos)

#### Falta:
- **Contactos** - NO tiene tab de contactos asociados a la instalación. Según el modelo, una instalación debería tener 1 o más contactos

#### Crear desde aquí:
- **Negocio** - SI. `CreateDealModal` (solo si tiene cuenta asociada)
- **Cotización** - SI. `CreateQuoteModal` con `installationId` pre-asignado (solo si tiene cuenta)
- **Puesto Operativo** - SI. Modal "Nuevo puesto operativo"
- **Asignación Guardia** - SI. Desde tab Dotación
- **Contacto** - NO. No hay forma de crear ni vincular contactos
- **Cuenta** - NO. Solo muestra la cuenta asociada, no permite cambiarla

#### Navegación:
- Cuenta → `/crm/accounts/{id}` - **FUNCIONA** (card clickeable)
- Negocios → `/crm/deals/{id}` - **FUNCIONA**
- Cotizaciones → `/crm/cotizaciones/{id}` - **FUNCIONA**
- Botón "Ver todos" hacia `/crm/deals` y `/crm/cotizaciones` - **FUNCIONA**

---

### NEGOCIO (vista detalle)

**Archivo:** `src/app/(app)/crm/deals/[id]/page.tsx`
**Componente:** `src/components/crm/CrmDealDetailClient.tsx` (1,546 líneas)

**Tabs disponibles:** General, Contactos, Instalaciones, Cotizaciones, Seguimiento, Comunicación, Notas, Archivos (8 tabs)

#### Muestra:
- **General** - Monto CLP, Monto UF, N° Guardias, Cotización activa (dropdown), Cliente (link a cuenta), Etapa (dropdown cambio rápido), Monto manual, Contacto principal (link), Link propuesta, Estado seguimiento
- **Contactos** - Grid de cards con contactos vinculados al deal. Muestra nombre, rol, email, badge "Principal". Acciones: marcar como principal, desvincular
- **Instalaciones** - Lista de instalaciones de la cuenta. Usa `CrmInstallationsClient`. Muestra nombre, dirección, mapa, estado
- **Cotizaciones** - Grid de cards de cotizaciones vinculadas. Muestra código, cliente, fecha, monto, badge estado
- **Seguimiento** - Timeline visual de 3 etapas (S1→S2→S3), historial de logs de seguimiento
- **Comunicación** - Email compose con templates, historial, WhatsApp con templates

#### Falta:
- **Nada significativo** - El negocio muestra todas las relaciones requeridas (Cuenta, Instalaciones, Contactos, Cotizaciones)

#### Crear desde aquí:
- **Contacto** - PARCIAL. Botón "Vincular contacto al negocio" - solo vincula contactos EXISTENTES de la cuenta, no crea nuevos
- **Instalación** - SI. Botón "+" verde para nueva instalación
- **Cotización** - SI. Dos opciones: (1) "Nueva Cotización" via `CreateQuoteModal`, (2) "Vincular" cotización existente del CPQ
- **Cuenta** - NO. Solo muestra la cuenta, no permite cambiar

#### Navegación:
- Cuenta → `/crm/accounts/{id}` - **FUNCIONA** (link en General)
- Contacto principal → `/crm/contacts/{id}` - **FUNCIONA**
- Contactos → `/crm/contacts/{id}` - **FUNCIONA** (cards clickeables)
- Instalaciones → `/crm/installations/{id}` - **FUNCIONA**
- Cotizaciones → `/crm/cotizaciones/{id}` - **FUNCIONA**
- Link propuesta → URL externa - **FUNCIONA** (abre nueva pestaña)

---

### CONTACTO (vista detalle)

**Archivo:** `src/app/(app)/crm/contacts/[id]/page.tsx`
**Componente:** `src/components/crm/CrmContactDetailClient.tsx` (~850 líneas)

**Tabs disponibles:** General, Cuenta, Negocios, Comunicación, Notas, Archivos (6 tabs)

#### Muestra:
- **General** - Nombre completo, Email (mailto), Teléfono (tel), Cargo, Badge tipo (Principal/Secundario)
- **Cuenta** - Card `CrmRelatedRecordCard` con nombre cuenta, industria, badge tipo (Cliente/Prospecto)
- **Negocios** - Grid de cards con deals de la cuenta del contacto. Muestra título, etapa (con selector inline de cambio de etapa), monto, badge estado
- **Comunicación** - Email compose con templates (Tiptap editor), firma Gmail, historial de emails, WhatsApp
- **Notas** - Notas con @menciones y threading
- **Archivos** - Upload/download archivos

#### Falta:
- **Instalaciones** - NO tiene tab de instalaciones asociadas. Según el modelo, un contacto debería tener 1 o más instalaciones
- **Cotizaciones** - NO tiene tab de cotizaciones. Según el modelo, un contacto debería tener 1 o más cotizaciones

#### Crear desde aquí:
- **Negocio** - SI. `CreateDealModal` (solo si contacto tiene cuenta)
- **Instalación** - NO. No hay opción
- **Cotización** - NO. No hay opción
- **Cuenta** - NO. Solo muestra la cuenta existente

#### Navegación:
- Cuenta → `/crm/accounts/{id}` - **FUNCIONA** (card clickeable)
- Negocios → `/crm/deals/{id}` - **FUNCIONA** (cards clickeables, auto-vincula contacto al deal al navegar)
- Email → `mailto:{email}` - **FUNCIONA**
- Teléfono → `tel:{phone}` - **FUNCIONA**
- WhatsApp → `https://wa.me/{phone}` - **FUNCIONA**

---

### COTIZACION (vista detalle)

**Archivo:** `src/app/(app)/crm/cotizaciones/[id]/page.tsx`
**Componente:** `src/components/cpq/CpqQuoteDetail.tsx` (1,921 líneas)

**Estructura:** Workflow multi-paso: Datos → Puestos → Costos → Resumen → Enviar (5 steps)

#### Muestra (Step 1 "Datos" - Contexto CRM):
- **Cuenta** - Dropdown selector de todas las cuentas CRM. Muestra nombre y tipo
- **Instalación** - Dropdown filtrado por cuenta seleccionada. Muestra nombre, dirección
- **Contacto** - Dropdown filtrado por cuenta seleccionada. Muestra nombre
- **Negocio** - Dropdown filtrado por cuenta seleccionada. Muestra título

#### Falta:
- **Nada** - Las 4 entidades CRM están presentes y son seleccionables/creables

#### Crear desde aquí:
- **Cuenta** - SI. Creación inline con botón "+". Modal con: Nombre*. Se crea como "prospect". API: `POST /api/crm/accounts`
- **Instalación** - SI. Creación inline. Modal con: Nombre*, Dirección (Google Maps autocomplete), Ciudad, Comuna, lat/lng. API: `POST /api/crm/installations`
- **Contacto** - SI. Creación inline. Modal con: Nombre*, Apellido, Email*. API: `POST /api/crm/contacts`
- **Negocio** - SI. Creación inline. Modal con: Título (auto-fill "Oportunidad {clientName}"). API: `POST /api/crm/deals`

#### Navegación:
- Cuenta → `/crm/accounts/{id}` - **FUNCIONA** (link en card)
- Instalación → Google Maps (link externo a dirección) - **FUNCIONA**
- Contacto - Mostrado en header y modal de envío
- Negocio - Mostrado en preview del documento
- Breadcrumb → `/crm/cotizaciones` - **FUNCIONA**

---

### RESUMEN PARTE A - Matriz de Completitud

| Entidad detalle | Contactos | Instalaciones | Negocios | Cotizaciones | Cuenta |
|----------------|-----------|---------------|----------|-------------|--------|
| **Cuenta**     | Muestra + Crear | Muestra + Crear | Muestra + Crear | Muestra + Crear | N/A |
| **Instalación** | **FALTA** | N/A | Muestra + Crear | Muestra + Crear | Muestra (solo ver) |
| **Negocio**    | Muestra + Vincular (no crear nuevo) | Muestra + Crear | N/A | Muestra + Crear/Vincular | Muestra (solo ver) |
| **Contacto**   | N/A | **FALTA** | Muestra + Crear | **FALTA** | Muestra (solo ver) |
| **Cotización**  | Seleccionar + Crear | Seleccionar + Crear | Seleccionar + Crear | N/A | Seleccionar + Crear |

### Gaps Identificados (Parte A):

1. **Instalación → Contactos**: No existe tab de contactos. No se pueden ver ni vincular contactos a una instalación
2. **Contacto → Instalaciones**: No existe tab de instalaciones. No se pueden ver las instalaciones donde el contacto está asociado
3. **Contacto → Cotizaciones**: No existe tab de cotizaciones. No se pueden ver las cotizaciones donde el contacto participa
4. **Negocio → Contactos**: Solo permite vincular contactos existentes de la cuenta, no crear contactos nuevos directamente

---

## PARTE B: Auditoría de Selectores/Dropdowns en TODA la Aplicación

### Componentes de selección disponibles en el sistema:

| Componente | Archivo | Tipo | Tiene búsqueda |
|-----------|---------|------|---------------|
| `<select>` (nativo HTML) | N/A | Select nativo del browser | No |
| `<Select>` (shadcn/Radix) | `src/components/ui/select.tsx` | Dropdown estilizado | No |
| `SearchableSelect` | `src/components/ui/SearchableSelect.tsx` | Combobox con búsqueda de texto | SI (filtro local, normalizado, max 60 items) |
| `GuardiaSearchInput` | `src/components/ops/GuardiaSearchInput.tsx` | Input con búsqueda server-side | SI (API search con debounce 250ms) |

---

### Tabla Completa de Selectores

| # | Módulo | Vista/Modal | Campo | Datos | Tipo actual | >10 items? | Tiene búsqueda? | Acción necesaria |
|---|--------|-------------|-------|-------|-------------|------------|-----------------|-----------------|
| **CRM - Cuentas** | | | | | | | | |
| 1 | CRM | Nueva/Editar Cuenta | Tipo | 2 opciones estáticas (Prospecto/Cliente) | `<select>` nativo | No | No | OK - pocos items |
| 2 | CRM | Nueva/Editar Cuenta | Industria | Industrias dinámicas del API | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| **CRM - Contactos** | | | | | | | | |
| 3 | CRM | Nuevo/Editar Contacto | Cliente (Cuenta) | Todas las cuentas CRM | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| **CRM - Negocios (Lista)** | | | | | | | | |
| 4 | CRM | Nuevo Negocio | Cliente (Cuenta) | Todas las cuentas CRM | `<Select>` shadcn | **Sí** | No | **Cambiar a SearchableSelect** |
| 5 | CRM | Nuevo Negocio | Etapa | Etapas del pipeline | `<Select>` shadcn | No | No | OK - pocos items |
| 6 | CRM | Sheet Negocio (cambio rápido) | Etapa | Etapas del pipeline | `<Select>` shadcn | No | No | OK - pocos items |
| **CRM - Negocio (Detalle)** | | | | | | | | |
| 7 | CRM | Detalle Negocio | Cotización activa | Cotizaciones enviadas del deal | `<Select>` shadcn | Posible | No | Evaluar si crece |
| 8 | CRM | Detalle Negocio | Etapa | Etapas del pipeline | `<Select>` shadcn | No | No | OK - pocos items |
| 9 | CRM | Detalle Negocio > Vincular Cot. | Cotización | Todas las cotizaciones CPQ | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 10 | CRM | Detalle Negocio > Vincular Contacto | Contacto | Contactos disponibles de la cuenta | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 11 | CRM | Detalle Negocio > Email | Template | Templates de email | `<Select>` shadcn | Posible | No | Evaluar si crece |
| **CRM - Contacto (Detalle)** | | | | | | | | |
| 12 | CRM | Detalle Contacto > Deals | Etapa (inline) | Etapas del pipeline | `<select>` nativo (styled) | No | No | OK - pocos items |
| 13 | CRM | Detalle Contacto > Email | Plantilla | Templates de email | `<select>` nativo | Posible | No | Evaluar si crece |
| **CRM - Instalaciones** | | | | | | | | |
| 14 | CRM | Nueva Instalación | Cuenta | Todas las cuentas CRM | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| **CRM - Leads** | | | | | | | | |
| 15 | CRM | Aprobar Lead | Cuenta existente | Cuentas duplicadas/similares | `<select>` nativo | No | No | OK - pocos items |
| 16 | CRM | Aprobar Lead | Industria | Industrias dinámicas | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 17 | CRM | Aprobar Lead > Dotación | Tipo de puesto | Catálogo CPQ puestos | `<select>` nativo | Posible | No | Evaluar |
| 18 | CRM | Aprobar Lead > Dotación | Cargo | Catálogo CPQ cargos | `<select>` nativo | Posible | No | Evaluar |
| 19 | CRM | Aprobar Lead > Dotación | Rol | Catálogo CPQ roles | `<select>` nativo | Posible | No | Evaluar |
| 20 | CRM | Aprobar Lead > Dotación | Guardias | 1-10 (hardcoded) | `<select>` nativo | No | No | OK - rango fijo |
| 21 | CRM | Aprobar Lead > Dotación | N° puestos | 1-20 (hardcoded) | `<select>` nativo | Sí (20) | No | OK - rango numérico |
| 22 | CRM | Aprobar Lead > Dotación | Inicio turno | 6 horarios fijos | `<select>` nativo | No | No | OK - pocos items |
| 23 | CRM | Rechazar Lead | Motivo | Razones de rechazo predefinidas | `<select>` nativo | No | No | OK - pocos items |
| 24 | CRM | Rechazar Lead | Template rechazo | Templates de rechazo | `<select>` nativo | No | No | OK - pocos items |
| **CRM - Seguimiento** | | | | | | | | |
| 25 | CRM | Config Seguimiento | Hora de envío | 0-23 horas | `<select>` nativo | Sí (24) | No | OK - rango numérico |
| 26 | CRM | Config Seguimiento | Template 1er seguimiento | Templates de email | `<select>` nativo | Posible | No | Evaluar |
| 27 | CRM | Config Seguimiento | Template 2do seguimiento | Templates de email | `<select>` nativo | Posible | No | Evaluar |
| 28 | CRM | Config Seguimiento | Template 3er seguimiento | Templates de email | `<select>` nativo | Posible | No | Evaluar |
| 29 | CRM | Config Seguimiento | Etapa destino 1er seg. | Etapas abiertas del pipeline | `<select>` nativo | No | No | OK - pocos items |
| 30 | CRM | Config Seguimiento | Etapa destino 2do seg. | Etapas abiertas del pipeline | `<select>` nativo | No | No | OK - pocos items |
| **CRM - Config** | | | | | | | | |
| 31 | CRM | Config > Campos Custom | Tipo campo (crear) | 11 tipos de campo fijos | `<select>` nativo | No | No | OK - lista fija |
| 32 | CRM | Config > Campos Custom | Tipo campo (editar) | 11 tipos de campo fijos | `<select>` nativo | No | No | OK - lista fija |
| **CRM - Filtros/Orden** | | | | | | | | |
| 33 | CRM | Toolbar (mobile) | Filtro estado | Opciones de filtro por vista | `<Select>` shadcn | No | No | OK - pocos items |
| 34 | CRM | Toolbar | Ordenar por | Opciones de orden por vista | `<select>` nativo | No | No | OK - pocos items |
| **CPQ - Cotizaciones** | | | | | | | | |
| 35 | CPQ | Detalle Cotización (Step 1) | Cuenta | Todas las cuentas CRM | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 36 | CPQ | Detalle Cotización (Step 1) | Instalación | Instalaciones de la cuenta | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 37 | CPQ | Detalle Cotización (Step 1) | Contacto | Contactos de la cuenta | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 38 | CPQ | Detalle Cotización (Step 1) | Negocio | Negocios de la cuenta | `<select>` nativo | Posible | No | **Cambiar a SearchableSelect** |
| 39 | CPQ | Crear Posición | Tipo de Puesto | Catálogo CPQ puestos | `<select>` nativo | Posible | No | Evaluar |
| 40 | CPQ | Crear Posición | Cargo | Catálogo CPQ cargos | `<select>` nativo | Posible | No | Evaluar |
| 41 | CPQ | Crear Posición | Rol | Catálogo CPQ roles | `<select>` nativo | Posible | No | Evaluar |
| 42 | CPQ | Crear Posición | Hora inicio | Horarios (TIME_OPTIONS) | `<select>` nativo | Sí (48) | No | OK - rango de horas |
| 43 | CPQ | Crear Posición | Hora término | Horarios (TIME_OPTIONS) | `<select>` nativo | Sí (48) | No | OK - rango de horas |
| 44 | CPQ | Crear Posición | Guardias | 1-10 (hardcoded) | `<select>` nativo | No | No | OK - rango fijo |
| 45 | CPQ | Crear Posición | N° puestos | 1-20 (hardcoded) | `<select>` nativo | Sí (20) | No | OK - rango numérico |
| 46 | CPQ | Editar Posición | Tipo de Puesto | Catálogo CPQ puestos | `<select>` nativo | Posible | No | Evaluar |
| 47 | CPQ | Editar Posición | Cargo | Catálogo CPQ cargos | `<select>` nativo | Posible | No | Evaluar |
| 48 | CPQ | Editar Posición | Rol | Catálogo CPQ roles | `<select>` nativo | Posible | No | Evaluar |
| 49 | CPQ | Editar Posición | Hora inicio | Horarios (TIME_OPTIONS) | `<select>` nativo | Sí (48) | No | OK - rango de horas |
| 50 | CPQ | Editar Posición | Hora término | Horarios (TIME_OPTIONS) | `<select>` nativo | Sí (48) | No | OK - rango de horas |
| 51 | CPQ | Editar Posición | Guardias | 1-10 (hardcoded) | `<select>` nativo | No | No | OK - rango fijo |
| 52 | CPQ | Editar Posición | N° puestos | 1-20 (hardcoded) | `<select>` nativo | Sí (20) | No | OK - rango numérico |
| 53 | CPQ | Config Catálogo | Unidad (item existente) | 3 opciones (mes/semestre/año) | `<select>` nativo | No | No | OK - lista fija |
| 54 | CPQ | Config Catálogo | Unidad (item nuevo) | 3 opciones (mes/semestre/año) | `<select>` nativo | No | No | OK - lista fija |
| 55 | CPQ | Costos | Unidad item adicional | 3 opciones (mes/semestre/año) | `<select>` nativo | No | No | OK - lista fija |
| **OPS - Guardias** | | | | | | | | |
| 56 | OPS | Lista Guardias | Filtros (estado, etc.) | Estados de guardia | `<select>` nativo | No | No | OK - pocos items |
| 57 | OPS | Detalle Guardia > Datos | Nacionalidad | Lista de países | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 58 | OPS | Detalle Guardia > Datos | Estado civil | 4-5 opciones | `<select>` nativo | No | No | OK - pocos items |
| 59 | OPS | Detalle Guardia > Datos | Banco | Lista de bancos | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 60 | OPS | Detalle Guardia > Docs | Tipo documento | Tipos de documentos | `<select>` nativo | No | No | OK |
| 61 | OPS | Detalle Guardia > Comunicación | Template email | Templates de email | `<select>` nativo | Posible | No | Evaluar |
| 62 | OPS | Detalle Guardia > Docs Vinculados | Tipo doc vinculado | Tipos de docs | `<select>` nativo | No | No | OK |
| 63 | OPS | TE Ingreso Form | Instalación | Instalaciones activas | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| **OPS - Puestos** | | | | | | | | |
| 64 | OPS | Puestos Operativos | Filtro instalación | Todas las instalaciones | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| **OPS - Pauta Mensual** | | | | | | | | |
| 65 | OPS | Pauta Mensual | Instalación | Todas las instalaciones | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 66 | OPS | Pauta Mensual | Mes/Año | Meses y años | `<select>` nativo | No | No | OK |
| **OPS - Pauta Diaria** | | | | | | | | |
| 67 | OPS | Pauta Diaria | Instalación | Todas las instalaciones | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| **OPS - Marcaciones** | | | | | | | | |
| 68 | OPS | Marcaciones | Instalación | Todas las instalaciones | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| **OPS - Refuerzos** | | | | | | | | |
| 69 | OPS | Refuerzos | Instalación | Todas las instalaciones | `<SearchableSelect>` | **Sí** | **Sí** | OK - ya tiene búsqueda |
| 70 | OPS | Refuerzos > Crear | Guardia | Guardias activos | `<GuardiaSearchInput>` | **Sí** | **Sí** | OK - búsqueda server-side |
| **OPS - PPC** | | | | | | | | |
| 71 | OPS | PPC (Rendimiento) | Período | Meses/períodos | `<select>` nativo | No | No | OK |
| **OPS - Control Nocturno** | | | | | | | | |
| 72 | OPS | Control Nocturno Detalle | Guardia (reemplazo) | Guardias | `<GuardiaSearchInput>` | **Sí** | **Sí** | OK - búsqueda server-side |
| **OPS - Rondas** | | | | | | | | |
| 73 | OPS | Rondas > Templates | Instalación | Instalaciones | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 74 | OPS | Rondas > Template Form | Tipo ronda | 2 opciones (flexible/strict) | `<Select>` shadcn | No | No | OK |
| 75 | OPS | Rondas > Checkpoints | Instalación | Instalaciones | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 76 | OPS | Rondas > Programación | Template | Templates de rondas | `<Select>` shadcn | Posible | No | Evaluar |
| 77 | OPS | Rondas > Programación Form | Instalación | Instalaciones | `<Select>` shadcn | **Sí** | No | **Cambiar a SearchableSelect** |
| **OPS - TE (Turnos Extra)** | | | | | | | | |
| 78 | OPS | TE Lotes | Filtros | Estado, período | `<select>` nativo | No | No | OK |
| 79 | OPS | TE Turnos | Instalación | Instalaciones | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| **OPS - Tickets** | | | | | | | | |
| 80 | OPS | Tickets | Tipo ticket | Tipos de ticket | `<Select>` shadcn | No | No | OK |
| 81 | OPS | Tickets > Crear | Tipo ticket | Tipos de ticket | `<Select>` shadcn | No | No | OK |
| 82 | OPS | Ticket Detalle | Aprobación | Opciones de aprobación | `<Select>` shadcn | No | No | OK |
| **OPS - Guard Events/Contracts** | | | | | | | | |
| 83 | OPS | Guard Events | Tipo evento | Tipos de eventos HR | `<Select>` shadcn | No | No | OK |
| 84 | OPS | Guard Contracts | Template contrato | Templates de documentos | `<Select>` shadcn | Posible | No | Evaluar |
| **OPS - Supervisión** | | | | | | | | |
| 85 | OPS | Nueva Visita | Instalación | Todas las instalaciones | `<Select>` shadcn | **Sí** | No | **Cambiar a SearchableSelect** |
| 86 | OPS | Asignaciones Supervisor | Supervisor | Usuarios supervisores | `<Select>` shadcn | Posible | No | Evaluar |
| **OPS - Shared (Puesto Form Modal)** | | | | | | | | |
| 87 | Shared | Puesto Form Modal | Tipo puesto | Catálogo CPQ puestos | `<select>` nativo | Posible | No | Evaluar |
| 88 | Shared | Puesto Form Modal | Cargo | Catálogo CPQ cargos | `<select>` nativo | Posible | No | Evaluar |
| 89 | Shared | Puesto Form Modal | Rol | Catálogo CPQ roles | `<select>` nativo | Posible | No | Evaluar |
| **Documentos** | | | | | | | | |
| 90 | Docs | Template Editor | Categoría | Categorías de documentos | `<Select>` shadcn | No | No | OK |
| 91 | Docs | Generar Documento | Template | Templates de documentos | `<select>` nativo | Posible | No | Evaluar |
| 92 | Docs | Generar Documento | Guardia | Guardias | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 93 | Docs | Firma > Solicitar | Contacto/firmante | Contactos | `<select>` nativo | Posible | No | Evaluar |
| 94 | Docs | Firma > Tipo letra | Fuentes de firma | `<select>` nativo | No | No | OK |
| 95 | Docs | Categorías | Tipo categoría | Tipos estáticos | `<Select>` shadcn | No | No | OK |
| 96 | Docs | Detalle Doc | Estado | Estados del documento | `<Select>` shadcn | No | No | OK |
| 97 | Docs | Editor Toolbar | Fuente | Fuentes tipográficas | `<Select>` shadcn | No | No | OK |
| 98 | Docs | Editor Toolbar | Tamaño | Tamaños de fuente | `<Select>` shadcn | No | No | OK |
| **Finanzas** | | | | | | | | |
| 99 | Finanzas | Facturación | Tipo DTE | Tipos de documento tributario | `<Select>` shadcn | No | No | OK |
| 100 | Finanzas | DTE Form | Cliente/Receptor | Cuentas o proveedores | `<Select>` shadcn | **Sí** | No | **Cambiar a SearchableSelect** |
| 101 | Finanzas | DTE Form | Producto/Servicio | Items facturables | `<Select>` shadcn | **Sí** | No | **Cambiar a SearchableSelect** |
| 102 | Finanzas | Nota de Crédito | DTE referencia | DTEs emitidos | `<Select>` shadcn | **Sí** | No | **Cambiar a SearchableSelect** |
| 103 | Finanzas | Rendiciones | Estado filtro | Estados de rendición | `<Select>` shadcn | No | No | OK |
| 104 | Finanzas | Rendición Form | Instalación | Instalaciones | `<Select>` shadcn | **Sí** | No | **Cambiar a SearchableSelect** |
| 105 | Finanzas | Rendición Form | Centro de costo | Centros de costo | `<Select>` shadcn | Posible | No | Evaluar |
| 106 | Finanzas | Rendición Form | Categoría gasto | Categorías de gasto | `<Select>` shadcn | No | No | OK |
| 107 | Finanzas | Proveedores | Tipo proveedor | Tipos estáticos | `<Select>` shadcn | No | No | OK |
| 108 | Finanzas | Pagos Proveedores | Proveedor | Todos los proveedores | `<Select>` shadcn | **Sí** | No | **Cambiar a SearchableSelect** |
| 109 | Finanzas | Bancos | Banco | Lista de bancos | `<Select>` shadcn | **Sí** | No | **Cambiar a SearchableSelect** |
| 110 | Finanzas | Conciliación | Cuenta bancaria | Cuentas bancarias | `<Select>` shadcn | Posible | No | Evaluar |
| 111 | Finanzas | Contabilidad | Período contable | Períodos | `<Select>` shadcn | No | No | OK |
| 112 | Finanzas | Journal Entry Form | Cuenta contable | Plan de cuentas | `<Select>` shadcn | **Sí** | No | **Cambiar a SearchableSelect** |
| 113 | Finanzas | Config | Varios | Configuraciones estáticas | `<Select>` shadcn | No | No | OK |
| **Payroll** | | | | | | | | |
| 114 | Payroll | Período List | Período | Períodos de nómina | `<select>` nativo | No | No | OK |
| 115 | Payroll | Anticipos | Período | Períodos | `<select>` nativo | No | No | OK |
| 116 | Payroll | Sueldos RUT | Guardia | Guardias con liquidación | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 117 | Payroll | Bonos Catálogo | Tipo bono | Tipos de bonos | `<select>` nativo | No | No | OK |
| 118 | Payroll | Holidays | Tipo feriado | Tipos | `<select>` nativo | No | No | OK |
| **Inventario** | | | | | | | | |
| 119 | Inventario | Entregas | Guardia | Guardias (búsqueda) | `<SearchableSelect>` | **Sí** | **Sí** | OK - ya tiene búsqueda |
| 120 | Inventario | Entregas | Producto/Variante | Productos del catálogo | `<SearchableSelect>` | **Sí** | **Sí** | OK - ya tiene búsqueda |
| 121 | Inventario | Entregas | Instalación | Instalaciones | `<SearchableSelect>` | **Sí** | **Sí** | OK - ya tiene búsqueda |
| 122 | Inventario | Activos | Guardia | Guardias | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 123 | Inventario | Activos | Instalación | Instalaciones | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 124 | Inventario | Compras | Proveedor | Proveedores | `<select>` nativo | **Sí** | No | **Cambiar a SearchableSelect** |
| 125 | Inventario | Productos | Categoría | Categorías de productos | `<Select>` shadcn | No | No | OK |
| 126 | Inventario | Bodegas | Tipo bodega | Tipos | `<Select>` shadcn | No | No | OK |
| **Configuración** | | | | | | | | |
| 127 | Config | Usuarios > Invitar | Rol | Templates de roles | `<Select>` shadcn | No | No | OK |
| 128 | Config | Usuarios > Tabla | Rol (editar) | Templates de roles | `<Select>` shadcn | No | No | OK |
| 129 | Config | Grupos | Miembros | Usuarios del sistema | `<Select>` shadcn | Posible | No | Evaluar |
| 130 | Config | Roles Templates | Permisos | Permisos del sistema | Checkboxes | N/A | N/A | OK |
| 131 | Config | Email Templates | Categoría | Categorías | `<select>` nativo | No | No | OK |
| 132 | Config | Ticket Types | Aprobadores | Usuarios | `<Select>` shadcn | Posible | No | Evaluar |
| **Otros** | | | | | | | | |
| 133 | Notificaciones | Preferencias | Canal por tipo | On/Off por tipo | Toggles | N/A | N/A | OK |
| 134 | AI Chat | Chat Widget | Nada | N/A | N/A | N/A | N/A | OK |
| 135 | Portal Guardia | Portal | Varios filtros | Períodos, estados | `<select>` nativo | No | No | OK |
| 136 | Público | Postulación | Comuna | Comunas de Chile | `<select>` nativo | **Sí** (346) | No | **Cambiar a SearchableSelect** |
| 137 | Público | Postulación | Región | Regiones de Chile | `<select>` nativo | Sí (16) | No | OK - lista corta |
| 138 | Shared | Sort Select | Ordenar por | Opciones de orden | `<select>` nativo | No | No | OK |

---

### Resumen Estadístico (Parte B)

| Métrica | Valor |
|---------|-------|
| **Total de selectores encontrados** | ~138 |
| **Select nativo HTML `<select>`** | ~85 (62%) |
| **Select shadcn/Radix `<Select>`** | ~45 (33%) |
| **SearchableSelect (con búsqueda)** | 4 (3%) |
| **GuardiaSearchInput (búsqueda API)** | 2 (1%) |
| **Selectores que NECESITAN búsqueda** (>10 items dinámicos sin filtro) | **~30** |
| **Selectores que YA TIENEN búsqueda** | 6 |

### Selectores Críticos que Requieren SearchableSelect (Prioridad Alta)

Estos selectores manejan datos que crecen con el uso y **definitivamente** tendrán más de 10 items:

| Prioridad | Selector | Módulo | Archivo |
|-----------|----------|--------|---------|
| P1 | **Cuenta (Account)** en Cotización | CPQ | `CpqQuoteDetail.tsx` |
| P1 | **Cuenta** en Nuevo Contacto | CRM | `CrmContactsClient.tsx` |
| P1 | **Cuenta** en Nuevo Negocio | CRM | `CrmDealsClient.tsx` |
| P1 | **Cuenta** en Nueva Instalación | CRM | `CrmInstallationsListClient.tsx` |
| P1 | **Instalación** en Cotización | CPQ | `CpqQuoteDetail.tsx` |
| P1 | **Instalación** en Pauta Mensual | OPS | `OpsPautaMensualClient.tsx` |
| P1 | **Instalación** en Pauta Diaria | OPS | `OpsPautaDiariaClient.tsx` |
| P1 | **Instalación** en Marcaciones | OPS | `OpsMarcacionesClient.tsx` |
| P1 | **Instalación** en Rendición | Finanzas | `RendicionForm.tsx` |
| P2 | **Contacto** en Cotización | CPQ | `CpqQuoteDetail.tsx` |
| P2 | **Contacto** en Vincular a Deal | CRM | `CrmDealDetailClient.tsx` |
| P2 | **Guardia** en Sueldos RUT | Payroll | `SueldosRutListClient.tsx` |
| P2 | **Guardia** en Generar Documento | Docs | `DocGenerateClient.tsx` |
| P2 | **Guardia** en Activos Inventario | Inventario | `InventarioActivosClient.tsx` |
| P2 | **Proveedor** en Pagos | Finanzas | `PagosProveedoresClient.tsx` |
| P2 | **Cuenta contable** en Asientos | Finanzas | `JournalEntryForm.tsx` |
| P2 | **DTE referencia** en Nota Crédito | Finanzas | `CreditNoteForm.tsx` |
| P2 | **Comuna** en Postulación | Público | `PostulacionPublicForm.tsx` |
| P3 | **Industria** en Cuenta/Lead | CRM | `CrmAccountsClient.tsx`, `CrmLeadDetailClient.tsx` |
| P3 | **Banco** en datos guardia | OPS | `GuardiaDetailClient.tsx` |
| P3 | **Instalación** en Rondas | OPS | Varios componentes de rondas |
| P3 | **Instalación** en TE Turnos | OPS | `TeTurnosClient.tsx` |
| P3 | **Instalación** en Supervisión | OPS | `SupervisionNewVisitFlow.tsx` |

---

## PARTE C: Barra de Navegación del CRM

### Archivo de configuración:
`src/lib/module-nav.ts` (líneas 90-97)

### Orden ACTUAL:

```
1. Leads        (icon: Users,      href: /crm/leads)
2. Cuentas      (icon: Building2,  href: /crm/accounts)
3. Instalaciones (icon: MapPin,    href: /crm/installations)
4. Negocios     (icon: TrendingUp, href: /crm/deals)       ← posición 4
5. Contactos    (icon: Contact,    href: /crm/contacts)     ← posición 5
6. Cotizaciones (icon: DollarSign, href: /crm/cotizaciones)
```

### Orden DESEADO:

```
1. Leads         ✅ correcto
2. Cuentas       ✅ correcto
3. Instalaciones ✅ correcto
4. Contactos     ❌ actualmente en posición 5
5. Negocios      ❌ actualmente en posición 4
6. Cotizaciones  ✅ correcto
```

### Cambio requerido:
**Intercambiar posiciones 4 y 5**: Mover "Contactos" antes de "Negocios" en el array `CRM_ITEMS` de `src/lib/module-nav.ts`.

### Componentes que usan esta navegación:
- `src/components/opai/BottomNav.tsx` - Barra inferior mobile (oculta en lg+)
- `src/components/crm/CrmSectionNav.tsx` - Wrapper de navegación CRM
- `src/components/opai/SectionNav.tsx` - Componente genérico de navegación por secciones

### Nota sobre iconos:
Los iconos se definen también en `src/components/crm/CrmModuleIcons.ts`:

| Módulo | Label | Icon | Color |
|--------|-------|------|-------|
| Leads | Leads | Users | emerald-500 |
| Accounts | Cuentas | Building2 | blue-500 |
| Installations | Instalaciones | MapPin | teal-500 |
| Contacts | Contactos | UserCircle | sky-500 |
| Deals | Negocios | TrendingUp | purple-500 |
| Quotes | Cotizaciones | DollarSign | amber-500 |

---

## RESUMEN EJECUTIVO

### Hallazgos Críticos

1. **Relaciones faltantes en vistas de detalle:**
   - Instalación no muestra Contactos asociados
   - Contacto no muestra Instalaciones ni Cotizaciones
   - Negocio no permite crear contactos nuevos (solo vincular existentes)

2. **Selectores sin búsqueda:**
   - ~30 selectores manejan datos que crecen dinámicamente y no tienen filtro/búsqueda
   - Ya existe un componente `SearchableSelect` listo para usar (usado en solo 3 archivos)
   - Ya existe `GuardiaSearchInput` para búsqueda server-side de guardias (usado en 2 archivos)
   - El 95% de los selectores son `<select>` nativo o `<Select>` shadcn sin búsqueda

3. **Navegación CRM:**
   - Contactos y Negocios están en orden invertido respecto al deseado
   - Cambio simple: intercambiar dos líneas en `module-nav.ts`
