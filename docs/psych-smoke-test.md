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
