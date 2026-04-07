Entendido: quieres un solo documento final, completo, en formato técnico, que puedas copiar/pegar en Cursor (idealmente como MASTER_SPEC.md) y el agente entienda qué construir, con alcance, módulos, DB, APIs, jobs, permisos, fases, y criterios de aceptación.

Abajo va la versión final (vFinal). Está escrita como especificación ejecutable: clara, sin ambigüedades, con entregables por fase.
Cópiala tal cual a un archivo en tu repo (ej: docs/MASTER_SPEC.md) y úsala como fuente única de verdad para prompts.

⸻

MASTER_SPEC.md — OPI Platform (vFinal)

0) Propósito

Construir la plataforma OPI para Gard con enfoque mobile-first y separación de dominios para evitar enredos, permitiendo:
	1.	Definir estructura operacional por instalación (puestos operativos).
	2.	Planificar cobertura (pauta mensual) y ejecutar realidad (asistencia diaria).
	3.	Gestionar PPC (puestos por cubrir) y resolverlos con Turnos Extra (TE).
	4.	Pagar TE por lotes semanales con trazabilidad por guardia.
	5.	Gestionar Personas (postulantes, guardias, OS10, documentos, cuenta bancaria, lista negra, historial).
	6.	Postventa (visitas georreferenciadas check-in/out, bitácora, incidentes, KPI).
	7.	Tickets internos + tickets de guardias vía portal/link (sin portal de cliente por ahora).
	8.	Inventario (stock y kits de uniforme, asignación y costo imputable por guardia/instalación).
	9.	Preparar integración futura de asistencia por API/FaceID, con auto-corrección de asistencia diaria y base para Payroll.

⸻

1) Principios de arquitectura (invariantes)

1.1 Ejes canónicos
	•	Instalación: eje operativo y postventa.
	•	Puesto Operativo (PO): eje de planificación/cobertura.
	•	Asistencia Diaria: eje de realidad operacional (fuente canónica para TE y Payroll).
	•	Guardia: eje de personas/eligibilidad/portal.

1.2 Separación de dominios
	•	Personas: identidad/estado laboral/documentos/OS10/cuentas/lista negra/comentarios.
	•	Ops: estructura de servicio (PO), pauta mensual, asistencia diaria, PPC y generación de TE.
	•	TE & Pagos: aprobación RRHH, lotes de pago, marcado pagado, historial.
	•	Postventa: check-in/out georreferenciado + bitácora + incidentes + KPI.
	•	Tickets: seguimiento transversal (interno y desde guardias).
	•	Inventario: compras, stock, kits, asignaciones, mínimos.
	•	Portal Guardias (sub-app): comunicados + solicitudes RRHH + tickets (sin pauta).

1.3 Mobile-first
	•	Supervisores: check-in/out, bitácora, tickets, solicitudes en terreno con 3-4 acciones máximo.
	•	Guardias: portal minimalista: comunicados, solicitudes, tickets.

⸻

2) Glosario canónico

2.1 Puesto Operativo (PO)

Entidad permanente que representa una obligación de cobertura de una instalación:
	•	horario (inicio/fin), días semana, patrón (4x4, 5x2, etc.)
	•	se crea desde estructura de servicio al cerrar contrato
	•	si hay dotación simultánea (ej: 2 puestos iguales), se crean 2 PO distintos.

2.2 Guardia

Persona contratada. Reglas:
	•	No puede cubrir dos PO el mismo día.
	•	Descanso: inicialmente se bloquea doble asignación diaria. Luego se incorporará “min_rest_hours”.

2.3 PPC (Puesto Por Cubrir)

Estado de un PO cuando no está cubierto efectivamente en una fecha:
	•	no asignado base
	•	licencia/permiso/vacaciones
	•	no asistencia
	•	renuncia/despido/finiquito → PPC desde día siguiente al último día trabajado

PPC no es tabla, se deriva.

2.4 Turno Extra (TE)

Cobertura por guardia “no base” en una fecha:
	•	reemplazo de inasistencia
	•	cobertura de PPC (sin guardia base)
Monto TE: fijo por instalación (se snapshot en TE).

2.5 Lista Negra

Bloquea contratación, TE y portal. Sin apelación. Solo Admin/SuperAdmin revierte. Siempre auditado.

⸻

3) Decisiones cerradas

3.1 Geofence check-in/out (Postventa)
	•	GPS se activa solo durante check-in/out.
	•	Validación:
	•	dentro de radio → result=ok
	•	fuera de radio → permitido result=override solo si:
	•	motivo (enum)
	•	justificación (texto)
	•	foto (obligatoria)
	•	auditoría completa

3.2 Portal guardias
	•	Acceso solo si guardia está contratado y activo, y no está en lista negra.
	•	Portal no muestra pauta ni turnos futuros.
	•	Portal permite solicitudes RRHH y tickets.

3.3 Asistencia externa (API/FaceID)
	•	Se ingestan eventos externos.
	•	El sistema puede corregir automáticamente asistencia_diaria según reglas de precedencia.
	•	Todo cambio queda auditado con fuente.

⸻

4) Módulos y páginas

4.1 Personas
	•	/personas/postulantes (pipeline)
	•	/personas/postulantes/[id]
	•	/personas/guardias
	•	/personas/guardias/[id] (360)
	•	/personas/lista-negra

4.2 Ops
	•	/ops/instalaciones
	•	/ops/instalaciones/[id] (estructura, supervisor, geofence, TE monto)
	•	/ops/puestos
	•	/ops/pauta-mensual
	•	/ops/pauta-diaria
	•	/ops/ppc

4.3 TE & Pagos
	•	/te/registro
	•	/te/aprobaciones
	•	/te/lotes
	•	/te/pagos
	•	/te/historial/[guardia_id]

4.4 Postventa
	•	/postventa/checkin (mobile)
	•	/postventa/instalaciones/[id]/bitacora
	•	/postventa/incidentes
	•	/postventa/kpis

4.5 Tickets
	•	/tickets
	•	/tickets/[id]

4.6 Solicitudes (Bandeja Única)
	•	/solicitudes
	•	/solicitudes/[id]

4.7 Inventario
	•	/inventario/catalogo
	•	/inventario/compras
	•	/inventario/stock
	•	/inventario/kits
	•	/inventario/asignaciones

4.8 Portal guardias (sub-app)

Subdominio recomendado: portal.opi.cl
	•	/portal/login
	•	/portal/comunicados
	•	/portal/solicitudes
	•	/portal/tickets

⸻

5) Modelo de datos (PostgreSQL) — Canon

5.1 Entidades base
	•	cliente
	•	instalacion
	•	incluye: geo_lat, geo_lng, geo_radius_m
	•	incluye: te_monto_clp (monto fijo TE por instalación)
	•	persona
	•	guardia
	•	guardia_flag (disponible_te, lista_negra)
	•	documento_persona (incluye OS10 como tipo)
	•	cuenta_bancaria
	•	comentario_guardia (auditado)

5.2 Ops
	•	puesto_operativo
	•	pauta_mensual (puesto_id + fecha) → guardia_id plan
	•	asistencia_diaria (puesto_id + fecha) → estado real + reemplazo
	•	evento_rrhh (licencia, permisos, vacaciones, renuncia, despido, finiquito)

5.3 Turno Extra & pagos
	•	turno_extra (FK asistencia_diaria preferido)
	•	pago_te_lote
	•	pago_te_item (snapshot bancario)

5.4 Postventa
	•	visit_checkin (checkin/out con geofence ok/override + evidencia)
	•	site_log_entry (novedad/incidente/observación + severidad + link ticket)

5.5 Tickets
	•	ticket, ticket_comment, ticket_attachment, ticket_category

5.6 Comunicados
	•	announcement, announcement_delivery

5.7 Inventario
	•	inventory_item, inventory_variant
	•	warehouse
	•	purchase, purchase_line
	•	stock_ledger
	•	kit_template, kit_template_item
	•	assignment (asignación a guardia/instalación)

5.8 Asistencia externa
	•	attendance_event (fuente, confianza, payload crudo)

5.9 Auditoría
	•	audit_event (actor, entidad, acción, diff)

Implementación DDL: ver sección “DDL Reference” (anexa).
(El repositorio debe tener un script db/migrations/000_master.sql con el DDL completo.)

⸻

6) Reglas de negocio (hard rules)

6.1 Asignación pauta mensual
	•	Restricción: un guardia no puede estar asignado a 2 PO en la misma fecha.
	•	Validación al guardar batch.

6.2 Derivación asistencia diaria

La asistencia diaria se materializa como:
	•	Base: pauta mensual
	•	Overrides: eventos RRHH
	•	Señales externas: attendance_event (FaceID/API)
	•	Manual Ops (cuando no existe señal externa confiable)

6.3 Generación TE

Se crea/actualiza TE cuando:
	•	asistencia_diaria.guardia_reemplazo_id está definido, o
	•	estado refleja PPC y se asigna una cobertura
TE guarda monto_snapshot desde instalación.

6.4 Portal guardias
	•	Acceso si:
	•	guardia.estado = activo
	•	tiene relación contractual activa (contratado_desde no nulo)
	•	no lista negra
	•	Portal solo ve recursos del guardia.

6.5 Lista negra
	•	Bloquea:
	•	asignación en pauta
	•	selección como reemplazo
	•	autenticación portal

⸻

7) Categorías de tickets (inicial)

Se crea tabla ticket_category con defaults:
	1.	incidente_operacional → postventa (p2, SLA 24h)
	2.	novedad_instalacion → postventa (p3, SLA 72h)
	3.	ausencia_reemplazo_urgente → ops (p1, SLA 2h)
	4.	solicitud_rrhh → rrhh (p3, SLA 72h)
	5.	permiso_vacaciones_licencia → rrhh (p2, SLA 48h)
	6.	uniforme_implementos → inventario (p3, SLA 72h)
	7.	activo_danado_perdido → inventario (p2, SLA 48h)
	8.	pago_turno_extra → rrhh/finanzas (p2, SLA 48h)
	9.	conducta_disciplina → rrhh (p2, SLA 48h)
	10.	soporte_plataforma → it/admin (p3, SLA 72h)

Regla: categoría determina assigned_team, default_priority, sla_hours.

⸻

8) APIs (REST) — Contratos mínimos

8.1 Ops
	•	GET /api/ops/instalaciones
	•	POST /api/ops/instalaciones
	•	PATCH /api/ops/instalaciones/:id (incluye geofence, te_monto_clp)
	•	POST /api/ops/puestos/bulk-create (crea N PO)
	•	GET /api/ops/pauta-mensual?instalacion_id&mes&anio
	•	POST /api/ops/pauta-mensual/generar (aplica patrón por PO)
	•	POST /api/ops/pauta-mensual/guardar (batch upsert + validación no doble asignación)
	•	GET /api/ops/asistencia?fecha&instalacion_id
	•	PATCH /api/ops/asistencia/:id (asistencia, motivo, reemplazo)

8.2 TE & pagos
	•	GET /api/te?desde&hasta&estado
	•	PATCH /api/te/:id/aprobar
	•	PATCH /api/te/:id/rechazar
	•	POST /api/te/lotes (corte semanal)
	•	GET /api/te/lotes/:id/export-santander
	•	PATCH /api/te/lotes/:id/marcar-pagado

8.3 Postventa
	•	POST /api/postventa/checkin
	•	POST /api/postventa/checkout
	•	GET /api/postventa/bitacora?instalacion_id&desde&hasta
	•	POST /api/postventa/bitacora (novedad/incidente)
	•	GET /api/postventa/kpis?desde&hasta

8.4 Tickets
	•	GET /api/tickets?status&team&instalacion_id&guardia_id
	•	POST /api/tickets
	•	PATCH /api/tickets/:id
	•	POST /api/tickets/:id/comments
	•	POST /api/tickets/:id/attachments

8.5 Solicitudes
	•	GET /api/solicitudes?tipo&estado
	•	POST /api/solicitudes
	•	PATCH /api/solicitudes/:id/aprobar
	•	PATCH /api/solicitudes/:id/rechazar

8.6 Portal guardias
	•	POST /api/portal/auth/request-otp
	•	POST /api/portal/auth/verify-otp
	•	GET /api/portal/me
	•	GET /api/portal/announcements
	•	GET /api/portal/solicitudes
	•	POST /api/portal/solicitudes
	•	GET /api/portal/tickets
	•	POST /api/portal/tickets

8.7 Asistencia externa
	•	POST /api/attendance-events (API key)
	•	Job reconciliador actualiza asistencia diaria

⸻

9) Jobs/Automatismos (obligatorios)

9.1 Materialización diaria (pauta→asistencia)

Job: ops_daily_materializer(fecha)
	•	upsert asistencia_diaria para cada PO activo y fecha
	•	aplica evento_rrhh sobre estado
	•	set sin_guardia si no hay plan

9.2 Reconciliación asistencia externa

Job: attendance_reconciler(fecha)
	•	carga attendance_event
	•	aplica precedencia y auto-corrección
	•	set asistencia_diaria.last_source = faceid/api_external
	•	registra audit_event

Precedencia
	1.	RRHH (licencia/vacaciones/permiso) domina (bloquea “asistió”)
	2.	FaceID/API alta confianza domina manual
	3.	Manual solo cuando no hay señal externa confiable

⸻

10) Seguridad y roles (mínimo)

Roles:
	•	SuperAdmin, Admin, RRHH, Operaciones, Reclutamiento, Supervisor, SoloLectura, GuardiaPortal

Reglas:
	•	Supervisor: postventa, tickets, solicitudes (no aprueba).
	•	RRHH: aprueba TE, gestiona solicitudes guardias, lista negra.
	•	Operaciones: estructura, pauta, asistencia manual, cobertura.
	•	GuardiaPortal: solo su data.

⸻

11) Fases (para ejecución en Cursor)

Fase 1 — Ops + TE + Personas mínimo (MVP)

Entregables
	•	DB core + Ops + TE
	•	UI pauta mensual + diaria
	•	TE generado desde asistencia
	•	aprobación RRHH + lote semanal + marcar pagado
	•	Personas: guardia, cuenta, docs, flags, lista negra básica

Criterios de aceptación
	•	Generar pauta mensual por instalación y guardar
	•	Ver pauta diaria y marcar asistió/no asistió
	•	Asignar reemplazo → genera TE pendiente con monto instalación
	•	Aprobar TE → incluir en lote semanal → marcar pagado

Fase 2 — Postventa + Tickets core
	•	check-in/out geofence + override
	•	bitácora instalación + incidentes
	•	tickets + bandeja + categorías + SLA básico
	•	incidente puede crear ticket

Fase 3 — Portal guardias + comunicados + solicitudes
	•	OTP/Magic link
	•	comunicados
	•	solicitudes RRHH (permiso/vacaciones/licencia) + estado
	•	tickets guardias

Fase 4 — Inventario
	•	catálogo + variantes + compras + stock_ledger
	•	kit_template + asignación a guardia
	•	KPI básico stock mínimo

Fase 5 — Asistencia externa
	•	attendance_event
	•	reconciler auto-corrección
	•	auditoría completa

⸻

12) Instrucciones para uso con Cursor (cómo copiar y usar)
	1.	Crear carpeta docs/ en el repo.
	2.	Guardar este archivo como: docs/MASTER_SPEC.md.
	3.	Crear carpeta db/migrations/ y un archivo 000_master.sql con el DDL (ver anexo DDL).
	4.	En Cursor, trabajar por fases:
	•	Prompt por Fase (1 módulo a la vez)
	•	Referenciar siempre docs/MASTER_SPEC.md como fuente de verdad
	•	Prohibido “inventar” campos o flujos fuera de esta spec sin proponer change request.

Prompt base recomendado para Cursor

“Lee docs/MASTER_SPEC.md. Implementa SOLO la Fase X, sin tocar lo fuera de alcance. Crea migraciones SQL, endpoints REST, y UI mínima mobile-first. Asegura validaciones hard rules. Si falta información, asume valores default y documenta en docs/ASSUMPTIONS.md.”

⸻

ANEXO A — DDL Reference

(Usar el DDL que definimos: cliente/instalacion/persona/guardia/flags/docs/cuenta/puestos/pauta/asistencia/eventosRRHH/TE/lotes/postventa/tickets/comunicados/inventario/attendance_event/audit_event)

Si quieres, en el siguiente mensaje te lo entrego consolidado como un solo bloque SQL listo para pegar en db/migrations/000_master.sql (es largo, pero queda 100% copy/paste).

⸻

Último paso para dejarlo 100% “ejecutable” en Cursor

En tu siguiente mensaje dime: stack exacto de OPI (Next.js App Router? Prisma? Neon? auth actual?) y si la tabla de usuarios existe y cómo se llama. Con eso te convierto el DDL en:
	•	schema.prisma completo + relaciones e índices,
	•	rutas app/api/**/route.ts,
	•	y prompts por fase listos (sin improvisar).