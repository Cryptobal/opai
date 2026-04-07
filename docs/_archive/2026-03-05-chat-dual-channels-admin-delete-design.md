# Chat Dual por Instalacion + Admin Delete — Diseno Tecnico

**Proyecto:** OPAI
**Fecha:** Marzo 2026
**Estado:** Aprobado

---

## 1. Resumen

Dos cambios al sistema de chat:

1. **Canales duales por instalacion:** Cada instalacion genera dos canales — "Reportes" (guardias + clientes + admins) e "Interno" (solo contactos de cuenta + admins Gard, nunca guardias).
2. **Eliminacion de mensajes por admin:** Admins con rol `owner` o `admin` pueden borrar cualquier mensaje individual o limpiar toda la conversacion de un canal.

---

## 2. Modelo de datos

### 2.1 Nuevo campo: ChatChannel.subType

```prisma
subType String? @map("sub_type")  // "reportes" | "interno" | null
```

- `null` = canales DIRECT, GROUP, EXTERNAL (sin cambio)
- `"reportes"` = canal instalacion donde entran guardias + clientes + admins
- `"interno"` = canal instalacion solo contactos cuenta + admins Gard

### 2.2 Cambio de constraint unique

El constraint actual `@@unique([installationId])` se reemplaza por `@@unique([installationId, subType])` para permitir dos canales por instalacion.

### 2.3 Migracion SQL

```sql
ALTER TABLE chat.channels ADD COLUMN sub_type VARCHAR(20);

-- Quitar unique de installationId solo
ALTER TABLE chat.channels DROP CONSTRAINT IF EXISTS chat_channels_installation_id_key;

-- Nuevo unique compuesto
CREATE UNIQUE INDEX chat_channels_installation_sub_type_key
  ON chat.channels (installation_id, sub_type)
  WHERE installation_id IS NOT NULL;

-- Migrar canales existentes: renombrar a "- Reportes" y crear pares "- Interno"
UPDATE chat.channels
SET sub_type = 'reportes', name = name || ' - Reportes'
WHERE channel_type = 'INSTALLATION' AND sub_type IS NULL;

-- Crear canales internos para cada instalacion existente
INSERT INTO chat.channels (id, tenant_id, channel_type, installation_id, sub_type, name, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  tenant_id,
  'INSTALLATION',
  installation_id,
  'interno',
  REPLACE(name, ' - Reportes', '') || ' - Interno',
  is_active,
  NOW(),
  NOW()
FROM chat.channels
WHERE channel_type = 'INSTALLATION' AND sub_type = 'reportes';
```

---

## 3. Nombres de canales

- Canal reportes: `"{Nombre Instalacion} - Reportes"`
- Canal interno: `"{Nombre Instalacion} - Interno"`

---

## 4. Creacion de canales

Cuando se activa una instalacion (`isActive = true`), se crean dos canales:

```typescript
// En /api/crm/installations/[id]/route.ts
await tx.chatChannel.createMany({
  data: [
    { tenantId, installationId: id, name: `${inst.name} - Reportes`, subType: "reportes" },
    { tenantId, installationId: id, name: `${inst.name} - Interno`, subType: "interno" },
  ],
});
```

La ruta `/api/chat/channels/provision` tambien crea ambos para instalaciones que no los tengan.

---

## 5. Control de acceso por subType

| Quien | Reportes | Interno |
|-------|----------|---------|
| Admins Gard (app principal) | Si | Si |
| Guardias (portal guardia) | Si | NO |
| Contactos cuenta (portal cliente) | Si | Si |

### Puntos de control:

- **Portal guardia** (`/api/portal/guardia/chat/channels`): filtrar `subType !== 'interno'`
- **Portal cliente** (`/api/portal/cliente/chat/channels`): mostrar ambos subTypes
- **App admin** (`/api/chat/channels`): mostrar ambos subTypes

---

## 6. Agrupacion en ChatChannelList (admin)

La seccion actual "Instalaciones" se divide en dos grupos:

- **"Instalaciones - Reportes"** — canales con `subType === "reportes"`
- **"Instalaciones - Interno"** — canales con `subType === "interno"`

Canales legacy con `subType === null` y `channelType === "INSTALLATION"` van en "Instalaciones - Reportes" como fallback.

---

## 7. Eliminacion de mensajes por admin

### 7.1 Borrar mensaje individual

Modificar `DELETE /api/chat/channels/[id]/messages/[messageId]`:

- **Actual:** Solo el remitente puede borrar su mensaje
- **Nuevo:** Si `ctx.userRole` es `owner` o `admin`, puede borrar cualquier mensaje del canal
- Soft-delete existente (`deletedAt`, `deletedBy`) se mantiene

### 7.2 Borrar todos los mensajes de un canal

Nuevo endpoint: `DELETE /api/chat/channels/[id]/messages` (sin messageId)

- Solo `owner` o `admin`
- Soft-delete masivo: actualiza todos los mensajes no-borrados del canal
- Evento Pusher `messages-cleared` para que los clientes conectados limpien la UI
- Respuesta: `{ success: true, deletedCount: N }`

### 7.3 UI

- **Mensaje individual:** En el menu contextual de cada mensaje, mostrar "Eliminar" si el usuario es owner/admin (ademas de si es el remitente)
- **Canal completo:** En el dropdown del canal (ChatChannelListItem o header de conversacion), agregar "Limpiar conversacion" solo para owner/admin. Con confirmacion modal.

---

## 8. Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Agregar `subType`, cambiar unique constraint |
| `src/app/api/crm/installations/[id]/route.ts` | Crear 2 canales al activar |
| `src/app/api/chat/channels/provision/route.ts` | Crear pares reportes+interno |
| `src/app/api/chat/channels/route.ts` | Incluir `subType` en response |
| `src/app/api/portal/guardia/chat/channels/route.ts` | Filtrar `subType != 'interno'` |
| `src/app/api/chat/channels/[id]/messages/[messageId]/route.ts` | Admin delete any message |
| `src/app/api/chat/channels/[id]/messages/route.ts` | Nuevo DELETE para limpiar canal |
| `src/components/chat/ChatChannelList.tsx` | Dos grupos de instalaciones |
| `src/components/chat/ChatConversation.tsx` (o similar) | Boton "Limpiar conversacion" |
| `src/lib/chat-types.ts` | Agregar subType al tipo Channel |
