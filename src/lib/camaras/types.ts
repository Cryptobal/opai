export const CAMERA_BRANDS = [
  "hikvision",
  "dahua",
  "uniview",
  "tplink_vigi",
  "hanwha",
  "axis",
  "generic",
] as const;

export type CameraBrand = (typeof CAMERA_BRANDS)[number];

export const SOURCE_TYPES = ["nvr", "camera"] as const;
export type CameraSourceType = (typeof SOURCE_TYPES)[number];

export const STREAM_QUALITIES = ["main", "sub"] as const;
export type StreamQuality = (typeof STREAM_QUALITIES)[number];

export const CAMERA_STATUSES = ["untested", "online", "offline", "error"] as const;
export type CameraStatus = (typeof CAMERA_STATUSES)[number];

export const GRID_SIZES = [1, 4, 9, 16] as const;
export type GridSize = (typeof GRID_SIZES)[number];

export type RtspCamaraInput = {
  brand: string;
  host: string;
  rtspPort: number;
  channel: number;
  streamQuality: StreamQuality;
  customPath?: string | null;
  username: string;
};

export type RelayTokenClaims = {
  tid: string;
  s: string[];
  uid: string;
};
