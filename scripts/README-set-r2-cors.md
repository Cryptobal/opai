# Fix: subida de contratos bloqueada por CORS

## Síntoma

Al "Subir Contrato" (CRM → cuenta → contratos) el PDF no se guarda y en la
consola aparece:

```
Access to fetch at 'https://opai.<hash>.r2.cloudflarestorage.com/opai/contracts/...'
from origin 'https://www.opai.cl' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Causa

La subida de contratos es el **único** flujo que hace un `PUT` **directo desde
el browser a R2** vía URL pre-firmada (para saltar el límite de body de Vercel
~4.5MB y permitir PDFs de hasta 25MB). R2 sólo devuelve el header
`Access-Control-Allow-Origin` en ese PUT cross-origin **si el bucket tiene una
política CORS que incluya el origen**. El bucket `opai` no la tenía → el browser
bloquea el PUT.

No es un bug de código: es configuración del bucket. El resto de las subidas
(FileAttachments, chat, tickets…) pasan por el server same-origin y no tocan CORS.

**Importante — multi-tenant:** cada cliente entra por su propio subdominio
(`www.opai.cl`, `opai.gard.cl`, y otros a futuro), así que el origen del PUT
cambia por tenant. Por eso la política usa `AllowedOrigins: ["*"]`: cubre todos
los tenants actuales y futuros sin mantenimiento. **No debilita la seguridad** —
el PUT sólo funciona con la URL pre-firmada que el server genera tras autenticar;
sin ella nadie sube nada (y con ella se podría subir por `curl` igual, saltándose
CORS). Es el patrón estándar para buckets de subida por presigned URL.

## Solución — aplicar CORS al bucket `opai` (una sola vez)

Cualquiera de estas tres opciones. La **A (dashboard)** no requiere ningún token.

### A) Dashboard de Cloudflare (sin token) — recomendado

1. Cloudflare → R2 → bucket **`opai`** → **Settings** → **CORS Policy** → *Edit*.
2. Pegar este JSON y guardar:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### B) Script con token admin de R2 (S3 API)

El token que usa la app (`R2_ACCESS_KEY_ID` de `.env.local`) es **object-scoped**
y da `AccessDenied` en `PutBucketCors`. Crear en el dashboard un token R2 con
permiso **Admin Read & Write**, exportar sus credenciales y correr:

```bash
R2_ACCESS_KEY_ID=<admin_key> \
R2_SECRET_ACCESS_KEY=<admin_secret> \
DOTENV_CONFIG_PATH=.env.local \
npx tsx scripts/set-r2-cors.ts
```

Verificar la política vigente:

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/set-r2-cors.ts --print
```

Orígenes extra (previews de Vercel, subdominios) sin editar el script:

```bash
R2_CORS_EXTRA_ORIGINS="https://algo.vercel.app,https://otro.opai.cl" \
  DOTENV_CONFIG_PATH=.env.local npx tsx scripts/set-r2-cors.ts
```

### C) API REST de Cloudflare

Con un API token que tenga permiso *Workers R2 Storage: Edit*, `PUT` a
`https://api.cloudflare.com/client/v4/accounts/<account_id>/r2/buckets/opai/cors`
con el mismo JSON del punto A.

## Verificar que quedó

Recargar la app y volver a subir un contrato: el `PUT` a R2 debe responder 200
y el toast "Error de conexión" desaparece. La política de CORS propaga en
segundos.
