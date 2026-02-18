# OPAI Suite — Gard Security

Suite SaaS para empresas de seguridad | `opai.gard.cl`

---

## Que es

OPAI Suite es una plataforma unificada que cubre el ciclo completo: desde la venta comercial hasta la operacion en terreno. Arquitectura MONOREPO single-domain con multi-tenancy.

## Modulos en produccion

| Modulo | Ruta | Descripcion |
|--------|------|-------------|
| **Hub** | `/hub` | Dashboard ejecutivo, KPIs, app launcher |
| **CRM** | `/crm/*` | Leads, cuentas, contactos, deals, instalaciones, pipeline, email, follow-ups |
| **CPQ** | `/cpq/*` | Cotizaciones con calculo de costo empleador |
| **Presentaciones** | `/opai/inicio` | Propuestas comerciales con tracking de vistas y emails |
| **Documentos** | `/opai/documentos/*` | Contratos y templates legales con tokens, versionado y firma digital |
| **Payroll** | `/payroll/*` | Simulador de liquidaciones Chile (parcial) |
| **Configuracion** | `/opai/configuracion/*` | Usuarios, roles, integraciones, firmas, categorias |
| **Ops** | `/ops/*` | Puestos, pauta mensual, asistencia diaria, PPC, turnos extra |
| **Marcacion** | `/marcar/[code]` | Marcacion digital RUT+PIN+geo, cumplimiento Res. Exenta N°38 DT |
| **Rondas** | `/ops/rondas/*` | Checkpoints, plantillas, programacion, monitoreo, alertas, reportes |
| **Tickets** | `/ops/tickets/*` | Tickets con SLA, aprobaciones multi-paso, tipos configurables |
| **Notificaciones** | Bell + Email | 23 tipos, preferencias por usuario, filtrado por RBAC |
| **Finanzas** | `/finanzas/*` | Rendiciones de gastos, aprobaciones, pagos, exportacion Santander |
| **Personas** | `/personas/*` | Guardias 360, documentos, lista negra, asignaciones |

## Stack

- **Framework:** Next.js 15 (App Router)
- **Lenguaje:** TypeScript 5.6
- **DB:** PostgreSQL (Neon) + Prisma (8 schemas, 143 modelos)
- **Auth:** Auth.js v5 (13 roles RBAC)
- **UI:** Tailwind CSS + Radix UI + shadcn/ui
- **Email:** Resend + React Email
- **AI:** OpenAI
- **PDF:** Playwright + Chromium + @react-pdf/renderer
- **Storage:** Cloudflare R2
- **Deploy:** Vercel (8 cron jobs activos)

## Metricas

| Indicador | Valor |
|-----------|-------|
| Paginas | 103 |
| Endpoints API | 318 |
| Modelos Prisma | 143 |
| Componentes UI | ~268 |
| Schemas DB | 8 |
| Cron Jobs | 8 |

## Instalacion

```bash
git clone git@github.com:Cryptobal/gard-docs.git
cd gard-docs
npm install
cp .env.example .env.local
# Completar variables de entorno (ver .env.example)
npx playwright install chromium
npm run dev
```

## Documentacion

| Documento | Proposito |
|-----------|-----------|
| [docs/00-product/MASTER_SPEC_OPI.md](docs/00-product/MASTER_SPEC_OPI.md) | Vision completa, todas las fases |
| [docs/02-implementation/ESTADO_GENERAL.md](docs/02-implementation/ESTADO_GENERAL.md) | Estado real de todos los modulos |
| [docs/README.md](docs/README.md) | Indice completo de documentacion |
| [docs/plans/](docs/plans/) | Planes de implementacion (ERP, etc.) |

## Equipo

- **Product Owner:** Carlos Irigoyen (Gard Security)
- **Development:** Cursor AI

---

2026 Gard Security
