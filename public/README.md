# OPAI — Estructura de /public

## Brand de la plataforma OPAI
```
/brand/opai/
  /logotipo/     → Logotipos horizontales y apilados (PNG)
  /isotipo/      → Isotipos solos (PNG, dark/light/white)
  /favicon/      → Favicons en todos los tamaños (16, 32, 48, 64, 180px)
  /pwa/          → Íconos PWA (192x192, 512x512, maskable, apple-touch)
  /social/       → OG Image para redes sociales
  /svg/          → SVGs maestros (logo-horizontal, logo-stacked, isotipo, favicon)
```

## Assets por tenant (multi-tenant)
```
/tenants/
  /gard/         → Tenant Gard Security
    /logo/       → Logos de Gard (subidos por el tenant)
    /clientes/   → Logos de clientes de Gard
    /images/     → Imágenes propias del tenant
  /_template/    → Template vacío para nuevos tenants
    /logo/
    /clientes/
    /images/
```

### Convención de nombres para uploads de tenants
Los logos subidos por tenants se guardan en:
`/uploads/company-logos/{tenant-slug}/logo-{timestamp}-{hash}.{ext}`

## Media compartida
```
/media/
  /guardias/     → Fotos de guardias en servicio
  /industrias/   → Imágenes por industria (minería, retail, etc.)
  /heroes/       → Imágenes hero de landing/marketing
  /servicios/    → Imágenes de servicios (electrónica, monitoreo)
```

## Archivos estáticos de la app
```
/fonts/          → Fuentes tipográficas
/icons/          → Iconos UI de la app
/iconos_azul/    → Iconos en color azul para portales
/sounds/         → Sonidos de notificación
/uploads/        → Archivos subidos por usuarios (NUNCA eliminar)
  /company-logos/
  /guardias/
```

## PWA Manifests (no mover, la app los requiere en raíz)
- manifest.json
- manifest-acceso.json
- manifest-cliente.json
- manifest-guardia.json
- manifest-marcacion.json
- manifest-supervisor.json
- portal-rondas-manifest.json

## Service Workers (no mover, la app los requiere en raíz)
- sw.js
- sw-acceso.js
- sw-cliente.js
- rondas-sw.js

---
Última reorganización: Abril 2025
