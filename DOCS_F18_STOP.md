# Fase 18 — COMPLETADA

Vencimientos sin fatiga: escalera de hitos, digest diario y "En trámite".

Los 6 bloques están implementados y commiteados en
`claude/docs-expiry-milestones-ntoihj`:

1. `feat(docs): motor de vencimientos por hitos` — expiry-engine + campos aditivos + migración `20261009000000_docs_expiry_milestones`.
2. `refactor(docs): crons de vencimiento sobre el motor común` — docs-operacionales-alerts y guardia-doc-notifications.
3. `feat(docs): digest diario de vencimientos y bandeja en Slack` — docs_expiry_digest + /opai documentos.
4. `feat(slack): documentos gestionables desde la tarjeta` — En trámite / Ya no aplica / Ver + chat.update.
5. `feat(docs): escalamiento y política configurable` — doc_escalated + flag crítico-legal + cards de configuración.
6. `docs(docs): fase 18` — matriz QA (22 tests) + docs/documents/vencimientos.md.

Este archivo es el kill-switch de la fase: si existe, no re-ejecutar el prompt 18.
