# BLOQUE 9 — [AISLADO · REQUIERE CONFIRMACIÓN HUMANA]

> **HARD STOP.** La migración de BD **no se aplica** aquí y la rama **no se
> mergea**. Este documento deja todo preparado y documentado para que un humano
> lo ejecute tras validar el flujo en Slack.

## 1. Migración aditiva (Bloque 1) — aplicar en producción

Migración: `prisma/migrations/20261014000000_asistencia_slack_aditivo/migration.sql`
100% aditiva: `ADD COLUMN` / `CREATE TABLE` / `CREATE INDEX` / `ADD CONSTRAINT`,
todo `IF NOT EXISTS`. No hay `DROP` ni `ALTER` destructivo.

### Pre-verificación (confirmar que aún no existe)
```sql
-- Debe devolver 0 filas antes de aplicar:
SELECT column_name FROM information_schema.columns
 WHERE table_schema='ops' AND table_name='asistencia_diaria'
   AND column_name IN ('contacto_central_at','contacto_central_by','contacto_central_resultado');
SELECT to_regclass('ops.contacto_central');           -- NULL antes de aplicar
SELECT to_regclass('public.ops_relevo_slack_board');  -- NULL antes de aplicar
```

### Aplicar
```bash
# Opción A (recomendada, registra en _prisma_migrations):
npx prisma migrate deploy

# Opción B (SQL directo, si se prefiere revisar/ejecutar a mano):
psql "$DATABASE_URL" -f prisma/migrations/20261014000000_asistencia_slack_aditivo/migration.sql
```

### Rollback
La migración es aditiva y segura de dejar puesta. Si se requiere revertir:
```sql
DROP TABLE IF EXISTS "public"."ops_relevo_slack_board";
DROP TABLE IF EXISTS "ops"."contacto_central";
ALTER TABLE "ops"."asistencia_diaria"
  DROP COLUMN IF EXISTS "contacto_central_at",
  DROP COLUMN IF EXISTS "contacto_central_by",
  DROP COLUMN IF EXISTS "contacto_central_resultado";
```
> El rollback borra el historial de contacto de central y los tableros
> publicados. No afecta filas de `asistencia_diaria` (columnas nullable).

## 2. Apagado de correos por tenant (flags, default `true`)

Implementado en código (Bloque 9): `src/lib/notifications/email-flags.ts`
gatea el envío en los dos endpoints. Default `true` (ausencia del Setting =
habilitado) → **el comportamiento NO cambia** hasta apagarlo por tenant.

Claves de `Setting` (unique `[tenantId, key]`), `value` = `"false"` para apagar:
- `reporteTurnoEmailEnabled` → correo de cierre de turno de rondas
  (`/api/ops/rondas/monitoreo/turno/[id]/close`).
- `controlNocturnoEmailEnabled` → correo de control nocturno
  (`/api/ops/control-nocturno/[id]`).

### Apagar un correo para un tenant (tras validar Slack)
```sql
INSERT INTO "public"."Setting" (id, key, value, type, category, "tenantId", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'reporteTurnoEmailEnabled', 'false', 'boolean', 'notifications', '<TENANT_ID>', now(), now())
ON CONFLICT ("tenantId", key) DO UPDATE SET value='false', "updatedAt"=now();
-- Repetir con 'controlNocturnoEmailEnabled' para el control nocturno.
```
### Volver a encender
```sql
UPDATE "public"."Setting" SET value='true', "updatedAt"=now()
 WHERE "tenantId"='<TENANT_ID>' AND key IN ('reporteTurnoEmailEnabled','controlNocturnoEmailEnabled');
```

## 3. Checklist de validación manual en Slack (antes de apagar correos)

1. **Tablero de relevo**: forzar el cron (`GET /api/cron/asistencia-relevo-digest`
   con `Authorization: Bearer $CRON_SECRET`) a la franja `shiftStart − 60min`, o
   llamar `publishRelevoBoard` para una instalación con puente. Verificar que el
   mensaje-ficha aparece en el canal de la instalación.
2. **Botón "📞 En camino"** → abre el mini-modal, registrar resultado → el tablero
   se re-edita (semáforo 🟡, "central: …").
3. **Botón "✓ Confirmar llegada"** → semáforo pasa a estado confirmado, tablero
   re-editado.
4. **Botón "Reportar ausencia"** → semáforo 🔴 + se abre el modal de turno extra
   (cobertura).
5. **Marca dentro de rango** de un guardia entrante → el tablero se refresca a
   🟢 sin publicar mensaje suelto (`en_camino` → asistió si venía de central).
6. **Marca fuera de rango** → alerta 🚨 con foto embebida en el canal de la
   instalación (en paralelo al correo, que sigue activo).
7. **Cerrar turno de rondas** → tarjeta 🏁 "Cierre de turno · Rondas" en el canal
   ops.
8. **Enviar control nocturno** → tarjeta 🌙 "Cambios de turno · por instalación"
   en el mismo canal.

Una vez verificado por tenant, apagar sus correos con los `UPDATE`/`INSERT` de la
sección 2. **No mergear hasta la aprobación humana.**
