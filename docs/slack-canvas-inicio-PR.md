# PR — Canvas "Ficha de Inicio" en Slack al adjudicar un negocio

Branch: `feat/slack-canvas-inicio` · base: `main`

## Qué hace

Cuando un negocio pasa a **adjudicado** (`deal_won`), OPAI crea/actualiza un
**canvas del canal** en su Deal Room con: condiciones del servicio (auto desde la
cotización aceptada + deal), checklist de inicio (playbook + fechas por
`dueDateOffsetDays` vs `serviceStartDate`), documentos del negocio (como links de
descarga, no binarios) y enlaces. El equipo marca los checkboxes directamente en
Slack. OPAI no sincroniza de vuelta el estado de los checkboxes (limitación de
Slack, aceptada).

**Todo detrás del flag `startCanvasOnWon` (default `false`).** Sin reconectar los
scopes de canvas, no ocurre nada nuevo en producción.

## Commits (atómicos, gate TS entre cada uno)

1. `feat(slack): API de canvas (create/replace) en el wrapper` — `canvas.ts`
2. `feat(slack): persistencia de canvasId de inicio por deal (aditivo)` — columna
   `start_canvas_id` + `canvas-store.ts`
3. `feat(slack): loader + renderer del canvas de inicio` — `start-canvas-data.ts`,
   `start-canvas-render.ts` + tests
4. `feat(slack): orquestación del canvas de inicio + botón en tarjeta de cierre` —
   `start-canvas.ts`, flag en `config.ts`, enganche en `dispatch.ts`, botón en
   `lifecycle.ts`

## Verificación

- `npx prisma generate && npx tsc --noEmit` → limpio.
- `npx vitest run …/start-canvas-render.test.ts` → 6/6 (secciones, countdown
  pasado/hoy/futuro, extras, 0 archivos/sin cotización, escape de pipes/saltos).

## Decisiones de implementación

- **Extras**: se toman de `ClientOnboarding.notes` (no se construyó un modal de
  cierre nuevo). Los pasos EXTRA del checklist salen de `ClientOnboardingStep`
  con `isCustom = true` cuando existe la operación.
- **serviceStartDate**: manda el del onboarding; si no, `CrmDeal.serviceStartDate`
  (que `deal_won` ya exige).
- **Fechas**: toda la aritmética de countdown y `dd-MM`/fecha larga usa getters
  **UTC** para no driftar con los campos `@db.Date` (localhost Mac UTC-4 vs Vercel
  UTC).
- **Menciones de equipo**: texto plano `@equipo` (no hay mapeo equipo→grupo Slack;
  no se inventan IDs).
- **Botón "Abrir Ficha de Inicio"**: abre el canal vía `app_redirect` (el canvas
  vive como pestaña); solo aparece si el canvas ya existe. Es un botón URL, que el
  handler `dealroom_` ignora sin error.
- **Orden en dispatch**: `ensureStartCanvas` corre **antes** de `postDealClosedCard`
  para que la tarjeta de cierre pueda ofrecer el botón en el primer render.

## Bloque 5 — DIFERIDO a PR aparte

El botón "📎 Enviar a Slack" por archivo tocaría `FileAttachments.tsx`, un
componente **compartido** por leads/deals/accounts/contacts/installations. Para no
arriesgar una regresión transversal sin poder verificar la UI end-to-end, se
difiere. El canvas ya lista los archivos como links de descarga (presignados 7
días), así que el valor principal está cubierto sin este bloque.

---

## ⛔ BLOQUE 6 — HARD STOP · acciones irreversibles (requieren aprobación humana)

**Nada de esto se ejecutó automáticamente.** Ejecutar en orden:

- [ ] **1. Scopes OAuth.** Agregar a `SLACK_BOT_SCOPES` (`src/lib/integrations/slack/config.ts`)
      y al **manifest de la Slack App**: `canvases:write`, `canvases:read`,
      `files:read`, `files:write`. ⚠️ Cada workspace debe **reconectar** (Slack no
      otorga scopes retroactivos) — coordinar reconexión del workspace de Gard.
      _Nota: `canvases:write` es el mínimo para crear/editar; los `files:*`/`canvases:read`
      quedan declarados para el Bloque 5 y lecturas futuras._

- [ ] **2. Migración aditiva.** Aplicar contra la BD **solo tras revisión**:
      ```sql
      ALTER TABLE "public"."crm_deal_slack_rooms"
        ADD COLUMN IF NOT EXISTS "start_canvas_id" TEXT;
      ```
      (archivo: `prisma/migrations/20261013000000_deal_room_start_canvas_id/migration.sql`).
      Verificado: el modelo `CrmDealSlackRoom` mapea a `public.crm_deal_slack_rooms`.

- [ ] **3. Activar el flag** `startCanvasOnWon = true` para el tenant Gard
      (`Setting` category `slack_deal_rooms`, key `slack_deal_rooms.start_canvas_on_won`).
      Solo después de 1 y 2.

- [ ] **4. Prueba en vivo** en un canal de Gard: adjudicar un deal de prueba y
      verificar el canvas (pestaña del canal) + el botón "Abrir Ficha de Inicio".

- [ ] **5. Merge a `main`** de `feat/slack-canvas-inicio`.
