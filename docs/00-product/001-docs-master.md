# OPAI Docs (Proposals) — Documento Maestro del Módulo

**Resumen:** Módulo de propuestas comerciales dinámicas con tracking, accesible en opai.gard.cl/opai/inicio.

**Estado:** Vigente - Implementado y operativo

**Scope:** OPAI Docs

---

> **Nota:** Este documento describe el módulo Docs dentro de la arquitectura MONOREPO single-domain de OPAI Suite. Para la visión global de la suite, ver: [000-opai-suite-master.md](./000-opai-suite-master.md)

## Rol dentro de OPAI
Este módulo corresponde a **Proposals / Docs** de la suite OPAI.
Su responsabilidad es:
- Crear y gestionar templates de propuestas
- Generar presentaciones desde templates + tokens
- Enviar propuestas por email
- Trackear visualizaciones
- Exponer vistas públicas vía `/docs/p/{uniqueId}`

No contiene CRM ni Operaciones. Consume datos desde integraciones o, en el futuro, desde OPAI CRM.

---

## Arquitectura Single-Domain MONOREPO

### Dominio Principal
```
Dominio: opai.gard.cl
Rutas principales:
  - /hub              → Centro de control ejecutivo (owner/admin)
  - /opai/inicio      → Dashboard de propuestas (Docs)
  - /opai/usuarios    → Gestión de usuarios
  - /p/[uniqueId]     → Vista pública de presentaciones
```

### Dominio Legacy (Alias)
```
Dominio: docs.gard.cl (compatibilidad temporal)
Comportamiento: alias de opai.gard.cl/opai/*
```

### Arquitectura
- **Repositorio único** con todos los módulos de OPAI
- **Módulo Docs** es el único actualmente implementado y funcional
- **Rutas públicas** para clientes: `opai.gard.cl/docs/p/{uniqueId}`
- **Rutas privadas** para admin: `/docs/inicio`, `/docs/usuarios`, `/docs/templates/*`

---

## Rutas
### Hub (Centro de Control)
- `/hub` → Dashboard ejecutivo con KPIs, apps launcher, work queue (owner/admin only)

### Docs - Privadas (requieren login)
- `/opai/inicio` → Dashboard principal de propuestas
- `/opai/templates` → Gestión de templates
- `/opai/usuarios` → Gestión de usuarios y permisos RBAC (admin/owner)
- `/preview/*` → Preview de borradores desde Zoho

### Públicas
- `/p/{uniqueId}` → Vista pública de presentación (sin login, con tracking)
- `/opai/login` → Página de autenticación
- `/activate` → Activación de invitaciones

### API Routes
- `/api/auth/*` → NextAuth endpoints (global)
- `/api/presentations` → CRUD de presentaciones
- `/api/webhook/zoho` → Ingesta de datos Zoho
- `/api/pdf/*` → Generación de PDFs

---

## Autenticación
- Auth.js v5 (NextAuth v5)
- Provider: Credentials (email/password)
- Usuarios almacenados en BD
- Soporta **multi-tenant**
- Tenant activo presente en sesión

---

## Autorización

### App Access Control (Phase 1)
**Estado:** ✅ Implementado (Febrero 2026)

Control de acceso al módulo Docs por rol:

**Roles que pueden acceder a Docs:**
- `owner` → Acceso completo
- `admin` → Acceso completo
- `editor` → Acceso completo
- `viewer` → Solo lectura (visualización de propuestas)

**Implementación:**
- Sistema hardcodeado en código (`src/lib/app-access.ts`)
- NO requiere DB ni migraciones (esto es Phase 2)
- Protección en rutas: `/opai/inicio`, `/opai/templates`
- UI adaptativa: sidebar muestra solo módulos permitidos

**Nota:** El módulo Docs usa el sistema de App Access centralizado de OPAI Suite. Para detalles completos del modelo de permisos, ver: [000-opai-suite-master.md](./000-opai-suite-master.md#52-app-access-phase-1---hardcodeado)

---

## Multi-Tenancy
- Todas las entidades internas pertenecen a un tenant
- tenantId es obligatorio en:
  - Template
  - Presentation
  - WebhookSession
  - AuditLog
- Actualmente existe tenant inicial: `gard`

---

## Módulos
- Templates
- Presentations
- Sending & Tracking
- Public Viewer (/p)
- Audit & Logs

---

## Integraciones
- Ingest genérico por webhook (legacy Zoho soportado)
- CRM OPAI será la fuente principal futura

---

## Estado actual
- ✅ Auth: implementado (NextAuth v5 + RBAC)
- ✅ Multi-tenant: estructural completo, UX single-tenant (Phase 1)
- ✅ Tracking: operativo con métricas completas
- ✅ Hub ejecutivo: implementado (owner/admin)
- ✅ MONOREPO: fase 1 completada
- ✅ Documentación: actualizada para Phase 1

---

## Cambios en Migración MONOREPO

### Estructura de Código
```
src/app/
├── (platform)/          # Layout raíz OPAI
├── docs/                # ← Módulo Docs (todo el código actual)
│   ├── inicio/
│   ├── login/
│   ├── templates/
│   ├── p/
│   ├── api/
│   └── ...
├── hub/                 # Placeholder
└── crm/                 # Placeholder
```

### URLs del Módulo
Todas las rutas operan bajo el prefijo `/docs`:
- Dashboard: `opai.gard.cl/docs/inicio`
- Login: `opai.gard.cl/docs/login`
- Presentaciones públicas: `opai.gard.cl/docs/p/{uniqueId}`
- APIs: `opai.gard.cl/docs/api/*`
- Gestión de usuarios: `opai.gard.cl/docs/usuarios`

### Variables de Entorno
```env
APP_URL=https://opai.gard.cl
AUTH_COOKIE_DOMAIN=.gard.cl
AUTH_SECRET=<secret>
DATABASE_URL=<neon-postgresql-url>
RESEND_API_KEY=<resend-key>
```

---

## Roadmap inmediato
1) ✅ Migrar a estructura MONOREPO
2) ⏳ Testing exhaustivo de rutas y funcionalidad
3) ⏳ Deploy a producción con nuevo dominio
4) 🔜 Implementar Hub (launcher de apps)
5) 🔜 Iniciar desarrollo de CRM

---

## Referencias
- [Arquitectura MONOREPO](../01-architecture/monorepo-structure.md)
- [Master Global OPAI](./000-opai-suite-master.md)
- [Playbook de Repositorios](./010-repo-playbook.md)