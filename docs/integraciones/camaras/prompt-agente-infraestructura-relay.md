# PROMPT — Agente: dejar operativo el relay de cámaras OPAI (Hetzner + Cloudflare + Vercel)

Actúa como ingeniero de infraestructura de OPAI. Tu tarea es dejar operativo el relay de video
`media.opai.cl` y configurar Vercel, siguiendo exactamente los pasos de abajo. Trabajas para
Carlos Irigoyen (carlos.irigoyen@gard.cl). No improvises fuera de este alcance.

## Reglas

1. Usa solo las credenciales que Carlos te entregue por el canal seguro acordado. Nunca las
   escribas en logs, resúmenes ni mensajes; refiérete a ellas como `[secreto]`.
2. Cada vez que una acción implique un cobro, un dato de pago, un código 2FA/OTP o aceptar términos
   legales, DETENTE y pide a Carlos que lo haga él. No inventes ni reutilices tarjetas.
3. No toques nada en Vercel fuera de las variables de entorno indicadas. No hagas redeploys de
   producción; no cambies otros proyectos.
4. No modifiques registros DNS existentes en `opai.cl`; solo agrega el registro `media`.
5. Si un paso falla dos veces, detente e informa con el error literal.
6. Al final entrega un reporte con: qué quedó hecho, valores no secretos (IP del VPS, dominio),
   y qué pasos quedaron pendientes para Carlos.

## Contexto que Carlos hace por su cuenta (no lo intentes)

- Instalar y configurar la cámara Hikvision de la oficina y el port-forward del router.
- Entregar la URL RTSP pública de prueba: `RTSP_PRUEBA` (formato
  `rtsp://opai:[secreto]@IP_O_DDNS:554/Streaming/Channels/102`).
- Ingresar tarjeta en Hetzner y aprobar 2FA cuando se lo pidas.

## Paso 1 — Secretos

Genera tres cadenas aleatorias de 64 caracteres hex (equivalente a `openssl rand -hex 32`):
`ADMIN_TOKEN`, `JWT_SECRET`, `CAMERA_SECRET`. Guárdalas en el gestor de secretos que Carlos
indique (1Password, vault `OPAI`), nunca en texto en el chat. Genera además una clave web
`WEB_PASS` de 20 caracteres.

## Paso 2 — Hetzner Cloud

1. Ir a https://console.hetzner.cloud y crear cuenta con `carlos.irigoyen@gard.cl`, nombre
   Carlos Irigoyen, empresa Gard SpA, RUT 77.840.623-3, país Chile. Si pide verificación de
   identidad o tarjeta: DETENTE y pide a Carlos que complete ese paso; continúa cuando confirme.
2. Crear proyecto `opai-media`.
3. Security → SSH Keys → agregar la clave pública que Carlos entregue (`SSH_PUBKEY`).
4. Firewalls → crear `opai-media-fw` con reglas de entrada: TCP 22, TCP 80, TCP 443,
   TCP 8555, UDP 8555 desde `0.0.0.0/0` y `::/0`.
5. Servers → Add Server: ubicación Ashburn (US-East), imagen Ubuntu 24.04, tipo CPX21,
   IPv4 público sí, SSH key seleccionada, firewall `opai-media-fw`, nombre `opai-media-01`.
6. Anotar `IP_VPS` (no es secreto).

## Paso 3 — Cloudflare DNS

1. Entrar a Cloudflare con la cuenta que administra `opai.cl` (credenciales de Carlos).
2. Zona `opai.cl` → DNS → Add record: tipo `A`, nombre `media`, IPv4 `IP_VPS`, TTL Auto,
   **Proxy status: DNS only (nube gris)**. Verifica dos veces que NO quede proxied.
3. Confirmar con `dig media.opai.cl` (o equivalente) que resuelve a `IP_VPS`.

## Paso 4 — Instalar relay por SSH

Conéctate como `root@IP_VPS` con la clave privada que Carlos entregue y ejecuta:

```bash
apt update && apt install -y docker.io docker-compose-v2 apache2-utils
mkdir -p /opt/opai-media && cd /opt/opai-media
```

Crea `/opt/opai-media/go2rtc.yaml` sustituyendo `IP_VPS` y `RTSP_PRUEBA`:

```yaml
api:
  listen: ":1984"
webrtc:
  listen: ":8555"
  candidates:
    - IP_VPS:8555
streams:
  prueba_oficina: RTSP_PRUEBA
```

Genera el hash: `htpasswd -nbB opai 'WEB_PASS' | cut -d: -f2` → `HASH_BCRYPT`.

Crea `/opt/opai-media/Caddyfile` sustituyendo `ADMIN_TOKEN` y `HASH_BCRYPT`:

```
media.opai.cl {
  @admin {
    path /api/streams*
    header X-Relay-Admin "ADMIN_TOKEN"
  }
  handle @admin {
    reverse_proxy go2rtc:1984
  }
  @admin_bad path /api/streams*
  respond @admin_bad 403

  @media path /api/ws /api/webrtc /api/frame.jpeg /api/stream.mp4 /api/stream.m3u8*
  handle @media {
    forward_auth https://opai.cl {
      uri /api/ops/camaras/relay/verify
      copy_headers X-Forwarded-Uri
    }
    reverse_proxy go2rtc:1984
  }

  handle {
    basic_auth {
      opai HASH_BCRYPT
    }
    reverse_proxy go2rtc:1984
  }
}
```

Crea `/opt/opai-media/docker-compose.yml`:

```yaml
services:
  go2rtc:
    image: alexxit/go2rtc:latest
    restart: unless-stopped
    ports: ["8555:8555/tcp", "8555:8555/udp"]
    volumes: ["./go2rtc.yaml:/config/go2rtc.yaml"]
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile", "caddy_data:/data"]
volumes:
  caddy_data:
```

Ejecuta `docker compose up -d`, espera 60 s y verifica:

- `curl -s -o /dev/null -w "%{http_code}" https://media.opai.cl/` → `401` (pide clave: correcto).
- `curl -s -o /dev/null -w "%{http_code}" -u opai:WEB_PASS https://media.opai.cl/api/streams` → `403` (sin header admin: correcto).
- `curl -s -H "X-Relay-Admin: ADMIN_TOKEN" https://media.opai.cl/api/streams` → JSON con `prueba_oficina`.
- `docker compose logs go2rtc | tail -30` sin errores de conexión RTSP. Si aparece `401` o
  `timeout` hacia la cámara, informa: es problema del lado de Carlos (router/CGNAT), no tuyo.
- Además: `chmod 600 /opt/opai-media/*` y `apt install -y unattended-upgrades`.

## Paso 5 — Vercel

1. Entrar a Vercel con la cuenta de Carlos. Team `team_AGm3qGX310UEIDmnuJlqvaJE`, proyecto
   `prj_f6rOcAuUQD8pv5SRnL4x7fjmtjZy` (`opai`) → Settings → Environment Variables.
2. Agregar, para entornos Production y Preview, sin sobrescribir ninguna existente:

| Nombre | Valor |
|---|---|
| `MEDIA_RELAY_URL` | `https://media.opai.cl` |
| `NEXT_PUBLIC_MEDIA_RELAY_URL` | `https://media.opai.cl` |
| `MEDIA_RELAY_ADMIN_TOKEN` | `ADMIN_TOKEN` (marcar Sensitive) |
| `MEDIA_RELAY_JWT_SECRET` | `JWT_SECRET` (marcar Sensitive) |
| `CAMERA_CREDENTIALS_SECRET` | `CAMERA_SECRET` (marcar Sensitive) |

3. No dispares redeploy. Las variables se aplicarán en el próximo despliegue que haga Carlos.

## Paso 6 — Reporte final

Entrega a Carlos:
- `IP_VPS`, confirmación DNS, resultado de las 4 verificaciones del paso 4.
- Confirmación de las 5 variables en Vercel (nombres, no valores).
- Dónde quedaron guardados los secretos.
- Pendientes de Carlos: probar `https://media.opai.cl` con usuario `opai` y `WEB_PASS`
  (stream `prueba_oficina` → botón webrtc); merge de `feat/ops-camaras-fase1`; habilitar
  `ops_camaras` para Gard; registrar la cámara desde la ficha de instalación.
