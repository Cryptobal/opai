/**
 * @vitest-environment jsdom
 *
 * Tras enqueue al outbox, resetAfterSend debe impedir que el unmount
 * borre los staged files de R2 (race que dejaba el correo sin enviar).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEmailAttachments } from "../useEmailAttachments";

class FakeXHR {
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  status = 200;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  send() {
    queueMicrotask(() => this.onload?.());
  }
  abort() {
    this.onabort?.();
  }
}

function deleteCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    (call) =>
      call[0] === "/api/crm/gmail/attachments/presign" &&
      (call[1] as RequestInit | undefined)?.method === "DELETE",
  );
}

describe("useEmailAttachments resetAfterSend", () => {
  beforeEach(() => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR as unknown as typeof XMLHttpRequest);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (
          url === "/api/crm/gmail/attachments/presign" &&
          init?.method === "POST"
        ) {
          return {
            ok: true,
            json: async () => ({
              data: {
                uploadUrl: "https://r2.example/upload",
                storageKey: "staged/tenant/user/file-1.png",
              },
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("unmount sin send borra staged de R2", async () => {
    const { result, unmount } = renderHook(() => useEmailAttachments());
    const file = new File(["x"], "foto.png", { type: "image/png" });

    act(() => {
      result.current.addFiles([file]);
    });
    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe("ready");
    });

    unmount();

    expect(deleteCalls(fetch as ReturnType<typeof vi.fn>).length).toBeGreaterThan(
      0,
    );
  });

  it("tras resetAfterSend el unmount NO borra staged (outbox es dueño)", async () => {
    const { result, unmount } = renderHook(() => useEmailAttachments());
    const file = new File(["x"], "foto.png", { type: "image/png" });

    act(() => {
      result.current.addFiles([file]);
    });
    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe("ready");
      expect(result.current.items[0]?.storageKey).toBeTruthy();
    });

    act(() => {
      result.current.resetAfterSend();
    });
    expect(result.current.items).toHaveLength(0);

    const deletesBeforeUnmount = deleteCalls(fetch as ReturnType<typeof vi.fn>)
      .length;
    unmount();
    const deletesAfterUnmount = deleteCalls(fetch as ReturnType<typeof vi.fn>)
      .length;

    expect(deletesAfterUnmount).toBe(deletesBeforeUnmount);
  });
});
