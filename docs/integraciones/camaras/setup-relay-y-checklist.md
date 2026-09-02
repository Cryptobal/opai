# CHECKLIST — Todo lo que tienes que hacer tú para dejar Cámaras operativo

Reemplaza al runbook anterior. Orden recomendado: A → B → C → D → E → F → G.
Lo que hace Claude Code está en `brief-camaras-fase1.md`; aquí va solo lo manual.

---

## A. Cámara Hikvision en la oficina (30 min)

- [ ] Comprar cualquier cámara IP Hikvision con RTSP (ej. DS-2CD1043G2-I bullet 4 MP o una PTZ DS-2DE2A404IW si quieres probar paneo). Evita las líneas "EZVIZ" (consumo, RTSP a veces bloqueado).
- [ ] Conectar a la red de la oficina por cable (PoE o adaptador). Activarla desde la app Hik-Connect o SADP; anotar `IP_LOCAL_CAMARA`.
- [ ] Web de la cámara (`http://IP_LOCAL_CAMARA`, usuario admin):
  - Sistema → Gestión de usuarios → **Añadir usuario `opai`**, nivel Operador, permisos: Vista en directo, PTZ, Reproducción. Clave de 12+ caracteres sin `@ : / ? #`.
  - Red → Config. avanzada → Puertos → **RTSP 554** activo.
  - Sistema → Seguridad → **Autenticación RTSP: digest/basic**.
  - Red → Config. avanzada → Protocolo de integración → **ONVIF activado**, usuario ONVIF `opai` (misma clave), nivel Operador. (Necesario para PTZ.)
- [ ] Probar en VLC desde la misma red: `rtsp://opai:CLAVE@IP_LOCAL_CAMARA:554/Streaming/Channels/102`. Sin imagen aquí, no sigas.

## B. Router de la oficina (15 min)

- [ ] Fijar IP estática o reserva DHCP para la cámara.
- [ ] Port forwarding: externo **554 TCP** → `IP_LOCAL_CAMARA:554`. Si quieres PTZ: externo **8080 TCP** → `IP_LOCAL_CAMARA:80` (usa 8080 afuera para no exponer el 80 obvio).
- [ ] Buscar en Google "cuál es mi IP" → `IP_PUBLICA`. Comparar con la IP WAN del router:
  - Iguales y no empiezan con `100.64`–`100.127` → tienes IP pública. Sigue.
  - Distintas o rango `100.x` → **CGNAT**. Pedir IP pública al ISP (Entel/Movistar/VTR/Mundo, gratis o ~$3.000/mes). Sin esto el esquema no funciona; avísame para plan B (túnel).
- [ ] Si la IP pública cambia cada tanto: DDNS en el router o en la cámara (Red → DDNS → Hik DDNS o No-IP) → `HOST_DDNS`. Usa ese host en vez de la IP.
- [ ] Probar desde el celular con 4G (Wi-Fi apagado), VLC móvil: `rtsp://opai:CLAVE@IP_PUBLICA:554/Streaming/Channels/102`. Debe verse.

## C. VPS en Hetzner (15 min)

- [ ] https://console.hetzner.cloud → Project `opai-media` → Add Server: Ashburn (US-East), Ubuntu 24.04, **CPX21** (~USD 9/mes), IPv4 sí, SSH key tuya.
- [ ] Firewall asignado al server, entrada: TCP 22, TCP 80, TCP 443, TCP 8555, UDP 8555.
- [ ] Anotar `IP_VPS`.

## D. DNS en Cloudflare (2 min)

- [ ] Zona `opai.cl` → DNS → `A` `media` → `IP_VPS` → **Proxy: DNS only (nube gris)**. Con nube naranja el WebRTC no funciona.

## E. Instalar el relay (20 min) — versión definitiva, ya integrada con OPAI

Genera antes dos secretos largos (en tu Mac): `openssl rand -hex 32` dos veces → `ADMIN_TOKEN` y `JWT_SECRET`. Los vas a usar aquí y en Vercel (paso F).

```bash
ssh root@IP_VPS
apt update && apt install -y docker.io docker-compose-v2 apache2-utils
mkdir -p /opt/opai-media && cd /opt/opai-media
```

`go2rtc.yaml` (para la prueba inicial deja la cámara aquí; después OPAI las agrega solo por API):

```yaml
api:
  listen: ":1984"
webrtc:
  listen: ":8555"
  candidates:
    - IP_VPS:8555
streams:
  prueba_oficina: rtsp://opai:CLAVE@IP_PUBLICA:554/Streaming/Channels/102
```

`Caddyfile` — tres zonas: UI admin con clave, API admin con header secreto, streams con validación de token contra OPAI:

```
media.opai.cl {
  # 1) Admin de streams: solo OPAI (server-side) con header secreto
  @admin {
    path /api/streams*
    header X-Relay-Admin "ADMIN_TOKEN"
  }
  handle @admin {
    reverse_proxy go2rtc:1984
  }
  @admin_bad path /api/streams*
  respond @admin_bad 403

  # 2) Streams para navegadores: token JWT validado por OPAI
  @media path /api/ws /api/webrtc /api/frame.jpeg /api/stream.mp4 /api/stream.m3u8*
  handle @media {
    forward_auth https://opai.cl {
      uri /api/ops/camaras/relay/verify
      copy_headers X-Forwarded-Uri
    }
    reverse_proxy go2rtc:1984
  }

  # 3) UI de go2rtc para ti (diagnóstico)
  handle {
    basic_auth {
      opai HASH_BCRYPT
    }
    reverse_proxy go2rtc:1984
  }
}
```

Generar `HASH_BCRYPT`: `htpasswd -nbB opai 'TU_CLAVE_WEB' | cut -d: -f2` y pegarlo.

`docker-compose.yml`:

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

```bash
docker compose up -d && docker compose logs -f go2rtc
```

Verificación de la prueba (antes de que exista el código de OPAI):
- [ ] `https://media.opai.cl` → clave web → Streams → `prueba_oficina` → **webrtc**: video < 1 s.
- [ ] Desde 4G también.
- [ ] `docker stats`: anotar CPU y Mbps por stream.
- [ ] Mientras no exista `/api/ops/camaras/relay/verify` en OPAI, la zona 2 devolverá error: es esperado. La UI (zona 3) sirve igual para la prueba.

## F. Variables en Vercel (5 min) — Project `opai` → Settings → Environment Variables

| Variable | Valor | Entornos |
|---|---|---|
| `MEDIA_RELAY_URL` | `https://media.opai.cl` | Production, Preview |
| `NEXT_PUBLIC_MEDIA_RELAY_URL` | `https://media.opai.cl` | Production, Preview |
| `MEDIA_RELAY_ADMIN_TOKEN` | `ADMIN_TOKEN` (el mismo del Caddyfile) | Production, Preview |
| `MEDIA_RELAY_JWT_SECRET` | `JWT_SECRET` | Production, Preview |
| `CAMERA_CREDENTIALS_SECRET` | `openssl rand -hex 32` (tercer secreto, distinto) | Production, Preview |

Agregar también las cinco a tu `.env.local` para desarrollo. No cambiar `CAMERA_CREDENTIALS_SECRET` después de guardar cámaras (deja las claves ilegibles).

## G. Orden de ejecución con Claude Code

1. [ ] Completar A–F.
2. [ ] Claude Code: `brief-camaras-fase1.md` en rama `feat/ops-camaras-fase1` (una noche).
3. [ ] Revisar PR; merge a `main` con tu confirmación; Vercel despliega (aplica la migración aditiva).
4. [ ] Habilitar módulo `ops_camaras` para Gard en Platform → Tenant → Add-ons.
5. [ ] Asignar permiso `ops.camaras` (view/edit) y capability `camaras_configure` a tu rol.
6. [ ] Ficha de una instalación → Cámaras → Agregar: NVR/Cámara, Hikvision, host `IP_PUBLICA` o `HOST_DDNS`, puerto 554, canal 1, sub-stream, usuario `opai`, clave → Probar → Guardar. Debe aparecer el snapshot.
7. [ ] `/ops/camaras` → seleccionar instalación → ver en vivo. Guardar una página.
8. [ ] Borrar `prueba_oficina` de `go2rtc.yaml` (ya no hace falta) y `docker compose restart go2rtc`.

## H. Qué viene después (fase 2, briefs separados)

- Grabaciones: línea de tiempo + playback desde el NVR (`/Streaming/tracks/…`, ISAPI search).
- Eventos de cámara (AcuSense/WizSense) → verificación con IA → alerta en Monitoreo + WhatsApp + clip a R2.
- Analítica propia en el VPS para cámaras sin IA (requiere subir el VPS a CPX41 o GPU).
- Portal cliente, líneas CPQ por cámara, salud de cámaras (offline → ticket).
- Conector Hik-Partner Pro (registro como partner) y bridge físico para clientes que no puedan abrir su red.

## Seguridad al terminar la prueba

- [ ] Restringir en el router el port-forward 554/8080 a origen `IP_VPS` si el router lo permite.
- [ ] Rotar la clave web de go2rtc y no compartir `ADMIN_TOKEN`/`JWT_SECRET` fuera de Vercel y el VPS.
- [ ] Backups: `/opt/opai-media` en el VPS son 3 archivos; guárdalos en 1Password.

## Problemas frecuentes

| Síntoma | Causa |
|---|---|
| VLC local sí, remoto no | Port-forward mal o CGNAT (B) |
| webrtc negro, mse funciona | UDP 8555 cerrado o `candidates` con IP errada |
| 401 en logs go2rtc | Clave RTSP o autenticación RTSP ≠ digest/basic |
| Sin certificado HTTPS | DNS con nube naranja o puerto 80 cerrado |
| OPAI dice "Relay no disponible" | `MEDIA_RELAY_ADMIN_TOKEN` distinto al del Caddyfile |
| Video carga en la UI de go2rtc pero no en OPAI | `MEDIA_RELAY_JWT_SECRET` distinto o `/relay/verify` aún no desplegado |
