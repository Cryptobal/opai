# PENDING — Radar Comercial data cleanup (DDL)

> **Estado: NO EJECUTADO.** Documento de propuesta para una migración futura (Bloque B4).
> No hay archivo Prisma migration asociado. No aplicar en producción sin plan de rollback.

## Contexto

El Radar Comercial (clasificación automática, items, briefs, compromisos y caps
`radar_*`) fue retirado del código en los bloques B0–B3. Las tablas/columnas
siguen en la base para no romper datos históricos ni requerir DDL en el mismo
cambio de producto.

## DDL propuesto (PostgreSQL)

### 1. Drop tabla `crm.radar_items`

Modelo Prisma: `CrmRadarItem` → tabla `crm.radar_items` (nombre exacto a
confirmar con `\d crm.*` / introspection antes de ejecutar).

```sql
-- Verificar dependencias (FKs, índices) antes del DROP.
DROP TABLE IF EXISTS crm.radar_items CASCADE;
```

### 2. Drop columnas AI / override en hilos de correo

Tabla de hilos: modelo Prisma `CrmEmailThread` (schema `crm`). Columnas a
eliminar:

| Columna | Notas |
|---------|--------|
| `ai_category` | Categoría del clasificador del Radar |
| `ai_intent` | Intención comercial |
| `ai_summary` | Resumen IA |
| `ai_classified_at` | Timestamp de clasificación |
| `ai_vertical` | Vertical (comercial/ops/rrhh/…) |
| `ai_urgency` | Urgencia |
| `ai_sentiment` | Sentimiento |
| `vertical_override` | Override manual de vertical |
| `vertical_override_by_id` | Admin que hizo el override |
| `vertical_override_at` | Timestamp del override |

```sql
ALTER TABLE crm."CrmEmailThread"  -- nombre físico a confirmar
  DROP COLUMN IF EXISTS ai_category,
  DROP COLUMN IF EXISTS ai_intent,
  DROP COLUMN IF EXISTS ai_summary,
  DROP COLUMN IF EXISTS ai_classified_at,
  DROP COLUMN IF EXISTS ai_vertical,
  DROP COLUMN IF EXISTS ai_urgency,
  DROP COLUMN IF EXISTS ai_sentiment,
  DROP COLUMN IF EXISTS vertical_override,
  DROP COLUMN IF EXISTS vertical_override_by_id,
  DROP COLUMN IF EXISTS vertical_override_at;
```

> **Importante:** el nombre físico de la tabla/columnas puede diferir del
> modelo (map `@map` / `@@map` en `schema.prisma`). Introspectar antes de
> generar la migración Prisma.

## Checklist previo a ejecutar

1. Confirmar que ningún cron, API ni consumer en el repo lee `crmRadarItem` /
   columnas `ai*` de threads (salvo docs/tests históricos).
2. Snapshot / backup de Neon (branch o PITR) del entorno objetivo.
3. Crear migración Prisma (`prisma migrate dev` / SQL supervisado) — **no**
   `db push` en producción.
4. Actualizar `prisma/schema.prisma` (quitar modelo `CrmRadarItem` y campos
   AI del thread) en el mismo PR que la migración.
5. Revisar búsqueda de correos: el operador `vertical:` filtra por
   `ai_vertical`; al dropear la columna hay que retirar ese operador del
   parser (`correos-search.ts`) y tests asociados.
6. Preferencias de notificación: typeKey `radar_comercial` se mantiene en el
   catálogo como legacy; puede archivarse/ocultarse en un follow-up de prefs.

## Roles (JSON en `role_templates`) — NO es B4

Los permisos viven en `RoleTemplate.permissions` (JSONB). Al retirar las caps
`radar_*` del catálogo, los snapshots viejos en BD pueden:

1. Tener `radar_comercial: true` sin `copiloto_correos` → el runtime ya aplica
   `applyCopilotoCorreosCompat` (nadie pierde el Copiloto).
2. Romper el PUT de Roles si `validatePermissions` veía caps desconocidas →
   las `radar_*` se ignoran/filtran al validar.

Persistir la migración (idempotente, post-deploy):

```bash
npx tsx scripts/backfill-copiloto-correos-permissions.ts --dry-run
npx tsx scripts/backfill-copiloto-correos-permissions.ts
```

Eso otorga `copiloto_correos` donde había `radar_comercial` y borra las keys
`radar_*` del JSON. **No** dropea tablas ni columnas.

## Fuera de alcance de este documento

- Settings tenant `radar_*_enabled` (key-value): limpieza opcional de filas
  huérfanas en `Setting`.
- Notificaciones históricas ya emitidas con `typeKey = radar_comercial`.
