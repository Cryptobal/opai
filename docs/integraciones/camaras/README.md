# Cámaras IP — documentación del módulo

Add-on `ops_camaras`. OPAI es plano de control; el video va del NVR/cámara al relay go2rtc
(`media.opai.cl`) y de ahí al navegador (WebRTC/MSE) con tokens de 10 min emitidos por OPAI.

| Documento | Para qué |
|---|---|
| `setup-relay-y-checklist.md` | Montar el relay (Hetzner + Caddy + go2rtc), variables en Vercel, pasos manuales, plan B para CGNAT |
| `brief-fase1-visualizacion.md` | Diseño e implementación de la fase 1 (modelos, API, tab, video wall) — PR #1190 |
| `prompt-agente-configurar-camara.md` | Prompt operativo del agente que da de alta cámaras/NVR en instalaciones |
| `prompt-agente-infraestructura-relay.md` | Prompt del agente que crea el VPS, DNS y variables |

Código: `src/lib/camaras/`, `src/app/api/ops/camaras/`, `src/components/ops/camaras/`,
`src/components/crm/InstalacionCamarasTab.tsx`, página `/ops/camaras`.

Habilitar para un tenant: Platform → Tenant → Add-ons → "Cámaras IP" (o `plan_catalog`/
`tenant_modules` en BD; la UI invalida la caché de módulos, el SQL directo no).

Fase 2 (pendiente): salud de cámaras (offline → alerta/ticket), grabaciones desde NVR,
eventos AcuSense/WizSense + verificación IA → Monitoreo/WhatsApp/R2, CPQ y portal cliente.
