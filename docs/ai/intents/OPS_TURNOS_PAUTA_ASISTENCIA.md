# Intent: Turnos (ambiguo) -> Pauta mensual / Asistencia diaria / TE / Marcacion / Rondas

> **Actualizado:** 2026-02-18

## Intencion del usuario

Preguntas como:
- "Como funciona el sistema de turnos?"
- "Donde veo los turnos?"
- "Quiero revisar turnos de hoy"

## Regla de desambiguacion

- Si dice "turnos de hoy", "presentes/ausentes" -> `Asistencia diaria`.
- Si dice "planificacion", "malla", "rol de turnos", "pautas" -> `Pauta mensual`.
- Si dice "extra", "TE", "horas extra" -> `Turnos Extra`.
- Si dice "marcacion", "entrada", "salida", "PIN" -> `Marcacion digital`.
- Si dice "ronda", "checkpoint", "QR", "recorrido" -> `Rondas`.
- Si dice "ticket", "solicitud", "problema" -> `Tickets`.

## URLs canonicas

- Pauta mensual: `/ops/pauta-mensual`
- Asistencia diaria: `/ops/pauta-diaria`
- Turnos extra: `/ops/turnos-extra`
- Marcaciones: `/ops/marcaciones`
- Rondas: `/ops/rondas`
- Tickets: `/ops/tickets`
- PPC: `/ops/ppc`
- Control nocturno: `/ops/control-nocturno`

## Respuesta esperada (ambiguedad)

Cuando solo diga "turnos", responder opciones:
1. Planificacion del mes (pauta mensual)
2. Ejecucion diaria (asistencia)
3. Turnos extra (TE)
4. Marcacion de entrada/salida
5. Control de rondas
