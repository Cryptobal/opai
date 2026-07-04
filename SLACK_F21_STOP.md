# SLACK F21 — STOP · Pipeline clase mundial

Fase 21 completa en `claude/pipeline-drill-search-redesign-wbtmad`. Gates
`npx prisma generate && npx tsc --noEmit` verdes en cada bloque; un commit por
bloque.

## B1 — El drill abre en TODAS las etapas (bug con causa real encontrada)

**Evidencia** (runtime logs de Vercel, `/api/integrations/slack/interactivity`,
clics de Carlos el 03–04 jul): `views.push invalid_arguments` en "Cotización
enviada", "Primer seguimiento", "Segundo seguimiento" y "Negociación". Los
títulos eran todos ≤24 chars → NO era el clamp del F14. El único elemento del
payload dependiente de datos era el overflow **"📞 Llamar" con URL `tel:`**:
Slack solo acepta `http(s)` en URLs de botones/opciones de MODALES.
Prospección abría porque sus deals no tenían contacto con teléfono; las otras
etapas (negocios reales) sí → el modal entero moría en silencio. Hipótesis (a)
del prompt confirmada en espíritu (datos por etapa), con mecanismo exacto
identificado.

Fix + blindaje permanente:
- `tel:` eliminado de los modales (WhatsApp https cubre el contacto; LÍMITE
  documentado en el header de `pipeline.ts`).
- Null-safety total + try/catch POR FILA con log de `dealId` (una fila
  corrupta se salta, no mata el modal; el modal avisa cuántas saltó).
- `pipe_open` con patrón loading-first: el drill SIEMPRE abre; si el contenido
  falla, muestra aviso claro (nunca botón mudo).
- `SlackApiError` captura `response_metadata.messages` (json-pointer al bloque
  ofensor) y se loguea — ningún `invalid_arguments` vuelve a ser indescifrable.
- Estado vacío elegante por etapa.

Commit: `fix(slack): el drill del pipeline abre en todas las etapas, blindado
contra datos incompletos`.

## B2 — Buscador universal de negocios

- `/opai negocio <texto>` + alias `/opai buscar negocio <texto>` + botón 🔎 en
  el header del pipeline + acción en hub (grupo Comercial). Gate: misma
  capability del pipeline (ver Negocios CRM).
- Relación negocio↔instalación **auditada** — tres caminos reales, los tres se
  recorren: `deals.installation_name` (Soho), instalaciones de cotizaciones
  CPQ (`q.deal_id` directo o `crm.deal_quotes`), `activated_by_deal_id`.
- Acentos normalizados (`f_unaccent`, patrón del search global), matching
  parcial, máx 10, orden `updated_at DESC`.
- Chips: Abiertos (default) · 🏆 Ganados · ❌ Perdidos · Todos. Cerrados
  encontrables; sala abrible también para cerrados (`openDealRoom` no filtra
  estado — verificado).
- Fila: `*Cuenta* · negocio · $monto · etapa/estado (🏆/❌) · ⏱ Nd` + 🏠 Abrir
  sala / Ir a la sala + 🔗 Abrir en OPAI + 🟢 WhatsApp.

Commit: `feat(slack): buscador universal de negocios por nombre, cuenta o
instalación con sala a un clic`.

## B3 — Rediseño del modal Pipeline

- Header: `💼 *Pipeline comercial* — 16 negocios · *$63.762.420* abiertos` +
  🔎 Buscar negocio + 📊 Abrir en OPAI (`/crm/deals`, ruta auditada).
- Etapa densa: `N negocios · $monto · X% del total` + barra `▓▓▓▓░░░░░░` (10
  celdas proporcionales, en backticks para ancho fijo) + `🔴 N fríos` (>14d,
  MISMO cálculo del semáforo del drill F17).
- Botón por etapa: `3 negocios →` (cero "Ver →" repetidos).
- 8+ etapas → `…y N etapas más` con botón `+N etapas →`.
- Footer: `Total abierto: $X · Actualizado hace un momento`.

Commit: `feat(slack): pipeline con jerarquía visual, barras proporcionales y
señales de frío`.

## B4 — QA (matriz)

Verificado EN la sesión (sin workspace Slack ni DB de producción, screenshots
reales no posibles desde aquí — el render simulado está en el reporte):

| Check | Resultado |
|---|---|
| Causa del bug con evidencia de logs | ✅ `invalid_arguments` por `tel:` (logs Vercel citados arriba) |
| Cero URLs no-https en modales | ✅ grep: solo el comentario LÍMITE menciona `tel:` |
| Títulos ≤24 | ✅ "Buscar negocio" (14), etapas via `modalTitle` clamp F14 |
| action_ids únicos | ✅ 15 ids distintos entre `pipe_*` y `dsearch_*` |
| Botones sin texto genérico | ✅ grep: ningún `pt("Ver")`/`pt("Abrir")` pelado |
| Barras proporcionales | ✅ simulación: celdas ▓ suman 10 con los montos de ejemplo |
| 🔴 coincide con semáforo drill | ✅ mismo código (`daysInStage` + historial + >14) |
| 375px | ✅ líneas ≤40 chars, barra en ancho fijo, plegado a 8 etapas |
| Typecheck + prisma generate | ✅ verdes en los 4 commits |

Pendiente para Carlos en producción (checklist completo en
`docs/integrations/slack.md` § Fase 21): abrir las 5 etapas reales, `/opai
negocio polpaico` (encuentra por instalación), buscar un ganado histórico y
abrirle sala, verificar 375px.

## Done

Carlos abre el pipeline y el ojo entiende en un segundo: dónde está la plata
(las barras), qué se enfría (los 🔴) y cuánto hay (el total en grande). Toca
cualquier etapa y ABRE — con negocios reales, huecos incluidos. Escribe
`/opai negocio polpaico` y encuentra el deal por su instalación aunque esté
ganado hace un mes, y le abre sala para el post-mortem.
