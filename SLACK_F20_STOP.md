# SLACK F20 — Pulido visual: Home sin redundancia, hub semántico, defaults inteligentes

Principios rectores (decisión de Carlos): el contador ES el botón · el texto del
botón es la acción (nunca "Abrir") · revelación progresiva (3-4 primarias + "⚡
Todas las acciones" como única puerta a la cola larga) · cero duplicados
semánticos · defaults = el caso del 90%. Documentados en
`docs/integrations/slack.md` → "Principios visuales del Home/hub".

## Progreso por bloque

- [x] **B1** — Hub semánticamente correcto. "Solicitud de vacaciones" eliminada
      como acción propia (es un TIPO de ticket; vive en el selector de "Nuevo
      ticket"; `actions/vacaciones.ts` borrado, sin otras referencias). "Turno
      extra" → **"Ingresar turno extra"**: el flujo destino (`createTurnoExtra`:
      guardia + instalación + fecha + tipo) ya era el correcto — se alinearon
      label, copy, orden de campos y se enlazó `/personas/guardias/ingreso-te`
      para personas nuevas (alta no replicable en modal). Visita de supervisor
      intacta (deep-link verificado). Botones del hub = `${emoji} ${título}`,
      action_id único por callbackId, headers + divider, máx. 3/fila.
      COMMIT `fix(slack): hub con semántica correcta y botones autoexplicativos`
      ✅ gate OK (prisma generate + tsc 0 errores)

- [x] **B2** — Home rediseñado. "Tu día" con contadores-botón (🎫 míos abiertos
      → bandeja en Míos · 🔴 SLA vencidos → bandeja vencidos mismo alcance ·
      ✅ por aprobar → bandeja unificada, oculto si 0) + desglose F11 en context;
      divider; "Accesos rápidos" (máx. 4 por rol: ➕ Nuevo ticket/ops, 📊
      Pipeline/crm-deals, 📇 leads sin tomar/crm-leads con contador-botón, 🧾
      Nueva rendición/finance-edit) + ⚡ al final; footer 1 línea. Eliminados el
      panel Comercial duplicado y la lista larga que repetía el hub. Nada dice
      "Abrir"; nada aparece dos veces; máx. 3 botones por actions block.
      COMMIT `feat(slack): App Home con jerarquía limpia — contadores accionables y cero redundancia`
      ✅ gate OK

- [x] **B3** — Defaults + rendiciones gestionables. Mis tickets aterriza en
      "Míos" (vencidos mantiene "Mi equipo" explícito = el contador del Home).
      Mis rendiciones: chips Enviadas (default, SUBMITTED+IN_APPROVAL) ·
      Borradores · Aprobadas (APPROVED+PAID) · Rechazadas; link "Abrir en OPAI"
      → `/finanzas/rendiciones/{id}` por fila ("✏️ Completar en OPAI" en
      borradores); borrador → 🗑 Eliminar (confirm nativo, misma regla que la
      web: DRAFT propio + canDelete, logAudit); enviada → ↩️ Retirar cableado
      con el gate REAL del servicio (la transición SUBMITTED→DRAFT solo existe
      como reversión administrativa `rendicion_configure` en el revert route):
      mismo gate + submitter, confirm, `FinanceRendicionHistory` REVERTED,
      logAudit; sin capability solo queda el link. Eliminar duro de enviada
      EXCLUIDO. Bonus QA: tarjetas de entidad del asistente "Abrir" → "Abrir en
      OPAI" (bot.ts).
      COMMIT `feat(slack): bandejas con defaults del caso real y rendiciones gestionables`
      ✅ gate OK

- [x] **B4** — QA + docs. Grep-QA: cero botones "Abrir" a secas en
      `src/lib/integrations/slack`; action_ids `opai_action_open_<callbackId>`
      únicos; títulos nuevos ≤24 ("Ingresar turno extra" = 20). Mocks visuales a
      375px (Home/hub/Mis rendiciones) verificados en la sesión. Matriz manual
      para Carlos en `docs/integrations/slack.md` (sin workspace Slack ni DB en
      esta sesión, el ingreso E2E de un TE real queda en el checklist).
      COMMIT `docs(slack): fase 20 pulido visual`

## Decisiones de auditoría (para no re-litigar)

- La página web `/personas/guardias/ingreso-te` registra a la PERSONA (datos
  personales + bancarios + Google Maps): eso NO cabe honesto en un modal Slack.
  El ingreso del turno del guardia que cubre (guardia existente + instalación +
  fecha + tipo) ya era exactamente lo que hacía el modal vía `createTurnoExtra`
  — el problema era el nombre. El modal ahora enlaza la web para el alta de
  personas nuevas.
- Retirar una rendición enviada: NO existe transición self-service
  SUBMITTED→DRAFT para el submitter en el servicio; existe la reversión
  administrativa (`rendicion_configure`). Se cableó con ese mismo gate en vez de
  inventar una nueva superficie de permisos.
