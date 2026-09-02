import type { CameraBrand, CameraSourceType, StreamQuality } from "@/lib/camaras/types";
import type { CamaraDto } from "./types";

export type CamaraFormState = {
  id?: string;
  sourceType: CameraSourceType;
  brand: CameraBrand;
  name: string;
  host: string;
  rtspPort: number;
  onvifPort: number;
  channel: number;
  streamQuality: StreamQuality;
  customPath: string;
  username: string;
  password: string;
  ptzCapable: boolean;
};

export const EMPTY_FORM: CamaraFormState = {
  sourceType: "nvr",
  brand: "hikvision",
  name: "",
  host: "",
  rtspPort: 554,
  onvifPort: 80,
  channel: 1,
  streamQuality: "sub",
  customPath: "",
  username: "",
  password: "",
  ptzCapable: false,
};

export function formFromCamera(c: CamaraDto): CamaraFormState {
  return {
    id: c.id,
    sourceType: (c.sourceType as CamaraFormState["sourceType"]) || "nvr",
    brand: (c.brand as CamaraFormState["brand"]) || "generic",
    name: c.name,
    host: c.host,
    rtspPort: c.rtspPort,
    onvifPort: c.onvifPort ?? 80,
    channel: c.channel,
    streamQuality: (c.streamQuality as CamaraFormState["streamQuality"]) || "sub",
    customPath: c.customPath ?? "",
    username: c.username,
    password: "",
    ptzCapable: c.ptzCapable,
  };
}

export function payloadFromForm(form: CamaraFormState) {
  return {
    name: form.name,
    sourceType: form.sourceType,
    brand: form.brand,
    host: form.host,
    rtspPort: form.rtspPort,
    onvifPort: form.onvifPort,
    channel: form.channel,
    streamQuality: form.streamQuality,
    customPath: form.brand === "generic" ? form.customPath : null,
    username: form.username,
    ...(form.password ? { password: form.password } : {}),
    ptzCapable: form.ptzCapable,
  };
}
