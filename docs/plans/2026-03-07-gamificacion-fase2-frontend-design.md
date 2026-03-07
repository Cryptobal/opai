# Gamificación Fase 2 — Frontend Completo (Design Doc)

**Fecha**: 2026-03-07
**Stack**: Next.js 15 App Router, React 18, TypeScript, Tailwind CSS, shadcn/ui
**Prerrequisito**: Fase 1 (backend) completa — 12 modelos Prisma, servicios en `src/lib/gamification/`, cron job, 29 API routes

---

## Contexto del Codebase

### Componentes OPAI reutilizables
- `PageHeader` — títulos de página con back nav y acciones
- `KpiCard` / `KpiGrid` — cards de métricas con variantes de color y tendencia
- `DataTable` — tablas con renderers custom, loading/empty states
- `DetailLayout` — páginas de detalle con secciones colapsables + drag-and-drop
- `ChipTabs` — tabs estilo pill con ícono teal activo
- `EmptyState` / `LoadingState` — estados de carga/vacío
- `SectionNav` — navegación horizontal/vertical responsive
- shadcn/ui: Card, Badge, Button, Dialog, Sheet, Select, Input, Switch, Progress, Skeleton

### Patrones establecidos
- **Data fetching**: `fetch()` + `useState` + `useCallback` + `Promise.all()`. Response: `{ success, data?, error? }`
- **Dark mode**: ThemeProvider custom con `dark:` classes. Tokens semánticos (bg-card, text-muted-foreground, border-border)
- **Charts**: Recharts v3 con `ResponsiveContainer`, tooltips custom, paleta con teal como primario
- **Iconos**: Lucide React
- **Layout portal**: bottom nav fija + header sticky + main con pb-20

---

## Superficie 1: Ficha del Guardia — Tab "Desempeño"

**Archivo**: `src/components/ops/GuardiaDetailClient.tsx`
**Integración**: Agregar 7mo tab al `ChipTabs` existente (TabKey, TABS[], renderTabContent())

### Contenido del tab

1. **Header Trust Score** — Gauge SVG circular (0-100) + nivel + puntos del mes + racha + ranking
2. **Desglose por dimensión** — 5 barras de progreso con colores por dimensión
3. **Badges obtenidos** — Grid de badges ganados + bloqueados en gris
4. **Historial de puntos** — Lista paginada filtrable por dimensión
5. **Tendencia** — LineChart recharts últimos 6 meses
6. **Reconocimientos recibidos** — Últimos 5

### APIs consumidas
- `GET /api/gamification/guardia/[id]`
- `GET /api/portal/guardia/gamification/historial` (con guardiaId param)
- `GET /api/portal/guardia/gamification/tendencia` (con guardiaId param)

---

## Superficie 2: Ficha de Instalación — Sección Desempeño

**Integración**: Agregar sección colapsable en la ficha de instalación existente

### Contenido
- Trust Score promedio + comparación con promedio Gard
- Tabla de guardias ordenada por Trust Score (nombre, score, nivel, puntos, racha, tendencia)
- KPIs: guardias activos, trust score promedio, racha promedio, badges del mes, asistencia %

### API: `GET /api/gamification/instalacion/[id]`

---

## Superficie 3: Portal del Guardia — Sección "Desempeño" (Mobile-First)

**Archivo**: `src/components/portal/GuardPortalClient.tsx`
**Integración**: Nueva sección en bottom nav (7ma)

### Vistas (sub-tabs internos con ChipTabs)
1. **Mi Scorecard** — gauge + nivel + progresión + grid 2x2 KPIs + dimensiones + feed
2. **Mi Ranking** — percentil + lista anónima ± 5 posiciones + top movers
3. **Mis Badges** — grid de badges ganados + por desbloquear (secretos ocultos)
4. **Desafíos** — lista activos con progreso personal
5. **Reconocimiento** — enviar + feed social
6. **Beneficios** — catálogo + canjear

### Reglas mobile
- Touch targets ≥ 44px, body text ≥ 16px
- Cards en vez de tablas
- pb-20 para bottom nav
- safe-area-pb en nav

### APIs: todas las de `/api/portal/guardia/gamification/*`

---

## Superficie 4: Portal del Cliente — Performance

**Archivo**: `src/app/portal/cliente/PortalClienteClient.tsx`
**Integración**: Nueva sección en navegación del portal cliente

### Contenido (por instalación)
- Trust Score promedio como gauge + tendencia sparkline
- Ranking de guardias CON nombres (tabla)
- KPIs: asistencia %, rondas completadas %, días sin incidentes, evaluación supervisor

### APIs: `/api/portal/cliente/gamification/instalacion/[id]`, `/api/portal/cliente/gamification/comparativa`

---

## Superficie 5: Configuración Admin

**Archivo**: `src/app/(app)/opai/configuracion/page.tsx`
**Integración**: Nueva sección "Gamificación" en el listado de configuración

### Sub-páginas
1. **Configuración general** — pesos, puntos por acción, niveles, toggles, kill switch
2. **Gestión de Badges** — CRUD
3. **Gestión de Desafíos** — CRUD + progreso
4. **Gestión de Fondos de Premio** — CRUD + sugerencias de bono
5. **Gestión de Beneficios** — CRUD
6. **Dashboard Gamificación** — KPIs globales, distribución, top instalaciones, top movers, feed

### APIs: todas las de `/api/gamification/*`

---

## Componentes Compartidos

```
src/components/gamification/
├── TrustScoreGauge.tsx        // SVG circular gauge (0-100) con colores por rango
├── DimensionBreakdown.tsx     // 5 barras de progreso con colores
├── BadgeGrid.tsx              // grid de badges (ganados + bloqueados)
├── BadgeCard.tsx              // card individual con tooltip
├── PointsHistory.tsx          // lista/tabla de historial paginada
├── TrendChart.tsx             // LineChart recharts
├── NivelBadge.tsx             // pill del nivel con color
├── StreakCounter.tsx           // 🔥 + número
├── RankingPosition.tsx        // "Top 15% — #2 de 12"
├── GuardiaDesempenoTab.tsx    // tab completo para ficha de guardia
├── InstalacionDesempenoSection.tsx
├── InstalacionRankingTable.tsx
└── InstalacionKPIs.tsx
```

---

## Colores

### Por dimensión
- Rondas: teal (#14b8a6)
- Asistencia: cyan (#22d3ee)
- Sistema Digital: purple (#8b5cf6)
- Supervisión: yellow (#eab308)
- Capacitación: orange (#f97316)
- Social: pink (#ec4899)

### Trust Score
- ≥85: teal | ≥70: yellow | ≥50: orange | <50: red

### Niveles
- Centinela: amber | Vigía: slate | Guardián: yellow | Protector: cyan | Comandante: teal

### Puntos
- Positivos: emerald | Negativos: red
