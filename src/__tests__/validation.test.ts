import { describe, it, expect } from "vitest";
import { medicalUpsertSchema } from "../modules/children/validation";

describe("medicalUpsertSchema", () => {
  it("accepts valid medical data with all fields", () => {
    const result = medicalUpsertSchema.safeParse({
      pediatrician: "Dr. Smith",
      pediatricianPhone: "555-0100",
      hospital: "General Hospital",
      bloodType: "A+",
      medications: [
        { name: "Ibuprofen", dosage: "100mg", frequency: "as needed" },
      ],
      allergies: [
        { allergen: "Peanuts", severity: "severe", reaction: "anaphylaxis" },
      ],
      insurance: {
        provider: "Blue Cross",
        policyNumber: "BC123",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all optional)", () => {
    const result = medicalUpsertSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts nullable fields", () => {
    const result = medicalUpsertSchema.safeParse({
      pediatrician: null,
      bloodType: null,
      insurance: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects medications with missing name", () => {
    const result = medicalUpsertSchema.safeParse({
      medications: [{ dosage: "100mg" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects allergies with missing allergen", () => {
    const result = medicalUpsertSchema.safeParse({
      allergies: [{ severity: "mild" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects medications as arbitrary string", () => {
    const result = medicalUpsertSchema.safeParse({
      medications: "some random string",
    });
    expect(result.success).toBe(false);
  });

  it("rejects medications as arbitrary object (not array)", () => {
    const result = medicalUpsertSchema.safeParse({
      medications: { name: "test" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty arrays for medications and allergies", () => {
    const result = medicalUpsertSchema.safeParse({
      medications: [],
      allergies: [],
    });
    expect(result.success).toBe(true);
  });
});
