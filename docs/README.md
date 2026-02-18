# Documentacion OPAI Suite

> **Actualizado:** 2026-02-18

---

## Documentos Clave (empieza aqui)

| Documento | Que contiene | Cuando usarlo |
|-----------|-------------|---------------|
| [MASTER_SPEC_OPI.md](./00-product/MASTER_SPEC_OPI.md) | Vision completa de la plataforma, TODAS las fases, que esta hecho y que falta | Para entender a donde va el producto |
| [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) | Estado real de TODOS los modulos, tecnologias, metricas | Para saber donde estamos HOY |
| [000-opai-suite-master.md](./00-product/000-opai-suite-master.md) | Arquitectura, principios, multi-tenancy, RBAC, convenciones | Para decisiones tecnicas |
| [role-policy-single-source.md](./02-implementation/role-policy-single-source.md) | Fuente unica de verdad para roles/permisos y protocolo de cambios | Antes de tocar RBAC o agregar roles |

---

## Estructura de documentacion

```
docs/
├── README.md                            ← Este archivo (indice)
│
├── 00-product/                          ← Vision y estrategia
│   ├── MASTER_SPEC_OPI.md               ← DOCUMENTO MAESTRO (todas las fases)
│   ├── 000-opai-suite-master.md         ← Arquitectura y principios OPAI Suite
│   ├── 001-docs-master.md              ← Master del modulo Presentaciones
│   └── GLOSARIO.md                     ← Glosario de terminos del dominio
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
│   ├── estado-proyecto.md               ← Snapshot operativo rapido
│   ├── database-schema.md               ← Esquema de base de datos
│   ├── checklist-multitenant.md         ← Validacion multi-tenant
│   ├── usuarios-roles.md               ← Sistema de usuarios y RBAC
│   ├── role-policy-single-source.md    ← Politica unica de roles y permisos
│   ├── ASISTENTE_FAQ_USO_FUNCIONAL.md  ← FAQ del asistente IA
│   └── ASISTENTE_MAPA_MODULOS_SUBMODULOS_URLS.md ← Mapa funcional completo
│
├── 03-integrations/                     ← Integraciones externas
│   ├── zoho-integration.md              ← Webhook Zoho CRM
│   ├── tokens-zoho.md                   ← Tokens dinamicos
│   └── CODIGO-DELUGE-COMPLETO.md        ← Codigo Deluge para Zoho
│
├── 04-sales/                            ← Contenido comercial
│   └── presentacion-comercial.md        ← Template de presentacion B2B
│
├── 05-etapa-1/                          ← Implementacion Fase 1 OPI (COMPLETADO)
│   └── ETAPA_1_IMPLEMENTACION.md        ← Plan maestro (Ops + TE + Personas)
│
├── 05-pdf-generation/                   ← Generacion de PDFs
│   └── playwright-pdf.md               ← Playwright + Chromium
│
├── 06-etapa-2/                          ← Plan de Fase 2 OPI (referencia)
│   ├── ETAPA_2_IMPLEMENTACION.md        ← Plan original (Postventa + Tickets)
│   ├── ETAPA_2_CHANGELOG.md             ← Archivos a crear/modificar
│   └── ASSUMPTIONS_ETAPA_2.md           ← Supuestos y decisiones
│
├── 07-etapa-3/                          ← Marcacion digital (COMPLETADO)
│   └── ETAPA_3_MARCACION.md             ← Plan completo + estado de cumplimiento
│
├── ai/                                  ← Base de conocimiento del asistente IA
│   ├── README.md                        ← Estructura del asistente
│   ├── intents/                         ← Playbooks por flujo
│   ├── exceptions/                      ← Manejo de casos borde
│   └── test-sets/                       ← Preguntas de validacion
│
├── plans/                               ← Planes de implementacion recientes
│   ├── 2026-02-15-erp-financiero-contable-design.md  ← Diseno ERP completo
│   ├── 2026-02-15-erp-fase1-implementation-plan.md   ← Plan de implementacion ERP
│   ├── 2026-02-15-local-phase-backend-design.md      ← Diseno backend local phase
│   ├── 2026-02-15-local-phase-implementation.md      ← Plan local phase
│   └── 2026-02-16-finance-banking-reconciliation.md  ← Conciliacion bancaria
│
├── CHANGELOG.md                         ← Historial de cambios
├── NORMALIZACION-COMPLETADA.md          ← Historico de normalizacion
│
└── _deprecated/                         ← Archivos obsoletos (no usar)
    └── README.md
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
| Ops + TE + Personas | ✅ | [docs/05-etapa-1/](./05-etapa-1/) |
| Marcacion digital | ✅ | [docs/07-etapa-3/](./07-etapa-3/) |
| Rondas | ✅ | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |
| Tickets + SLA | ✅ | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |
| Notificaciones | ✅ | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |
| Finanzas (Rendiciones) | ✅ | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |
| Auth/RBAC | ✅ | [auth.md](./01-architecture/auth.md), [usuarios-roles.md](./02-implementation/usuarios-roles.md) |
| Config | ✅ | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |

## Que falta por implementar

| Modulo | Plan |
|--------|------|
| ERP Financiero-Contable | [docs/plans/2026-02-15-erp-financiero-contable-design.md](./plans/2026-02-15-erp-financiero-contable-design.md) |
| Completitud Payroll | [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) |
| Portal guardias mejorado | [MASTER_SPEC_OPI.md](./00-product/MASTER_SPEC_OPI.md) |
| Inventario | [MASTER_SPEC_OPI.md](./00-product/MASTER_SPEC_OPI.md) |
| Certificacion DT marcacion | [docs/07-etapa-3/](./07-etapa-3/) |

---

## Inicio rapido

1. Lee [MASTER_SPEC_OPI.md](./00-product/MASTER_SPEC_OPI.md) para entender la vision completa
2. Lee [ESTADO_GENERAL.md](./02-implementation/ESTADO_GENERAL.md) para saber que esta implementado
3. Para el ERP financiero, lee [docs/plans/](./plans/)
4. Para el asistente IA, lee [docs/ai/](./ai/)

---

*Contacto: carlos.irigoyen@gard.cl | opai.gard.cl*
