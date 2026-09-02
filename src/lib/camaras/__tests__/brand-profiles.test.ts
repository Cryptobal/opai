import { describe, expect, it } from "vitest";
import { BRAND_PROFILES, buildRtspUrl } from "../brand-profiles";
import type { CameraBrand, RtspCamaraInput } from "../types";

const PASS = "p@ss:word/1";
const USER = "viewer";

function base(brand: CameraBrand, extra: Partial<RtspCamaraInput> = {}): RtspCamaraInput {
  return {
    brand,
    host: "cam.example.cl",
    rtspPort: BRAND_PROFILES[brand].rtspPort,
    channel: 1,
    streamQuality: "sub",
    username: USER,
    ...extra,
  };
}

describe("BRAND_PROFILES", () => {
  it("define las 7 marcas del brief", () => {
    expect(Object.keys(BRAND_PROFILES).sort()).toEqual(
      ["axis", "dahua", "generic", "hanwha", "hikvision", "tplink_vigi", "uniview"].sort(),
    );
  });
});

describe("buildRtspUrl", () => {
  it("Hikvision canal 1 main/sub → Channels/101 y 102", () => {
    const main = buildRtspUrl(base("hikvision", { streamQuality: "main" }), PASS);
    const sub = buildRtspUrl(base("hikvision"), PASS);
    expect(main).toContain("/Streaming/Channels/101");
    expect(sub).toContain("/Streaming/Channels/102");
    expect(main).toMatch(/^rtsp:\/\/viewer:/);
  });

  it("Hikvision canal 3 sub → Channels/302", () => {
    const url = buildRtspUrl(base("hikvision", { channel: 3 }), PASS);
    expect(url).toContain("/Streaming/Channels/302");
  });

  it("Dahua main/sub usan subtype 0/1", () => {
    const main = buildRtspUrl(base("dahua", { streamQuality: "main", channel: 2 }), PASS);
    const sub = buildRtspUrl(base("dahua", { channel: 2 }), PASS);
    expect(main).toContain("/cam/realmonitor?channel=2&subtype=0");
    expect(sub).toContain("/cam/realmonitor?channel=2&subtype=1");
  });

  it("Uniview usa /media/video1 y video2", () => {
    expect(buildRtspUrl(base("uniview", { streamQuality: "main" }), PASS)).toContain("/media/video1");
    expect(buildRtspUrl(base("uniview"), PASS)).toContain("/media/video2");
  });

  it("TP-Link VIGI usa /stream1 y /stream2 en puerto 554", () => {
    const url = buildRtspUrl(base("tplink_vigi", { streamQuality: "main" }), PASS);
    expect(url).toContain(":554/stream1");
    expect(BRAND_PROFILES.tplink_vigi.onvifPort).toBe(2020);
  });

  it("Hanwha usa profile2/3 media.smp", () => {
    expect(buildRtspUrl(base("hanwha", { streamQuality: "main" }), PASS)).toContain("/profile2/media.smp");
    expect(buildRtspUrl(base("hanwha"), PASS)).toContain("/profile3/media.smp");
  });

  it("Axis usa axis-media/media.amp", () => {
    expect(buildRtspUrl(base("axis", { streamQuality: "main" }), PASS)).toContain("/axis-media/media.amp");
  });

  it("generic usa customPath y URL-encodea usuario/clave", () => {
    const url = buildRtspUrl(
      base("generic", { customPath: "live/ch0", username: "us r" }),
      PASS,
    );
    expect(url).toContain("/live/ch0");
    expect(url).toContain(encodeURIComponent("us r"));
    expect(url).toContain(encodeURIComponent(PASS));
    expect(url).not.toContain("p@ss:word/1@");
  });
});
