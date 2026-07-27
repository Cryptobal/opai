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
  it("lock/unlock con refcount", () => {
    expect(isSwipeScrollLocked()).toBe(false);
    lockSwipeScroll();
    expect(isSwipeScrollLocked()).toBe(true);
    expect(document.documentElement.dataset.opaiSwipeLock).toBe("1");
    lockSwipeScroll();
    expect(isSwipeScrollLocked()).toBe(true);
    unlockSwipeScroll();
    expect(isSwipeScrollLocked()).toBe(true);
    unlockSwipeScroll();
    expect(isSwipeScrollLocked()).toBe(false);
    expect(document.documentElement.dataset.opaiSwipeLock).toBeUndefined();
  });
});
