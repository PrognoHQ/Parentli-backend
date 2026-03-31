export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  position: "prefix" | "suffix";
}

export interface CategorySplit {
  splitPct: number;
  reason?: string;
}

export interface RecurringSeries {
  id: string;
  description: string;
  amount: number;
  categoryId: string;
  child: string;
  paidBy: string;
  splitPct: number;
  recurrence: "none" | "weekly" | "biweekly" | "monthly";
  recurrenceLabel: string;
  paused: boolean;
}

export interface EventCategoryRule {
  rule: "none" | "notify-always" | "require-approval";
  healthScope?: "all" | "specialist-only" | "all-except-emergency";
}

export type EventCategoryRules = Record<string, EventCategoryRule>;

export interface UserSettings {
  defaultSplitPct: number;
  approvalRequired: boolean;
  approvalThreshold: number;
  categorySplits: Record<string, CategorySplit>;
  recurringSeries: RecurringSeries[];
  currency: CurrencyConfig;
  displayCurrency: CurrencyConfig | null;
  numberFormat: "period" | "comma";
  handoffReportStyle: "simple" | "structured";
  handoffReportSections: string[];
  handoffDefaultClosing: string;
  handoffAckWindow: number;
  handoffReadReceipts: boolean;
  noteEditWindow: string;
  structuredComm: boolean;
  backdateFlagDays: number;
  backdateApprovalDays: number;
  maxBackdateDays: number;
  notifyBackdated: boolean;
  eventCategoryRules: EventCategoryRules;
  approvalWindowHours: number;
  approvalReminderTiming: "24h" | "48h" | "both";
}

export const DEFAULT_SETTINGS: UserSettings = {
  defaultSplitPct: 50,
  approvalRequired: false,
  approvalThreshold: 50,
  categorySplits: {},
  recurringSeries: [],
  currency: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    position: "prefix",
  },
  displayCurrency: null,
  numberFormat: "period",
  handoffReportStyle: "simple",
  handoffReportSections: [
    "medical",
    "welfare",
    "academics",
    "emotional",
    "milestones",
    "therapy",
    "action-items",
  ],
  handoffDefaultClosing: "Thank you for reading.",
  handoffAckWindow: 48,
  handoffReadReceipts: true,
  noteEditWindow: "30min",
  structuredComm: false,
  backdateFlagDays: 7,
  backdateApprovalDays: 90,
  maxBackdateDays: 730,
  notifyBackdated: true,
  eventCategoryRules: {
    Activity: { rule: "none" },
    School: { rule: "none" },
    Health: { rule: "require-approval", healthScope: "specialist-only" },
    Handoff: { rule: "none" },
    Other: { rule: "none" },
  },
  approvalWindowHours: 72,
  approvalReminderTiming: "48h",
};

export interface DefaultCategory {
  slug: string;
  label: string;
  emoji: string;
  color: string;
  position: number;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { slug: "childcare", label: "Childcare", emoji: "🏠", color: "hsl(127, 15%, 55%)", position: 0 },
  { slug: "health", label: "Health", emoji: "🩺", color: "hsl(21, 50%, 57%)", position: 1 },
  { slug: "education", label: "Education", emoji: "📚", color: "hsl(204, 35%, 75%)", position: 2 },
  { slug: "clothing", label: "Clothing", emoji: "👕", color: "hsl(213, 25%, 23%)", position: 3 },
  { slug: "food", label: "Food", emoji: "🍎", color: "hsl(22, 65%, 70%)", position: 4 },
  { slug: "activity", label: "Activity", emoji: "⚽", color: "hsl(39, 56%, 58%)", position: 5 },
  { slug: "transport", label: "Transport", emoji: "🚗", color: "hsl(220, 24%, 65%)", position: 6 },
  { slug: "other", label: "Other", emoji: "📦", color: "hsl(220, 9%, 63%)", position: 7 },
];
