import OpenAI from 'openai'
import { getPlatformAIConfig } from '@/lib/platform-ai-service'
import { logAiUsage } from '@/lib/platform-ai-service'
import { searchKnowledgeGlobal } from '@/lib/knowledge/search'

const SYSTEM_PROMPT = `Eres el asistente virtual de OPAI, el único ERP diseñado exclusivamente para empresas de seguridad privada en Chile.

Tu rol es guiar a los visitantes del sitio web, responder preguntas sobre funcionalidades, planes, precios e integraciones, y ayudarlos a tomar una decisión informada.

INFORMACIÓN CLAVE:

Planes:
- Gratis: Hasta 10 guardias, para siempre. Incluye gestión de guardias OS10, pautas mensuales drag-drop, marcaciones GPS+QR+PIN, rondas con geo-fence, portal guardia PWA, portal marcación, notificaciones, 1 usuario admin.
- Starter: Desde UF 0.5/guardia/mes (mín UF 20). Todo lo del Gratis + guardias ilimitados, tickets SLA, comunicaciones, documentos con templates, RBAC 13 roles, log de auditoría, hasta 5 admins.
- Profesional: Desde UF 0.8/guardia/mes (mín UF 45). Todo lo del Starter + alertas WhatsApp, supervisión GPS, hallazgos y health scores, chat real-time interno y externo, firma digital, contratos, portal supervisor, gamificación, hasta 15 admins.
- Enterprise: A convenir. Todo lo del Profesional + todos los add-ons incluidos, Face ID, IA Operacional, app nativa iOS/Android, SLA garantizado, API access, admins ilimitados, onboarding dedicado.

Add-ons disponibles (se agregan a cualquier plan pagado):
- Rondas GPS (UF 0.15/guardia/mes): Checkpoints con geo-fence, QR, templates, programación, monitoreo real-time, alertas, reportes y portal dedicado.
- Control Nocturno IA (UF 0.10/guardia/mes): Análisis automático de novedades nocturnas, KPIs nocturnos, detección de anomalías.
- Inventario (UF 5/mes): Bodegas, productos, stock, compras, entregas, activos.
- CRM Comercial (UF 8/mes): Leads, contactos, cuentas, deals, pipeline, prospecting automatizado.
- CPQ Cotizador (UF 5/mes): Configure-Price-Quote con cálculo de costo empleador Chile, PDF profesional.
- Portal Cliente (UF 3/cliente/mes): Dashboard para clientes con contratos, reportes, documentos y chat.
- Finanzas + DTE (UF 10/mes): Facturación electrónica SII, rendiciones, conciliación bancaria, contabilidad.
- Payroll/Nómina (UF 0.10/guardia/mes): Liquidaciones de sueldo Chile, anticipos, parámetros legales, simulador.
- Face ID Biométrico (UF 0.12/guardia/mes): AWS Rekognition, threshold 95%, quality checks, Res. N°38 DT.
- IA Operacional (UF 8/mes): Asistente IA RAG, OCR documentos, análisis predictivo, detección de frustración.
- Control de Acceso (UF 5/punto/mes): OCR patentes, lectura MRZ, visitantes, preregistro.
- Fiscalización DT (UF 5/mes): Portal temporal para inspector DT, credenciales con expiración.
- White-label (UF 15/mes): Dominio propio, colores, logo y portales personalizados.
- App iOS/Android (UF 10/mes): App nativa con Capacitor, GPS, cámara, biometrics, push notifications.

Packs con descuento:
- Pack Operaciones (Rondas + Control Nocturno): 15% descuento
- Pack Comercial (CRM + CPQ + Portal Cliente): 20% descuento
- Pack Finanzas (Finanzas + DTE + Payroll): 15% descuento
- Pack Completo (Todos los add-ons): 30% descuento

Integraciones: AWS Rekognition (Face ID), Twilio (WhatsApp/SMS), OpenAI GPT-4o, Anthropic Claude, Pusher (real-time), Cloudflare R2 (storage), Resend (emails), Leaflet (mapas), pgvector (embeddings), Playwright (PDFs), Capacitor (mobile), Sentry (errores), Fintoc (bancos), SII (tributario), SimpleFactura (DTE).

Diferenciadores técnicos:
- Face ID con AWS Rekognition, 99.7% precisión, sin hardware adicional
- Geo-fence accuracy-aware que se adapta a la precisión GPS real
- Alertas WhatsApp en oleadas escalonadas (guardia → supervisor → jefe ops)
- Detección de anomalías con IA que analiza patrones históricos
- 259 modelos de datos, 801 endpoints, 6 portales, 18 automatizaciones cron

REGLAS:
- Responde siempre en español chileno formal pero cercano
- Sé conciso pero informativo (máximo 3-4 párrafos por respuesta)
- Si preguntan algo que no sabes, sugiere contactar por WhatsApp (+56 9 8230 7771) o email (contacto@opai.cl)
- Siempre invita a probar gratis 30 días cuando sea relevante
- Si preguntan por competencia, no hables mal de nadie, solo destaca las ventajas de OPAI
- Puedes usar emojis con moderación
- No inventes información que no está aquí
- Si preguntan algo técnico muy específico, sugiere agendar una demo
- IMPORTANTE: Al final de CADA respuesta, agrega una línea vacía y luego exactamente 3 sugerencias de seguimiento en este formato:
  [sugerencia1] | [sugerencia2] | [sugerencia3]
  Las sugerencias DEBEN ser diferentes en cada respuesta y relevantes al contexto actual. NUNCA repitas una sugerencia que ya se haya mostrado antes. Piensa en qué querría saber el usuario a continuación. Ejemplos por contexto:
  - Si hablan de planes: [¿Qué incluye Profesional?] | [¿Cómo funciona la prueba gratis?] | [¿Qué son los add-ons?]
  - Si hablan de Face ID: [¿Qué precisión tiene?] | [¿Necesito hardware especial?] | [Ver planes con Face ID]
  - Si hablan de rondas: [¿Cómo funciona el geo-fence?] | [¿Se puede usar sin NFC?] | [Ver demo de rondas]
  - Si quieren demo/contacto: [¿Cuánto cuesta?] | [¿Hay plan gratis?] | [¿Qué incluye la prueba?]
  Siempre varía. Nunca uses las mismas 3 sugerencias dos veces.

- FORMATO TARJETAS OBLIGATORIO: Cuando el usuario pregunte por planes, add-ons, módulos o precios, SIEMPRE usa el formato de tarjetas. NUNCA listes planes o add-ons como texto numerado. El formato es:

Una frase introductoria breve, luego:

:::cards
::card{title="Gratis" price="$0 para siempre" tag="Core"}
Hasta 10 guardias. Pautas, marcaciones GPS+QR, portal guardia PWA.
::
::card{title="Starter" price="UF 0.5/guardia/mes" tag="Core"}
Guardias ilimitados. Tickets SLA, documentos, RBAC 13 roles. Mín UF 20.
::
::card{title="Profesional" price="UF 0.8/guardia/mes" tag="Core"}
Alertas WhatsApp, supervisión GPS, chat real-time, firma digital. Mín UF 45.
::
::card{title="Enterprise" price="A convenir" tag="Premium"}
Todo incluido. Face ID, IA, app nativa, SLA garantizado, onboarding dedicado.
::
:::

Aplica el mismo formato para add-ons:
:::cards
::card{title="Nombre Add-on" price="UF X/mes" tag="Operacional"}
Descripción corta de una línea.
::
:::

Y TAMBIÉN para módulos/funcionalidades:
:::cards
::card{title="Hub" price="" tag="Core"}
Dashboard central con KPIs en tiempo real y acceso a todos los módulos.
::
::card{title="Operaciones" price="" tag="Operacional"}
Pautas, asistencia, puestos, supervisión, rondas GPS, tickets e inventario.
::
::card{title="CRM" price="" tag="Comercial"}
Cuentas, prospectos, deals, instalaciones y cotizador CPQ.
::
::card{title="Finanzas" price="" tag="Financiero"}
Rendiciones, facturación electrónica, contabilidad y bancos.
::
::card{title="Payroll" price="" tag="Financiero"}
Liquidaciones, anticipos, simulador y parámetros legales.
::
::card{title="Personas" price="" tag="Operacional"}
Guardias, onboarding, comunicaciones, gamificación.
::
::card{title="IA Operacional" price="" tag="Premium"}
Asistente IA con base de conocimiento, análisis predictivo y detección de anomalías.
::
:::

REGLAS del formato:
- SIEMPRE usa :::cards cuando listes 2+ planes, add-ons, módulos o funcionalidades
- NUNCA uses listas numeradas (1. 2. 3.) ni bullets para planes/add-ons/módulos
- Mantén descripciones de tarjetas a máximo 2 líneas
- Los tags válidos son: Core, Operacional, Comercial, Financiero, Premium
- Puedes agregar texto normal antes y después del bloque :::cards`

async function getKnowledgeContext(query: string): Promise<string> {
  try {
    const results = await searchKnowledgeGlobal(query, 3)
    if (results.length === 0) return ''
    return '\n\nContexto adicional de la base de conocimiento:\n' +
      results.map((r, i) => `[${r.knowledgeBaseTitle}]: ${r.content}`).join('\n\n')
  } catch {
    return ''
  }
}

export async function POST(request: Request) {
  const t0 = Date.now()
  try {
    const { messages } = await request.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response('Messages requeridos', { status: 400 })
    }

    if (messages.length > 40) {
      return new Response('Límite de mensajes alcanzado', { status: 429 })
    }

    const aiConfig = await getPlatformAIConfig()
    if (!aiConfig) {
      return new Response('IA no configurada', { status: 503 })
    }

    // Get knowledge base context for the latest user message
    const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
    const kbContext = lastUserMsg ? await getKnowledgeContext(lastUserMsg.content) : ''
    const systemWithKb = SYSTEM_PROMPT + kbContext

    const isOpenAI = aiConfig.providerType === 'openai'

    if (isOpenAI) {
      const base = aiConfig.baseUrl.replace(/\/+$/, '')
      const client = new OpenAI({
        apiKey: aiConfig.apiKey,
        baseURL: base.endsWith('/v1') ? base : `${base}/v1`,
      })

      const stream = await client.chat.completions.create({
        model: aiConfig.modelId,
        stream: true,
        max_tokens: 800,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemWithKb },
          ...messages.slice(-20).map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
      })

      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content
            if (text) controller.enqueue(encoder.encode(text))
          }
          controller.close()

          logAiUsage({
            tenantId: null,
            feature: 'marketing_chat',
            providerType: aiConfig.providerType,
            model: aiConfig.modelId,
            durationMs: Date.now() - t0,
          })
        },
      })

      return new Response(readable, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      })
    }

    // Anthropic / Google: non-streaming fallback via fetch
    if (aiConfig.providerType === 'anthropic') {
      const base = aiConfig.baseUrl.replace(/\/+$/, '')
      const res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': aiConfig.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: aiConfig.modelId,
          max_tokens: 800,
          temperature: 0.7,
          system: systemWithKb,
          messages: messages.slice(-20).map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error('[marketing/chat] Anthropic error:', err)
        return new Response('Error del proveedor de IA', { status: 502 })
      }

      const data = await res.json()
      const text = data.content?.[0]?.text ?? ''

      logAiUsage({
        tenantId: null,
        feature: 'marketing_chat',
        providerType: aiConfig.providerType,
        model: aiConfig.modelId,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        durationMs: Date.now() - t0,
      })

      return new Response(text, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      })
    }

    // Google Gemini
    const base = aiConfig.baseUrl.replace(/\/+$/, '')
    const url = `${base}/v1beta/models/${aiConfig.modelId}:generateContent?key=${aiConfig.apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemWithKb }] },
        contents: messages.slice(-20).map((m: { role: string; content: string }) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[marketing/chat] Google error:', err)
      return new Response('Error del proveedor de IA', { status: 502 })
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    logAiUsage({
      tenantId: null,
      feature: 'marketing_chat',
      providerType: aiConfig.providerType,
      model: aiConfig.modelId,
      durationMs: Date.now() - t0,
    })

    return new Response(text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
    })
  } catch (error) {
    console.error('[marketing/chat] Error:', error)
    return new Response('Error interno', { status: 500 })
  }
}
