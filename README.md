# 📋 Gard Docs

Sistema de presentaciones comerciales inteligente tipo Qwilr para Gard Security.

## 🎯 ¿Qué es?

**Gard Docs** transforma datos de Zoho CRM en presentaciones comerciales visualmente impactantes con diseño tipo Qwilr (scroll vertical continuo), personalización automática vía tokens y trazabilidad completa.

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

# Instalar navegador Chromium para Playwright (253MB)
npx playwright install chromium

# Iniciar servidor de desarrollo
npm run dev
```

El proyecto estará disponible en `http://localhost:3000`

**⚠️ Nota:** La primera instalación descarga Chromium (253MB) para generación de PDFs.

## 🌐 Rutas principales

**Presentación pública (cliente):**
```
http://localhost:3000/p/demo-polpaico-2026-02
```

**Preview admin (edición):**
```
http://localhost:3000/templates/commercial/preview?admin=true
```

**Preview formato PDF propuesta:**
```
http://localhost:3000/templates/pricing-format?admin=true
```

## 🏗️ Stack

- **Framework:** Next.js 15 (App Router)
- **Lenguaje:** TypeScript 5.6
- **Estilos:** TailwindCSS 3.4 + shadcn/ui
- **Animaciones:** Framer Motion 11
- **PDF Generation:** Playwright + Chromium
- **Backend:** Prisma + Neon PostgreSQL (pendiente)

## 📖 Documentación completa

Ver **[docs/ESTADO-PROYECTO.md](docs/ESTADO-PROYECTO.md)** para:
- Estado actual detallado
- Componentes implementados
- Tokens dinámicos
- Próximos pasos

Ver **[docs/DOCUMENTO-MAESTRO-APLICACION.md](docs/DOCUMENTO-MAESTRO-APLICACION.md)** para:
- Especificación técnica completa
- Arquitectura del sistema
- Roadmap de implementación

Ver **[docs/PRESENTACION-COMERCIAL-BASE.md](docs/PRESENTACION-COMERCIAL-BASE.md)** para:
- Contenido de las 29 secciones
- Principios de conversión
- Variables dinámicas

Ver **[docs/ZOHO-INTEGRATION.md](docs/ZOHO-INTEGRATION.md)** para:
- Código Deluge de Zoho CRM
- Configuración del webhook
- Testing y troubleshooting

## 📊 Estado

**Versión:** 0.3.0  
**Estado:** ✅ MVP Visual + PDF Generation 100% completo  
**Último commit:** ffcb3a7  
**Siguiente paso:** Backend + Persistencia

## 👨‍💻 Equipo

- **Product Owner:** Carlos Irigoyen (Gard Security)
- **Development:** Implementado con Cursor AI

---

© 2026 Gard Security
