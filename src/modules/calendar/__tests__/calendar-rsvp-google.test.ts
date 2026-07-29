import { describe, expect, it } from "vitest";
import { selfResponseFromAttendees } from "../calendar-rsvp-google";

describe("selfResponseFromAttendees", () => {
  it("usa attendee self", () => {
    expect(
      selfResponseFromAttendees(
        [
          { email: "otro@x.cl", responseStatus: "accepted" },
          { email: "yo@gard.cl", responseStatus: "tentative", self: true },
        ],
        "yo@gard.cl",
      ),
    ).toBe("tentative");
  });

  it("cae a email si no hay self", () => {
    expect(
      selfResponseFromAttendees(
        [{ email: "yo@gard.cl", responseStatus: "declined" }],
        "yo@gard.cl",
      ),
    ).toBe("declined");
  });

  it("needs_action por defecto", () => {
    expect(selfResponseFromAttendees([], "yo@gard.cl")).toBe("needs_action");
  });
});
