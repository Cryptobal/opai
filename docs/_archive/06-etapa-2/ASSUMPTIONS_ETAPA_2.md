# ETAPA 2 — Supuestos y Decisiones Pendientes

> **Versión:** 1.1  
> **Fecha:** 2026-02-11  
> **Referencia:** `docs/ETAPA_2_IMPLEMENTACION.md`  
> **Estado:** Vigente para ejecución de Etapa 2 (con decisiones abiertas)

---

## Supuestos asumidos

Estos supuestos se adoptaron para poder avanzar con el diseño. Si alguno es incorrecto, se debe ajustar el plan antes de implementar.

### S1 — Actor del check-in: Admin (no Guardia)

**Supuesto:** El check-in postventa lo realiza un usuario `Admin` con rol `supervisor`, no un `guardia`.

**Justificación:** 
- La tabla `persona`/`guardia` ya existe (Fase 1 MVP), pero el flujo de postventa sigue siendo de supervisores
- El MASTER_SPEC (sección 1.3 Mobile-first) dice: "Supervisores: check-in/out, bitácora, tickets, solicitudes en terreno"
- Los guardias tienen su propio portal (Fase 3) pero no hacen check-in de postventa

**Impacto si es incorrecto:**
- Si se necesita que guardias hagan check-in, primero hay que crear la tabla `guardia` o usar un modelo simplificado
- Se agregaría un FK opcional `guardia_id` a `visit_checkin`

**Acción requerida:** Confirmar que check-in es exclusivo de supervisores.

---

### S2 — Storage de fotos: Vercel Blob

**Supuesto:** Las fotos de override (check-in) y bitácora se almacenan en Vercel Blob, el mismo provider usado para archivos CRM.

**Justificación:**
- El repo ya usa un `storage_provider` en `CrmFile` (probablemente Vercel Blob o similar)
- Mantener un solo provider simplifica la implementación

**Impacto si es incorrecto:**
- Si se usa S3, Cloudinary u otro, la lógica de upload cambia
- La estructura de URLs cambia

**Acción requerida:** Confirmar provider de storage actual.

---

### S3 — Tickets sin workflow de aprobación

**Supuesto:** Los tickets no requieren un ciclo de aprobación formal. Los cambios de estado son lineales: `open → in_progress → waiting/resolved → closed`.

**Justificación:**
- El MASTER_SPEC describe tickets como "seguimiento transversal", no como workflow de aprobación
- Las solicitudes RRHH con aprobación son Fase 3

**Impacto si es incorrecto:**
- Se necesitaría un estado `pending_approval` y lógica de aprobador
- Incrementa la complejidad de UI y permisos

**Acción requerida:** Confirmar que no se necesita aprobación en tickets.

---

### S4 — SLA en horas calendario (no horas hábiles)

**Supuesto:** El SLA se calcula como `created_at + sla_hours` sin considerar horario laboral, fines de semana ni feriados.

**Justificación:**
- El MASTER_SPEC dice `sla_hours` sin calificar si son horas hábiles
- Gard opera 24/7 (servicio de seguridad), por lo que horas calendario tiene sentido
- Implementar horas hábiles requiere calendario de feriados + horarios por equipo

**Impacto si es incorrecto:**
- Cálculo de SLA se complejiza significativamente
- Necesita tabla de feriados y configuración de horario laboral por equipo
- Tickets creados viernes noche vencerían sábado (podría no ser deseado para equipos admin)

**Acción requerida:** Confirmar si SLA opera en horas calendario o hábiles. Si es hábiles, definir para qué equipos.

---

### S5 — Upload de fotos separado del check-in

**Supuesto:** El flujo de subir fotos (override, bitácora) es en dos pasos: (1) subir foto → obtener URL, (2) enviar check-in/bitácora con la URL.

**Justificación:**
- Separar upload del request principal es más robusto en redes móviles lentas
- Permite retry del upload sin perder datos del formulario
- Patrón más limpio que multipart/form-data

**Impacto si es incorrecto:**
- Si se prefiere un solo request multipart, se debe crear un handler diferente
- La UX de "tomar foto y enviar" sería diferente

**Acción requerida:** Confirmar flujo preferido. Recomendación: upload separado.

---

### S6 — Transiciones de estado lineales

**Supuesto:** Las transiciones válidas de estado de tickets son:
- `open → in_progress, cancelled`
- `in_progress → waiting, resolved, cancelled`
- `waiting → in_progress, resolved, cancelled`
- `resolved → closed, cancelled`
- `closed` y `cancelled` son terminales

**Justificación:**
- Patrón estándar de gestión de tickets (Jira/Zendesk simplificado)
- No se permite reabrir un ticket cerrado (se debe crear uno nuevo)

**Impacto si es incorrecto:**
- Si se permite `closed → open` (reabrir), la máquina de estados cambia
- KPIs de resolución se complican con reaperturas

**Acción requerida:** Confirmar si se permite reabrir tickets cerrados.

---

### S7 — KPIs calculados en tiempo real

**Supuesto:** Los KPIs de postventa se calculan con queries SQL en tiempo real, sin materialización ni cache.

**Justificación:**
- Volumen esperado bajo-medio en fase inicial (decenas de check-ins por día, no miles)
- Materialización agrega complejidad (jobs, tablas de resumen)
- Se puede optimizar después si es necesario

**Impacto si es incorrecto:**
- Si hay cientos de instalaciones con check-ins diarios, los queries podrían ser lentos
- Se necesitaría una tabla `kpi_daily_summary` materializada por job nocturno

**Acción requerida:** Estimar volumen esperado de check-ins diarios. Si > 200/día, considerar materialización.

---

### S8 — Rol `supervisor` nuevo en RBAC

**Supuesto:** Se crea un nuevo rol `supervisor` en la jerarquía, posicionado entre `editor` y `viewer`:

```
owner > admin > editor > supervisor > viewer
```

**Justificación:**
- Los roles actuales (owner, admin, editor, viewer) no incluyen supervisor
- El MASTER_SPEC define supervisor como rol con permisos acotados: "postventa, tickets, solicitudes (no aprueba)"
- Supervisor necesita crear check-ins y bitácora pero no debería administrar CRM/CPQ

**Impacto si es incorrecto:**
- Si se prefiere no crear un rol nuevo y usar `editor` con permisos extendidos, se simplifica RBAC
- Si se necesitan los 8 roles del MASTER_SPEC (SuperAdmin, Admin, RRHH, Operaciones, Reclutamiento, Supervisor, SoloLectura, GuardiaPortal), la reestructuración de RBAC es mayor

**Acción requerida:** Decidir:
- (A) Agregar solo `supervisor` ahora → mínimo cambio
- (B) Reestructurar RBAC completo con los 8 roles del MASTER_SPEC → cambio mayor, prepara para todas las fases

**Recomendación:** Opción (A) para Etapa 2. Opción (B) se puede hacer como PR independiente antes o durante Fase 1.

---

## Decisiones pendientes

Estas son preguntas que necesitan respuesta del stakeholder antes de implementar.

### D1 — Orden de implementación Fase 1 vs Fase 2

**Contexto:** El MASTER_SPEC define un orden: Fase 1 (Ops + TE + Personas) → Fase 2 (Postventa + Tickets). Al 2026-02-11, Fase 1 ya está implementada en MVP.

**Decisión actual:** Continuar con Fase 2 sobre la base ya implementada de Fase 1, manteniendo integración progresiva para evitar regresiones.

---

### D2 — ¿Bitácora requiere check-in activo?

**Contexto:** ¿Un supervisor puede crear una entrada de bitácora sin estar "checkeado" en la instalación?

**Opciones:**
- (A) Sí, requiere check-in activo → `visit_checkin_id` obligatorio
- (B) No, bitácora independiente → `visit_checkin_id` opcional

**Recomendación:** (B) — Más flexible. El supervisor puede reportar algo sin haber hecho check-in formal (ej: llamada telefónica).

---

### D3 — ¿Storage compartido o separado para archivos ops?

**Contexto:** Los adjuntos de tickets y fotos de postventa pueden usar el sistema existente de `CrmFile`/`CrmFileLink` o tener tablas propias.

**Opciones:**
- (A) Reutilizar `CrmFile` + `CrmFileLink` con `entityType = 'ticket' | 'visit_checkin' | 'site_log'`
- (B) Crear `OpsTicketAttachment` propia (como en el plan actual)

**Recomendación:** (B) — Separación de dominios. Ops no depende del schema CRM para sus archivos.

---

### D4 — ¿Categorías de ticket futuras como seed?

**Contexto:** De las 10 categorías seed, algunas aplican a módulos no implementados:
- `uniforme_implementos` → Inventario (Fase 4)
- `pago_turno_extra` → TE (Fase 1)
- `ausencia_reemplazo_urgente` → Ops (Fase 1)

**Opciones:**
- (A) Crear las 10 categorías. Las de fases futuras existen pero su flujo de resolución es manual
- (B) Crear solo las 4-5 relevantes ahora. Agregar las demás en sus fases respectivas

**Recomendación:** (A) — Las categorías son solo metadata. Tenerlas desde el inicio permite crear tickets de cualquier tipo.

---

### D5 — ¿Endpoint de upload dedicado o reutilizar existente?

**Contexto:** Se necesita subir fotos para override check-in, bitácora, y adjuntos de tickets.

**Opciones:**
- (A) Crear `/api/ops/uploads` dedicado para el módulo ops
- (B) Reutilizar algún endpoint de upload existente si lo hay
- (C) Subir directamente a Vercel Blob desde el cliente (no server-side)

**Recomendación:** (A) — Endpoint dedicado mantiene separación. Valida tamaño (max 5MB), tipo MIME (image/*), y retorna URL.

---

### D6 — ¿BottomNav mobile: qué items mostrar?

**Contexto:** El BottomNav actual probablemente tiene ~5 items. Agregar Postventa y Tickets puede saturar.

**Opciones:**
- (A) Reemplazar items: Hub, Postventa, Tickets, CRM, Perfil
- (B) Condicionar por rol: Supervisor ve Postventa/Tickets; Editor ve CRM/Docs
- (C) Mantener 5 items con "Más" como último que abre drawer

**Recomendación:** (B) — BottomNav dinámico por rol. El supervisor no necesita CRM en mobile.

---

### D7 — ¿Notificaciones push mobile o solo in-app?

**Contexto:** Los tickets P1 y SLA vencidos deberían notificar al supervisor aunque no tenga la app abierta.

**Opciones:**
- (A) Solo notificaciones in-app (tabla `Notification` + NotificationBell)
- (B) In-app + Web Push Notifications (requiere Service Worker)
- (C) In-app + WhatsApp/SMS para urgentes

**Recomendación:** (A) para Etapa 2. Push notifications se puede agregar como mejora posterior.

---

## Vacíos detectados en `fase-2.md`

Estos puntos no están claramente definidos en el documento fuente:

1. **¿Qué pasa con check-ins abiertos que nunca se cierran?** — No hay regla de auto-cierre. Sugerencia: Job que cierra check-ins > 8h con nota "auto-cerrado".

2. **¿Puede un supervisor hacer check-in en múltiples instalaciones simultáneamente?** — No hay restricción definida. Sugerencia: Permitirlo (supervisor puede visitar sitio A y luego B sin cerrar A).

3. **¿Quién puede ver tickets de otros equipos?** — No hay regla de visibilidad por equipo. Sugerencia: Todos los usuarios con acceso a tickets ven todos los tickets del tenant. Filtro por "mis asignados" como shortcut.

4. **¿Se pueden eliminar tickets?** — No hay mención a DELETE. Sugerencia: No eliminar, solo cancelar. Tickets son auditoría.

5. **¿Hay notificación al cambiar asignado de un ticket?** — No especificado. Sugerencia: Sí, notificar al nuevo asignado.

6. **¿Los comentarios de ticket se pueden editar/eliminar?** — No especificado. Sugerencia: No editar ni eliminar (trazabilidad). Solo agregar nuevos.

---

*Este documento debe ser revisado y las decisiones pendientes deben ser resueltas antes de comenzar la implementación.*
