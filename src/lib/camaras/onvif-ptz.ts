/**
 * PTZ ONVIF mínimo por SOAP (sin dependencia `onvif`).
 * Best effort: Basic Auth + tokens de perfil habituales.
 */

const PROFILE_TOKENS = ["Profile_1", "MediaProfile000", "profile_1", "MainStream"];
const TIMEOUT_MS = 5000;

export type PtzVelocity = { pan: number; tilt: number; zoom: number };

type OnvifCamara = {
  host: string;
  onvifPort: number | null;
  username: string;
};

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function envelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>${body}</s:Body>
</s:Envelope>`;
}

async function postSoap(camara: OnvifCamara, password: string, xml: string): Promise<void> {
  const port = camara.onvifPort || 80;
  const url = `http://${camara.host}:${port}/onvif/PTZ`;
  const auth = Buffer.from(`${camara.username}:${password}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        Authorization: `Basic ${auth}`,
      },
      body: xml,
    });
    if (!res.ok) {
      throw new Error(`ONVIF ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function ptzMove(
  camara: OnvifCamara,
  password: string,
  velocity: PtzVelocity,
): Promise<void> {
  const pan = clamp(velocity.pan);
  const tilt = clamp(velocity.tilt);
  const zoom = clamp(velocity.zoom);
  let lastError: unknown;
  for (const token of PROFILE_TOKENS) {
    const xml = envelope(
      `<tptz:ContinuousMove>
        <tptz:ProfileToken>${token}</tptz:ProfileToken>
        <tptz:Velocity>
          <tt:PanTilt x="${pan}" y="${tilt}"/>
          <tt:Zoom x="${zoom}"/>
        </tptz:Velocity>
      </tptz:ContinuousMove>`,
    );
    try {
      await postSoap(camara, password, xml);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("PTZ no disponible");
}

export async function ptzStop(camara: OnvifCamara, password: string): Promise<void> {
  let lastError: unknown;
  for (const token of PROFILE_TOKENS) {
    const xml = envelope(
      `<tptz:Stop>
        <tptz:ProfileToken>${token}</tptz:ProfileToken>
        <tptz:PanTilt>true</tptz:PanTilt>
        <tptz:Zoom>true</tptz:Zoom>
      </tptz:Stop>`,
    );
    try {
      await postSoap(camara, password, xml);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("PTZ no disponible");
}
