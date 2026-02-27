# Checklist de Testing Mobile - OPAI

> **Fecha de creacion:** 2026-02-27
> **Version:** 1.0
> **Objetivo:** Validar que todas las correcciones de UX mobile funcionan correctamente en dispositivos reales y emuladores.

---

## Instrucciones

1. Abrir la aplicacion en el dispositivo/navegador indicado
2. Marcar cada item con `[x]` cuando pase la prueba
3. Si un item falla, anotar el problema debajo del item con `> BUG: descripcion`
4. Ejecutar `mobile_audit.js` en la consola del navegador para validacion automatizada (ver instrucciones al final)

---

## Seccion A: Zoom (probar en Safari iOS)

### A.1 Hub / Inicio (`/opai/inicio`)
- [ ] Tocar cada input de busqueda - NO debe hacer zoom
- [ ] Tocar la barra de busqueda del command palette - NO debe hacer zoom
- [ ] Abrir y cerrar modales - pantalla vuelve a tamano normal

### A.2 CRM - Cuentas (`/crm/accounts`)
- [ ] Tocar inputs de busqueda/filtros - NO debe hacer zoom
- [ ] Tocar selects de filtro - NO debe hacer zoom
- [ ] Abrir detalle de cuenta - inputs de notas NO hacen zoom
- [ ] Tocar textarea de notas - NO debe hacer zoom

### A.3 CRM - Contactos (`/crm/contacts`)
- [ ] Tocar inputs de busqueda - NO debe hacer zoom
- [ ] Abrir detalle de contacto - inputs NO hacen zoom
- [ ] Interactuar con selects custom - NO debe hacer zoom

### A.4 CRM - Deals (`/crm/deals`)
- [ ] Tocar inputs de busqueda/filtros - NO debe hacer zoom
- [ ] Abrir detalle de deal - inputs NO hacen zoom
- [ ] Tocar textarea de notas - NO debe hacer zoom

### A.5 CRM - Instalaciones (`/crm/installations`)
- [ ] Tocar inputs de busqueda - NO debe hacer zoom
- [ ] Abrir detalle de instalacion - inputs NO hacen zoom
- [ ] Tocar selects de cotizaciones - NO debe hacer zoom

### A.6 CRM - Cotizaciones / CPQ (`/crm/cotizaciones`, `/cpq`)
- [ ] Tocar inputs de configuracion de cotizacion - NO debe hacer zoom
- [ ] Tocar inputs numericos (precio, cantidad) - NO debe hacer zoom
- [ ] Tocar selects de productos/servicios - NO debe hacer zoom
- [ ] Abrir modal de crear cotizacion - inputs NO hacen zoom

### A.7 Operaciones - Tickets (`/ops/tickets`)
- [ ] Tocar inputs de filtro - NO debe hacer zoom
- [ ] Tocar selects de estado/prioridad - NO debe hacer zoom
- [ ] Abrir detalle de ticket - textarea de notas NO hace zoom

### A.8 Operaciones - Eventos de Guardia (`/ops/control-nocturno`)
- [ ] Tocar inputs de filtro - NO debe hacer zoom
- [ ] Tocar selects de fecha/tipo - NO debe hacer zoom

### A.9 Finanzas - Rendiciones (`/finanzas/rendiciones`)
- [ ] Tocar inputs de formulario de nueva rendicion - NO debe hacer zoom
- [ ] Tocar inputs numericos de montos - NO debe hacer zoom
- [ ] Tocar selects de tipo/estado - NO debe hacer zoom

### A.10 Documentos (`/opai/documentos`)
- [ ] Tocar input de busqueda - NO debe hacer zoom
- [ ] Tocar selects de filtro - NO debe hacer zoom
- [ ] Abrir editor de documento - textarea NO hace zoom

### A.11 Configuracion (`/opai/configuracion/*`)
- [ ] Tocar inputs de formularios de usuarios - NO debe hacer zoom
- [ ] Tocar selects de roles/grupos - NO debe hacer zoom
- [ ] Abrir modal de crear/editar - inputs NO hacen zoom

---

## Seccion B: Overflow

### B.1 Pruebas globales
- [ ] Rotar dispositivo portrait -> landscape en cada pagina - sin scroll horizontal
- [ ] Rotar dispositivo landscape -> portrait en cada pagina - sin scroll horizontal
- [ ] En ninguna pagina se puede hacer scroll horizontal en el body

### B.2 Hub / Inicio
- [ ] KPIs se muestran sin overflow horizontal
- [ ] Pipeline section no desborda
- [ ] Tickets section no desborda

### B.3 CRM - Listas
- [ ] Tabla de cuentas - scroll horizontal solo dentro del contenedor de tabla
- [ ] Tabla de contactos - scroll horizontal solo dentro del contenedor de tabla
- [ ] Tabla de deals - scroll horizontal solo dentro del contenedor de tabla
- [ ] Tabla de instalaciones - scroll horizontal solo dentro del contenedor de tabla

### B.4 CRM - Detalle
- [ ] Abrir detalle de cuenta - contenido dentro del viewport
- [ ] Panel lateral de notas - dentro del viewport
- [ ] Dropdowns de estado/etapa - dentro del viewport

### B.5 CPQ - Cotizaciones
- [ ] Detalle de cotizacion - popover de opciones dentro del viewport
- [ ] Tabla de items de cotizacion - scroll contenido en tabla
- [ ] Modal de crear cotizacion - contenido dentro del viewport

### B.6 Modales y Sheets
- [ ] Abrir cualquier modal - contenido dentro del viewport
- [ ] Modales en mobile aparecen como bottom-sheet
- [ ] Contenido de modal largo tiene scroll interno (no desborda)
- [ ] Cerrar modal - viewport vuelve a tamano normal

### B.7 Dropdowns y Popovers
- [ ] Abrir dropdown de usuario (navbar) - dentro del viewport
- [ ] Abrir command palette - dentro del viewport
- [ ] Abrir selectores de fecha - dentro del viewport
- [ ] Abrir popovers en CPQ - dentro del viewport (max-width aplicado)

### B.8 Sidebar y Navegacion
- [ ] TemplateSidebar no desborda en mobile (usa calc(100vw-3rem))
- [ ] Sidebar principal (AppShell) se comporta correctamente
- [ ] Navegacion no produce scroll horizontal

---

## Seccion C: Sistema de Notas

### C.1 Reacciones
- [ ] Tocar emoji de reaccion en una nota - reaccion aparece inmediatamente
- [ ] Tocar emoji de reaccion - NO recarga la pagina
- [ ] Tocar reaccion propia para remover - se remueve sin recargar
- [ ] Verificar que el contador de reacciones se actualiza correctamente
- [ ] Si hay error de red, la reaccion se revierte (optimistic rollback)

### C.2 Respuestas
- [ ] Responder a una nota - respuesta aparece inmediatamente abajo
- [ ] Responder - NO recarga la pagina
- [ ] Scroll position se mantiene despues de responder
- [ ] El input de respuesta se muestra correctamente en mobile

### C.3 Edicion
- [ ] Editar una nota existente - cambio se refleja sin recargar
- [ ] Editar - NO recarga la pagina
- [ ] El texto editado se muestra correctamente despues de guardar

### C.4 Eliminacion
- [ ] Eliminar una nota - se remueve sin recargar
- [ ] Eliminar - NO recarga la pagina
- [ ] Si hay error, la nota reaparece (rollback)

### C.5 Creacion
- [ ] Crear nueva nota - aparece en la lista sin recargar
- [ ] Crear nota - NO recarga la pagina
- [ ] La nueva nota aparece en la posicion correcta

### C.6 Otras acciones
- [ ] Fijar/desfijar nota - se actualiza sin recargar
- [ ] Marcar/desmarcar como tarea - se actualiza sin recargar
- [ ] Scroll position se mantiene despues de cada accion

---

## Seccion D: Interaccion Tactil

### D.1 Tamano de targets tactiles
- [ ] Todos los botones principales tienen al menos 44x44px de area tactil
- [ ] Botones de accion en toolbars son faciles de tocar
- [ ] Iconos de accion en tablas son faciles de tocar
- [ ] Botones de cierre (X) en modales son faciles de tocar

### D.2 Feedback visual
- [ ] Al tocar un boton, hay feedback visual inmediato (scale/opacity)
- [ ] No hay flash azul/highlight de navegador al tocar elementos
- [ ] Active state es visible en botones
- [ ] Los botones no se "pegan" en estado hover despues de tocar

### D.3 Elementos hover-only
- [ ] Botones de accion en listas de presentaciones son visibles en mobile
- [ ] Botones de accion en documentos son visibles en mobile
- [ ] Botones de accion en rendiciones son visibles en mobile
- [ ] Botones de accion en notificaciones son visibles en mobile
- [ ] Menu contextual de notas es accesible en mobile
- [ ] Botones de accion en configuracion CPQ son visibles en mobile

### D.4 Tooltips
- [ ] KpiCard: tooltip accesible al tocar (focus-within)
- [ ] SectionNav: tooltip accesible al tocar (focus-within)
- [ ] CrmInstallationDetail: tooltip accesible al tocar (focus-within)

### D.5 Scroll en modales
- [ ] Scroll funciona dentro de modales/sheets con contenido largo
- [ ] overscroll-behavior: contain impide "pasar" el scroll al body
- [ ] No hay "scroll bleed" al llegar al limite de un modal

### D.6 Teclado virtual
- [ ] Al enfocar input de notas, el teclado virtual no oculta el campo
- [ ] El campo de notas hace scroll automatico para ser visible
- [ ] Al cerrar teclado, el viewport vuelve a tamano normal
- [ ] Inputs de busqueda no quedan ocultos bajo el teclado

---

## Seccion E: Cross-Browser

### E.1 Safari iOS (iPhone) - PRIORIDAD ALTA
- [ ] Seccion A completa (zoom)
- [ ] Seccion B completa (overflow)
- [ ] Seccion C completa (notas)
- [ ] Seccion D completa (tactil)
- **Dispositivo:** _______________
- **Version iOS:** _______________
- **Tester:** _______________
- **Fecha:** _______________

### E.2 Chrome Android - PRIORIDAD ALTA
- [ ] Seccion A completa (zoom)
- [ ] Seccion B completa (overflow)
- [ ] Seccion C completa (notas)
- [ ] Seccion D completa (tactil)
- **Dispositivo:** _______________
- **Version Android:** _______________
- **Tester:** _______________
- **Fecha:** _______________

### E.3 Samsung Internet
- [ ] Seccion A completa (zoom)
- [ ] Seccion B completa (overflow)
- [ ] Seccion C completa (notas)
- [ ] Seccion D completa (tactil)
- **Dispositivo:** _______________
- **Version:** _______________
- **Tester:** _______________
- **Fecha:** _______________

### E.4 Chrome Desktop (emulador mobile)
- [ ] Seccion A completa (zoom)
- [ ] Seccion B completa (overflow)
- [ ] Seccion C completa (notas)
- [ ] Seccion D completa (tactil)
- **Resolucion emulada:** _______________
- **Tester:** _______________
- **Fecha:** _______________

### E.5 Safari Desktop
- [ ] Seccion B completa (overflow)
- [ ] Seccion C completa (notas)
- **Version:** _______________
- **Tester:** _______________
- **Fecha:** _______________

### E.6 Firefox Desktop
- [ ] Seccion B completa (overflow)
- [ ] Seccion C completa (notas)
- **Version:** _______________
- **Tester:** _______________
- **Fecha:** _______________

### E.7 Edge Desktop
- [ ] Seccion B completa (overflow)
- [ ] Seccion C completa (notas)
- **Version:** _______________
- **Tester:** _______________
- **Fecha:** _______________

---

## Herramienta de Auditoría Automatizada

Antes de realizar el testing manual, ejecutar el script `mobile_audit.js` en la consola del navegador:

1. Abrir la pagina a testear en el navegador
2. Abrir DevTools (F12 o Cmd+Option+I)
3. Ir a la pestana **Console**
4. Copiar y pegar el contenido de `mobile_audit.js` (ubicado en la raiz del proyecto)
5. Presionar Enter
6. Revisar los resultados:
   - **Verde**: 0 issues encontrados
   - **Rojo**: Lista de issues detectados automaticamente

> **Nota:** El script detecta automaticamente problemas de viewport, font-size < 16px (riesgo de zoom en iOS), overflow horizontal, y targets tactiles menores a 44px. Es complementario al testing manual, no lo reemplaza.

---

## Resultado Final

| Seccion | Pasa | Falla | Notas |
|---------|------|-------|-------|
| A. Zoom | /11 | /11 | |
| B. Overflow | /8 | /8 | |
| C. Notas | /6 | /6 | |
| D. Tactil | /6 | /6 | |
| E. Cross-Browser | /7 | /7 | |

**Aprobado por:** _______________
**Fecha:** _______________
