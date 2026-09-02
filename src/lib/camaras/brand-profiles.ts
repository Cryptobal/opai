import type { CameraBrand, RtspCamaraInput, StreamQuality } from "./types";

export type BrandProfile = {
  label: string;
  rtspPort: number;
  onvifPort: number;
  mainPath: (ch: number) => string;
  subPath: (ch: number) => string;
  ptzViaOnvif: boolean;
};

function hikChannel(ch: number, quality: "main" | "sub"): string {
  const suffix = quality === "main" ? "01" : "02";
  return `/Streaming/Channels/${ch}${suffix}`;
}

export const BRAND_PROFILES: Record<CameraBrand, BrandProfile> = {
  hikvision: {
    label: "Hikvision",
    rtspPort: 554,
    onvifPort: 80,
    mainPath: (ch) => hikChannel(ch, "main"),
    subPath: (ch) => hikChannel(ch, "sub"),
    ptzViaOnvif: true,
  },
  dahua: {
    label: "Dahua",
    rtspPort: 554,
    onvifPort: 80,
    mainPath: (ch) => `/cam/realmonitor?channel=${ch}&subtype=0`,
    subPath: (ch) => `/cam/realmonitor?channel=${ch}&subtype=1`,
    ptzViaOnvif: true,
  },
  uniview: {
    label: "Uniview",
    rtspPort: 554,
    onvifPort: 80,
    mainPath: () => "/media/video1",
    subPath: () => "/media/video2",
    ptzViaOnvif: true,
  },
  tplink_vigi: {
    label: "TP-Link VIGI",
    rtspPort: 554,
    onvifPort: 2020,
    mainPath: () => "/stream1",
    subPath: () => "/stream2",
    ptzViaOnvif: true,
  },
  hanwha: {
    label: "Hanwha",
    rtspPort: 554,
    onvifPort: 80,
    mainPath: () => "/profile2/media.smp",
    subPath: () => "/profile3/media.smp",
    ptzViaOnvif: true,
  },
  axis: {
    label: "Axis",
    rtspPort: 554,
    onvifPort: 80,
    mainPath: () => "/axis-media/media.amp",
    subPath: () => "/axis-media/media.amp?videocodec=h264&resolution=640x360",
    ptzViaOnvif: true,
  },
  generic: {
    label: "Otra / genérica",
    rtspPort: 554,
    onvifPort: 80,
    mainPath: () => "/",
    subPath: () => "/",
    ptzViaOnvif: true,
  },
};

export function isCameraBrand(value: string): value is CameraBrand {
  return value in BRAND_PROFILES;
}

function normalizePath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function pathFor(camara: RtspCamaraInput, quality: StreamQuality): string {
  if (camara.brand === "generic") {
    return normalizePath(camara.customPath ?? "/");
  }
  const brand: CameraBrand = isCameraBrand(camara.brand) ? camara.brand : "generic";
  const profile = BRAND_PROFILES[brand];
  const ch = Math.max(1, camara.channel || 1);
  return quality === "main" ? profile.mainPath(ch) : profile.subPath(ch);
}

export function buildRtspUrl(camara: RtspCamaraInput, plainPassword: string): string {
  const user = encodeURIComponent(camara.username);
  const pass = encodeURIComponent(plainPassword);
  const host = camara.host.trim();
  const port = camara.rtspPort || 554;
  const path = pathFor(camara, camara.streamQuality);
  return `rtsp://${user}:${pass}@${host}:${port}${path}`;
}
