# Portal Cliente: Perfil + Preferencias de Notificaciones — Design

**Goal:** Reemplazar el botón de logout en el header del portal cliente por un dropdown de usuario con acceso a "Notificaciones" y "Salir", siguiendo el mismo patrón del resto de la app OPAI.

**Architecture:** Tres componentes nuevos/modificados en el lado cliente. El dropdown aparece al hacer clic en el nombre del usuario. "Notificaciones" abre un sheet inferior con los mismos toggles que PortalAlertas, llamando al endpoint existente `/api/portal/cliente/alertas/config`.

**Tech Stack:** React, Next.js 15 App Router, Tailwind CSS, Lucide icons, `'use client'` components.

---

## Componentes

### 1. `PortalUserMenu.tsx` (nuevo)
- Chip con iniciales + nombre corto del contacto + chevron
- Al hacer clic → dropdown con:
  - 🔔 Notificaciones → callback `onNotificaciones()`
  - 🚪 Salir → callback `onLogout()`
- Cierra al hacer clic fuera (useEffect + document listener)
- Props: `{ session: ClienteSession, onNotificaciones: () => void, onLogout: () => void }`

### 2. `PortalNotificacionesSheet.tsx` (nuevo)
- Sheet deslizable desde abajo (fixed overlay + panel)
- Mismo UI de toggles push/email que `PortalAlertas`
- Usa el mismo endpoint: `GET/POST /api/portal/cliente/alertas/config`
- Headers: `x-contact-id`, `x-tenant-id`
- Props: `{ session: ClienteSession, open: boolean, onClose: () => void }`

### 3. `PortalClienteClient.tsx` (modificado)
- Importa `PortalUserMenu` y `PortalNotificacionesSheet`
- Agrega estado `notifSheetOpen: boolean`
- Reemplaza el `<button><LogOut /></button>` por `<PortalUserMenu>`

---

## UI detail

**Header (después):**
```
┌─ Portal de Seguridad ───────── [ J. García ▾ ] ─┐
│                                                   │
│                          ┌─────────────────┐      │
│                          │ 🔔 Notificaciones│      │
│                          │ 🚪 Salir        │      │
│                          └─────────────────┘      │
```

**Sheet de Notificaciones:**
```
┌────────────────────────────────────────────────┐
│ overlay oscuro                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ Preferencias de notificaciones      [×]  │  │
│  │                                          │  │
│  │ ● Guardia ausente          [push] [email]│  │
│  │ ● Ronda incompleta         [push] [email]│  │
│  │ ● Checkpoint sin marcar    [push] [email]│  │
│  │ ...                                      │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

---

## Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| `src/components/portal/cliente/PortalUserMenu.tsx` | Crear |
| `src/components/portal/cliente/PortalNotificacionesSheet.tsx` | Crear |
| `src/app/portal/cliente/PortalClienteClient.tsx` | Modificar (header) |

## Archivos NO modificados
- `PortalAlertas.tsx` — sigue igual como sección de nav completa
- `PortalClienteNav.tsx` — sin cambios
- APIs — sin cambios (reutiliza `/api/portal/cliente/alertas/config`)
