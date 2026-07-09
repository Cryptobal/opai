# Auditoría de scroll táctil — sub-apps Terreno (Android)

Mapa del scroll táctil en las tres sub-apps del portal Terreno (`marcacion`,
`rondas`, `acceso`). El objetivo es garantizar **un único nivel de scroll por
sub-app** y estabilizar la altura del viewport en Android (barra de direcciones
colapsable), sin romper iOS ni la barra inferior fija.

Patrón canónico (referencia): `MisRondas.tsx` (~L448)
`flex flex-1 min-h-0 flex-col overflow-y-auto` + `main` con
`paddingBottom: calc(5rem + env(safe-area-inset-bottom, 0px))`.

## Rondas (`RondasPortalClient.tsx`, shell raíz `flex flex-col h-dvh overflow-hidden`)

| Pantalla | ¿Tiene scroller? | Dónde | Acción |
|---|---|---|---|
| `mis-rondas` (`MisRondas`) | ✅ Sí | raíz `overflow-y-auto` (L448) | Ninguna (referencia) |
| `ronda-activa` (`RondaActiva`) | N/A | vista de mapa Leaflet full-screen (`flex-1`), sin scroll de página | Fuera de alcance (layout de mapa) |
| `completada` (`RondaCompletada`) | ✅ Sí | raíz `overflow-y-auto pb-24` (L126) | Ninguna |
| `perfil` (`PortalPerfil`) | ❌ **No** | raíz `flex flex-1 min-h-0 flex-col` sin `overflow-y-auto` | **FIX (Bloque 2a)** |
| `chat` (`ChatRondasPortal`) | ✅ Sí (hijo) | `ChatMessageList` scrollea mensajes (`overflow-y-auto`, L218) | Ninguna — no anidar segundo scroller |
| `incidente` (`ReportarIncidente`) | ✅ Sí (hijo) | contenido interno `overflow-y-auto` (L220) | Ninguna — no anidar segundo scroller |

- Shell raíz usa `h-dvh` → **frágil en Android** → migrar a `100svh` estable (Bloque 3).
- Ramas `chat` e `incidente` en el shell usan `overflow-hidden`: **correcto**, el
  hijo ya aporta su propio scroll; mantener para no anidar dos scrollers.

## Acceso (`AccessPortalApp.tsx`, shell `flex min-h-dvh flex-col`)

| Pantalla / tab | ¿Tiene scroller? | Dónde | Acción |
|---|---|---|---|
| `<main>` (contenedor de tabs) | ✅ Sí | `flex-1 overflow-y-auto px-4 pb-28` (L459) | Añadir `WebkitOverflowScrolling`/`overscrollBehaviorY` (Bloque 4) |
| `InicioTab` | ⚠️ scroller anidado | `PullToRefresh` (`ui/PullToRefresh`) usa `relative overflow-auto` dentro del `main` | `overflow-visible` para no competir (Bloque 4) |
| `RegistroTab`, `EnSitioTab`, `MasTab` | ✅ Sí | delegan al `main` | Ninguna |

## Marcación (`MarcacionPortalApp.tsx` / `MarcacionScreen.tsx`, pantallas `min-h-dvh`)

| Pantalla | ¿Tiene scroller? | Dónde | Acción |
|---|---|---|---|
| Todas (`MarcacionScreen`, capturas, PIN) | ✅ Sí (layout) | el `layout.tsx` posee el scroll (`height:100dvh; overflowY:auto`) | Estabilizar `100dvh`→`100svh` + `paddingBottom` safe-area (Bloque 5) |

## Layouts (scroll shell compartido)

Los tres `layout.tsx` (`marcacion`, `rondas`, `acceso`) usan
`height:100dvh; overflowY:auto`.

| Sub-app | ¿Quién posee el scroll? | `overflowY` del layout | Acción |
|---|---|---|---|
| `rondas` | el componente (shell `100svh` + hijos `overflow-y-auto`) | `visible` (evitar doble scroller) | Bloque 5 |
| `acceso` | el componente (`<main>`) | `visible` (evitar doble scroller) | Bloque 5 |
| `marcacion` | el layout | `auto` (mantener) | Bloque 5 (100dvh→100svh) |

Los tres migran `100dvh`→`100svh` (altura estable en Android) y añaden
`paddingBottom: var(--safe-area-bottom)`.
