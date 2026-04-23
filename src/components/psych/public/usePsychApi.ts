"use client";

import type { PublicPayload } from "./types";

async function call<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api/public/psych/${token}${path}`, {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: init?.body,
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Respuesta no válida del servidor");
  }
  if (!res.ok) {
    const msg =
      (json as { error?: string })?.error ??
      `Error ${res.status} al llamar ${path}`;
    throw new Error(msg);
  }
  return json as T;
}

export function psychApi(token: string) {
  return {
    load: () => call<{ success: true } & PublicPayload>(token, ""),
    start: () => call<{ success: true }>(token, "/start", { method: "POST" }),
    consent: (meta: { fingerprint?: string; tzOffsetMinutes?: number; locale?: string }) =>
      call<{ success: true }>(token, "/consent", {
        method: "POST",
        body: JSON.stringify(meta),
      }),
    respond: (itemId: string, value: unknown, latencyMs: number) =>
      call<{ success: true }>(token, "/response", {
        method: "POST",
        body: JSON.stringify({ itemId, value, latencyMs }),
      }),
    submit: () =>
      call<{ success: true; thanksPage: string; missingOrders?: number[] }>(
        token,
        "/submit",
        { method: "POST" },
      ),
  };
}

export type PsychApi = ReturnType<typeof psychApi>;
