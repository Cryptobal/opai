# Resolver P3009: migración fallida en producción

Si el deploy en Vercel falla con:

```
Error: P3009
migrate found failed migrations in the target database, new migrations will not be applied.
The `20260401000000_supervision_module_refactor` migration started at ... failed
```

hay que marcar esa migración como "rolled back" en la base de datos de producción **una sola vez**. Así el siguiente deploy podrá volver a aplicarla (la migración está hecha idempotente).

## Pasos

1. Usa la **misma URL de base de datos** que tiene Vercel en Production (Variables de entorno → `DATABASE_URL`).

2. En tu máquina, con esa URL, ejecuta:

```bash
DATABASE_URL="postgresql://..." npx prisma migrate resolve --rolled-back 20260401000000_supervision_module_refactor
```

(O exporta `DATABASE_URL` en la terminal y luego ejecuta el comando sin el prefijo.)

3. Vuelve a desplegar en Vercel (redeploy). El build ejecutará `prisma migrate deploy` y aplicará de nuevo la migración (ahora idempotente) sin fallar.

## Nota

La migración `20260401000000_supervision_module_refactor` se dejó **idempotente** (`IF NOT EXISTS`, etc.) para que se pueda reaplicar aunque parte del esquema ya exista por un intento anterior.
