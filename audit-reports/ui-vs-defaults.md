## 7. Contradicciones UI ↔ Defaults

### 7.1 Ítems en UI cuyo `submodule` NO existe en SUBMODULE_KEYS.config

(Si validatePermissions se ejecutara sobre un RoleTemplate con estas keys, fallaría)

| title | href | submodule declarado |
|---|---|---|
| Gamificación | /opai/configuracion/gamificacion | **gamificacion** ❌ |

### 7.2 Ítems marcados `adminOnly` PERO que no-admin vería por defaults

(contradicción: la UI oculta a no-admins algo que sus defaults permitirían)

| title | submodule | roles no-admin que podrían ver |
|---|---|---|
| (ninguno) | | |

### 7.3 Ítems NO `adminOnly` pero que no-admin NO puede ver por defaults

(bug UX: items que deberían ser visibles a todos pero quedan ocultos)

| title | submodule | roles no-admin bloqueados |
|---|---|---|
| Usuarios | usuarios | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Grupos | grupos | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Integraciones | integraciones | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Notificaciones | notificaciones | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Firmas | firmas | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Categorías de plantillas | categorias | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| CRM | crm | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Cotizaciones (CPQ) | cpq | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Payroll | payroll | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Operaciones | ops | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Tipos de Ticket | tipos_ticket | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Finanzas | finanzas | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| Alertas de Cobertura | alertas_cobertura | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |
| ATS — Reclutamiento | ats | 14/14: editor, jefe_operaciones, central_monitoreo, supervisor, viewer, rrhh, operaciones, finanzas, reclutamiento, solo_ops, solo_crm, solo_documentos, solo_payroll, inspector_dt |

### 7.4 Ítems visibles en Configuración por rol (solo defaults)

(incluye el guard de página + filtro UI `adminOnly`)

| rol | módulo config | items visibles UI | lista |
|---|---|---:|---|
| owner | full | 22/22 | Datos de la Empresa, Usuarios, Roles y Permisos, Grupos, Integraciones, Notificaciones, Asistente IA, Auditoría, Documentos Operacionales, Mi Plan, Firmas, Categorías de plantillas, Cumplimiento, CRM, Cotizaciones (CPQ), Payroll, Operaciones, Tipos de Ticket, Finanzas, Gamificación, Alertas de Cobertura, ATS — Reclutamiento |
| admin | edit | 22/22 | Datos de la Empresa, Usuarios, Roles y Permisos, Grupos, Integraciones, Notificaciones, Asistente IA, Auditoría, Documentos Operacionales, Mi Plan, Firmas, Categorías de plantillas, Cumplimiento, CRM, Cotizaciones (CPQ), Payroll, Operaciones, Tipos de Ticket, Finanzas, Gamificación, Alertas de Cobertura, ATS — Reclutamiento |
| editor | none | 0/22 | — |
| jefe_operaciones | none | 0/22 | — |
| central_monitoreo | none | 0/22 | — |
| supervisor | none | 0/22 | — |
| viewer | none | 0/22 | — |
| rrhh | none | 0/22 | — |
| operaciones | none | 0/22 | — |
| finanzas | none | 0/22 | — |
| reclutamiento | none | 0/22 | — |
| solo_ops | none | 0/22 | — |
| solo_crm | none | 0/22 | — |
| solo_documentos | none | 0/22 | — |
| solo_payroll | none | 0/22 | — |
| inspector_dt | none | 0/22 | — |
