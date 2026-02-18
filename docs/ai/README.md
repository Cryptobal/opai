# Asistente IA - Base de Conocimiento

> **Actualizado:** 2026-02-18

Este directorio define la estructura operativa para el asistente IA de OPAI Suite:

- `intents/`: playbooks por flujo (preguntas de usuario -> respuesta esperada -> pasos).
- `exceptions/`: manejo de casos borde y respuestas de contingencia.
- `test-sets/`: preguntas canónicas para validar calidad de respuestas.

## Módulos cubiertos

| Módulo | Intents | Estado |
|--------|---------|:------:|
| CRM | Prospectos, cuentas, contactos, deals | ✅ |
| CPQ | Cotizaciones | ✅ |
| Ops | Puestos, pauta, asistencia, PPC, turnos extra | ✅ |
| Marcación | Marcación digital, PIN, QR | ✅ |
| Rondas | Checkpoints, plantillas, programación, monitoreo | ✅ |
| Tickets | Creación, SLA, aprobaciones | ✅ |
| Notificaciones | Preferencias, canales | ✅ |
| Finanzas | Rendiciones, aprobaciones, pagos | ✅ |
| Personas | Guardias, documentos, lista negra | ✅ |
| Payroll | Simulador, parámetros | ✅ |
| Documentos | Templates, firma digital | ✅ |
| Configuración | Usuarios, roles, permisos | ✅ |

## Documentos de soporte

- `docs/02-implementation/ASISTENTE_FAQ_USO_FUNCIONAL.md` — FAQ funcional completo
- `docs/02-implementation/ASISTENTE_MAPA_MODULOS_SUBMODULOS_URLS.md` — Mapa de URLs y módulos

## Objetivo de calidad

1. Responder la mayoría de preguntas funcionales con pasos accionables.
2. Incluir enlaces claros para navegar a cada flujo.
3. Usar datos reales cuando la pregunta requiera verificación (nunca inventar).
4. Mantener formato consistente:
   - Para qué sirve
   - Dónde está
   - Cómo se usa
   - Qué impacta

## Cadencia recomendada

- Semanal: revisar preguntas no resueltas/fallback.
- Convertir cada gap en:
  - nuevo alias/intención,
  - ajuste de tool de datos (si aplica),
  - documento en `intents/`,
  - caso de prueba en `test-sets/`.
