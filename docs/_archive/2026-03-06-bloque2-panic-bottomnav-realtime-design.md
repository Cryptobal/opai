# Bloque 2 — Bottom Nav + Boton de Panico + Alertas Real-time

**Fecha:** 2026-03-06
**Prerequisito:** Bloque 1 (commit 19e515a) aplicado, `prisma db push` ejecutado.
**Branch:** `claude/audit-patrol-portal-Qehxe`

---

## Resumen

Cuatro features para el portal del guardia y el dashboard de monitoreo:

1. **Bottom Navigation Bar** en el portal del guardia (reemplaza FAB de chat)
2. **Boton de Panico** con confirmacion de 3 segundos y GPS
3. **Alertas Real-time** via Pusher al dashboard de monitoreo (reemplaza polling de 30s para panico)
4. **Fix z-index** del modal de incidentes vs mapa Leaflet

---

## Stack

| Componente | Tecnologia | Notas |
|---|---|---|
| Real-time | Pusher (ya configurado) | Canal publico `monitoreo-{tenantId}` |
| Alarma sonora | `new Audio()` con fallback Web Audio API | Cross-browser |
| Bottom Nav | Tailwind + safe-area-inset | 64px altura + env(safe-area-inset-bottom) |
| GPS | navigator.geolocation.getCurrentPosition | Opcional para panico |

---

## Feature 1: Bottom Navigation Bar

### Componente nuevo: `PortalBottomNav.tsx`

Barra fija en la parte inferior del portal del guardia. Reemplaza el FAB flotante de chat.

**Layout:**
```
+--------------------------------------------------+
|  Rondas    Chat    PANICO    Perfil               |
|  (map)    (msg)   (sirena)  (user)                |
+--------------------------------------------------+
```

**Specs:**
- `fixed bottom-0 left-0 right-0 z-40`
- Altura: 64px + `pb-[env(safe-area-inset-bottom)]`
- Background: `bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50`
- 4 items distribuidos con `flex justify-around`
- Item activo: color teal. Inactivos: gray-400
- Panico: fondo rojo oscuro permanente, icono blanco, ligeramente mas prominente

**Tabs:**
1. **Rondas** — icono MapPin. Navega a `"mis-rondas"`
2. **Chat** — icono MessageCircle. Navega a `"chat"`. Badge de no leidos (futuro)
3. **Panico** — icono AlertTriangle/Siren. Siempre rojo. Abre modal de panico
4. **Perfil** — icono User. Navega a `"perfil"` (nueva pantalla basica)

**Integracion con RondasPortalClient:**
- Se renderiza en TODAS las pantallas excepto `"login"`
- Reemplaza el FAB de chat (eliminar el `<button>` flotante actual)
- Recibe `activeScreen` y `onNavigate(screen)` como props
- Screen type se extiende: `"login" | "mis-rondas" | "ronda-activa" | "completada" | "chat" | "perfil"`

**Ajuste de padding:**
- MisRondas: agregar `pb-20` al contenido principal
- RondaActiva: los botones fijos (Incidente + Completar) pasan de `bottom-0` a `bottom-16` (64px)
- ChatRondasSection: input area sube 64px
- RondaCompletada: agregar `pb-20`

### Pantalla nueva: Perfil (minima)

Vista basica con info del guardia:
- Nombre completo
- RUT
- Instalacion asignada
- Estado de turno (si hay ronda activa, mostrarla)
- Boton "Cerrar sesion"

No necesita componente separado grande — puede ser una seccion inline en RondasPortalClient o un componente ligero `PortalPerfil.tsx` (~80 lineas).

---

## Feature 2: Boton de Panico — UI + Flujo

### Componente nuevo: `PanicoModal.tsx`

Modal fullscreen que se activa desde el Bottom Nav.

**Flujo:**
1. Guardia toca "Panico" en Bottom Nav
2. Se abre modal fullscreen con fondo rojo oscuro (`z-[70]`)
3. Progress bar de 3 segundos (previene activacion accidental)
4. Boton "CONFIRMAR PANICO" deshabilitado hasta que pasen los 3s
5. Boton "Cancelar" siempre disponible

**Al confirmar:**
1. Capturar GPS (`getCurrentPosition`, timeout 10s)
2. `POST /api/portal/rondas/panico` con body:
   ```json
   {
     "guardiaId": "...",
     "installationId": "...",
     "tenantId": "...",
     "lat": 123.456,
     "lng": -70.123,
     "ejecucionId": "..." // opcional, solo si hay ronda activa
   }
   ```
3. Vibracion larga: `navigator.vibrate(1000)`
4. Mostrar confirmacion: "Alerta enviada. Central notificada."
5. Cerrar modal tras 2 segundos

**Si GPS falla:** Enviar sin coordenadas. Mostrar "Alerta enviada sin ubicacion GPS."

**Post-envio:** Banner persistente en la parte superior del portal:
- `fixed top-0 left-0 right-0 z-[65]`
- Fondo rojo, texto blanco: "Alerta de panico activa — Central notificada"
- Se mantiene visible hasta que el operador la atienda (verificar via polling cada 30s al endpoint de alertas, o simplemente persistir en estado local hasta cerrar sesion)

### Endpoint nuevo: `POST /api/portal/rondas/panico`

Reemplaza la dependencia de `/api/public/ronda/panico` que requiere `executionId`.

**Body:**
```typescript
{
  guardiaId: string;      // UUID
  installationId: string; // UUID
  tenantId: string;       // UUID
  lat?: number;
  lng?: number;
  ejecucionId?: string;   // UUID, opcional
  note?: string;          // max 500 chars
}
```

**Logica:**
1. Validar que el guardia existe y pertenece al tenant
2. Crear `OpsRondaIncidente` con `tipo: "panico"`
3. Crear `OpsAlertaRonda` con `tipo: "panico"`, `severidad: "critical"`
4. Trigger Pusher: `monitoreo-${tenantId}` evento `alerta-panico`
5. (Opcional) Enviar mensaje al canal de chat de la instalacion

**Auth:** Validar session de guardia via headers (mismo patron que `/api/portal/rondas/marcar`).

---

## Feature 3: Alertas Real-time en Dashboard de Monitoreo

### A. Backend — Trigger Pusher en endpoint de panico

En el nuevo `/api/portal/rondas/panico`, despues de crear alerta e incidente:

```typescript
import { getPusherServer } from "@/lib/chat"; // reutilizar instancia existente

await pusher.trigger(`monitoreo-${tenantId}`, 'alerta-panico', {
  alertaId,
  incidenteId,
  guardiaId,
  guardiaNombre,
  installationId,
  installationNombre,
  lat, lng,
  timestamp: new Date().toISOString(),
});
```

**Canal:** `monitoreo-${tenantId}` (publico, no presence). No necesita auth de Pusher porque:
- Solo el backend triggerea eventos (server-side con secret)
- Los clientes solo se suscriben (no publican)
- El tenantId actua como namespace de seguridad

**Nota:** Exportar `getPusherServer()` desde `src/lib/chat.ts` (o crear `src/lib/pusher-server.ts` si se prefiere separar).

### B. Frontend — Suscripcion en RondasMonitoreoClient

Agregar suscripcion Pusher al dashboard de monitoreo:

```typescript
// En RondasMonitoreoClient.tsx
useEffect(() => {
  const pusher = new PusherClient(NEXT_PUBLIC_PUSHER_KEY, { cluster });
  const channel = pusher.subscribe(`monitoreo-${tenantId}`);

  channel.bind('alerta-panico', (data: PanicAlertData) => {
    playAlarmSound();
    setPanicAlert(data);
    refreshData(); // refetch inmediato
  });

  return () => {
    channel.unbind_all();
    pusher.unsubscribe(`monitoreo-${tenantId}`);
  };
}, [tenantId]);
```

**El polling de 30s se MANTIENE** para datos generales de rondas. Pusher solo complementa para alertas criticas de panico (latencia < 1s).

### C. Alarma sonora

Crear `/public/sounds/alarm.mp3` (generar un beep corto de 2 segundos).

```typescript
function playAlarmSound(): NodeJS.Timeout {
  const audio = new Audio('/sounds/alarm.mp3');
  audio.volume = 0.5;
  audio.play().catch(() => {
    // Fallback: Web Audio API
    playWebAudioAlarm();
  });

  // Repetir cada 10 segundos
  return setInterval(() => {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, 10000);
}
```

El interval se guarda en ref y se limpia al hacer acknowledge.

### D. Banner de alerta en dashboard (NO fullscreen)

**Componente nuevo:** `PanicAlertBanner.tsx`

Banner fijo en la parte superior del dashboard (no fullscreen, para que el operador pueda seguir trabajando):

```
+------------------------------------------------------------------+
|  ALERTA DE PANICO                                                |
|  Guardia: Juan Perez  |  Instalacion: Torre Norte  |  14:32     |
|  [Ver ubicacion]  [MARCAR COMO ATENDIDA]                         |
+------------------------------------------------------------------+
```

**Specs:**
- `fixed top-0 left-0 right-0 z-[9999]`
- Background: `bg-red-900 border-b-4 border-red-500`
- Animacion: `animate-pulse` en el borde
- Altura: auto (contenido)
- Link "Ver ubicacion": abre Google Maps en nueva pestana
- Boton "Marcar como atendida": `PUT /api/ops/rondas/alertas/{id}/acknowledge`

**Al marcar como atendida:**
- Detener alarma sonora (`clearInterval`)
- Banner se minimiza a barra delgada: "Panico atendido — Torre Norte — 14:32"
- Barra delgada desaparece despues de 30 segundos

**Multiples alertas:** Si llegan varias, apilar banners (cada una independiente).

---

## Feature 4: Fix z-index del modal de incidentes

**Problema:** El modal de ReportarIncidente (`z-[60]`) puede quedar detras del toggle del mapa Leaflet que usa `z-1000`.

**Solucion:**
1. Bajar el z-index del boton toggle del mapa en RondaActiva de `z-1000` a `z-10` (solo necesita estar sobre el mapa, no sobre modales)
2. Verificar que `ReportarIncidente` con `z-[60]` queda por encima de todo en la pantalla del portal
3. Si Leaflet internamente usa z-index altos en sus controles, agregar `isolation: isolate` al container del mapa para crear un nuevo stacking context

---

## Stack de z-index actualizado

| z-index | Componente |
|---------|-----------|
| z-[9999] | PanicAlertBanner (dashboard monitoreo) |
| z-[70] | PanicoModal (portal guardia) |
| z-[65] | Banner persistente post-panico (portal guardia) |
| z-[60] | ReportarIncidente modal |
| z-50 | Offline banner, loading spinners, confirmation modals |
| z-40 | PortalBottomNav |
| z-20 | RondaActiva bottom buttons (ahora en bottom-16) |
| z-10 | Sticky headers, map toggle button |

---

## Archivos a crear/modificar

### Crear:
- `src/components/portal/rondas/PortalBottomNav.tsx` (~100 lineas)
- `src/components/portal/rondas/PanicoModal.tsx` (~180 lineas)
- `src/components/portal/rondas/PortalPerfil.tsx` (~80 lineas)
- `src/components/ops/rondas/PanicAlertBanner.tsx` (~120 lineas)
- `src/app/api/portal/rondas/panico/route.ts` (~90 lineas)
- `public/sounds/alarm.mp3` (generado via script o Web Audio)

### Modificar:
- `src/components/portal/rondas/RondasPortalClient.tsx` — agregar Bottom Nav, eliminar FAB, nuevo screen type
- `src/components/portal/rondas/RondaActiva.tsx` — bottom buttons suben a `bottom-16`
- `src/components/portal/rondas/MisRondas.tsx` — padding bottom para nav
- `src/components/portal/rondas/ChatRondasSection.tsx` — padding bottom para nav
- `src/components/portal/rondas/RondaCompletada.tsx` — padding bottom para nav
- `src/components/ops/rondas/RondasMonitoreoClient.tsx` — agregar Pusher subscription + banner
- `src/lib/chat.ts` — exportar `getPusherServer()` (o crear archivo separado)

---

## Lo que NO se toca

- API existente `/api/public/ronda/panico` (se mantiene para compatibilidad con `RondaClient.tsx`)
- Polling de 30s en monitoreo (se mantiene, Pusher lo complementa)
- Modelo de datos Prisma (no se necesitan cambios de schema)
- Chat Pusher (ya funciona, no se modifica)
