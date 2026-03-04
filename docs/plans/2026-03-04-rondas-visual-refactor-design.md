# Diseño: Refactorización Visual — Módulo Rondas

**Fecha:** 2026-03-04
**Alcance:** 6 pantallas del módulo Rondas + 5 primitivos nuevos
**Enfoque:** A+C — Refactor in-place + extracción de primitivos compartidos

---

## Contexto

El módulo Rondas funciona correctamente pero su diseño es inconsistente con el resto de OPAI: carece de jerarquía visual, flujo intuitivo y optimización mobile-first. La refactorización es puramente visual — **cero cambios en APIs, lógica de negocio o schema Prisma**.

**Audiencias:**
1. Operadores OPAI (supervisores, central de monitoreo)
2. Clientes (portal externo — misma UI, data filtrada)
3. PWA mobile (guardias y supervisores en terreno)

---

## Paleta y Design System

Mantener dark theme existente del proyecto:

| Token | Valor |
|-------|-------|
| Background | `#0a0e1a` |
| Card | `#111827` |
| Border | `#1e293b` |
| Accent (primary) | `#2dd4bf` / `#00d4aa` |
| Success | `#22c55e` |
| Warning | `#f59e0b` |
| Danger | `#ef4444` |
| Info | `#3b82f6` |
| Text principal | `#f1f5f9` |
| Text secundario | `#94a3b8` |
| Text dim | `#64748b` |

### Tipografía
- Labels: `text-[11px] tracking-[0.5px] font-semibold uppercase text-[#64748b]`
- Headings: `font-bold tracking-tight`
- Body: `text-[13px] leading-relaxed`

### Componentes clave
- **KPI Cards:** borde izquierdo 3px con color semántico, número 28-36px
- **Badge/Pill:** `bg-color/10 border border-color/20 rounded-full text-[11px]`
- **Progress bars:** `h-1 rounded-full`
- **Trust Score Gauge:** SVG circular, verde ≥70, amarillo 40-69, rojo <40
- **Tablas:** sin bordes visibles, `hover:bg-white/[0.02]`, separadores `border-white/[0.04]`
- **Buttons primarios:** `bg-[#2dd4bf] text-black`

---

## Arquitectura

### Sin cambios
- `src/app/(app)/ops/rondas/**/page.tsx` — server components, auth y data fetch
- `src/app/api/` — todas las rutas API
- Schema Prisma y modelos de datos
- `trust_score` ya existe en `OpsRondaEjecucion`

### Archivos modificados (refactor in-place)
| Archivo | Cambio |
|---------|--------|
| `RondasDashboardClient.tsx` | Rediseño completo |
| `RondasMonitoreoClient.tsx` | Layout mapa + panel lateral |
| `RondasAlertasClient.tsx` | Filtros 2 filas + tabla mejorada |
| `RondasConfiguracionClient.tsx` | Wizard 3 pasos + layout 50/50 |
| `RondasReportesClient.tsx` | KPIs con tendencia + pills periodo |
| `RondasCentroIaClient.tsx` | Ajustes menores + historial |

### Nuevos archivos (primitivos extraídos)
| Archivo | Propósito |
|---------|-----------|
| `TrustScoreGauge.tsx` | SVG circular gauge, colores por rango |
| `StatusBadge.tsx` | Pill con dot de color semántico |
| `FilterPills.tsx` | Row de chips de filtro seleccionables |
| `EventFeedItem.tsx` | Fila de evento para timelines |
| `RondaRowCard.tsx` | Card mobile de ronda (tabla → card) |

---

## Diseño por Pantalla

### 1. Dashboard (`/ops/rondas`)

**Layout:**
```
[Header: "Rondas de hoy · badge período]
[KPI 1: Activas][KPI 2: Completadas][KPI 3: Atrasadas][KPI 4: Pendientes]
[Trust Score Hero — gauge circular grande con tendencia y desglose]
[Filtros pill: Todas | En curso | Atrasadas | Pendientes | Completadas]
[Tabla]
```

**Tabla — columnas:**
- Instalación + Guardia (dos líneas)
- Estado (StatusBadge)
- Hora programada
- Progreso (barra 4px + `X/Y checks`)
- Trust (TrustScoreGauge mini)
- Acción (botón Ver)

**Filas atrasadas:** `bg-red-500/5 border-l-2 border-red-500`
**ETA:** mostrar estimado para rondas activas en columna Hora

---

### 2. Monitor (`/ops/rondas/monitoreo`)

**Layout desktop:** `flex h-full` — mapa `flex-1` + panel `w-80`

**Mapa:**
- Badge "En vivo" con `animate-pulse` dot verde
- Markers circulares con iniciales del guardia, color por estado
- Geocercas como círculos con `fillOpacity: 0.1`

**Panel lateral (3 secciones fijas):**
```
[Guardias en turno]
  Avatar | Nombre | Progreso bar | "hace Xm"
  Si alerta: border-red + botón "Llamar"

[Feed de eventos — scroll]
  EventFeedItem: ícono | mensaje | timestamp relativo

[Botón fijo: "Cerrar turno con resumen IA" bg-accent]
```

**Mobile:** mapa fullscreen + `Sheet` de shadcn como bottom sheet deslizable

---

### 3. Alertas (`/ops/rondas/alertas`)

**Filtros — 2 filas:**
```
Row 1: [Crítica][Warning][Info][Todas]  [Input: Instalación]  [Date range]
Row 2: [No resueltas][Reconocidas][Resueltas][Todas]
```

**Tabla:**
- Dot color + Timestamp | Instalación | Guardia | Descripción | Estado | Acciones
- Acciones: Reconocer / Resolver / Ver ronda

**Empty state:** icono de escudo + "Sistema activo · Monitoreando X rondas activas"

**Motor de detección:** mover a toggles configurables con contadores de alertas generadas

---

### 4. Configuración (`/ops/rondas/configuracion`) ⭐ Más compleja

**Header fijo sticky:**
```
[Selector cliente] [Selector instalación] [Badge: X checkpoints · Y plantillas · Z programaciones]
```

**Wizard tabs con estado visual:**
```
① Checkpoints ✓  →  ② Plantillas  →  ③ Programación
```
Cada step muestra: número + ícono de completado si tiene datos + descripción

**Step 1 — Checkpoints (layout 50/50):**
- Izq: mapa Google Maps, click para agregar nuevo checkpoint
- Der: lista de cards con número, nombre editable inline, badges (tipo, radio, crítico)
- Card vacía dashed: "+ Agregar checkpoint"
- Tipos: QR (purple), Geocerca (accent), NFC (blue)

**Step 2 — Plantillas (layout 50/50):**
- Izq: input nombre + lista checkpoints drag-and-drop (orden) + modo flexible/secuencial + duración estimada
- Der: mapa preview con ruta (línea dashed conectando checkpoints)
- Cards de plantillas existentes: nombre | tipo | duración | checkpoints | estado | editar/eliminar

**Step 3 — Programación (layout 50/50):**
- Izq: form (selector plantilla, hora inicio/fin, frecuencia, tolerancia, días activos)
- Der: timeline vertical de rondas que se generarán + resumen "X rondas/noche · Y/semana"
- Tabla de programaciones existentes con toggle activo/pausado

---

### 5. Reportes (`/ops/rondas/reportes`)

**KPIs con tendencia:**
```
[Compliance ↑8%][Trust Score ↓2%][Completadas ↑12%][Tiempo promedio →]
```

**Selector periodo:** `[7d][14d][30d]` como pills

**Gráfico barras:** colores por rango de Trust (verde ≥90, accent 70-89, warning <70)

**Mantiene tabs:** Por Instalación / Por Guardia / Mapa de calor

**Tabla mejorada:** Trust como badge circular, Estado con color, Export prominente

---

### 6. Centro IA (`/ops/rondas/centro-ia`)

**Estructura dual (ya bien diseñada, ajustes menores):**
- Izq: Detección de anomalías — toggles con contadores "12 alertas este mes"
- Der: Recomendaciones IA — auto-generadas al cargar, sin esperar click

**Trust Score:** pesos configurables por instalación (sliders)

**Nueva sección:** "Historial de recomendaciones" — colapsable, con fecha y acciones tomadas

---

## Mobile-First

| Breakpoint | Comportamiento |
|-----------|----------------|
| 375px | 1-2 cols, tablas → cards, sidebar → bottom nav |
| 768px | 2 cols, panel lateral colapsable |
| 1024px | Layout completo |
| 1440px | Paneles más anchos, más data visible |

Touch targets mínimo 44px en todas las acciones.

---

## Restricciones de Implementación

1. Solo Tailwind classes existentes en el proyecto
2. Animaciones CSS puras (`animate-pulse`, `transition-all`) — sin framer-motion nuevo
3. Maps: Google Maps (ya integrado) — mejorar UX de interacción, no cambiar proveedor
4. Todos los textos en español
5. Drag-and-drop en Plantillas: usar HTML5 nativo o librería ya presente en el proyecto
6. Sin nuevas dependencias NPM a menos que sean estrictamente necesarias
