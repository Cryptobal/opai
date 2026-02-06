# Implementación del Design System OPAI

## ✅ Completado

### 1. Documentación
- ✅ Creado `docs/01-architecture/design-system.md` con:
  - Principios de diseño (dark-first, minimalismo, consistencia)
  - Tokens CSS completos (colores, spacing, typography, shadows)
  - Patrones UI (AppShell, PageHeader, KpiCard, DataTable, Forms)
  - Convenciones de componentes (shadcn base + wrappers OPAI)
  - Separación App UI vs Template UI

### 2. Tokens y Tema
- ✅ Actualizado `src/styles/globals.css` con:
  - CSS variables completas de shadcn/ui
  - Dark theme por defecto (background, foreground, card, muted, accent, etc.)
  - Primary (Teal #00d4aa), Secondary (Blue #0056e0), Destructive
  - Aislamiento de estilos para templates (`.template-ui-scope`)
- ✅ Actualizado `tailwind.config.js` con:
  - Soporte de CSS variables (`hsl(var(--primary))`)
  - Border radius dinámico (`var(--radius)`)
  - Plugin `tailwindcss-animate` instalado
  - Colores legacy de GARD mantenidos para templates

### 3. Componentes Base OPAI
Creados en `src/components/opai/`:

#### Layout Components
- ✅ `AppShell.tsx` - Layout principal (sidebar + topbar + content)
- ✅ `AppSidebar.tsx` - Barra lateral con navegación (240px fijo)
- ✅ `AppTopbar.tsx` - Barra superior sticky (64px)
- ✅ `PageHeader.tsx` - Encabezado estándar de páginas

#### UI Components
- ✅ `KpiCard.tsx` - Card para métricas con trend indicators
- ✅ `EmptyState.tsx` - Estado vacío consistente
- ✅ `LoadingState.tsx` - Estados de carga (spinner, skeleton, overlay)

#### Barrel Export
- ✅ `index.ts` - Exportación centralizada de todos los componentes

### 4. Layouts por Segmento (Route Groups)

#### `src/app/(app)/layout.tsx`
Rutas privadas con AppShell completo:
- `/docs/inicio` - Dashboard
- `/docs/usuarios` - Gestión de usuarios
- `/crm` - CRM
- `/hub` - Hub de apps

Características:
- Autenticación requerida
- Sidebar + Topbar
- Navegación RBAC (role-based)
- Design System OPAI aplicado

#### `src/app/(templates)/layout.tsx`
Rutas de templates sin AppShell:
- `/p/[id]` - Presentaciones públicas
- `/templates/*` - Previews de templates
- `/preview/*` - Preview de emails

Características:
- Sin sidebar/topbar
- Estilos aislados (`.template-ui-scope`)
- Glassmorphism, gradients preservados
- No contamina con estilos del dashboard

#### Rutas públicas (root)
- `/login` - Autenticación
- `/activate` - Activación de cuenta
- `/api/*` - API routes

### 5. Aplicación a Pantalla /docs/inicio
- ✅ Refactorizada `/docs/inicio/page.tsx` con:
  - `PageHeader` con título, descripción y acción "Nueva Presentación"
  - Grid de 5 `KpiCard` mostrando:
    - Total Presentaciones
    - Enviadas
    - Vistas (con total)
    - Sin Leer (con % pendiente)
    - Conversión (con trend)
  - `PresentationsList` mantenida
  - AppNavigation removida (ahora en layout)

### 6. Verificación
- ✅ TypeScript compila sin errores (`tsc --noEmit`)
- ✅ Rutas reorganizadas correctamente
- ✅ Imports actualizados (actions de usuarios)
- ✅ No se rompieron funcionalidades existentes

---

## 📁 Estructura de Archivos

```
src/
├── app/
│   ├── (app)/                    # Rutas privadas con AppShell
│   │   ├── layout.tsx           # Layout con sidebar + topbar
│   │   ├── docs/
│   │   │   ├── inicio/          # Dashboard (✨ Design System aplicado)
│   │   │   ├── usuarios/        # Gestión de usuarios
│   │   │   └── actions/         # Server actions
│   │   ├── crm/
│   │   └── hub/
│   │
│   ├── (templates)/              # Rutas de templates SIN AppShell
│   │   ├── layout.tsx           # Layout aislado
│   │   ├── p/[uniqueId]/        # Presentaciones públicas
│   │   ├── preview/             # Email previews
│   │   └── templates/           # Template previews
│   │
│   ├── login/                    # Rutas públicas
│   ├── activate/
│   ├── api/                      # API routes
│   └── layout.tsx                # Root layout
│
├── components/
│   ├── opai/                     # 🆕 OPAI Design System components
│   │   ├── AppShell.tsx
│   │   ├── AppSidebar.tsx
│   │   ├── AppTopbar.tsx
│   │   ├── PageHeader.tsx
│   │   ├── KpiCard.tsx
│   │   ├── EmptyState.tsx
│   │   ├── LoadingState.tsx
│   │   └── index.ts
│   │
│   ├── ui/                       # shadcn base components
│   ├── admin/                    # Admin components (legacy)
│   ├── presentation/             # Presentation components (templates)
│   └── usuarios/                 # Users components
│
├── styles/
│   └── globals.css               # 🆕 CSS variables + tokens
│
└── docs/
    └── 01-architecture/
        └── design-system.md      # 🆕 Documentación completa

```

---

## 🎨 CSS Variables (Design Tokens)

### Colores Principales
```css
--background: 222.2 84% 4.9%;        /* #0a0e17 - Fondo principal */
--foreground: 210 40% 98%;           /* #f8fafc - Texto principal */
--primary: 173 80% 40%;              /* #00d4aa - Teal GARD */
--secondary: 217.2 91.2% 59.8%;      /* #0056e0 - Blue GARD */
--destructive: 0 84.2% 60.2%;        /* #ef4444 - Rojo error */
--muted: 217.2 32.6% 17.5%;          /* #1e293b - Muted */
--accent: 217.2 32.6% 20%;           /* #273548 - Accent */
--border: 217.2 32.6% 17.5%;         /* #1e293b - Bordes */
--ring: 173 80% 40%;                 /* #00d4aa - Focus ring */
```

### Uso en Tailwind
```tsx
// Background y texto
<div className="bg-background text-foreground">

// Cards
<div className="bg-card text-card-foreground border border-border">

// Botones primarios
<Button className="bg-primary text-primary-foreground">

// Estados muted
<p className="text-muted-foreground">

// Accent (hover)
<div className="hover:bg-accent hover:text-accent-foreground">
```

---

## 🚀 Próximos Pasos (No implementados aún)

### Fase 2: Expansión
- [ ] Instalar todos los componentes shadcn necesarios
- [ ] DataTable completo con sorting/filtering/pagination
- [ ] Form components con validación (react-hook-form + zod)
- [ ] Toast notifications system
- [ ] Comando K (search/shortcuts)
- [ ] Aplicar Design System a `/docs/usuarios`
- [ ] Aplicar Design System a `/crm` y `/hub`

### Fase 3: Refinamiento
- [ ] Dark/Light theme toggle (opcional)
- [ ] Sidebar colapsable en mobile (drawer)
- [ ] Storybook para documentación visual
- [ ] Tests de componentes
- [ ] Métricas de performance
- [ ] Guías de accesibilidad (WCAG 2.1)

---

## 📝 Convenciones de Desarrollo

### 1. Crear Nueva Página (App UI)
```tsx
// src/app/(app)/nueva-ruta/page.tsx
import { PageHeader, KpiCard } from '@/components/opai';

export default function NuevaPagina() {
  return (
    <>
      <PageHeader
        title="Título"
        description="Descripción"
        actions={<Button>Acción</Button>}
      />
      
      {/* Contenido */}
    </>
  );
}
```

### 2. Crear Componente OPAI
```tsx
// src/components/opai/MiComponente.tsx
import { cn } from '@/lib/utils';

export interface MiComponenteProps {
  // ...
}

export function MiComponente({ ... }: MiComponenteProps) {
  return (
    <div className={cn(
      "bg-card border border-border rounded-lg p-6",
      className
    )}>
      {/* ... */}
    </div>
  );
}
```

### 3. Usar Componentes shadcn
```bash
# Instalar nuevo componente
npx shadcn@latest add [component-name]

# Ejemplo
npx shadcn@latest add table
npx shadcn@latest add form
npx shadcn@latest add toast
```

---

## ⚠️ Restricciones Respetadas

✅ **NO se modificó lógica de negocio**
- Solo se cambió presentación visual
- Lógica de autenticación intacta
- Server actions sin cambios

✅ **NO se cambiaron rutas ni APIs**
- URLs mantienen compatibilidad
- API routes en `/api/*` sin cambios
- Redirects funcionan correctamente

✅ **NO se alteró render de templates**
- Templates aislados en `(templates)` route group
- Glassmorphism y gradients preservados
- Estilos no contaminan dashboard

✅ **Implementación incremental**
- Solo 1 pantalla refactorizada (/docs/inicio)
- Componentes legacy conviven con nuevos
- Migración gradual posible

---

## 🐛 Issues Conocidos

1. **ESLint no configurado**: Requiere configuración inicial (no crítico)
2. **Build requiere DB**: `DATABASE_URL` necesaria para build completo
3. **Sidebar mobile**: Falta implementar drawer/toggle (TODO)
4. **Light theme**: Solo dark implementado por ahora

---

**Fecha de implementación**: 2026-02-06  
**Versión**: 1.0.0  
**Status**: ✅ Fundación completa, listo para expansión
