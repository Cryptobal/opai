# Documentacion OPAI Suite

> **Actualizado:** 2026-02-11

---

## Documentos Clave (empieza aqui)

| Documento | Que contiene | Cuando usarlo |
|-----------|-------------|---------------|
| [MASTER_SPEC_OPI.md](./00-product/MASTER_SPEC_OPI.md) | Vision completa de la plataforma, TODAS las fases, que esta hecho y que falta | Para entender a donde va el producto |
| [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) | Estado real de TODOS los modulos, tecnologias, metricas | Para saber donde estamos HOY |
| [000-opai-suite-master.md](./00-product/000-opai-suite-master.md) | Arquitectura, principios, multi-tenancy, RBAC, convenciones | Para decisiones tecnicas |

---

## Estructura de documentacion

```
docs/
├── README.md                            ← Este archivo (indice)
│
├── 00-product/                          ← Vision y estrategia
│   ├── MASTER_SPEC_OPI.md               ← DOCUMENTO MAESTRO (todas las fases)
│   ├── 000-opai-suite-master.md         ← Arquitectura y principios OPAI Suite
│   └── 001-docs-master.md              ← Master del modulo Presentaciones
│
├── 01-architecture/                     ← Arquitectura tecnica
│   ├── overview.md                      ← Stack y componentes
│   ├── monorepo-structure.md            ← Estructura single-domain
│   ├── auth.md                          ← Auth.js v5, invitaciones, RBAC
│   ├── multitenancy.md                  ← Multi-tenancy, aislamiento de datos
│   ├── design-system.md                 ← Design system dark-first
│   └── adr/README.md                    ← Architecture Decision Records
│
├── 02-implementation/                   ← Estado y guias tecnicas
│   ├── ESTADO_GENERAL.md                ← ESTADO REAL de todos los modulos
│   ├── database-schema.md               ← Esquema de base de datos
│   ├── checklist-multitenant.md         ← Validacion multi-tenant
│   └── usuarios-roles.md               ← Sistema de usuarios y RBAC
│
├── 03-integrations/                     ← Integraciones externas
│   ├── zoho-integration.md              ← Webhook Zoho CRM
│   ├── tokens-zoho.md                   ← Tokens dinamicos
│   └── CODIGO-DELUGE-COMPLETO.md        ← Codigo Deluge para Zoho
│
├── 04-sales/                            ← Contenido comercial
│   └── presentacion-comercial.md        ← Template de presentacion B2B
│
├── 05-pdf-generation/                   ← Generacion de PDFs
│   └── playwright-pdf.md               ← Playwright + Chromium
│
├── 05-etapa-1/                          ← Plan de implementacion Fase 1 OPI
│   └── ETAPA_1_IMPLEMENTACION.md        ← Plan maestro (Ops + TE + Personas)
│
├── 06-etapa-2/                          ← Plan de implementacion Fase 2 OPI
│   ├── ETAPA_2_IMPLEMENTACION.md        ← Plan maestro (Postventa + Tickets)
│   ├── ETAPA_2_CHANGELOG.md             ← Archivos a crear/modificar
│   └── ASSUMPTIONS_ETAPA_2.md           ← Supuestos y decisiones pendientes
│
├── CHANGELOG.md                         ← Historial de cambios
├── NORMALIZACION-COMPLETADA.md          ← Historico de normalizacion
│
└── _deprecated/                         ← Archivos obsoletos (no usar)
    ├── README.md
    ├── estado-proyecto-docs-legacy.md   ← Estado del modulo Docs (legacy)
    ├── AUDITORIA-PROYECTO-COMPLETA.md   ← Auditoria historica
    ├── DESIGN-SYSTEM-IMPLEMENTATION.md  ← Implementacion design system
    ├── PAYROLL-ROADMAP.md               ← Roadmap payroll
    ├── 000-repo-init.md                 ← Inicializacion repo (vacio)
    ├── 010-repo-playbook.md             ← Estrategia multi-repo (obsoleta)
    └── (stubs de redireccion)
```

---

## Modulos implementados

| Modulo | Estado | Docs relevantes |
|--------|:------:|----------------|
| Hub | ✅ | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |
| CRM | ✅ | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |
| CPQ | ✅ | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |
| Presentaciones | ✅ | [001-docs-master.md](./00-product/001-docs-master.md) |
| Documentos | ✅ | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |
| Payroll | ⚠️ 60% | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |
| Ops + TE + Personas | ✅ MVP v1 | [docs/05-etapa-1/](./05-etapa-1/) |
| Auth/RBAC | ✅ | [auth.md](./01-architecture/auth.md), [usuarios-roles.md](./02-implementation/usuarios-roles.md) |
| Config | ✅ | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |

## Fases OPI (estado)

| Fase | Modulo | Plan |
|:----:|--------|------|
| 1 | Ops + TE + Personas | ✅ MVP v1 ([docs/05-etapa-1/](./05-etapa-1/)) |
| 2 | Postventa + Tickets | [docs/06-etapa-2/](./06-etapa-2/) |
| 3 | Portal guardias | [MASTER_SPEC_OPI.md](./00-product/MASTER_SPEC_OPI.md) |
| 4 | Inventario | [MASTER_SPEC_OPI.md](./00-product/MASTER_SPEC_OPI.md) |
| 5 | Asistencia externa | [MASTER_SPEC_OPI.md](./00-product/MASTER_SPEC_OPI.md) |

---

## Inicio rapido

1. Lee [MASTER_SPEC_OPI.md](./00-product/MASTER_SPEC_OPI.md) para entender la vision completa
2. Lee [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) para saber que esta implementado
3. Para continuar Fase 1, lee [docs/05-etapa-1/](./05-etapa-1/)
4. Si se prioriza Fase 2, usa [docs/06-etapa-2/](./06-etapa-2/)

---

*Contacto: carlos.irigoyen@gard.cl | opai.gard.cl*
