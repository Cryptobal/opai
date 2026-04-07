# OPAI — Base de Conocimiento del Producto

## Descripcion General

OPAI es una plataforma SaaS (Software as a Service) tipo ERP + IA disenada especificamente para empresas de seguridad privada en Chile y Latinoamerica. Permite gestionar la operacion completa de una empresa de seguridad desde una sola plataforma web con acceso movil.

## Modulos Principales

### Hub (Dashboard Central)
- Vista unificada de toda la operacion
- KPIs en tiempo real: guardias activos, cobertura, alertas
- Acceso rapido a todos los modulos
- Widget de notificaciones y alertas

### CRM (Gestion Comercial)
- **Cuentas y Clientes**: Gestion completa de cartera de clientes
- **Prospectos y Leads**: Pipeline comercial con etapas configurables
- **Contactos**: Directorio de contactos por cuenta
- **Negocios (Deals)**: Seguimiento de oportunidades comerciales
- **Instalaciones**: Sitios fisicos donde se presta servicio de seguridad
- **Cotizaciones (CPQ)**: Generador de cotizaciones con precios, descuentos y aprobaciones

### Operaciones (Ops)
- **Pauta Mensual**: Planificacion de turnos por instalacion, puesto y dia
- **Asistencia Diaria**: Ejecucion real de turnos (presentes, ausentes, reemplazos)
- **Puestos Operativos**: Definicion de puntos de servicio en cada instalacion
- **Slots**: Plazas dentro de cada puesto operativo
- **Turnos Extra (TE)**: Reemplazos efectivos por ausencias
- **Puestos por Cubrir (PPC)**: Slots sin guardia asignado
- **Supervision**: Visitas de supervision con checklists, fotos y evaluaciones
- **Tickets**: Sistema de tickets operativos con tipos configurables
- **Alertas de Cobertura**: Deteccion automatica de gaps operativos
- **Rondas GPS**: Control de rondas con checkpoints, QR, geofencing y monitoreo en tiempo real
- **Inventario**: Gestion de activos, uniformes, equipamiento y lineas telefonicas
- **ATS (Reclutamiento)**: Publicacion de empleos y seguimiento de postulaciones

### Personas (Guardias)
- Ficha completa del guardia: datos personales, contratos, documentos
- Onboarding digital
- Comunicaciones masivas (SMS, push, email)
- Consulta de sueldos por RUT
- Gamificacion con sistema de puntos y logros

### Payroll (Remuneraciones)
- Periodos de pago mensuales
- Calculo de haberes y descuentos
- Anticipos de sueldo
- Simulador de liquidaciones
- Parametros legales (UF, UTM, indicadores)
- Integracion con previred

### Finanzas
- **Rendiciones de Gastos**: Alta, aprobacion y pago de rendiciones
- **Facturacion (Ventas)**: Emision y seguimiento de facturas
- **Proveedores (Compras)**: Gestion de facturas de compra
- **Banca**: Conciliacion bancaria
- **Contabilidad**: Plan de cuentas y asientos contables
- **Informes**: Reportes financieros personalizados

### Documentos
- Envio de documentos con firma electronica
- Gestion documental con categorias y estados
- Plantillas personalizables con tokens dinamicos
- Seguimiento de lectura y firma

### Chat Interno
- Mensajeria en tiempo real entre equipos
- Canales grupales e individuales
- Hilos de conversacion
- Menciones (@usuario, @todos)
- Adjuntos y reacciones
- Notificaciones push

### Reportes DT (Direccion del Trabajo)
- Asistencia diaria
- Jornada diaria
- Domingos y festivos
- Modificaciones de turnos

### Portales Externos
- **Portal Guardia**: Acceso para guardias a su informacion, turnos y comunicaciones
- **Portal Cliente**: Visibilidad para clientes sobre la operacion en sus instalaciones
- **Portal Supervisor**: Herramientas para supervisores en terreno
- **Portal Marcacion**: Marcacion biometrica de entrada/salida
- **Control de Acceso**: Sistema de acceso a instalaciones

## Inteligencia Artificial

### Asistente Conversacional
- Chat de ayuda integrado en la plataforma
- Responde preguntas sobre funcionalidades y flujos
- Consulta datos operativos en tiempo real (guardias, metricas, UF/UTM)
- Genera respuestas contextualizadas basadas en la documentacion

### Base de Conocimiento (RAG)
- Documentos globales de la plataforma alimentan al chatbot
- Cada empresa puede subir sus propios documentos (protocolos, normativas, manuales)
- Busqueda semantica inteligente con embeddings vectoriales
- Soporta PDF, Word, Markdown y texto plano

### Capacidades del asistente OPAI Intelligence (chatbot)

El asistente conversacional integrado en OPAI Suite puede:

**Conversación funcional**
- Explicar modulos, flujos, conceptos y navegacion del sistema.
- Guiar paso a paso en cualquier flujo operativo o de configuracion.
- Citar protocolos, normativas y manuales de la base de conocimiento.

**Busqueda federada de entidades**
- Buscar clientes, deals, instalaciones, cotizaciones y guardias por nombre, RUT o codigo.
- Cuando el usuario menciona un nombre propio no reconocido, el asistente busca automaticamente en todas las entidades antes de pedir contexto.
- Resultados se muestran como cards con link directo a la ficha.

**Contexto de pagina (tipo Notion AI)**
- Cuando el usuario esta viendo la ficha de un cliente, deal, cotizacion, instalacion, guardia o documento, el asistente sabe cual es la entidad activa y resuelve referencias ambiguas como "este cliente" o "resumeme esto".
- Funciona en fichas de: clientes CRM, deals CRM, instalaciones CRM, cotizaciones CPQ, guardias Ops y documentos.

**Lectura y resumen de documentos**
- Listar todos los documentos asociados a una entidad (contratos generados, archivos adjuntos, ordenes de compra, propuestas, anexos).
- Leer y resumir el contenido de contratos, ordenes de compra y otros documentos PDF, DOCX, TXT o Markdown almacenados en OPAI.
- Entregar resumenes estructurados (partes, objeto, vigencia, montos, obligaciones criticas).

**Datos en vivo del tenant**
- Indicadores economicos: UF y UTM del dia.
- Operacion: asistencia diaria, ausencias, turnos extra, PPC, alertas de panico, rondas, supervision, tickets.
- Comercial: pipeline de deals, listados de cotizaciones y clientes.
- Finanzas: rendiciones por aprobar, resumen DTE.
- Personas: metricas de guardias, fichas completas, documentos por guardia.

**Renderizado visual estructurado**
- Cards horizontales scrollables (con CTA "Ver detalle").
- Graficos bar/line/pie/donut.
- KPIs con delta.
- Tablas estructuradas.
- Botones de sugerencias de seguimiento.

**Indicador de tool en curso**
- Muestra mensajes especificos como "Buscando clientes...", "Leyendo documento...", "Consultando rondas..." mientras ejecuta cada accion.

### Limites del asistente (lo que NO puede hacer)

- **No ejecuta acciones de escritura**: no crea, edita ni elimina entidades. No envia emails, WhatsApp ni firma documentos.
- **No accede a sistemas externos** (banco, SII, AFP, OS10) a menos que el dato ya este en la base de OPAI.
- **No procesa imagenes ni hace OCR**.
- **No lee Excel (XLSX) ni PowerPoint (PPTX)** todavia.
- **No tiene memoria entre tenants**: cada respuesta esta aislada al usuario y empresa actual.
- **No inventa datos numericos** (montos, RUTs, sueldos, metricas): si no tiene la fuente, lo dice explicitamente.

### Capacidades de IA del producto (no del chatbot)
- Analisis predictivo de ausentismo
- Deteccion de anomalias en rondas
- Optimizacion de cobertura automatica
- Alertas inteligentes con contexto
- Reportes generados con lenguaje natural

## Planes y Precios

### Trial
- 14 dias gratis
- Acceso completo a todos los modulos
- Soporte por chat

### Essential
- Modulos core: Ops, CRM, Personas
- Hasta 100 guardias
- Soporte email

### Professional
- Todos los modulos
- Guardias ilimitados
- Integraciones avanzadas
- Soporte prioritario

### Enterprise
- Todo en Professional
- SLA garantizado
- Integraciones custom
- Soporte dedicado
- Multi-region

## Add-ons Disponibles
- Rondas GPS
- Supervision Avanzada
- Chat Interno
- Portal Cliente
- Portal Guardia
- Portal Supervisor
- Gamificacion
- ATS (Reclutamiento)
- Control de Acceso
- Alertas de Cobertura
- Onboarding Digital

## Diferenciadores
1. **Vertical especializado**: Disenado 100% para seguridad privada
2. **Todo-en-uno**: ERP completo sin necesidad de integrar multiples herramientas
3. **IA integrada**: Asistente inteligente que aprende del negocio del cliente
4. **Multi-tenant**: Cada empresa opera en su propio espacio aislado
5. **Mobile-first**: Funciona en cualquier dispositivo como PWA
6. **Modular**: Activa solo los modulos que necesitas
7. **Escalable**: Desde 10 hasta 10,000+ guardias
