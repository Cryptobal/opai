import { afterEach, describe, expect, it } from "vitest";
import {
  isSwipeScrollLocked,
  lockSwipeScroll,
  unlockSwipeScroll,
} from "../swipe-scroll-lock";

afterEach(() => {
  while (isSwipeScrollLocked()) unlockSwipeScroll();
});

describe("swipe-scroll-lock", () => {
  it("lock/unlock con refcount (sin mutar el DOM)", () => {
    expect(isSwipeScrollLocked()).toBe(false);
    lockSwipeScroll();
    expect(isSwipeScrollLocked()).toBe(true);
    // Ya no se escribe dataset ni se toca body.style — solo contador.
    expect(document.documentElement.dataset.opaiSwipeLock).toBeUndefined();
    lockSwipeScroll();
    expect(isSwipeScrollLocked()).toBe(true);
    unlockSwipeScroll();
    expect(isSwipeScrollLocked()).toBe(true);
    unlockSwipeScroll();
    expect(isSwipeScrollLocked()).toBe(false);
    expect(document.documentElement.dataset.opaiSwipeLock).toBeUndefined();
  });
});
