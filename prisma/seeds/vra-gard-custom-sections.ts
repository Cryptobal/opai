/**
 * Pre-poblado del catálogo VRA para el tenant Gard Security.
 *
 * Reemplaza las descripciones genéricas clonadas del system catalog por
 * versiones de calidad de producción basadas en el informe técnico real de
 * Cementos Polpaico Planta Quilicura.
 *
 * Idempotente. Respeta ediciones manuales del tenant a menos que se fuerce
 * con VRA_GARD_FORCE_OVERWRITE=true.
 *
 * Ejecutar:
 *   npx tsx prisma/seeds/vra-gard-custom-sections.ts
 *   VRA_GARD_FORCE_OVERWRITE=true npx tsx prisma/seeds/vra-gard-custom-sections.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv(); // .env fallback

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_SLUG = "gard";
const FORCE_OVERWRITE = process.env.VRA_GARD_FORCE_OVERWRITE === "true";

// ────────────────────────────────────────────────────────────────────────────
// CATÁLOGO GARD — descripciones IA de calidad de producción
// ────────────────────────────────────────────────────────────────────────────
//
// Cada entrada describe en profundidad qué debe generar la IA para esa sección.
// Está calibrado al estándar de informes Gard (basado en el informe Polpaico
// Quilicura de abril 2026): tono profesional, específico, con frameworks
// internacionales y referencias normativas chilenas explícitas.

type GardSectionPatch = {
  key: string;
  title: string;
  description: string;
  aiPromptHint: string;
};

const GARD_SECTIONS: GardSectionPatch[] = [
  {
    key: "executive_summary",
    title: "Resumen Ejecutivo",
    description: `Síntesis ejecutiva del informe en 2-3 párrafos destinados a la alta gerencia del cliente, seguida de una distribución cuantitativa visual del riesgo (críticos, altos, medios, bajos), una lista jerárquica de hallazgos críticos con su localización geográfica o sistémica, y una conclusión ejecutiva final.

Estructura obligatoria:

1. PÁRRAFO 1 — Contexto operacional: describe el tipo de instalación, su entorno (urbano/industrial/rural), su exposición externa y los factores estructurales que definen su perfil de riesgo. Una sola oración debe quedar como "el presente informe consolida los hallazgos de la inspección de campo, la observación de patrones operativos y el análisis de amenazas activas en el entorno".

2. PÁRRAFO 2 — Evaluación agregada: declarar el nivel de riesgo agregado (CRÍTICO / ALTO / MEDIO / BAJO) y enumerar entre 3 y 5 factores estructurales que lo sostienen, numerados como (i), (ii), (iii). Usar lenguaje preciso: "perímetro permeable con N puntos vulnerables ya explotados", "presencia confirmada de actores que utilizan elementos del entorno", "arquitectura tecnológica de seguridad parcial sin monitoreo remoto 24/7".

3. HALLAZGOS CRÍTICOS — bullets jerárquicos con la nomenclatura: "Sector X (CRÍTICO/ALTO/MEDIO):" seguido de 1-2 frases técnicas. Mínimo 3, máximo 6 bullets. Ordenar por severidad descendente.

4. CONCLUSIÓN EJECUTIVA — un párrafo final que responda explícitamente: ¿el riesgo es teórico o concreto? ¿Hay evidencia material de actividad delictual previa? ¿Qué pasa si no hay acción correctiva? Frase tipo: "El nivel de riesgo no es teórico ni potencial: es concreto y vigente. Existe evidencia material de actividad delictual previa (perforaciones, vigilancia desde altura, intentos reiterados de ingreso). Sin acción correctiva, la instalación continuará operando bajo una ventana de exposición que puede materializarse en eventos de impacto operacional, patrimonial y reputacional."`,
    aiPromptHint: `Tono: profesional ejecutivo, directo, sin jerga innecesaria. Máximo 250 palabras de prosa más bullets de hallazgos. La conclusión debe ser asertiva, no aspiracional. Si no hay evidencia material concreta, decirlo así explícitamente. NO usar frases de relleno tipo "es importante destacar que...". NO inventar cifras: solo usar las que vienen en findings y photos. La distribución cuantitativa debe coincidir con el conteo real de findings por severidad.`,
  },
  {
    key: "objective_scope_methodology",
    title: "Objetivo, Alcance y Metodología",
    description: `Tres subsecciones explícitas, en este orden:

2.1 OBJETIVO — Una declaración formal de 4-6 líneas. Verbos clave: "Identificar, analizar y evaluar de manera sistemática las vulnerabilidades, amenazas y riesgos de seguridad presentes en [Instalación]". Cierra con la finalidad: "...con el fin de proponer un plan de acción priorizado, ejecutable y medible que permita reducir la exposición a eventos de intrusión, sustracción, daño a la propiedad, sabotaje y observación externa hostil."

2.2 ALCANCE — Dos párrafos. Primero declara qué cubre la evaluación: el perímetro completo, los accesos vehiculares y peatonales, la operación logística asociada (si aplica), el entorno inmediato en radio aproximado de 200 metros, la dotación humana en sus turnos operativos y la infraestructura tecnológica de seguridad. Segundo párrafo declara qué queda fuera: "Quedan fuera del alcance del presente informe la ciberseguridad, la seguridad de procesos industriales, los riesgos de continuidad operacional no asociados a seguridad física, y la evaluación detallada de proveedores externos distintos al servicio de seguridad privada."

2.3 METODOLOGÍA — Un párrafo introductorio mencionando "enfoque mixto que integra observación directa de campo, entrevistas con personal operativo, revisión documental y cruce con inteligencia delictual del entorno", seguido de bullets con los frameworks aplicados:
   - ISO 31000 — Gestión de Riesgos: ciclo de identificación, análisis, evaluación y tratamiento del riesgo
   - ASIS Protection of Assets (POA) — Risk Assessment: matriz de probabilidad × impacto para priorización
   - CPTED (Crime Prevention Through Environmental Design): principios de control natural de accesos, vigilancia natural, refuerzo territorial y mantenimiento
   - DS Nº 1.814 / OS-10: marco regulatorio chileno de seguridad privada (Ministerio del Interior y Carabineros)

Cierra con un párrafo explicando la calificación: "La calificación de riesgo se construye combinando la probabilidad de ocurrencia (basada en evidencia de actividad previa, modus operandi conocido y exposición física) con el impacto potencial (operacional, patrimonial, humano y reputacional), generando una clasificación en cuatro niveles: CRÍTICO, ALTO, MEDIO y BAJO."`,
    aiPromptHint: `El bloque metodológico es estándar Gard — la IA debe respetar los frameworks listados textualmente. El objetivo y alcance se adaptan al cliente específico mencionando su nombre y tipo de instalación. NO inventar frameworks. Si el cliente tiene un alcance específico distinto (ej: solo perímetro), ajustar.`,
  },
  {
    key: "site_description",
    title: "Descripción del Sitio y Entorno",
    description: `Caracterización física del sitio en dos partes diferenciadas:

3.1 UBICACIÓN GEOGRÁFICA — Layout de dos columnas: a la izquierda, vista satelital georreferenciada (la imagen viene del dataset de la instalación); a la derecha, una tabla de límites cardinales con 4 filas (NORTE / SUR / ESTE / OESTE), cada una describiendo en 1-2 líneas qué hay físicamente en ese costado de la propiedad. Ejemplos: "Terreno eriazo en desuso, sin control físico ni iluminación", "Terreno eriazo con elevación exterior ≈15 m y autopista central en altura", "Av. Pdte. Eduardo Frei Montalva (acceso principal y portería)", "Línea de Ferrocarriles del Estado, con torres eléctricas y zona de descarga".

Antes de la tabla cardinal, un párrafo de 4-5 líneas describe la ubicación general: comuna, región, conectividad logística estratégica (autopistas, líneas férreas, aeropuertos), y la naturaleza del entorno (urbano-industrial, periurbano, rural).

3.2 CARACTERIZACIÓN DEL ENTORNO — Análisis aplicando criminología ambiental (CPTED). Dos párrafos:

Primero describe la condición de exposición: cuántos lados de los cuatro tienen colindancia con espacios de bajo control externo (eriazos, zonas de circulación pública, áreas industriales abandonadas). Identifica facilitadores delictuales presentes: "baja vigilancia natural, ausencia de control territorial, accesibilidad a puntos elevados (torres eléctricas, elevaciones naturales), y presencia de elementos físicos explotables (postes caídos, vegetación adyacente)".

Segundo párrafo razona el efecto sistémico: "La combinación de un perímetro extenso, un entorno permisivo y una operación logística externa configura un escenario donde la planificación delictual no requiere acceso interno previo: la observación remota es suficiente para identificar ventanas operativas y patrones de la seguridad."`,
    aiPromptHint: `Si el dataset incluye coordenadas GPS, dirección y comuna, mencionarlas literalmente. La tabla cardinal es OBLIGATORIA: si algún lado se desconoce por falta de inspección, poner "Información no relevada en visita" en esa celda. NO inventar elementos del entorno: solo usar lo que aparece en photos, findings o el campo notes/metadata de la instalación. El análisis CPTED debe nombrar explícitamente los principios aplicables.`,
  },
  {
    key: "current_security_posture",
    title: "Postura de Seguridad Actual",
    description: `Evaluación de los recursos de seguridad existentes al momento de la inspección, en tres subsecciones:

4.1 RECURSOS HUMANOS (DOTACIÓN) — Tabla con la dotación operativa por turno y día de la semana. Columnas: Turno (Diurno 08:00-20:00 / Nocturno 20:00-08:00) + 7 columnas con días Lun-Mar-Mié-Jue-Vie-Sáb-Dom mostrando ✓ o el número de guardias por puesto. Bajo cada turno indicar cantidad: "Diurno · 2 guardias", "Nocturno · 3 guardias". Los datos vienen del campo metadata.dotacionActiva o de las asignaciones activas de la instalación. Cierra con un párrafo de análisis: "La dotación cubre el 100% de los días con presencia continua. Sin embargo, el dimensionamiento se evidencia ajustado frente a la extensión del perímetro y la cantidad de puntos críticos identificados, generando ventanas de vulnerabilidad entre rondas físicas que pueden ser estudiadas y explotadas por actores externos."

4.2 INFRAESTRUCTURA Y TECNOLOGÍA — Lista bulleted con los siguientes elementos (omitir los que no aplican):
   - Casetas de vigilancia: cantidad, ubicación, visibilidad efectiva
   - CCTV: cobertura (parcial / total / ausente), monitoreo (local / remoto / 24-7 / discontinuo)
   - Cerco eléctrico: estado (operativo / discontinuo / fuera de servicio), continuidad
   - Iluminación: tipo (LED / sodio), cobertura, dependencia de generadores
   - Patrullaje vehicular: existe o no, frecuencia
   - Control de accesos: peatonal y vehicular, sistema (biométrico, libro, vigilante)

4.3 BRECHAS IDENTIFICADAS — Un párrafo concluyente que explique POR QUÉ la postura actual es insuficiente para el perfil de riesgo del sitio: "La postura actual depende fuertemente del esfuerzo humano y de rondas físicas, lo que es estructuralmente insuficiente para contener un perímetro extenso con múltiples puntos vulnerables simultáneos. La ausencia de monitoreo remoto centralizado convierte la detección en reactiva: el evento se identifica una vez en curso, sin capacidad de detección temprana ni respuesta preventiva."`,
    aiPromptHint: `Inferir la dotación desde los campos metadata.dotacionActiva o asignacionGuardias de la instalación. Si no hay datos disponibles, indicar "Información no disponible en sistema" y omitir la tabla, describiendo solo lo observado en visita. La tecnología se infiere del campo accessControl, nocturnoEnabled, y los hallazgos relacionados a CCTV/iluminación/cerco.`,
  },
  {
    key: "threat_analysis",
    title: "Análisis de Amenazas",
    description: `Análisis técnico de las amenazas identificadas, diferenciando explícitamente entre amenazas hipotéticas y amenazas con evidencia material concreta. Tres subsecciones:

5.1 CARACTERIZACIÓN DE ACTORES — Bullets clasificando los perfiles de actores hostiles relevantes. Como mínimo cubrir tres tipos:
   - Actores oportunistas: descripción del perfil (situación de calle, consumo problemático, organización mínima), modo de operación (presión delictual constante, baja sofisticación, alta frecuencia), y dónde se concentran respecto a la instalación
   - Actores planificados: grupos organizados, vigilancia previa desde puntos elevados o el entorno, estudio de rutinas de la seguridad, ingresos coordinados en ventanas operativas detectadas
   - Vectores indirectos: actores que operan desde franjas adyacentes donde la seguridad privada no tiene facultad legal de intervención (líneas férreas, vías públicas, terrenos colindantes), y desde allí avanzan hacia el perímetro

5.2 MODUS OPERANDI OBSERVADO — Bullets describiendo patrones específicos detectados en terreno con evidencia. Cada bullet debe nombrar el patrón en bold seguido de evidencia: "Vigilancia prolongada desde altura: se han detectado elementos de permanencia (cojines, restos de alimento) en torres eléctricas del sector oeste, indicando observación sostenida y planificada de rutinas operativas y de seguridad". "Perforación reiterada de muros: evidencia material de orificios en el muro perimetral del costado ferroviario, algunos parchados con placa metálica, otros activos. Confirma intentos sistemáticos de generar accesos informales". "Uso de elementos del entorno: explotación de un poste caído en sector sur como puente de acceso; uso de árboles colindantes para escalamiento silencioso en sector norte". "Identificación de ventanas operativas: explotación del intervalo entre rondas físicas, especialmente en sectores sin cobertura CCTV ni iluminación efectiva".

5.3 ACTIVOS EXPUESTOS — Un párrafo introductorio + bullets con las cuatro categorías:
   - Patrimoniales: infraestructura, equipos, insumos industriales, vehículos, materiales de operación
   - Operacionales: continuidad de proceso productivo, integridad de la cadena logística, disponibilidad de personal
   - Humanos y reputacionales: seguridad del personal del cliente y del servicio, integridad de visitas y contratistas, reputación de marca asociada a la robustez del sitio`,
    aiPromptHint: `CRÍTICO: diferenciar amenazas hipotéticas (sin evidencia) de amenazas confirmadas (con evidencia material en findings o photos). Si los hallazgos contienen palabras clave como "cojín", "colilla", "perforación", "foradura", "placa metálica", "huella", "rastro", "intento", son evidencia de actividad delictual previa REAL, no hipótesis. Usar lenguaje afirmativo en esos casos: "se han detectado", "evidencia material confirma", "se observa".`,
  },
  {
    key: "vulnerabilities",
    title: "Análisis de Vulnerabilidades por Sector",
    description: `Lista numerada V-01, V-02, V-03... de vulnerabilidades específicas, organizadas por sector geográfico (Norte/Sur/Este/Oeste/Perimetral) o por sistema de seguridad (CCTV/Iluminación/Cerco/Operacional/Normativo). Cada vulnerabilidad ocupa una "card" visual con borde de color según severidad (rojo crítico, naranja alto, amarillo medio, verde bajo) y debe contener:

ENCABEZADO: "V-NN  [Nombre de la vulnerabilidad]" — el nombre debe ser específico, no genérico. Ejemplos buenos: "V-01 Sector Sur — Elevación Exterior y Poste Caído", "V-02 Sector Oeste — Línea Férrea y Torres de Vigilancia", "V-03 Tecnología de Seguridad — CCTV y Monitoreo". Ejemplos malos: "V-01 Perímetro débil", "V-02 Falta de cámaras".

BADGE DE SEVERIDAD: badge con color (CRÍTICO / ALTO / MEDIO / BAJO) seguido de texto pequeño "· Riesgo evaluado".

PÁRRAFO DESCRIPTIVO de 4-6 líneas: descripción técnica de la vulnerabilidad, su localización física, qué la hace explotable, y cualquier evidencia material relevante.

ATRIBUTOS bulleted (siempre en este orden):
   - Probabilidad: Alta / Media-Alta / Media / Baja, seguido entre paréntesis de la justificación corta
   - Impacto: Alto / Medio-Alto / Medio / Bajo, seguido entre paréntesis de la justificación corta
   - Factores agravantes: 1-2 frases describiendo qué empeora la vulnerabilidad
   - Sistemas afectados: lista de sistemas/sectores impactados

REGLAS DE CALIDAD:
- Mínimo 5, máximo 12 vulnerabilidades por informe (típicamente 7-9)
- NO inventar vulnerabilidades genéricas; cada una debe vincularse a evidencia (un finding, una foto, una observación de visita)
- Agrupar findings similares en una sola V cuando corresponda (ej: 3 perforaciones en el mismo muro = 1 vulnerabilidad)
- La numeración V-01..V-NN debe ser consistente con la matriz de riesgo (sección 7) y las recomendaciones (sección 8)
- Si hay V que vincula con limitación normativa (ej: zona ferroviaria fuera de jurisdicción de seguridad privada), señalarlo explícitamente`,
    aiPromptHint: `Cada V-NN consume hallazgos del dataset. Buscar patrones: hallazgos del mismo sector se agrupan; hallazgos del mismo sistema se agrupan. La probabilidad e impacto NO son intercambiables — Alta probabilidad significa "ya ocurrió o tiene alta evidencia de que va a ocurrir"; Alto impacto significa "afecta al menos 2 categorías de activos o al core operacional". El campo factores agravantes debe explicar por qué este caso es peor que el caso base.`,
  },
  {
    key: "risk_matrix",
    title: "Matriz de Riesgo Consolidada",
    description: `Sección de dos componentes obligatorios:

7.1 TABLA CONSOLIDADA — Tabla con todas las vulnerabilidades V-01..V-NN del informe. Columnas en este orden: ID (V-NN, badge azul navy), Vulnerabilidad (nombre corto), Sector / Sistema, Probabilidad, Impacto, Riesgo (badge final con color según severidad). El valor de la columna Riesgo se calcula combinando Probabilidad × Impacto:
- Alta × Alto = CRÍTICO (si hay evidencia material activa) o ALTO
- Alta × Medio-Alto = ALTO
- Media × Medio = MEDIO
- Baja × Bajo = BAJO
La regla exacta de combinación queda explícita en el prompt: si Probabilidad=Alta Y existe evidencia material confirmada (ej: perforación activa, vigilancia documentada con cojines/restos), elevar a CRÍTICO.

7.2 MAPA DE CALOR — Matriz visual 4×4 con eje X = Impacto (Insignificante / Menor / Moderado / Mayor) y eje Y = Probabilidad (Casi Cierto / Probable / Posible / Improbable). Cada celda tiene un color de fondo según el riesgo (verde claro abajo-izquierda → rojo arriba-derecha). En cada celda se ubican los códigos V-NN que cayeron en ese cuadrante, separados por punto medio (·). Ejemplo: celda "Casi Cierto × Mayor" muestra "V-01 · V-02"; celda "Probable × Mayor" muestra "V-03 · V-05 · V-09".

Antes de la tabla, un párrafo de 2 líneas: "La matriz consolida los nueve hallazgos identificados, calificando cada uno según probabilidad de ocurrencia e impacto potencial. La calificación final se obtiene del cruce de ambos ejes y orienta la priorización del plan de acción."

Antes del mapa de calor, un párrafo de 2 líneas describiendo la concentración del riesgo: "La distribución gráfica de los hallazgos en el plano probabilidad-impacto evidencia la concentración del riesgo en el cuadrante superior-derecho (alta probabilidad / alto impacto), donde se sitúan las vulnerabilidades V-XX, V-YY..."`,
    aiPromptHint: `La matriz consume DIRECTAMENTE el output_json de la sección de vulnerabilidades. NO recalifica — solo consolida. Los valores de Probabilidad e Impacto que vinieron en cada V deben respetarse íntegros. Si la sección de vulnerabilidades no está disponible en el contexto, fallar explícitamente con error en lugar de inventar. El sector/sistema en la tabla consolidada es el mismo que se declaró en cada V.`,
  },
  {
    key: "recommendations",
    title: "Recomendaciones Priorizadas",
    description: `Lista numerada R-01, R-02, R-03... de recomendaciones accionables, priorizadas por impacto en reducción de riesgo y plazo de implementación. Cada recomendación es una "card" visual con borde lateral del color de prioridad y debe contener:

ENCABEZADO: "R-NN  [Nombre de la recomendación]" — específico y orientado a acción. Ejemplos: "R-01 Patrullaje Vehicular Nocturno con Baliza", "R-02 Retiro de Accesos Facilitadores (Acción Inmediata)", "R-03 Recuperación e Integración del Cerco Eléctrico", "R-04 Despliegue de CCTV Integral con Monitoreo 24/7".

BADGE DE PRIORIDAD: una de cuatro etiquetas con su color: INMEDIATA (rojo, 0-30 días) / ALTA (naranja, 30-90 días) / MEDIA (amarillo, 90-180 días) / BAJA (verde, >180 días), seguida de texto en línea con plazo e inversión cualitativa: "Inmediata (0-30 días) · Plazo: 0-30 días · Inversión: Media (CAPEX bajo + OPEX recurrente)".

CUATRO BLOQUES OBLIGATORIOS, en este orden, cada uno con su label en mayúscula pequeña:

   - ACCIÓN: párrafo describiendo la acción concreta a ejecutar. Específica, no aspiracional. Ejemplo bueno: "Incorporar un vehículo de seguridad con baliza para patrullaje continuo durante el turno nocturno (20:00–08:00), con ruta definida que cubra prioritariamente los sectores Sur y Oeste y con frecuencia variable (no predecible) entre rondas." Ejemplo malo: "Mejorar el patrullaje".

   - JUSTIFICACIÓN: párrafo explicando POR QUÉ esta acción reduce el riesgo, vinculándola a las vulnerabilidades específicas que mitiga. Mínimo mencionar 1 V-NN.

   - INDICADOR DE ÉXITO (KPI): UNA frase con un indicador medible, cuantitativo y verificable. Ejemplos: "Cero perforaciones nuevas en muro perimetral en 90 días; tiempo de respuesta a evento <3 minutos.", "100% de accesos facilitadores eliminados en 15 días; verificación documentada con registro fotográfico.", "Cobertura CCTV ≥95% del perímetro; tiempo de detección automática de intrusión <30 segundos."

REGLAS DE CALIDAD:
- Entre 6 y 10 recomendaciones por informe (típicamente 7-8)
- Las primeras 2-3 deben ser INMEDIATAS (acciones de bajo costo y alto impacto)
- Cada R debe vincularse al menos a 1 V de la matriz
- Si una V tiene limitación normativa (ej: zona ferroviaria), la R correspondiente debe reconocer la limitación y proponer mitigación indirecta
- NO recomendar tecnologías específicas de marca; usar términos genéricos ("CCTV con analítica de video", "control biométrico")`,
    aiPromptHint: `Cada R debe ser accionable, no genérica. "Mejorar la seguridad" es INACEPTABLE. Cada KPI debe ser cuantificable y verificable en plazo finito. La priorización balancea impacto en reducción de riesgo y costo de ejecución: lo de mayor impacto y menor costo va primero (Fase Inmediata). Si una recomendación requiere CAPEX alto pero su impacto es alto, va a Fase 2 (Alta) salvo que sea bloqueante para todo lo demás.`,
  },
  {
    key: "implementation_roadmap",
    title: "Hoja de Ruta de Implementación",
    description: `Plan en 4 fases secuenciales con foco temporal explícito, presentado como tabla visual con código de color por fase. Cada fase tiene una columna izquierda con el badge de color y el plazo, y una columna derecha con el título de la fase + bullets de las recomendaciones aplicables.

FASE 1 — INMEDIATO (rojo, 0-30 días): "Reducción de riesgo crítico"
Bullets de 2-4 R-NN agrupadas. Foco: cierre de vulnerabilidades de mayor impacto que requieren mínima inversión. Outcome esperado: eliminar accesos facilitadores y restablecer presencia disuasiva activa.

FASE 2 — CORTO PLAZO (naranja, 30-90 días): "Robustecimiento — Detección preventiva"
Bullets de 2-4 R-NN. Foco: pasar de modelo reactivo a preventivo mediante tecnología y cobertura ampliada. Outcome esperado: monitoreo 24/7 operativo y cerco perimetral íntegro.

FASE 3 — MEDIANO PLAZO (amarillo, 90-180 días): "Consolidación — Perímetro y entorno"
Bullets de 2-3 R-NN. Foco: cerrar las vulnerabilidades estructurales restantes y articular con actores externos del entorno (Municipalidad, Carabineros, mandantes, operador ferroviario). Outcome esperado: reducción del 60% de vulnerabilidades altas.

FASE 4 — MEJORA CONTINUA (verde, >180 días): "Vigilancia inteligente"
Bullets independientes (puede no consumir directamente las R-NN del informe). Items típicos: "Reevaluación integral de vulnerabilidades a 12 meses", "Incorporación de analítica de video avanzada y alertas predictivas", "Evaluación de control de accesos biométrico (visitantes y contratistas)", "Auditoría de procedimientos operativos del personal de seguridad".

Antes de la tabla, un párrafo introductorio: "La hoja de ruta organiza las recomendaciones en cuatro fases secuenciales, con foco en maximizar la reducción del riesgo en los primeros 90 días. Las fases 1 y 2 concentran las acciones de mayor impacto operativo; las fases 3 y 4 consolidan y proyectan."`,
    aiPromptHint: `El roadmap consume las recomendaciones. Asignar cada R-NN a su fase correspondiente según prioridad. La Fase 4 puede incluir items que no estén en las recomendaciones formales — son prácticas de mejora continua. Si una R tiene prioridad INMEDIATA va a Fase 1; ALTA va a Fase 2; MEDIA va a Fase 3; BAJA va a Fase 4. Una misma R puede aparecer en dos fases si se ejecuta progresivamente (ej: cerco eléctrico, primero recuperación inicial en F1, despliegue completo en F2).`,
  },
  {
    key: "conclusions",
    title: "Conclusiones y Próximos Pasos",
    description: `Cierre integral del informe en cuatro bloques:

10.1 CONCLUSIÓN INTEGRAL — 3-4 párrafos:

Párrafo 1: síntesis del nivel de riesgo agregado, los sectores críticos identificados y la naturaleza concreta vs potencial del riesgo. Frase ancla: "El análisis integral de [Instalación] evidencia un nivel de vulnerabilidad [ALTO/CRÍTICO], sostenido por una combinación estructural de factores: alta exposición perimetral, presencia de amenazas activas y verificadas en el entorno, y limitaciones simultáneas en infraestructura y tecnología de seguridad."

Párrafo 2: foco en los sectores/sistemas que concentran el riesgo: "Los sectores X e Y concentran los riesgos más críticos, combinando visibilidad total desde el exterior, falta de iluminación, accesos facilitados y actividad delictual comprobada."

Párrafo 3: declarar la naturaleza del riesgo. Frase ancla: "Es importante destacar que varias de las vulnerabilidades detectadas YA ESTÁN SIENDO ACTIVAMENTE UTILIZADAS (perforaciones, vigilancia desde altura, intentos de ingreso documentados): el riesgo no es potencial sino concreto y vigente. Sin acción correctiva, la instalación continuará operando bajo un escenario de exposición elevado, con probabilidad real de pérdidas operativas y eventos de seguridad de impacto material."

10.2 IMPACTO ESPERADO DE LA IMPLEMENTACIÓN — Bullets con el cambio proyectado al ejecutar el plan:
   - Reducir la probabilidad de intrusión en una magnitud sustancial al cerrar simultáneamente vectores físicos, electrónicos y de monitoreo
   - Aumentar la capacidad de detección temprana mediante CCTV integral con monitoreo 24/7, transformando el ciclo de detección-respuesta de reactivo a preventivo
   - Mejorar los tiempos de respuesta ante eventos en desarrollo gracias al patrullaje vehicular nocturno y a la articulación con monitoreo central
   - Fortalecer el control del perímetro con un cierre íntegro, cerco eléctrico continuo e iluminación efectiva
   - Mitigar el riesgo normativo de la operación ferroviaria mediante coordinación institucional y medidas indirectas

10.3 PROYECCIÓN DE REDUCCIÓN DE RIESGO — Card visual destacada con texto: "Riesgo agregado actual: [ALTO/CRÍTICO]  →  Riesgo proyectado a 6 meses: [MEDIO / MEDIO-BAJO]". Bajo la card, en gris pequeño: "Sujeto a la implementación coordinada del plan de acción priorizado (Fases 1 y 2)".

10.4 PRÓXIMOS PASOS SUGERIDOS — Bullets accionables a corto plazo:
   - Reunión de socialización: presentación formal del informe a la contraparte del cliente en plazo de 7 días
   - Aprobación del plan de acción Fase 1: acuerdo sobre las medidas de implementación inmediata (R-01, R-02, R-03) en plazo de 14 días
   - Plan de inversión Fases 2-3: elaboración conjunta del plan de inversión y su carta Gantt detallada en plazo de 30 días
   - Comité de seguimiento mensual: instauración de un comité con representación de cliente y proveedor de seguridad para monitorear avance e indicadores`,
    aiPromptHint: `El cierre debe proyectar de Riesgo ALTO o CRÍTICO actual a Riesgo MEDIO o MEDIO-BAJO post-implementación de Fases 1 y 2. La proyección debe ser realista, no aspiracional: si el riesgo actual es CRÍTICO con limitaciones normativas (ej: zona ferroviaria), no se puede proyectar BAJO. Los próximos pasos deben tener plazos concretos en días, no semanas vagas. Si el cliente es del sector industrial, mencionar implicancias operacionales; si es retail/comercio, mencionar implicancias patrimoniales y reputacionales.`,
  },
  {
    key: "annex_photo_evidence",
    title: "Evidencia Fotográfica",
    description: `Anexo A — galería técnica de todas las fotos capturadas durante la inspección. NO es una galería decorativa: cada foto es evidencia técnica que sostiene una vulnerabilidad específica del análisis.

LAYOUT POR FOTO — cada foto ocupa una "tarjeta" con dos columnas: izquierda la imagen (proporción 4:3 o 3:2, ancho ≈40% del contenido), derecha el bloque de texto técnico:

   - LÍNEA 1: "FOTO E-NN" en azul navy + punto medio + badge de severidad (CRÍTICO / ALTO / MEDIO / BAJO) en su color correspondiente
   - LÍNEA 2: TÍTULO DESCRIPTIVO técnico en bold. Ejemplos: "Intentos reiterados de perforación — muro perimetral oeste", "Detalle de perforación activa en sección baja del muro", "Vista del sector sur — elevación natural exterior y poste caído", "Cojín y elementos de permanencia detectados en torre de vigilancia externa"
   - LÍNEA 3-5: OBSERVACIÓN TÉCNICA de 2-3 líneas describiendo qué muestra la imagen, qué evidencia constituye, y CIERRA explícitamente con "Vinculado a la vulnerabilidad V-NN" (o V-NN y V-MM si la foto sostiene varias)

REGLAS DE CALIDAD:
- Las fotos se ordenan por SEVERIDAD descendente (críticas primero, bajas al final), no por orden cronológico de captura
- Cada caption debe ser técnico, no descriptivo neutro. Mal: "Foto de un muro". Bien: "Vista del muro perimetral lindante con la línea férrea. Se observan intentos de forado con técnica de erosión y golpe directo, evidenciando actividad sostenida de reconocimiento e intento de intrusión."
- Si una foto no puede vincularse a una V específica, igual se incluye con caption descriptivo neutro y nota: "Sin vinculación directa a vulnerabilidad — incluida como contexto de la inspección"
- Si la foto tiene metadata GPS y timestamp, mencionar al final del caption: "(coord: -33.351, -70.751 · 14:32 hrs)"`,
    aiPromptHint: `Cada foto debe estar caption-eada técnicamente, vinculada a la vulnerabilidad que evidencia. La IA recibe un dataset de fotos enriquecido (output del paso de vision analysis del Bloque 2) que incluye descripción técnica + severidad estimada + posibles V vinculadas. La IA usa eso pero refina el caption final para que sea coherente con las V finales que quedaron numeradas en la sección 6. NO inventar GPS o timestamps si no están en el dataset.`,
  },
  {
    key: "annex_normative_glossary",
    title: "Marco Normativo y Glosario Técnico",
    description: `Anexo B — sección de cierre con tres tablas obligatorias, un párrafo introductorio breve ("Estándares de referencia y definiciones aplicadas en el presente informe"), y luego:

B.1 MARCO NORMATIVO CHILENO — Tabla con columnas Normativa | Descripción y aplicación. Filas obligatorias (ajustar según contexto del cliente):
   - DS Nº 1.814 (2015): Reglamento del DL Nº 3.607 sobre Funcionamiento de Vigilantes Privados, Guardias de Seguridad y demás actividades de seguridad privada en Chile. Define facultades y limitaciones operativas del personal de seguridad privada, incluyendo el ámbito territorial de su acción.
   - OS-10 — Carabineros de Chile: Departamento de Control de Servicios de Seguridad Privada de Carabineros. Autoridad fiscalizadora del régimen de seguridad privada, certificación de personal y autorización de instalaciones.
   - Ley Nº 19.303: Establece obligaciones de las empresas en materia de seguridad y prevención de delitos contra sus dependientes, complementaria al régimen de seguridad privada del DL Nº 3.607.
   - DL Nº 3.607 (texto refundido): Norma matriz que regula el funcionamiento de los vigilantes privados en Chile.

B.2 ESTÁNDARES INTERNACIONALES DE REFERENCIA — Tabla con columnas Estándar | Descripción. Filas obligatorias:
   - ISO 31000:2018 — Gestión del Riesgo: Directrices. Marco de referencia internacional para la identificación, análisis, evaluación y tratamiento del riesgo en organizaciones.
   - ASIS Protection of Assets (POA): Manual de referencia de ASIS International para la protección de activos físicos y humanos. Provee la metodología de evaluación de vulnerabilidades aplicada en el presente informe.
   - CPTED — Crime Prevention Through Environmental Design: Prevención del Delito mediante el Diseño Ambiental. Establece principios de control natural de accesos, vigilancia natural, refuerzo territorial y mantenimiento, aplicados al diagnóstico del entorno.
   - ISO 22301:2019: Sistemas de Gestión de la Continuidad del Negocio. Referencia complementaria para la evaluación del impacto operacional de los riesgos identificados.

B.3 GLOSARIO DE TÉRMINOS — Tabla con columnas Término | Definición. Mínimo 10 términos. Términos obligatorios:
   - Amenaza: Causa potencial de un evento no deseado que puede resultar en daño a personas, activos o procesos.
   - Vulnerabilidad: Debilidad de un activo o sistema que puede ser explotada por una o más amenazas para causar daño.
   - Riesgo: Combinación de la probabilidad de ocurrencia de un evento adverso y la severidad de su impacto. Riesgo = Probabilidad × Impacto.
   - Riesgo inherente: Nivel de riesgo previo a la aplicación de controles o medidas de mitigación.
   - Riesgo residual: Nivel de riesgo que permanece luego de aplicar las medidas de mitigación recomendadas.
   - Modus operandi: Patrón consistente de acción empleado por un actor delictual, observable y susceptible de análisis preventivo.
   - Vector de ingreso: Vía o método identificable mediante el cual un actor externo puede acceder al recinto protegido.
   - Disuasión activa: Conjunto de medidas dinámicas (presencia visible, patrullaje, iluminación, alertas) cuyo propósito es desincentivar la acción delictual antes de su materialización.
   - Detección temprana: Capacidad de identificar un evento adverso en su fase inicial, idealmente antes del ingreso, mediante sensores, analítica de video o vigilancia humana especializada.
   - Ventana operativa: Intervalo de tiempo en el cual un sistema de seguridad presenta cobertura reducida o nula, susceptible de ser identificado y explotado por un actor externo.
   - CPTED: Crime Prevention Through Environmental Design. Metodología de prevención del delito mediante el diseño y manejo del entorno físico.
   - Hallazgo: Observación documentada en visita técnica, susceptible de ser categorizada como vulnerabilidad si su severidad lo amerita.`,
    aiPromptHint: `Las normativas chilenas son ESTÁNDAR para informes de seguridad privada en Chile — la IA debe usarlas literalmente. Los estándares internacionales pueden ampliarse según el sector del cliente (retail, financiero, industrial, salud) pero los 4 listados son la base mínima. El glosario es estándar Gard — los 12 términos listados deben respetarse textualmente; pueden agregarse 2-4 términos adicionales si el contexto del cliente lo requiere (ej: para clientes del sector logístico agregar "Cadena de custodia").`,
  },
];

// ────────────────────────────────────────────────────────────────────────────
// LÓGICA DE SEED
// ────────────────────────────────────────────────────────────────────────────

type ChangeReport = {
  key: string;
  action: "updated" | "skipped_user_edited" | "skipped_unchanged" | "not_found";
  diff?: { field: string; from: string; to: string }[];
};

async function seedGardCustomSections(): Promise<void> {
  console.log("🛡️  Pre-poblado VRA — Tenant Gard Security");
  console.log(
    `Modo: ${FORCE_OVERWRITE ? "FORCE OVERWRITE (sobrescribe ediciones manuales)" : "RESPETA ediciones manuales"}\n`,
  );

  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
  });
  if (!tenant) {
    console.error(`❌ Tenant con slug "${TENANT_SLUG}" no encontrado.`);
    process.exit(1);
  }
  console.log(`✅ Tenant encontrado: ${tenant.name} (${tenant.id})\n`);

  const tenantTemplates = await prisma.vraSectionTemplate.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sortOrder: "asc" },
  });

  if (tenantTemplates.length === 0) {
    console.error(
      `❌ No hay plantillas VRA para el tenant ${TENANT_SLUG}. Debes ejecutar primero el seed del Bloque 1 (visitar /opai/configuracion/informes-vulnerabilidad o llamar a POST /api/vra/section-templates/seed).`,
    );
    process.exit(1);
  }
  console.log(`📚 Plantillas existentes en tenant: ${tenantTemplates.length}\n`);

  const changes: ChangeReport[] = [];

  for (const patch of GARD_SECTIONS) {
    const existing = tenantTemplates.find((t) => t.key === patch.key);

    if (!existing) {
      changes.push({ key: patch.key, action: "not_found" });
      continue;
    }

    // Detectar si el tenant editó manualmente esta sección desde la UI:
    // updated_at > created_at + 5 min implica edición manual posterior al seed
    const userEdited =
      existing.updatedAt.getTime() - existing.createdAt.getTime() > 5 * 60 * 1000;

    if (userEdited && !FORCE_OVERWRITE) {
      changes.push({ key: patch.key, action: "skipped_user_edited" });
      continue;
    }

    const diff: { field: string; from: string; to: string }[] = [];
    if (existing.title !== patch.title) {
      diff.push({ field: "title", from: existing.title, to: patch.title });
    }
    if (existing.description !== patch.description) {
      diff.push({
        field: "description",
        from: `${existing.description.slice(0, 60)}...`,
        to: `${patch.description.slice(0, 60)}...`,
      });
    }
    if ((existing.aiPromptHint ?? "") !== patch.aiPromptHint) {
      diff.push({
        field: "aiPromptHint",
        from: existing.aiPromptHint?.slice(0, 60) ?? "(vacío)",
        to: `${patch.aiPromptHint.slice(0, 60)}...`,
      });
    }

    if (diff.length === 0) {
      changes.push({ key: patch.key, action: "skipped_unchanged" });
      continue;
    }

    await prisma.vraSectionTemplate.update({
      where: { id: existing.id },
      data: {
        title: patch.title,
        description: patch.description,
        aiPromptHint: patch.aiPromptHint,
      },
    });

    changes.push({ key: patch.key, action: "updated", diff });
  }

  console.log("📊 Resumen de cambios:\n");
  const updated = changes.filter((c) => c.action === "updated");
  const skippedEdited = changes.filter((c) => c.action === "skipped_user_edited");
  const skippedUnchanged = changes.filter((c) => c.action === "skipped_unchanged");
  const notFound = changes.filter((c) => c.action === "not_found");

  console.log(`   ✅ Actualizadas: ${updated.length}`);
  for (const c of updated) {
    console.log(`      · ${c.key}: ${c.diff!.map((d) => d.field).join(", ")}`);
  }

  if (skippedEdited.length > 0) {
    console.log(
      `   ⏭️  Saltadas por edición manual del tenant: ${skippedEdited.length}`,
    );
    for (const c of skippedEdited) {
      console.log(`      · ${c.key}`);
    }
    console.log(
      `      💡 Para forzar sobrescritura: VRA_GARD_FORCE_OVERWRITE=true npx tsx prisma/seeds/vra-gard-custom-sections.ts`,
    );
  }

  if (skippedUnchanged.length > 0) {
    console.log(`   ⏭️  Saltadas sin cambios: ${skippedUnchanged.length}`);
  }

  if (notFound.length > 0) {
    console.log(
      `   ⚠️  No encontradas en tenant (revisar Bloque 1): ${notFound.length}`,
    );
    for (const c of notFound) {
      console.log(`      · ${c.key}`);
    }
  }

  console.log("\n✨ Seed VRA Gard completado.\n");
}

seedGardCustomSections()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
