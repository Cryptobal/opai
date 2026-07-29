# Auditoría — Buscador de correos + asistente IA (`/crm/correos`)

**Fecha original:** 28-07-2026 · **Caso testigo:** hilo Macronet / ACUDA

El brief completo (síntomas S1–S7, fallas F1–F7, criterios de aceptación y plan por capas) vive en el issue/prompt de la sesión. Este archivo apunta a la **verificación ejecutada** y al estado post-fix.

## Verificación (fase 0)

Ver `docs/audits/auditoria-buscador-correos-verificacion.md`.

Resumen: el motor léxico actual ya busca cuerpo (`text_body ILIKE`) y substrings de email (no tsvector). Las causas operativas del caso testigo son (1) default `folder=inbox` que excluye SENT, (2) backfill 120d vs dic-2025, (3) semántico sin umbral, (4) asistente sin `to`/`domain`/resolve/relajación/grounding.

## Implementación en esta rama

| Etapa | Qué |
|---|---|
| E3 | `correos-search-operators.ts` — registry único → chips UI + tests por operador |
| E2/F3 | Umbral semántico `MAX_SEMANTIC_DISTANCE`, `lexicalEmpty`, `exactOnly`, banner UI |
| E5/F5 | Tools `resolve_entity`, `mailbox_coverage`; `search_emails` con `to`/`domain`, default `all` |
| E4 | `resolve-email-entity.ts` + plan de filtros |
| E6/F7 | Contador de búsqueda; free-text → carpeta `all` |
| E7 | Golden set en `correos-search-golden.test.ts` + operators + resolve |
| F6 | Script `scripts/backfill-gmail-extended.ts` + tool `mailbox_coverage` |

**No se reescribió v1 a tsvector** (decisión de arquitectura del repo: pg_trgm + ILIKE). Endpoint sombra `/buscar/v2` no se añadió: el motor híbrido ya es el path único de bandeja y asistente; los cambios son aditivos/compatibles.
