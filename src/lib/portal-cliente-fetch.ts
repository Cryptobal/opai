"use client";

let onUnauthorized: (() => void) | null = null;

export function setPortalFetchUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function portalFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, { credentials: "include", ...init });
  if (res.status === 401 && onUnauthorized) {
    onUnauthorized();
  }
  return res;
}
