# CPQ-AUDIT.md — Auditoría completa del módulo CPQ

> Generado: 2026-03-13
> Propósito: Documentar el estado actual antes de cualquier refactorización.

---

## 1. Lista completa de archivos del CPQ

### Componentes UI (`src/components/cpq/`) — 26 archivos, ~8,500 líneas

| Archivo | Líneas | Función |
|---------|--------|---------|
| `index.ts` | 7 | Barrel exports |
| `utils.ts` | 41 | Helpers de formato (formatCurrency, formatWeekdaysShort) |
| `CpqQuotesList.tsx` | 90 | Lista de cotizaciones |
| `MobileBottomBar.tsx` | 100 | Barra sticky inferior mobile con resumen + acciones |
| `CpqIndicators.tsx` | 117 | KPIs del dashboard CPQ |
| `CpqConfigTabs.tsx` | 120 | Tabs de configuración catálogo |
| `MarginSection.tsx` | 135 | Slider/input de margen % |
| `QuoteNotesDrawer.tsx` | 137 | Drawer lateral con notas de la cotización |
| `QuoteKpiBar.tsx` | 160 | Barra KPI superior (guardias, costo, margen) |
| `CpqDashboard.tsx` | 177 | Dashboard principal CPQ |
| `QuoteAttachmentsSection.tsx` | 203 | Upload/listado de adjuntos |
| `CpqPositionCard.tsx` | 204 | Tarjeta de puesto de trabajo |
| `CreateQuoteModal.tsx` | 216 | Modal crear cotización nueva |
| `CostBreakdownModal.tsx` | 224 | Modal desglose de costos |
| `CreatePositionModal.tsx` | 305 | Modal agregar puesto |
| `EditPositionModal.tsx` | 313 | Modal editar puesto |
| `FollowUpDecisionModal.tsx` | 336 | Modal decisión post-envío (crear draft, etc.) |
| `SendPdfEmailModal.tsx` | 341 | Modal enviar PDF por email |
| `SendCpqQuoteModal.tsx` | 409 | Modal enviar cotización al portal |
| `CpqSimpleCatalogConfig.tsx` | 437 | Config catálogo simplificada |
| `DatosSection.tsx` | 523 | Sección datos generales (cliente, CRM, instalación) |
| `QuoteBreakdownPanel.tsx` | 668 | Panel desglose transparente (compartido portal + CPQ) |
| `CpqCatalogConfig.tsx` | 732 | Config completa del catálogo |
| `FinancialPanel.tsx` | 893 | Panel lateral financiero (desglose + preview + AI + send) |
| `CpqQuoteCosts.tsx` | 1,408 | Panel de costos completo (uniformes, exámenes, comidas, vehículos, infra, costos) |
| `CpqQuoteDetail.tsx` | 1,761 | Vista detalle principal de cotización |

### Motor de cálculo (`src/modules/cpq/`) — 1 archivo, 363 líneas

| Archivo | Líneas | Función |
|---------|--------|---------|
| `costing/compute-quote-costs.ts` | 363 | Motor central de cálculo de costos |

### API Routes (`src/app/api/cpq/`) — 26 archivos, ~4,800 líneas

| Archivo | Líneas | Función |
|---------|--------|---------|
| `cargos/route.ts` | 81 | CRUD cargos |
| `cargos/[id]/route.ts` | 101 | GET/PUT/DELETE cargo |
| `catalog/route.ts` | 76 | GET/POST catálogo |
| `catalog/[id]/route.ts` | 97 | GET/PUT/DELETE item catálogo |
| `puestos/route.ts` | 80 | CRUD puestos de trabajo |
| `puestos/[id]/route.ts` | 100 | GET/PUT/DELETE puesto |
| `roles/route.ts` | 86 | CRUD roles |
| `roles/[id]/route.ts` | 107 | GET/PUT/DELETE rol |
| `settings/route.ts` | 109 | Config CPQ (feriados, etc.) |
| `quotes/route.ts` | 107 | GET/POST cotizaciones |
| `quotes/[id]/route.ts` | 169 | GET/PUT/DELETE cotización |
| `quotes/[id]/attachments/route.ts` | 130 | Upload adjuntos |
| `quotes/[id]/attachments/[attachmentId]/route.ts` | 47 | DELETE adjunto |
| `quotes/[id]/clone/route.ts` | 247 | Clonar cotización |
| `quotes/[id]/costs/route.ts` | 818 | GET/PUT costos (el más complejo) |
| `quotes/[id]/create-draft/route.ts` | 330 | Crear borrador desde cotización |
| `quotes/[id]/export-pdf/route.ts` | 47 | Exportar PDF |
| `quotes/[id]/margin/route.ts` | 54 | Actualizar margen |
| `quotes/[id]/positions/route.ts` | 132 | GET/POST posiciones |
| `quotes/[id]/positions/[positionId]/route.ts` | 181 | GET/PUT/DELETE posición |
| `quotes/[id]/positions/[positionId]/clone/route.ts` | 70 | Clonar posición |
| `quotes/[id]/send-email/route.ts` | 241 | Enviar por email directo |
| `quotes/[id]/send-pdf-email/route.ts` | 257 | Enviar PDF por email |
| `quotes/[id]/send-portal/route.ts` | 617 | Enviar al portal del cliente |
| `quotes/[id]/send-presentation/route.ts` | 461 | Enviar como presentación |
| `quotes/[id]/send-to-installation/route.ts` | 190 | Enviar dotación a instalación |

### Páginas App Router (`src/app/(app)/cpq/`) — 5 archivos

| Archivo | Líneas | Función |
|---------|--------|---------|
| `page.tsx` | 9 | Página principal CPQ |
| `config/page.tsx` | 5 | Página configuración |
| `[id]/page.tsx` | 14 | Detalle cotización |
| `quotes/page.tsx` | 10 | Lista cotizaciones |
| `quotes/[id]/page.tsx` | 15 | Detalle cotización (ruta alternativa) |

### Portal del cliente (`src/components/portal/cliente/`) — 8 archivos cotizaciones, ~1,568 líneas

| Archivo | Líneas | Función |
|---------|--------|---------|
| `PortalCotizaciones.tsx` | 409 | Vista principal de cotizaciones en portal |
| `cotizaciones/types.ts` | 160 | Tipos + helpers (status, formateo, agrupación) |
| `cotizaciones/GardServiceIncludes.tsx` | 50 | Lista "el servicio incluye" (hardcoded Gard) |
| `cotizaciones/WhatsAppButton.tsx` | 71 | Botón WhatsApp con número hardcoded |
| `cotizaciones/CotizacionApproveDialog.tsx` | 111 | Diálogo aprobación |
| `cotizaciones/CotizacionRejectDialog.tsx` | 113 | Diálogo rechazo |
| `cotizaciones/DashboardCotizacionesPendientes.tsx` | 192 | Widget pendientes en dashboard |
| `cotizaciones/CotizacionCard.tsx` | 462 | Tarjeta de cotización expandible |

### API Portal cotizaciones (`src/app/api/portal/cliente/cotizaciones/`) — 6 archivos, 732 líneas

| Archivo | Líneas | Función |
|---------|--------|---------|
| `route.ts` | 114 | GET lista cotizaciones del portal |
| `[id]/route.ts` | 296 | GET detalle cotización portal |
| `[id]/approve/route.ts` | 62 | POST aprobar |
| `[id]/reject/route.ts` | 45 | POST rechazar |
| `[id]/accept-proposal/route.ts` | 164 | POST aceptar propuesta (contrato) |
| `[id]/pdf/route.ts` | 51 | GET generar PDF |

### PDF (`src/lib/pdf/`) — 6 archivos, ~2,515 líneas

| Archivo | Líneas | Función |
|---------|--------|---------|
| `core/register-fonts.ts` | 36 | Registro de fuentes PDF |
| `core/theme.ts` | 33 | Colores y spacing del PDF |
| `core/components.tsx` | 483 | Componentes reutilizables (header, footer, tabla, etc.) |
| `templates/quotation/build-quotation-props.ts` | 354 | Construye props para el PDF desde la BD |
| `templates/quotation/render-quotation.ts` | 826 | Render alternativo (React.createElement directo, sin JSX) |
| `templates/quotation/QuotationPDF.tsx` | 777 | Componente PDF React-PDF (JSX) |

### Libs compartidas (`src/lib/`) — 5 archivos, ~1,237 líneas

| Archivo | Líneas | Función |
|---------|--------|---------|
| `cpq-constants.ts` | 33 | Constantes (uniformes por defecto) |
| `cpq-mapper.ts` | 669 | Mapper CPQ → PresentationPayload |
| `tenant-config.ts` | 248 | Configuración empresa por tenant (con defaults Gard) |
| `crm-deal-active-quotation.ts` | 156 | Lógica cotización activa en deal CRM |
| `__tests__/crm-deal-active-quotation.test.ts` | 131 | Tests |

### Tipos (`src/types/`) — 2 archivos, 338 líneas

| Archivo | Líneas | Función |
|---------|--------|---------|
| `cpq.ts` | 267 | Todos los tipos CPQ (Quote, Position, Catalog, Parameters, etc.) |
| `cpq-breakdown.ts` | 71 | Tipos desglose transparente (PositionBreakdownItem, QuoteBreakdownData) |

### Emails — 1 archivo

| Archivo | Líneas | Función |
|---------|--------|---------|
| `src/emails/CpqQuoteEmail.tsx` | 302 | Template email cotización |

### CRM integración — 2 archivos

| Archivo | Líneas | Función |
|---------|--------|---------|
| `src/app/(app)/crm/cotizaciones/page.tsx` | 168 | Lista cotizaciones vista CRM |
| `src/app/(app)/crm/cotizaciones/[id]/page.tsx` | 66 | Detalle cotización vista CRM |
| `src/components/crm/CrmCotizacionesClient.tsx` | 437 | Componente lista CRM |

### TOTAL: ~89 archivos, ~20,700 líneas

---

## 2. Hardcodes de Gard encontrados

### En archivos del módulo CPQ directamente

| Archivo | Línea | Hardcode | Tipo |
|---------|-------|----------|------|
| `src/components/cpq/CpqQuoteDetail.tsx` | 118 | `useState("comercial@gard.cl")` | Email CC default |
| `src/components/cpq/FinancialPanel.tsx` | 477 | `GARD SECURITY` | Nombre en preview |
| `src/components/cpq/FinancialPanel.tsx` | 675 | `www.gard.cl` | Website en preview |
| `src/lib/pdf/templates/quotation/QuotationPDF.tsx` | 383 | `'GARD SECURITY'` fallback en header P3 | Nombre empresa |
| `src/lib/pdf/templates/quotation/QuotationPDF.tsx` | 636 | `'GARD SECURITY'` fallback en header P1 | Nombre empresa |
| `src/lib/pdf/templates/quotation/QuotationPDF.tsx` | 697 | `'GARD SECURITY'` fallback en header P2 | Nombre empresa |
| `src/lib/pdf/templates/quotation/render-quotation.ts` | 417 | `'GARD SECURITY'` brandName fallback | Nombre empresa |
| `src/app/api/cpq/quotes/[id]/send-email/route.ts` | 123 | `"https://app.gardsecurity.cl"` | URL fallback |
| `src/app/api/cpq/quotes/[id]/send-email/route.ts` | 149 | Subject con "Gard Security" | Nombre empresa |
| `src/app/api/cpq/quotes/[id]/send-portal/route.ts` | 213,390,395,414,539 | `opai.gard.cl`, `comercial@gard.cl` | URLs y emails |
| `src/app/api/portal/cliente/cotizaciones/[id]/accept-proposal/route.ts` | 113,122 | `to: "comercial@gard.cl"` | Email destino |
| `src/emails/CpqQuoteEmail.tsx` | 58-60 | URLs y `comercial@gard.cl` | Email template |
| `src/lib/cpq-mapper.ts` | 665 | `instagram.com/gardsecuritycl/` | Red social |

### En `tenant-config.ts` (fuente central de defaults)

| Línea | Hardcode | Campo |
|-------|----------|-------|
| 68 | `"Gard SpA"` | razonSocial |
| 69 | `"77.840.623-3"` | rut |
| 73 | `"+56 98 230 7771"` | telefono |
| 77 | `"Gard SpA"` | companyName |
| 78 | `"Gard Security"` | commercialName |
| 79 | `"GARD"` | brandNameUpper |
| 80 | `"www.gard.cl"` | website |
| 94 | `"comercial@gard.cl"` | email |
| 95 | `"operaciones@gard.cl"` | emailOps |
| 96 | `"contacto@gard.cl"` | emailContact |
| 98 | `"56982307771"` | phoneRaw |
| 99 | `"https://wa.me/56982307771"` | whatsappLink |
| 101 | `"opai@gard.cl"` | emailFrom |
| 103 | `"opai@gard.cl"` | emailFromAddress |
| 104 | `"comercial@gard.cl"` | emailReplyTo |

### En portal del cliente

| Archivo | Línea | Hardcode |
|---------|-------|----------|
| `cotizaciones/WhatsAppButton.tsx` | 25,35,68 | `wa.me/56982307771`, `+56 9 8230 7771` |
| `cotizaciones/GardServiceIncludes.tsx` | todo | Lista hardcoded de servicios |
| `PortalDashboard.tsx` | múltiples | "Gard Security", "Gard" como fallback |

---

## 3. Modelos Prisma — campos clave y relaciones

### Schema: `cpq` (15 modelos)

```
CpqQuote (tabla: quotes)
├── id: UUID (PK)
├── tenantId: String
├── code: String (UNIQUE)
├── name, status ("draft"|"sent"|"approved"|"rejected"), clientName
├── validUntil, notes, currency ("CLP"|"UF")
├── totalPositions, totalGuards, monthlyCost
├── CRM: accountId?, contactId?, dealId?, installationId?, createdFromLeadId?
├── AI: aiDescription?, serviceDetail?
├── Commercial: paymentTerms, serviceStartDays, contractDuration, includedItems[]
│
├── → CpqPosition[] (1:N, cascade delete)
├── → CpqQuoteParameters? (1:1, cascade delete)
├── → CpqQuoteUniformItem[] (1:N, cascade delete)
├── → CpqQuoteExamItem[] (1:N, cascade delete)
├── → CpqQuoteCostItem[] (1:N, cascade delete)
├── → CpqQuoteMeal[] (1:N, cascade delete)
├── → CpqQuoteVehicle[] (1:N, cascade delete)
├── → CpqQuoteInfrastructure[] (1:N, cascade delete)
├── → CpqQuoteAdditionalLine[] (1:N, cascade delete)
├── → CpqQuoteAttachment[] (1:N, cascade delete)
└── → CrmInstallation? (FK)

CpqPosition (tabla: positions)
├── id, quoteId (FK→CpqQuote)
├── puestoTrabajoId (FK→CpqPuestoTrabajo), customName, description
├── weekdays[], startTime, endTime, numGuards, numPuestos
├── cargoId (FK→CpqCargo), rolId (FK→CpqRol)
├── baseSalary, afpName, healthSystem, healthPlanPct
├── employerCost, netSalary, monthlyPositionCost
├── payrollSnapshot (JSONB), payrollVersionId, calculatedAt
└── → CpqPuestoTrabajo, CpqCargo, CpqRol

CpqPuestoTrabajo (tabla: puestos_trabajo)
├── id, name (UNIQUE), colorHex, active
└── → CpqPosition[], OpsPuestoOperativo[]

CpqCargo (tabla: cargos)
├── id, name (UNIQUE), description, colorHex, active
└── → CpqPosition[], OpsPuestoOperativo[]

CpqRol (tabla: roles)
├── id, name (UNIQUE), description, colorHex
├── patternWork?, patternOff?, active
└── → CpqPosition[], OpsPuestoOperativo[]

CpqCatalogItem (tabla: catalog_items)
├── id, tenantId?, type, name, unit, basePrice
├── isDefault, defaultVisibility, active
└── → CpqQuoteUniformItem[], CpqQuoteExamItem[], CpqQuoteCostItem[]

CpqQuoteParameters (tabla: quote_parameters)
├── id, quoteId (UNIQUE FK→CpqQuote)
├── monthlyHoursStandard (180), avgStayMonths (4), uniformChangesPerYear (3)
├── financialEnabled, financialRatePct (2.5), salePriceBase, salePriceMonthly
├── policyEnabled, policyRatePct, policyAdminRatePct
├── policyContractMonths (12), policyContractPct (100)
├── contractMonths (12), contractAmount, marginPct (13)
└── → CpqQuote

CpqQuoteUniformItem (tabla: quote_uniform_items)
├── id, quoteId, catalogItemId, unitPriceOverride?, active
└── → CpqQuote, CpqCatalogItem

CpqQuoteExamItem (tabla: quote_exam_items)
├── id, quoteId, catalogItemId, unitPriceOverride?, active
└── → CpqQuote, CpqCatalogItem

CpqQuoteCostItem (tabla: quote_cost_items)
├── id, quoteId, catalogItemId
├── calcMode ("per_month"|"per_guard"), quantity, unitPriceOverride?
├── isEnabled, visibility, notes?
└── → CpqQuote, CpqCatalogItem

CpqQuoteMeal (tabla: quote_meals)
├── id, quoteId, mealType, mealsPerDay, daysOfService
├── priceOverride?, isEnabled, visibility
└── → CpqQuote

CpqQuoteVehicle (tabla: quote_vehicles)
├── id, quoteId, vehiclesCount, rentMonthly
├── kmPerDay, daysPerMonth, kmPerLiter, fuelPrice, maintenanceMonthly
├── isEnabled, visibility
└── → CpqQuote

CpqQuoteInfrastructure (tabla: quote_infrastructure)
├── id, quoteId, itemType, quantity, rentMonthly
├── hasFuel, fuelLitersPerHour, fuelHoursPerDay, fuelDaysPerMonth, fuelPrice
├── isEnabled, visibility
└── → CpqQuote

CpqQuoteAdditionalLine (tabla: quote_additional_lines)
├── id, quoteId, nombre, descripcion?, precio, orden
└── → CpqQuote

CpqQuoteAttachment (tabla: quote_attachments)
├── id, quoteId, tenantId, fileName, mimeType, size
├── storageKey, publicUrl?
└── → CpqQuote
```

### Relaciones CRM relevantes

```
CrmDealQuote (tabla: deal_quotes, schema: crm)
├── dealId → CrmDeal
├── quoteId → CpqQuote (sin FK explícita en Prisma)
└── UNIQUE(dealId, quoteId)

CrmLead.id ← CpqQuote.createdFromLeadId (sin relación explícita)
```

### Observaciones

- **No hay enums**: Los estados son `String` (`"draft"`, `"sent"`, `"approved"`, `"rejected"`)
- **No hay modelo Proposal**: Las propuestas son cotizaciones enviadas al portal
- **Tenant no tiene relación directa con CPQ**: `CpqQuote.tenantId` es un String sin FK al modelo `Tenant`

---

## 4. Fórmula de cálculo actual (textual de `compute-quote-costs.ts`)

### Paso 1: Datos de entrada

```
Se cargan en paralelo desde Prisma:
- positions (numGuards, numPuestos, monthlyPositionCost)
- parameters (CpqQuoteParameters)
- uniformItems (con catalogItem)
- examItems (con catalogItem)
- costItems (con catalogItem)
- meals
- vehicles
- infrastructure
- catalogItems (activos, del tenant o globales)
```

### Paso 2: Totales de guardias y posiciones

```
totalGuards = Σ(position.numGuards × position.numPuestos)
monthlyPositions = Σ(position.monthlyPositionCost)
```

### Paso 3: Ajuste de feriados

```
Inputs:
  - holidayAnnualCount = Setting("cpq.holidayAnnualCount") ?? 12
  - holidayCommercialBufferPct = Setting("cpq.holidayCommercialBufferPct") ?? 10

holidayMonthlyFactor = holidayAnnualCount / 12
holidayCommercialFactor = 1 + holidayCommercialBufferPct / 100
monthlyHolidayAdjustment = (monthlyPositions / 30) × 0.5 × holidayMonthlyFactor × holidayCommercialFactor
```

### Paso 4: Uniformes

```
uniformChangesPerYear = parameters.uniformChangesPerYear ?? 3

Para cada uniform item activo:
  unitPrice = normalizeUnitPrice(override ?? basePrice, unit)
  // normalizeUnitPrice: si unit contiene "año"/"year" → /12, si "semestre"/"semester" → /6

uniformSetCost = Σ(unitPrice por cada uniforme activo)
monthlyUniforms = totalGuards > 0 ? (uniformSetCost × uniformChangesPerYear / 12) × totalGuards : 0
```

### Paso 5: Exámenes

```
avgStayMonths = parameters.avgStayMonths ?? 4
examEntriesPerYear = avgStayMonths > 0 ? 12 / avgStayMonths : 0
examFrequency = max(examEntriesPerYear, uniformChangesPerYear)

examSetCost = Σ(unitPrice por cada examen activo)
monthlyExams = totalGuards > 0 ? (examSetCost × examFrequency / 12) × totalGuards : 0
```

### Paso 6: Costos operativos (sin financial/policy)

```
Para cada costItem habilitado (excluye type "financial" y "policy"):
  unitPrice = normalizeUnitPrice(override ?? basePrice, unit)
  if calcMode == "per_guard":
    monthlyCostItems += unitPrice × quantity × totalGuards
  else:
    monthlyCostItems += unitPrice × quantity
```

### Paso 7: Comidas

```
Para cada meal habilitada:
  price = normalizeUnitPrice(override ?? catalogBasePrice, unit)
  monthlyMeals += price × mealsPerDay × daysOfService
```

### Paso 8: Vehículos

```
Para cada vehículo habilitado:
  liters = kmPerLiter > 0 ? (kmPerDay × daysPerMonth) / kmPerLiter : 0
  fuelCost = liters × fuelPrice
  vehicleMonthly = rentMonthly + maintenanceMonthly + fuelCost
  monthlyVehicles += vehicleMonthly × vehiclesCount
```

### Paso 9: Infraestructura

```
Para cada infra habilitada:
  base = rentMonthly
  fuelCost = hasFuel ? (fuelLitersPerHour × fuelHoursPerDay × fuelDaysPerMonth × fuelPrice) : 0
  monthlyInfrastructure += (base + fuelCost) × quantity
```

### Paso 10: Subtotal base

```
costsBase = monthlyPositions
           + monthlyHolidayAdjustment
           + monthlyUniforms
           + monthlyExams
           + monthlyMeals
           + monthlyVehicles
           + monthlyInfrastructure
           + monthlyCostItems
```

### Paso 11: Margen

```
marginPct = (parameters.marginPct ?? 13) / 100

// FÓRMULA CLAVE: Margen sobre precio de venta (no sobre costo)
baseWithMargin = marginPct < 1 ? costsBase / (1 - marginPct) : costsBase
```

### Paso 12: Financiero

```
financialEnabled = true  // SIEMPRE habilitado en el motor
financialRatePct = (parameters.financialRatePct ?? 2.5) / 100
salePriceBase = parameters.salePriceBase ?? 0
effectiveSalePriceBase = salePriceBase > 0 ? salePriceBase : baseWithMargin

monthlyFinancial = financialEnabled && effectiveSalePriceBase > 0
                   ? effectiveSalePriceBase × financialRatePct
                   : 0
```

### Paso 13: Póliza de garantía

```
policyEnabled = parameters.policyEnabled ?? false
policyRatePct = (parameters.policyRatePct ?? 0) / 100
policyContractMonths = parameters.policyContractMonths ?? 12
policyContractPct = (parameters.policyContractPct ?? 20) / 100

montoAnual = effectiveSalePriceBase × policyContractMonths
valorGarantia = montoAnual × policyContractPct
monthlyPolicy = policyEnabled && effectiveSalePriceBase > 0
                ? (valorGarantia × policyRatePct) / 12
                : 0
```

### Paso 14: Totales

```
baseExtras = monthlyHolidayAdjustment + monthlyUniforms + monthlyExams
           + monthlyMeals + monthlyVehicles + monthlyInfrastructure + monthlyCostItems
monthlyExtras = baseExtras + monthlyFinancial + monthlyPolicy
monthlyTotal = monthlyPositions + monthlyExtras
```

### Notas importantes sobre la fórmula

1. **El margen es sobre precio de venta**: `costsBase / (1 - marginPct)`, NO `costsBase × (1 + marginPct)`
2. **Financial siempre habilitado** en el motor (`financialEnabled = true`), aunque el UI permite deshabilitarlo
3. **salePriceBase manual**: Si el usuario ingresa un precio venta base, se usa ese en vez del calculado para financial/policy
4. **skipDefaultCosts**: Si la quote viene de un Lead (`createdFromLeadId`), no se agregan defaults del catálogo
5. **Defaults del catálogo se mergean**: Items del catálogo marcados como `isDefault` se agregan automáticamente si no existen en la quote
6. **La fórmula se duplica** en `costs/route.ts` (GET handler) — duplicación que debe eliminarse

---

## 5. Cómo se genera el PDF hoy

### Flujo completo

```
1. Usuario hace click en "Descargar PDF" o "Enviar por email"

2. Se llama al API:
   - /api/cpq/quotes/[id]/export-pdf (descarga directa)
   - /api/cpq/quotes/[id]/send-pdf-email (envío por email)

3. Ambas rutas llaman a:
   buildQuotationProps(quoteId, tenantId)  // build-quotation-props.ts

4. buildQuotationProps():
   a. Carga la quote con positions, parameters, installation
   b. Carga contacto y deal del CRM
   c. Carga additional lines
   d. Llama a computeCpqQuoteCosts(quoteId) para el summary
   e. Calcula precios de venta por posición (proporcional a totalPositionCosts)
   f. Carga getTenantCompanyConfig(tenantId)
   g. Construye el breakdown (QuoteBreakdownData) si hay summary
   h. Retorna QuotationPDFProps + fileName

5. Dos sistemas de render paralelos:
   a. QuotationPDF.tsx — Componente JSX con @react-pdf/renderer
   b. render-quotation.ts — Versión con React.createElement directo
      (necesaria por incompatibilidad React instance de Next.js SWC vs react-pdf)

6. Estructura del PDF:
   - Página 1: Propuesta económica (tabla puestos + total)
   - Página 2: Condiciones comerciales + firma + contacto
   - Página 3: Estructura de costos transparente (opcional, si hay breakdown)
```

### Props del PDF (`QuotationPDFProps`)

```typescript
{
  quote: { code, name?, validUntil?, currency, createdAt }
  client: { name, accountName?, dealName?, installationName? }
  positions: [{ name, guards, quantity, days, schedule, monthlyValue }]
  additionalServices: [{ product, description, monthlyValue }]
  totals: { subtotalGuards, subtotalAdditional, totalNet }
  conditions: { paymentTerms, serviceStartDays, contractDuration }
  companyConfig: { commercialName, companyName, email, phone, website, repLegalNombre? }
  includedItems: string[]
  aiDescription?: string
  serviceDetail?: string
  breakdown?: QuoteBreakdownData
}
```

### Hardcodes en el PDF

- `'GARD SECURITY'` como fallback si `companyConfig.commercialName` está vacío (3 ocurrencias en QuotationPDF.tsx, 1 en render-quotation.ts)
- Items por defecto de "El servicio incluye" están hardcoded (no vienen del tenant):
  - "Personal acreditado ante OS-10 de Carabineros"
  - "Supervisión periódica en terreno"
  - etc.

---

## 6. Cómo se ven las cotizaciones en el portal del cliente

### Componentes involucrados

```
PortalCotizaciones.tsx (409 líneas) — Vista principal
├── Filter tabs: todas / pendientes / aprobadas / rechazadas
├── Si isProspect: agrupa por deal (DealGroup)
├── Carga /api/portal/cliente/cotizaciones
│
├── CotizacionCard.tsx (462 líneas) — Tarjeta por cotización
│   ├── variant "dashboard": compacta (badge + nombre + precio)
│   ├── variant "full": expandible con detalle
│   │   ├── Tabla de posiciones
│   │   ├── Servicios adicionales
│   │   ├── Notas / AI description
│   │   ├── Adjuntos (descargables)
│   │   ├── QuoteBreakdownPanel (si hay costBreakdown)
│   │   └── Acciones: Aprobar / Rechazar / Descargar PDF / WhatsApp
│   └── Botones de acción según status
│
├── CotizacionApproveDialog.tsx — Confirmar aprobación
├── CotizacionRejectDialog.tsx — Confirmar rechazo con motivo
├── WhatsAppButton.tsx — Teléfono hardcoded (Gard)
├── GardServiceIncludes.tsx — Lista "incluye" hardcoded (Gard)
└── DashboardCotizacionesPendientes.tsx — Widget para dashboard
```

### Datos que muestra el portal

1. **Lista**: code, name, status, monthlyCost, validUntil, totalPositions, totalGuards, currency
2. **Detalle expandido**:
   - Posiciones: customName, numGuards, numPuestos, horario, días, displayPrice (precio venta, no costo)
   - Servicios adicionales: nombre, descripción, precio
   - AI description y service detail
   - Adjuntos (archivos descargables)
   - Cost breakdown transparente (QuoteBreakdownPanel con variant "dark")
   - Notas
3. **Acciones**: Aprobar (marca status "approved"), Rechazar (con motivo), Descargar PDF, WhatsApp

### API del portal

- `GET /api/portal/cliente/cotizaciones` — Lista con precios de venta calculados (no costos internos)
- `GET /api/portal/cliente/cotizaciones/[id]` — Detalle con positions, additionalLines, attachments, costBreakdown
- `POST .../approve` — Marca approved
- `POST .../reject` — Marca rejected con motivo
- `POST .../accept-proposal` — Acepta y envía email a `comercial@gard.cl` (hardcoded)
- `GET .../pdf` — Genera PDF

### Flujo de precios en el portal

El portal **nunca muestra costos internos**. El API calcula el precio de venta por posición:

```
1. Calcula costsBase y baseWithMargin (misma fórmula que compute-quote-costs)
2. Asigna precio venta proporcional a cada posición:
   proportion = positionCost / totalPositionCosts
   salePrice = totalSalePrice × proportion
3. El campo displayPrice en Position es el precio de venta (no monthlyPositionCost)
```

---

## Resumen ejecutivo

| Dimensión | Estado actual |
|-----------|--------------|
| **Tamaño total** | ~89 archivos, ~20,700 líneas |
| **Modelos Prisma** | 15 modelos en schema `cpq` + 1 en `crm` |
| **Hardcodes Gard** | ~50+ ocurrencias en ~25 archivos (emails, URLs, teléfonos, nombres) |
| **Motor de cálculo** | 1 archivo (363 líneas) + duplicación en costs/route.ts (818 líneas) |
| **PDF** | 2 sistemas de render paralelos (JSX + createElement) |
| **Portal** | 8 componentes, ~1,568 líneas, varios hardcodes Gard |
| **Duplicación** | La fórmula de cálculo está en 3 lugares: compute-quote-costs.ts, costs/route.ts GET, build-quotation-props.ts |
| **Multi-tenant** | `tenant-config.ts` centraliza defaults pero muchos archivos tienen fallbacks hardcoded |
| **Estados** | Strings sin enum: "draft", "sent", "approved", "rejected" |
| **Tests** | Solo 1 test file encontrado (crm-deal-active-quotation.test.ts) |
