# Velocidad comercial — el cockpit de Slack (playbook)

> La velocidad es ventaja competitiva estructural. El objetivo de cada decisión:
> minimizar **tiempo a primera respuesta** y **tiempo a cotización enviada**, y
> maximizar la tasa de seguimiento. Todo desde Slack, sin abrir OPAI.

La implementación técnica está en `docs/integrations/slack.md` (Fase 15).

## 1. Los 5 minutos de oro (el lead recién llegado)

Suena el lead. La tarjeta de `new_lead` llega al canal comercial **con botones**:

- **👤 Tomar** — te lo asignas y **corta el escalamiento** al instante. Es lo primero
  que hay que apretar: mientras nadie lo toma, el cron de escalamiento sigue insistiendo.
- **🟢 WhatsApp** — abre WhatsApp (un toque, funciona en el teléfono) con el mensaje de
  primer contacto ya escrito (nombre/empresa del lead).
- **✉️ Cotizar** — si el lead vino del cotizador con dotación, cotiza exprés ahí mismo.
- **📝 Convertir en OPAI** — si necesitas el cockpit completo (cuenta, instalación con
  mapa, líneas, condiciones), deep-link directo al formulario web ya prellenado.
- **📅 Recordar 2h** / **❌ Descartar (motivo)** — para no perderlo ni ensuciar el pipeline.

La bandeja `/opai leads` (o `/opai leads nuevos`) muestra los **sin tomar primero y
destacados**: es tu cola de trabajo. La empresa del lead llega **auto-enriquecida**
(giro/web/tamaño) para que decidas rápido.

**Meta:** lead a las 10:02 → tomado y WhatsApp de apertura a las 10:03 → cotización
enviada a las 10:07, sin abrir OPAI.

## 2. El momento caliente (el cliente está mirando)

Cuando el cliente **abre tu cotización en el portal**, llega la señal de venta #1:

> 🔥 **{Contacto} de {Empresa} está viendo la cotización {código} AHORA (vista #N)**
> 💰 monto · vigencia · 📞 Llamar · 🟢 WhatsApp ("vi que estás revisando, ¿te llamo?") · ⏰ Recordar 1h

Es el mejor instante para cerrar: el cliente tiene tu propuesta en pantalla. El WhatsApp de
cierre sale al toque. Si eres el dueño del negocio y tienes tu canal Slack personal activo,
además te llega por DM. (Se silencia 30 min por cotización para no spamear con cada refresco.)

## 3. El loop anti-olvido (48h sin respuesta)

Si el cliente se enfría, el sistema empuja **solo**. A las 48h de enviada una cotización
sin vista ni respuesta, llega al canal:

> ⏳ **{Cliente} lleva 48h sin responder {código}**
> 🟢 WhatsApp · ✉️ Reenviar · ⏰ Posponer 24h · 💔 Marcar perdida (motivo)

Cada acción queda registrada, así el loop **se auto-documenta y no repite**: si pospones,
te vuelve a avisar en 24h; si respondes o el cliente la ve, sale sola del radar. Esto
convive con el motor de follow-up por email ya existente (no lo reemplaza).

## 4. El pipeline en la mano

`/opai pipeline` — pipeline por etapa (N negocios · Σ CLP) → entras a una etapa → ves cada
negocio (cliente · monto · días en etapa · última actividad) y actúas: **⏩ Avanzar etapa**,
**🟢 WhatsApp**, **📝 Nota rápida**, **🎉 Ganado**, **💔 Perdido (motivo)**. Al ganar, cae una
tarjeta celebratoria al canal comercial. `/opai cotizaciones [estado]` lista tus quotes con
WhatsApp por fila.

## 5. El lunes, dónde está la plata

Cada lunes 08:00 (o a diario, si lo activas) el **digest comercial** le dice al equipo:

> 📊 Semana comercial: pipeline $X en N negocios · M cotizaciones enviadas (time-to-quote
> prom: Xh) · K vistas sin respuesta · J leads sin tomar · negocios sin actividad >7d.

Y en la pestaña **Inicio** de OPAI tienes tu panel Comercial siempre a mano: leads sin
tomar, cotizaciones por vencer, y si hay un momento caliente activo.

## 6. OPAI en todos los canales

OPAI está presente en todos los canales públicos (botón "Unirse a todos los canales
públicos" en el panel de Slack; los nuevos los toma solo). Le puedes preguntar
**"¿qué está pasando en #reportes-cims?"** o **"resume #ventas"** y te lo resume leyendo lo
último del canal — **sin guardar una sola conversación** (decisión de privacidad v1). Para
canales privados, invítalo con `/invite @OPAI`.
