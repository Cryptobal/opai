# Análisis de Issues de Sentry — Plan de Solución

**Fecha:** 18 marzo 2026  
**Total issues sin resolver:** 67  
**Objetivo:** Resolver todos sin romper código.

---

## Resumen ejecutivo

Los issues se agrupan en **6 categorías**. Las soluciones propuestas son conservadoras y priorizan no introducir regresiones.

---

## 1. CRÍTICOS — Producción y recientes

### OPAI-2B — "La instalación debe estar activa para crear puestos"
- **Ubicación:** `CrmInstallationDetailClient.tsx:1129`, API `/api/ops/puestos`
- **Causa:** Regla de negocio: no se pueden crear puestos en instalaciones inactivas. El API devuelve error 400 y el frontend lo lanza sin manejar.
- **Solución:** En `CrmInstallationDetailClient` (función que llama a crear puesto), envolver la llamada en try/catch y mostrar `toast.error(payload.error)` en vez de re-lanzar. Opcional: deshabilitar el botón "Crear puesto" si `installation.status !== 'active'` y mostrar tooltip explicativo.
- **Riesgo:** Bajo. Solo mejora UX.

### OPAI-2E — useChatSidePanelContext fuera del provider
- **Ubicación:** `CrmAccountDetailClient.tsx:208`, `ChatFloatingProvider.tsx:78`
- **Causa:** Durante SSR o en ciertos flujos, `CrmAccountDetailClient` se renderiza antes de que `ChatSidePanelProvider` esté disponible.
- **Solución:** Añadir fallback en `useChatSidePanelContext` (igual que en `useTheme` y `useCommandPalette`): si `ctx === null`, devolver un objeto no-op en vez de lanzar. Ejemplo:
  ```ts
  if (!ctx) {
    return {
      isPanelOpen: false,
      openPanel: () => {},
      closePanel: () => {},
      togglePanel: () => {},
      channels: [],
      loading: false,
      totalUnread: 0,
      selectedChannelId: null,
      selectChannel: () => {},
      currentUserId: '',
      autoContext: null,
      refreshChannels: async () => {},
      archiveChannel: async () => {},
      unarchiveChannel: async () => {},
      deleteChannel: async () => {},
      archivedChannels: [],
      fetchArchivedChannels: async () => {},
      markChannelAsRead: async () => {},
      markAllChannelsAsRead: async () => {},
      markAllChannelsAsReadLoading: false,
      updateChannelNotifPref: async () => {},
    };
  }
  ```
- **Riesgo:** Bajo. El chat no funcionará hasta que el provider esté montado, pero el resto de la página sí.

### OPAI-2F — Async Client Component
- **Ubicación:** `/finanzas/rendiciones/nueva`, stacktrace apunta a Router/useActionQueue
- **Causa:** Posible bug de Next.js/React 19 o conflicto entre Server Component async y Client Component durante streaming.
- **Solución:** 
  1. Revisar si `RendericionForm` o algún hijo importa un componente que sea async.
  2. Si el error persiste, envolver el contenido de la página en `<Suspense fallback={...}>` para aislar el streaming.
  3. Verificar que no haya `use()` con Promises en componentes cliente.
- **Riesgo:** Medio. Requiere reproducir el error para afinar.

### OPAI-2C / OPAI-1N — PrismaClientKnownRequestError (finanzas/rendiciones/nueva)
- **Causa real (Sentry):** "Timed out fetching a new connection from the connection pool" — no es un error de query, es **pool de conexiones agotado**.
- **Ubicación:** `finanzas/rendiciones/nueva/page.tsx:28`
- **Solución:** En `.env.local` (y Vercel), asegurar que `DATABASE_URL` incluya `connection_limit=5&pool_timeout=20` (o valores mayores para dev). Para desarrollo local con Docker, probar `connection_limit=10&pool_timeout=30`.
- **Riesgo:** Nulo. Es configuración.

---

## 2. REACT / UI — Hooks y componentes

### OPAI-26 — Cannot read 'findMany' of undefined
- **Ubicación:** `hub-queries.ts:243`, `getClosingHubData` → `prisma.portalAccessLog.findMany`
- **Causa:** En algunos builds o contextos, `prisma.portalAccessLog` puede ser undefined (ej. schema no generado, bundling).
- **Solución:** Usar optional chaining: `prisma.portalAccessLog?.findMany(...)` y, si no existe, devolver `[]`. O verificar que `prisma` esté correctamente importado y que el schema Prisma incluya `PortalAccessLog`.
- **Riesgo:** Bajo. El modelo existe en el schema.

### OPAI-1W — Rendered fewer hooks than expected (cotizaciones)
- **Ubicación:** `/crm/cotizaciones/:id` → `CpqQuoteDetail`
- **Causa:** Early return o condición que cambia el número de hooks entre renders.
- **Solución:** Revisar `CpqQuoteDetail` para asegurar que todos los hooks se llamen incondicionalmente (sin early returns antes de hooks). Mover cualquier `return` antes de los hooks a después de todos los `useState`/`useEffect`/`useCallback`.
- **Riesgo:** Medio. Requiere revisión cuidadosa del componente.

### OPAI-1X — Rendered more hooks than during the previous render (installations)
- **Ubicación:** `/crm/installations/:id` → `CrmInstallationDetailClient`
- **Causa:** Similar: hooks condicionales o en loops.
- **Solución:** Misma estrategia: garantizar que el orden y número de hooks sea constante en cada render.
- **Riesgo:** Medio.

### OPAI-1E — IdCardIcon is not defined (portal/cliente)
- **Ubicación:** `/portal/cliente`
- **Causa:** Algún componente usaba `IdCardIcon` sin importarlo. `IdCardIcon` existe en `@/components/auth/icons`.
- **Solución:** Buscar referencias a `IdCardIcon` en el árbol de `/portal/cliente` y añadir `import { IdCardIcon } from "@/components/auth/icons"` donde falte. `PortalClienteClient` usa `MailIcon`, no `IdCardIcon`; puede ser un componente hijo o una ruta antigua.
- **Riesgo:** Bajo.

---

## 3. QUERIES LENTAS — Performance

### OPAI-27 — Slow DB Query (SELECT 1)
- **Causa:** Prisma ejecuta `SELECT 1` como health check. 7+ segundos indica pool agotado o conexión lenta.
- **Solución:** Misma que OPAI-2C: ajustar `connection_limit` y `pool_timeout` en `DATABASE_URL`.

### OPAI-24 — Slow DB Query en `/api/notes/unread-counts`
- **Ubicación:** `api/notes/unread-counts/route.ts`
- **Solución:** Revisar el `groupBy` con múltiples OR. Añadir índices si hace falta: `(tenantId, contextType, contextId)`, `(tenantId, deletedAt, parentNoteId)`. Considerar cache (Redis o in-memory) para conteos frecuentes.
- **Riesgo:** Bajo. Índices y cache no cambian lógica.

### OPAI-2A — Slow DB Query en `/api/chat/channels`
- **Solución:** Revisar el `where` de la query y añadir índices en `ChatChannel` (tenantId, isActive, channelType, etc.).
- **Riesgo:** Bajo.

### OPAI-1G — N+1 Query en `/api/chat/read-all`
- **Ubicación:** `api/chat/read-all/route.ts`
- **Causa:** Se hace `findMany` de canales, luego `findMany` de archivos por cada canal.
- **Solución:** Usar una sola query con `include` o un `findMany` con `where: { channelId: { in: channelIds } }` para obtener todos los archivos de una vez.
- **Riesgo:** Bajo.

---

## 4. params.otherChunks is not iterable (14 issues)

- **Ubicación:** `/portales` (y posiblemente rutas hijas)
- **Causa:** Probable bug interno de Next.js 15 con `params` como Promise o con parallel routes. El código no usa `otherChunks` directamente.
- **Solución:** 
  1. Actualizar Next.js a la última versión estable.
  2. Asegurar que todas las páginas con `params` usen `await params` (Next.js 15+).
  3. Revisar si hay parallel routes (`@folder`) que puedan causar el error.
  4. Si persiste, abrir issue en el repo de Next.js con un repro mínimo.
- **Riesgo:** Medio. Puede requerir cambios en rutas.

---

## 5. ENOENT y errores de build (OPAI-9, Q, M, K, 8, J, H)

- **Causa:** Archivos de `.next` no encontrados durante desarrollo (build incompleto, cache corrupto, HMR).
- **Solución:** 
  1. Marcar como **ignored** en Sentry (solo dev, no producción).
  2. O filtrar en Sentry por `environment:production` para no recibir estos eventos.
  3. Para dev: `rm -rf .next && npm run dev:watch`.
- **Riesgo:** Nulo. No son bugs de aplicación.

---

## 6. PrismaClientKnownRequestError / PrismaClientInitializationError (múltiples)

- **Causas típicas:** Connection pool timeout, schema desincronizado, IDs inválidos.
- **Solución:** 
  1. Pool: ya cubierto en OPAI-2C.
  2. Inicialización: verificar que `prisma generate` se ejecute en build y que `DATABASE_URL` esté definida.
  3. Para errores con mensaje vacío, revisar el evento en Sentry para ver el mensaje real (a veces se omite en prod).
- **Riesgo:** Variable según causa.

---

## 7. Otros

### OPAI-3 — _leaflet_pos undefined (portal/rondas)
- **Causa:** Leaflet intenta acceder a `_leaflet_pos` en un elemento no inicializado.
- **Solución:** Comprobar que el mapa Leaflet se monte solo cuando el DOM esté listo y que no se desmonte prematuramente. Usar `useEffect` para inicializar el mapa y limpiar en el cleanup.
- **Riesgo:** Medio.

### OPAI-1 — Hydration Error (instalaciones)
- **Causa:** Diferencia entre HTML de servidor y cliente (fechas, números, condicionales con `typeof window`).
- **Solución:** Usar `suppressHydrationWarning` en elementos problemáticos o renderizar contenido dinámico solo en cliente con `useEffect` + `useState`.
- **Riesgo:** Medio.

### OPAI-2B (ya cubierto arriba)

---

## Orden recomendado de implementación

1. **Configuración (sin tocar código):** OPAI-2C, 1N, 27 — `DATABASE_URL` con pool.
2. **Fallbacks seguros:** OPAI-2E — `useChatSidePanelContext`.
3. **UX:** OPAI-2B — manejo de error en creación de puestos.
4. **Defensivo:** OPAI-26 — optional chaining en `portalAccessLog`.
5. **Performance:** OPAI-1G — eliminar N+1 en read-all.
6. **Hooks:** OPAI-1W, 1X — revisar componentes.
7. **IdCardIcon:** OPAI-1E — import faltante.
8. **Resto:** Según prioridad y tiempo.

---

## Issues que se pueden ignorar en Sentry

- OPAI-9, Q, M, K, 8, J, H (ENOENT, webpack) — solo desarrollo.
- OPAI-1J (aborted) — conexiones canceladas por el usuario, ruido.

---

## Verificación post-implementación

1. Ejecutar `npm run dev:watch` y navegar por las rutas afectadas.
2. Ejecutar `npx vitest run`.
3. Revisar Sentry tras 24–48 h para confirmar que los issues dejan de aparecer.
