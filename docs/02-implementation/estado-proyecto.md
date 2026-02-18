# Estado del Proyecto (Snapshot Operativo)

> **Fecha:** 2026-02-18  
> **Estado:** Vigente  
> **Referencia principal:** `docs/02-implementation/ESTADO_GENERAL.md`

---

## Donde estamos hoy

OPAI tiene base comercial estable (Hub/CRM/CPQ/Docs/Config), Payroll parcial, y **toda la capa operativa implementada**: Ops, marcación digital, rondas, tickets con SLA, notificaciones y finanzas (rendiciones).

### Módulos operativos (todos completados)

- **Ops + TE + Personas:** ✅ MVP v1 + v2 refactorizado
- **Marcación digital:** ✅ Completada (RUT+PIN+geo, cumple Res. Exenta N°38)
- **Rondas:** ✅ Completadas (checkpoints, plantillas, programación, monitoreo, alertas)
- **Tickets + SLA:** ✅ Completados (tipos, aprobaciones, SLA automático)
- **Notificaciones:** ✅ 23 tipos, bell + email, preferencias por usuario
- **Finanzas (Rendiciones):** ✅ Rendiciones, aprobaciones, pagos, exportación Santander

### Datos globales del repositorio

| Indicador | Valor |
|-----------|-------|
| Modelos Prisma | 143 |
| Schemas DB | 8 (`public`, `crm`, `cpq`, `docs`, `payroll`, `fx`, `ops`, `finance`) |
| Endpoints API | 318 |
| Páginas | 103 |
| Componentes UI | ~268 |
| Cron Jobs | 8 |
| Roles RBAC | 13 |

---

## Que sigue inmediato

1. **ERP Financiero-Contable** — Plan de cuentas, facturación DTE, tesorería, conciliación (diseño completo listo)
2. **Completitud Payroll** — Asignación Familiar, Horas Extra, APV, pensión alimenticia
3. **Portal guardias mejorado** — Comunicados, solicitudes RRHH
4. **Inventario** — Catálogo, stock, kits, asignaciones
5. **Certificación DT marcación** — Portal fiscalizador, alertas jornada, FEA

---

## Fuente de verdad

- Estado real detallado: `docs/02-implementation/ESTADO_GENERAL.md`
- Plan ERP: `docs/plans/2026-02-15-erp-financiero-contable-design.md`
- Plan implementación ERP: `docs/plans/2026-02-15-erp-fase1-implementation-plan.md`
- Roadmap maestro: `docs/00-product/MASTER_SPEC_OPI.md`
