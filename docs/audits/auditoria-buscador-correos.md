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
