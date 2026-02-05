# 🗄️ Estructura de Base de Datos - Gard Docs

**Base de Datos:** Neon PostgreSQL  
**ORM:** Prisma v6.19.2  
**Última actualización:** 05 de Febrero de 2026

---

## 📋 RESUMEN

**Total de tablas:** 7  
**Migración inicial:** `20260205051011_init`  
**Estado:** ✅ Aplicada y sincronizada

---

## 📊 MODELOS

### 1️⃣ **Presentation** (Presentaciones)

Almacena las presentaciones generadas, ya sea desde Zoho CRM o creadas manualmente.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| `id` | String | ID único de la presentación | PK, cuid |
| `uniqueId` | String | ID público para URL `/p/[uniqueId]` | Unique, indexed |
| `templateId` | String | ID del template usado | FK → Template, indexed |
| `clientData` | Json | Datos del cliente de Zoho (quote, account, contact, deal) | Required |
| `renderedContent` | Json | Contenido renderizado (cache opcional) | Nullable |
| `status` | String | Estado de la presentación | Default: "draft", indexed |
| `recipientEmail` | String | Email del destinatario | Nullable, indexed |
| `recipientName` | String | Nombre del destinatario | Nullable |
| `emailSentAt` | DateTime | Timestamp de envío de email | Nullable |
| `emailProvider` | String | Proveedor de email usado ("resend", "sendgrid") | Nullable |
| `emailMessageId` | String | ID del mensaje en el proveedor | Nullable |
| `whatsappSharedAt` | DateTime | Timestamp de compartir por WhatsApp | Nullable |
| `whatsappNumber` | String | Número de WhatsApp | Nullable |
| `viewCount` | Int | Contador de visualizaciones | Default: 0 |
| `firstViewedAt` | DateTime | Primera visualización | Nullable |
| `lastViewedAt` | DateTime | Última visualización | Nullable |
| `expiresAt` | DateTime | Fecha de expiración (opcional) | Nullable |
| `notes` | String | Notas internas | Nullable |
| `tags` | String[] | Tags para categorización | Array |
| `createdBy` | String | User ID del creador | Nullable |
| `createdAt` | DateTime | Fecha de creación | Auto |
| `updatedAt` | DateTime | Última actualización | Auto |

**Relaciones:**
- `template` → Template (muchos a uno)
- `views` → PresentationView[] (uno a muchos)

**Índices:**
- `uniqueId` (unique)
- `status`
- `createdAt`
- `templateId`
- `recipientEmail`

**Estados posibles:**
- `draft` - Borrador (recién creada)
- `sent` - Enviada por email
- `viewed` - Visualizada por el cliente
- `expired` - Expirada

---

### 2️⃣ **Template** (Templates)

Catálogo de templates disponibles para presentaciones.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| `id` | String | ID único del template | PK, cuid |
| `name` | String | Nombre del template | Required |
| `slug` | String | Slug URL-friendly | Unique, indexed |
| `description` | String | Descripción del template | Nullable |
| `type` | String | Tipo de template | Required, indexed |
| `category` | String | Categoría del template | Nullable |
| `active` | Boolean | Si está activo | Default: true, indexed |
| `isDefault` | Boolean | Si es template por defecto | Default: false |
| `thumbnailUrl` | String | URL de thumbnail para preview | Nullable |
| `createdBy` | String | User ID del creador | Nullable |
| `lastEditedBy` | String | User ID del último editor | Nullable |
| `usageCount` | Int | Cuántas veces se ha usado | Default: 0 |
| `createdAt` | DateTime | Fecha de creación | Auto |
| `updatedAt` | DateTime | Última actualización | Auto |

**Relaciones:**
- `presentations` → Presentation[] (uno a muchos)

**Índices:**
- `slug` (unique)
- `active`
- `type`

**Tipos posibles:**
- `presentation` - Presentación web
- `email` - Template de email

**Categorías sugeridas:**
- `sales` - Ventas
- `technical` - Técnico
- `marketing` - Marketing

---

### 3️⃣ **WebhookSession** (Sesiones Temporales de Zoho)

Almacena datos temporales recibidos de webhooks de Zoho CRM.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| `id` | String | ID único | PK, cuid |
| `sessionId` | String | ID de sesión público | Unique, indexed |
| `zohoData` | Json | Datos completos del webhook | Required |
| `status` | String | Estado de la sesión | Required, indexed |
| `expiresAt` | DateTime | Fecha de expiración (24h) | Required |
| `createdAt` | DateTime | Fecha de creación | Auto |
| `updatedAt` | DateTime | Última actualización | Auto |

**Índices:**
- `sessionId` (unique)
- `status`

**Estados posibles:**
- `pending` - Pendiente de procesar
- `completed` - Procesada (presentación creada)
- `expired` - Expirada (>24h)

**Contenido de `zohoData`:**
```json
{
  "quote": { ... },    // Cotización de Zoho
  "account": { ... },  // Empresa/Cliente
  "contact": { ... },  // Contacto
  "deal": { ... }      // Negocio/Oportunidad
}
```

---

### 4️⃣ **PresentationView** (Vistas de Presentaciones)

Tracking de visualizaciones de presentaciones.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| `id` | String | ID único | PK, cuid |
| `presentationId` | String | ID de la presentación | FK → Presentation, indexed |
| `ipAddress` | String | IP del viewer | Nullable |
| `userAgent` | String | User agent del browser | Nullable |
| `country` | String | País (de IP geolocation) | Nullable |
| `city` | String | Ciudad (de IP geolocation) | Nullable |
| `device` | String | Tipo de dispositivo | Nullable |
| `browser` | String | Navegador | Nullable |
| `viewedAt` | DateTime | Timestamp de la vista | Auto, indexed |
| `duration` | Int | Segundos en la página | Nullable |
| `sessionId` | String | ID de sesión (para agrupar vistas) | Nullable, indexed |

**Relaciones:**
- `presentation` → Presentation (muchos a uno, cascade delete)

**Índices:**
- `presentationId`
- `viewedAt`
- `sessionId`

**Tipos de dispositivo:**
- `desktop`
- `mobile`
- `tablet`

---

### 5️⃣ **Admin** (Usuarios Administradores)

Usuarios con acceso al dashboard administrativo.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| `id` | String | ID único | PK, cuid |
| `email` | String | Email del usuario | Unique, indexed |
| `password` | String | Password hasheado (bcrypt) | Required |
| `name` | String | Nombre completo | Required |
| `role` | String | Rol del usuario | Default: "admin" |
| `active` | Boolean | Si está activo | Default: true, indexed |
| `lastLoginAt` | DateTime | Último login | Nullable |
| `createdAt` | DateTime | Fecha de creación | Auto |
| `updatedAt` | DateTime | Última actualización | Auto |

**Índices:**
- `email` (unique)
- `active`

**Roles posibles:**
- `admin` - Administrador total
- `editor` - Puede editar templates
- `viewer` - Solo lectura

**Usuario por defecto:**
- Email: `carlos.irigoyen@gard.cl`
- Password: `GardSecurity2026!` (hasheado con bcrypt)

---

### 6️⃣ **AuditLog** (Registro de Auditoría)

Log de eventos importantes del sistema.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| `id` | String | ID único | PK, cuid |
| `userId` | String | ID del usuario que ejecutó la acción | Nullable, indexed |
| `userEmail` | String | Email del usuario | Nullable |
| `action` | String | Acción ejecutada | Required, indexed |
| `entity` | String | Entidad afectada | Required, indexed |
| `entityId` | String | ID de la entidad | Nullable |
| `details` | Json | Datos adicionales del evento | Nullable |
| `ipAddress` | String | IP del usuario | Nullable |
| `userAgent` | String | User agent | Nullable |
| `createdAt` | DateTime | Timestamp del evento | Auto, indexed |

**Índices:**
- `userId`
- `action`
- `entity`
- `createdAt`

**Acciones típicas:**
- `presentation_created`
- `presentation_sent`
- `presentation_viewed`
- `template_created`
- `template_edited`
- `admin_login`

**Entidades:**
- `presentation`
- `template`
- `admin`
- `webhook_session`

---

### 7️⃣ **Setting** (Configuración Global)

Configuración global del sistema (key-value).

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| `id` | String | ID único | PK, cuid |
| `key` | String | Clave de la configuración | Unique, indexed |
| `value` | String | Valor de la configuración | Required |
| `type` | String | Tipo de dato | Required |
| `category` | String | Categoría de la configuración | Nullable, indexed |
| `createdAt` | DateTime | Fecha de creación | Auto |
| `updatedAt` | DateTime | Última actualización | Auto |

**Índices:**
- `key` (unique)
- `category`

**Tipos posibles:**
- `string`
- `number`
- `boolean`
- `json`

**Categorías:**
- `general`
- `email`
- `security`

**Settings iniciales:**
```
site_name: "Gard Docs"
default_template_id: "cml901f1a0000yx56tkeertrd"
session_expiry_hours: "24"
```

---

## 🔗 RELACIONES

```
Template (1) ←→ (N) Presentation
Presentation (1) ←→ (N) PresentationView
```

**Cascade Delete:**
- Si se elimina una `Presentation`, se eliminan todas sus `PresentationView` asociadas

---

## 📊 SEED DATA (Datos Iniciales)

### Template "Commercial"
```sql
id: cml901f1a0000yx56tkeertrd
slug: commercial
name: Propuesta Comercial
type: presentation
active: true
isDefault: true
```

### Admin User
```sql
email: carlos.irigoyen@gard.cl
password: [bcrypt hash]
role: admin
active: true
```

### Settings
```sql
site_name → "Gard Docs"
default_template_id → "cml901f1a0000yx56tkeertrd"
session_expiry_hours → "24"
```

---

## 🛠️ COMANDOS ÚTILES

### Ver la base de datos en navegador:
```bash
npx prisma studio
```
Abre en: `http://localhost:5555`

### Generar Prisma Client (después de cambios en schema):
```bash
npx prisma generate
```

### Crear nueva migración:
```bash
npx prisma migrate dev --name nombre_descriptivo
```

### Aplicar migraciones en producción:
```bash
npx prisma migrate deploy
```

### Resetear base de datos (PELIGROSO):
```bash
npx prisma migrate reset
```

### Ejecutar seed:
```bash
npx prisma db seed
```

---

## 📝 NOTAS TÉCNICAS

### Tipos de ID
Todos los modelos usan **cuid** (Collision-resistant Unique ID) para IDs únicos:
- Más seguros que UUID
- URL-friendly
- Ordenables cronológicamente
- Ejemplo: `cml901f1a0000yx56tkeertrd`

### JSON Fields
Los campos `Json` pueden almacenar cualquier estructura JSON:
- `clientData` en Presentation
- `zohoData` en WebhookSession
- `renderedContent` en Presentation
- `details` en AuditLog

### Timestamps
Todos los modelos tienen `createdAt` y `updatedAt` automáticos.

### Índices
Los índices se crean automáticamente en:
- Primary Keys
- Foreign Keys
- Unique constraints
- Campos con `@@index()`

---

## 🔄 MIGRACIONES

### Migración Actual
```
prisma/migrations/20260205051011_init/migration.sql
```

**Crea:**
- 7 tablas principales
- Todos los índices
- Foreign keys con cascade

**Estado:** ✅ Aplicada a Neon PostgreSQL

---

## 🚀 PRÓXIMAS EXTENSIONES

**Posibles modelos futuros:**

1. **EmailQueue** - Cola de emails pendientes
2. **Notification** - Notificaciones del sistema
3. **Integration** - Integraciones externas (Zoho, Resend, etc.)
4. **Webhook** - Registro de webhooks recibidos
5. **ApiKey** - Keys de API para integraciones

---

**Última actualización:** 05 de Febrero de 2026  
**Ubicación del schema:** `prisma/schema.prisma`  
**Conexión:** Neon PostgreSQL (variable `DATABASE_URL`)
