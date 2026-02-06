# 📋 OPAI Suite - Gard Security

**Resumen:** Suite SaaS unificada con arquitectura single-domain MONOREPO para gestión integral de empresas de seguridad.

**Estado:** Vigente - Módulo Docs operativo, otros módulos en desarrollo

**Scope:** OPAI Suite

---

Suite SaaS accesible en `opai.gard.cl` con módulos especializados.

## 🎯 ¿Qué es?

**OPAI Suite** es una plataforma single-domain MONOREPO que unifica múltiples módulos bajo `opai.gard.cl`. Actualmente implementa:

- ✅ **Docs** - Sistema de presentaciones comerciales (anteriormente Gard Docs)
- 🔜 **Hub** - App switcher y dashboard central
- 🔜 **CRM** - Pipeline comercial y gestión de clientes
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

### Módulo Docs

**Dashboard (requiere login):**
```
http://localhost:3000/docs/inicio
Producción: opai.gard.cl/docs/inicio
```

**Login:**
```
http://localhost:3000/docs/login
Producción: opai.gard.cl/docs/login
```

**Presentación pública (cliente):**
```
http://localhost:3000/docs/p/{uniqueId}
Producción: opai.gard.cl/docs/p/{uniqueId}
```

**Preview admin (edición):**
```
http://localhost:3000/docs/templates/commercial/preview?admin=true
```

### Placeholders

**Hub:**
```
http://localhost:3000/hub
```

**CRM:**
```
http://localhost:3000/crm
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

**Arquitectura:** Single-domain MONOREPO  
**Dominio:** opai.gard.cl (principal) + docs.gard.cl (alias legacy)  
**Estado:** ✅ Módulo Docs completamente funcional  
**Siguiente paso:** Implementar Hub y CRM

### Implementación MONOREPO Single-Domain
- ✅ Estructura creada (`/docs`, `/hub`, `/crm`)
- ✅ Dominio principal: opai.gard.cl
- ✅ Dominio legacy: docs.gard.cl (alias)
- ✅ Rutas bajo `/docs/*` funcionando
- ✅ Auth.js v5 + multi-tenancy operativo
- ✅ APIs actualizadas y funcionando
- ✅ Build exitoso en Vercel
- ✅ Documentación normalizada

## 👨‍💻 Equipo

- **Product Owner:** Carlos Irigoyen (Gard Security)
- **Development:** Implementado con Cursor AI

---

© 2026 Gard Security
