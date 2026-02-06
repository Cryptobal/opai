# Autenticación - OPAI Docs

**Resumen:** Sistema de autenticación con Auth.js v5, invitación de usuarios por email, y RBAC para el módulo Docs.

**Estado:** Vigente - Implementado y operativo

**Scope:** OPAI Docs

---

**Versión:** 2.0  
**Fecha:** 05 de Febrero de 2026  

---

## 🔐 SISTEMA DE AUTENTICACIÓN

### Stack de Autenticación

- **Framework:** Auth.js v5 (NextAuth v5)
- **Provider:** Credentials (email + password)
- **Hashing:** bcryptjs
- **Tokens:** JWT
- **Almacenamiento:** Base de datos (tabla Admin)

---

## 📋 MODELO DE DATOS

### Tabla Admin

```prisma
model Admin {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String   // Hash bcrypt
  name      String
  tenantId  String   // Multi-tenancy
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## 🔄 FLUJO DE AUTENTICACIÓN

### Login

```
1. Usuario accede a: opai.gard.cl/docs/login
   (también funciona: docs.gard.cl/login como alias)
2. Ingresa credenciales:
   - Email: usuario@empresa.com
   - Password: (definida durante activación)
3. NextAuth valida contra hash en BD
4. Genera session JWT con tenantId
5. Redirecciona a: /docs/inicio
```

### Protección de Rutas

```typescript
// src/middleware.ts
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname.startsWith('/inicio')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
})

export const config = {
  matcher: ['/inicio/:path*']
}
```

### Session JWT

La sesión incluye:
```typescript
{
  user: {
    id: string
    email: string
    name: string
    tenantId: string  // Para multi-tenancy
  }
}
```

---

## 🔐 VARIABLES DE ENTORNO

### Archivo: `.env.local`

```bash
# ─── Autenticación y Seguridad ────────────
# Email del administrador
ADMIN_EMAIL="carlos.irigoyen@gard.cl"
# Password en texto plano SOLO para desarrollo local
ADMIN_PASSWORD_DEV="GardSecurity2026!"
# Hash para producción
ADMIN_PASSWORD_HASH="$2b$10$f6gLWyadKS4dzJ11OMQEz.TBEOx7fGKD6HrVdsQLBKy/6XkXFDdOm"
# JWT Secret
JWT_SECRET="dev-jwt-secret-local-2026"
JWT_SECRET_KEY="dev-jwt-secret-local-2026"
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ─── NextAuth.js ──────────────────────────
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET="dev-nextauth-secret-2026-change-in-production"
```

---

## 🛡️ SEGURIDAD

### Mejores Prácticas Implementadas

1. **Hashing de Passwords**
   - Algoritmo: bcrypt
   - Rounds: 10
   - NO almacenar passwords en texto plano

2. **JWT Tokens**
   - Expiración: 30 minutos
   - Secret seguro en producción
   - Renovación automática de sesión

3. **HTTPS Only**
   - Cookies con flag `secure` en producción
   - Redirect HTTP → HTTPS

4. **CSRF Protection**
   - Built-in en Auth.js
   - Validación de tokens

5. **Rate Limiting**
   - Login: máximo 5 intentos/min por IP
   - Lockout temporal después de 5 intentos fallidos

---

## 📝 CONFIGURACIÓN DE AUTH.JS

### Archivo: `src/lib/auth.ts`

```typescript
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const admin = await prisma.admin.findUnique({
          where: { email: credentials.email as string },
          include: { tenant: true }
        })

        if (!admin) {
          return null
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          admin.password
        )

        if (!isValid) {
          return null
        }

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          tenantId: admin.tenantId
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.tenantId = user.tenantId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.tenantId = token.tenantId as string
      }
      return session
    }
  },
  pages: {
    signIn: '/login'
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 60 // 30 minutos
  }
})
```

---

## ✅ CHECKLIST DE SEGURIDAD

### Pre-lanzamiento
- [ ] Passwords hasheados en BD
- [ ] NEXTAUTH_SECRET cambiado en producción
- [ ] JWT_SECRET cambiado en producción
- [ ] HTTPS habilitado
- [ ] Rate limiting configurado
- [ ] Variables de entorno en Vercel
- [ ] No hay secrets en código
- [ ] Logs no exponen datos sensibles

### Monitoreo Continuo
- [ ] Revisar intentos de login fallidos
- [ ] Auditar cambios en tabla Admin
- [ ] Verificar sesiones activas
- [ ] Monitorear patrones sospechosos

---

**Última actualización:** 05 de Febrero de 2026

---

## 🆕 SISTEMA DE INVITACIÓN DE USUARIOS (v2.0)

### Flujo de Invitación

**Versión:** 2.0  
**Fecha:** 05 de Febrero de 2026  

#### 1. Invitación por Email

Un administrador o propietario puede invitar nuevos usuarios al sistema:

```
1. Admin accede a /usuarios
2. Click en "Invitar Usuario"
3. Ingresa email y selecciona rol (owner, admin, editor, viewer)
4. Sistema genera token seguro (hash bcrypt)
5. Envía email con link de activación
6. Link expira en 48 horas
```

#### 2. Activación de Cuenta

El usuario invitado activa su cuenta:

```
1. Click en link del email → /activate?token=XYZ
2. Completa nombre y define contraseña
3. Sistema valida token y crea usuario
4. Estado cambia: invited → active
5. Usuario puede hacer login
```

#### 3. Estados de Usuario

- **invited**: Usuario invitado, pendiente de activación
- **active**: Usuario activo, puede autenticarse
- **disabled**: Usuario desactivado, no puede autenticarse

### Modelo de Datos

```prisma
model Admin {
  id        String   @id
  email     String   @unique
  password  String   // Hash bcrypt
  name      String
  role      String   // "owner", "admin", "editor", "viewer"
  status    String   // "invited", "active", "disabled"
  tenantId  String
  
  lastLoginAt DateTime?
  invitedBy   String?
  invitedAt   DateTime?
  activatedAt DateTime?
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model UserInvitation {
  id        String   @id
  email     String
  role      String
  tenantId  String
  token     String   @unique // Hash del token
  expiresAt DateTime
  
  acceptedAt DateTime?
  revokedAt  DateTime?
  invitedBy  String?
  
  createdAt  DateTime @default(now())
}
```

### Seguridad

#### Tokens de Invitación

- **Generación**: `randomBytes(32).toString('hex')`
- **Almacenamiento**: Hash bcrypt del token en BD
- **Validación**: Comparación bcrypt al activar
- **Expiración**: 48 horas desde creación
- **One-time use**: Se marca como `acceptedAt` al usarse

#### Validaciones

- Solo owner/admin pueden invitar usuarios
- No permitir desactivar al último owner activo
- No permitir cambiar el propio rol
- Verificar que el email no exista antes de invitar

### Roles y Permisos (RBAC)

#### Jerarquía de Roles

```
owner > admin > editor > viewer
```

#### Matriz de Permisos

| Permiso | Owner | Admin | Editor | Viewer |
|---------|-------|-------|--------|--------|
| Gestionar usuarios | ✅ | ✅ | ❌ | ❌ |
| Invitar usuarios | ✅ | ✅ | ❌ | ❌ |
| Gestionar templates | ✅ | ✅ | ❌ | ❌ |
| Editar templates | ✅ | ✅ | ✅ | ❌ |
| Enviar presentaciones | ✅ | ✅ | ✅ | ❌ |
| Ver presentaciones | ✅ | ✅ | ✅ | ✅ |
| Ver analytics | ✅ | ✅ | ❌ | ❌ |
| Gestionar configuración | ✅ | ❌ | ❌ | ❌ |

### API Reference

#### Server Actions

```typescript
// Invitar usuario
await inviteUser(email: string, role: Role)

// Activar cuenta
await activateAccount(token: string, name: string, password: string)

// Cambiar rol
await changeUserRole(userId: string, newRole: Role)

// Activar/desactivar usuario
await toggleUserStatus(userId: string)

// Revocar invitación
await revokeInvitation(invitationId: string)

// Listar usuarios
await listUsers()

// Listar invitaciones pendientes
await listPendingInvitations()
```

#### RBAC Helpers

```typescript
import { hasPermission, PERMISSIONS, type Role } from '@/lib/rbac';

// Verificar permiso
hasPermission(role, PERMISSIONS.MANAGE_USERS)

// Verificar jerarquía
hasRoleOrHigher(userRole, requiredRole)
hasHigherRole(userRole, targetRole)

// Validar rol
isValidRole(role)
```

### Auditoría

Todos los eventos de usuarios se registran en `AuditLog`:

- `user.invited` - Usuario invitado
- `user.activated` - Cuenta activada
- `user.role_changed` - Rol modificado
- `user.disabled` - Usuario desactivado
- `user.enabled` - Usuario reactivado
- `invitation.revoked` - Invitación revocada

---

**Última actualización:** 05 de Febrero de 2026
