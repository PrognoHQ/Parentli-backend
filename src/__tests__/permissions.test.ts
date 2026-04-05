import { describe, it, expect } from "vitest";
import {
  hasParentCapability,
  hasFamilyCircleCapability,
} from "../lib/permissions";

describe("Parent capabilities", () => {
  const parentCaps = [
    "children:read",
    "children:write",
    "medical:read",
    "medical:write",
    "school_care:read",
    "school_care:write",
    "emergency:read",
    "emergency:write",
    "custody:read",
    "custody:write",
    "family_circle:manage",
    "events:read",
    "events:write",
    "conversations:read",
    "conversations:write",
  ];

  for (const role of ["owner", "coparent"] as const) {
    for (const cap of parentCaps) {
      it(`${role} has ${cap}`, () => {
        expect(hasParentCapability(role, cap)).toBe(true);
      });
    }
  }

  it("unknown role has no capabilities", () => {
    expect(hasParentCapability("viewer", "children:read")).toBe(false);
    expect(hasParentCapability("carer", "children:read")).toBe(false);
  });
});

describe("Family Circle capabilities", () => {
  it("viewer can only read children", () => {
    expect(hasFamilyCircleCapability("viewer", "children:read")).toBe(true);
    expect(hasFamilyCircleCapability("viewer", "medical:read")).toBe(false);
    expect(hasFamilyCircleCapability("viewer", "emergency:read")).toBe(false);
    expect(hasFamilyCircleCapability("viewer", "school_care:read")).toBe(false);
    expect(hasFamilyCircleCapability("viewer", "custody:read")).toBe(false);
    expect(hasFamilyCircleCapability("viewer", "children:write")).toBe(false);
  });

  it("contributor can read children and school_care only", () => {
    expect(hasFamilyCircleCapability("contributor", "children:read")).toBe(true);
    expect(hasFamilyCircleCapability("contributor", "school_care:read")).toBe(true);
    expect(hasFamilyCircleCapability("contributor", "medical:read")).toBe(false);
    expect(hasFamilyCircleCapability("contributor", "emergency:read")).toBe(false);
    expect(hasFamilyCircleCapability("contributor", "custody:read")).toBe(false);
  });

  it("carer can read children, medical, emergency, school_care", () => {
    expect(hasFamilyCircleCapability("carer", "children:read")).toBe(true);
    expect(hasFamilyCircleCapability("carer", "medical:read")).toBe(true);
    expect(hasFamilyCircleCapability("carer", "emergency:read")).toBe(true);
    expect(hasFamilyCircleCapability("carer", "school_care:read")).toBe(true);
  });

  it("carer cannot write or manage", () => {
    expect(hasFamilyCircleCapability("carer", "children:write")).toBe(false);
    expect(hasFamilyCircleCapability("carer", "medical:write")).toBe(false);
    expect(hasFamilyCircleCapability("carer", "custody:read")).toBe(false);
    expect(hasFamilyCircleCapability("carer", "custody:write")).toBe(false);
    expect(hasFamilyCircleCapability("carer", "family_circle:manage")).toBe(false);
  });

  it("no family circle role can access custody", () => {
    for (const role of ["viewer", "contributor", "carer"]) {
      expect(hasFamilyCircleCapability(role, "custody:read")).toBe(false);
      expect(hasFamilyCircleCapability(role, "custody:write")).toBe(false);
    }
  });

  it("no family circle role can manage family circle", () => {
    for (const role of ["viewer", "contributor", "carer"]) {
      expect(hasFamilyCircleCapability(role, "family_circle:manage")).toBe(false);
    }
  });

  it("no family circle role can access events", () => {
    for (const role of ["viewer", "contributor", "carer"]) {
      expect(hasFamilyCircleCapability(role, "events:read")).toBe(false);
      expect(hasFamilyCircleCapability(role, "events:write")).toBe(false);
    }
  });

  it("no family circle role can access conversations", () => {
    for (const role of ["viewer", "contributor", "carer"]) {
      expect(hasFamilyCircleCapability(role, "conversations:read")).toBe(false);
      expect(hasFamilyCircleCapability(role, "conversations:write")).toBe(false);
    }
  });
});
