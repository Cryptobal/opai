# AGENTS.md

## Cursor Cloud specific instructions

### Overview

OPAI Suite is a multi-tenant SaaS platform for security companies (Next.js 15 App Router, TypeScript, Prisma ORM, PostgreSQL). See `README.md` for the full module list and tech stack.

### Services

| Service | How to start | Notes |
|---------|-------------|-------|
| **PostgreSQL 16** | `docker run -d --name pgdev -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gard -p 5432:5432 pgvector/pgvector:pg16` | Must use `pgvector/pgvector:pg16` (not `postgres:16-alpine`) because the schema requires the `vector` and `uuid-ossp` extensions. After starting, run: `docker exec pgdev psql -U postgres -d gard -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"` |
| **Next.js Dev Server** | `npm run dev:watch` | Runs on port 3000. Do **not** use `npm run dev` (that does a full build first and fails due to pre-existing lint errors). |

### Database setup (fresh)

1. Start PostgreSQL (see above).
2. `npx prisma db push --accept-data-loss` — syncs schema directly (migration files have ordering issues; use `db push` for local dev).
3. `npx prisma db seed` — creates tenant "gard", admin user (`[REDACTED]` / `GardSecurity2026!`), and reference data.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev:watch` |
| Lint | `npm run lint` |
| Tests | `npx vitest run` |
| DB push | `npx prisma db push --accept-data-loss` |
| DB seed | `npx prisma db seed` |
| Prisma generate | `npx prisma generate` |

### Gotchas

- **`npm install` needs `DATABASE_URL`**: The `postinstall` hook runs `prisma generate`, which requires `DATABASE_URL` in `.env.local`. Create `.env.local` before running `npm install`.
- **`db push` needs `DIRECT_DATABASE_URL`**: Prisma requires this for `db push` and `migrate deploy`. For local Docker, set it equal to `DATABASE_URL` in `.env.local`.
- **Migrations have ordering issues**: Some migrations reference tables created in later migrations. For local dev, use `npx prisma db push` instead of `prisma migrate deploy`.
- **pgvector required**: The `AiDocChunk` model uses a `vector(1536)` column. The Docker image must include pgvector (`pgvector/pgvector:pg16`).
- **ESLint not in original devDependencies**: If eslint is needed, install `eslint` and `eslint-config-next@15.4.11` (match the Next.js version). Create `.eslintrc.json` with `{"extends": "next/core-web-vitals"}`.
- **`npm run dev` vs `npm run dev:watch`**: Use `dev:watch` for development. The `dev` script runs `build && start` which fails due to pre-existing lint errors caught by `next build`.
- **Login credentials (seeded)**: `[REDACTED]` / `GardSecurity2026!` (owner role).
- **Sentry (errores)**: Opcional. Definir `NEXT_PUBLIC_SENTRY_DSN` en `.env.local` (y en Vercel) para enviar errores a Sentry. Ver `.env.example` para `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` (source maps).
- **Connection pool (producción)**: En Vercel, `DATABASE_URL` debe incluir `connection_limit=5&pool_timeout=20` en la query string para evitar "Timed out fetching a new connection" (500). Ver `.env.example`.

---

## DESIGN SYSTEM RULES — DO NOT BREAK

> **Esta sección es ley para Cursor / Claude Code / cualquier agente.**
> El módulo Inventario es la referencia visual. Migrar a este patrón es obligatorio para cada módulo.

### 1. Solo se permiten primitives de `@/components/opai-ds`

```ts
import {
  Surface, SectionHeader, PageHero,
  Stat, StatGrid, Tag, StatusDot, IconBubble,
  EmptyState, Spinner, Skeleton, MetricBar,
  Toolbar, DataTable,
} from "@/components/opai-ds";
```

**No usar nunca para código nuevo:**

- `OpaiSurface`, `OpaiPageHero`, `OpaiSectionHeader` (legacy, en proceso de retiro).
- `KpiCard`, `Pill`, `Bar` de `@/components/opai/conocimiento/_primitives` (dark-only, exclusivos del módulo Conocimiento).
- Clases CSS `card-mock`, `pill-mock`, `bar-mock` (dark-only).

### 2. Solo tokens semánticos para color

| ❌ NO usar                       | ✅ Sí usar                              |
|--------------------------------|--------------------------------------|
| `text-emerald-400`              | `text-status-ok-fg`                   |
| `text-amber-400`                | `text-status-warn-fg`                 |
| `text-red-500`                  | `text-status-danger-fg`               |
| `text-blue-400`                 | `text-status-info-fg` o `text-primary` |
| `bg-emerald-500/10`             | `bg-status-ok-soft`                   |
| `bg-amber-500/10`               | `bg-status-warn-soft`                 |
| `bg-red-500/10`                 | `bg-status-danger-soft`               |
| `border-emerald-500/30`         | `border-status-ok-border`             |
| `border-amber-500/30`           | `border-status-warn-border`           |
| `border-red-500/30`             | `border-status-danger-border`         |
| `text-white/40`, `text-white/50` | `text-ds-text-3` o `text-ds-text-4`   |
| `bg-white/05`, `bg-white/10`    | `bg-ds-surface-1/2/3` según elevación |
| `text-foreground/70`            | `text-ds-text-2`                      |
| `text-muted-foreground/70`      | `text-ds-text-3`                      |
| `text-muted-foreground`         | `text-ds-text-3`                      |
| `bg-foreground/[0.03]`          | `bg-ds-surface-2`                     |
| `border-foreground/[0.06]`      | `border-ds-border-subtle`             |
| `border-border`                 | `border-ds-border-default`            |

### 3. Tipografía mínima legible

- **Prohibido:** `text-[10px]`, `text-[11px]`. (No legible en mobile.)
- **Mínimo permitido:** `text-[12px]` (font-mono / metadata) y `text-[13px]` (body).
- Para títulos usar `font-display` (Outfit Variable). NO usar `font-display` con Exo 2 directamente, esa variante es solo de marketing.

### 4. Touch targets en mobile ≥ 44px

```tsx
// ❌ NO
<Input className="h-9" />
<SelectTrigger className="h-8" />

// ✅ Sí — 44px mobile, 36px desktop
<Input className="h-10 sm:h-9" />
<SelectTrigger className="h-10 sm:h-9" />
```

### 5. Light + Dark obligatorio

Cada componente nuevo debe verse impecable en ambos. Probar con `<html class="dark">` antes de hacer PR. La playground en `/opai-ds-playground` tiene un toggle Light/Dark integrado.

### 6. Mobile-first real

Diseñar primero para 375px. Tablas mobile = lista de `<Surface>` apiladas (`sm:hidden`). Tabla desktop = `<DataTable>` (`hidden sm:block`).

### 7. Animaciones de entrada

Cualquier página o sección con datos cargados usa el wrapper:

```tsx
<div className="ds-page-enter">  // staggered fade-up para hijos directos
  ...
</div>

// y para listas dentro:
<ul className="ds-list-cascade">
  ...
</ul>
```

### 8. KPIs con count-up

```tsx
<Stat label="Productos" value={1247} animate icon={Package} />
```

### 9. Iconos NUNCA planos

Para iconos en list-rows, dialog headers o empty states, usar `IconBubble`:

```tsx
<IconBubble icon={UserRoundCheck} variant="ok" size="md" />
```

Variantes válidas: `brand | neutral | ok | warn | danger | info`. **Nunca arcoíris.** Solo dar color cuando aporta semántica real.

### 10. Validación automática

```bash
npm run check-ds          # corre el guard sobre todo el repo
npm run check-ds:warn     # mismo, pero nunca falla (útil para inspección)
```

El pre-commit hook (`.husky/pre-commit`) corre `check-design-system.mjs` automáticamente y bloquea commits con drift en módulos ya migrados.

### DS Migration Status

Estado actual de la migración. Cuando termina cada módulo, agregarlo a `MIGRATED_PATHS` en `scripts/check-design-system.mjs` y marcarlo aquí:

| Módulo              | Estado      | Path principal                                                |
|---------------------|-------------|---------------------------------------------------------------|
| Inventario          | ✅ Migrado  | `src/components/inventario/`, `src/app/(app)/ops/inventario/` |
| Conocimiento        | ⏳ Pendiente | `src/components/opai/conocimiento/`                           |
| Personas            | ⏳ Pendiente | `src/components/personas/`                                    |
| ATS                 | ⏳ Pendiente | `src/components/ats/`                                         |
| CRM                 | ⏳ Pendiente | `src/components/crm/`                                         |
| Documentos          | ⏳ Pendiente | `src/components/docs/`, `src/components/opai/Documentos*`     |
| Hub / Configuración | ⏳ Pendiente | `src/app/(app)/hub/`, `src/app/(app)/configuracion/`          |

### Escape hatch (uso restringido)

Si un archivo *necesita* legítimamente romper una regla (ej: integración con librería externa que requiere clase específica), agregar como **primera línea**:

```tsx
// @ds-allow-legacy razón corta aquí
```

El guard saltará ese archivo. **Cada uso queda visible** con `git grep "@ds-allow-legacy"` y debe justificarse en code review.

### Cuándo crear un nuevo primitive en `opai-ds/`

Si necesitas un componente que no existe en `/opai-ds-playground`, **proponerlo como primitive** antes de implementarlo inline. Criterio:

- Si lo vas a usar en ≥ 2 lugares → primitive en `opai-ds/`.
- Si es algo único de un módulo → componente local OK, pero compuesto SOLO con primitives de `opai-ds`.
