# Arquitectura MONOREPO Single-Domain - OPAI Suite

**Resumen:** Arquitectura completa del MONOREPO single-domain de OPAI Suite con módulos bajo opai.gard.cl.

**Estado:** Vigente - Fase 1 completada y operativa

**Scope:** OPAI Suite - Arquitectura

---

## 1. Visión General

OPAI Suite utiliza una **arquitectura MONOREPO single-domain** donde todos los módulos conviven en un único repositorio y se acceden bajo un dominio principal.

### Estado Actual
- **Fecha implementación:** Febrero 2026
- **Estado:** ✅ Fase 1 completada y operativa
- **Dominio principal:** `opai.gard.cl`
- **Dominio legacy:** `docs.gard.cl` (alias temporal)

## 2. ¿Por qué MONOREPO?

### Ventajas
1. **Simplificación operativa**
   - Un único repositorio para mantener
   - Un único deploy pipeline
   - Versionado unificado

2. **Compartir código fácilmente**
   - Componentes reutilizables entre módulos
   - Tipos compartidos
   - Utilidades comunes

3. **Refactoring más seguro**
   - Cambios atómicos en múltiples módulos
   - Type checking cross-module

4. **Onboarding más rápido**
   - Un solo repo para clonar
   - Setup unificado

### Desventajas Mitigadas
- **Tamaño del repo:** Next.js maneja bien apps grandes con App Router
- **Build times:** Cada módulo puede tener su propia build config
- **Permisos:** RBAC maneja acceso por módulo

## 3. Estructura de Rutas

### Dominio Principal
```
https://opai.gard.cl
```

**Dominio Legacy:** `docs.gard.cl` funciona como alias de `opai.gard.cl/docs` para compatibilidad temporal.

### Módulos por Ruta
```
/docs     → Presentaciones comerciales y propuestas (✅ IMPLEMENTADO Y OPERATIVO)
/hub      → App switcher y dashboard central (🔜 PLACEHOLDER)
/crm      → CRM y pipeline de ventas (🔜 PLACEHOLDER)
/ops      → Operaciones y turnos (❌ NO IMPLEMENTADO)
/portal   → Portal de guardias y clientes (❌ NO IMPLEMENTADO)
/admin    → Administración de tenants (❌ NO IMPLEMENTADO)
```

## 4. Estructura de Código

### Directorio Principal
```
src/app/
├── (platform)/          # Layout raíz de OPAI
│   ├── layout.tsx       # Layout global (HTML, body, estilos)
│   └── page.tsx         # Redirect a /docs
│
├── docs/                # Módulo Docs (IMPLEMENTADO)
│   ├── layout.tsx       # Layout específico de Docs
│   ├── page.tsx         # Página principal de Docs
│   ├── inicio/          # Dashboard
│   ├── login/           # Autenticación
│   ├── templates/       # Templates de presentaciones
│   ├── preview/         # Preview de borradores
│   ├── p/               # Presentaciones públicas
│   ├── usuarios/        # Gestión de usuarios
│   └── api/             # API routes de Docs
│       ├── auth/
│       ├── presentations/
│       ├── templates/
│       └── webhook/
│
├── hub/                 # Módulo Hub (PLACEHOLDER)
│   └── page.tsx         # Placeholder con mensaje
│
└── crm/                 # Módulo CRM (PLACEHOLDER)
    └── page.tsx         # Placeholder con mensaje
```

### Componentes Compartidos
```
src/components/
├── ui/                  # Componentes UI base (shadcn)
├── layout/              # Layouts compartidos
├── admin/               # Componentes admin (específicos de Docs por ahora)
├── presentation/        # Componentes de presentaciones
└── preview/             # Componentes de preview
```

### Librerías Compartidas
```
src/lib/
├── auth.ts              # Auth.js configuración
├── prisma.ts            # Cliente Prisma
├── rbac.ts              # Sistema de roles y permisos
├── tenant.ts            # Multi-tenancy helpers
├── utils.ts             # Utilidades generales
└── tokens.ts            # Sistema de tokens para templates
```

## 5. Rutas y URLs

### URLs Públicas
Las presentaciones públicas para clientes utilizan:
```
https://opai.gard.cl/docs/p/{uniqueId}
```

También funcionan bajo el alias legacy:
```
https://docs.gard.cl/p/{uniqueId}
```

Ejemplo real:
```
https://opai.gard.cl/docs/p/xyz123abc456
```

### URLs de Admin
Todas las rutas protegidas requieren autenticación:
```
opai.gard.cl/docs/inicio           # Dashboard principal
opai.gard.cl/docs/templates/...    # Gestión de templates
opai.gard.cl/docs/usuarios         # Gestión de usuarios
opai.gard.cl/docs/login            # Página de login
```

### API Routes
Todas las API routes están bajo el módulo correspondiente:
```
/docs/api/presentations
/docs/api/auth/[...nextauth]
/docs/api/webhook/zoho
```

## 6. Autenticación y Sesiones

### NextAuth v5 (Auth.js)
- **Provider:** Credentials con bcrypt
- **Strategy:** JWT
- **Session:** 30 días
- **Cookie domain:** Configurable vía `AUTH_COOKIE_DOMAIN`

### Dominios
El sistema opera bajo un dominio principal con un alias temporal:
- `opai.gard.cl` (dominio principal de la plataforma)
- `docs.gard.cl` (alias/legacy del módulo /docs para compatibilidad)

### Middleware
El middleware protege rutas por módulo:
```typescript
// Rutas públicas
/docs/p/*              → Presentaciones públicas
/docs/login            → Login
/docs/api/auth/*       → Auth endpoints
/docs/api/webhook/*    → Webhooks externos

// Rutas protegidas
/docs/inicio           → Requiere sesión
/docs/usuarios         → Requiere rol admin/owner
```

## 7. Base de Datos

### Schema Multi-tenant
Todas las tablas incluyen `tenantId`:
```sql
CREATE TABLE presentations (
  id UUID PRIMARY KEY,
  tenantId UUID NOT NULL REFERENCES tenants(id),
  uniqueId VARCHAR(12) UNIQUE NOT NULL,
  ...
);
```

### Schemas por Dominio
```
auth          → Usuarios, sesiones, invitaciones
docs          → Presentaciones, templates, tracking
core          → Tenants, configuración
integrations  → Webhooks, eventos
audit         → Logs, auditoría
```

## 8. Variables de Entorno

### Configuración MONOREPO
```env
# Dominio base de la plataforma
APP_URL=https://opai.gard.cl

# Auth
AUTH_SECRET=...
AUTH_COOKIE_DOMAIN=.gard.cl

# Database
DATABASE_URL=postgresql://...

# Email
RESEND_API_KEY=...

# Integraciones
ZOHO_WEBHOOK_TOKEN=...
```

## 9. Estado de Implementación

### ✅ Completado (Fase 1)
- Estructura de carpetas MONOREPO creada  
- Módulo Docs migrado a `/docs` y completamente funcional
- Placeholders para `/hub` y `/crm` creados  
- Middleware configurado para protección de rutas
- Componentes actualizados con rutas correctas  
- API routes operando bajo `/docs/api/*`  
- URLs públicas funcionando en `/docs/p/*`
- Auth.js v5 implementado con multi-tenancy
- Sistema de usuarios y RBAC operativo

### Compatibilidad
Se mantiene compatibilidad con:
- `docs.gard.cl` funcionando como alias de `opai.gard.cl/docs`
- Variables de entorno con valores por defecto
- Rutas relativas en componentes internos

## 10. Próximos Pasos

### Fase 2: Hub y CRM Base
- [ ] Implementar Hub con app switcher
- [ ] Crear CRM mínimo
- [ ] Unificar autenticación cross-módulo

### Fase 3: Deploy y DNS
- [ ] Configurar DNS para `opai.gard.cl`
- [ ] Actualizar certificados SSL
- [ ] Configurar redirects de `docs.gard.cl`

### Fase 4: Limpieza
- [ ] Eliminar rutas de compatibilidad
- [ ] Consolidar componentes compartidos
- [ ] Optimizar bundle size

## 11. Convenciones de Desarrollo

### Agregar un Nuevo Módulo
1. Crear carpeta `src/app/{module}/`
2. Agregar `layout.tsx` y `page.tsx`
3. Crear API routes bajo `{module}/api/`
4. Actualizar middleware con rutas públicas/protegidas
5. Documentar en este archivo

### Compartir Código entre Módulos
- Componentes UI → `src/components/ui/`
- Utilidades → `src/lib/`
- Types → `src/types/`
- Emails → `src/emails/`

### Testing
```bash
# Dev local
npm run dev

# Build
npm run build

# Lint
npm run lint
```

## 12. Referencias

- [Next.js App Router](https://nextjs.org/docs/app)
- [Auth.js v5](https://authjs.dev/)
- [Prisma Multi-tenant](https://www.prisma.io/docs/guides/database/multi-tenant)
- [Documento Maestro OPAI](../00-product/000-opai-suite-master.md)
- [Master Docs](../00-product/001-docs-master.md)
