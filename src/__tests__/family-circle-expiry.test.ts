import { describe, it, expect } from "vitest";

/**
 * Tests for Family Circle access expiry logic.
 * Mirrors the isAccessExpired helper from family-circle/service.ts.
 */

function isAccessExpired(member: {
  accessType: string;
  accessEndsAt: Date | null;
}): boolean {
  return (
    member.accessType === "custom_date" &&
    member.accessEndsAt !== null &&
    member.accessEndsAt < new Date()
  );
}

describe("Family Circle access expiry", () => {
  it("ongoing access never expires", () => {
    expect(
      isAccessExpired({ accessType: "ongoing", accessEndsAt: null })
    ).toBe(false);
  });

  it("ongoing access with a date still never expires", () => {
    expect(
      isAccessExpired({
        accessType: "ongoing",
        accessEndsAt: new Date("2020-01-01"),
      })
    ).toBe(false);
  });

  it("custom_date with future end date is not expired", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(
      isAccessExpired({ accessType: "custom_date", accessEndsAt: future })
    ).toBe(false);
  });

  it("custom_date with past end date is expired", () => {
    const past = new Date("2020-01-01");
    expect(
      isAccessExpired({ accessType: "custom_date", accessEndsAt: past })
    ).toBe(true);
  });

  it("custom_date with null end date is not expired", () => {
    expect(
      isAccessExpired({ accessType: "custom_date", accessEndsAt: null })
    ).toBe(false);
  });
});
