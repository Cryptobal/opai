"use client";

export async function platformFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    window.location.href = "/platform/login";
  }
  return res;
}

export async function platformJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await platformFetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as { error?: string; code?: string };
    throw new Error(err.error ?? `Error ${res.status}`);
  }
  return data as T;
}
