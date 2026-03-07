# Bloque 3 — Polish + Historial + Scorecard

**Fecha:** 2026-03-06
**Prerequisito:** Bloque 2 completado (bottom nav, panico, Pusher alerts)
**Branch:** `claude/audit-patrol-portal-Qehxe`

---

## Resumen

4 mejoras para pulir la experiencia del guardia y del operador:

1. **Feedback al marcar checkpoint** — sonido + vibracion mejorada + flash visual
2. **Historial de rondas en ficha de instalacion** — tab nueva en CRM con KPIs y tabla
3. **Scorecard en perfil del guardia** — stats reales del mes + placeholder gamificacion
4. **Polling 10s** — reducir intervalo de monitoreo de 30s a 10s

---

## Mejora 1: Feedback al marcar checkpoint

**Archivo:** `src/components/portal/rondas/CheckpointMarker.tsx`
**Linea de integracion:** 457-461 (despues de API success, antes de onComplete)

### Cambios:

1. **Vibracion mejorada:** Reemplazar `navigator.vibrate?.(200)` por `navigator.vibrate?.([100, 50, 100])` (doble pulso)

2. **Sonido de exito:** Web Audio API, tono A5 (880Hz), 300ms, sine wave:
```typescript
function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}
```

3. **Flash visual:** Estado `showSuccessFlash` que muestra overlay `bg-emerald-500/20` durante 500ms, luego llama `onComplete`. Overlay absoluto dentro del bottom sheet.

### Lo que NO se hace:
- Sin feedback especial para ultimo checkpoint — RondaCompletada ya tiene gauge animado

---

## Mejora 2: Historial rondas en ficha de instalacion

### API: Reutilizar existente
`GET /api/ops/rondas/reportes?installationId=X&from=YYYY-MM-DD&to=YYYY-MM-DD`

Ya retorna: ejecuciones con trust score, porcentaje, guardia, marcaciones, status.

### Componente nuevo: `InstalacionRondasTab.tsx` (~250 lineas)

**KPIs (4 cards):**
- Cumplimiento mes: completadas / total * 100
- Trust Score promedio
- Rondas hoy: completadas / programadas
- Incidentes del mes (count de OpsRondaIncidente para la instalacion)

**Tabla:**
- Columnas: Fecha, Guardia, Trust Score (badge color), Checkpoints X/Y, Status badge
- Paginacion: 20 por pagina
- Expandible: detalle de marcaciones por checkpoint

**Filtros:**
- Rango de fecha (default: ultimo mes)
- Status dropdown (completada, no_realizada, con_retraso, todas)

### Integracion: Tab nueva "Rondas" en CrmInstallationDetailClient.tsx
- Agregar a array de tabs (linea ~1894, despues de "Protocolo")
- Icono: Route o MapPin de lucide-react
- Renderizar `<InstalacionRondasTab>` cuando activeTab === "rondas"
- Props: installationId, tenantId

### API incidentes:
Necesita query adicional para contar incidentes del mes. Puede hacerse inline en el componente con fetch a `/api/ops/rondas/reportes` que ya incluye la data, o agregar count query al endpoint existente.

---

## Mejora 3: Scorecard en perfil del guardia

### API nueva: `GET /api/portal/rondas/mi-desempeno`

**Query params:** `guardiaId`, `mes` (YYYY-MM)

**Response:**
```json
{
  "completadas": 45,
  "aTiempo": 40,
  "conRetraso": 5,
  "noRealizadas": 3,
  "total": 48,
  "trustScorePromedio": 87.5,
  "rachaActual": 7
}
```

**Calculo de racha:** Dias consecutivos hacia atras desde hoy donde TODAS las rondas programadas del dia fueron completadas (status completada o completada_con_retraso).

**Calculo aTiempo vs conRetraso:**
- aTiempo: startedAt <= scheduledAt + toleranciaMinutos
- conRetraso: startedAt > scheduledAt + toleranciaMinutos (o completada pero iniciada tarde)

### Componente: Expandir PortalPerfil.tsx

Agregar seccion de stats entre las info cards (linea ~45) y el boton logout:

- 6 stat items en grid 2x3: Completadas, A tiempo, Con retraso, No realizadas, Trust promedio, Racha
- Cada stat: numero grande + label pequeno
- Trust Score con color: verde >=80, amarillo 60-79, rojo <60

**Placeholder gamificacion:**
- Card con borde dashed, fondo gris oscuro, icono trofeo
- Texto: "Sistema de puntos y rankings — Proximamente"
- Debajo de los stats, antes del boton logout

---

## Mejora 4: Polling 10s en monitoreo

**Archivo:** `src/components/ops/rondas/RondasMonitoreoClient.tsx`
**Linea:** 54

Cambiar `30000` a `10000`.

---

## Archivos a crear/modificar

### Crear:
- `src/components/crm/InstalacionRondasTab.tsx` (~250 lineas)
- `src/app/api/portal/rondas/mi-desempeno/route.ts` (~80 lineas)

### Modificar:
- `src/components/portal/rondas/CheckpointMarker.tsx` — feedback mejorado
- `src/components/crm/CrmInstallationDetailClient.tsx` — agregar tab "Rondas"
- `src/components/portal/rondas/PortalPerfil.tsx` — agregar stats + placeholder
- `src/components/ops/rondas/RondasMonitoreoClient.tsx` — polling 10s
