# Auditoría — Buscador de correos + asistente IA (`/crm/correos`)

**Fecha verificación:** 29-07-2026 · **Caso testigo:** hilo Macronet / ACUDA (18-dic-2025)  
**BD:** Neon `OpaiDB` (`lively-wave-03154573`) · tenant `gard` (`clgard00000000000000001`)

---

## Resultados V1–V10 (solo lectura)

| Check | Resultado | Hipótesis |
|---|---|---|
| **V1** Correos 15–20 dic 2025 | 6 msgs: Leaf Space + Kipreos. **Ninguno** a Macronet ni con ACUDA | **F6 confirmada** |
| **V2** Participantes `%macronet%` | 47 msgs (todos ≥ abr-2026 en la práctica útil); 18 hilos (9 inbox) | Dominio sí existe en espejo; el caso dic-2025 no |
| **V3** Cobertura temporal | Nov-25: 3 · Dic-25: **9** · … · Jul-26: 3192. Carlos min=`2025-11-06` | Casilla Carlos sí tiene histórico parcial; el hilo testigo no entró |
| **V4** Cuerpo persistido | 12 082 / 12 519 con `text_body`; 6 569 con len>500 | **F1 del doc original está desactualizada** |
| **V5** Tokenización tsvector | `'lgonzalez@macronet.cl'` no produce lexema `macronet` → `@@` false | Cierto para tsvector; **el código actual usa ILIKE/substring**, no tsvector |
| **V6** Chunks | 18 553 chunks con embedding; 0 msgs con ACUDA → N/A para el hilo | Embeddings hay; el documento no |
| **V7–V10** Código | Ver §Diagnóstico corregido | — |

### Casillas Gard

| Email | msgs | min_sent | backfillDone |
|---|---:|---|---|
| [REDACTED] | 1114 | 2025-11-06 | true |
| jorge.montenegro@gard.cl | 5496 | 2026-03-26 | true |
| lizeth.gonzalez@gard.cl | 3100 | 2026-03-26 | true |
| alberto.stein@gard.cl | 2074 | 2026-03-30 | true |

`ACUDA` / `acuda` en subject/body/html del tenant: **0 filas**.

Índices trgm PENDING (`idx_crm_email_*_trgm`, `mailbox_recent`): **no aplicados** en prod.

---

## Diagnóstico corregido (vs. brief original)

| ID | Brief | Evidencia real |
|---|---|---|
| **F1** | Índice solo asunto+snippet | **Parcialmente obsoleto.** `correos-search.ts` ya busca `text_body` ILIKE + participantes. El fallo del caso no es cobertura de cuerpo genérica. |
| **F2** | tsvector no parte dominios | **Obsoleto para el path actual** (pg_trgm/ILIKE). Sigue siendo cierto si alguien migra a tsvector sin explosion de participantes. |
| **F3** | Fallback semántico disfraza el cero | **Confirmado.** RRF mezcla semántico; UI badge "Por significado" sin banner de "0 exactos". Contador "1 de 18" = folder count, no resultados de búsqueda (**F7**). |
| **F4** | Chips ≠ parser | **Parcial.** UI ya incluye `domain:`; faltan `vertical:` / `in:` / `cc:` y no hay registry único. |
| **F5** | Tool = string NL ciego | **Parcialmente confirmado.** Hay filtros estructurados (`from`, `folder`, …) pero **sin `to`/`domain`**, default `folder=inbox`, sin `resolve_entity`, sin relajar facetas, grounding débil. |
| **F6** | Ventana sync | **Confirmada como causa primaria del golden case.** El hilo 18-dic-2025 Macronet/ACUDA **no está en `crm.email_messages`**. Backfill hardcodeado `newer_than:120d (in:inbox OR in:sent)` y no hay re-backfill histórico. |
| **F7** | Contador inconsistente | **Confirmado.** `CorreosDesktopToolbar` usa `counts[folder]` mientras se renderiza 1 hit de búsqueda. |

---

## Plan de arreglo (ajustado a evidencia)

1. **Backfill histórico re-ejecutable** (query configurable / `after:YYYY/MM/DD`, reset `backfillDone`) — sin esto el golden case es imposible.
2. **Búsqueda híbrida honesta** — separar exactos vs significado; banner; `exactOnly`; `matchedTerms`; umbral semántico.
3. **OPERATOR_REGISTRY** único + chips accionables.
4. **`resolveEntity` + tools** (`domain`/`to`, `mailbox_coverage`, default `in:all`, loop de relajación, grounding).
5. **Deep-link** `?hilo=&mensaje=` + contador = filas renderizadas.
6. **Golden tests** (fixtures + asserts de aceptación).

No reescribir `correos-list.ts` in-place: extender híbrido y añadir endpoint/flag donde haga falta.

---

## Estado post-merge (rama `cursor/fix-buscador-correos-3d6d`)

El fix paralelo ya aterrizó en `main` (`aa7c07098` / merge `4b380272d`): registry (`correos-operator-registry` + constants), `searchMeta`, umbral semántico, `correos-resolve-entity`, tools en `help-chat-email-search-tools.ts`, backfill histórico y acceptance tests.

Al fusionar, **se priorizó la implementación de `main`** (más completa y con verificación contra prod). Esta rama aporta sobre eso:

- Contador del toolbar con wording «N resultados» (`searching` prop)
- Labels de tools en `message-render` + asserts anti-defer de lecturas
- Nota de verificación local del agente: `docs/audits/auditoria-buscador-correos-verificacion.md`

---

## H8 — Backfill excluye archivados históricos (documentado, no ejecutado)

**Hallazgo (código).** `DEFAULT_BACKFILL_QUERY` y `HISTORICAL_BACKFILL_QUERY` en
`src/modules/crm/email/gmail-sync-state.ts` usan `(in:inbox OR in:sent)`.
Un correo recibido y archivado **antes** de conectar la casilla pierde el label
`INBOX` y no entra en `SENT` → **nunca se espeja**. Eso explica huecos como el
hilo Macronet/ACUDA (18-dic-2025) aun con `backfillDone=true`.

**Estado actual del default (sin modificar en este PR):**

```
newer_than:365d (in:inbox OR in:sent)
```

Histórico ampliado:

```
after:2025/01/01 (in:inbox OR in:sent)
```

**Volúmenes ya medidos** (auditoría 29-07-2026, tenant `gard`, casilla Carlos +
resto Gard — ver tabla «Casillas Gard» arriba):

| Casilla (aprox.) | msgs en espejo | min_sent |
|---|---:|---|
| Carlos | 1 114 | 2025-11-06 |
| Jorge | 5 496 | 2026-03-26 |
| Lizeth | 3 100 | 2026-03-26 |
| Alberto | 2 074 | 2026-03-30 |
| **Total tenant** | **≈12 519** | |

El total real en Gmail por casilla **no** está en el espejo: comparar con
`users.messages.list` / cuota Gmail antes de reimportar. Query sugerida contra
prod (solo lectura):

```sql
SELECT email_account_id, count(*) AS msgs
FROM crm.email_messages
GROUP BY 1
ORDER BY 2 DESC;
```

**Opciones de reimportación (decisión de Carlos):**

1. `newer_than:365d` **sin** filtro de carpeta — trae archivados del último año;
   volumen ≈ Gmail «All Mail» − trash/spam del periodo.
2. `in:anywhere` / `after:YYYY/MM/DD` sin `(in:inbox OR in:sent)` — máximo
   recall; costo de storage + reindexación semántica (`text-embedding-3-small`
   ≈ USD 0,02 / 1M tokens; el volumen actual del tenant es marginal).
3. Mantener query actual y aceptar el hueco (archivados pre-conexión no
   buscables).

**Costo de reindexación semántica** tras un re-backfill: correr
`scripts/backfill-email-embeddings.ts` en dry-run (reporta tokens/USD) y luego
`--yes`. Antes, `scripts/repair-email-chunks-flag.ts` para resetear flags
inflados (H4).

**Este PR no cambia `DEFAULT_BACKFILL_QUERY`.**

---

## Post-brief buscador+asistente (H1–H7, H9) — 29-07-2026

Implementado en código (sin aplicar índices ni repair en prod):

| ID | Cambio |
|---|---|
| **H1** | Búsqueda de texto sin `in:` → scope `all`; UI con indicador + CTA |
| **H2** | Paginación híbrida `search:{offset}` + `totalCount` / `totalIsLowerBound` |
| **H3/H7** | Cuerpo `text_body`+`html_body` con `f_unaccent`; SQL PENDING alineado |
| **H4** | `chunksIndexed` solo si hay chunks; cobertura = DISTINCT chunks; repair script |
| **H5** | `excerptById` léxico desde snippet del último mensaje |
| **H6** | Tool `count_emails` + clamp search 25 + prompt anti-extrapolación |
| **H9** | `SET LOCAL hnsw.ef_search` en retrieval vectorial |

**Pendiente operativo (Carlos):**

1. Aplicar `prisma/migrations/PENDING-email-search-indexes.sql` (uno por vez,
   `CONCURRENTLY`, verificar `indisvalid`).
2. Medir agujero H4 en prod:
   ```sql
   SELECT count(*) FROM crm.email_messages m
   WHERE m.chunks_indexed = true
     AND NOT EXISTS (SELECT 1 FROM crm.email_chunks c WHERE c.message_id = m.id);
   ```
3. `npx tsx scripts/repair-email-chunks-flag.ts --dry-run` → `--yes` por casilla.
4. Decidir H8 (arriba) y, si aplica, re-backfill + embeddings.
