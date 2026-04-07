# Chat: Canales Externos (Prospectos/Clientes), Archivado y Permisos

**Fecha:** 2026-03-05
**Estado:** Aprobado — listo para implementación

---

## Contexto

El sistema de chat actual soporta tres tipos de canal: DIRECT (DMs entre admins), GROUP (grupos internos), e INSTALLATION (por instalación). Se necesita:

1. **Canales externos** — conversaciones con CrmContacts (clientes y prospectos) desde el panel de OPAI y desde fichas del CRM
2. **Archivado por usuario** — modelo tipo Slack: cada usuario puede archivar conversaciones independientemente; solo owner/admin puede eliminar permanentemente
3. **Secciones nuevas en el panel** — "Prospectos" y "Clientes" que se actualizan automáticamente según `CrmAccount.status`

---

## Decisiones de diseño

- **Opción elegida: EXTERNAL + tabla de participantes**
  - El tipo `EXTERNAL` se añade al enum `ChatChannelType`
  - La sección (Prospectos vs Clientes) se deriva dinámicamente de `CrmAccount.status`, no del tipo del canal → si un prospecto se convierte en cliente, el chat migra de sección automáticamente sin intervención
  - Una tabla `ChatChannelParticipant` unifica participantes ADMIN y CONTACT, soportando grupos mixtos
- **Participante externo siempre es un CrmContact** con `portalEnabled = true`; desactivar el portal desactiva el acceso al chat
- **Archivado personal** (como Slack): `ChatChannelArchive(channelId, adminId)` — otros participantes no se ven afectados

---

## Sección 1: Modelo de datos (Schema Prisma)

### Cambios en `ChatChannel`
```prisma
model ChatChannel {
  // ... campos existentes ...
  accountId     String?        // → CrmAccount (solo para EXTERNAL)
  participants  ChatChannelParticipant[]
  archives      ChatChannelArchive[]
}
```

### Nuevo enum value
```prisma
enum ChatChannelType {
  INSTALLATION
  GROUP
  DIRECT
  EXTERNAL    // chats con CrmContacts (clientes/prospectos)
}
```

### Nueva tabla: `ChatChannelParticipant`
```prisma
model ChatChannelParticipant {
  id              String      @id @default(uuid())
  channelId       String
  participantType String      // "ADMIN" | "CONTACT"
  participantId   String      // adminId o contactId según tipo
  joinedAt        DateTime    @default(now())
  channel         ChatChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([channelId, participantType, participantId])
  @@index([channelId])
  @@index([participantType, participantId])
}
```

### Nueva tabla: `ChatChannelArchive`
```prisma
model ChatChannelArchive {
  id         String      @id @default(uuid())
  channelId  String
  adminId    String
  archivedAt DateTime    @default(now())
  channel    ChatChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([channelId, adminId])
  @@index([adminId])
}
```

---

## Sección 2: API layer

### Endpoints nuevos

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/api/chat/external` | `POST` | Crear canal EXTERNAL (1:1 o grupo mixto). Body: `{ accountId, contactIds[], adminIds[], name? }`. Idempotente: retorna canal existente si los participantes coinciden exactamente |
| `/api/chat/channels/[id]/archive` | `POST` | Archivar canal para el usuario actual |
| `/api/chat/channels/[id]/archive` | `DELETE` | Desarchivar |
| `/api/chat/channels/[id]` | `DELETE` | Eliminar canal permanentemente (solo admin/owner). Borra en cascada mensajes y participantes |
| `/api/chat/channels/[id]/participants` | `POST` | Agregar participante a canal EXTERNAL. Body: `{ participantType, participantId }` |
| `/api/chat/channels/[id]/participants/[pid]` | `DELETE` | Remover participante (solo admin/owner) |
| `/api/chat/archived` | `GET` | Listar canales archivados del usuario actual |
| `/api/crm/contacts/[id]/chat` | `POST` | Iniciar chat desde ficha CRM. Crea o retorna canal EXTERNAL existente con ese contacto |

### Cambios en endpoints existentes

- `GET /api/chat/channels`
  - Nuevo filtro: `?type=EXTERNAL`
  - Excluye por defecto canales archivados por el usuario actual (a menos que `?archived=true`)
  - Incluye `isArchivedByMe: boolean` en cada canal de la respuesta
  - Para canales EXTERNAL: incluye `account: { id, name, status }` para derivar la sección en frontend

### Lógica de auto-creación (portal/cotización)
El endpoint de cotización llama internamente a `POST /api/chat/external` al enviarse una propuesta, con `contactId` del destinatario + `adminId` del remitente.

---

## Sección 3: UI — Panel de chat

### Nueva estructura de secciones
```
Chat
├── 🔍 Buscador
├── [Todos] [No leídos]
├── 💬 Directos           (existente — DMs admin-admin)
├── 👥 Grupos             (existente)
├── 🏢 Instalaciones      (existente)
├── 🌱 Prospectos         (NUEVO — EXTERNAL donde account.status='prospect')
├── 🤝 Clientes           (NUEVO — EXTERNAL donde account.status='client_active')
└── 📦 Archivados         (NUEVO — colapsado por defecto, al fondo)
```

### Menú "..." por canal (hover en desktop, long-press en mobile)
- Todos los canales: `Archivar conversación`
- Canales archivados: `Desarchivar`
- Solo admin/owner: `Eliminar permanentemente` (con diálogo de confirmación)
- INSTALLATION y GROUP: solo `Archivar` (no eliminar, son auto-provisionados)

### Flujo "Nuevo chat externo" desde el panel
Botón `+` en el header de secciones Prospectos / Clientes:
1. Modal: buscar CrmAccount por nombre
2. Muestra CrmContacts con `portalEnabled=true`
3. Seleccionar 1+ contactos + opcionalmente agregar admins de Garbo
4. `Crear chat` → llama a `POST /api/chat/external`
5. Si ya existe canal con esos participantes → abre el existente directamente

### Integración en fichas CRM
- Botón `💬 Chat` en página de CrmAccount y CrmContact
- Si `portalEnabled = false` → botón disabled con tooltip "El contacto no tiene portal activo"
- Click → `POST /api/crm/contacts/[id]/chat` → abre panel con el canal

### Header de conversación EXTERNAL
Muestra: `[nombre del contacto] · [nombre de la cuenta]`
Si archivado: banner sutil "Conversación archivada — Desarchivar"

---

## Sección 4: Permisos

| Acción | Usuario regular | Admin | Owner |
|--------|:--------------:|:-----:|:-----:|
| Archivar canal (personal) | ✅ | ✅ | ✅ |
| Desarchivar canal (personal) | ✅ | ✅ | ✅ |
| Eliminar canal permanentemente | ❌ | ✅ | ✅ |
| Crear chat EXTERNAL | ✅ | ✅ | ✅ |
| Agregar participantes (canales donde participa) | ✅ | ✅ | ✅ |
| Remover participantes | ❌ | ✅ | ✅ |
| Activar/desactivar portal de contacto | ❌ | ✅ | ✅ |

Implementación: `requireAuth()` existente + check `session.user.role` en endpoints sensibles. Frontend oculta opciones no disponibles por rol.

---

## Archivos clave a modificar

| Archivo | Tipo de cambio |
|---------|---------------|
| `prisma/schema.prisma` | Añadir `EXTERNAL` al enum, `accountId` a `ChatChannel`, nuevos modelos `ChatChannelParticipant` y `ChatChannelArchive` |
| `src/app/api/chat/external/route.ts` | Nuevo endpoint |
| `src/app/api/chat/channels/[id]/archive/route.ts` | Nuevo endpoint (POST + DELETE) |
| `src/app/api/chat/channels/[id]/route.ts` | Añadir DELETE handler con check de permisos |
| `src/app/api/chat/channels/[id]/participants/route.ts` | Nuevo endpoint |
| `src/app/api/chat/channels/route.ts` | Actualizar GET para filtrar archivados, incluir `isArchivedByMe`, soportar `type=EXTERNAL` |
| `src/app/api/chat/archived/route.ts` | Nuevo endpoint |
| `src/app/api/crm/contacts/[id]/chat/route.ts` | Nuevo endpoint |
| `src/components/chat/ChatFloatingPanel.tsx` | Nuevas secciones Prospectos/Clientes/Archivados, menú "..." |
| `src/components/chat/ChatFloatingProvider.tsx` | Actualizar tipos y context para soportar EXTERNAL + archivado |
| `src/components/crm/AccountDetail.tsx` (o equivalente) | Botón "💬 Chat" en ficha de cuenta |
| `src/components/crm/ContactDetail.tsx` (o equivalente) | Botón "💬 Chat" en ficha de contacto |

---

## Verificación

1. Crear canal EXTERNAL desde el panel → aparece en sección Prospectos o Clientes según status de la cuenta
2. Convertir cuenta de prospect a client_active en CRM → el canal migra de sección Prospectos a Clientes automáticamente
3. Archivar un DM → desaparece de la lista del usuario; el otro participante lo sigue viendo normal
4. Ir a sección Archivados → canal visible; al abrirlo aparece banner y opción de desarchivar
5. Admin elimina canal → desaparece para todos los participantes; confirmación requerida
6. Usuario regular no ve opción "Eliminar permanentemente" en el menú "..."
7. Botón "💬 Chat" en ficha CRM → abre panel con canal correcto (crea si no existe)
8. Contacto con `portalEnabled=false` → botón disabled con tooltip correcto
