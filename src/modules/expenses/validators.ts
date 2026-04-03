import { z } from "zod";

const reimbursementStatusEnum = z.enum([
  "none",
  "awaiting_reimb",
  "partial",
  "fully_received",
]);

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
    // splitPct is intentionally optional with NO default.
    // undefined = resolve from household settings; provided = custom split.
    splitPct: z.number().int().min(0).max(100).optional(),
    backdateReason: z.string().max(1000).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    reimbursable: z.boolean().optional().default(false),
    reimbursedAmt: z.number().min(0).optional().default(0),
    reimbursementStatus: reimbursementStatusEnum.optional().default("none"),
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

    // Cross-field: reimbursedAmt cannot exceed amount
    if (data.reimbursedAmt > data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reimbursedAmt cannot exceed amount",
        path: ["reimbursedAmt"],
      });
    }

    // Cross-field: reimbursement status consistency
    if (data.reimbursementStatus === "none" && data.reimbursedAmt > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "reimbursedAmt must be 0 when reimbursementStatus is none",
        path: ["reimbursedAmt"],
      });
    }

    if (
      (data.reimbursementStatus === "partial" ||
        data.reimbursementStatus === "fully_received") &&
      data.reimbursedAmt <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "reimbursedAmt must be greater than 0 when reimbursementStatus is partial or fully_received",
        path: ["reimbursedAmt"],
      });
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
    // When provided, treated as custom split override
    splitPct: z.number().int().min(0).max(100).optional(),
    backdateReason: z.string().max(1000).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    reimbursable: z.boolean().optional(),
    reimbursedAmt: z.number().min(0).optional(),
    reimbursementStatus: reimbursementStatusEnum.optional(),
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

    // Cross-field: reimbursedAmt cannot exceed amount (when both present)
    if (
      data.reimbursedAmt !== undefined &&
      data.amount !== undefined &&
      data.reimbursedAmt > data.amount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reimbursedAmt cannot exceed amount",
        path: ["reimbursedAmt"],
      });
    }

    // Cross-field: reimbursement status consistency (when both present)
    if (data.reimbursementStatus === "none" && (data.reimbursedAmt ?? 0) > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "reimbursedAmt must be 0 when reimbursementStatus is none",
        path: ["reimbursedAmt"],
      });
    }

    if (
      (data.reimbursementStatus === "partial" ||
        data.reimbursementStatus === "fully_received") &&
      data.reimbursedAmt !== undefined &&
      data.reimbursedAmt <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "reimbursedAmt must be greater than 0 when reimbursementStatus is partial or fully_received",
        path: ["reimbursedAmt"],
      });
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
  includeDerived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

// ---------------------------------------------------------------------------
// Approval Action Schemas
// ---------------------------------------------------------------------------

export const EXPENSE_REJECTION_REASONS = [
  "not_in_budget",
  "need_to_discuss",
  "wrong_amount",
  "expense_too_old_to_verify",
  "no_record",
  "already_settled_informally",
  "incorrect_amount",
  "other",
] as const;

export type ExpenseRejectionReason = (typeof EXPENSE_REJECTION_REASONS)[number];

export const rejectExpenseSchema = z
  .object({
    reason: z.enum(EXPENSE_REJECTION_REASONS),
    detail: z.string().max(1000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (
      data.reason === "other" &&
      (!data.detail || data.detail.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'detail is required when reason is "other"',
        path: ["detail"],
      });
    }
  });

export type RejectExpenseInput = z.infer<typeof rejectExpenseSchema>;

// ---------------------------------------------------------------------------
// Reimbursement Update Schema
// ---------------------------------------------------------------------------

const settlementMethodEnum = z.enum([
  "venmo",
  "zelle",
  "bank_transfer",
  "paypal",
  "cash",
  "other",
]);

export const updateReimbursementSchema = z
  .object({
    reimbursementStatus: reimbursementStatusEnum,
    reimbursedAmt: z.number().min(0),
    reimbursementSource: z.string().max(500).optional().nullable(),
    reimbursedAmtExpected: z.number().min(0).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.reimbursementStatus === "none" && data.reimbursedAmt > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reimbursedAmt must be 0 when reimbursementStatus is none",
        path: ["reimbursedAmt"],
      });
    }

    if (
      (data.reimbursementStatus === "partial" ||
        data.reimbursementStatus === "fully_received") &&
      data.reimbursedAmt <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "reimbursedAmt must be greater than 0 when reimbursementStatus is partial or fully_received",
        path: ["reimbursedAmt"],
      });
    }

    if (
      data.reimbursedAmtExpected !== undefined &&
      data.reimbursedAmtExpected !== null &&
      data.reimbursedAmtExpected < data.reimbursedAmt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reimbursedAmtExpected must be >= reimbursedAmt",
        path: ["reimbursedAmtExpected"],
      });
    }
  });

export type UpdateReimbursementInput = z.infer<typeof updateReimbursementSchema>;

// ---------------------------------------------------------------------------
// Settle Expense Schema
// ---------------------------------------------------------------------------

export const settleExpenseSchema = z.object({
  settlementMethod: settlementMethodEnum,
  settlementDate: z
    .string()
    .min(1, "settlementDate is required")
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: "settlementDate must be in YYYY-MM-DD format",
    })
    .refine((v) => !isNaN(new Date(v).getTime()), {
      message: "settlementDate must be a valid date",
    }),
  settlementNote: z.string().max(2000).optional().nullable(),
});

export type SettleExpenseInput = z.infer<typeof settleExpenseSchema>;

// ---------------------------------------------------------------------------
// Update Settlement Schema
// ---------------------------------------------------------------------------

export const updateSettlementSchema = z
  .object({
    settlementMethod: settlementMethodEnum.optional(),
    settlementDate: z
      .string()
      .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), {
        message: "settlementDate must be in YYYY-MM-DD format",
      })
      .refine((v) => !isNaN(new Date(v).getTime()), {
        message: "settlementDate must be a valid date",
      })
      .optional(),
    settlementNote: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (
      data.settlementMethod === undefined &&
      data.settlementDate === undefined &&
      data.settlementNote === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided for settlement update",
        path: [],
      });
    }
  });

export type UpdateSettlementInput = z.infer<typeof updateSettlementSchema>;

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
