/**
 * @vitest-environment jsdom
 *
 * Regression: defining Shell inside MarcacionScreen remounted the RUT input
 * on every clock tick and closed the soft keyboard on mobile.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MarcacionScreen } from "../MarcacionScreen";

vi.mock("../MarcacionOfflineQueue", () => ({
  MarcacionOfflineQueue: {
    count: vi.fn(async () => 0),
    subscribe: vi.fn(() => () => {}),
  },
}));

describe("MarcacionScreen RUT input stability", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not remount the RUT input when the clock ticks", async () => {
    render(
      <MarcacionScreen
        deviceToken="tok"
        installationId="inst-1"
        installationName="Ft foods"
        isOnline
      />
    );

    const input = await screen.findByPlaceholderText("12.345.678-K");
    const inputNode = input;

    fireEvent.change(input, { target: { value: "1234567k" } });
    const valueAfterType = (input as HTMLInputElement).value;
    expect(valueAfterType.length).toBeGreaterThan(0);

    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    const inputAfterTicks = screen.getByPlaceholderText("12.345.678-K");
    // Same DOM node ⇒ React did not remount the shell/input tree.
    expect(inputAfterTicks).toBe(inputNode);
    expect((inputAfterTicks as HTMLInputElement).value).toBe(valueAfterType);
  });
});
