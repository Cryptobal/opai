# Flags de multicuenta (correo y agenda)

**Versión:** 1.0

OPAI se comporta por defecto como producto de **una casilla Gmail** y **una
cuenta de Google Calendar** por usuario. El motor multicuenta (PRs #834 y
#839) permanece intacto; la superficie visible y el tope se controlan con
dos feature flags por tenant.

## Flags

| Key | Scope | Default |
|---|---|---|
| `multicuentaCorreo` | Casillas Gmail por usuario | apagado |
| `multicuentaAgenda` | Cuentas Google Calendar por usuario | apagado |

Viven en el JSONB `TenantModule.config` (cualquier fila `enabled = true` del
tenant). El mecanismo es el de `isTenantFeatureFlagEnabled` en
`src/lib/tenant-modules.ts`: una key con valor `true` enciende el flag.
**Sin migración.**

## Valor derivado por usuario

```
enabled     = flagDelTenant || cuentasConectadasDelUsuario >= 2
maxAccounts = flagDelTenant ? 5 : 1
canConnect  = connectedCount < maxAccounts
```

La regla de escape (`>= 2`) evita ocultar el selector a quien ya conectó
dos casillas/cuentas con el flag apagado: su correo/calendario seguiría
sincronizado pero inaccesible desde la UI.

Con el flag apagado y una sola cuenta, `canConnect` es falso aunque
`enabled` sea verdadero por escape en otro usuario del mismo tenant (la
evaluación es **por usuario**).

## Cómo encenderlos

Ejemplo (correo). Sustituir `<uuid>` y el `module` de una fila
`tenant_modules` habilitada del tenant:

```sql
UPDATE public.tenant_modules
SET config = COALESCE(config, '{}'::jsonb) || '{"multicuentaCorreo": true}'::jsonb
WHERE tenant_id = '<uuid>' AND module = '<modulo>' AND enabled = true;
```

Agenda:

```sql
UPDATE public.tenant_modules
SET config = COALESCE(config, '{}'::jsonb) || '{"multicuentaAgenda": true}'::jsonb
WHERE tenant_id = '<uuid>' AND module = '<modulo>' AND enabled = true;
```

Se puede poner ambos en el mismo `config`.

## Caché / TTL

`getTenantFeatureFlags` cachea en memoria **5 minutos** (`CACHE_TTL` en
`tenant-modules.ts`). Tras el `UPDATE`, el cambio no es instantáneo en
instancias ya calientes: esperar el TTL o reiniciar el proceso.

## Efecto con el flag apagado

- No se ofrece "Conectar otra casilla/cuenta".
- Con una casilla, el selector de correo no se renderiza.
- Con una cuenta de Calendar, el riel de agenda no muestra encabezado de
  email (lista plana OPAI + Google). Los **colores por calendario** siguen
  activos.
- Tope en servidor: **1**. `GET /api/crm/gmail/connect` y
  `.../google-calendar/oauth/start` responden con `limit_reached` sin ir a
  Google si el cupo está lleno. Los callbacks aplican el mismo tope al
  crear cuentas nuevas (reconexión de la misma cuenta no cuenta).

## Código

- Helper: `src/modules/shared/multi-account.ts` → `resolveMultiAccount`
- Flags: `FLAG_MULTICUENTA_CORREO` / `FLAG_MULTICUENTA_AGENDA`
