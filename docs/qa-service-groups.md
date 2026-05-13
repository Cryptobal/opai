# QA — Agrupación de puestos por servicio

## CPQ Quote Detail
- [ ] "Agregar Servicio" abre wizard 2 pasos
- [ ] Paso 1: 6 patrones visibles, selección visual clara
- [ ] Paso 2: nombre sugerido se autocompleta; cargo/rol/puesto cargan desde catálogo
- [ ] Custom: crea grupo vacío sin shifts (botón "Agregar turno a este servicio")
- [ ] 24/7: crea 2 shifts día + noche, ambos Lun-Dom, 4x4
- [ ] 12/7 Día / 12/7 Noche: 1 shift cada uno
- [ ] 5x2: 1 shift día Lun-Vie
- [ ] Editar nombre del grupo guarda al backend (PATCH /services/:gid)
- [ ] Eliminar grupo pregunta cascade vs set-null; ambos comportamientos funcionan
- [ ] Mobile: cards colapsan correctamente, FAB visible
- [ ] "Sin agrupar" aparece solo si hay positions sin serviceGroupId
- [ ] Botón "Auto-agrupar" funciona: positions sin grupo se reagrupan por (cargoId, puestoTrabajoId)
- [ ] "Turno suelto" sigue funcionando (crea position con serviceGroupId=null)
- [ ] Click en "Agregar turno a este servicio" abre CreatePositionModal pre-asignado al grupo

## CRM Lead — Embedded CPQ
- [ ] Wizard "Agregar Servicio" funciona idéntico al de CPQ
- [ ] Editar grupo (nombre, agregar turno, eliminar) modifica el JSON config local
- [ ] Al aprobar lead → conversión a CPQ preserva los grupos:
   * Para cada serviceGroupKey distinto, se crea 1 CpqServiceGroup en backend
   * Cada position queda vinculada al grupo correspondiente

## Read-only views
- [ ] DotacionSummary muestra grupos con header
- [ ] PDF cotización: shifts agrupados bajo título del servicio
- [ ] Portal cliente: idem PDF

## Multi-tenant
- [ ] /services endpoints filtran por tenantId
- [ ] Lead JSON no expone tenantId (todo derivado del session)

## Backward compat
- [ ] Quotes legacy (positions sin serviceGroupId) siguen renderizando bajo "Sin agrupar"
- [ ] CRUD individual de positions (PATCH /positions/:pid) sigue funcionando intacto
- [ ] Templates rápidos siguen disponibles
- [ ] Cálculo de costos no cambia (refreshQuoteTotals se llama después de cada cambio de grupo)
