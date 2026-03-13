# Optimización del deploy en Vercel

## Fix: Connection pool timeout (500 en producción)

Si ves errores `Timed out fetching a new connection from the connection pool (connection limit: 1)` en los logs de Vercel, actualiza `DATABASE_URL` en **Vercel → Project → Settings → Environment Variables**:

1. Edita `DATABASE_URL` (o créala si no existe).
2. Asegúrate de usar el host **con `-pooler`** (Neon): `...@ep-xxx-pooler.region.neon.tech/...`
3. Añade al final de la query string: `&connection_limit=5&pool_timeout=20`

Ejemplo:
```
postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&connection_limit=5&pool_timeout=20
```

Si ya tienes otros parámetros (ej. `?sslmode=require`), añade con `&`:
```
...?sslmode=require&connection_limit=5&pool_timeout=20
```

Tras guardar, redeploy para que tome efecto.

---

## Situación

- **Antes:** ~1 minuto de deploy.
- **Ahora:** ~4–5 minutos.
- **Objetivo:** Reducir tiempo sin sacrificar estabilidad.

---

## ¿Dónde se va el tiempo?

En un deploy típico de Vercel el tiempo se reparte así:

| Fase | Qué hace | Factores en este proyecto |
|------|----------|----------------------------|
| **Installing dependencies** | `npm install` (+ `postinstall`) | Muchas dependencias, **`postinstall` ejecuta `prisma generate`** (schema muy grande: multi-schema, 5000+ líneas). Paquetes pesados: `@sparticuz/chromium`, `playwright-core`, `googleapis`, `@react-pdf/renderer`, `sharp`, etc. |
| **Building** | `prisma generate && next build` | **`prisma generate` se ejecuta otra vez** (redundante con postinstall). `next build` compila ~141 rutas y todo el bundle. |

Conclusión: parte del tiempo extra viene de **duplicar trabajo** (dos veces `prisma generate`) y de un **install pesado** por schema + dependencias.

---

## Optimizaciones recomendadas

### 1. Evitar doble `prisma generate` (recomendado)

Hoy:
- **En `npm install`:** `postinstall` → `prisma generate`.
- **En el build:** `prisma generate && next build`.

En Vercel no hace falta generar el cliente en `postinstall` porque el build ya lo hace. Se puede hacer que `postinstall` solo ejecute `prisma generate` en local (para que tras `npm install` tengas el cliente listo) y no en Vercel.

- **Vercel:** install más rápido (sin `prisma generate`), build hace `prisma generate` una sola vez.
- **Local:** sin cambios; sigues necesitando `DATABASE_URL` para el primer `npm install` si quieres cliente generado al instalar.

Implementación: crear un script `scripts/postinstall.js` que compruebe `process.env.VERCEL === '1'` y solo en ese caso no ejecute `prisma generate`; en local sí lo ejecute. Llamar a ese script desde `postinstall` en `package.json`.

**Impacto estimado:** ahorro de ~30 s–1 min en la fase de install.

---

### 2. Revisar el desglose en el dashboard de Vercel

En **Vercel → Project → Deployments → último deploy → "Building"** (o "View build logs") puedes ver:

- Tiempo de **Installing dependencies**.
- Tiempo de **Running build command** (y dentro, cuánto es `prisma generate` vs `next build`).

Con eso sabes si el cuello de botella es install, Prisma o Next.

---

### 3. Caché de Vercel

Vercel ya cachea `node_modules` y `.next`. Comprueba en **Project → Settings → General** que no tengas "Override" del build command que fuerce un clean build. No añadas pasos extra que invaliden la caché sin necesidad.

---

### 4. Plan Pro / Turbo Builds (si aplica)

En planes **Pro**, Vercel ofrece **Turbo build machines** (más CPU y RAM). Si el proyecto ha crecido mucho, el mismo build en una máquina más potente puede bajar de 4–5 min a ~2–3 min sin tocar código.

---

### 5. Dependencias pesadas (a medio/largo plazo)

Paquetes que suelen alargar install: `@sparticuz/chromium`, `playwright-core`, `googleapis`, `@react-pdf/renderer`, `sharp`. No es obligatorio quitarlos; se puede revisar si alguna se puede cargar solo donde se use (por ejemplo Chromium solo en la ruta de PDFs). Esto da ganancias a medio plazo.

---

### 6. Generación estática

Tu app no usa `generateStaticParams` en las páginas, así que no pre-renderizas muchas rutas en build. Eso ya es favorable para el tiempo de build.

---

## Resumen

| Acción | Dificultad | Impacto esperado |
|--------|------------|-------------------|
| Evitar doble `prisma generate` (postinstall solo en local) | Baja | ~30 s–1 min menos |
| Revisar logs en Vercel (install vs build) | Muy baja | Saber dónde optimizar |
| Caché correcta | Baja | Evitar empeorar |
| Turbo Builds (plan Pro) | Config | ~1–2 min menos si el cuello es CPU |
| Revisar deps pesadas / lazy load | Media | Variable |

No todo es "código o repo grande": hay margen con el doble `prisma generate` y con revisar install vs build. Bajar a ~2–3 min es razonable con estas optimizaciones.
