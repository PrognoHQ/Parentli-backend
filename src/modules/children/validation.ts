import { z } from "zod";

export const medicationSchema = z.object({
  name: z.string().min(1),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
  notes: z.string().optional(),
});

export const allergySchema = z.object({
  allergen: z.string().min(1),
  severity: z.string().optional(),
  reaction: z.string().optional(),
  notes: z.string().optional(),
});

export const insuranceSchema = z.object({
  provider: z.string().optional(),
  policyNumber: z.string().optional(),
  groupNumber: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export const medicalUpsertSchema = z.object({
  pediatrician: z.string().nullable().optional(),
  pediatricianPhone: z.string().nullable().optional(),
  hospital: z.string().nullable().optional(),
  bloodType: z.string().nullable().optional(),
  medications: z.array(medicationSchema).optional(),
  allergies: z.array(allergySchema).optional(),
  insurance: insuranceSchema.nullable().optional(),
});

export type MedicalUpsertInput = z.infer<typeof medicalUpsertSchema>;
