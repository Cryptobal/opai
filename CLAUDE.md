# OPAI — REPOSITORY INSTRUCTIONS

Instrucciones permanentes para agentes (Claude Code, Cursor, etc.) que trabajen en este repositorio. Complementa a `AGENTS.md` (navegación y design system, que sigue siendo ley) y a `docs/` (documentación funcional). Todo lo afirmado aquí fue verificado en el código; lo no verificable se marca como `No identificado en el repositorio`.

## 1. Project overview

**OPAI Suite** (`opai.gard.cl`) es una plataforma SaaS **multi-tenant para empresas de seguridad privada en Chile**, desarrollada por Gard Security. Monorepo single-domain Next.js que cubre el ciclo completo: venta comercial → contrato → operación en terreno → remuneraciones → facturación.

Usuarios: administradores y jefaturas de la empresa de seguridad (ERP web), supervisores en terreno (móvil), guardias (portales RUT+PIN / apps), clientes finales (Portal Cliente) e inspectores de la Dirección del Trabajo (rol lectura, Res. Exenta N°38).

Módulos verificados (rutas en `src/app/(app)` y `src/app/portal`):

| Módulo | Ruta | Contenido |
|---|---|---|
| Hub | `/hub` | Dashboard ejecutivo, KPIs |
| CRM | `/crm/*` | Leads, cuentas, contactos, negocios, cotizaciones, instalaciones, correo Gmail |
| CPQ | `/cpq/*` | Cotizaciones con cálculo de costo empleador |
| Operaciones | `/ops/*` | Puestos, pauta mensual/diaria, asistencia, PPC, turnos extra, rondas, tickets, supervisión, inventario, ATS |
| Marcación | `/marcar/[code]` | Marcación RUT+PIN+geolocalización (cumplimiento DT) |
| Personas | `/personas/*` | Guardias 360, documentos, lista negra, conocimiento |
| Payroll | `/payroll/*` | Liquidaciones Chile (parcial) |
| Finanzas | `/finanzas/*` | Rendiciones, facturación DTE/SII, cesiones, flujo de caja, conciliación bancaria, RCV |
| Documentos | `/opai/documentos/*` | Contratos, templates con tokens, versionado, firma digital |
| Configuración | `/opai/configuracion/*` | Usuarios, roles, integraciones, módulos por tenant |
| Portales | `/portal/*`, `/portales` | Portal Guardia, Cliente, Rondas, Terreno, Marcación, Acceso (auth propia por portal) |
| Otros | `/chat`, `/fiscalizacion`, `/reportes`, `/postulacion`, `/registro-demo`, `(marketing)` | Chat interno, fiscalización, reportes DT, postulación pública, signup, sitio marketing |

Un cambio en cualquier módulo puede propagarse a trabajadores, turnos, asistencia, remuneraciones, facturación, reportes y supervisión: la plataforma es un sistema encadenado, no páginas aisladas.

## 2. Business and operational principles

Prioridades en orden:

1. **Integridad de datos** — la operación y las remuneraciones dependen de ellos.
2. **Continuidad operacional** — hay guardias en turno 24/7; nada puede romper marcación, rondas ni alertas.
3. **Segregación de empresas y clientes** — aislamiento estricto por tenant y por cliente (Portal Cliente).
4. **Trazabilidad** — auditoría (`AuditLog`, `src/lib/audit.ts`) de acciones sensibles.
5. **Seguridad** — datos personales y laborales protegidos (Ley 21.719; ver `docs/01-architecture/pii-protection.md`).
6. **Claridad de uso** — UX simple para personal operativo.
7. **Experiencia móvil** — supervisores y guardias operan desde teléfonos.
8. **Rendimiento** — listas y reportes con datasets grandes.
9. **Mantenibilidad** — patrones existentes antes que invención.
10. **Escalabilidad** — multi-tenant real.

## 3. Verified technology stack

| Área | Tecnología | Evidencia |
|---|---|---|
| Framework | Next.js 16 (App Router) — README/AGENTS.md dicen "15" pero están desactualizados | `package.json` (`next ^16.0.0` + `overrides`) |
| UI runtime | React 19 | `package.json` |
| Lenguaje | TypeScript 5.6, `strict: true`, alias `@/*` → `./src/*` | `tsconfig.json` |
| Node | 22 | `.nvmrc` |
| Base de datos | PostgreSQL (Neon en prod; local `pgvector/pgvector:pg16`) con extensiones `vector` y `uuid-ossp` | `AGENTS.md`, `prisma/schema.prisma` |
| ORM | Prisma 6, `multiSchema` con 15 schemas, ~381 modelos en un solo `schema.prisma` | `prisma/schema.prisma`, `package.json` |
| Auth ERP | Auth.js v5 (next-auth beta) — Credentials (bcrypt) + Google; JWT con `tenantId`, `role`, `portal` | `src/lib/auth.ts` |
| Auth portales | Sesiones propias: RUT+PIN, `device_token`, magic link, cookies firmadas | `src/lib/portal-*.ts`, `src/lib/device-auth.ts` |
| Autorización | RBAC propio módulos/submódulos/capabilities con niveles `none/view/edit/full` + `RoleTemplate` por tenant | `src/lib/permissions.ts`, `src/lib/rbac.ts` |
| Estilos | Tailwind CSS 3.4 + tokens semánticos DS v3 | `tailwind.config.js`, `src/styles/globals.css` |
| Componentes UI | DS propio `@/components/opai-ds` sobre Radix UI (+ restos shadcn/`@/components/ui`) | `src/components/opai-ds/`, `components.json` |
| Estado | React state/context + hooks (`src/contexts`, `src/hooks`); sin Redux/Zustand | `src/contexts/`, `package.json` |
| Email | Resend + React Email (webhooks vía svix) | `src/lib/resend.ts`, `src/emails/` |
| Notificaciones | Sistema propio (bell + email + push web `web-push` + push móvil Capacitor + Slack outbox) | `src/lib/notifications/`, `vercel.json` crons `flush-*` |
| Realtime | Pusher | `package.json`, `src/lib/chat.ts` |
| SMS/WhatsApp | Twilio; endpoint `api/whatsapp` | `package.json`, `src/app/api/whatsapp/` |
| IA | OpenAI (`openai` SDK), embeddings pgvector (`AiDocChunk`), AI service propio | `src/lib/openai.ts`, `src/lib/ai-service.ts` |
| Storage | Cloudflare R2 (S3-compatible, presigned URLs) | `src/lib/storage.ts` |
| PDF | Playwright + `@sparticuz/chromium`, `@react-pdf/renderer`, `pdf-lib`, `jspdf` | `package.json`, `src/lib/pdf/` |
| Móvil | Capacitor 8 — 3 apps: Terreno, Personas, ERP (configs `capacitor.config.*.ts`) | `package.json` scripts `cap:*` |
| Rate limiting | Upstash Redis + `@upstash/ratelimit` | `src/lib/rate-limit.ts` |
| Monitoreo | Sentry (`@sentry/nextjs`, tunnel `/monitoring`) + Vercel Analytics | `src/instrumentation.ts`, `next.config.js` |
| Hosting | Vercel — ~60 cron jobs declarados | `vercel.json` |
| Testing | Vitest 3 (jsdom + proyecto node) + Testing Library | `vitest.config.ts` |
| Integraciones | Gmail/Drive/Calendar (googleapis), Slack, SII (DTE, XML firmado con `xml-crypto`/`node-forge`), Apollo, Google Maps/Leaflet | `src/lib/google-workspace/`, `src/lib/sii/`, `src/app/api/integrations/` |

## 4. Repository structure

```
prisma/                  schema.prisma (único, 15 schemas DB), migrations/, seed.ts, seeds/, scripts/
src/app/(app)/           ERP autenticado: hub, crm, cpq, ops, personas, payroll, finanzas, opai (docs+config), chat, fiscalizacion, reportes, portales
src/app/(marketing)/     Sitio público de marketing
src/app/portal/          Portales con auth propia (guardia, cliente, rondas, terreno, marcacion, acceso, personas)
src/app/api/             ~60 grupos de rutas API (REST por módulo, cron/, webhooks/, integrations/, mcp/)
src/app/marcar|ronda|postulacion|ingreso-te|...   Flujos públicos por token/código
src/components/          Componentes por módulo; opai-ds/ = design system (única fuente para UI nueva); opai/ = legacy en migración
src/lib/                 Lógica de negocio y helpers por dominio (auth, permissions, ops, marcacion, rondas, finance, sii, storage, nav/registry.ts…)
src/modules/             Patrón modular nuevo: agenda, calendar, cpq, crm, finance, payroll
src/emails/              Templates React Email
src/hooks/, src/contexts/, src/types/, src/styles/
src/proxy.ts             Middleware (protección de rutas, rutas públicas, permisos por path)
scripts/                 Guards y utilidades (check-design-system.mjs, check-pii.mjs, lint-navigation.mjs, sweep-color-tokens.mjs)
docs/                    Documentación: 00-product/, 01-architecture/ (auth, multitenancy, pii), 02-implementation/, NAVIGATION_GUIDE.md
AGENTS.md                Ley de navegación (Cluster Nav v4) y design system — leer antes de tocar UI/nav
.husky/pre-commit        Ejecuta check-pii.mjs + check-design-system.mjs
```

## 5. Main commands

| Tarea | Comando | Notas |
|---|---|---|
| Instalar | `npm install` | `postinstall` corre `prisma generate` → requiere `DATABASE_URL` en `.env.local` ANTES de instalar |
| Dev server | `npm run dev:watch` | Puerto 3000. NO usar `npm run dev` (hace build completo y falla por lint preexistente) |
| DB local | `docker run -d --name pgdev -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gard -p 5432:5432 pgvector/pgvector:pg16` | Luego crear extensiones `vector` y `uuid-ossp` (ver `AGENTS.md`) |
| Sync schema local | `npx prisma db push --accept-data-loss` | Requiere `DIRECT_DATABASE_URL`. Las migraciones tienen problemas de orden: en local usar `db push`, no `migrate deploy` |
| Seed | `npx prisma db seed` | Crea tenant `gard`, usuario admin y datos de referencia (credenciales: ver `prisma/seed.ts`, no copiarlas a docs) |
| Migraciones (prod) | `npm run db:migrate` (`prisma migrate deploy`) | Solo con instrucción explícita; el `build` ya las aplica en Vercel |
| Prisma client | `npx prisma generate` | |
| Tests | `npm test` (= `vitest run`) | Test dirigido: `npx vitest run <ruta-o-patrón>` |
| Typecheck | `npx tsc --noEmit` | No hay script npm dedicado |
| Lint | `npm run lint` | Existen errores preexistentes; no introducir nuevos |
| Lint navegación | `npm run lint:nav` | |
| Guard design system | `npm run check-ds` (o `check-ds:warn`) | Corre también en pre-commit |
| Guard PII | `npm run check-pii` | Corre también en pre-commit |
| Build | `npm run build` | Encadena `prisma generate` + resolves de migraciones + `migrate deploy` + `next build` (8 GB heap). No correr como validación rápida |
| Apps móviles | `npm run cap:{terreno|personas|erp}:{init|sync|open}` (+ variantes `ios:`) | Capacitor |
| Formato | `No identificado en el repositorio` (no hay Prettier configurado) | |
| E2E | `No identificado en el repositorio` (Playwright se usa para PDFs, no para tests) | |
| Contenedores app | `No identificado en el repositorio` (`docker-compose.dev.yml` solo levanta Postgres) | |

## 6. Architecture

- **Frontend y backend en un solo Next.js App Router**: Server Components + route handlers en `src/app/api/**` (~60 grupos, ~500 endpoints). No hay backend separado.
- **Middleware** en `src/proxy.ts`: define rutas públicas (marketing, `/p/`, `/marcar/`, `/ronda/`, portales), protege el resto con Auth.js y mapea path → módulo/submódulo para permisos (`pathToPermission`).
- **Autenticación por audiencia**: ERP usa Auth.js v5 (JWT con `tenantId`, `role`, `roleTemplateId`, `portal`, `impersonating`); portales de guardia/cliente/dispositivos usan sesiones propias (RUT+PIN, `device_token`, magic links) en `src/lib/portal-*` y `device-auth.ts`; plataforma interna usa `platform-jwt.ts`.
- **Autorización**: `requireAuth()` (`src/lib/api-auth.ts`) al inicio de cada handler protegido; variantes por dominio `api-auth-crm/cpq/docs/agenda.ts`; permisos con `hasModuleAccess`/`canView`/`canEdit`/`hasCapability` (`src/lib/permissions.ts`); módulos habilitables por tenant (`tenant-modules.ts`).
- **Datos**: Prisma Client singleton (`src/lib/prisma.ts`); un solo `schema.prisma` con schemas PostgreSQL `public, payroll, fx, cpq, crm, docs, ops, finance, inventory, notes, chat, access_control, dt, psych, vra`.
- **Jobs**: ~60 crons de Vercel (`vercel.json`) sobre `src/app/api/cron/**` — followups, marcación, rondas, SLA, DTE/RCV, flujo de caja, outboxes (email/push/Slack/Drive/Gmail), alertas de cobertura. Patrón outbox + flush para entregas confiables.
- **Webhooks**: Resend (svix), Slack events/interactivity, Gmail push, `api/webhooks/*`.
- **Archivos**: Cloudflare R2 con presigned URLs (`src/lib/storage.ts`).
- **Navegación**: registry único `src/lib/nav/registry.ts` (N1–N4); NUNCA hardcodear items de nav — ver `AGENTS.md` y `docs/NAVIGATION_GUIDE.md`.
- **Despliegue**: Vercel; `DATABASE_URL` de prod necesita `connection_limit=5&pool_timeout=20`; Sentry opcional vía `NEXT_PUBLIC_SENTRY_DSN`.
- **Caché**: `No identificado en el repositorio` un caché de aplicación general (Upstash Redis se usa para rate limiting).

## 7. Sources of truth

| Dominio | Fuente de verdad | Archivos o módulos |
|---|---|---|
| Usuarios ERP | Modelo `Admin` (por tenant) | `prisma/schema.prisma`, `src/lib/auth.ts` |
| Roles y permisos | `RoleTemplate` + defaults en código | `src/lib/permissions.ts` (`DEFAULT_ROLE_PERMISSIONS`, `ROLE_TEMPLATE_SEEDS`) |
| Tenants/empresas | Modelo `Tenant` (+ `Setting` key-value, `tenant-modules.ts`) | `prisma/schema.prisma`, `src/lib/tenant*.ts` |
| Clientes, contratos, instalaciones | Schema `crm` (cuentas, deals, instalaciones) | `prisma/schema.prisma`, `src/lib/crm/`, `src/modules/crm/` |
| Trabajadores (guardias) | Schema `ops` — modelos Guardia y relacionados | `prisma/schema.prisma`, `src/lib/personas.ts`, `src/lib/ops/` |
| Turnos y pautas | Schema `ops` (puestos, pauta mensual/diaria, turnos extra) | `src/lib/ops.ts`, `src/lib/ops-*.ts` |
| Marcaciones/asistencia | Schema `ops` + `dt` (cumplimiento DT) | `src/lib/marcacion*.ts`, `src/lib/ops-attendance.ts`, `src/lib/dt/` |
| Rondas | Schema `ops` | `src/lib/rondas/`, `src/app/api/cron/rondas/*` |
| Incidencias/tickets | Schema `ops` | `src/app/(app)/ops/tickets`, `src/lib/` (SLA crons) |
| Documentos y firmas | Schema `docs` | `src/lib/docs/`, `src/lib/documents/` |
| Remuneraciones | Schema `payroll` | `src/lib/payroll/`, `src/modules/payroll/` |
| Facturación/DTE/cesiones | Schema `finance` + integración SII | `src/lib/finance/`, `src/lib/sii/`, `src/lib/dte-*.ts` |
| Configuración | `Setting` (BD) + `.env` (ver `.env.example`; valores reales en Vercel) | `src/lib/tenant-config.ts` |
| Archivos | Cloudflare R2 (keys en BD) | `src/lib/storage.ts` |
| Notificaciones | Tablas propias + outboxes con crons de flush | `src/lib/notifications/`, `src/lib/notification-*.ts` |
| Navegación UI | `src/lib/nav/registry.ts` | único lugar; nada hardcodeado |
| Reportes | Derivados de los dominios anteriores; nunca datos propios | `/reportes`, `src/app/api/reportes/` |

## 8. Instruction hierarchy

1. Solicitud explícita actual del usuario.
2. `CLAUDE.md` (este archivo) y `AGENTS.md` (nav + DS).
3. Brief de la tarea.
4. Documentación local (`docs/`).
5. Implementación existente en el código.
6. Convenciones generales de ingeniería.

Ante contradicción entre documentación y código, **el código del repositorio es la fuente técnica final de verdad** (ej.: README dice Next 15; `package.json` dice 16).

## 9. Mandatory working protocol

1. Leer `CLAUDE.md` (y `AGENTS.md` si tocas UI o navegación).
2. Leer el brief completo.
3. Comprender el objetivo operacional (qué rol/flujo real se afecta).
4. Identificar el módulo y su schema de BD.
5. Revisar archivos indicados y sus dependencias directas.
6. Verificar el estado actual antes de asumir el bug.
7. Identificar la causa raíz, no el síntoma.
8. Plan compacto.
9. Implementar el cambio mínimo completo.
10. Validar (ver §26).
11. Corregir fallas introducidas.
12. Revisar el diff completo.
13. Informar resultados reales (sin declarar validaciones no ejecutadas).

## 10. Context and token efficiency

- Buscar de forma dirigida (Grep/Glob por módulo) en vez de recorrer el árbol.
- Abrir solo dependencias directas del cambio; expandir progresivamente si hace falta.
- No leer `node_modules`, `.next`, `package-lock.json`, PDFs/binarios (`tmp-*.pdf`, `public/`), ni migraciones completas salvo necesidad.
- `prisma/schema.prisma` es enorme: leer por modelo con Grep, no completo.
- No reabrir archivos sin cambios; detener la exploración cuando la evidencia sea suficiente.
- La eficiencia nunca justifica saltarse autorización, scoping por tenant ni validación.

## 11. Coding standards

- TypeScript estricto: mantener type safety; no introducir `any` innecesario; contratos validados con `zod` donde ya se usa.
- Reutilizar patrones existentes del módulo (helpers `src/lib/<dominio>`, `requireAuth`, DS `opai-ds`) antes de crear nuevos.
- No agregar dependencias sin necesidad real.
- No duplicar lógica: el matcher de nav, permisos, fechas Chile (`dates-cl.ts`, `date-fns-tz`), RUT (`chile-rut.ts`) ya existen.
- Manejar errores explícitamente (respuestas 4xx/5xx tipadas en APIs).
- No refactorizar fuera del alcance ni reformatear archivos ajenos al cambio.
- No dejar `console.log` temporales (logs de servidor intencionales sí existen; seguir el patrón `[MODULO]`).
- Preservar compatibilidad: hay consumidores móviles (Capacitor) y portales públicos apuntando a las mismas APIs.
- Resolver la causa raíz.
- UI nueva: SOLO primitives de `@/components/opai-ds`, tokens semánticos (`text-status-*-fg`, `bg-ds-surface-*`), mínimo `text-[12px]`, touch targets ≥44px móvil, light+dark obligatorio, mobile-first. Detalle completo y tabla de tokens: `AGENTS.md` (sección DESIGN SYSTEM RULES). `npm run check-ds` valida.
- Tabs entre vistas → rutas reales, nunca `useState<TabId>` (regla de `AGENTS.md`).

## 12. Multi-tenant and data isolation

- Todo dato de negocio cuelga de `Tenant` (`tenantId`). **Toda consulta y mutación Prisma debe filtrar por `tenantId`** obtenido de la sesión (`requireAuth()`), nunca del body/query del request.
- El Portal Cliente añade segregación por cliente/cuenta (visibilidad `portal_visible`); los portales de guardia segregan por guardia/instalación/dispositivo.
- Verificar además propiedad del recurso: que el `id` solicitado pertenezca al tenant (y al cliente/instalación cuando aplique) antes de leer o mutar.
- La autorización se valida SIEMPRE en servidor (middleware + handler); la visibilidad del nav/UI es solo cosmética.
- Módulos habilitables por tenant: respetar `isModuleEnabled` (`tenant-modules.ts`).
- Nunca cruzar datos entre tenants en reportes, búsquedas, notificaciones ni exports.

## 13. Roles and permissions

- Modelo: niveles `none | view | edit | full` sobre módulos (`hub, ops, crm, docs, payroll, cpq, config, finance, reportes_dt, fiscalizacion`), submódulos y capabilities (`src/lib/permissions.ts`).
- Role templates activos: `owner`, `admin`, `editor`, `jefe_operaciones` (Jefatura), `central_monitoreo`, `supervisor`, `viewer`; `inspector_dt` (solo lectura DT) y otros slugs legacy se mantienen por retrocompatibilidad. Los tenants pueden tener `RoleTemplate` personalizados.
- Toda funcionalidad protegida verifica: autenticación → tenant → rol/permiso (`canView`/`canEdit`/`hasCapability`) → alcance (recurso pertenece al tenant/cliente) → estado del recurso.
- Sesiones llevan `portal` para impedir fugas cross-portal; existe impersonación de plataforma (`impersonating`) que debe quedar auditada.

## 14. Workers and operational entities

- Cadena operacional: **Cliente (CRM) → Contrato/Negocio → Instalación → Puesto → Pauta → Turno → Guardia → Marcación/Asistencia → Payroll → Facturación**. Mantener consistencia en toda la cadena: un cambio en guardia o instalación repercute aguas abajo.
- Guardias tienen ficha 360: documentos con vencimiento (crons de alertas), lista negra, asignaciones, postulación (ATS), evaluaciones psicológicas (`psych`), datos personales cifrados (`persona-encryption.ts`).
- Documentos operacionales y de guardia tienen slots configurables por tenant (`operational-guard-doc-slots.ts`, `guardia-documentos-config.ts`).
- No eliminar físicamente entidades con historial operacional; el patrón del repo es desactivar/archivar y conservar trazabilidad.

## 15. Scheduling and shifts

- Zona horaria: Chile (`America/Santiago`) — usar `src/lib/dates-cl.ts` y `date-fns-tz`; nunca aritmética de fechas naive en flujos operativos.
- Pautas mensual y diaria en `/ops`; turnos extra con flujo de ingreso propio (`/ingreso-te`, `te-approvals.ts`); reemplazos/refuerzos (`ops-refuerzos.ts`); regla "no doblar" (`ops-no-doblar.ts`).
- Turnos nocturnos cruzan medianoche: cuidado con agrupaciones por día y consolidación (`cron/consolidar-marcaciones`).
- Cambios retroactivos a pautas quedan auditados (`/ops/audit-pautas`); no reescribir historial silenciosamente.
- Alertas de cobertura (PPC) tienen crons de escalamiento/expiración — no romper sus estados.

## 16. Attendance and clock events

- Marcación digital por RUT+PIN+geolocalización en `/marcar/[code]` (pública por código de instalación) y por dispositivo (`device_token`, portal marcación/kiosco). Cumplimiento Res. Exenta N°38 DT (`docs/FLUJOS_MARCACION.md`, schema `dt`, módulo `reportes_dt`/`fiscalizacion`).
- Registrar siempre: tipo (entrada/salida), timestamp con TZ, instalación, turno, dispositivo y ubicación.
- Controlar: doble marcación, salida interpretada como entrada, eventos atrasados/offline con reintentos (outbox, `rondas-offline.ts` como patrón), discrepancias y turnos nocturnos.
- Correcciones pasan por flujo de aprobación y quedan auditadas; los emails/consolidaciones corren por cron (`marcacion-emails`, `consolidar-marcaciones`, `jornada-alerts`).
- Existe oposición pública a marcación (`/marcacion/oposicion/`) — ruta pública intencional, no "arreglar" agregándole auth.

## 17. State machines and workflows

- Flujos con estados verificados: tickets con SLA y aprobaciones multi-paso, rendiciones (aprobación → pago), turnos extra (aprobaciones), rondas (programada → en curso → cerrada/atrasada, crons de cierre), documentos con firma (signer/cc), cotizaciones CPQ, deals CRM, DTE (emisión → aceptación SII), cesiones.
- Al tocar un flujo: respetar estados y transiciones válidas existentes, verificar permiso por transición, mantener efectos secundarios (notificaciones, outbox) idempotentes, auditar el cambio y no inventar estados nuevos sin actualizar todos los consumidores (UI, crons, reportes).
- Los crons reprocesan colas: cualquier handler de cron debe ser seguro ante ejecución repetida.

## 18. Financial integrity

- Dominios: rendiciones de gastos, costos (CPQ costo empleador), payroll, facturación DTE/SII, cesiones, flujo de caja, conciliación bancaria, RCV, cobros.
- Los cálculos monetarios deben ser deterministas y auditables; no introducir redondeos nuevos ni floats donde el código use enteros/decimales existentes.
- FX tiene sync propio (`fx-sync.ts`, cron `/api/fx/sync`); IPC y ajustes tienen crons y alertas — no alterar valores históricos.
- **No modificar periodos contables/cerrados silenciosamente** (existe `accounting-period-monitor`); ajustes van por los flujos previstos.
- Firma y emisión DTE usa certificados cifrados (`dte-encryption.ts`); jamás loggear ni exponer material criptográfico.

## 19. Data integrity and database

- PostgreSQL + Prisma 6, un solo `prisma/schema.prisma` con 15 schemas de BD. Todo cambio de modelo requiere migración en `prisma/migrations/` + `prisma generate`.
- Las migraciones históricas tienen problemas de orden: en local se usa `db push`; el `build` de producción hace `migrate resolve` de una lista específica antes de `migrate deploy` — **no tocar esa cadena del script `build` sin entenderla**.
- **No ejecutar migraciones productivas ni `db push` contra bases remotas sin instrucción explícita.**
- Usar transacciones (`prisma.$transaction`) para mutaciones multi-tabla; respetar restricciones e índices existentes; pensar en concurrencia (crons + usuarios simultáneos).
- Mantener compatibilidad hacia atrás en columnas usadas por apps móviles ya distribuidas.
- Cambios destructivos de schema (drop/rename) requieren plan de rollback y aprobación.

## 20. API and backend

Patrón de todo route handler protegido:

1. `const ctx = await requireAuth()` (o la variante del dominio / auth de portal correspondiente) → 401 si null.
2. Verificar permiso de módulo/submódulo/capability y alcance por `tenantId`.
3. Validar input (zod donde el módulo ya lo usa) — nunca confiar en `tenantId` del cliente.
4. Mutaciones multi-tabla en transacción; operaciones repetibles idempotentes (webhooks y crons especialmente).
5. Respuestas de error explícitas y tipadas; sin filtrar detalles internos.
6. Listas: paginación y filtros en servidor; `include/select` de Prisma para evitar N+1.
7. Rate limiting con `src/lib/rate-limit.ts` en endpoints públicos/sensibles.
8. Webhooks: verificar firma (svix/Slack/OIDC de Gmail) antes de procesar.

## 21. Frontend and UX

- Sistema visual: DS v3 en `@/components/opai-ds` (playground en `/opai-ds-playground`). Reglas duras (tokens, tipografía, touch targets, light+dark, Liquid Glass móvil) en `AGENTS.md` — es ley y el guard `check-ds` la aplica.
- Reutilizar primitives (`Surface`, `PageHero`, `DataTable`, `Stat`, `Tag`, `EmptyState`…); componentes locales solo compuestos de primitives; si algo se usa ≥2 veces → proponer primitive.
- Toda vista maneja estados: loading (`Skeleton`/`Spinner`), vacío (`EmptyState`), error.
- Tablas: desktop `<DataTable>` (`hidden sm:block`), mobile lista de `<Surface>` apiladas (`sm:hidden`).
- Planillas/tablas densas: encabezados claros, columnas clave siempre visibles, máximo espacio útil, scroll controlado en su contenedor (no scroll horizontal de página), sin toolbars redundantes.
- Accesibilidad: Radix como base, touch ≥44px, contraste de tokens semánticos.
- Mobile-first por defecto (375px), pero **no imponer mobile-first si la tarea es expresamente solo desktop**.
- Detail pages `[id]`: usar `EntityDetailLayout` (patrón canónico CRM), no inventar otro.

## 22. Mobile and field operation

- Supervisores y guardias operan en terreno: pantallas pequeñas, táctil, conectividad inestable.
- Capacitor 8 provee 3 apps (Terreno, Personas, ERP) sobre el mismo web: camera, geolocation, push, biometría (`capacitor-native-biometric`), preferences. Helpers en `src/lib/capacitor/` y `src/lib/pwa/`.
- **Breakpoint táctil único: 1024px (`lg`)** — iPad vertical = layout táctil; fuente `src/lib/breakpoints.ts` + `useIsTouchLayout()`. Detalle en `docs/mobile/BASELINE_TACTIL.md`.
- Flujos de terreno deben tolerar offline/reintentos (patrón outbox; `rondas-offline.ts`), pedir permisos (cámara/GPS) con degradación elegante y mantener sesión por `device_token` de larga vida.
- Toda fecha capturada en terreno se interpreta en TZ Chile en servidor.
- Cambios en APIs consumidas por apps distribuidas deben ser retrocompatibles.

## 23. Reporting and exports

- Los reportes derivan siempre de los dominios fuente (§7); nunca mantener datos paralelos.
- Respetar permisos y tenant en cada export; los reportes DT (`reportes_dt`, `fiscalizacion`) tienen requisitos legales — no alterar su formato sin brief explícito.
- Filtros y agregaciones en servidor; periodos con TZ Chile explícita; totales consistentes con las vistas.
- Formatos: Excel (`exceljs`), PDF (Playwright/@react-pdf), CSV. Datasets grandes: paginar/streamear, no cargar todo en memoria del cliente.
- Datos sensibles (RUT, remuneraciones, salud) solo a roles autorizados; cuidar PII en exports (`check-pii` como referencia de patrones).

## 24. Security

- Nunca exponer credenciales o secretos: valores reales viven en Vercel; `.env.example` es solo plantilla; `.env.local` está gitignored. No copiar credenciales seed a documentación ni logs.
- Autenticación/adecuación por audiencia (§6); rutas administrativas de plataforma (`/platform`, `platform-auth`) separadas del tenant.
- Validar TODO input de cliente; sanitizar HTML (`isomorphic-dompurify`, `sanitize-email-html.ts`).
- Webhooks siempre con verificación de firma; endpoints públicos con rate limiting.
- Datos personales y laborales bajo Ley 21.719: cifrado en reposo para campos sensibles (`persona-encryption.ts`, `ai-encryption.ts`, `dte-encryption.ts`), DPA/DPO en `Tenant`, `docs/01-architecture/pii-protection.md`.
- No loggear PII, tokens ni secretos (guard `check-pii` en pre-commit).
- Archivos por presigned URLs de R2 con verificación de propiedad antes de firmar.
- Sesiones: cookies firmadas, contexto `portal` anti-fuga, impersonación auditada.

## 25. Performance

- Paginación y filtros en servidor para toda lista; índices existentes en Prisma — proponer índice si se agrega un filtro caliente.
- Evitar N+1 (`include`/`select`); evitar consultas duplicadas por render (memo/hooks existentes).
- `backdrop-filter` solo en superficies contenedoras (regla DS crítica de rendimiento móvil).
- Reportes y exports pesados: no bloquear requests interactivos; los crons ya existen para trabajo diferido.
- Archivos grandes van a R2, nunca por la BD ni en base64 por API.
- Conexiones BD limitadas en serverless (`connection_limit=5`): no abrir clientes Prisma extra — usar el singleton.

## 26. Testing and validation

Herramientas reales: Vitest 3 (proyectos `app` jsdom y `cashflow-matcher` node) + Testing Library; guards `check-ds`, `check-pii`, `lint:nav`; ESLint (`next lint`).

Orden de validación adaptable a cada tarea:

1. Pruebas dirigidas: `npx vitest run <patrón>` (los tests de nav/DS protegen esos patrones).
2. Typecheck: `npx tsc --noEmit`.
3. Lint: `npm run lint` (no introducir errores nuevos; hay preexistentes).
4. Guards si tocaste UI/nav/PII: `npm run check-ds`, `npm run lint:nav`, `npm run check-pii`.
5. Integración: `npm test` completo.
6. Build (`npm run build`) solo cuando el cambio lo amerite — es caro y toca migraciones.
7. E2E: no existe suite; validación manual/visual (dev server + light/dark + móvil 375px) cuando aplique.

No declarar una tarea completa sin validación ejecutada y reportada con resultados reales.

## 27. External services and MCP tools

Integraciones verificadas: Resend (email + webhooks), Google Workspace (Gmail sync/push, Drive, Calendar — tokens OAuth cifrados), Slack (events, commands, interactivity, outbox), SII Chile (DTE, RCV, cesiones), Twilio, Pusher, OpenAI, Cloudflare R2, Upstash Redis, Sentry, Google Maps/Leaflet, Apollo (prospección), web-push. El repo expone además un endpoint MCP propio (`src/app/api/mcp/`).

Usarlas solo cuando la tarea lo requiera; en desarrollo, la mayoría degrada a no-op si faltan las env vars — no inventar credenciales ni activar flags de producción.

## 28. Git and change management

- No sobrescribir cambios del usuario; revisar `git status`/`git diff` antes de commit.
- Cambios acotados al alcance; sin reformateos masivos.
- Commits descriptivos estilo del repo (`feat(modulo): …`, `fix(modulo): …`, en español).
- El pre-commit corre `check-pii` + `check-ds`: no saltárselo con `--no-verify`.
- No hacer force push, reescritura de historia, merges a `main`, ni despliegues salvo instrucción explícita.
- No commitear artefactos temporales (PDFs de prueba, `.env.local`, builds).

## 29. Destructive actions

Antes de cualquier acción destructiva (borrar datos, drop de columnas, `db push --accept-data-loss` en remoto, borrado de archivos R2, desactivar crons/tenants): verificar entorno (¿local o producción?), objetivo exacto, alcance (¿un tenant o todos?), respaldo disponible, plan de rollback y autorización explícita del usuario. En duda, no ejecutar y preguntar.

## 30. Definition of done

Una tarea termina solo cuando:

- el comportamiento pedido está implementado;
- la causa raíz está resuelta (no parcheada);
- datos, scoping por tenant y permisos están preservados;
- las validaciones de §26 aplicables fueron ejecutadas;
- el diff fue revisado completo;
- no hay cambios ajenos al alcance;
- se informaron riesgos materiales y pendientes.

## 31. Final response format

### Implementado
Qué se hizo y por qué (causa raíz).

### Validación
Comandos ejecutados y resultados reales (incluyendo fallos).

### Archivos principales
Rutas de los archivos tocados.

### Riesgos o pendientes
Impactos posibles, deuda dejada, seguimiento sugerido.

## 32. Verified project facts

| Área | Implementación verificada | Fuente |
|---|---|---|
| Producto | SaaS multi-tenant para empresas de seguridad (Chile), tenant seed `gard` | `README.md`, `prisma/seed.ts` |
| Framework | Next.js 16 App Router + React 19 + TS 5.6 strict, Node 22 | `package.json`, `tsconfig.json`, `.nvmrc` |
| BD | PostgreSQL (Neon/pgvector) + Prisma 6, 15 schemas, ~381 modelos | `prisma/schema.prisma` |
| Auth | Auth.js v5 Credentials+Google (ERP); RUT+PIN / device_token / magic link (portales); platform JWT | `src/lib/auth.ts`, `src/lib/portal-*`, `src/lib/platform-jwt.ts` |
| Autorización | RBAC módulos/submódulos/capabilities, niveles none/view/edit/full; roles owner, admin, editor, jefe_operaciones, central_monitoreo, supervisor, viewer, inspector_dt (+legacy); RoleTemplate por tenant | `src/lib/permissions.ts` |
| Middleware | `src/proxy.ts` — rutas públicas + protección + path→permiso | `src/proxy.ts` |
| Multitenancy | `tenantId` en sesión y en todos los modelos de negocio; módulos habilitables por tenant | `src/lib/api-auth.ts`, `src/lib/tenant-modules.ts`, `docs/01-architecture/multitenancy.md` |
| Navegación | Registry único 4 niveles | `src/lib/nav/registry.ts`, `AGENTS.md` |
| Design system | `@/components/opai-ds` + tokens semánticos + guard automático | `src/components/opai-ds/`, `scripts/check-design-system.mjs`, `AGENTS.md` |
| Jobs | ~60 crons Vercel sobre `api/cron/**` + patrón outbox | `vercel.json` |
| Storage | Cloudflare R2 presigned | `src/lib/storage.ts` |
| Email | Resend + React Email + webhook svix | `src/lib/resend.ts`, `src/emails/` |
| Móvil | Capacitor 8, apps Terreno/Personas/ERP | `capacitor.config.*.ts`, scripts `cap:*` |
| Testing | Vitest 3 (jsdom + node project) + Testing Library; sin E2E | `vitest.config.ts` |
| Deploy | Vercel; build aplica migraciones; Sentry + Vercel Analytics | `package.json` (`build`), `vercel.json`, `src/instrumentation.ts` |
| Dev local | `dev:watch` + Docker `pgvector/pgvector:pg16` + `db push` + seed | `AGENTS.md` |
| Integraciones | Resend, Google Workspace, Slack, SII (DTE/RCV), Twilio, Pusher, OpenAI, Upstash, Apollo, Maps | `src/lib/`, `src/app/api/integrations/` |
| Compliance | Res. Exenta N°38 DT (marcación, inspector_dt), Ley 21.719 (PII, DPA/DPO) | `src/proxy.ts`, `prisma/schema.prisma`, `docs/01-architecture/pii-protection.md` |

No identificado en el repositorio: script npm de formato (Prettier), suite E2E, caché de aplicación general, comando de contenedores para la app (solo Postgres en `docker-compose.dev.yml`).
