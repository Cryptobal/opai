# Liquid Glass v1 — Pendientes

Estado de la implementación del material Liquid Glass v1 (rama `claude/liquid-glass-v1-impl-rwdiqx`).
Este archivo registra lo que quedó fuera de alcance o requiere una segunda pasada,
con archivo:línea y motivo, según lo pedido en el prompt.

## Resumen de lo implementado (commits)

1. **Bloque 1** — Material glass en `globals.css`: tokens `--glass-*` (dark + light),
   clases `.opai-glass{,-strong,-soft,-pill}`, deprecación de `opai-m3e-*` → glass,
   retint teal de FAB/nav-active, **quitado el gate `html[data-platform="ios"]`**
   (superficies overlay ahora glass en todas las plataformas dentro de `< lg`),
   fallbacks `@supports not (backdrop-filter)` + `prefers-reduced-transparency`.
   Doc en `AGENTS.md`.
2. **Bloque 2** — `GlassAmbient` (aurora) montado en layout `(app)` + 8 portales;
   `Surface` cascada glass por elevación (`.opai-glass-*-m`, sólo `< lg`); primitivos
   UI (sheet/dialog/popover/dropdown/select/context-menu/toaster) heredan glass vía
   el de-gate del Bloque 1 (ya aplicaban las clases sin condición).
3. **Bloque 3** — Header ERP glass (una sola apariencia), isla flotante `BottomNav`
   con pill activo + glow teal, hide-on-scroll (`useScrollDirection`), orbe OPAI
   (emite `opai-ai-open`; el widget lo escucha; FAB oculto en mobile).
4. **Bloque 4** — Hub: `HubKpiLinkCard` (glow radial semántico), `HubQuickActions`
   (pill glass + bolt teal glow), `HubAlertsBanner` (tint glass por severidad).
5. **Bloque 5** — `AiHelpChatWidgetV2`: panel mobile → sheet glass 88dvh con grabber,
   header/hero spark teal, chips/burbujas/input/send retint teal, desktop normalizado
   a tokens DS (sin `bg-[#1a1a2e]`).
6. **Bloque 6** — `PlatformAwareBottomNav` unificado a una isla glass (cubre los 3
   wrappers de portal: acceso/rondas/guardia). Guardia: marcación → botón "lens"
   estrella (anillo pulsante + glow teal). Variantes danger/warning conservan color.

## Pendientes / deferidos (con motivo)

### Bloque 3 — Header flotante isla (ERP)
- `src/components/opai/AppShell.tsx:106` — el header mobile quedó **glass full-width
  fijo** (`opai-liquid-glass-bar-top`) en vez de isla flotante `left-3 right-3`.
  **Motivo:** convertirlo en isla flotante obliga a recalcular el offset global de
  contenido (`pt-[calc(3rem+safe)]`) y todos los sub-navs sticky `top-12` del ERP →
  riesgo de romper layout en todo el ERP (condición de parada: refactor > alcance).
  El header ya es glass e idéntico en iOS/Android; falta sólo despegarlo de los bordes.

### Bloque 4 — HubGreeting
- `src/app/(app)/hub/_components/HubGreeting.tsx` — usa `PageHero` (primitivo DS
  compartido). La tipografía display 30px/800 + fecha 17px pedida no se aplicó para
  no tocar `PageHero` global (afecta a toda la app). Requiere prop de override en
  `PageHero` o markup propio.

### Bloque 5 — OPAI Intelligence (retint profundo)
- `src/components/opai/AiHelpChatWidgetV2.tsx` — quedan usos de `text-status-info-fg`
  / `bg-status-info` en indicadores menores (loader hero ~1580, typing dots ~1648-1652,
  badges "blue" ~393/424, links ~605, botón ~359/500). Se retintaron header, hero,
  chips, burbujas, input y send. El resto es cosmético de bajo impacto.
- Cards internas de datos del `VisualsRenderer` (gradientes `from-status-info to-status-ok`,
  `border-tint-violet/40`) no migradas a glass-soft + teal (componente aparte, fuera
  del diff de estilos razonable).

### Bloque 6 — Portales (shells por portal)
- Los shells de Cliente/Supervisor/Marcación/Rondas/Acceso/Terreno **heredan** glass vía
  Surface + primitivos + aurora + isla unificada, pero sus **headers y cards propias con
  fondos hardcodeados** (ver Bloque 7) no se migraron uno por uno. Cada portal ameritaría
  su commit dedicado con revisión visual.
- La aurora (`GlassAmbient`) sólo se ve donde el shell del portal es translúcido; en
  portales con fondo opaco propio (p. ej. `bg-[#...]` en el shell) la aurora queda tapada
  hasta migrar ese fondo.

### Bloque 7 — Barrido "todas las páginas" (long tail)
Auditoría: **~1419** ocurrencias de superficies hardcodeadas
(`bg-slate-*|bg-zinc-*|bg-gray-*|bg-[#...]|bg-white/[...]`) fuera de Surface/primitivos,
en ~cientos de archivos. **No migrado** en esta pasada por volumen (excede con creces el
alcance razonable de una sesión; condición de parada). La cascada de Surface/primitivos
ya cubre todo lo que pasa por el DS; lo restante son superficies que **evitan** el DS.

Top ofensores (recomendado atacar por módulo, un commit atómico c/u):
```
31  src/components/ops/rondas/RondasDashboardGlobal.tsx
30  src/components/portal/rondas/CheckpointMarker.tsx
30  src/components/access-control/AccessControlConfigTab.tsx
25  src/components/platform/TenantDetailTabs.tsx
20  src/components/portal/supervisor/SupervisorCrearRendicion.tsx
20  src/components/ops/rondas/MonitoreoGrid.tsx
19  src/components/ops/rondas/GuardPanel.tsx
```
Regla al migrar: contenedor glass, **celdas/filas SIEMPRE `glass-soft` o transparentes**
(prohibido `backdrop-filter` en celdas de grids densas: CashflowGrid, DataTable, pauta,
conciliación). No tocar handlers ni hooks de datos.

### Bloque 8 — Limpieza pendiente
- No se eliminaron aún las clases `opai-m3e-*` (siguen mapeadas a glass; se borran cuando
  no queden consumidores: `PlatformAwareCard`/`PlatformAwareFab` todavía las usan vía
  `isIOS ? opai-liquid-glass : opai-m3e-*`).
- `src/components/portal/GuardPortalClient.tsx` — el import `Navigation` puede quedar sin
  uso tras el cambio de la marcación (verificar en limpieza; `noUnusedLocals` está off).
