# Módulo PAYROLL - Chile

Sistema completo de liquidaciones y costeo laboral para Chile con arquitectura determinística y snapshots inmutables.

## 🎯 Características

- ✅ **Cálculo completo de liquidaciones** según legislación chilena vigente
- ✅ **Costo empleador** con todos los componentes (SIS, AFC, Mutual, provisiones)
- ✅ **Versionado de parámetros legales** (AFP, Salud, SIS, AFC, impuestos, topes)
- ✅ **Snapshots inmutables** - Las simulaciones nunca se recalculan
- ✅ **Separación FX** - UF/UTM en schema `fx` independiente
- ✅ **API REST** completa para integración con CPQ y otros módulos
- ✅ **UI básica** para simulación y visualización de parámetros

## 📂 Estructura

```
modules/payroll/
├── engine/
│   ├── types.ts                    # Tipos TypeScript
│   ├── parameter-loader.ts         # Carga parámetros + referencias FX
│   ├── compute-employer-cost.ts    # Cálculo costo empleador
│   ├── simulate-payslip.ts         # Simulación liquidación completa
│   ├── tax-calculator.ts           # Cálculo impuesto único
│   └── index.ts                    # Exportaciones públicas
└── README.md

src/app/api/payroll/
├── costing/compute/route.ts        # POST endpoint costo empleador
├── simulator/compute/route.ts      # POST endpoint simulación
└── parameters/route.ts             # GET/POST parámetros

src/app/payroll/
├── page.tsx                        # Dashboard
├── simulator/page.tsx              # UI Simulador
└── parameters/page.tsx             # UI Parámetros

prisma/
├── migrations/
│   ├── 20260207000001_create_payroll_and_fx_schemas/
│   ├── 20260207000002_create_fx_rates_tables/
│   ├── 20260207000003_create_payroll_parameter_versions/
│   ├── 20260207000004_create_payroll_assumptions/
│   ├── 20260207000005_create_payroll_simulations/
│   └── 20260207000006_create_payroll_salary_components/
└── seeds/
    └── payroll-initial-data.ts     # Seed data inicial
```

## 🗄️ Schema de Base de Datos

### Schema `payroll`

- **parameter_versions** - Versiones inmutables de parámetros legales (NO incluye UF/UTM)
- **assumptions** - Configuraciones de provisiones y costeo
- **simulations** - Snapshots inmutables de simulaciones
- **salary_components_catalog** - Catálogo de conceptos (futuro)

### Schema `fx`

- **uf_rates** - Valores diarios de UF
- **utm_rates** - Valores mensuales de UTM

## 🚀 Instalación y Setup

### 1. Ejecutar migraciones

```bash
npx prisma migrate deploy
```

### 2. Generar cliente Prisma

```bash
npx prisma generate
```

### 3. Ejecutar seed data

```bash
npx ts-node prisma/seeds/payroll-initial-data.ts
```

Esto creará:
- UF: $39,703.50 (1-feb-2026)
- UTM: $69,611 (feb-2026)
- Parámetros legales Chile Febrero 2026
- Assumptions por defecto

## 📡 API Endpoints

### POST /api/payroll/costing/compute

Calcula costo total empleador (usado por CPQ).

**Request:**
```json
{
  "base_salary_clp": 1500000,
  "contract_type": "indefinite",
  "afp_name": "habitat",
  "health_system": "fonasa",
  "assumptions": {
    "include_vacation_provision": true,
    "vacation_provision_pct": 0.0833
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "monthly_employer_cost_clp": 1704410.06,
    "breakdown": {
      "base_salary": 1500000,
      "gratification": 0,
      "sis_employer": 23100,
      "afc_employer": {
        "cic": 24000,
        "fcs": 12000,
        "total": 36000
      },
      "work_injury_employer": 14250,
      "vacation_provision": 131060.06,
      "total_cost": 1704410.06
    },
    "worker_net_salary_estimate": 1205861.94,
    "cost_to_net_ratio": 141.33,
    "parameters_snapshot": { ... },
    "computed_at": "2026-02-07T..."
  }
}
```

### POST /api/payroll/simulator/compute

Simula liquidación completa de sueldo.

**Request:**
```json
{
  "base_salary_clp": 1500000,
  "contract_type": "indefinite",
  "afp_name": "habitat",
  "health_system": "fonasa",
  "save_simulation": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "simulation_id": "uuid",
    "gross_salary": 1500000,
    "deductions": {
      "afp": {
        "base_rate": 0.1,
        "commission_rate": 0.0127,
        "total_rate": 0.1127,
        "amount": 169050
      },
      "health": { "rate": 0.07, "amount": 105000 },
      "afc": { "total_rate": 0.006, "amount": 9000 },
      "tax": { "amount": 11088.06 },
      "total_legal": 294138.06
    },
    "net_salary": 1205861.94,
    "employer_cost": {
      "sis": { "rate": 0.0154, "amount": 23100 },
      "afc": { "total_amount": 36000 },
      "work_injury": { "amount": 14250 }
    },
    "total_employer_cost": 1573350,
    "parameters_snapshot": { ... }
  }
}
```

### GET /api/payroll/parameters

Obtener parámetros legales.

**Query params:**
- `active_only=true` - Solo versión activa (default)
- `effective_date=2026-02-15` - Versión vigente en fecha

**Response:**
```json
{
  "success": true,
  "data": {
    "current_version": {
      "id": "uuid",
      "name": "Parámetros Legales Chile - Febrero 2026",
      "effective_from": "2026-02-01",
      "is_active": true,
      "data": { ... }
    }
  }
}
```

### POST /api/payroll/parameters

Crear nueva versión de parámetros (ADMIN).

**Request:**
```json
{
  "name": "Parámetros Marzo 2026",
  "effective_from": "2026-03-01",
  "data": {
    "afp": { "base_rate": 0.1, ... },
    "sis": { "employer_rate": 0.0154, ... },
    ...
  },
  "set_as_active": false
}
```

## 🧮 Uso del Engine

### Calcular Costo Empleador

```typescript
import { computeEmployerCost } from "@/modules/payroll/engine";

const result = await computeEmployerCost({
  base_salary_clp: 1500000,
  contract_type: "indefinite",
  afp_name: "habitat",
  health_system: "fonasa",
});

console.log(result.monthly_employer_cost_clp); // 1704410.06
console.log(result.worker_net_salary_estimate); // 1205861.94
```

### Simular Liquidación

```typescript
import { simulatePayslip } from "@/modules/payroll/engine";

const result = await simulatePayslip({
  base_salary_clp: 1500000,
  contract_type: "indefinite",
  afp_name: "habitat",
  health_system: "fonasa",
  overtime_hours_50: 10,
  save_simulation: true,
});

console.log(result.net_salary); // Líquido
console.log(result.simulation_id); // UUID del snapshot
```

## 🔑 Conceptos Clave

### 1. Parámetros Legales (NO incluyen UF/UTM)

Los parámetros legales se versionan por fecha de vigencia y contienen:
- AFP: 10% base + comisión variable por AFP
- SIS: Aporte empleador (1.54%)
- Salud: Fonasa 7% / Isapre variable
- AFC: Desglosado en CIC + FCS por tipo de contrato
- Topes: Expresados en UF
- Impuesto Único: Tabla SII en CLP directo
- Mutual: Tasas por nivel de riesgo

### 2. Referencias FX (Separadas)

UF y UTM se almacenan en el schema `fx`:
- **UF**: Valor diario específico
- **UTM**: Valor mensual oficial SII

El engine las resuelve automáticamente y las guarda en el snapshot.

### 3. Snapshots Inmutables

Cada simulación guarda:
- Input completo
- Parámetros legales usados
- Valores UF/UTM exactos
- Resultado calculado
- Timestamp

**Nunca se recalcula**. Esto garantiza auditabilidad y trazabilidad.

### 4. Assumptions (Provisiones)

Configuraciones de costeo no legales:
- Provisión vacaciones (8.33% default)
- Provisión años de servicio
- Bonos fiestas patrias / navidad
- Mutual con override personalizado

## ⚠️ GUARDRAILS

### ✅ PERMITIDO

- Crear nuevas versiones de parámetros
- Agregar nuevos endpoints en `/api/payroll/*`
- Extender el engine con nuevas funciones
- Agregar UI en `/app/payroll/*`
- Crear migraciones en schema `payroll` o `fx`

### ❌ PROHIBIDO

- Refactorizar código fuera de `/modules/payroll` y `/app/payroll`
- Modificar snapshots guardados
- Recalcular simulaciones históricas
- Eliminar versiones de parámetros activas
- Mezclar UF/UTM dentro de parameter_versions.data

## 🔮 Futuro / Roadmap

- [ ] Integración con sistema de asistencia
- [ ] Gratificación automática anual
- [ ] Generación PDF liquidación oficial
- [ ] Libro de remuneraciones
- [ ] Certificados (finiquitos)
- [ ] Integración Previred F1887

## 📖 Referencias Legales

- Superintendencia de Pensiones: https://www.spensiones.cl
- AFC Chile: https://www.afc.cl
- SII Impuestos: https://www.sii.cl
- Previred: https://www.previred.com

---

**Autor:** Sistema OPAI  
**Fecha:** Febrero 2026  
**Versión:** 1.0.0
