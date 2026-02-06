# OPAI Docs (Proposals) — Documento Maestro del Módulo

**Resumen:** Módulo de propuestas y presentaciones comerciales dinámicas dentro de OPAI Suite, accesible en opai.gard.cl/docs.

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
Módulo: /docs
Rutas: /docs/inicio, /docs/login, /docs/p/[id]
```

### Dominio Legacy (Alias)
```
Dominio: docs.gard.cl (compatibilidad temporal)
Comportamiento: funciona como alias de opai.gard.cl/docs
```

### Arquitectura
- **Repositorio único** con todos los módulos de OPAI
- **Módulo Docs** es el único actualmente implementado y funcional
- **Rutas públicas** para clientes: `opai.gard.cl/docs/p/{uniqueId}`
- **Rutas privadas** para admin: `/docs/inicio`, `/docs/usuarios`, `/docs/templates/*`

---

## Rutas
### Privadas (requieren login)
- `/docs/inicio` → Dashboard principal
- `/docs/templates/*` → Gestión de templates
- `/docs/preview/*` → Preview de borradores desde Zoho
- `/docs/usuarios` → Gestión de usuarios (admin/owner)

### Públicas
- `/docs/p/{uniqueId}` → Vista pública de presentación (sin login, con tracking)
- `/docs/login` → Página de autenticación
- `/docs/activate` → Activación de invitaciones

### API Routes
- `/docs/api/auth/*` → NextAuth endpoints
- `/docs/api/presentations` → CRUD de presentaciones
- `/docs/api/webhook/zoho` → Ingesta de datos Zoho
- `/docs/api/pdf/*` → Generación de PDFs

---

## Autenticación
- Auth.js v5 (NextAuth v5)
- Provider: Credentials (email/password)
- Usuarios almacenados en BD
- Soporta **multi-tenant**
- Tenant activo presente en sesión

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
- ✅ Auth: implementado (NextAuth v5)
- ✅ Multi-tenant: implementado
- ✅ Tracking: operativo
- ✅ MONOREPO: migración fase 1 completada
- ⏳ Documentación: actualizada para MONOREPO

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