# OPAI Suite — Repo Playbook (Guía Operativa)

**Resumen:** Guía operativa para la creación y despliegue de módulos dentro del MONOREPO single-domain de OPAI Suite.

**Estado:** Deprecated - Documento histórico de la época multi-repo

**Scope:** OPAI Suite - Arquitectura

---

> **⚠️ IMPORTANTE:** Este documento describe la estrategia original multi-repo. La arquitectura actual de OPAI es **single-domain MONOREPO**. Este documento se mantiene como referencia histórica.

> **Versión**: 1.0 (Deprecated)  
> **Fecha**: 2026-02-06  
> **Propósito Original**: Estandarizar la creación de repositorios separados (ya no aplica)  
> **Estado actual**: Repositorio único `opai` con módulos por ruta

---

## ⚠️ Nota de Deprecación

La estrategia descrita en este documento (multi-repo con subdominios por app) fue reemplazada por:

### Arquitectura Actual (Single-Domain MONOREPO)
- **Un único repositorio**: Todo el código de OPAI en un solo repo
- **Un único dominio**: `opai.gard.cl`
- **Módulos por ruta**: `/docs`, `/hub`, `/crm`, `/ops`, `/portal`, `/admin`
- **Código compartido**: `src/lib/`, `src/components/ui/`
- **Auth unificado**: Una sola sesión para toda la plataforma
- **Deploy único**: Vercel deploy del monorepo completo

Ver [monorepo-structure.md](../01-architecture/monorepo-structure.md) para la arquitectura vigente.

---

## Contenido Original (Referencia Histórica)

---

## 📋 Tabla de Contenidos

1. [Propósito del Playbook](#1-propósito-del-playbook)
2. [Naming & Convenciones](#2-naming--convenciones)
3. [Checklist de Creación de Nueva App/Repo](#3-checklist-de-creación-de-nueva-apprepo)
4. [Estrategia de Base de Datos (Shared Neon – Phase 1)](#4-estrategia-de-base-de-datos-shared-neon--phase-1)
5. [Environment Variables & Secrets](#5-environment-variables--secrets)
6. [Documentación Mínima Obligatoria](#6-documentación-mínima-obligatoria)
7. [Prompts Estándar para Cursor](#7-prompts-estándar-para-cursor)
8. [Definition of Done](#8-definition-of-done)

---

## 1. Propósito del Playbook

### Para qué existe

Este playbook es la **fuente de verdad operativa** para:
- Crear nuevas apps/repositorios dentro de la suite OPAI
- Desplegar aplicaciones de forma consistente
- Configurar autenticación compartida (SSO)
- Integrar apps entre sí
- Mantener coherencia arquitectónica multi-tenant

### Cuándo usarlo

- **Antes** de iniciar una nueva app/módulo (Hub, CRM, Ops, Portal, Admin)
- Al onboardear nuevos desarrolladores
- Al configurar entornos de desarrollo
- Como referencia para prompts de Cursor/IA
- Al revisar/auditar configuraciones de apps existentes

### Qué problemas evita

- ❌ **Desalineación entre apps**: autenticación incompatible, tenant_id inconsistente
- ❌ **Improvisación arquitectónica**: cada dev toma decisiones distintas
- ❌ **Errores de seguridad**: secrets hardcodeados, cookies mal configuradas
- ❌ **DB schema chaos**: bases duplicadas, schemas sin convención
- ❌ **Deployment friction**: configuraciones manuales, variables faltantes
- ❌ **Documentación desactualizada**: cada repo diverge del diseño original

---

## 2. Naming & Convenciones

### 2.1 Nombres de Repositorios

#### Fase Gard (actual)
```
gard-<app>
```

**Ejemplos**:
- `gard-docs` — Propuestas/Presentaciones
- `gard-hub` — Dashboard central + app switcher
- `gard-crm` — Pipeline comercial
- `gard-ops` — Operaciones (turnos, incidentes)
- `gard-portal` — Portal guardias/clientes
- `gard-admin` — Configuración tenant, billing

#### Fase SaaS (futura migración)
```
opai-<app>
```

**Regla**: Mantener el sufijo `<app>` consistente al migrar.

### 2.2 Subdominios (DEPRECATED - No aplica en MONOREPO)

#### Estrategia Original Multi-Repo (Deprecated)
```
<app>.gard.cl → Cada app en subdominio separado
```

**Ejemplos de lo que ya NO se usa**:
- ~~`hub.gard.cl`~~ → Ahora: `opai.gard.cl/hub`
- ~~`crm.gard.cl`~~ → Ahora: `opai.gard.cl/crm`  
- ~~`ops.gard.cl`~~ → Ahora: `opai.gard.cl/ops`

#### Estrategia Actual (Single-Domain)
```
opai.gard.cl/{module}
```

**Dominio principal:** `opai.gard.cl`  
**Excepción temporal:** `docs.gard.cl` funciona como alias/legacy de `opai.gard.cl/docs`

### 2.3 Keys Oficiales de Apps

**Apps core** (usar estas keys consistentemente en código, DB, eventos):

| Key       | Descripción                                  |
|-----------|----------------------------------------------|
| `hub`     | Dashboard central, app switcher, metrics     |
| `docs`    | Propuestas/Presentaciones + tracking         |
| `crm`     | Pipeline comercial, contactos, actividades   |
| `ops`     | Operaciones: turnos, incidentes, supervisión |
| `portal`  | Portal guardias/clientes (tickets, SLA)      |
| `admin`   | Config tenant, usuarios, roles, billing      |

**Convenciones de uso**:
- **DB schema**: usar `{app}` → `docs`, `crm`, `ops`, `portal`
- **Eventos**: `{app}.{entity}.{verb}` → `docs.proposal.sent`, `crm.deal.updated`
- **APIs**: `/api/{app}/{resource}` → `/api/crm/deals`, `/api/ops/incidents`
- **AppAccess**: `{app}` como string literal en tabla `app_access`

---

## 3. Checklist de Creación de Nueva App/Repo

### ✅ Paso 1: Crear Repositorio en GitHub

1. Ir a GitHub → Organización/Usuario
2. Crear nuevo repositorio:
   - **Nombre**: `gard-<app>` (ej: `gard-crm`)
   - **Visibilidad**: Private
   - **Initialize**: **NO** agregar README, .gitignore, license (se hace local)

### ✅ Paso 2: Setup Local

```bash
# Crear carpeta y abrir en Cursor
mkdir gard-<app>
cd gard-<app>
cursor .
```

### ✅ Paso 3: Scaffold Next.js

Usar **Next.js 15** con:
- ✅ App Router
- ✅ TypeScript
- ✅ Tailwind CSS
- ✅ ESLint
- ✅ src/ directory

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint
```

Responder:
- Would you like to use Turbopack? → **No** (por ahora)
- Would you like to customize the import alias? → **No** (usar `@/*`)

### ✅ Paso 4: Instalar shadcn/ui

```bash
npx shadcn@latest init
```

Configuración recomendada:
- Style: **Default**
- Base color: **Neutral** o **Slate**
- CSS variables: **Yes**

Instalar componentes base:
```bash
npx shadcn@latest add button card input label select
```

### ✅ Paso 5: Inicializar Git

```bash
git init
git add .
git commit -m "chore: initial scaffold - Next.js 15 + TypeScript + Tailwind + shadcn/ui"
```

### ✅ Paso 6: Conectar con GitHub

```bash
git remote add origin git@github.com:<org>/gard-<app>.git
git branch -M main
git push -u origin main
```

### ✅ Paso 7: Importar en Vercel

1. Ir a [vercel.com/new](https://vercel.com/new)
2. Importar proyecto desde GitHub
3. **Framework Preset**: Next.js (detectado automáticamente)
4. **Root Directory**: `.` (raíz)
5. **NO** agregar variables de entorno aún → Deploy

### ✅ Paso 8: Asignar Subdominio

1. En Vercel → Project Settings → Domains
2. Agregar dominio custom: `<app>.gard.cl`
3. Configurar DNS (según proveedor):
   - **CNAME**: `<app>.gard.cl` → `cname.vercel-dns.com`
4. Esperar propagación DNS (~5-60 min)

### ✅ Paso 9: Configurar Variables de Entorno

En Vercel → Project Settings → Environment Variables:

**Variables obligatorias**:
```bash
DATABASE_URL=postgresql://...           # Neon connection string
NEXTAUTH_SECRET=<shared-secret>         # Mismo en TODAS las apps
NEXTAUTH_URL=https://<app>.gard.cl
```

**Reglas**:
- `NEXTAUTH_SECRET`: **debe ser idéntico en todas las apps** para SSO
- `DATABASE_URL`: apunta a la misma base Neon compartida
- Marcar todas como: **Production, Preview, Development**

### ✅ Paso 10: Crear .env.example

Crear archivo `.env.example` en raíz del proyecto:

```bash
# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require&schema=<app>

# Auth.js v5
NEXTAUTH_SECRET=your-secret-here-min-32-chars
NEXTAUTH_URL=https://<app>.gard.cl

# App Config
APP_NAME=<app>
APP_URL=https://<app>.gard.cl

# Inter-app URLs
HUB_URL=https://hub.gard.cl
DOCS_URL=https://docs.gard.cl
CRM_URL=https://crm.gard.cl
OPS_URL=https://ops.gard.cl
PORTAL_URL=https://portal.gard.cl
ADMIN_URL=https://admin.gard.cl

# Integrations (según app)
# EMAIL_PROVIDER_API_KEY=
# FACEID_WEBHOOK_SECRET=
```

**Commitear este archivo** (sin valores reales).

### ✅ Paso 11: Configurar .env.local (desarrollo)

Crear `.env.local` (git-ignored) con valores reales para desarrollo local:

```bash
cp .env.example .env.local
# Editar .env.local con valores reales
```

**Nunca commitear `.env.local`**.

### ✅ Paso 12: Verificar .gitignore

Asegurar que `.gitignore` contenga:
```
.env*.local
.env.production
.env.development
```

### ✅ Paso 13: Redeploy en Vercel

Después de agregar variables de entorno:
1. Vercel → Deployments → Latest deployment → **Redeploy**
2. Verificar que `https://<app>.gard.cl` funciona

---

## 4. Estrategia de Base de Datos (Shared Neon – Phase 1)

### 4.1 Arquitectura General

**Regla fundamental**: En fase 1, **una sola base de datos física en Neon para toda la suite OPAI**.

```
┌─────────────────────────────────────────┐
│      Neon PostgreSQL (shared DB)        │
├─────────────────────────────────────────┤
│  ┌─────────┐  ┌──────┐  ┌──────┐       │
│  │ auth    │  │ docs │  │ crm  │ ...   │ ← PostgreSQL schemas
│  └─────────┘  └──────┘  └──────┘       │
└─────────────────────────────────────────┘
        ↑           ↑          ↑
        │           │          │
   ┌────┴────┐ ┌───┴────┐ ┌───┴────┐
   │ gard-hub│ │gard-docs│ │gard-crm│  ← Apps (cada una usa su schema)
   └─────────┘ └─────────┘ └─────────┘
```

### 4.2 Convención de Schemas PostgreSQL

**Schemas oficiales**:

| Schema          | Propósito                                                |
|-----------------|----------------------------------------------------------|
| `auth`          | Usuarios, memberships, sessions (compartido por todas)   |
| `docs`          | Propuestas, templates, tracking (app Docs)               |
| `crm`           | Deals, contactos, actividades (app CRM)                  |
| `ops`           | Turnos, incidentes, rondas (app Ops)                     |
| `portal`        | Tickets, SLA, documentos guardias/clientes (app Portal)  |
| `audit`         | AuditLog, events (compartido por todas)                  |
| `integrations`  | Webhooks, external sync, outbox (compartido por todas)   |

**Regla de acceso**:
- Cada app **lee/escribe principalmente en su propio schema**
- Schemas compartidos (`auth`, `audit`, `integrations`): acceso de todas las apps
- **NO cross-schema joins** en queries de alto tráfico (usar eventos/cache)

### 4.3 Schema PostgreSQL Setup

Crear schemas manualmente en Neon (una sola vez):

```sql
-- Ejecutar en Neon SQL Editor o psql
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS docs;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS portal;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS integrations;
```

### 4.4 Prisma Setup por App

Cada app tiene su propio `prisma/schema.prisma` con:

#### Ejemplo: `gard-docs/prisma/schema.prisma`

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["auth", "docs", "audit"]
}

// ─────────────────────────────────────────
// Schema: auth (compartido)
// ─────────────────────────────────────────
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  memberships Membership[]

  @@map("users")
  @@schema("auth")
}

model Tenant {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  memberships Membership[]

  @@map("tenants")
  @@schema("auth")
}

model Membership {
  id       String @id @default(cuid())
  userId   String @map("user_id")
  tenantId String @map("tenant_id")
  role     String // owner, admin, sales, ops_manager, supervisor, guard, client

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([userId, tenantId])
  @@map("memberships")
  @@schema("auth")
}

// ─────────────────────────────────────────
// Schema: docs (específico de esta app)
// ─────────────────────────────────────────
model Proposal {
  id          String   @id @default(cuid())
  tenantId    String   @map("tenant_id")
  title       String
  status      String   @default("draft") // draft, sent, viewed, accepted, rejected
  content     Json?
  createdById String   @map("created_by_id") // membership_id
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([tenantId])
  @@map("proposals")
  @@schema("docs")
}

// ─────────────────────────────────────────
// Schema: audit (compartido)
// ─────────────────────────────────────────
model AuditLog {
  id           String   @id @default(cuid())
  tenantId     String   @map("tenant_id")
  membershipId String   @map("membership_id")
  action       String   // {app}.{entity}.{verb}
  entityType   String   @map("entity_type")
  entityId     String   @map("entity_id")
  metadata     Json?
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([tenantId, createdAt])
  @@map("audit_logs")
  @@schema("audit")
}
```

**Puntos clave**:
- `@@schema("auth")`, `@@schema("docs")`, `@@schema("audit")` → especifica el schema PostgreSQL
- `datasource.schemas` → lista todos los schemas que usa esta app
- Todas las tablas de negocio tienen `tenant_id`

### 4.5 Migraciones Prisma

Cada app gestiona sus propias migraciones:

```bash
# En gard-docs/
npx prisma migrate dev --name init_docs_schema

# En gard-crm/
npx prisma migrate dev --name init_crm_schema
```

**Regla**: Las migraciones de cada app solo afectan sus schemas propios + compartidos (auth, audit).

### 4.6 Database URL con Schema Search Path

En `.env`:
```bash
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require&schema=docs
```

**Nota**: El parámetro `schema=docs` es opcional en Prisma si usas `@@schema()` explícito.

### 4.7 ¿Cuándo NO usar Shared DB?

Considerar bases separadas en:
- **Fase 2+**: Alta escala, aislamiento por tenant
- **Compliance**: Requisitos regulatorios de aislamiento de datos
- **Performance**: Queries cross-schema causan bottlenecks

**Por ahora**: Shared DB es suficiente y simplifica desarrollo.

---

## 5. Environment Variables & Secrets

### 5.1 Regla de Oro

**NUNCA commitear secrets reales** en:
- `.env`
- `.env.local`
- `.env.production`
- `prisma/.env`
- Código fuente

**SÍ commitear**:
- `.env.example` (con valores placeholder)

### 5.2 Variables Obligatorias en TODAS las Apps

```bash
# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Auth.js v5
NEXTAUTH_SECRET=<shared-secret-min-32-chars>
NEXTAUTH_URL=https://<app>.gard.cl

# App Identity
APP_NAME=<app>
```

### 5.3 Contrato SSO (Same NEXTAUTH_SECRET)

**CRÍTICO**: Para que SSO funcione entre apps en subdominios, **todas las apps deben compartir**:

1. **Mismo `NEXTAUTH_SECRET`**
2. **Mismo cookie domain**: `.gard.cl`

#### Configuración en Auth.js v5

```typescript
// src/auth.ts (en cada app)
import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"

export const config = {
  providers: [
    // ... tus providers
  ],
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        domain: ".gard.cl", // ← CRÍTICO: mismo domain en todas las apps
      },
    },
  },
  // ...
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(config)
```

**Resultado**: Login en `hub.gard.cl` → cookie válida en `docs.gard.cl`, `crm.gard.cl`, etc.

### 5.4 Variables de Integraciones Externas

Documentar en `.env.example`, **no hardcodear**:

```bash
# Email Provider (ej: Resend, SendGrid)
EMAIL_PROVIDER_API_KEY=
EMAIL_FROM_ADDRESS=no-reply@gard.cl

# FaceID Webhook (Ops)
FACEID_WEBHOOK_SECRET=
FACEID_API_URL=

# Payroll External (Ops)
PAYROLL_API_KEY=
PAYROLL_EXPORT_ENDPOINT=

# Zoho CRM (legacy, solo durante transición)
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
```

### 5.5 Inter-app URLs

Para redirects, links cruzados, webhooks internos:

```bash
HUB_URL=https://hub.gard.cl
DOCS_URL=https://docs.gard.cl
CRM_URL=https://crm.gard.cl
OPS_URL=https://ops.gard.cl
PORTAL_URL=https://portal.gard.cl
ADMIN_URL=https://admin.gard.cl
```

Usar en código:
```typescript
const hubUrl = process.env.HUB_URL || "http://localhost:3000"
```

### 5.6 Checklist de Seguridad

- ✅ `.env.local` está en `.gitignore`
- ✅ Secrets en Vercel/1Password, NO en código
- ✅ `.env.example` actualizado con todas las keys (sin valores)
- ✅ `NEXTAUTH_SECRET` > 32 caracteres, generado con `openssl rand -base64 32`
- ✅ Mismo `NEXTAUTH_SECRET` en todas las apps (copiar desde 1Password/Vercel)
- ✅ Cookie domain = `.gard.cl` en todas las apps

---

## 6. Documentación Mínima Obligatoria

Cada repositorio **debe contener**:

### 6.1 Archivo: `docs/00-product/000-opai-suite-master.md`

**Contenido**: Copia **idéntica** del documento maestro global.

**Propósito**: Contexto macro de la suite, para que cada repo sea auto-contenido.

**Ubicación**: `docs/00-product/000-opai-suite-master.md`

**Cómo obtenerlo**:
```bash
# Copiar desde gard-docs (o cualquier repo existente)
mkdir -p docs/00-product
cp ../gard-docs/docs/00-product/000-opai-suite-master.md docs/00-product/
```

### 6.2 Archivo: `docs/00-product/001-<app>-master.md`

**Contenido**: Documento maestro **específico de esta app**.

**Estructura mínima**:

```markdown
# <App> — Documento Maestro

> Este es el master OPERATIVO de la app <App>. El master global de la suite está en: [000-opai-suite-master.md](./000-opai-suite-master.md)

## 1. Propósito de <App>
Descripción de qué hace esta app, para quién, y cómo encaja en la suite.

## 2. Funcionalidades Core
- Feature 1
- Feature 2
- Feature 3

## 3. Tecnologías
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Prisma (schema: <app>)
- Auth.js v5 (SSO)

## 4. Schemas PostgreSQL Usados
- `auth` (compartido)
- `<app>` (propio)
- `audit` (compartido)
- `integrations` (compartido, si aplica)

## 5. Roles que usan esta app
- owner
- admin
- sales (si aplica)
- ops_manager (si aplica)
- supervisor (si aplica)
- guard (si aplica)
- client (si aplica)

## 6. Eventos Emitidos
- `<app>.<entity>.created`
- `<app>.<entity>.updated`
- `<app>.<entity>.<action>`

## 7. Eventos Consumidos
- `other_app.<entity>.<action>` (si aplica)

## 8. Integraciones Externas
- Email provider (tracking)
- FaceID (si es Ops)
- Payroll (si es Ops)
- Zoho CRM (legacy, solo transición)

## 9. Deployment
- Vercel
- Subdominio: `<app>.gard.cl`
- Variables de entorno: ver `.env.example`

## 10. Roadmap
- V1: ...
- V2: ...
```

**Ejemplo para CRM**: `docs/00-product/001-crm-master.md`

### 6.3 Archivo: `docs/README.md`

**Contenido**: Índice de toda la documentación del repo.

```markdown
# Documentación — <App>

## Índice

### Product
- [Suite OPAI - Master Global](./00-product/000-opai-suite-master.md)
- [<App> - Master](./00-product/001-<app>-master.md)
- [Repo Playbook](./00-product/010-repo-playbook.md)

### Architecture
- [Database Schema](./01-architecture/database-schema.md) (cuando exista)
- [API Design](./01-architecture/api-design.md) (cuando exista)

### Guides
- [Local Setup](./02-guides/local-setup.md) (cuando exista)
- [Deployment](./02-guides/deployment.md) (cuando exista)

## Cómo contribuir
1. Leer el master global y el master de esta app
2. Seguir el [Repo Playbook](./00-product/010-repo-playbook.md)
3. Mantener documentación actualizada
```

### 6.4 Archivo: `README.md` (raíz del proyecto)

**Contenido**: Intro breve + link a `/docs`.

```markdown
# <App> — OPAI Suite

> <Descripción breve de 1-2 líneas>

## Documentación
Ver [docs/](./docs/README.md)

## Quick Start
```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Editar .env.local con valores reales

# Run migrations
npx prisma generate
npx prisma migrate dev

# Run dev server
npm run dev
```

## Tech Stack
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Prisma + PostgreSQL
- Auth.js v5

## Deployment
Deployed on Vercel: `https://<app>.gard.cl`
```

---

## 7. Prompts Estándar para Cursor

### 7.1 Prompt: Bootstrap Nueva App

```
OBJETIVO
Bootstrap inicial de la app <APP> para la suite OPAI multi-tenant.

CONTEXTO
- Suite OPAI es multi-tenant (tenant_id en todas las tablas)
- SSO compartido entre todas las apps vía Auth.js v5
- Base de datos Neon compartida, schemas PostgreSQL por app
- Ver documentación: docs/00-product/000-opai-suite-master.md

TAREAS

1) Setup Prisma
   - Crear prisma/schema.prisma con:
     - datasource PostgreSQL (multi-schema)
     - schemas: ["auth", "<app>", "audit"]
     - Models básicos de auth (User, Tenant, Membership)
     - Models específicos de <app> (definir según propósito)
     - AuditLog en schema audit
   - Todos los models de negocio DEBEN tener tenant_id

2) Instalar dependencias
   npm install prisma @prisma/client
   npm install next-auth@beta @auth/prisma-adapter
   npm install zod react-hook-form @hookform/resolvers

3) Generar Prisma Client
   npx prisma generate

4) Crear archivo de configuración Auth.js v5
   - src/auth.ts
   - Configurar providers (Credentials o Google)
   - Cookie domain: .gard.cl
   - NEXTAUTH_SECRET (mismo en todas las apps)

5) Crear middleware de tenant context
   - src/middleware.ts
   - Proteger rutas
   - Extraer tenant_id de session/cookie

6) Estructura básica de carpetas
   src/
   ├── app/
   │   ├── (auth)/
   │   │   ├── login/
   │   │   └── signup/
   │   ├── (dashboard)/
   │   │   ├── layout.tsx
   │   │   └── page.tsx
   │   └── api/
   │       └── auth/
   │           └── [...nextauth]/
   ├── components/
   │   ├── ui/ (shadcn)
   │   └── shared/
   ├── lib/
   │   ├── prisma.ts
   │   ├── auth.ts
   │   └── utils.ts
   └── types/

7) Crear documentación inicial
   - docs/00-product/001-<app>-master.md
   - Copiar docs/00-product/000-opai-suite-master.md
   - Actualizar docs/README.md

RESTRICCIONES
- NO hardcodear secrets
- NO crear tablas sin tenant_id (excepto auth compartido)
- NO omitir cookie domain en auth config
- SÍ usar TypeScript strict
- SÍ usar shadcn/ui para componentes

DEFINICIÓN DE HECHO
- Prisma schema completo y genera sin errores
- Auth.js configurado con SSO
- Middleware protege rutas
- Estructura de carpetas creada
- Documentación inicial existe
```

### 7.2 Prompt: Configurar Auth.js v5 + Middleware

```
OBJETIVO
Implementar autenticación completa con Auth.js v5 para la app <APP>, con SSO multi-tenant.

CONTEXTO
- Suite OPAI usa SSO compartido (cookie domain .gard.cl)
- Mismo NEXTAUTH_SECRET en todas las apps
- Multi-tenant: cada user puede tener múltiples memberships
- Tenant activo se almacena en session

TAREAS

1) Crear src/auth.ts
   - Configurar NextAuth con:
     - Providers (Credentials o OAuth)
     - PrismaAdapter
     - Cookie domain: .gard.cl
     - Callbacks:
       - jwt: agregar user.id, activeTenantId
       - session: exponer userId, activeTenantId, role

2) Crear src/middleware.ts
   - Proteger rutas (excepto /login, /signup, /api/auth/*)
   - Extraer session con auth()
   - Validar tenant context
   - Redirect a /login si no autenticado

3) Crear API route handler
   - src/app/api/auth/[...nextauth]/route.ts
   - Exportar { handlers } from "@/auth"

4) Crear páginas de auth
   - src/app/(auth)/login/page.tsx
   - src/app/(auth)/signup/page.tsx (si aplica)
   - Formularios con shadcn/ui (Form + Input + Button)

5) Agregar tenant switcher (si aplica)
   - Component: src/components/shared/TenantSwitcher.tsx
   - Fetch memberships del usuario
   - Actualizar session con nuevo activeTenantId
   - API endpoint: /api/tenant/switch

DEFINICIÓN DE HECHO
- Login funciona
- Session persiste en múltiples subdominios (SSO)
- Middleware redirige correctamente
- User puede cambiar de tenant activo (si tiene múltiples)
```

### 7.3 Prompt: Implementar RBAC + AppAccess

```
OBJETIVO
Implementar control de acceso basado en roles (RBAC) y app access para <APP>.

CONTEXTO
- Roles: owner, admin, sales, ops_manager, supervisor, guard, client
- AppAccess: tabla que define qué roles pueden usar qué apps
- Cada app verifica acceso en middleware/layout

TAREAS

1) Extender Prisma schema (schema auth)
   model AppAccess {
     id       String @id @default(cuid())
     tenantId String @map("tenant_id")
     role     String
     appKey   String @map("app_key") // "docs", "crm", "ops", etc.
     enabled  Boolean @default(true)
     
     @@unique([tenantId, role, appKey])
     @@map("app_access")
     @@schema("auth")
   }

2) Seedear reglas de acceso por defecto
   - owner → todas las apps
   - admin → todas las apps
   - sales → docs, crm, hub
   - ops_manager → ops, hub
   - supervisor → ops, portal, hub
   - guard → portal
   - client → portal (vista limitada)

3) Crear helper de autorización
   - src/lib/rbac.ts
   - hasAppAccess(membership, appKey)
   - hasPermission(membership, permission) (para policies futuras)

4) Agregar check en middleware
   - Verificar que user.role tiene acceso a APP_KEY actual
   - Redirect a /unauthorized si no tiene acceso

5) Crear página /unauthorized
   - Mensaje: "No tienes acceso a esta app"
   - Link: Volver al Hub

DEFINICIÓN DE HECHO
- AppAccess funciona correctamente
- Users sin acceso son redirigidos
- Seed de reglas por defecto ejecutado
```

### 7.4 Prompt: Auditoría (AuditLog)

```
OBJETIVO
Implementar registro de auditoría para acciones críticas en <APP>.

CONTEXTO
- AuditLog centralizado en schema "audit"
- Convención de eventos: {app}.{entity}.{verb}

TAREAS

1) Crear helper de auditoría
   - src/lib/audit.ts
   - logAudit(params):
     - tenantId
     - membershipId
     - action (string: "docs.proposal.sent")
     - entityType (string: "Proposal")
     - entityId (string)
     - metadata (JSON opcional)

2) Integrar en acciones críticas
   - Crear: docs.proposal.created
   - Actualizar: docs.proposal.updated
   - Enviar: docs.proposal.sent
   - Eliminar: docs.proposal.deleted

3) Crear API endpoint para consulta
   - GET /api/audit?tenantId=X&entityType=Y&limit=Z
   - Solo accesible por owner/admin

4) (Opcional) UI de Audit Trail
   - Tabla con: fecha, usuario, acción, entidad, metadata
   - Filtros: fecha, usuario, acción

DEFINICIÓN DE HECHO
- Todas las acciones críticas generan AuditLog
- API de consulta funciona
- Logs visibles en UI (si aplica)
```

### 7.5 Prompt: Integración Inter-app (Hub ↔ Docs ↔ CRM)

```
OBJETIVO
Configurar navegación e integración entre apps de la suite OPAI.

CONTEXTO
- Hub es el launcher central
- Apps se enlazan entre sí para workflows cruzados
- Ejemplo: CRM → crear propuesta → abre Docs

TAREAS

1) Agregar variables de entorno de inter-app URLs
   - HUB_URL, DOCS_URL, CRM_URL, OPS_URL, PORTAL_URL, ADMIN_URL
   - En .env.example y Vercel

2) Crear componente AppSwitcher
   - src/components/shared/AppSwitcher.tsx
   - Lista de apps con acceso (según AppAccess)
   - Links a subdominios
   - Usar shadcn/ui DropdownMenu

3) Implementar "Open in X"
   - Ejemplo en CRM: botón "Crear Propuesta" → redirect a DOCS_URL con params
   - Ejemplo en Docs: botón "Ver Deal" → redirect a CRM_URL/deals/{id}

4) Pasar context en URL (si necesario)
   - Query params: ?tenantId=X&dealId=Y
   - Validar en app destino que user tiene acceso a ese tenant

5) (Futuro) Webhooks internos
   - Outbox pattern para eventos asincrónicos
   - docs.proposal.sent → webhook a CRM para actualizar deal

DEFINICIÓN DE HECHO
- AppSwitcher funciona en todas las apps
- Links cruzados entre apps funcionan
- Context (tenant, entity) se pasa correctamente
```

---

## 8. Definition of Done

Checklist **verificable** antes de considerar una nueva app como "lista":

### ✅ Infraestructura

- [ ] Repositorio creado en GitHub: `gard-<app>`
- [ ] Proyecto importado en Vercel
- [ ] Subdominio configurado y accesible: `<app>.gard.cl`
- [ ] Variables de entorno configuradas en Vercel (Production + Preview + Development)
- [ ] `.env.example` existe y está actualizado
- [ ] `.env.local` en `.gitignore`

### ✅ Base de Datos

- [ ] Schema PostgreSQL `<app>` creado en Neon
- [ ] `prisma/schema.prisma` completo con:
  - [ ] Models de `auth` (User, Tenant, Membership)
  - [ ] Models propios en schema `<app>`
  - [ ] AuditLog en schema `audit`
  - [ ] Todas las tablas de negocio tienen `tenant_id`
- [ ] Migraciones ejecutadas: `npx prisma migrate deploy`
- [ ] Prisma Client genera sin errores: `npx prisma generate`

### ✅ Autenticación (SSO)

- [ ] Auth.js v5 configurado en `src/auth.ts`
- [ ] Cookie domain = `.gard.cl`
- [ ] `NEXTAUTH_SECRET` idéntico al de otras apps (verificar en Vercel)
- [ ] Login funciona en `<app>.gard.cl/login`
- [ ] Session persiste en otros subdominios (test manual)
- [ ] Middleware protege rutas: `src/middleware.ts`

### ✅ Multi-tenancy

- [ ] Session incluye `activeTenantId` y `role`
- [ ] Todas las queries filtran por `tenant_id`
- [ ] Tenant switcher implementado (si user tiene múltiples tenants)
- [ ] Verificado que user A no puede ver datos de tenant B

### ✅ Autorización

- [ ] AppAccess implementado (tabla + seed)
- [ ] Middleware verifica acceso a esta app según role
- [ ] Página `/unauthorized` existe
- [ ] Solo roles autorizados pueden acceder

### ✅ Auditoría

- [ ] Helper `logAudit()` creado en `src/lib/audit.ts`
- [ ] Acciones críticas generan AuditLog:
  - [ ] Create
  - [ ] Update
  - [ ] Delete
  - [ ] Otras acciones específicas de la app

### ✅ Documentación

- [ ] `docs/00-product/000-opai-suite-master.md` existe (copia exacta)
- [ ] `docs/00-product/001-<app>-master.md` existe y está completo
- [ ] `docs/README.md` existe con índice
- [ ] `README.md` (raíz) existe con quick start

### ✅ Código

- [ ] Estructura de carpetas estándar (`src/app`, `src/components`, `src/lib`)
- [ ] shadcn/ui instalado y componentes base agregados
- [ ] TypeScript configurado (`tsconfig.json`)
- [ ] ESLint sin errores críticos
- [ ] Build funciona: `npm run build`

### ✅ Deployment

- [ ] Deploy en Vercel exitoso (sin errores)
- [ ] `<app>.gard.cl` accesible públicamente
- [ ] SSL activo (HTTPS)
- [ ] Healthcheck manual: crear cuenta, login, acción básica

### ✅ Integración

- [ ] AppSwitcher incluye esta app (agregar en otras apps)
- [ ] Variables `<APP>_URL` agregadas en otras apps si hay integración
- [ ] Links cruzados funcionan (si aplica)

---

## 📎 Anexos

### Generador de NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

Copiar output y usar en **todas las apps**.

### Verificar DNS

```bash
dig <app>.gard.cl
nslookup <app>.gard.cl
```

### Verificar Cookie Domain

Desde DevTools (navegador):
1. Login en `hub.gard.cl`
2. Inspeccionar cookies → buscar `__Secure-next-auth.session-token`
3. Verificar `Domain = .gard.cl`
4. Abrir `docs.gard.cl` → cookie debe estar presente

### Template .gitignore para Next.js + Prisma

```
# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# env
.env*.local
.env.production
.env.development

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# prisma
prisma/migrations/**/migration.sql
```

### Recursos Útiles

- [Next.js 15 Docs](https://nextjs.org/docs)
- [Auth.js v5 Docs](https://authjs.dev/)
- [Prisma Multi-Schema](https://www.prisma.io/docs/orm/prisma-schema/data-model/multi-schema)
- [shadcn/ui](https://ui.shadcn.com/)
- [Vercel Deployment](https://vercel.com/docs)

---

## 🔄 Changelog

| Versión | Fecha      | Cambios                                      |
|---------|------------|----------------------------------------------|
| 1.0     | 2026-02-06 | Creación inicial del playbook                |

---

**Mantenido por**: Equipo OPAI  
**Última actualización**: 2026-02-06
