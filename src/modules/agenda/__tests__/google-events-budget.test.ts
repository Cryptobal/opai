import { describe, expect, it, vi } from "vitest";
import { raceWithBudget } from "../google-events-helpers";

describe("raceWithBudget", () => {
  it("devuelve el valor si llega a tiempo", async () => {
    const value = await raceWithBudget(
      Promise.resolve("ok"),
      50,
      "fallback",
    );
    expect(value).toBe("ok");
  });

  it("devuelve fallback si supera el presupuesto", async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 200);
    });
    const pending = raceWithBudget(slow, 50, "fallback");
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toBe("fallback");
    vi.useRealTimers();
  });

  it("devuelve fallback si la promesa rechaza", async () => {
    const value = await raceWithBudget(
      Promise.reject(new Error("boom")),
      50,
      "fallback",
    );
    expect(value).toBe("fallback");
  });
});
