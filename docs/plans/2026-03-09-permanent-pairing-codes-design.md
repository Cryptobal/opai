# Códigos de Pareo Permanentes por Instalación

**Fecha**: 2026-03-09
**Estado**: Aprobado

## Resumen

Reemplazar los códigos de pareo temporales (10min/24h) por un código permanente por instalación. Unificar los dos sistemas (rondas + acceso) en un solo código. Exponer el código en el portal del supervisor para pareo en terreno.

## Decisiones

| Decisión | Elección |
|----------|----------|
| Persistencia del código | Permanente por instalación, regenerable manualmente |
| Unificación rondas/acceso | Un solo código para ambos |
| Visibilidad supervisor | Lista (compacto) + detalle (con copiar) |
| Regeneración | Solo admins |
| Migración | Automática al deploy para instalaciones activas |
| Enfoque técnico | Campo `pairingCode` en `CrmInstallation` |

## Schema

Agregar a `CrmInstallation`:

```prisma
pairingCode  String?  @unique  @map("pairing_code")
```

## Flujo de pareo unificado

1. Dispositivo ingresa código `XXX-XXX`
2. API busca `CrmInstallation` por `pairingCode`
3. Se crea `DevicePairing` vinculado a esa instalación
4. Código NO se consume — sigue activo
5. Permisos (rondas/acceso) se configuran post-pareo desde admin

## API Changes

| Ruta | Cambio |
|------|--------|
| `POST /api/devices/pair` | Validar contra `installation.pairingCode` |
| `POST /api/access-control/pair` | Validar contra `installation.pairingCode` |
| `POST /api/devices/generate-code/[installationId]` | Regenerar `installation.pairingCode` (sin expiración) |
| `GET /api/portal/supervisor/session` | Incluir `pairingCode` en instalaciones |

## UI Admin — UnifiedDevicesSection

- Muestra `installation.pairingCode` permanente (sin countdown)
- Botón "Copiar" + "Regenerar"
- Eliminar lógica de expiración y toggles pre-generación
- Toggles rondas/acceso se mueven al dispositivo post-pareo

## UI Supervisor Portal

**Lista** (`SupervisorInstalaciones`): código compacto + botón copiar en cada tarjeta

**Detalle** (`SupervisorInstalacionDetail`): sección "Código de Pareo" con código grande monospace + copiar. Sin regenerar.

## Migración

Script al deploy:
- Para cada `CrmInstallation` activa sin `pairingCode`, genera código único
- Formato: `XXX-XXX` (charset 32 chars, sin I/L/O/0/1)
- Garantiza unicidad con retry

## Deprecación

- `DevicePairing.pairingCode` / `pairingCodeExpiresAt` — dejan de usarse para generación
- `AccessControlPairingCode` — modelo deprecado para nuevos pareos
- Countdown/expiración en frontend — se elimina
- `/api/access-control/pairing-codes/.../generate` — se depreca
