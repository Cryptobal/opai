# Intent: Rondas y control de rondas

> **Creado:** 2026-02-18

## Intencion del usuario

Preguntas como:
- "Como armo checkpoints de rondas?"
- "Donde programo una ronda?"
- "Como veo si se cumplio una ronda?"
- "De donde saco los QR de rondas?"

## Respuesta esperada

### Flujo completo de rondas
1. **Crear checkpoints** por instalacion en Ops > Rondas > Checkpoints.
2. **Armar plantilla** con orden de checkpoints en Ops > Rondas > Plantillas.
3. **Programar** frecuencia, dias y horarios en Ops > Rondas > Programacion.
4. **Monitorear** ejecucion en tiempo real en Ops > Rondas > Monitoreo.
5. **Revisar alertas** de incumplimiento en Ops > Rondas > Alertas.
6. **Consultar reportes** de cumplimiento en Ops > Rondas > Reportes.

### QR de rondas
- Desde la tabla de **Checkpoints**, hay una accion para generar/visualizar el QR.
- El guardia escanea el QR para registrar que paso por ese punto.
- URL publica de ejecucion: `/ronda/[code]`

### Generacion automatica
- Las rondas programadas se generan automaticamente cada 10 minutos (cron).
- Si una ronda no se ejecuta en el horario programado, se genera una alerta.

## URLs canonicas

- Dashboard: `/ops/rondas`
- Monitoreo: `/ops/rondas/monitoreo`
- Alertas: `/ops/rondas/alertas`
- Checkpoints: `/ops/rondas/checkpoints`
- Plantillas: `/ops/rondas/templates`
- Programacion: `/ops/rondas/programacion`
- Reportes: `/ops/rondas/reportes`
- Control nocturno: `/ops/control-nocturno`
- Ejecucion publica: `/ronda/[code]`
