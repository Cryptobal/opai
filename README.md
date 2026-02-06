# 📋 OPAI Suite - Gard Security

**Resumen:** Suite SaaS multi-tenant con UX single-tenant (Phase 1) en opai.gard.cl, Hub ejecutivo y módulo Docs operativos.

**Estado:** Vigente - Phase 1 completada (Hub + Docs + RBAC)

**Scope:** OPAI Suite

---

Suite SaaS accesible en `opai.gard.cl` con módulos especializados.

## 🎯 ¿Qué es?

**OPAI Suite** es una plataforma single-domain MONOREPO con multi-tenancy estructural y UX single-tenant (Phase 1) bajo `opai.gard.cl`:

- ✅ **Hub** - Centro de control ejecutivo con KPIs, apps launcher, work queue (owner/admin)
- ✅ **Docs** - Sistema de presentaciones comerciales con tracking completo
- ✅ **Admin** - Gestión de usuarios y permisos RBAC (owner/admin/editor/viewer)
- 🔜 **CRM** - Pipeline comercial y gestión de clientes (placeholder navegable)
- 🔜 **CPQ** - Configure, Price, Quote - Configurador de productos (placeholder)
- 🔜 **Ops** - Operaciones, turnos e incidentes
- 🔜 **Portal** - Portal de guardias y clientes

### Módulo Docs - Características principales

### Características principales

- ✅ **24 secciones estructuradas** - Desde hero hasta CTA final
- ✅ **Diseño premium** - Glassmorphism, animaciones, glow effects
- ✅ **Sistema de tokens dinámicos** - `[ACCOUNT_NAME]` → datos reales
- ✅ **PDF Generation con Playwright** - PDFs idénticos al preview web
- ✅ **Modo preview admin** - Sidebar navegación + toggle tokens
- ✅ **100% responsive** - Mobile-first design
- ✅ **Componentes reutilizables** - KPI Cards, Timelines, Pricing Tables

## 🚀 Instalación

```bash
# Clonar el repositorio
git clone git@github.com:Cryptobal/gard-docs.git
cd gard-docs

# Instalar dependencias
npm install

# Configurar variables de entorno
# Ver RECUPERACION-ENV.md para instrucciones completas
cp .env.example .env.local
# Completar .env.local con valores desde Vercel (ver .env.example para detalles)

# Instalar navegador Chromium para Playwright (253MB)
npx playwright install chromium

# Iniciar servidor de desarrollo
npm run dev
```

El proyecto estará disponible en `http://localhost:3000`

**⚠️ Nota:** La primera instalación descarga Chromium (253MB) para generación de PDFs.

## 🌐 Rutas principales

### Hub Ejecutivo (owner/admin)

**Centro de control:**
```
http://localhost:3000/hub
Producción: opai.gard.cl/hub
```

### Módulo Docs

**Dashboard (requiere login):**
```
http://localhost:3000/opai/inicio
Producción: opai.gard.cl/opai/inicio
```

**Login:**
```
http://localhost:3000/opai/login
Producción: opai.gard.cl/opai/login
```

**Gestión de usuarios (admin/owner):**
```
http://localhost:3000/opai/usuarios
Producción: opai.gard.cl/opai/usuarios
```

**Presentación pública (sin auth):**
```
http://localhost:3000/p/{uniqueId}
Producción: opai.gard.cl/p/{uniqueId}
```

### Placeholders Navegables

**CRM:**
```
http://localhost:3000/crm
Producción: opai.gard.cl/crm
```

**CPQ:**
```
http://localhost:3000/cpq
Producción: opai.gard.cl/cpq
```

## 🏗️ Stack

- **Framework:** Next.js 15 (App Router)
- **Arquitectura:** Single-domain MONOREPO con rutas por módulo
- **Dominio:** opai.gard.cl (alias: docs.gard.cl para /docs)
- **Lenguaje:** TypeScript 5.6
- **Estilos:** TailwindCSS 3.4 + shadcn/ui
- **Animaciones:** Framer Motion 12
- **PDF Generation:** Playwright + Chromium
- **Database:** Prisma + Neon PostgreSQL
- **Auth:** NextAuth v5 (Auth.js)
- **Multi-tenancy:** Implementado con `tenantId`

## 📖 Documentación

### Documentación de Producto
- **[Master Global OPAI Suite](docs/00-product/000-opai-suite-master.md)** - Visión completa de la suite
- **[Master Módulo Docs](docs/00-product/001-docs-master.md)** - Documento maestro del módulo Docs
- **[Playbook de Repositorios](docs/00-product/010-repo-playbook.md)** - Guía para crear/gestionar repos

### Documentación de Arquitectura
- **[Estructura MONOREPO](docs/01-architecture/monorepo-structure.md)** - Arquitectura, rutas, migración

### Otras Guías
Ver carpeta `docs/` para más documentación técnica y de negocio.

## 📊 Estado

**Arquitectura:** Single-domain MONOREPO con multi-tenancy estructural  
**Dominio:** opai.gard.cl  
**Phase:** 1 completada (UX single-tenant, estructura multi-tenant)  
**Estado:** ✅ Hub ejecutivo + Docs + RBAC operativos  
**Siguiente paso:** CRM y CPQ funcionales

### Phase 1 Completada
- ✅ Hub ejecutivo en `/hub` (owner/admin only)
- ✅ Docs operativo en `/opai/inicio`
- ✅ Gestión de usuarios RBAC en `/opai/usuarios`
- ✅ Vista pública `/p/[id]` sin auth
- ✅ Multi-tenancy estructural (tenant_id en todas las tablas)
- ✅ UX single-tenant (sin selector de tenant)
- ✅ Auth.js v5 + RBAC (owner/admin/editor/viewer)
- ✅ Placeholders navegables: CRM y CPQ
- ✅ Build exitoso en Vercel
- ✅ Documentación actualizada para Phase 1

## 👨‍💻 Equipo

- **Product Owner:** Carlos Irigoyen (Gard Security)
- **Development:** Implementado con Cursor AI

---

© 2026 Gard Security
