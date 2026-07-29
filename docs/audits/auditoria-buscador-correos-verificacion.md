# Verificación previa — Buscador de correos (V1–V10)

**Fecha:** 2026-07-29 · **Rama:** `cursor/fix-buscador-correos-3d6d`  
**Caso testigo:** Macronet / ACUDA (18-dic-2025)

## Entorno de verificación

| Recurso | Resultado |
|---|---|
| Neon MCP `gardops-db` (`little-hill-86034491`) | Solo schema `public` — **sin `crm`**. No sirve para V1–V4/V6. |
| `DATABASE_URL` del entorno (`ep-falling-pond…`) | Inalcanzable desde el agente (`P1001`). Datos de producción **no consultables**. |
| Postgres local `pgvector/pgvector:pg16` | OK — usado para V5 y fixtures del golden set. |

## Resultados

### V5 — Tokenización (F2) — CONFIRMADA como propiedad de tsvector

```
to_tsvector('spanish','Luis González <lgonzalez@macronet.cl>')
→ 'gonzalez':2 'lgonzalez@macronet.cl':3 'luis':1   ← sin lexema 'macronet'

@@ websearch_to_tsquery('spanish','macronet') → false
'lgonzalez@macronet.cl' ILIKE '%macronet%' → true
```

### V9 — Fallback semántico — CONFIRMADA (parcial)

- `hybridSearchThreadIds` fusiona léxico + semántico con RRF siempre que haya términos.
- Si léxico = 0 y semántico > 0, se sirven resultados con `matchReason: "semantic"` (badge «Por significado»).
- **No hay umbral mínimo de distancia** en `semanticSearchChunks` / `rankThreadsFromHits`.
- La UI **sí** muestra el badge; **no** hay banner «sin coincidencias exactas» ni botón «solo exactos».

### V10 — Tool del asistente — CONFIRMADA (diseño)

- `search_emails` acepta `query` + filtros parciales (`from`, `subject`, fechas, `hasAttachment`, `unread`, `vertical`, `folder`).
- **Falta** `to` y `domain`.
- **Default `folder = "inbox"`** — un correo SENT (caso Macronet) queda fuera salvo que el modelo pida `folder=all|sent`.
- Concatena a un string y parsea con `parseCorreoSearchQuery` — no hay resolución de entidades ni bucle de relajación.
- No existen tools `resolve_entity` ni `mailbox_coverage`.

### V7/V8 — API — no ejecutables contra prod

Código actual en `correos-search.ts` (post PR-07 / #785):

- Texto libre: `subject` + `from_email`/`to`/`cc` **ILIKE** + `text_body` **ILIKE**.
- Operador `domain:` via `split_part(..., '@', 2)`.
- UI chips incluyen `domain:` (ya alineados en gran parte con el parser).

### V1–V4, V6 — datos — NO VERIFICABLES aquí

Backfill hardcodeado: `newer_than:120d (in:inbox OR in:sent)` en `gmail-backfill.ts`.  
Hoy (2026-07-29) el caso del 18-dic-2025 queda **fuera de la ventana (~223 días)**. F6 queda como **hipótesis fuerte por código**, no por query a prod.

### Contador (F7 / S2) — CONFIRMADA

`CorreosDesktopToolbar` muestra `${shownCount} de ${totalCount}` donde `totalCount` es el count de la **carpeta** (`counts.inbox`, etc.), no el total de la búsqueda. Con búsqueda activa: «1 de 18» = 1 fila de search vs 18 hilos del inbox.

### Deep-link (S5)

- Citas del asistente usan `/crm/correos?thread=<id>`.
- `CorreoDrawer` sí carga server-side por id.
- Si el id es alucinado / inexistente → no-op aparente (F5 grounding), no bug de routing puro.

## Diagnóstico actualizado (vs auditoría del 28-07)

| Falla | Estado en código actual | Acción |
|---|---|---|
| **F1** cuerpo no indexado | **Mitigado**: `text_body ILIKE` (si está poblado). No hay `search_doc` ponderado. | Mantener trgm; asegurar cuerpo; no reescribir a tsvector. |
| **F2** email token único | **Mitigado en motor** (ILIKE/trgm, no tsvector). V5 sigue siendo verdad de Postgres. | Exponer `domain:` en tools; registry único. |
| **F3** semántico disfraza el cero | **Vigente** | Umbral + banner + `exactOnly`. |
| **F4** chips ≠ parser | **Casi cerrado**; chips hardcodeados; faltan `in:`/`vertical:`/`cc:`. | `OPERATOR_REGISTRY`. |
| **F5** asistente | **Vigente** (inbox default, sin to/domain, sin resolve, sin loop, grounding débil) | Tools + prompt + relajación. |
| **F6** ventana sync | **Muy probable** (120d) | `mailbox_coverage` + backfill extendido documentado/script. |
| **F7** contador | **Vigente** | Contador de búsqueda. |

## Conclusión

La evidencia **no contradice** el problema de usuario, pero **sí actualiza la causa raíz**: el motor léxico ya busca cuerpo y substrings de email; el fallo operativo del caso testigo se explica por la **combinación** de (a) carpeta default `inbox` que excluye SENT archivados, (b) ventana de backfill 120d, (c) semántico sin umbral que enmascara el vacío, y (d) asistente sin `to`/`domain`/resolución/relajación/grounding.

Se procede a implementar sobre esa base, **sin reescribir v1 in-place a tsvector**.
