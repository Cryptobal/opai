# Baseline táctil — móvil e iPad first

Fuente de verdad de breakpoints, media queries táctiles y safe-areas para
OPAI (ERP, portales y apps Capacitor). Complementa `AGENTS.md` (DS) y
`docs/terreno-scroll-audit.md` (scroll Android).

## Breakpoint único del shell: 1024px (`lg`)

| Constante | Valor | Uso |
|---|---|---|
| `BP.sm` | 640 | Tailwind `sm` |
| `BP.md` | 768 | Planillas densas / legacy |
| `BP.lg` | 1024 | Shell: sidebar vs isla + bottom nav |
| `TOUCH_LAYOUT_MAX` | 1023 | Ancho máximo del layout táctil |
| `TOUCH_LAYOUT_QUERY` | `(max-width: 1023px)` | `matchMedia` canónico |

Archivo: `src/lib/breakpoints.ts`. Hook: `useIsTouchLayout()` en
`src/hooks/useIsTouchLayout.ts`.

El shell decide móvil/desktop en `lg`:

- `MobileIsland` / `BottomNav` → `lg:hidden`
- `AppSidebar` → `hidden lg:block`

**iPad vertical (744–1024) queda del lado táctil a propósito.**

`useIsMobileViewport(BP.md)` se conserva solo para planillas densas
(`PlanillaClient`, `CashflowGrid`) donde el umbral `md` sigue siendo
correcto. Para chrome, sheets, toasts y gestos: **siempre**
`useIsTouchLayout()`.

Prohibido detectar iPad por User-Agent para layout. En Split View /
Stage Manager el layout reacciona al ancho de la ventana.

## Anchos reales de referencia

| Dispositivo | Ancho CSS (vertical) |
|---|---|
| iPhone SE | 320 |
| iPhone 15 | 390 |
| iPhone 15 Pro Max | 430 |
| iPad mini | 744 |
| iPad 10.ª | 810 |
| iPad Air/Pro 11" | 834 |
| iPad Pro 13" | 1024 |
| Desktop | ≥1280 |

Matriz de validación: 320 · 375 · 390 · 430 · 744 · 820 · 834 · 1024 ·
1180 · 1280 · 1366 · 1920 (light + dark, vertical y horizontal en 375 /
430 / 820 / 1024).

## Media query táctil: `any-pointer: coarse`

Desde iPadOS 13.4 con Magic Keyboard/trackpad, Safari reporta
`pointer: fine` + `hover: hover`. La query antigua
`(hover: none) and (pointer: coarse)` **apagaba** targets ≥44px y
scroll táctil.

Usar siempre `(any-pointer: coarse)`: sigue en true si hay *alguna*
pantalla táctil, aunque el puntero primario sea el trackpad.

Desktop táctil (Surface, laptops) entra en modo táctil por diseño;
mouse y teclado no se ven afectados.

## Safe-areas (4 ejes)

Tokens en `:root` (`globals.css`):

```css
--safe-area-top / bottom / left / right
```

Utilidades:

- `.app-safe-x` — padding lateral (solo `< lg`)
- `.app-safe-b` — padding inferior (solo `< lg`)

Patrones:

| Superficie | Patrón |
|---|---|
| `AppShell` contenido | `pl/pr-[max(gutter,env(safe-area-inset-*))]` |
| Portales (`layout.tsx`) | `paddingLeft/Right: var(--safe-area-*)` |
| Bottom sheets | `pb-[max(env(safe-area-inset-bottom),1.5rem)]` |
| `PlatformAwareBottomNav` | `left/right-[max(env(...),0.75rem)]` |

No sumar safe-area-bottom otra vez cuando `useKeyboardOffset > 0`: el
sheet ya se ancla con `bottom: offset`.

## Tipografía táctil (clamp CSS)

En `(any-pointer: coarse) and (max-width: 1023px)`:

- `text-[8px]` / `[9px]` / `[10px]` → 11.5px
- `text-[11px]` → 12px

### Opt-out `data-micro-type`

Grillas densas cuya métrica dimensiona columnas:

| Contenedor | Archivo |
|---|---|
| Pauta mensual (overview + detail) | `OpsPautaMensualClient.tsx` |
| Planilla flujo de caja | `finance/flow-v3/PlanillaGrid.tsx` |
| Grid monitoreo rondas | `ops/rondas/MonitoreoGrid.tsx` |

Documentar cada nuevo uso en esta tabla.

## Alturas: `dvh` no `vh`

Usar `100dvh` / `Ndvh` en vez de `vh`. iOS Safari recorta con la barra
dinámica. El guard `no-vh-height` bloquea `100vh` residual.

## Guards (`scripts/check-design-system.mjs`)

| id | Severidad |
|---|---|
| `no-vh-height` | error (en migrados) |
| `no-hover-none-query` | error (css) |
| `no-hardcoded-mobile-mq` | warn |
| `no-raw-mobile-breakpoint` | warn |
| `no-fixed-width-overflow` | warn |
| `require-safe-area-bottom-sheet` | warn |

## Relacionado

- `docs/mobile/PUBLICACION_STORES.md` — App Store / Play (fuera de alcance)
- `docs/terreno-scroll-audit.md` — scroll Terreno Android
