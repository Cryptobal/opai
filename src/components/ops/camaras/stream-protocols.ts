const STUN = { urls: "stun:stun.l.google.com:19302" };

export function relayWsBase(relayUrl: string): string {
  return relayUrl.replace(/^http/i, "ws");
}

export async function connectWhep(
  video: HTMLVideoElement,
  relayUrl: string,
  src: string,
  token: string,
  signal: AbortSignal,
): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection({ iceServers: [STUN] });
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.ontrack = (ev) => {
    const stream = ev.streams[0] ?? new MediaStream([ev.track]);
    video.srcObject = stream;
    void video.play().catch(() => {});
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc, signal, 1500);

  const url = `${relayUrl}/api/webrtc?src=${encodeURIComponent(src)}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp ?? offer.sdp,
    signal,
  });
  if (res.status === 401) throw Object.assign(new Error("401"), { code: 401 });
  if (!res.ok) throw new Error(`WHEP ${res.status}`);
  const answer = await res.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
  return pc;
}

function waitIce(pc: RTCPeerConnection, signal: AbortSignal, ms: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", onState);
      resolve();
    };
    const onState = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    pc.addEventListener("icegatheringstatechange", onState);
    const t = setTimeout(done, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      done();
    });
  });
}

export function connectMse(
  video: HTMLVideoElement,
  relayUrl: string,
  src: string,
  token: string,
): { close: () => void } {
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  video.srcObject = null;
  video.src = objectUrl;
  let ws: WebSocket | null = null;
  let sb: SourceBuffer | null = null;
  const queue: ArrayBuffer[] = [];

  const flush = () => {
    if (!sb || sb.updating || queue.length === 0) return;
    sb.appendBuffer(queue.shift()!);
  };

  mediaSource.addEventListener("sourceopen", () => {
    const wsUrl = `${relayWsBase(relayUrl)}/api/ws?src=${encodeURIComponent(src)}&token=${encodeURIComponent(token)}`;
    ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      const mime = 'video/mp4; codecs="avc1.42E01E,avc1.640029,mp4a.40.2"';
      ws?.send(JSON.stringify({ type: "mse", value: mime }));
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        const mime = ev.data.startsWith("{") ? null : ev.data;
        if (mime && !sb) {
          sb = mediaSource.addSourceBuffer(mime);
          sb.addEventListener("updateend", flush);
        }
        return;
      }
      queue.push(ev.data as ArrayBuffer);
      flush();
    };
  });

  void video.play().catch(() => {});

  return {
    close: () => {
      ws?.close();
      if (video.src === objectUrl) video.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    },
  };
}
