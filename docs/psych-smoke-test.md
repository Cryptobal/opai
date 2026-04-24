# Módulo Psicolaboral — Smoke Test Manual (Fase 1 MVP)

Checklist para validar el flujo end-to-end antes del primer uso real.
Tiempo estimado: **15-20 min**.

## Pre-requisitos

- Dev server corriendo (`npm run dev:watch`).
- Base Postgres con schema `psych` creado (`prisma db push`).
- Seed aplicado: `npx tsx scripts/psych/seed-v1.ts` → debe imprimir
  `✔ upsert version` y `✔ 45 items insertados`.
- Variable `OPENAI_API_KEY` real en `.env.local` (para probar análisis IA en
  preguntas abiertas). Si no está, los resultados OPEN muestran
  `RED_FLAG_INCOHERENT` u `openAnalysis.error = "OPENAI_API_KEY no configurada"`.
- Variable `PSYCH_TOKEN_SECRET` definida (fallback a `NEXTAUTH_SECRET`).
- Variable `NEXT_PUBLIC_APP_URL` apuntando al host local/stage.

## 1 — Activar módulo para el tenant

1. Login como admin/owner del tenant "gard".
2. Abrir `/opai/modulos` (o la ruta equivalente donde se activan módulos por tenant).
3. Habilitar `psych`. Alternativamente por API:
   `PATCH /api/platform/tenants/{tenantId}/modules` con body `{ module: "psych", enabled: true }` desde un admin de plataforma.
4. Verificar que `/personas/psicolaboral` ya no muestra CTA de activación.

## 2 — Crear evaluación

1. Entrar a `/personas/psicolaboral/nuevo`.
2. Completar `targetName = "Juan Pérez"`, RUT opcional, teléfono opcional.
3. Click **Generar enlace**.
4. Debe aparecer modal `PsychShareLinkModal` con URL `/t/psicotest/<token>`.
5. Copiar la URL.

## 3 — Completar test como guardia (navegador privado)

1. Abrir ventana privada y pegar la URL.
2. **Welcome** → click Empezar.
3. **Consent** → marcar checkbox Ley 21.719 → Aceptar y continuar.
4. **Instructions** → Comenzar test.
5. Responder los 45 ítems:
   - Items 1-20: Likert (1 clic por opción).
   - Items 21-35: SJT (escoger entre A/B/C/D).
   - Items 36-38: Cognitivo.
   - Items 39-43: Lie (Likert con afirmaciones absolutas).
   - Items 44-45: preguntas abiertas (escribir mínimo 100 caracteres).
6. Al último item, botón pasa a **Enviar evaluación** → click.
7. Redirige a `/t/psicotest/thanks`.

## 4 — Validar dashboard

1. Volver al admin en `/personas/psicolaboral`.
2. El assessment debe aparecer en estado `SUBMITTED` y en ≤ 30s pasar a `SCORED`.
3. Click en la fila → detalle:
   - Radar chart con 8 dimensiones.
   - Score global en card derecha.
   - Banda (Apto / Con observación / No recomendado).
   - Alertas si aplica.
   - Análisis cualitativo con summary IA + markers (si OPENAI_API_KEY está).
4. Click **Descargar informe PDF** → debe abrir/descargar correctamente.

## 5 — Reconfiguración y recalcular

1. Ir a `/personas/psicolaboral/configuracion`.
2. Mover algún slider de peso (ej. subir INTEGRITY a 2.0) → Guardar.
3. Volver al detalle del assessment → click **Recalcular**.
4. El score global debería cambiar proporcionalmente al nuevo peso.

## 6 — Aislamiento multi-tenant (crítico)

1. Crear un segundo tenant de prueba (`gard-qa`) o usar otro existente.
2. Login como admin del segundo tenant.
3. `/personas/psicolaboral` debe mostrar **lista vacía** (no debe ver los
   assessments del tenant gard).
4. Intentar acceder directamente a la URL de detalle del tenant anterior
   (`/personas/psicolaboral/<id>`) debe redirigir a `/personas/psicolaboral`.

## 7 — Expiración del link

1. Crear una evaluación.
2. En la DB, forzar `expiresAt = NOW()` y `status` aún en `PENDING`.
3. Abrir el link público → debe redirigir a `/t/psicotest/expired`.

## 8 — Resend token

1. Crear una evaluación nueva.
2. Click "Reenviar" (o hit `POST /api/psych/assessments/[id]/resend`).
3. Abrir el link **anterior** → debe dar `401 Enlace reemplazado por uno más reciente`.
4. Abrir el link **nuevo** → debe cargar el wizard normalmente.

## 9 — Token inválido

1. Modificar un carácter del token en la URL.
2. Abrir → redirige a `/t/psicotest/expired`.

---

## Notas

- Los 45 ítems tienen comentarios `REVIEW_PSICOLOGO` — DEBEN revisarse con el
  psicólogo laboral externo antes del primer uso real con candidatos.
- El PDF incluye disclaimer OS-10 obligatorio.
- La escala LIE con ≥ 60% de respuestas extremas dispara warning "HIGH_LIE" y
  baja automáticamente a FIT_CAUTION aunque el score global sea alto.
- Straight-lining (desvío std < 0.5 en Likert) también degrada la banda.

---

# Smoke Test Fase 1.6 — UX fixes + operativa

## 19. Dark mode

1. Toggle modo oscuro en Opai.
2. Abrir `/personas/psicolaboral` — fondos oscuros, texto legible.
3. Tarjetas de métricas: semitones dark con borders visibles.
4. Tabla → scroll, hover fondos correctos.
5. Repetir con `/personas/psicolaboral/[id]` (radar chart readable).

## 20. Mobile 375px

1. DevTools viewport 375px.
2. Dashboard: métricas en 2x2, tabla como cards stackeadas, botones columna.
3. Detalle: score + alertas + botón PDF ARRIBA del radar.
4. Formulario "Nueva evaluación": selector ocupa todo el ancho.
5. Modal share: QR + botones apilados full-width con min-h 44px.

## 21. Sidebar

1. Abrir sidebar → sección "Personas" expandida.
2. Verificar ítem "Psicolaboral" con ícono Brain.
3. Click → navega a `/personas/psicolaboral`.
4. En tenant sin módulo: ítem no aparece (gate por `isModuleEnabled`).

## 22. Selector de persona

1. `/personas/psicolaboral/nuevo` → buscador.
2. Escribir "Juan" (>=2 chars) → ver postulantes + guardias agrupados.
3. Seleccionar un guardia activo → card con datos pre-llenados + X para cambiar.
4. Alternativa: "¿No está en el sistema?" → form manual.
5. Generar enlace → verificar en DB que `targetName`, `targetPhone`, `personaId`
   coinciden con la persona (no con lo que el usuario tipeó).

## 23. WhatsApp wa.me

1. Crear assessment con teléfono válido.
2. Modal share → botón WhatsApp verde.
3. Click → abre pestaña `https://wa.me/56XXXX?text=...` con mensaje pre-escrito.
4. Verificar audit log: evento `psych.invitation.wa_link_generated`.
5. Si falta teléfono: botón disabled con texto "(sin teléfono)".

## 24. Tab Psicolaboral en ficha guardia

1. `/personas/guardias/[id]` → click tab "Psicolaboral".
2. Si sin assessments: CTA "+ Nueva evaluación".
3. Click → crea + abre modal share.
4. Refrescar → historial muestra el assessment creado.

## 25. Historial + ver respuestas + eliminar

1. En ficha guardia tab Psicolaboral: historial con 3+ assessments.
2. Click "Respuestas" en uno SCORED → modal con 45 ítems + respuesta + score.
3. Login como admin/owner → click "Eliminar" (ícono papelera roja).
4. Dialog pide razón ≥10 chars → confirmar.
5. Assessment desaparece + audit log registra `psych.assessment.deleted`.
6. Login como rol "editor" → no ve el botón eliminar.

## 26. Cron expire

1. Crear assessment, forzar `expiresAt` al pasado vía SQL.
2. Hit manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://opai.cl/api/cron/psych-expire-assessments`.
3. Respuesta `{ success: true, expired: 1 }`.
4. Verificar en DB que status pasó a EXPIRED.

## 27. Notificación al scoring

1. Crear assessment y completar test.
2. Esperar ~5 segundos después de SUBMITTED.
3. Verificar inbox del usuario creador — email con subject
   "Evaluación psicolaboral lista: {nombre}" + link al detalle.

## 28. Re-envío inteligente (banner PENDING >24h)

1. Crear assessment con `createdAt` de hace 25h (forzar SQL).
2. Abrir detalle → banner ámbar visible.
3. Click "Reenviar por WhatsApp" → regenera token, abre wa.me.

---

# Smoke Test Extra — Fase 1.5 (integraciones y portales)

## 10. Panel ATS

1. Ir al pipeline ATS (`/ops/ats/[jobId]`) y abrir detalle de un postulante
   con `persona` asociada.
2. Verificar que el panel psicolaboral aparece con CTA "Invitar" (si no hay
   assessment previo).
3. Click "Invitar" → modal de invitación con QR + selector de canales.
4. Copiar link, completar test en navegador privado.
5. Volver al pipeline → panel muestra `SUBMITTED` y luego `SCORED` con badge.

## 11. Override NOT_RECOMMENDED

1. Completar un test con respuestas que generen `band = NOT_RECOMMENDED`
   (máximo agresión/mínimo integridad).
2. Intentar mover la postulación a `CONTRATADO` con
   `PATCH /api/ops/ats/.../etapa` **sin** `psychOverrideJustification` →
   debe responder 400 con `requiresPsychOverride: true`.
3. Reintentar con `psychOverrideJustification` de menos de 30 chars →
   400 con mismo mensaje.
4. Reintentar con justificación válida (≥30 chars) → 200 OK y se registra
   evento `psych.not_recommended.overridden` en audit log.

## 12. Panel ficha de Guardia (Personal)

1. Ir a la ficha de un guardia (`/personas/guardias/[id]`).
2. Insertar manualmente `<PersonalPsychPanel personaId={...} guardName={...} />`
   si aún no está integrado (TODO pendiente).
3. Validar:
   - Historial con assessments previos y score/banda.
   - Alerta "Reevaluación vencida" si `submittedAt + 6 meses < now`.
   - Alerta "No recomendado" si último assessment tiene esa banda.
   - Botón "Solicitar reevaluación" crea nueva invitación.

## 13. Portal Cliente — SEAL

1. Login como cliente en `/portal/cliente`.
2. Ir a `/portal/cliente/seguridad-personal`.
3. Sin `ClientContractPsychConfig` para ninguno de los `installationIds`
   del cliente → lista muestra contratos con config default (SEAL).
4. Verificar que solo se ve **nombre sanitizado + pill vigente/por reevaluar**.
   NUNCA: score, banda, alertas, debilidades.

## 14. Portal Cliente — SUMMARY

1. Insertar `ClientContractPsychConfig` vía SQL:
   ```sql
   INSERT INTO psych.client_contract_config
     (id, tenant_id, contract_id, report_level, created_at, updated_at)
   VALUES (
     gen_random_uuid()::text,
     '<tenantId gard>',
     '<un installationId real>',
     'SUMMARY', now(), now()
   );
   ```
2. Refrescar portal cliente.
3. Verificar que ahora se ve `ClientPsychSummaryPanel` con barras de
   distribución `{fit, caution, notRecommended, none}` sin nombres.

## 15. Portal Cliente — FULL degradado sin DPA

1. Cambiar `report_level = 'FULL'` en la fila anterior pero dejar
   `dpa_signed_at = NULL`.
2. Refrescar portal cliente.
3. Debe degradar silenciosamente a SEAL + mostrar banner
   "Nivel solicitado (Completo) no disponible: falta firma de DPA".
4. Revisar logs (server) por el warning correspondiente.

## 16. Portal Colaborador — Mi evaluación

1. Login como guardia en portal colaborador (con `guardiaId` en sesión).
2. Tab "Mi evaluación":
   - Si no tiene assessments → estado vacío + CTA ARCO.
   - Si tiene → fechas + top fortalezas como pills verdes.
   - **Nunca**: score numérico, banda, dimensiones débiles.
3. Click "Solicitar informe ARCO" → redirige a `PSYCH_ARCO_URL` (fallback
   `/portal/guardia/mis-datos`).

## 17. Plantillas de invitación

1. Ir a `/personas/psicolaboral/configuracion`.
2. Bajar a sección "Plantillas de invitación".
3. Editar WhatsApp template, verificar preview live con tokens resueltos.
4. Guardar.
5. Crear nueva evaluación → modal de share debe usar la plantilla nueva
   (click Enviar con canal WhatsApp → preview en resultado coincide).

## 18. Aislamiento multi-tenant 1.5

1. Crear evaluación en tenant Gard.
2. Login al portal cliente de otro tenant.
3. `/api/client-portal/psych/overview` retorna solo contratos del tenant
   del cliente autenticado, nunca los de Gard.
4. Colaborador del tenant A no puede hit `/api/collaborator-portal/psych/my-profile`
   con guardiaId del tenant B → 401.
