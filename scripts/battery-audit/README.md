# Battery audit — herramientas de diagnóstico

Utilidades **fuera del bundle** para medir drenaje de batería en PWA (iPad/iPhone).
No se importan desde `src/` ni forman parte del CI.

## Archivos

| Archivo | Uso |
|---|---|
| `scan-timers.mjs` | Escaneo estático de `setInterval` / timers en el repo |
| `battery-probe.js` | Pegar en la consola del Web Inspector; mide HTTP y timers en runtime |
| `render-counter.js` | Pegar en consola; cuenta invalidaciones de layout/estilo correlacionadas |

## Escaneo estático

```bash
node scripts/battery-audit/scan-timers.mjs
```

## Probe en dispositivo (preview / prod)

1. Abrir `/hub` en Safari Web Inspector (iPad).
2. Pegar el contenido de `battery-probe.js` y Enter.
3. Esperar ~5 minutos sin interactuar.
4. Ejecutar `__batteryProbe.report()`.
5. Bloquear el iPad 2 minutos, volver, y reportar de nuevo: `requests.whileHidden` debe ser `0`.

Para el contador de renders durante scroll:

1. Pegar `render-counter.js`.
2. Hacer scroll con inercia en una tabla larga.
3. `__renderCounter.report()`.

## Documento

Ver `BATTERY_AUDIT.md` en la raíz del repositorio (hallazgos y Fase A/B).
