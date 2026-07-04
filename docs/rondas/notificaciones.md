# Rondas — Notificaciones, hilos de Slack y digest (Fase 19)

Cada ronda vive como **un hilo** en Slack. Si la instalación tiene un canal
Slack puenteado, ese canal es el destino único de la ronda: la tarjeta de inicio
funda el hilo, el término llega como reply (y actualiza la raíz), y las fallas
gritan con ⚠️/🚨. Si la instalación no tiene canal puenteado, la tarjeta cae al
ruteo normal de "Operaciones - Rondas" (por ejemplo `#op-rondas`). Cada mañana
llega el digest de cumplimiento por instalación.

## Mapa de eventos

| Evento | Cuándo se emite | Emisor | Canal |
|---|---|---|---|
| `ronda_started` | Guardia inicia la ronda (portal `iniciar`, `iniciar-libre`, `public/ronda/iniciar`, o inicio implícito por primera marcación) | `lifecycle-notifications.emitRondaStarted` | Slack instalación si existe; fallback a ruteo global. Raíz del hilo. Silencioso in-app y sin DM personal. |
| `ronda_completed` ✅ | Ronda completada (`portal/completar`, `public/completar`, sync offline) | `emitRondaTerminada` | Slack instalación si existe; fallback a ruteo global. Reply + update de raíz. Sin DM personal. |
| `ronda_completed` ⚠️ | Falla de ronda que corrió: `incompleta` (>20% checkpoints sin marcar) o `cerrada_auto` (crons `cerrar-libres` / `cerrar-en-curso`) | `emitRondaTerminada` | Slack instalación si existe; fallback a ruteo global. Reply ⚠️ + update de raíz; suelta si no hay hilo. Sin DM personal. |
| `ronda_overdue_admin` 🚨 | Ronda nunca iniciada, cerrada `no_realizada` por el cron `cerrar-atrasadas` | `emitRondasNoRealizadas` | Slack instalación si existe; fallback a ruteo global + bell/push admins. Sin DM personal. |
| `ronda_alert_admin` | Alerta crítica (pánico, anomalías) — ahora con `ejecucionId` | `alert-notifications` (sin cambios de gatillo) | Slack: cae al **hilo de su ronda** si existe. |
| `rondas_daily_digest` | Cada mañana a la hora configurada | Cron `rondas-daily-digest` | Slack (blocks ricos) + bell/push admins. |

**Decisión de catálogo**: las fallas de una ronda que sí corrió usan
`ronda_completed` con variante visual (título ⚠️ + campo Motivo) en vez de un
tipo nuevo `ronda_failed`. Una sola preferencia/ruta por "término de ronda" y
el threading queda trivial (todo término es el mismo evento).

Todos los emisores viven en `src/lib/rondas/lifecycle-notifications.ts`, se
cuelgan de los endpoints con `after()` (no bloquean la respuesta) y nunca
lanzan. El `data` de cada evento lleva `rondaId` (clave del threading) y campos
legibles (Ronda / Instalación / Guardia / Programada / Inicio / Checkpoints /
Duración / Motivo) que la tarjeta genérica renderiza tal cual.

## El hilo de la ronda

- Mapa aditivo `RondaSlackThread` (`ronda_slack_threads`): `rondaEjecucionId`
  único → `slackChannelId` + `slackTs` de la raíz.
- **Solo `ronda_started` funda el hilo** (a diferencia de tickets, donde
  cualquier evento ancla). Un término sin inicio va suelto a propósito:
  `rondaStartedEnabled=false` o rondas sincronizadas offline.
- Cualquier evento `ronda_*` con `data.rondaId` cae al hilo si existe — incluye
  `ronda_alert_admin` (pánico y anomalías de esa ejecución).
- El hilo manda sobre el ruteo: si la ruta de canal cambió a mitad de ronda,
  los replies siguen en el canal donde nació el hilo.
- Al llegar `ronda_completed`, además del reply se re-edita la raíz
  (`chat.update`): `🛡️ Ronda Nocturna · El Bosque · Jorge Sáez → ✅ 12/12
  checkpoints en 42 min` (usa `data.resumen`, que el renderer de campos
  excluye de la tarjeta para no duplicar el body).
- Dedupe del outbox: el material incluye el `rondaId` — dos rondas con el mismo
  título en el mismo minuto no colisionan.

## Link al recorrido

No existía deep link por ejecución; la Fase 19 lo agrega:
`/ops/rondas/reportes?ejecucionId=<id>`. La API de reportes acepta el filtro
puntual (ignora el rango de fechas) y la página abre automáticamente el modal
de auditoría (mapa del recorrido + checkpoints + marcaciones) de esa ejecución.
Todas las tarjetas (inicio, término, no realizada) llevan este link.

## Digest diario de cumplimiento

- Cron `/api/cron/rondas-daily-digest` corre **cada hora** (vercel.json) y
  envía cuando la hora de Chile coincide con `digestHour` del tenant
  (default 08:00). Reporta el **día anterior** completo (00:00–23:59 Chile).
- **Fórmula**: cumplimiento = rondas `completada` ÷ rondas **programadas** del
  día (ejecuciones no ad-hoc con `scheduledAt` en el día). `incompleta`,
  `no_realizada`, `cerrada_auto/admin` y las aún pendientes cuentan como NO
  cumplidas. Las rondas libres (ad-hoc) quedan fuera del ratio.
- Formato: `🛡️ Rondas de ayer: 87% cumplimiento (26 de 30 realizadas)` +
  desglose por instalación **de peor a mejor** con semáforo:
  `🔴 Embajada Brasil 5/9 (56%) · 🟠 CIMS 8/10 (80%) · ✅ El Bosque 12/12 (100%)`
  — top 10 líneas + "…y N más", botón `📊 Ver reportes`.
- Dedupe: Setting `rondas_daily_digest_last:{tenantId}` (dayKey Chile) para
  bell/push; dedupe del outbox (`rondas-daily-digest|tenant|día`) para Slack.
  Rerun del cron en la misma hora no duplica.
- Tenant sin rondas programadas ayer → silencio (se marca el día igual).

## Configuración (Setting `rondas_notif_policy:{tenantId}`, JSON)

| Campo | Default | Efecto |
|---|---|---|
| `rondaStartedEnabled` | `true` | En `false` no se publica la tarjeta de inicio: los términos van sueltos (sin hilo). Para tenants con cientos de rondas/día. |
| `rondasRouteToInstallationChannel` | `true` | Si hay canal Slack puenteado para la instalación, las tarjetas `ronda_started`, `ronda_completed`, `ronda_overdue_admin` y `ronda_failed` se publican sólo ahí. Si no hay puente, se usa el ruteo normal. |
| `digestHour` | `8` | Hora local (America/Santiago, 0-23) del digest diario. |
| `digestRedBelow` | `70` | Semáforo: 🔴 bajo este % de cumplimiento. |
| `digestGreenFrom` | `90` | Semáforo: ✅ desde este % (entre ambos, 🟠). Se fuerza `>= digestRedBelow`. |

Helpers: `getRondasNotifPolicy` / `setRondasNotifPolicy` en
`src/lib/rondas/notification-policy.ts`.

## Ruteo

Para eventos de ronda con `installationId`, el destino primario es el canal
Slack puenteado al chat de esa instalación. Si no existe puente, se usa el
ruteo normal: `SlackChannelRoute` (`KEY`, `CATEGORY` = "Operaciones - Rondas",
o `MODULE`) y luego el canal por defecto del workspace. El canal global
`#op-rondas` debe quedar como fallback/resumen, no como copia de cada evento de
una instalación que ya tiene canal propio.

## Matriz QA (Fase 19)

| # | Caso | Esperado |
|---|---|---|
| 1 | Iniciar ronda de prueba (portal guardia) con instalación puenteada | Tarjeta raíz `🛡️ Ronda iniciada` sólo en el canal Slack de la instalación, con Ronda/Instalación/Guardia/Programada/Inicio y botón al recorrido. Fila en `ronda_slack_threads`. No aparece en `#op-rondas` ni por DM personal. |
| 1b | Iniciar ronda sin canal de instalación | Tarjeta raíz en el canal ruteado por "Operaciones - Rondas" (fallback, por ejemplo `#op-rondas`). |
| 2 | Iniciar vía `public/ronda/iniciar` (RUT+PIN) y vía primera marcación sin `/iniciar` | Misma tarjeta raíz; el inicio implícito emite UNA vez (marcas siguientes no re-emiten). |
| 3 | Completar la ronda | Reply `✅ Ronda completada` en el hilo + raíz actualizada `→ ✅ 12/12 en 42 min`; el botón aterriza en `/ops/rondas/reportes?ejecucionId=` y abre el modal con el recorrido correcto. |
| 4 | Completar con >20% checkpoints sin marcar | Reply `⚠️ Ronda incompleta` con % y Motivo; raíz actualizada con ⚠️. |
| 5 | Dejar una ronda vencer sin iniciar (cron `cerrar-atrasadas`) | Tarjeta `🚨 Ronda no realizada` (suelta, nunca hubo hilo) + bell/push admin. |
| 6 | Dejar una en curso hasta cierre automático (`cerrar-en-curso` / `cerrar-libres`) | Reply `⚠️ Ronda cerrada auto` con % logrado + raíz actualizada. |
| 7 | Pánico / anomalía crítica durante la ronda | La tarjeta de alerta cae como reply del hilo de esa ronda. |
| 8 | Digest a la hora configurada | `🛡️ Rondas de ayer: NN%` con desglose peor→mejor; % verificados contra `/ops/rondas/reportes` (mismo día). |
| 9 | Cambiar `digestHour` en Setting | El digest sale a la nueva hora (cron horario lo evalúa cada hora). |
| 10 | `rondaStartedEnabled=false` | Sin tarjeta de inicio; el término llega suelto (sin hilo, sin update de raíz). |
| 11 | Rerun de crons (`cerrar-*`, digest) en el mismo minuto/día | Sin duplicados: dedupe outbox por rondaId/minuto y Setting por día. |
| 12 | Dos rondas terminando el mismo minuto | Ambas tarjetas llegan (dedupe incluye rondaId). |

Pendiente de correr en workspace real (MCP Slack no autorizado en esta sesión);
`npx tsc --noEmit` verde en los 4 bloques.
