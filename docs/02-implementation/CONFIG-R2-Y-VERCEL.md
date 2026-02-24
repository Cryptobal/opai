# Configuración R2 y variables en Vercel

## Variables que ya tienes (del token que creaste)

Copia estos **nombres** en Vercel y pega los **valores** que te mostró Cloudflare (los que viste una sola vez al crear el token):

| Variable en Vercel | De dónde sale | Ejemplo (no uses este valor) |
|-------------------|----------------|------------------------------|
| `R2_ACCOUNT_ID` | Del endpoint S3: la parte antes de `.r2.cloudflarestorage.com` | `e56e6231ebbfb3edd31e85df0a7092bc` |
| `R2_ACCESS_KEY_ID` | "ID de clave de acceso" en la pantalla de token creado | (el que copiaste) |
| `R2_SECRET_ACCESS_KEY` | "Clave de acceso secreta" en la misma pantalla | (el que copiaste) |

Si no guardaste el Access Key ID y el Secret, tendrás que crear un **nuevo token** en Cloudflare R2; los secretos no se vuelven a mostrar.

---

## Cómo agregar las variables en Vercel

1. Entra a [vercel.com](https://vercel.com) → tu proyecto **opai** (o el nombre que tenga).
2. **Settings** → **Environment Variables**.
3. Por cada variable:
   - **Key:** nombre exacto (ej. `R2_ACCOUNT_ID`).
   - **Value:** el valor (pega sin espacios).
   - **Environment:** marca **Production**, **Preview** y **Development** si quieres que funcione en todos los entornos.
4. Clic en **Save**.
5. Repite para todas las variables de la tabla de abajo.

Después de guardar, hace falta un **nuevo deploy** (o "Redeploy" del último) para que los cambios apliquen.

---

## Variables a configurar en Vercel

### Base de datos (Neon) — REQUERIDO para migraciones

Si el deploy falla con **P1002** (timeout en advisory lock), añade `DIRECT_URL`:

| Variable | Dónde obtener el valor |
|----------|------------------------|
| `DATABASE_URL` | Neon → Connection Details → **Pooled connection** (host con `-pooler`) |
| `DIRECT_URL` | Neon → Connection Details → **Direct connection** (host SIN `-pooler`) |

Las migraciones (`prisma migrate deploy`) requieren conexión directa. La URL pooled no libera bien los advisory locks y provoca timeout.

### R2 (archivos CRM)

| Variable | Dónde obtener el valor |
|----------|------------------------|
| `R2_ACCOUNT_ID` | En la pantalla del token: en el **Endpoint URL** es la parte antes de `.r2.cloudflarestorage.com`. |
| `R2_ACCESS_KEY_ID` | "ID de clave de acceso" al crear el token (solo se muestra una vez). |
| `R2_SECRET_ACCESS_KEY` | "Clave de acceso secreta" al crear el token (solo se muestra una vez). |
| `R2_BUCKET_NAME` | Nombre del bucket en Cloudflare R2 (ej. `gard-files`). Si no lo creaste, en R2 → Create bucket. |
| `R2_PUBLIC_URL` | URL pública del bucket. Si configuraste dominio personalizado en el bucket (ej. `files.gard.cl`), sería `https://files.gard.cl`. Si aún no lo tienes, puedes dejar una URL temporal o crearla después. |

### Inbound email (leads por correo reenviado)

| Variable | Dónde obtener el valor |
|----------|------------------------|
| `INBOUND_LEADS_EMAIL` | Dirección a la que se reenvían los correos (ej. `leads@inbound.gard.cl`). Debe coincidir con lo que configures en Resend Inbound. |

---

## Qué más debes hacer

### 1. Bucket R2

- En Cloudflare: **R2** → **Create bucket** (si no existe).
- Nombre sugerido: `gard-files`.
- Ese nombre es el valor de `R2_BUCKET_NAME`.

### 2. Acceso público a archivos (opcional pero recomendado)

Para que los enlaces de descarga funcionen:

- En el bucket: **Settings** → **Public access** / **Custom domain**.
- Añade un dominio (ej. `files.gard.cl`) y el CNAME que te indique Cloudflare en el DNS de `gard.cl`.
- La URL base que uses (ej. `https://files.gard.cl`) es `R2_PUBLIC_URL`.

### 3. Resend Inbound (para leads por email)

- En Resend: dominio de recepción (ej. `inbound.gard.cl`) y registros MX en el DNS.
- Webhook: evento `email.received` → URL `https://<tu-dominio-vercel>/api/webhook/inbound-email`.
- La dirección de reenvío (ej. `leads@inbound.gard.cl`) debe ser la que pongas en `INBOUND_LEADS_EMAIL`.

### 4. Redeploy en Vercel

Después de guardar las variables, en **Deployments** → los tres puntos del último deploy → **Redeploy** para que la app use las nuevas variables.

---

## Desarrollo local

Copia las mismas variables a `.env.local` (nunca hagas commit de este archivo). Puedes usar los mismos valores que en Vercel para Production o crear un bucket de prueba.
