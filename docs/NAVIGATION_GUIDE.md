# Navigation Guide — Opai Gold Standard

## Anatomía de una página

Toda página de la app sigue ESTE orden vertical, sin excepciones:

1. **Topbar** (fixed, viene del AppShell)
2. **Sidebar** (fixed left, viene del AppShell)
3. **AutoBreadcrumbs** — derivado del registry, último segmento en `text-primary`. Montado automáticamente en `AppShell` — no hay que agregarlo en cada página.
4. **ModuleSubNav** — pills N3, montado en `layout.tsx` del módulo padre
5. **PageHero** — título, subtítulo opcional, descripción, actions
6. **Contenido**

Items 3 y 4 vienen automáticos. Item 5 (PageHero) y 6 (contenido) los pone cada `page.tsx`.

## Reglas inmutables

- ❌ **No crear** `<ModuleSubNav>` inline en `page.tsx` — siempre en `layout.tsx`.
- ❌ **No usar** `useState<TabId>` para navegación entre vistas — son rutas.
- ❌ **No agregar** props `eyebrow` al `PageHero` — fue eliminada (los breadcrumbs la reemplazan).
- ❌ **No agregar** items hardcoded al sidebar — todo va en `registry.ts`.
- ❌ **No mostrar** `<AutoBreadcrumbs>` adicional dentro de un `page.tsx` — `AppShell` ya la monta.
- ✅ **Sí agregar** `hideInSidebar: true` cuando un módulo tiene UI dedicada en topbar (ej: Configuración).
- ✅ **Sí agregar** `<ModuleSubNav>` al `layout.tsx` de cualquier módulo nuevo con N3.

## Cómo agregar una página nueva

### Caso 1 — Página dentro de un módulo existente con layout

Ejemplo: agregar `/finanzas/facturacion/notas-pdf` (vista de PDFs masivos).

1. Crear `src/app/(app)/finanzas/facturacion/notas-pdf/page.tsx`:

```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  resolvePagePerms,
  hasModuleAccess,
} from "@/lib/permissions-server";
import { PageShell } from "@/components/opai-ds";
import { FileText } from "lucide-react";

export default async function NotasPdfPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/notas-pdf");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");

  return (
    <PageShell
      hero={{
        icon: <FileText />,
        iconTone: "teal",
        title: "Notas PDF",
        description: "Descargas masivas de notas en PDF.",
      }}
    >
      {/* Tu contenido */}
    </PageShell>
  );
}
```

2. Si querés que aparezca en el N3 del módulo, agregala al registry como child de `finance-ventas` en `src/lib/nav/registry.ts`.

3. Listo. El layout padre ya monta `<ModuleSubNav>`; los breadcrumbs los pone `AppShell`.

### Caso 2 — Módulo nuevo

1. Agregar el módulo al registry en `src/lib/nav/registry.ts → NAV_MODULES`:

```ts
{
  key: "minuevo",
  href: "/minuevo",
  label: "Mi Nuevo Módulo",
  icon: Sparkles,
  module: "minuevo",        // requiere permission key
  children: [
    { key: "minuevo-vista1", href: "/minuevo/vista1", label: "Vista 1", icon: Grid3x3 },
    { key: "minuevo-vista2", href: "/minuevo/vista2", label: "Vista 2", icon: Grid3x3 },
  ],
},
```

2. Crear `src/app/(app)/minuevo/layout.tsx`:

```tsx
import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ModuleSubNav } from "@/components/opai-ds";

export default async function MiNuevoLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/minuevo");
  return (
    <div className="space-y-3 min-w-0">
      <ModuleSubNav moduleKey="minuevo" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
```

3. Crear las pages que mencionaste en `children`. Cada una usa `<PageShell>` (o, si preferís código existente, mantené `<PageHero>` directo — `AutoBreadcrumbs` ya está montado en `AppShell`).

### Caso 3 — Detail pages con breadcrumb personalizado

Las páginas de detalle (`/crm/accounts/[id]`, `/finanzas/rendiciones/[id]`) suelen querer mostrar el nombre de la entidad como último segmento del breadcrumb (ej: "Comercial › Cuentas › Polpaico S.A.").

El `<AutoBreadcrumbs />` global lee desde un context (`BreadcrumbTrailingProvider` montado en AppShell). Las detail pages "publican" el nombre de la entidad y AutoBreadcrumbs lo agrega como último crumb.

**Server Component** (la mayoría de las detail pages):

```tsx
import { SetBreadcrumbTrailing } from "@/components/opai-ds";

export default async function CuentaDetailPage({ params }) {
  const cuenta = await loadCuenta(params.id);
  return (
    <>
      <SetBreadcrumbTrailing value={cuenta.name} />
      <PageHero title={cuenta.name} ... />
      ...
    </>
  );
}
```

**Client Component**:

```tsx
"use client";
import { useSetBreadcrumbTrailing } from "@/components/opai-ds";

export function CuentaDetailClient({ cuenta }) {
  useSetBreadcrumbTrailing(cuenta.name);
  return <EntityDetailLayout ... />;
}
```

`EntityDetailLayout` (CRM/Personas) ya hace esto automáticamente — extrae el último segmento del prop `breadcrumb` y lo publica al context. No hace falta agregar nada extra a sus consumidores.

### Caso 4 — Página fuera de jerarquía

Páginas sueltas que no encajan en ningún módulo (ej: `/fiscalizacion`, `/chat`):

- NO usan PageShell.
- Renderizan su propio layout custom.
- NO aparecen en el sidebar (no agregar al registry).
- Como no están en el registry, `AutoBreadcrumbs` se auto-oculta (devuelve `null`).

## Mobile

- Sidebar NO aparece en mobile — solo BottomNav contextual.
- ModuleSubNav se OCULTA en mobile (default `desktop-only`) — el BottomNav ya muestra los hermanos.
- Breadcrumbs colapsan automático cuando hay >3 niveles.
- PageHero responsive: icon-tile arriba en mobile, lateral en desktop ≥sm.

## Componentes clave

| Componente | Path | Uso |
|---|---|---|
| `<PageShell>` | `@/components/opai-ds` | Wrapper opcional para nuevas pages — envuelve breadcrumb override + hero + content |
| `<AutoBreadcrumbs>` | `@/components/opai-ds` | Auto-derivado del registry. Montado globalmente en `AppShell`. |
| `<ModuleSubNav>` | `@/components/opai-ds` | N3 pills, montado en layouts de módulo. Auto-suprime cuando un layout hijo más específico monta el suyo. |
| `<PageHero>` | `@/components/opai-ds` | Título/icon/descripción/actions. Sin prop `eyebrow`. |
| `<AppSidebar>` | `@/components/opai` | Sidebar N1+N2 (no editar sin coordinar). |
| Registry | `@/lib/nav/registry` | Source of truth única. |

## Auto-suppression en ModuleSubNav

Cuando un layout padre (ej: `/finanzas`) y un layout hijo (ej: `/finanzas/facturacion`) ambos montan un `<ModuleSubNav moduleKey="...">`, sólo uno renderiza:

- Si `moduleKey` del padre es ancestro del path actual y existe un `findN3Parent(pathname)` más específico, el padre se auto-suprime (devuelve `null`).
- El hijo siempre gana cuando es más específico.

Esto permite que `/finanzas/facturacion/dtes` muestre el N3 de `finance-ventas` (Resumen / DTEs Emitidos / etc) y NO el de `finance` (Inicio / Rendiciones / etc) — sin condiciones manuales.

## Referencias

- Implementación: `src/lib/nav/registry.ts`, `src/components/opai-ds/AutoBreadcrumbs.tsx`, `src/components/opai-ds/ModuleSubNav.tsx`, `src/components/opai-ds/PageShell.tsx`.
- Lint guard: `scripts/lint-navigation.ts` previene anti-patrones (eyebrow=, ModuleSubNav inline en pages).
