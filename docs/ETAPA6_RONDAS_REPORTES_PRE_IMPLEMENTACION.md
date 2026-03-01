# ETAPA 6 — RONDAS 2.0: Reportes y Exportación

## Reporte Pre-Implementación

**Fecha:** 2025-03-01  
**Estado:** Pendiente de confirmación del usuario

---

## 1. Verificación Etapas 1-5

| Etapa | Estado | Notas |
|-------|--------|-------|
| 1. Database y Models | ✅ Completa | OpsRondaEjecucion (trustBreakdown, durationMinutes, installationId), OpsMarcacionCheckpoint (photoUrl, audioUrl, status), OpsCheckpoint (lat, lng, geoRadiusM) |
| 2. API y Lógica de Negocio | ✅ Completa | APIs extendidas, Trust Score v2, alert engine |
| 3. Página Guardia (Standalone) | ✅ Completa | /patrullaje/[installationId] |
| 4. OPAI Configuración | ✅ Completa | /ops/rondas/configuracion unificado |
| 5. Monitoreo y Alertas | ✅ Completa | Mapa Google Maps, panel guardias, CerrarTurnoModal |

---

## 2. Análisis de la Página Existente `/ops/rondas/reportes`

### 2.1 Estructura actual

**Server component** (`src/app/(app)/ops/rondas/reportes/page.tsx`):
- Autenticación y permisos (`canView(perms, "ops", "rondas")`)
- Fetch de `OpsRondaEjecucion` últimos 30 días (take: 1000)
- Include: `rondaTemplate` (name, installation.name), `guardia` (persona: firstName, lastName, rut)
- Mapea a: scheduledAt, installation, template, guardia, rut, status, checkpointsTotal, checkpointsCompletados, porcentajeCompletado, trustScore
- Totals: total, completadas, incompletas, noRealizadas, compliance, trustPromedio

**Client component** (`RondasReportesClient.tsx`):
- **KpiGrid** con 6 KpiCards: Total, Completadas, Incompletas, No realizadas, Cumplimiento %, Trust promedio
- **FilterBar**: input de búsqueda (filtra por installation, template, guardia, status)
- **Botón Exportar CSV**: redirige a `GET /api/ops/rondas/reportes?format=csv` (sin pasar filtros)
- **DataTable**: columnas Fecha, Instalación, Plantilla, Guardia, Estado, Progreso, Trust

### 2.2 Limitaciones actuales

- Sin filtros por instalación, rango de fechas, guardia, estado
- Sin tabs (por instalación / por guardia / mapa de calor)
- Sin gráficos
- Sin filas expandibles (timeline, Trust breakdown)
- CSV no respeta filtros (usa datos del servidor sin params)
- Sin exportación PDF
- "No realizadas" se calcula de ejecuciones con status `no_realizada` (correcto)

---

## 3. API Existente `/api/ops/rondas/reportes`

**Ruta:** `src/app/api/ops/rondas/reportes/route.ts`

**Parámetros soportados:**
- `from` (opcional): fecha inicio
- `to` (opcional): fecha fin
- `format` (opcional): `csv` para descarga

**Respuesta JSON:**
```json
{
  "success": true,
  "data": {
    "rows": [...],
    "totals": { "total", "completadas", "incompletas", "noRealizadas", "compliance", "trustPromedio" }
  }
}
```

**Datos faltantes para Etapa 6:**
- `installationId`, `guardiaId`, `id` en cada row (para filtros y detalle)
- `trustBreakdown`, `durationMinutes`, `startedAt`, `completedAt`
- `marcaciones` con checkpoint name, status, timestamp, photoUrl
- Para mapa de calor: endpoint o query adicional con cobertura por checkpoint

---

## 4. Reportes de Otros Módulos (Reutilización)

### 4.1 Finanzas (`ReportesClient.tsx`)
- **KpiGrid**, **KpiCard** con variantes
- Gráfico de barras con divs (no Recharts) para gasto mensual
- Filtros de fecha (Input type="date")
- Export CSV/XLSX vía fetch a API con params

### 4.2 Supervisión (`SupervisionReportes.tsx`)
- **Recharts**: BarChart, PieChart, RadarChart, LineChart
- Fetch de datos desde API
- KpiGrid, Card, Badge
- Tooltip custom para gráficos

### 4.3 Control Nocturno (`ControlNocturnoKpisCharts.tsx`)
- **Recharts**: BarChart, LineChart
- ChartTooltip custom
- EmptyChart para sin datos
- Paleta de colores consistente

### 4.4 CRM (`CrmDashboardCharts.tsx`)
- BarChart, PieChart con Recharts
- ChartTooltip reutilizable

### 4.5 Tickets (`TicketsDashboard.tsx`)
- BarChart (horizontal), LineChart

---

## 5. Librería de Gráficos

**Recharts** (`^3.7.0`) — ya instalada.

Componentes usados en el proyecto:
- `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, `CartesianGrid`, `Cell`
- `LineChart`, `Line`
- `PieChart`, `Pie`
- `RadarChart`, `Radar`, `PolarGrid`, `PolarAngleAxis`, `PolarRadiusAxis`, `Legend`

**Recomendación:** Usar BarChart para cumplimiento diario y LineChart para Trust Score trend.

---

## 6. Exportación PDF

**@react-pdf/renderer** (`^4.3.2`) — ya instalada.

Uso existente:
- `PricingPDF.tsx`: Document, Page, Text, View, StyleSheet
- `generate-presentation`, `generate-pricing-v2`: APIs que generan PDF

**Recomendación:** Crear `RondasReportPDF.tsx` con Document/Page para KPIs + tabla + gráfico (como imagen base64 del canvas de Recharts o descripción textual).

---

## 7. Componentes Reutilizables

| Componente | Ubicación | Uso en Etapa 6 |
|------------|-----------|----------------|
| KpiCard, KpiGrid | `@/components/opai` | 6 KPIs con variantes (default, emerald, amber, red, blue, purple) |
| DataTable | `@/components/opai` | Tabla base; **no soporta expandible** → tabla custom |
| FilterBar | `@/components/opai` | Contenedor de filtros |
| PageHeader | `@/components/opai` | Título y descripción |
| SearchableSelect | `@/components/ui/SearchableSelect` | Instalación, Guardia |
| ChipTabs | `@/components/ui/chip-tabs` | 3 tabs |
| Badge | `@/components/ui/badge` | Estados, Trust Score |
| Card | `@/components/ui/card` | Contenedores |
| MonitoreoMap | `@/components/ops/rondas/monitoreo-map` | Patrón para Google Maps; mapa de calor es distinto (markers por checkpoint con color) |
| TrustScoreBadge | `@/components/ops/rondas/trust-score-badge` | Badge circular Trust |

---

## 8. DataTable y Filas Expandibles

El `DataTable` actual **no soporta** filas expandibles. Opciones:

1. **Extender DataTable** con prop `expandableRowRender?: (row) => ReactNode` — requiere modificar componente compartido.
2. **Crear RondasReportesTable** custom — tabla específica con estado `expandedRowId`, render de fila + fila expandida (timeline + Trust breakdown).
3. **Usar Accordion/Collapsible** por fila — posible pero menos idiomático para tablas.

**Recomendación:** Opción 2 — crear `RondasReportesTable` que renderice `<table>` con lógica de expand/collapse, reutilizando estilos de DataTable.

---

## 9. Plan de Migración / Cambios

### 9.1 API `/api/ops/rondas/reportes`

**Extender GET:**
- Parámetros: `from`, `to`, `installationId`, `guardiaId`, `status` (Todos | completada | incompleta | no_realizada)
- Incluir en rows: `id`, `installationId`, `guardiaId`, `trustBreakdown`, `durationMinutes`, `startedAt`, `completedAt`
- Incluir `marcaciones` con: checkpoint name, status, timestamp, photoUrl (fotoEvidenciaUrl)
- Calcular `noRealizadas` correctamente (status === "no_realizada")
- Aplicar filtros en el `where` de Prisma

**Nuevo endpoint (opcional):** `GET /api/ops/rondas/reportes/heatmap?installationId=&from=&to=`  
- Retorna checkpoints con lat, lng, coveragePercent, totalRondas, totalMarcaciones, lastMarkedAt

### 9.2 API para datos de reportes (alternativa)

Crear `GET /api/ops/rondas/reportes/data` que retorne:
- `totals` (según filtros)
- `rows` (con marcaciones para expandible)
- `dailyCompliance` (para gráfico de barras: { date, compliance }[])
- `guardTrustTrend` (para tab Por guardia: { roundIndex, trustScore }[])

Esto permite que la página sea client-side con fetch, aplicando filtros sin recargar.

### 9.3 Página `reportes/page.tsx`

**Opción A (recomendada):** Página híbrida
- Server: fetch inicial con filtros por defecto (últimos 30 días), pasar datos a client
- Client: filtros que disparan refetch a `/api/ops/rondas/reportes` o `/reportes/data`

**Opción B:** Todo client-side
- Fetch desde client con filtros, sin datos iniciales en server

**Recomendación:** Opción A — mantener SSR para carga inicial rápida, filtros en client que llaman a API.

---

## 10. Estructura de Archivos Propuesta

```
src/
├── app/(app)/ops/rondas/reportes/
│   └── page.tsx                    # Modificar: fetch con filtros, pasar a client
├── app/api/ops/rondas/reportes/
│   ├── route.ts                    # Modificar: filtros, datos extendidos
│   └── data/route.ts               # Nuevo (opcional): datos para gráficos/heatmap
├── components/ops/rondas/
│   ├── RondasReportesClient.tsx    # Reescribir: tabs, filtros, KPIs, tabla, exports
│   ├── RondasReportesTable.tsx     # Nuevo: tabla con filas expandibles
│   ├── RondasReportesPorInstalacion.tsx  # Tab 1: gráfico + tabla
│   ├── RondasReportesPorGuardia.tsx      # Tab 2: selector guardia, card, trend, insight
│   ├── RondasReportesHeatmap.tsx   # Tab 3: mapa de calor
│   ├── RondasComplianceChart.tsx   # Gráfico barras cumplimiento diario
│   ├── RondasTrustTrendChart.tsx   # Gráfico línea Trust Score
│   └── RondasReportPDF.tsx         # Componente @react-pdf para export PDF
```

---

## 11. Detalle por Tab

### Tab: Por instalación
- Gráfico: `RondasComplianceChart` — BarChart, eje X días (7/14/30), eje Y % cumplimiento, color por barra (verde/azul/naranja)
- Tabla: `RondasReportesTable` — columnas según spec, fila expandible con timeline + Trust breakdown
- Paginación: 20 por página (estado local)
- Orden: por columna (estado local)
- Export: CSV (tabla filtrada), PDF (KPIs + gráfico + tabla)

### Tab: Por guardia
- SearchableSelect para guardia (autocomplete sobre OpsGuardia: nombre, código, RUT)
- Card guardia: nombre, código, instalación, Trust promedio, total/completadas/incompletas, cumplimiento
- Gráfico: `RondasTrustTrendChart` — LineChart últimas 30 rondas
- Tabla: misma que tab 1, filtrada por guardia
- Insight IA: hardcodeado — análisis básico (ej: "Trust Score subió X% en últimas 2 semanas") basado en datos calculados

### Tab: Mapa de calor
- SearchableSelect instalación (obligatorio)
- Mapa Google Maps (reutilizar patrón de monitoreo-map): markers por checkpoint con color (verde ≥90%, amarillo 70-89%, rojo <70%, gris sin datos)
- Círculo/radio visual por checkpoint
- Tooltip: nombre, cobertura %, última marcación

---

## 12. Riesgos y Consideraciones

| Riesgo | Mitigación |
|-------|-------------|
| DataTable sin expandible | Crear tabla custom; no modificar DataTable compartido |
| PDF con gráfico Recharts | Recharts renderiza SVG; @react-pdf no soporta SVG directo. Opciones: (a) usar html2canvas para capturar gráfico como imagen, (b) incluir solo datos en PDF sin gráfico visual, (c) dibujar gráfico simple con primitivas PDF |
| Mapa de calor sin datos | Mostrar mensaje "Seleccione instalación" y "Sin checkpoints con coordenadas" |
| Performance con muchos datos | Limitar rows (ej. 2000), paginación en client; heatmap solo para una instalación |
| "No realizadas" | Mantener lógica actual: count de OpsRondaEjecucion con status "no_realizada" |

---

## 13. Resumen de Entregables

| # | Entregable | Enfoque |
|---|------------|---------|
| 1 | Página reportes mejorada con 3 tabs | Reescribir RondasReportesClient, ChipTabs |
| 2 | KPIs dinámicos según filtros | Refetch al cambiar filtros |
| 3 | Gráfico cumplimiento temporal (barras) | Recharts BarChart |
| 4 | Tabla con detalle expandible y Trust breakdown | RondasReportesTable custom |
| 5 | Vista por guardia con Trust trend (línea) | RondasTrustTrendChart, LineChart |
| 6 | Mapa de calor cobertura por checkpoint | Nuevo mapa con markers coloreados |
| 7 | Exportación CSV | Extender API con filtros, botón con params |
| 8 | Exportación PDF básica | RondasReportPDF + API o client-side render |
| 9 | Mejora in-place | No romper rutas ni permisos existentes |

---

## 14. Confirmación Requerida

Antes de implementar, por favor confirma:

1. ¿Aprobar el plan de migración y estructura de archivos?
2. ¿Preferencia para PDF: (a) solo datos/tabla sin gráfico, (b) incluir gráfico vía html2canvas/captura, (c) posponer PDF a iteración posterior?
3. ¿El insight IA debe ser siempre visible (análisis básico hardcodeado) o solo cuando haya "datos suficientes" (ej. ≥5 rondas del guardia)?

---

*Reporte generado como paso previo a la implementación de la Etapa 6.*
