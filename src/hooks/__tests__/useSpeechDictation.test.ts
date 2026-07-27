import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSpeechDictation } from "../useSpeechDictation";

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  onresult: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
};

describe("useSpeechDictation", () => {
  let lastRec: Rec | null = null;

  beforeEach(() => {
    lastRec = null;
    class FakeRec {
      continuous = false;
      interimResults = false;
      lang = "";
      start = vi.fn();
      stop = vi.fn(function (this: Rec) {
        this.onend?.();
      });
      abort = vi.fn(function (this: Rec) {
        this.onend?.();
      });
      onresult: Rec["onresult"] = null;
      onerror: Rec["onerror"] = null;
      onend: Rec["onend"] = null;
      constructor() {
        lastRec = this as unknown as Rec;
      }
    }
    (window as unknown as { webkitSpeechRecognition: typeof FakeRec }).webkitSpeechRecognition =
      FakeRec;
  });

  afterEach(() => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it("cancel() restaura el texto previo", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useSpeechDictation({ value: "hola", onChange }),
    );
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    act(() => {
      lastRec?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: " mundo" } }],
      });
    });
    act(() => result.current.cancel());
    expect(onChange).toHaveBeenCalledWith("hola");
    expect(result.current.listening).toBe(false);
  });

  it("finish() conserva el texto acumulado", async () => {
    const onChange = vi.fn();
    let value = "base";
    const { result, rerender } = renderHook(() =>
      useSpeechDictation({
        value,
        onChange: (n) => {
          value = n;
          onChange(n);
        },
      }),
    );
    act(() => result.current.start());
    act(() => {
      lastRec?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: " dictado" } }],
      });
    });
    rerender();
    const finished = await act(async () => result.current.finish());
    expect(finished).toContain("dictado");
    expect(result.current.listening).toBe(false);
  });
});
