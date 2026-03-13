# Investigación y Propuesta de Evolución del CPQ de OPAI

> Fecha: 2026-03-13  
> Autor: Investigación automatizada  
> Estado: Propuesta — NO implementar

---

## FASE 1 — ESTADO ACTUAL DEL CPQ

---

### 1. Modelos de datos

El CPQ vive en el schema `cpq` de Prisma. Se identificaron **15 modelos directos** + 4 modelos CRM/OPS relacionados.

#### Modelos principales

| Modelo | Schema | tenantId | Descripción |
|--------|--------|----------|-------------|
| `CpqQuote` | cpq | ✅ | Cotización principal |
| `CpqPosition` | cpq | ❌ (vía quote) | Puesto de guardia en la cotización |
| `CpqQuoteParameters` | cpq | ❌ (vía quote) | Parámetros financieros y de cálculo |
| `CpqQuoteUniformItem` | cpq | ❌ (vía quote) | Selección de uniformes |
| `CpqQuoteExamItem` | cpq | ❌ (vía quote) | Selección de exámenes |
| `CpqQuoteCostItem` | cpq | ❌ (vía quote) | Ítems de costo operativo |
| `CpqQuoteMeal` | cpq | ❌ (vía quote) | Alimentación |
| `CpqQuoteVehicle` | cpq | ❌ (vía quote) | Vehículos |
| `CpqQuoteInfrastructure` | cpq | ❌ (vía quote) | Infraestructura (generadores, etc.) |
| `CpqQuoteAdditionalLine` | cpq | ❌ (vía quote) | Líneas adicionales (pass-through) |
| `CpqQuoteAttachment` | cpq | ✅ | Adjuntos de la cotización |
| `CpqCatalogItem` | cpq | ✅ (opcional) | Catálogo de ítems (uniformes, exámenes, costos) |
| `CpqPuestoTrabajo` | cpq | ❌ | Tipo de puesto de trabajo |
| `CpqCargo` | cpq | ❌ | Cargo del guardia |
| `CpqRol` | cpq | ❌ | Rol/turno del guardia |

#### Modelos CRM/OPS relacionados

| Modelo | Relación con CPQ |
|--------|-----------------|
| `CrmDeal` | Tiene `activeQuotationId` y relación N:M vía `CrmDealQuote` |
| `CrmDealQuote` | Tabla pivote deal ↔ quote |
| `CrmInstallation` | La cotización puede asociarse a una instalación |
| `CrmLead` | `createdFromLeadId` en CpqQuote; al aprobar un lead se crea cotización |

#### Campos clave de CpqQuote

```
id, tenantId, code (unique), name, status (draft|sent|approved|rejected),
clientName, validUntil, notes, totalPositions, totalGuards, monthlyCost,
accountId, contactId, dealId, installationId, createdFromLeadId,
currency (CLP|UF), aiDescription, serviceDetail,
paymentTerms, serviceStartDays, contractDuration (default 12), includedItems[]
```

#### Campos clave de CpqQuoteParameters

```
monthlyHoursStandard (180), avgStayMonths (4), uniformChangesPerYear (3),
financialEnabled, financialRatePct (2.5%), salePriceBase, salePriceMonthly,
policyEnabled, policyRatePct, policyAdminRatePct, policyContractMonths (12),
policyContractPct (100%), contractMonths (12), contractAmount,
marginPct (13%)
```

---

### 2. Flujo de creación de cotización

**El CPQ NO usa un wizard con pasos secuenciales.** Usa un layout de **secciones colapsables** en una sola página (`CpqQuoteDetail.tsx`, 1761 líneas).

#### Secciones (orden en la UI)

1. **Datos** — cliente, CRM (cuenta, negocio, contacto, instalación), nombre, vigencia
2. **Condiciones comerciales** — forma de pago, plazo de inicio, duración del contrato, ítems incluidos
3. **Puestos** — tarjetas de puestos con configuración de guardia, turno, salario
4. **Costos adicionales** — uniformes, exámenes, alimentación, operacionales, vehículos, infraestructura
5. **Líneas adicionales** — productos/servicios ad-hoc (pass-through)
6. **Financieros** — financiamiento, póliza de garantía
7. **Margen** — porcentaje de margen sobre la base de costos

#### Panel lateral

- `FinancialPanel.tsx` (893 líneas) — resumen financiero en tiempo real con KPIs
- `QuoteBreakdownPanel.tsx` (668 líneas) — desglose transparente de costos

#### Flujo paso a paso

1. **Crear cotización**: Desde un negocio CRM (`CreateQuoteModal`) o desde la aprobación de un lead
2. **Configurar datos**: Se pre-llenan desde el CRM (cuenta, contacto, negocio, instalación)
3. **Agregar puestos**: Se crean posiciones con puesto de trabajo, cargo, rol, turno, salario base → el sistema calcula costo empleador automáticamente (payroll)
4. **Configurar costos**: Se pre-cargan ítems del catálogo (`CpqCatalogItem`). El usuario activa/desactiva y ajusta precios
5. **Ajustar margen**: Se define el % de margen (default 13%)
6. **Generar descripción AI**: Opcional, genera texto con OpenAI
7. **Enviar**: Múltiples opciones:
   - PDF por email directo
   - Email con cuerpo editable + PDF adjunto
   - Link al portal de cliente
   - Crear borrador de presentación comercial
   - Enviar a instalación (crear puestos operativos)

#### Datos que vienen del Lead/Negocio

- Al **aprobar un lead**: se crean automáticamente posiciones CPQ desde la `dotacion` del lead, y costos desde `selectedCostGroups` del metadata
- Al **crear desde un deal**: solo se pasan `accountId`, `dealId`, `installationId`, `clientName`
- **No se pasan**: zona geográfica, tipo de industria, equipamiento requerido, turno solicitado

---

### 3. Costos adicionales hoy

#### Dónde se definen

- **Catálogo**: `CpqCatalogItem` — tabla en schema `cpq` con campos: `type`, `name`, `unit`, `basePrice`, `isDefault`, `defaultVisibility`
- **Por cotización**: `CpqQuoteCostItem` — referencia a un ítem del catálogo + override de precio, cantidad, modo de cálculo

#### Tipos de catálogo (hardcodeados en código)

```typescript
// CpqQuoteCosts.tsx
OPERATIONAL_TYPES = ["phone", "radio", "flashlight"]
TRANSPORT_TYPES = ["transport"]
VEHICLE_TYPES = ["vehicle_rent", "vehicle_fuel", "vehicle_tag"]
INFRA_TYPES = ["infrastructure", "fuel"]
FINANCIAL_TYPES = ["financial", "policy"]
// Otros: "uniform", "exam", "meal", "system"
```

#### Cómo se cargan en el CPQ

1. `GET /api/cpq/quotes/[id]/costs` → carga todos los ítems de costo de la cotización + catálogo
2. `computeCpqQuoteCosts()` en `src/modules/cpq/costing/compute-quote-costs.ts` fusiona ítems guardados con defaults del catálogo
3. Los ítems `isDefault: true` del catálogo se pre-cargan automáticamente (excepto para cotizaciones creadas desde lead, que usan `selectedCostGroups`)

#### ¿Se pueden agregar ad-hoc?

**No directamente.** Los `CpqQuoteCostItem` siempre requieren un `catalogItemId`. Para agregar un costo nuevo, hay que:
1. Ir a Configuración CPQ → Catálogo (`/opai/configuracion/cpq`)
2. Crear el ítem en el catálogo global
3. Volver a la cotización y activarlo

**Esto rompe el flujo del cotizador.**

#### ¿Tienen categoría/tipo?

Sí, pero el campo `type` del catálogo es un `String` libre, no un enum. Las categorías están hardcodeadas en el frontend (constantes en `CpqQuoteCosts.tsx`).

#### ¿Se pueden override por cotización?

Sí. `CpqQuoteCostItem` tiene:
- `unitPriceOverride` — override del precio base del catálogo
- `quantity` — cantidad
- `calcMode` — `"per_month"` | `"per_guard"`
- `isEnabled` — activar/desactivar por cotización
- `visibility` — `"visible"` | `"hidden"` (afecta el documento)

---

### 4. Líneas adicionales hoy

#### Modelo

`CpqQuoteAdditionalLine`:
```
id, quoteId, nombre (varchar 200), descripcion (text), precio (decimal 12,0), orden (int)
```

#### Características

- **Pass-through**: NO se les aplica margen. Se suman directamente al total.
- **Sin categoría**: No tienen campo `tipo`, `categoría` ni `recurrencia`
- **Sin margen**: No hay campo `marginPct` por línea
- **Libres**: Se crean ad-hoc por cotización, sin catálogo
- **Se incluyen en el template del documento**: Sí, aparecen como sección "Servicios Adicionales" en el PDF
- **Cálculo**: `additionalLinesTotal = Σ(precio)` → `grandTotal = totalSalePrice + additionalLinesTotal`

#### Limitaciones

- Solo tienen nombre, descripción y precio mensual
- No se puede indicar si son únicos o recurrentes
- No se puede aplicar margen selectivo
- No se puede indicar el tipo (producto, servicio, arriendo, asesoría)

---

### 5. Cálculo de precios

#### Fórmula completa (desde `compute-quote-costs.ts` y `costs/route.ts`)

```
1. monthlyPositions = Σ(position.monthlyPositionCost)
   donde monthlyPositionCost = costo empleador calculado por payroll

2. monthlyHolidayAdjustment = (monthlyPositions / 30) × 0.5 × (holidayAnnualCount / 12)
                                × (1 + holidayCommercialBufferPct / 100)

3. monthlyUniforms = (uniformSetCost × uniformChangesPerYear / 12) × totalGuards

4. monthlyExams = (examSetCost × examFrequency / 12) × totalGuards
   donde examFrequency = max(12/avgStayMonths, uniformChangesPerYear)

5. monthlyMeals = Σ(mealPrice × mealsPerDay × daysOfService)

6. monthlyVehicles = Σ((rent + maintenance + fuelCost) × vehiclesCount)

7. monthlyInfrastructure = Σ((rent + fuelCost) × quantity)

8. monthlyCostItems = Σ(unitPrice × quantity [× totalGuards si calcMode="per_guard"])

9. costsBase = monthlyPositions + holidayAdj + uniforms + exams + meals
               + vehicles + infrastructure + costItems

10. baseWithMargin = costsBase / (1 - marginPct/100)
    [Fórmula de margen sobre venta, NO markup]

11. effectiveSalePriceBase = salePriceBase > 0 ? salePriceBase : baseWithMargin

12. monthlyFinancial = effectiveSalePriceBase × (financialRatePct / 100)

13. monthlyPolicy = (effectiveSalePriceBase × policyContractMonths × policyContractPct/100
                     × policyRatePct/100) / 12

14. salePriceMonthly = baseWithMargin + monthlyFinancial + monthlyPolicy

15. grandTotal = salePriceMonthly + additionalLinesTotal
```

#### Observaciones importantes

- **El margen se aplica sobre TODOS los costos** (puestos + uniformes + exámenes + comidas + vehículos + infraestructura + costos operativos), NO solo sobre puestos
- **Las líneas adicionales NO entran en el margen** — son pass-through
- **Usa fórmula de margen sobre venta** (no markup): `precio = costo / (1 - margen%)`
- **El financiamiento y la póliza se calculan SOBRE el precio de venta**, no sobre el costo

---

### 6. Variables que faltan / existen

#### ✅ Periodo de contrato: YA EXISTE

Contrario a la hipótesis inicial, **el campo ya existe**:
- `CpqQuote.contractDuration` (default 12 meses) — campo general de la cotización
- `CpqQuoteParameters.contractMonths` (default 12) — usado en cálculos de póliza
- Se muestra en la sección "Condiciones comerciales" de la UI y en el PDF

**Sin embargo**, NO se usa para amortización de inversiones. Solo afecta:
- El cálculo de la póliza de garantía
- La visualización en el documento/propuesta

#### ❌ Amortización: NO EXISTE

- No hay concepto de "inversión amortizable" en el CPQ
- No hay `calcMode: "amortizable"` ni `investmentAmount` / `amortizationMonths` en los modelos
- La palabra "amortización" solo aparece en el plan de cuentas contable (`chart-of-accounts-cl.ts`), no en el CPQ

#### ❌ Zona geográfica como variable de costo: NO EXISTE

- No hay campo de zona/región en el CPQ
- `CrmLead` tiene `city` y `commune`, pero no se usan para calcular costos
- `CrmInstallation` tiene `address`, `city`, `commune`, pero tampoco se conectan a lógica de costos

---

### 7. Multi-tenant readiness

#### ¿Qué tiene tenantId?

| Modelo | tenantId | Estado |
|--------|----------|--------|
| CpqQuote | ✅ | OK |
| CpqCatalogItem | ✅ (opcional, null = global) | OK |
| CpqQuoteAttachment | ✅ | OK |
| CpqPosition | ❌ | Hereda de quote (OK) |
| CpqQuoteParameters | ❌ | Hereda de quote (OK) |
| CpqQuote*Item | ❌ | Hereda de quote (OK) |
| **CpqPuestoTrabajo** | ❌ | ⚠️ PROBLEMA: compartidos globalmente |
| **CpqCargo** | ❌ | ⚠️ PROBLEMA: compartidos globalmente |
| **CpqRol** | ❌ | ⚠️ PROBLEMA: compartidos globalmente |

#### Elementos hardcodeados

1. **Tipos de catálogo**: `phone`, `radio`, `flashlight`, `transport`, `infrastructure`, `fuel`, `system`, `financial`, `policy`, `uniform`, `exam`, `meal` — hardcodeados como strings en el frontend
2. **Uniformes por defecto**: `zapato`, `polar`, `camisa`, `pantalon`, `geologo`, `chaqueta`, `velo` — en `cpq-constants.ts`
3. **Portal de cliente**: `GardServiceIncludes.tsx` tiene lista hardcodeada de servicios incluidos con texto "Qué incluye con Gard"
4. **Emails**: `comercial@gard.cl` hardcodeado como CC en `CpqQuoteDetail.tsx`
5. **Financial Panel**: "GARD SECURITY" y "www.gard.cl" hardcodeados en `FinancialPanel.tsx`
6. **Tenant config**: Los defaults en `tenant-config.ts` son todos de Gard, pero se pueden override por tenant vía la tabla `Setting`

#### ¿Los costos adicionales son por organización?

Parcialmente. `CpqCatalogItem.tenantId` es opcional:
- `null` = disponible para todos los tenants (global)
- Con valor = solo para ese tenant
- El query filtra: `OR: [{ tenantId }, { tenantId: null }]`

#### ¿El template del documento es personalizable por empresa?

Parcialmente:
- Los datos de empresa (nombre, logo, contacto) vienen de `getTenantCompanyConfig()` que lee de la tabla `Setting` por tenant
- **Pero** la estructura del documento (secciones, layout, qué se muestra) está fija en `QuotationPDF.tsx`
- No hay selección de template por cotización

---

## FASE 2 — PROPUESTA DE EVOLUCIÓN

---

### P1 — Costos adicionales inline (Quick Add)

**Problema**: Agregar un costo nuevo requiere salir del CPQ → ir a Configuración → crear ítem en catálogo → volver.

#### Cambios en schema Prisma

```prisma
// Modificar CpqQuoteCostItem para permitir costos sin catálogo
model CpqQuoteCostItem {
  // ... campos existentes ...
  catalogItemId     String?  @map("catalog_item_id") @db.Uuid  // ← hacer OPCIONAL
  
  // Nuevos campos para costos inline (usados cuando catalogItemId = null)
  customName        String?  @map("custom_name") @db.VarChar(200)
  customType        String?  @map("custom_type")  // categoría
  customUnit        String?  @map("custom_unit")
  customBasePrice   Decimal? @map("custom_base_price") @db.Decimal(12, 2)
  
  // Amortización (nuevo)
  isAmortizable          Boolean  @default(false) @map("is_amortizable")
  investmentAmount       Decimal? @map("investment_amount") @db.Decimal(14, 2)
  amortizationMonths     Int?     @map("amortization_months")
  
  // Guardar en catálogo global
  savedToCatalog    Boolean  @default(false) @map("saved_to_catalog")
}
```

**Alternativa más conservadora**: Crear el ítem de catálogo on-the-fly desde el CPQ, sin modificar la estructura de `CpqQuoteCostItem`:
- Al hacer "Crear nuevo" en el combobox, se llama `POST /api/cpq/catalog` desde el propio CPQ
- El nuevo ítem queda disponible inmediatamente
- No requiere cambios en el schema de CpqQuoteCostItem

#### Componentes a modificar

| Componente | Cambio |
|-----------|--------|
| `src/components/cpq/CpqQuoteCosts.tsx` | Agregar botón "+ Agregar costo" con mini-formulario inline (combobox + tipo + precio + checkbox catálogo) |
| `src/app/api/cpq/quotes/[id]/costs/route.ts` | Soportar costos sin `catalogItemId` en PUT, o crear catálogo on-the-fly |
| `src/app/api/cpq/catalog/route.ts` | Ya existe POST — verificar que soporte creación desde CPQ sin permisos especiales |
| `src/modules/cpq/costing/compute-quote-costs.ts` | Soportar costos sin catálogo en el cálculo |

#### APIs nuevas o modificadas

- `POST /api/cpq/catalog` — ya existe, podría necesitar flag `createdFromQuote: true`
- `PUT /api/cpq/quotes/[id]/costs` — modificar para aceptar costos inline

#### Estimación: **M** (Medium)

#### Dependencias: Ninguna (standalone)

---

### P2 — Periodo de contrato como variable de amortización

**Problema**: El campo `contractDuration` ya existe pero no se usa para amortizar inversiones.

#### Cambios en schema Prisma

```prisma
// Modificar CpqQuoteCostItem (o crear subtipo)
model CpqQuoteCostItem {
  // ... campos existentes ...
  calcMode  String  @default("per_month")  // Agregar: "amortizable"
  
  // Nuevos campos de amortización
  investmentAmount    Decimal?  @map("investment_amount") @db.Decimal(14, 2)
  amortizationMonths  Int?      @map("amortization_months")
  // El costo mensual se calcularía: investmentAmount / amortizationMonths
  // Si amortizationMonths = null → usar contractDuration de la cotización
}
```

#### Lógica de cálculo

En `compute-quote-costs.ts`, agregar al loop de `monthlyCostItems`:

```typescript
if (calcMode === "amortizable" && investmentAmount > 0) {
  const months = amortizationMonths || contractDuration || 12;
  return sum + (investmentAmount / months);
}
```

#### Componentes a modificar

| Componente | Cambio |
|-----------|--------|
| `src/modules/cpq/costing/compute-quote-costs.ts` | Agregar lógica de `calcMode: "amortizable"` |
| `src/components/cpq/CpqQuoteCosts.tsx` | UI para seleccionar modo amortizable + campos de inversión |
| `src/app/api/cpq/quotes/[id]/costs/route.ts` | Soportar nuevos campos en PUT |

#### Compatibilidad backward

- `contractDuration` ya existe con default 12 → sin migración necesaria
- Costos existentes tienen `calcMode: "per_month"` o `"per_guard"` → no se afectan
- Solo costos nuevos con `calcMode: "amortizable"` usarían la nueva lógica

#### Estimación: **S** (Small)

#### Dependencias: Se beneficia de P1 (crear costos amortizables inline)

---

### P3 — Líneas adicionales mejoradas

**Problema**: `CpqQuoteAdditionalLine` solo tiene nombre, descripción y precio. Necesita soportar tipos, recurrencia y margen opcional.

#### Cambios en schema Prisma

```prisma
model CpqQuoteAdditionalLine {
  // ... campos existentes ...
  
  // Nuevos campos
  tipo          String?  @default("servicio")  // "producto" | "servicio" | "arriendo" | "asesoria"
  recurrencia   String?  @default("mensual")   // "unico" | "mensual" | "por_evento"
  marginPct     Decimal? @map("margin_pct") @db.Decimal(6, 2)  // null = pass-through (0% margen)
  
  // Para recurrencia "unico" → prorrateo
  // precioMensual = precio / contractDuration (de la cotización)
}
```

#### Lógica de cálculo

Modificar el cálculo de `additionalLinesTotal`:

```typescript
const additionalLinesTotal = additionalLines.reduce((sum, line) => {
  let monthlyPrice = line.precio;
  
  // Prorrateo de costos únicos
  if (line.recurrencia === "unico" && contractDuration > 0) {
    monthlyPrice = line.precio / contractDuration;
  }
  
  // Margen opcional
  if (line.marginPct && line.marginPct > 0) {
    const margin = line.marginPct / 100;
    monthlyPrice = margin < 1 ? monthlyPrice / (1 - margin) : monthlyPrice;
  }
  
  return sum + monthlyPrice;
}, 0);
```

#### Componentes a modificar

| Componente | Cambio |
|-----------|--------|
| `src/components/cpq/CpqQuoteCosts.tsx` | Agregar selects de tipo y recurrencia + campo de margen en formulario de línea adicional |
| `src/app/api/cpq/quotes/[id]/costs/route.ts` | Soportar nuevos campos en PUT |
| `src/modules/cpq/costing/compute-quote-costs.ts` | Implementar nueva lógica de líneas |
| `src/lib/pdf/templates/quotation/build-quotation-props.ts` | Agrupar líneas por tipo en el PDF |
| `src/lib/pdf/templates/quotation/QuotationPDF.tsx` | Sección "Servicios Adicionales" con tipos |
| `src/components/cpq/FinancialPanel.tsx` | Mostrar desglose de líneas con margen vs pass-through |

#### Estimación: **M** (Medium)

#### Dependencias: P2 (necesita `contractDuration` para prorrateo de costos únicos)

---

### P4 — Estructura de propuesta configurable

**Problema**: El PDF tiene formato fijo. Licitaciones mineras necesitan desglose detallado; retail necesita tabla simple.

#### Cambios en schema Prisma

```prisma
// Nuevo modelo
model CpqProposalTemplate {
  id          String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId    String?  @map("tenant_id")  // null = templates del sistema
  name        String   @db.VarChar(100)   // "Estándar", "Detallado", "Licitación"
  slug        String   @unique            // "standard", "detailed", "tender"
  description String?
  sections    Json     @db.JsonB          // Configuración de secciones a mostrar
  isDefault   Boolean  @default(false) @map("is_default")
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([tenantId], map: "idx_cpq_proposal_templates_tenant")
  @@map("proposal_templates")
  @@schema("cpq")
}

// Agregar a CpqQuote
model CpqQuote {
  // ... campos existentes ...
  proposalTemplateId  String?  @map("proposal_template_id") @db.Uuid
}
```

#### Estructura de `sections` (JSON)

```json
{
  "showPositionsTable": true,
  "showCostBreakdown": false,
  "showLaborDetail": false,
  "showEquipmentDetail": true,
  "showVehicleDetail": false,
  "showConditions": true,
  "showSignature": true,
  "showIncludedItems": true,
  "showAdditionalServices": true,
  "costGrouping": "category",
  "headerStyle": "standard",
  "numberedSections": false,
  "showComplianceSection": false
}
```

#### Componentes a crear/modificar

| Componente | Cambio |
|-----------|--------|
| `src/components/cpq/DatosSection.tsx` | Agregar selector de template de propuesta |
| `src/lib/pdf/templates/quotation/QuotationPDF.tsx` | Refactorizar para renderizar secciones condicionalmente |
| `src/lib/pdf/templates/quotation/build-quotation-props.ts` | Cargar template y pasar config al PDF |
| `src/app/api/cpq/proposal-templates/route.ts` | **NUEVO** — CRUD de templates |
| `src/app/(app)/opai/configuracion/cpq/page.tsx` | Agregar tab de templates |

#### Estimación: **L** (Large)

#### Dependencias: Ninguna (standalone), pero se beneficia de P3 (tipos de líneas adicionales para agrupar)

---

### P5 — Multi-tenant readiness

**Problema**: Puestos de trabajo, cargos y roles son globales. Categorías de costos están hardcodeadas. Templates fijos.

#### Cambios necesarios

##### 5.1 — Agregar tenantId a catálogos base

```prisma
model CpqPuestoTrabajo {
  // ... campos existentes ...
  tenantId  String?  @map("tenant_id")  // null = global/sistema
  // Quitar @@unique de name, reemplazar con:
  @@unique([tenantId, name], map: "uq_cpq_puesto_tenant_name")
}

model CpqCargo {
  tenantId  String?  @map("tenant_id")
  @@unique([tenantId, name], map: "uq_cpq_cargo_tenant_name")
}

model CpqRol {
  tenantId  String?  @map("tenant_id")
  @@unique([tenantId, name], map: "uq_cpq_rol_tenant_name")
}
```

##### 5.2 — Categorías de costos configurables

```prisma
// Nuevo modelo
model CpqCostCategory {
  id          String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  tenantId    String?  @map("tenant_id")
  name        String   @db.VarChar(100)
  slug        String   // "operational", "transport", "infrastructure", etc.
  parentId    String?  @map("parent_id") @db.Uuid
  sortOrder   Int      @default(0) @map("sort_order")
  icon        String?  // Lucide icon name
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  parent   CpqCostCategory?  @relation("category_parent", fields: [parentId], references: [id])
  children CpqCostCategory[] @relation("category_parent")

  @@unique([tenantId, slug], map: "uq_cpq_cost_category_tenant_slug")
  @@map("cost_categories")
  @@schema("cpq")
}
```

##### 5.3 — Eliminar hardcodes de Gard

| Archivo | Hardcode | Solución |
|---------|----------|----------|
| `CpqQuoteDetail.tsx:118` | `comercial@gard.cl` | Leer de `tenantCompanyConfig.email` |
| `FinancialPanel.tsx:477` | `GARD SECURITY` | Leer de `tenantCompanyConfig.brandNameUpper` |
| `FinancialPanel.tsx:675` | `www.gard.cl` | Leer de `tenantCompanyConfig.website` |
| `GardServiceIncludes.tsx` | Lista hardcodeada de servicios | Leer de `CpqQuote.includedItems[]` o tabla `Setting` |
| `cpq-constants.ts` | Uniformes por defecto (zapato, polar, etc.) | Mover a `CpqCatalogItem.isDefault` por tenant |

##### 5.4 — Fórmula de margen configurable

Agregar a `CpqQuoteParameters` o a un `CpqTenantSettings`:

```prisma
model CpqQuoteParameters {
  // ... campos existentes ...
  marginMode  String  @default("margin_on_sale")  // "margin_on_sale" | "markup" | "margin_on_labor"
}
```

- `margin_on_sale`: `precio = costo / (1 - margen%)` (actual)
- `markup`: `precio = costo × (1 + margen%)`
- `margin_on_labor`: margen solo sobre mano de obra, costos operativos pasan sin margen

#### Estimación: **L** (Large)

#### Dependencias: P4 (templates por organización)

---

### P6 — Lead → CPQ mejorado

**Problema**: Al crear cotización desde un lead, no se pre-configuran costos basados en contexto del negocio.

#### Campos a agregar al Lead

```prisma
model CrmLead {
  // ... campos existentes ...
  
  // Nuevos campos para pre-configurar CPQ
  geographicZone    String?  @map("geographic_zone")    // "norte", "centro", "sur", "austral"
  industryType      String?  @map("industry_type")      // "mining", "retail", "residential", etc.
  requiredEquipment String[] @default([]) @map("required_equipment")  // ["radio", "flashlight", "vehicle"]
  preferredShift    String?  @map("preferred_shift")     // "24x7", "diurno", "nocturno"
  estimatedGuards   Int?     @map("estimated_guards")
  estimatedDuration Int?     @map("estimated_duration")  // meses
}
```

#### Lógica de auto-configuración

Al aprobar el lead y crear la cotización (en `src/app/api/crm/leads/[id]/approve/route.ts`):

```typescript
// 1. Zona → costos de movilización
if (lead.geographicZone === "norte" || lead.geographicZone === "austral") {
  // Agregar costos de viáticos, vuelos, hospedaje del catálogo
}

// 2. Industria → template de propuesta
if (lead.industryType === "mining") {
  quote.proposalTemplateId = "tender"; // template de licitación
  // Pre-cargar costos de equipamiento minero
}

// 3. Equipamiento → pre-cargar costos
for (const equip of lead.requiredEquipment) {
  // Buscar en catálogo y crear CpqQuoteCostItem
}

// 4. Duración → contractDuration
if (lead.estimatedDuration) {
  quote.contractDuration = lead.estimatedDuration;
}
```

#### Componentes a modificar

| Componente | Cambio |
|-----------|--------|
| `src/components/crm/CrmLeadDetailClient.tsx` | Agregar campos de zona, industria, equipamiento en formulario de lead |
| `src/app/api/crm/leads/[id]/approve/route.ts` | Lógica de auto-configuración de costos |
| `src/components/cpq/CreateQuoteModal.tsx` | Poder pre-configurar desde datos del negocio |

#### Estimación: **M** (Medium)

#### Dependencias: P1 (costos inline), P4 (selección de template), P5 (categorías por zona)

---

## FASE 3 — ORDEN DE IMPLEMENTACIÓN

### Matriz Valor vs Esfuerzo

| Propuesta | Valor | Esfuerzo | Prioridad |
|-----------|-------|----------|-----------|
| **P1** — Costos inline | 🔴 Alto (flujo diario) | M | **1º** |
| **P2** — Amortización | 🟡 Medio (licitaciones) | S | **2º** |
| **P3** — Líneas mejoradas | 🟡 Medio (servicios extra) | M | **3º** |
| **P4** — Templates propuesta | 🟡 Medio (licitaciones) | L | **4º** |
| **P5** — Multi-tenant | 🟢 Bajo (futuro) | L | **5º** |
| **P6** — Lead→CPQ mejorado | 🟢 Bajo (optimización) | M | **6º** |

### Orden sugerido

```
Sprint 1:  P1 (Costos inline) + P2 (Amortización)
Sprint 2:  P3 (Líneas mejoradas)
Sprint 3:  P4 (Templates de propuesta)
Sprint 4+: P5 (Multi-tenant) + P6 (Lead→CPQ)
```

### Grafo de dependencias

```
P1 (Costos inline) ─────────────┐
                                 │
P2 (Amortización) ──── P3 ──────┤
                                 │
P4 (Templates) ─────── P5 ──────┤
                                 │
                        P6 ──────┘
```

- P2 → P3: Las líneas con recurrencia "único" necesitan contractDuration para prorrateo
- P4 → P5: Templates configurables por organización
- P6 depende conceptualmente de P1, P4 y P5 para máximo valor

---

## FASE 4 — RIESGOS

### Migraciones de base de datos

| Propuesta | Riesgo de migración | Mitigación |
|-----------|---------------------|-----------|
| P1 | **Bajo** si se usa enfoque "crear catálogo on-the-fly". **Medio** si se hace `catalogItemId` opcional (requiere migrar FK) | Preferir enfoque conservador: crear catálogo inline |
| P2 | **Bajo** — solo agregar campos nullable a `CpqQuoteCostItem` | Campos opcionales, backward compatible |
| P3 | **Bajo** — solo agregar campos nullable a `CpqQuoteAdditionalLine` | Campos opcionales con defaults |
| P4 | **Bajo** — modelo nuevo + campo nullable en `CpqQuote` | No afecta datos existentes |
| P5 | **Alto** — cambiar unicidad de `CpqPuestoTrabajo`, `CpqCargo`, `CpqRol` | Requiere migración de datos: asignar tenantId a registros existentes |
| P6 | **Bajo** — solo agregar campos al lead | Campos opcionales |

### Backward compatibility

- **P1-P4**: 100% backward compatible. Los cambios son aditivos (campos opcionales, modelos nuevos)
- **P5**: Riesgo medio. Cambiar la unicidad de `name` a `(tenantId, name)` podría romper queries existentes que asumen unicidad global. Requiere auditoría de queries
- **P6**: 100% backward compatible. Solo campos opcionales en el lead

### Qué podría romperse

1. **P1**: Si se hace `catalogItemId` opcional, todas las queries que hacen `include: { catalogItem: true }` necesitan manejar `null`. Hay ~15 ubicaciones
2. **P5**: `CpqPuestoTrabajo.name @unique` → `@@unique([tenantId, name])` rompe el constraint. Si hay puestos duplicados entre tenants, la migración falla
3. **PDF generation**: Cambios en la estructura de datos de costos/líneas requieren actualizar `build-quotation-props.ts` y `QuotationPDF.tsx`
4. **Portal de cliente**: Los componentes del portal (`PortalCotizaciones.tsx`, `CotizacionCard.tsx`) necesitan adaptarse a nuevos campos si se agregan tipos/recurrencia a líneas adicionales

### Performance

- **P1**: Sin impacto significativo
- **P4**: La resolución de templates agrega 1 query extra por generación de PDF (negligible)
- **P5**: Agregar `tenantId` a queries de puestos/cargos/roles requiere índices compuestos (ya definidos en la propuesta)

---

## APÉNDICE — Inventario de archivos del CPQ

### Componentes principales (~26 archivos)

| Archivo | Líneas | Función |
|---------|--------|---------|
| `src/components/cpq/CpqQuoteDetail.tsx` | 1761 | Detalle principal (secciones colapsables) |
| `src/components/cpq/CpqQuoteCosts.tsx` | 1408 | Panel de costos (uniformes, exámenes, operacionales, vehículos, infraestructura, líneas) |
| `src/components/cpq/FinancialPanel.tsx` | 893 | Panel financiero lateral |
| `src/components/cpq/QuoteBreakdownPanel.tsx` | 668 | Desglose transparente de costos |
| `src/components/cpq/DatosSection.tsx` | 523 | Datos generales y CRM |
| `src/components/cpq/CpqCatalogConfig.tsx` | 732 | Configuración del catálogo |

### APIs (~25 rutas)

Principales: `/api/cpq/quotes/`, `/api/cpq/quotes/[id]/costs/`, `/api/cpq/quotes/[id]/positions/`, `/api/cpq/catalog/`

### Lógica de cálculo

- `src/modules/cpq/costing/compute-quote-costs.ts` (363 líneas) — cálculo centralizado
- `src/lib/pdf/templates/quotation/build-quotation-props.ts` (354 líneas) — construcción de PDF

### Tipos

- `src/types/cpq.ts` (267 líneas) — tipos principales
- `src/types/cpq-breakdown.ts` (71 líneas) — tipos de desglose
