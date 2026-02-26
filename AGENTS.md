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
3. `npx prisma db seed` — creates tenant "gard", admin user (`carlos.irigoyen@gard.cl` / `GardSecurity2026!`), and reference data.

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
- **Migrations have ordering issues**: Some migrations reference tables created in later migrations. For local dev, use `npx prisma db push` instead of `prisma migrate deploy`.
- **pgvector required**: The `AiDocChunk` model uses a `vector(1536)` column. The Docker image must include pgvector (`pgvector/pgvector:pg16`).
- **ESLint not in original devDependencies**: If eslint is needed, install `eslint` and `eslint-config-next@15.4.11` (match the Next.js version). Create `.eslintrc.json` with `{"extends": "next/core-web-vitals"}`.
- **`npm run dev` vs `npm run dev:watch`**: Use `dev:watch` for development. The `dev` script runs `build && start` which fails due to pre-existing lint errors caught by `next build`.
- **Login credentials (seeded)**: `carlos.irigoyen@gard.cl` / `GardSecurity2026!` (owner role).
