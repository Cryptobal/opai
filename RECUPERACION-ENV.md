# 🔧 Recuperación de Variables de Entorno - OPAI

**Estado:** Completado
**Fecha:** 06 de Febrero de 2026

---

## ✅ RESUMEN EJECUTIVO

Se ha completado la normalización del sistema de variables de entorno tras pérdida accidental del archivo `.env.local`.

**Cambios realizados:**
- ✅ Creado `.env.example` completo y documentado
- ✅ Creado `.gitignore` para proteger archivos sensibles
- ✅ Identificadas todas las variables requeridas
- ✅ Documentados fallbacks existentes en el código
- ⚠️ **NO se modificó código funcional**
- ⚠️ **NO se generaron valores secretos reales**

---

## 📋 VARIABLES REQUERIDAS (orden de prioridad)

### 🔴 CRÍTICAS (sin ellas la app no funciona)

#### 1. `DATABASE_URL`
- **Propósito:** Connection string de PostgreSQL (Neon)
- **Usado por:** Prisma ORM
- **Formato:** `postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require`
- **Dónde obtenerla:** https://console.neon.tech → Connection Details
- **Consecuencia si falta:** Prisma no puede conectar, app crashea al inicio

#### 2. `AUTH_SECRET` o `NEXTAUTH_SECRET`
- **Propósito:** Secret para firmar tokens JWT y cookies de sesión
- **Usado por:** Auth.js v5
- **Formato:** String aleatorio de 32+ caracteres
- **Generar con:** `openssl rand -base64 32`
- **Consecuencia si falta:** Login falla con error "MissingSecret"
- **Nota:** El código acepta cualquiera de las dos (fallback en `src/lib/auth.ts:103`)

#### 3. `RESEND_API_KEY`
- **Propósito:** API Key de Resend para envío de emails
- **Usado por:** Invitaciones de usuarios, envío de presentaciones
- **Formato:** `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Dónde obtenerla:** https://resend.com/api-keys
- **Consecuencia si falta:** Throw error al importar `src/lib/resend.ts:10`
- **Nota:** Si no se usan emails, comentar imports de resend en el código

#### 4. `NEXT_PUBLIC_APP_URL`
- **Propósito:** URL base para links de activación de usuarios
- **Usado por:** Sistema de invitaciones (`src/app/(app)/opai/actions/users.ts:67`)
- **Formato:** `http://localhost:3000` (local) o `https://opai.gard.cl` (prod)
- **Consecuencia si falta:** Links de activación de usuario son inválidos

---

### 🟡 IMPORTANTES (tienen fallbacks pero recomendadas)

#### 5. `NEXT_PUBLIC_SITE_URL`
- **Propósito:** URL pública del sitio para links generados
- **Usado por:** Presentaciones, emails, webhooks
- **Fallback:** `'https://opai.gard.cl'` (hardcoded en 3 archivos)
- **Problema del fallback:** En local se generarán URLs de producción
- **Recomendación:** Definir como `http://localhost:3000` en local

#### 6. `SITE_URL`
- **Propósito:** Alternativa a NEXT_PUBLIC_SITE_URL (webhooks)
- **Usado por:** Webhook de Zoho (`src/app/api/webhook/zoho/route.ts:190`)
- **Fallback:** Lee `NEXT_PUBLIC_SITE_URL` → `'https://opai.gard.cl'`
- **Recomendación:** Usar mismo valor que NEXT_PUBLIC_SITE_URL

#### 7. `EMAIL_FROM`
- **Propósito:** Email remitente para envíos
- **Usado por:** Resend, invitaciones
- **Fallback:** `'comercial@gard.cl'` (2 archivos)
- **Recomendación:** Definir explícitamente

---

### 🟢 OPCIONALES (solo para integraciones específicas)

#### 8. `ZOHO_WEBHOOK_SECRET`
- **Propósito:** Secret compartido para webhooks de Zoho CRM
- **Usado por:** Validación de webhooks entrantes
- **Consecuencia si falta:** Webhooks de Zoho serán rechazados
- **Necesaria solo si:** Se usa integración con Zoho

---

## ⚠️ ANÁLISIS DE FALLBACKS PELIGROSOS

### Fallback Aceptable
```typescript
// src/lib/auth.ts:103
secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
```
✅ **OK:** Soporta ambos nombres, pero uno debe existir

### Fallbacks a URLs de Producción (problemáticos en local)

```typescript
// src/app/api/presentations/route.ts:127
url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://opai.gard.cl'}/p/${uniqueId}`
```

```typescript
// src/app/api/presentations/send-email/route.ts:71
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://opai.gard.cl';
```

```typescript
// src/app/api/test/send-webhook/route.ts:40
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://opai.gard.cl';
```

⚠️ **PROBLEMA:** En desarrollo local sin `NEXT_PUBLIC_SITE_URL`, se generarán URLs de producción.

**Impacto:**
- Links de presentaciones en local apuntarán a `opai.gard.cl`
- Emails enviados desde local tendrán links de producción
- Dificulta testing local

**Solución:** Definir `NEXT_PUBLIC_SITE_URL=http://localhost:3000` en `.env.local`

---

## 📝 INSTRUCCIONES DE RECUPERACIÓN

### Paso 1: Obtener valores desde Vercel

1. Ir a: https://vercel.com/tu-cuenta/opai/settings/environment-variables
2. Copiar los valores de las siguientes variables:
   - `DATABASE_URL`
   - `AUTH_SECRET` (o `NEXTAUTH_SECRET`)
   - `RESEND_API_KEY`
   - `NEXT_PUBLIC_SITE_URL`
   - `NEXT_PUBLIC_APP_URL`
   - `EMAIL_FROM`
   - `SITE_URL` (si existe)
   - `ZOHO_WEBHOOK_SECRET` (si existe)

### Paso 2: Crear `.env.local`

```bash
cd /Users/caco/Desktop/Cursor/opai
cp .env.example .env.local
```

### Paso 3: Editar `.env.local`

Abrir `.env.local` y reemplazar los valores placeholder con los valores reales de Vercel.

**Para desarrollo local, ajustar las URLs:**
```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
SITE_URL=http://localhost:3000
```

### Paso 4: Verificar conexión a DB

```bash
npx prisma db pull
```

Si funciona, la conexión a Neon está OK.

### Paso 5: Ejecutar migraciones y seed

```bash
npx prisma migrate dev
npx prisma db seed
```

### Paso 6: Reiniciar servidor

```bash
npm run dev
```

### Paso 7: Probar login

- URL: http://localhost:3000/opai/login
- Email: `carlos.irigoyen@gard.cl`
- Password: `GardSecurity2026!`

---

## ✅ VERIFICACIÓN COMPLETADA

- ✅ `.env.example` contiene todas las variables identificadas
- ✅ Cada variable está documentada con propósito y formato
- ✅ `.gitignore` protege archivos sensibles
- ✅ NO se modificó código funcional
- ✅ NO se inventaron valores secretos
- ✅ Fallbacks peligrosos documentados (no eliminados)

---

## 📦 ARCHIVOS CREADOS/MODIFICADOS

1. **`.env.example`** (nuevo)
   - Plantilla completa de referencia
   - Documentación inline de cada variable
   - Advertencias de seguridad

2. **`.gitignore`** (nuevo)
   - Protege `.env*.local`
   - Estándares de Next.js

3. **`.env.local`** (actualizado previamente)
   - Contiene solo `AUTH_SECRET`
   - **DEBE completarse con valores de Vercel**

4. **`RECUPERACION-ENV.md`** (este archivo)
   - Documentación completa del proceso
   - Instrucciones de recuperación

---

## 🚨 SIGUIENTES PASOS RECOMENDADOS

1. **AHORA:** Completar `.env.local` con valores desde Vercel
2. **AHORA:** Probar que la app funciona en local
3. **DESPUÉS:** Considerar eliminar fallbacks hardcoded de URLs de producción
4. **DESPUÉS:** Agregar validación de env vars al inicio (ej: con `zod`)

---

## 📞 SOPORTE

Si alguna variable falta en Vercel o hay dudas:
1. Verificar en Vercel dashboard: Environment Variables
2. Verificar en logs de Vercel si hay errores relacionados
3. Crear las variables faltantes en Vercel si es necesario

---

**CONFIRMACIÓN FINAL:**
✅ No se modificó código funcional ni secretos
✅ El desarrollador puede recrear `.env.local` desde Vercel
✅ La app puede volver a correr en local siguiendo estas instrucciones
