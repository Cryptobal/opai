# Fase 4.1 — Vincular canal con Slack desde el chat · Checkpoint

Stop file de la fase. Si necesitas detener la implementación, avísalo aquí.

## Decisión de gate de visibilidad (importante)

El ítem "Vincular con Slack" se muestra sólo si el viewer es **`userRole === "owner" || "admin"`**
(el mismo check que ya deriva `canDeleteChannels`) **y** hay workspace Slack ACTIVO **y** el canal no es DM.

Racional: ese es EXACTAMENTE el gate que enforce `requireSlackAdmin` (owner/admin) en el API de
`bridges` — la frontera de seguridad real. La página de config usa `canView(config, integraciones)`
sólo para ver la carcasa, pero **sus mutaciones de puente igual exigen owner/admin**. Gatear por rol
garantiza que la UI nunca muestre un ítem que el API rechazaría con 403, y evita cablear la matriz de
permisos por `AppShell`/`AppLayoutClient`/`ChatPage` (archivos grandes compartidos). El API sigue
siendo el gate real (rule 2: "la UI oculta, el API manda").

## Bloques

- [ ] BLOQUE 1 — `useSlackBridges()` (estado + datos)
- [ ] BLOQUE 2 — `ChatChannelSlackBridge.tsx` (modal)
- [ ] BLOQUE 3 — ítem de menú + indicador `Link2` en ambas listas
- [ ] BLOQUE 4 — QA 375px + docs
