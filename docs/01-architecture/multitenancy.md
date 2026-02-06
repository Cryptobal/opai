# Multi-Tenancy - OPAI Docs

**Resumen:** Arquitectura SaaS multi-tenant con aislamiento completo de datos por organización.

**Estado:** Vigente - Implementado y operativo

**Scope:** OPAI Docs

---

**Versión:** 2.0  
**Fecha:** 05 de Febrero de 2026  

---

## 🏢 ARQUITECTURA MULTI-TENANT

### Modelo SaaS

OPAI Docs está diseñado como una aplicación SaaS multi-tenant que permite que múltiples organizaciones utilicen la misma instancia de la plataforma con datos completamente aislados por tenant.

---

## 📊 MODELO DE DATOS

### Entidad Tenant

```prisma
model Tenant {
  id             String         @id @default(cuid())
  slug           String         @unique
  name           String
  active         Boolean        @default(true)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  
  // Relaciones
  admins         Admin[]
  presentations  Presentation[]
  templates      Template[]
  webhookSessions WebhookSession[]
}
```

### Tenant por Defecto

- **ID:** `clgard00000000000000001`
- **Slug:** `gard`
- **Nombre:** Gard Security
- **Estado:** Activo

---

## 🔐 AISLAMIENTO DE DATOS

### Tablas con Multi-Tenancy

Todas las entidades principales incluyen `tenantId`:

1. **Admin** - Usuarios administrativos
2. **Presentation** - Presentaciones comerciales
3. **Template** - Plantillas de presentaciones
4. **WebhookSession** - Sesiones de webhook
5. **AuditLog** (opcional) - Logs de auditoría
6. **Setting** (opcional) - Configuraciones

### Migración Segura

Proceso de agregar `tenantId` a tablas existentes:

```sql
-- 1. Agregar columna nullable
ALTER TABLE Presentation ADD COLUMN tenantId TEXT;

-- 2. Backfill con tenant por defecto
UPDATE Presentation 
SET tenantId = 'clgard00000000000000001' 
WHERE tenantId IS NULL;

-- 3. Hacer NOT NULL
ALTER TABLE Presentation ALTER COLUMN tenantId SET NOT NULL;

-- 4. Agregar foreign key
ALTER TABLE Presentation 
ADD CONSTRAINT Presentation_tenantId_fkey 
FOREIGN KEY (tenantId) REFERENCES Tenant(id);
```

---

## 🔄 FILTRADO POR TENANT

### Rutas Internas (Admin)

Todas las operaciones internas filtran por el `tenantId` de la sesión activa:

```typescript
// Ejemplo: Listar presentaciones
const presentations = await prisma.presentation.findMany({
  where: {
    tenantId: session.user.tenantId
  }
})
```

### Rutas Públicas

La ruta pública `/p/[uniqueId]` NO requiere filtrado por tenant, ya que:
- El `uniqueId` es globalmente único
- El `tenantId` en el registro se usa solo para trazabilidad
- No hay riesgo de colisión entre tenants

```typescript
// Búsqueda pública por uniqueId
const presentation = await prisma.presentation.findUnique({
  where: {
    uniqueId: params.uniqueId
  }
  // NO filtrar por tenantId aquí
})
```

---

## 🔀 TENANT SWITCHER

### Modelo Actual (Single Tenant)

En la implementación actual:
- Cada `Admin` tiene un único `tenantId`
- No hay posibilidad de cambiar de tenant
- Relación: `Admin.tenantId` → `Tenant.id`

### Modelo Futuro (Multi-Tenant)

Para admins que gestionan múltiples tenants:

```prisma
// Tabla de relación many-to-many (futuro)
model AdminTenant {
  id        String   @id @default(cuid())
  adminId   String
  tenantId  String
  role      String   // "owner", "admin", "viewer"
  admin     Admin    @relation(fields: [adminId], references: [id])
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  createdAt DateTime @default(now())
  
  @@unique([adminId, tenantId])
}
```

### Persistencia de Tenant Activo

Opciones para guardar el tenant activo:

1. **Cookie** (recomendado)
   ```typescript
   cookies().set('active_tenant', tenantId, {
     httpOnly: true,
     secure: true,
     maxAge: 60 * 60 * 24 * 30 // 30 días
   })
   ```

2. **Base de Datos**
   ```prisma
   model Admin {
     id               String  @id
     activeTenantId   String?
     defaultTenantId  String
     // ...
   }
   ```

---

## 🔌 INTEGRACIÓN CON ZOHO

### Estado Actual

- Zoho CRM se mantiene como **ingest legacy**
- Los webhooks de Zoho se procesan y guardan con `tenantId`
- Cada tenant puede tener su propia configuración de Zoho

### Origen Futuro de Datos

El plan es migrar de Zoho CRM a **CRM OPAI** (sistema interno), manteniendo la misma estructura de datos pero con mejor integración.

---

## 📋 SCHEMA PRISMA MULTI-TENANT

### Ejemplo Completo

```prisma
model Tenant {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  admins         Admin[]
  presentations  Presentation[]
  templates      Template[]
  webhookSessions WebhookSession[]
}

model Admin {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  name      String
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Presentation {
  id              String   @id @default(cuid())
  uniqueId        String   @unique
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  templateId      String
  template        Template @relation(fields: [templateId], references: [id])
  clientData      Json
  renderedContent Json
  status          String
  emailSentAt     DateTime?
  whatsappSharedAt DateTime?
  viewCount       Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  views PresentationView[]
}

model Template {
  id            String         @id @default(cuid())
  name          String
  slug          String         @unique
  type          String
  content       Json
  active        Boolean        @default(true)
  tenantId      String
  tenant        Tenant         @relation(fields: [tenantId], references: [id])
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  
  presentations Presentation[]
}

model WebhookSession {
  id        String   @id @default(cuid())
  sessionId String   @unique
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  zohoData  Json
  status    String
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

---

## ✅ CHECKLIST MULTI-TENANT

### Implementación Completa
- [x] Tabla Tenant creada
- [x] Tenant "gard" existe
- [x] Admin tiene tenantId
- [x] Template tiene tenantId
- [x] Presentation tiene tenantId
- [x] WebhookSession tiene tenantId
- [x] Migraciones aplicadas

### Validación Funcional
- [ ] Login con carlos.irigoyen@gard.cl
- [ ] Dashboard muestra solo datos del tenant gard
- [ ] APIs internas filtran por session.user.tenantId
- [ ] Presentaciones se crean con tenantId correcto
- [ ] `/p/[uniqueId]` funciona sin filtro de tenant

### Futuro (Multi-Tenant Completo)
- [ ] Tabla AdminTenant para relación many-to-many
- [ ] Tenant switcher en UI
- [ ] Persistencia de tenant activo
- [ ] Onboarding de nuevos tenants
- [ ] Configuración por tenant (Zoho, email, branding)

---

## 🔒 SEGURIDAD

### Principios de Aislamiento

1. **Nunca confiar en el cliente**
   - Siempre obtener `tenantId` de la sesión autenticada
   - NUNCA aceptar `tenantId` de parámetros de URL o body

2. **Validación en middleware**
   ```typescript
   // src/middleware.ts
   export default auth((req) => {
     if (req.auth?.user?.tenantId) {
       req.headers.set('x-tenant-id', req.auth.user.tenantId)
     }
   })
   ```

3. **Prisma Query Helpers**
   ```typescript
   // src/lib/prisma-helpers.ts
   export function scopeToTenant<T>(
     query: T,
     tenantId: string
   ) {
     return {
       ...query,
       where: {
         ...(query as any).where,
         tenantId
       }
     }
   }
   ```

---

## 📈 MÉTRICAS POR TENANT

### Analytics Separados

Cada tenant debe tener métricas independientes:

- Total presentaciones enviadas
- Tasa de apertura
- Templates más usados
- Clientes más activos
- Conversión de presentaciones

### Dashboard Admin

El dashboard debe:
- Mostrar solo datos del tenant activo
- Permitir comparación entre períodos (dentro del mismo tenant)
- Exportar reportes por tenant

---

**Última actualización:** 05 de Febrero de 2026

---

## 👥 GESTIÓN DE USUARIOS MULTI-TENANT (v2.0)

**Versión:** 2.0  
**Fecha:** 05 de Febrero de 2026  

### Modelo de Usuarios

Cada usuario (Admin) pertenece a un único tenant pero el sistema está preparado para evolucionar a many-to-many via tabla Membership.

#### Estado Actual

```prisma
model Admin {
  tenantId  String  // Un usuario, un tenant
  tenant    Tenant @relation(...)
}
```

#### Evolución Futura (Many-to-Many)

```prisma
model Membership {
  id        String @id
  adminId   String
  tenantId  String
  role      String
  active    Boolean
  
  @@unique([adminId, tenantId])
}
```

### Invitaciones por Tenant

Las invitaciones están scoped al tenant del usuario que invita:

```typescript
// Al invitar
const invitation = await prisma.userInvitation.create({
  data: {
    email,
    role,
    tenantId: session.user.tenantId, // ← Del admin que invita
    ...
  },
});
```

### Filtrado de Usuarios

Todas las queries de usuarios filtran por `tenantId`:

```typescript
// Listar usuarios
const users = await prisma.admin.findMany({
  where: { tenantId: session.user.tenantId }, // ← Solo del tenant actual
});
```

### Seguridad Multi-Tenant

1. **Invitaciones**
   - Solo se pueden enviar invitaciones al tenant propio
   - Token de invitación incluye `tenantId`
   - Usuario creado se asocia al `tenantId` de la invitación

2. **Gestión de usuarios**
   - Solo se pueden gestionar usuarios del mismo tenant
   - Verificación en cada server action

3. **Roles**
   - Los roles son globales pero se aplican por tenant
   - Un usuario puede tener diferentes roles en diferentes tenants (futuro)

---

**Última actualización:** 05 de Febrero de 2026
