export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

export function getRequestUserAgent(request: Request): string {
  return request.headers.get("user-agent")?.slice(0, 512) || "";
}
