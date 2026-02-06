# 📚 Documentación OPAI Suite

**Resumen:** Índice completo de la documentación de OPAI Suite con Hub ejecutivo y módulo Docs operativos.

**Estado:** Vigente - Phase 1 completada (Hub + Docs activos)

**Scope:** OPAI Suite

---

Bienvenido a la documentación completa de **OPAI Suite**, la plataforma SaaS unificada para empresas de seguridad accesible en `opai.gard.cl`.

---

## 🎯 Documento Maestro

El punto de partida para entender el producto completo:

📄 **[OPAI Suite - Documento Maestro Global](./00-product/000-opai-suite-master.md)**
- Visión completa de OPAI Suite
- Arquitectura single-domain MONOREPO
- ✅ Phase 1: Multi-tenant estructural, UX single-tenant
- ✅ Hub ejecutivo implementado (/hub)
- ✅ Módulo Docs operativo (/opai/inicio)
- Dominio principal: opai.gard.cl

📄 **[OPAI Docs - Documento Maestro del Módulo](./00-product/001-docs-master.md)**
- Visión del módulo Docs (Proposals)
- Dashboard de propuestas y tracking
- Templates dinámicos con tokens
- Vista pública /p/[id] sin auth

📄 **[Repo Playbook](./00-product/010-repo-playbook.md)** (⚠️ Deprecated)
- Documento histórico de arquitectura multi-repo
- Referencia de estrategia original

---

## 🏗️ Arquitectura

Documentación técnica de la arquitectura del sistema:

### Componentes Principales

📄 **[Arquitectura General](./01-architecture/overview.md)**
- Stack tecnológico
- Componentes del sistema
- Estructura de directorios
- Tecnologías y bibliotecas
- Seguridad

📄 **[Autenticación](./01-architecture/auth.md)**
- Sistema Auth.js v5
- Flujo de login
- Protección de rutas
- Seguridad y JWT
- 🆕 **Sistema de invitación de usuarios**
- 🆕 **RBAC y gestión de roles**
- 🆕 **App Access Phase 1** (control de acceso a módulos por rol)

📄 **[Multi-Tenancy](./01-architecture/multitenancy.md)**
- Modelo SaaS
- Aislamiento de datos
- Filtrado por tenant
- Tenant switcher
- 🆕 **Gestión de usuarios multi-tenant**

### Architecture Decision Records (ADR)

📁 **[ADRs](./01-architecture/adr/)**
- Decisiones arquitectónicas documentadas
- Contexto y alternativas evaluadas
- Consecuencias y trade-offs

---

## 🔧 Implementación

Detalles de implementación, estado del proyecto y guías técnicas:

📄 **[Database Schema](./02-implementation/database-schema.md)**
- Esquema completo de base de datos
- Relaciones entre tablas
- Índices y constraints
- Migraciones aplicadas

📄 **[Estado del Proyecto](./02-implementation/estado-proyecto.md)**
- Estado actual de desarrollo
- Features implementados
- Próximos pasos
- Checklist de tareas

📄 **[Checklist Multi-Tenant](./02-implementation/checklist-multitenant.md)**
- Validación de implementación multi-tenant
- Estado en base de datos
- Validaciones pendientes
- Testing

📄 **🆕 [Sistema de Usuarios y Roles](./02-implementation/usuarios-roles.md)**
- Gestión de usuarios internos
- Invitación por email
- RBAC (Role-Based Access Control)
- Flujo completo de activación
- Dark mode design system

---

## 🔌 Integraciones

Documentación de integraciones con sistemas externos:

📄 **[Integración con Zoho CRM](./03-integrations/zoho-integration.md)**
- Configuración de webhooks
- Flujo de datos
- Mapping de campos
- Troubleshooting

📄 **[Tokens de Zoho](./03-integrations/tokens-zoho.md)**
- Sistema de tokens dinámicos
- Variables disponibles
- Implementación de reemplazo
- Ejemplos de uso

---

## 💼 Ventas y Comercial

Templates y guías para el equipo comercial:

📄 **[Presentación Comercial](./04-sales/presentacion-comercial.md)**
- Template comercial base
- Estructura de secciones
- Guía de contenido
- Mejores prácticas

---

## 📝 Changelog

📄 **[Changelog](./CHANGELOG.md)**
- Historial de cambios
- Versiones del sistema
- Nuevas features
- Bug fixes

---

## 🗂️ Estructura de Carpetas

```
docs/
├── README.md                          ← Este archivo
│
├── _deprecated/                       ← Archivos históricos (no usar)
│   └── README.md                      ← Índice de archivos deprecated
│
├── 00-product/                        ← Documentos maestros
│   ├── 000-opai-suite-master.md       ← Visión global OPAI Suite
│   ├── 001-docs-master.md             ← Master del módulo Docs
│   └── 010-repo-playbook.md           ← (Deprecated) Guía multi-repo
│
├── 01-architecture/                   ← Arquitectura técnica
│   ├── monorepo-structure.md          ← Arquitectura single-domain
│   ├── overview.md
│   ├── auth.md                        ← Auth.js v5 + RBAC
│   ├── multitenancy.md                ← Multi-tenancy + gestión usuarios
│   └── adr/                           ← Architecture Decision Records
│
├── 02-implementation/                 ← Implementación y desarrollo
│   ├── estado-proyecto.md             ← Estado actual completo
│   ├── database-schema.md
│   ├── checklist-multitenant.md
│   └── usuarios-roles.md              ← Sistema de usuarios y RBAC
│
├── 03-integrations/                   ← Integraciones externas
│   ├── zoho-integration.md
│   ├── tokens-zoho.md
│   └── CODIGO-DELUGE-COMPLETO.md
│
├── 04-sales/                          ← Ventas y comercial
│   └── presentacion-comercial.md
│
├── 05-pdf-generation/                 ← Generación de PDFs
│   └── playwright-pdf.md
│
├── CHANGELOG.md                       ← Historial de cambios
└── NORMALIZACION-COMPLETADA.md        ← Resumen de normalización
```

---

## 🚀 Inicio Rápido

### Para Desarrolladores

1. Lee el **[Documento Maestro](./00-product/001-gard-docs-master.md)** para entender el producto
2. Revisa la **[Arquitectura General](./01-architecture/overview.md)** para conocer el stack
3. Consulta el **[Database Schema](./02-implementation/database-schema.md)** para conocer el modelo de datos
4. Verifica el **[Estado del Proyecto](./02-implementation/estado-proyecto.md)** para saber qué está implementado
5. 🆕 **[Sistema de Usuarios](./02-implementation/usuarios-roles.md)** para gestión de accesos

### Para Product Managers

1. Comienza con el **[Documento Maestro](./00-product/001-gard-docs-master.md)**
2. Revisa el **[Estado del Proyecto](./02-implementation/estado-proyecto.md)**
3. Consulta el **[Changelog](./CHANGELOG.md)** para conocer las últimas actualizaciones

### Para Equipo Comercial

1. Lee la **[Presentación Comercial](./04-sales/presentacion-comercial.md)** para conocer el template base
2. Revisa la **[Integración con Zoho](./03-integrations/zoho-integration.md)** para entender el flujo de datos

---

## 📞 Contacto

Para dudas o actualizaciones de la documentación:

- **Email:** carlos.irigoyen@gard.cl
- **Proyecto:** opai.gard.cl/docs (alias: docs.gard.cl)
- **Organización:** Gard Security

---

## 🔄 Historial de Actualizaciones

### v2.1 - 06 de Febrero de 2026

**App Access Phase 1:**
- ✅ Control de acceso a módulos por rol (hardcodeado)
- ✅ Matriz de permisos en `src/lib/app-access.ts`
- ✅ Protección de rutas: `/hub`, `/crm`, `/cpq`
- ✅ Sidebar adaptativo según permisos
- ✅ Sin cambios en DB (implementación no invasiva)
- ✅ Preparado para migración a Phase 2 (DB-driven)

### v2.0 - 05 de Febrero de 2026

**Nuevas Funcionalidades:**
- ✅ Sistema de gestión de usuarios
- ✅ Invitación por email con tokens seguros
- ✅ RBAC (4 roles: owner, admin, editor, viewer)
- ✅ Cambio de roles inline desde tabla
- ✅ Auditoría completa de acciones
- ✅ Dark mode design system
- ✅ Documentación completa en `usuarios-roles.md`

### v1.0 - 05 de Febrero de 2026

**Reorganización Inicial:**
- ✅ Creada estructura de carpetas por categoría
- ✅ Descompuesto DOCUMENTO-MAESTRO-APLICACION.md en arquitectura
- ✅ Movidos documentos a ubicaciones lógicas
- ✅ Creados stubs de compatibilidad
- ✅ Creado índice general

---

## 📦 Archivos Deprecated

Los archivos stub que estaban en la raíz de `/docs` han sido movidos a:

📁 **[_deprecated/](./deprecated/)** - Archivos históricos con redirecciones

Estos archivos se mantienen solo para compatibilidad. **Usar siempre las ubicaciones actualizadas** en las carpetas organizadas.

---

**Última actualización:** 06 de Febrero de 2026  
**Versión de la documentación:** 2.1 (App Access Phase 1 + Organización mejorada)
