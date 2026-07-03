# TICKETS · Fase 11 — Stop file (decisiones humanas pendientes)

## B2.4 — Auditoría de membresías del Propietario (Carlos en equipo Finanzas)

**Hallazgo (sin tocar datos):** `getAssignedTeamsForUser` (`src/lib/tickets-team-membership.ts`)
deriva los equipos **exclusivamente** de `AdminGroupMembership`:

- `AdminGroupMembership.adminId = <Carlos>` → `AdminGroup.slug`
- luego `assignedTeam` = match directo con el slug **o** vía `TICKET_TEAM_TO_GROUP_SLUG`.

**No existe ninguna regla de diseño "el Propietario hereda todos los equipos"** en esta
función ni en el flujo de tickets. Es decir: si Carlos aparece en el equipo **Finanzas** es
porque su `Admin` es **miembro explícito** del `AdminGroup` de Finanzas (o de un grupo cuyo
slug mapea a `finanzas`). El rol `propietario` sí mantiene *acceso/permiso* total
(`permissions-server.ts:67`), pero eso es visibilidad de permisos, **no** membresía de equipo
para el ruteo de tickets.

**Decisión para Carlos:**
- Si la membresía es intencional (quiere ver/tomar tickets de Finanzas), no hay nada que hacer;
  la bandeja ya lo refleja correctamente.
- Si es dato erróneo (no debería estar en Finanzas), quitar la membresía en
  Configuración → Grupos/Equipos → Finanzas → Miembros. **No** se modificó ningún dato aquí.

_(Placeholder de subtítulo "vía equipo Finanzas": no se agregó al modal porque la pertenencia
NO es herencia de Propietario sino membresía real; mostrar "vía equipo X" sería engañoso. Si
Carlos confirma que quiere ese rótulo informativo por fila, se agrega en un pase siguiente.)_
