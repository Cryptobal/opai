# Design System OPAI

> **Objetivo**: Sistema de diseño consistente, escalable y de nivel mundial para toda la suite OPAI, basado en shadcn/ui + Tailwind CSS con enfoque dark-first.

## Tabla de Contenidos

1. [Principios de Diseño](#principios-de-diseño)
2. [Tokens de Diseño](#tokens-de-diseño)
3. [Patrones UI](#patrones-ui)
4. [Componentes](#componentes)
5. [Separación App UI vs Template UI](#separación-app-ui-vs-template-ui)
6. [Guías de Implementación](#guías-de-implementación)

---

## Principios de Diseño

### 1. Dark-First
- **Dark mode por defecto**: Todo el sistema usa dark mode como tema principal
- **Optimizado para uso prolongado**: Colores suaves, contraste adecuado sin fatiga visual
- **Profesional y board-level**: Estética minimalista y sofisticada apropiada para C-level

### 2. Minimalismo Funcional
- **Menos es más**: Solo elementos esenciales, sin decoración innecesaria
- **Jerarquía clara**: Títulos, contenido y acciones perfectamente diferenciados
- **Espaciado generoso**: Uso de whitespace para respirabilidad

### 3. Consistencia Total
- **Un solo componente por función**: No duplicar componentes similares
- **Tokens centralizados**: Todos los valores vienen de CSS variables
- **Patrones repetibles**: Layouts y estructuras predecibles

### 4. Performance First
- **Zero-runtime CSS**: Todo en Tailwind (compile-time)
- **Componentes livianos**: Sin dependencias pesadas
- **Code splitting**: Componentes de UI separados de templates

---

## Tokens de Diseño

### Colores Base (CSS Variables)

#### Background
```css
--background: 222.2 84% 4.9%;        /* #0a0e17 - Fondo principal */
--foreground: 210 40% 98%;           /* #f8fafc - Texto principal */
```

#### Cards & Containers
```css
--card: 222.2 84% 10%;               /* #1a1f2e - Fondo de cards */
--card-foreground: 210 40% 98%;      /* #f8fafc - Texto en cards */
--popover: 222.2 84% 10%;            /* #1a1f2e - Popovers/dropdowns */
--popover-foreground: 210 40% 98%;   /* #f8fafc - Texto en popovers */
```

#### Borders & Dividers
```css
--border: 217.2 32.6% 17.5%;         /* #1e293b - Bordes sutiles */
--input: 217.2 32.6% 17.5%;          /* #1e293b - Input borders */
```

#### Muted (Estados secundarios)
```css
--muted: 217.2 32.6% 17.5%;          /* #1e293b - Fondo muted */
--muted-foreground: 215 20.2% 65.1%; /* #94a3b8 - Texto muted */
```

#### Accent (Hover/Focus)
```css
--accent: 217.2 32.6% 17.5%;         /* #1e293b - Fondo accent */
--accent-foreground: 210 40% 98%;    /* #f8fafc - Texto accent */
```

#### Primary (Acción principal - Teal GARD)
```css
--primary: 173 80% 40%;              /* #00d4aa - Teal principal */
--primary-foreground: 222.2 47.4% 11.2%; /* #0f1729 - Texto en primary */
```

#### Secondary (Acción secundaria - Blue GARD)
```css
--secondary: 217.2 91.2% 59.8%;      /* #0056e0 - Azul principal */
--secondary-foreground: 210 40% 98%; /* #f8fafc - Texto en secondary */
```

#### Destructive (Errores/Eliminar)
```css
--destructive: 0 84.2% 60.2%;        /* #ef4444 - Rojo error */
--destructive-foreground: 210 40% 98%; /* #f8fafc - Texto en destructive */
```

#### Ring (Focus states)
```css
--ring: 173 80% 40%;                 /* #00d4aa - Teal para focus ring */
```

#### Chart Colors (Para gráficos y visualizaciones)
```css
--chart-1: 173 80% 40%;              /* #00d4aa - Teal */
--chart-2: 217.2 91.2% 59.8%;        /* #0056e0 - Blue */
--chart-3: 142 71% 45%;              /* #10b981 - Green */
--chart-4: 47 96% 53%;               /* #fbbf24 - Amber */
--chart-5: 340 82% 52%;              /* #ec4899 - Pink */
```

### Spacing Scale

Usar Tailwind spacing (basado en 4px):

```js
{
  0: '0px',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px - Base spacing
  6: '1.5rem',   // 24px
  8: '2rem',     // 32px
  12: '3rem',    // 48px - Section spacing
  16: '4rem',    // 64px
  24: '6rem',    // 96px - Large gaps
}
```

**Convención de uso**:
- `gap-4`: Spacing interno de componentes
- `gap-6`: Entre grupos de elementos
- `gap-8`: Entre secciones dentro de una página
- `gap-12`: Entre secciones principales

### Border Radius

```js
{
  none: '0',
  sm: '0.125rem',    // 2px - Badges, pequeños elementos
  DEFAULT: '0.375rem', // 6px - Botones, inputs
  md: '0.5rem',      // 8px - Cards, paneles
  lg: '0.75rem',     // 12px - Modales, grandes containers
  xl: '1rem',        // 16px - Hero sections
  '2xl': '1.5rem',   // 24px - Raramente usado
  full: '9999px',    // Pills, avatares
}
```

### Typography

#### Font Families
```css
font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace
```

#### Scale de Tamaños
```js
{
  xs: '0.75rem',     // 12px - Captions, badges
  sm: '0.875rem',    // 14px - Secondary text
  base: '1rem',      // 16px - Body text
  lg: '1.125rem',    // 18px - Large body
  xl: '1.25rem',     // 20px - Small headings
  '2xl': '1.5rem',   // 24px - H3
  '3xl': '1.875rem', // 30px - H2
  '4xl': '2.25rem',  // 36px - H1
  '5xl': '3rem',     // 48px - Display
  '6xl': '3.75rem',  // 60px - Hero
}
```

#### Font Weights
- `font-normal`: 400 - Body text
- `font-medium`: 500 - Emphasized text
- `font-semibold`: 600 - Subheadings
- `font-bold`: 700 - Headings

### Shadows

```css
sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)'
DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'
md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'
xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
```

---

## Patrones UI

### AppShell (Layout Principal)

Estructura de 3 zonas para toda la aplicación (dashboard, usuarios, etc.):

```
┌─────────────────────────────────────────┐
│  AppTopbar (64px height)                │
├─────────┬───────────────────────────────┤
│         │                               │
│ AppSide │  Main Content Area            │
│ bar     │  (PageHeader + Content)       │
│ (240px) │                               │
│         │                               │
│         │                               │
└─────────┴───────────────────────────────┘
```

**Características**:
- Sidebar fijo (240px) con navegación principal
- Topbar sticky (64px) con user menu y tenant selector
- Content area con scroll independiente
- Responsive: sidebar colapsable en mobile

### PageHeader

Encabezado estándar para todas las páginas internas:

```tsx
<PageHeader
  title="Título de la Página"
  description="Descripción breve y concisa"
  actions={<Button>Acción Principal</Button>}
/>
```

**Estructura**:
- Title: `text-3xl font-bold`
- Description: `text-muted-foreground text-base`
- Actions: alineadas a la derecha
- Divider inferior: `border-b border-border`

### KpiCard

Card estándar para métricas y KPIs:

```tsx
<KpiCard
  title="Total Presentaciones"
  value="127"
  description="+12% vs mes anterior"
  icon={<FileText />}
  trend="up" // 'up' | 'down' | 'neutral'
/>
```

**Estructura**:
- Background: `bg-card border border-border rounded-lg`
- Padding: `p-6`
- Value destacado: `text-4xl font-bold`
- Trend indicator con color semántico

### DataTable

Tabla estándar para listados:

```tsx
<DataTable
  columns={columns}
  data={data}
  searchable={true}
  pagination={true}
/>
```

**Características**:
- Header: `bg-muted/50 border-b border-border`
- Rows: hover state `hover:bg-accent`
- Zebra striping opcional
- Sorting, filtering y pagination integrados

### Forms

Formularios consistentes:

```tsx
<Form>
  <FormField
    label="Email"
    error="Email inválido"
  >
    <Input type="email" />
  </FormField>
  
  <FormActions>
    <Button variant="outline">Cancelar</Button>
    <Button>Guardar</Button>
  </FormActions>
</Form>
```

**Convenciones**:
- Labels: `text-sm font-medium`
- Inputs: `border-input focus-visible:ring-ring`
- Errors: `text-destructive text-sm`
- Actions: siempre al final, alineados a la derecha

### Empty States

Estado vacío estándar:

```tsx
<EmptyState
  icon={<Inbox />}
  title="No hay presentaciones"
  description="Crea tu primera presentación para comenzar"
  action={<Button>Crear Presentación</Button>}
/>
```

### Loading States

Estados de carga consistentes:

```tsx
<LoadingState type="skeleton" /> // Skeleton cards
<LoadingState type="spinner" />  // Spinner centrado
<LoadingState type="overlay" />  // Overlay con blur
```

---

## Componentes

### Jerarquía de Componentes

```
src/components/
├── ui/                    # shadcn base components (sin modificar)
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   └── ...
│
├── opai/                  # OPAI custom components (wrappers)
│   ├── AppShell.tsx
│   ├── AppSidebar.tsx
│   ├── AppTopbar.tsx
│   ├── PageHeader.tsx
│   ├── KpiCard.tsx
│   ├── EmptyState.tsx
│   └── LoadingState.tsx
│
└── [domain]/              # Domain-specific components
    ├── admin/             # Admin components
    ├── presentation/      # Presentation components (templates)
    └── usuarios/          # Users components
```

### Convenciones de Componentes

#### 1. shadcn Base Components (`components/ui/`)
- **NO MODIFICAR**: Usar shadcn CLI para generar y actualizar
- Propósito: primitivas reutilizables y accesibles
- Ejemplo: `Button`, `Card`, `Input`, `Dialog`

#### 2. OPAI Components (`components/opai/`)
- **Wrappers y composiciones** de componentes shadcn
- Propósito: componentes específicos de OPAI con lógica de negocio
- Convenciones:
  - Siempre usar componentes `ui/` como base
  - Props con defaults sensatos para OPAI
  - TypeScript estricto
  - Exports nombrados preferidos

```tsx
// ✅ CORRECTO
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-6">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-2">{description}</p>
        )}
      </div>
      {actions && <div>{actions}</div>}
    </div>
  );
}

// ❌ INCORRECTO - No usar divs planos sin semántica
export default ({ title }) => <div>{title}</div>;
```

#### 3. Domain Components (`components/[domain]/`)
- Componentes específicos de features/módulos
- Pueden usar tanto `ui/` como `opai/`
- Ejemplos: `DashboardContent`, `PresentationsList`, `UsersTable`

---

## Separación App UI vs Template UI

### Problema
Las presentaciones públicas (`/p/[id]`) tienen su propio diseño visual (glassmorphism, gradients, animations) que NO debe contaminarse con los estilos del dashboard.

### Solución: Route Groups

#### 1. App UI (Dashboard, Admin, etc.)
**Route**: `src/app/(app)/`

Rutas incluidas:
- `/docs/inicio` - Dashboard
- `/docs/usuarios` - Gestión de usuarios
- `/crm` - CRM
- `/hub` - Hub de apps
- Cualquier ruta privada de administración

**Layout**: Usa `AppShell` completo (sidebar + topbar)

```tsx
// src/app/(app)/layout.tsx
export default function AppLayout({ children }) {
  return (
    <AppShell>
      {children}
    </AppShell>
  );
}
```

#### 2. Template UI (Presentaciones, Previews)
**Route**: `src/app/(templates)/`

Rutas incluidas:
- `/p/[id]` - Presentaciones públicas
- `/templates/*` - Previews de templates
- `/preview/*` - Preview de emails

**Layout**: Sin AppShell, estilos aislados

```tsx
// src/app/(templates)/layout.tsx
export default function TemplatesLayout({ children }) {
  return (
    <div className="template-ui-scope">
      {children}
    </div>
  );
}
```

**Aislamiento de estilos**:
```css
/* globals.css */
/* Estilos de templates solo aplican dentro de .template-ui-scope */
.template-ui-scope {
  /* Glassmorphism, gradients, etc. */
}
```

#### 3. Public/Auth Routes
Rutas como `/login`, `/activate` quedan en root sin group.

---

## Guías de Implementación

### Workflow: Agregar Nueva Pantalla

1. **Identificar categoría**: ¿Es App UI o Template UI?
2. **Crear página en route group correcto**:
   - App UI → `(app)/nueva-ruta/page.tsx`
   - Template UI → `(templates)/nueva-ruta/page.tsx`
3. **Usar PageHeader** (solo App UI):
   ```tsx
   <PageHeader
     title="Nueva Pantalla"
     description="Descripción"
     actions={<Button>Acción</Button>}
   />
   ```
4. **Usar componentes OPAI** para consistencia:
   - KpiCard para métricas
   - EmptyState para estados vacíos
   - LoadingState para cargas
5. **Seguir spacing conventions**: `gap-8` entre secciones

### Workflow: Crear Nuevo Componente

1. **¿Ya existe en shadcn?**
   - Sí → Usar `npx shadcn@latest add [component]`
   - No → Continuar al paso 2
2. **¿Es genérico o específico de OPAI?**
   - Genérico → Crear en `components/ui/`
   - Específico → Crear en `components/opai/`
3. **Seguir convenciones**:
   - TypeScript con interfaces exportadas
   - Usar tokens CSS (no hardcodear colores)
   - Props con defaults sensatos
   - Accesibilidad (ARIA labels, keyboard nav)
4. **Documentar en Storybook** (futuro)

### Checklist Pre-Deploy

- [ ] Build pasa sin errores (`npm run build`)
- [ ] No hay hardcoded colors (usar CSS variables)
- [ ] Componentes en carpetas correctas (`ui/` vs `opai/`)
- [ ] Templates NO heredan estilos de App UI
- [ ] Dark theme consistente (no "grises distintos")
- [ ] Responsive funciona (test en mobile)
- [ ] Accesibilidad básica (contraste, keyboard nav)

---

## Roadmap

### Fase 1: Fundación (Actual)
- [x] Documentación de Design System
- [ ] Tokens CSS actualizados en globals.css
- [ ] Componentes OPAI base (AppShell, PageHeader, KpiCard)
- [ ] Layouts por segmento ((app) y (templates))
- [ ] Aplicación a 1-2 pantallas

### Fase 2: Expansión
- [ ] Todos los componentes shadcn instalados
- [ ] DataTable completo con sorting/filtering
- [ ] Form components con validación
- [ ] Toast notifications system
- [ ] Comandos K (search/shortcuts)

### Fase 3: Refinamiento
- [ ] Dark/Light theme toggle (opcional)
- [ ] Storybook para documentación visual
- [ ] Tests de componentes
- [ ] Métricas de performance
- [ ] Guías de accesibilidad detalladas

---

## Referencias

- **shadcn/ui**: https://ui.shadcn.com
- **Tailwind CSS**: https://tailwindcss.com
- **Radix UI**: https://radix-ui.com (base de shadcn)
- **WCAG 2.1**: https://www.w3.org/WAI/WCAG21/quickref/

---

**Última actualización**: 2026-02-06
**Responsable**: Equipo OPAI
**Versión**: 1.0.0
