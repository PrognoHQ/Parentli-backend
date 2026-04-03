import { z } from "zod";

export const createExpenseSchema = z
  .object({
    description: z.string().min(1, "Description is required").max(500),
    amount: z.number().positive("Amount must be greater than 0"),
    paidBy: z.enum(["owner", "coparent"]),
    date: z.string().min(1, "Date is required"),
    childScope: z.enum(["both", "single"]),
    primaryChildId: z.string().uuid().optional().nullable(),
    categoryId: z.string().uuid("Category is required"),
    status: z.enum(["draft", "awaiting"]).optional().default("draft"),
    splitPct: z.number().int().min(0).max(100).optional().default(50),
    notes: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.childScope === "single" && !data.primaryChildId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "primaryChildId is required when childScope is single",
        path: ["primaryChildId"],
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(data.date)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "date must be in YYYY-MM-DD format",
        path: ["date"],
      });
    } else {
      const parsed = new Date(data.date);
      if (isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "date must be a valid date",
          path: ["date"],
        });
      }
    }
  });

export const updateExpenseSchema = z
  .object({
    description: z.string().min(1).max(500).optional(),
    amount: z.number().positive("Amount must be greater than 0").optional(),
    paidBy: z.enum(["owner", "coparent"]).optional(),
    date: z.string().optional(),
    childScope: z.enum(["both", "single"]).optional(),
    primaryChildId: z.string().uuid().optional().nullable(),
    categoryId: z.string().uuid().optional(),
    status: z.enum(["draft", "awaiting"]).optional(),
    splitPct: z.number().int().min(0).max(100).optional(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.childScope === "single" && data.primaryChildId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "primaryChildId is required when childScope is changed to single",
        path: ["primaryChildId"],
      });
    }

    if (data.date !== undefined) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(data.date)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "date must be in YYYY-MM-DD format",
          path: ["date"],
        });
      } else {
        const parsed = new Date(data.date);
        if (isNaN(parsed.getTime())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "date must be a valid date",
            path: ["date"],
          });
        }
      }
    }
  });

export const listExpensesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z
    .enum(["draft", "awaiting", "approved", "rejected", "settled"])
    .optional(),
  categoryId: z.string().uuid().optional(),
  childId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
