/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SosHoldButton, SOS_HOLD_MS } from "../SosHoldButton";

describe("SosHoldButton", () => {
  let rafCbs: FrameRequestCallback[];
  let now: number;

  beforeEach(() => {
    now = 0;
    rafCbs = [];
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCbs.push(cb);
      return rafCbs.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function flushFrames(ms: number) {
    now += ms;
    // Drain the RAF queue; each tick schedules the next until hold completes.
    for (let i = 0; i < 40 && rafCbs.length > 0; i++) {
      const cbs = [...rafCbs];
      rafCbs = [];
      for (const cb of cbs) cb(now);
    }
  }

  it("does not arm on a short tap", () => {
    const onArmed = vi.fn();
    render(<SosHoldButton onArmed={onArmed} />);
    const btn = screen.getByRole("button", { name: /sos/i });

    fireEvent.pointerDown(btn, { pointerId: 1 });
    act(() => flushFrames(400));
    fireEvent.pointerUp(btn, { pointerId: 1 });

    expect(onArmed).not.toHaveBeenCalled();
  });

  it("arms after holding for 2 seconds", () => {
    const onArmed = vi.fn();
    render(<SosHoldButton onArmed={onArmed} />);
    const btn = screen.getByRole("button", { name: /sos/i });

    fireEvent.pointerDown(btn, { pointerId: 1 });
    act(() => {
      flushFrames(SOS_HOLD_MS / 2);
      flushFrames(SOS_HOLD_MS / 2);
    });

    expect(onArmed).toHaveBeenCalledTimes(1);
  });
});
