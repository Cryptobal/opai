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

- [x] BLOQUE 1 — `useSlackBridges()` (estado + datos)
- [x] BLOQUE 2 — `ChatChannelSlackBridge.tsx` (modal)
- [x] BLOQUE 3 — ítem de menú + indicador `Link2` en ambas listas
- [x] BLOQUE 4 — QA 375px + docs

## QA (Bloque 4)

- **375px**: el modal usa `@/components/ui/dialog`, que en mobile es bottom-sheet a
  ancho completo; `SearchableSelect` y los botones son `w-full`/flex → usables. El
  menú es el mismo `DropdownMenu` (`w-52`/`w-56`) que ya se usa a 375px. *(La
  verificación visual final requiere la app corriendo con un tenant Slack-conectado.)*
- **No-admin**: `useSlackBridges(canDelete)` no hace fetch si no es owner/admin →
  `enabled=false`, sin ítem ni indicador; el menú queda idéntico a hoy.
- **DM**: guard `channelType !== "DIRECT"` → sin ítem.
- Gate `npx prisma generate && npx tsc --noEmit` limpio tras cada bloque.
