# Template Comercial — Presentación B2B

**Resumen:** Estructura y principios de diseño del template comercial principal para presentaciones de seguridad B2B.

**Estado:** Vigente - Documentación de referencia

**Scope:** OPAI Docs - Ventas

---

# Template Comercial GARD — Landing-Deck (Cliente B2B)
**Objetivo:** Maximizar conversión (agendar visita técnica / reunión) y reducir fricción (confianza, riesgo, comparabilidad, ROI).
**Formato:** Web landing page tipo “deck” (secciones verticales), imprimible a PDF, con versión “share link” y tracking.
**Base de contenido:** PDF “Propuesta Técnica y Económica SP” (misma narrativa, rediseño total).

---

## 0) Principios de Conversión (NO negociables)
1. **Outcome > Feature:** cada bloque debe traducir “qué hago” a “qué obtienes / qué evitas”.
2. **Credibilidad cuantificada:** números, SLAs, KPIs, protocolos; evitar claims vagos.
3. **Reducción de riesgo:** cumplimiento laboral + OS-10 + trazabilidad + protocolo de incidentes.
4. **Comparabilidad:** tabla “mercado vs GARD” + “costo total de propiedad” (TCO).
5. **CTA persistente:** botón “Agendar visita técnica” siempre visible en header + sticky bottom en mobile.
6. **Personalización extrema:** la página debe sentirse “hecha para ti” (cliente, sitio, riesgos, alcance, dotación, turnos).
7. **Densidad visual controlada:** no slides “vacías”; usar cards, tablas, dashboards, timelines y micro-infografías.
8. **Narrativa tipo funnel:** Dolor → Riesgo → Sistema → Evidencia → Cumplimiento → Casos → Económico → Cierre.

---

## 1) Variables Dinámicas (inputs)
Estos valores deben poder venir de CRM / querystring / JSON.

- `client.company_name`
- `client.contact_name`
- `quote.number`
- `quote.date`
- `quote.valid_until`
- `service.scope_summary` (1–2 líneas)
- `service.sites[]` (nombre instalación, comuna, tipo industria)
- `service.positions[]` (puesto, horario, turno, dotación)
- `pricing.items[]` (nombre, UF, cantidad, subtotal)
- `pricing.total_uf`
- `commercial.payment_terms` (mensual, contraentrega, etc.)
- `commercial.adjustment_terms` (70% IPC / 30% IMO u otros)
- `cta.meeting_link` (Calendly/Zoho/URL)
- `cta.whatsapp_link`
- `assets.logo`
- `assets.brand_colors`
- `assets.guard_photos[]` (reales)
- `assets.client_logos[]` (si aplica)
- `compliance.os10_qr_url` (verificación)
- `contact.email`
- `contact.phone`

---

## 2) Estructura de Página (secciones obligatorias)
> Importante: cada sección debe tener: **(a) título fuerte**, **(b) 1–2 líneas de contexto**, **(c) componente de prueba/visual**, **(d) takeaway (1 línea)**.

### S01 — HERO (portada)
**Objetivo:** posicionamiento premium + promesa central + CTA.
- Headline: “Seguridad privada diseñada para continuidad operacional”
- Subheadline: “Guardias profesionales + supervisión activa + control en tiempo real”
- Microcopy: “Protegemos personas, activos y procesos críticos en entornos empresariales exigentes.”
- Personalización: “Propuesta para {client.company_name} — {quote.number}”
- CTA primario: “Agendar visita técnica sin costo”
- CTA secundario: “Solicitar propuesta directa”
- Visual: foto real (guardias) + overlay KPI (ej: “99,5% cobertura”)

### S02 — Executive Summary (1 pantalla, alta densidad)
**Objetivo:** “por qué GARD” en 30 segundos.
- Bloque “Nuestro compromiso: transparencia total”
- Bloque “Cómo GARD es diferente” (4 bullets)
- Bloque “Modelo tradicional: la realidad”
- Bloque “Impacto medible” (4 KPIs en cards)
- Visual: cards + mini-dashboard

### S03 — Compromiso de Transparencia (protocolo)
**Objetivo:** confianza; manejo de incidentes con SLA.
- Frase central: “Usted se entera de TODO, PRIMERO. Sin filtros, sin demoras.”
- Timeline/Protocolo:
  - Detección: inmediato
  - Reporte: <= 15 min
  - Acción: <= 2 horas
- KPIs: “67% menos incidentes”, “96% rondas”, “100% eventos documentados”

### S04 — El Riesgo Real (dolor)
**Objetivo:** romper falsa tranquilidad.
- Headline: “El verdadero riesgo no es la ausencia de seguridad. Es la falsa sensación de control.”
- Síntomas (tabla/íconos): control inexistente, reportes inexistentes, trazabilidad inexistente…
- Dato: “73% descubre fallas solo después de un incidente.”

### S05 — Fallas del Modelo Tradicional (tabla causa→impacto)
**Objetivo:** mostrar costo oculto y por qué “barato” es caro.
- Tabla: característica → consecuencia operativa → impacto financiero

### S06 — Costo Real (cards de costos)
**Objetivo:** anclar decisión en TCO y riesgo.
- Cards: robo interno, demanda laboral, lesiones, rotación, horas gerenciales, daño reputacional
- Nota: “Una inversión mensual controlada vs. un costo impredecible”

### S07 — Seguridad como Sistema (capas)
**Objetivo:** reposicionar servicio como “sistema gestionado”.
- “No vendemos guardias. Implementamos un sistema…”
- Visual: pirámide/capas: Guardia → Supervisión → Control → Reportabilidad → Gestión

### S08 — 4 Pilares del Modelo
**Objetivo:** framework simple de recordar.
1) Personal profesional  
2) Supervisión permanente  
3) Control y trazabilidad  
4) Gestión orientada a resultados  
- Visual: 4 cards con microdetalles

### S09 — Cómo Operamos (proceso 7 etapas)
**Objetivo:** matar miedo a improvisación.
- Etapas: diagnóstico → diseño → asignación → supervisión → registro → reportes → mejora continua
- Visual: timeline + tabla “entregable por etapa”

### S10 — Supervisión Activa (corazón del sistema)
**Objetivo:** “no es fe” es verificación.
- Niveles 1–4 (autocontrol, supervisor, coordinador, gestión ejecutiva)
- Línea de tiempo de turno noche (20:00–08:00)
- SLA: “máximo 4 horas sin verificación”, “mínimo 2 supervisiones por turno”

### S11 — Reportabilidad Ejecutiva (3 niveles)
**Objetivo:** valor para operaciones/finanzas/gerencia.
- Diario: novedades, incidentes, rondas, personal
- Semanal: tendencias, KPIs, observaciones
- Mensual ejecutivo: dashboard + recomendaciones
- Visual: dashboard muestra (cards KPI + tabla)

### S12 — Cumplimiento Laboral (riesgo legal/financiero)
**Objetivo:** hablarle al CFO y al mandante.
- “Tranquilidad operativa, legal y financiera”
- Qué puede salir mal (bullets)
- Qué garantizamos (bullets)
- Compromiso: docs disponibles < 24 horas

### S13 — Certificaciones y Estándares (OS-10 y compliance)
**Objetivo:** prueba de legitimidad.
- OS-10 vigente (QR)
- Ley Karin (canal denuncias)
- Código de ética + anticorrupción
- Screening riguroso (lista de checks)

### S14 — Tecnología que Controla (no marketing)
**Objetivo:** diferenciar “tech útil” vs “humo”.
- Control rondas NFC/QR: qué es / para qué / beneficio real
- Registro digital eventos: foto + GPS + timestamp
- Reportes automáticos
- Integración con cliente
- Nota: “No obligamos a comprar tecnología adicional”

### S15 — Selección de Personal (100→12)
**Objetivo:** calidad + continuidad.
- Funnel: 100 postulantes → 12 asignados
- Tabla criterio: perfil psicológico, experiencia real, adaptación, disciplina, salud
- Permanencia: 85% vs industria 50–60%

### S16 — Nuestra Gente (marca empleadora / operación)
**Objetivo:** confianza humana + cultura.
- Mensaje: “Guardias comprometidos…”
- Visual: mosaico fotos reales + 5 valores (cards)

### S17 — Continuidad del Servicio (escenarios)
**Objetivo:** eliminar miedo a ausencias.
- 4 escenarios (programada, imprevista, contingencia mayor, aumento demanda)
- SLA: cobertura max 2 horas
- KPI: 99,5% cumplimiento turnos

### S18 — Indicadores de Gestión (KPIs)
**Objetivo:** objetividad; “se mide, se controla”.
- Rondas, cobertura, respuesta, incidentes documentados, satisfacción, permanencia
- Nota: revisión mensual con cliente

### S19 — Resultados con Clientes (3 mini-casos)
**Objetivo:** prueba social sin revelar nombres.
- 3 sectores (logística, manufactura, retail)
- Cada caso: instalaciones, dotación, tiempo, resultados (4 métricas), quote

### S20 — Clientes (logos)
**Objetivo:** autoridad.
- Grid logos + nota confidencialidad

### S21 — Sectores donde aplica (ICP)
**Objetivo:** que el prospect se vea reflejado.
- 6 industrias con “necesidades típicas”

### S22 — TCO: Costo de seguridad vs costo del riesgo
**Objetivo:** justificar precio y ganar comparativa.
- Columna “costo bajo + alto riesgo” vs “costo controlado + bajo riesgo”
- Tabla TCO 12 meses (UF): tarifa mensual, anual, costos ocultos, total real
- Mensaje: “La pregunta correcta no es cuánto cuesta…”

### S23 — Propuesta Económica (tabla editable)
**Objetivo:** claridad + cierre comercial.
- Facturación, forma de pago, reajuste, validez
- Tabla items UF (editable)
- Total UF

### S24 — Términos y Condiciones (operación)
**Objetivo:** evitar fricciones post-firma.
- Cliente debe proporcionar: caseta, agua, baños, lockers
- Servicio incluye: celulares, radios/linternas, uniforme, reportes, supervisión 24/7, control remoto

### S25 — Comparación Competitiva (tabla honesta)
**Objetivo:** matar “son todos iguales”.
- Tabla: Supervisión, reportes, rondas, incidentes, reemplazo, documentación, KPIs, reuniones, capacitación, canal, tiempos, contingencia

### S26 — Por qué nos eligen (síntesis)
**Objetivo:** recap + ancla emocional.
- 6 bullets: modelo estructurado, supervisión real, reportes útiles, cumplimiento, gestión, resultados
- Dato: 94% renueva contrato

### S27 — Implementación (4 semanas / <=15 días hábiles)
**Objetivo:** seguridad de ejecución.
- Semana 1: visita técnica + informe
- Semana 2: propuesta + contrato
- Semana 3: implementación + sistemas
- Semana 4+: operación + KPIs baseline
- Tabla “qué necesitamos de usted” por etapa

### S28 — Cierre + CTA
**Objetivo:** acción inmediata.
- Headline: “Seguridad que se gestiona. No seguridad que se espera.”
- CTA principal: agendar visita técnica sin costo
- CTA secundario: solicitar propuesta directa
- Microcopy: respuesta en 24h hábiles

### S29 — Contacto
**Objetivo:** redundancia para conversión.
- Email, teléfono, web, dirección, redes
- Botones: LinkedIn / Instagram / YouTube

---

## 3) Componentes UI (biblioteca)
Reutilizables en varias secciones:
- `KpiCard(title, value, delta?, note?)`
- `ComparisonTable(rows[])` (mercado vs GARD)
- `Timeline(items[])`
- `ProcessSteps(steps[])`
- `CaseStudyCard(sector, sites, staffing, duration, metrics[], quote)`
- `PricingTable(items[], total)`
- `StickyCTA(primary, secondary)`
- `TrustBadges(os10, compliance, response_sla, coverage_sla)`
- `PhotoMosaic(guard_photos[])`

---

## 4) Reglas de Copy (tono y estilo)
- Estilo: **board-level**, directo, sin adjetivos vacíos.
- Cada claim debe tener soporte: **SLA, KPI, protocolo, evidencia**.
- Evitar: “somos los mejores”, “calidad premium” sin prueba.
- Preferir: “Mínimo 2 supervisiones por turno + rondas aleatorias; máximo 4 horas sin verificación.”
- Formato:
  - Headline: 6–12 palabras, beneficio/resultado
  - Subheadline: 1–2 líneas, contexto
  - Bullets: 4–6 máx
  - “Takeaway”: 1 línea final que cierre la sección

---

## 5) Diseño (sistema visual)
- Layout: grilla 12 columnas; ancho máximo contenido 1100–1200px.
- Jerarquía:
  - H1: fuerte, alto contraste
  - H2: orientado a acción
  - Body: legible, no párrafos largos
- Densidad: usar cards, tablas, mini dashboards para “cero slides vacías”.
- Fondo: dark premium (coherente con PDF) + acento verde/teal de marca.
- Imágenes: **reales** de guardias y operación; evitar stock agresivo.
- Accesibilidad: contraste AA, tamaños adecuados.

---

## 6) Comportamientos (web)
- Navegación: índice lateral (opcional) + scroll snapping suave (opcional).
- CTA persistente: sticky header + sticky mobile bottom.
- Export: “Descargar PDF” (misma composición).
- Tracking: eventos `cta_click`, `section_view`, `pdf_download` (para optimizar conversión).

---

## 7) Variantes del Template (para ventas)
Generar 3 “skins” con mismo contenido:
- **V1 — Executive Dark Premium:** máxima sobriedad, CFO-friendly.
- **V2 — Ops & Control:** más dashboards, timelines, KPIs visibles.
- **V3 — Trust & People:** más foco en selección, continuidad, fotos reales (sin perder rigor).

---

## 8) Checklist de Calidad (antes de enviar)
- [ ] Hero tiene nombre cliente y CTA funcionando
- [ ] Se entiende el diferencial en < 30s (S02)
- [ ] Transparencia y SLA incidentes (S03) claro y cuantificado
- [ ] TCO (S22) es legible y convincente
- [ ] Pricing (S23) sin ambigüedad, total UF visible
- [ ] Comparación competitiva (S25) destruye “commodity”
- [ ] Implementación (S27) reduce miedo a onboarding
- [ ] Contacto + CTA redundantes (S28–S29)

---

## 9) Output esperado (para Cursor)
1) Generar componente `ProposalLandingTemplate` que reciba JSON con las variables.
2) Renderizar secciones S01..S29 en orden.
3) Implementar variantes V1..V3 como “themes”.
4) Exportar a PDF desde la misma vista.
5) Incluir tracking básico de eventos.

**Fin.**