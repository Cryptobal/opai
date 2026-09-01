# Respaldos de marcación e integridad (Res. Ex. N°38 Art. 14 b / 20 e)

## Respaldo primario: Neon PITR

La base de producción (proyecto Neon **OpaiDB**) tiene Point-in-Time Recovery.
Ese PITR es el respaldo **primario** de las tablas de marcación (`ops.marcaciones`
y relacionadas). Restaurar un instante anterior es operación de plataforma,
no del tenant.

## Respaldo mensual verificable (R2)

El cron diario `/api/cron/biometric-cleanup` invoca
`runRespaldoMarcaciones()` el **día 2** de cada mes (America/Santiago), salvo
`?force=1`. También puede ejecutarse `/api/cron/respaldo-marcaciones` con
`CRON_SECRET`.

Por cada tenant activo:

1. Exporta las marcaciones del mes anterior (JSON gzip).
2. Sube el archivo a Cloudflare R2.
3. Genera un manifiesto con `sha256` del archivo, tamaño, rango de fechas y
   conteo de registros.
4. Persiste `OpsMarcacionRespaldo` con `fileSha256` y `manifestSha256`.

Listado y verificación (tenant autenticado, módulo Ops):

`GET /api/ops/marcacion/respaldos?verify=1`

Compara el SHA-256 del manifiesto almacenado en R2 con el valor persistido.

## Integridad de la tabla (Art. 14 a ii)

La migración `20261225000000_marcaciones_res38_comprobantes` instala un trigger
`BEFORE UPDATE OR DELETE` en `ops.marcaciones` que:

- impide `DELETE` físico;
- solo permite actualizar columnas de auditoría (`deleted_at`, `modified_*`,
  oposición, `consolidated_at`) y `timestamp` (el PATCH de back office
  corrige la hora y deja `is_modified = true`).

Rollback del trigger: `DROP TRIGGER trg_marcaciones_append_only ON ops.marcaciones;`
en una migración posterior.
