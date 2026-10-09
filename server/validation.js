import { z } from "zod";
export const stages = [
  "new",
  "contacted",
  "qualified",
  "quoted",
  "won",
  "lost",
];
export const sources = [
  "website",
  "phone",
  "referral",
  "google",
  "social",
  "repeat",
  "other",
];
const text = z.string().trim().max(10000).default("");
const name = z.string().trim().min(1, "Enter a name or reference.").max(240);
const email = z
  .union([z.email().max(254), z.literal("")])
  .default("")
  .transform((s) => s.toLowerCase());
const date = z
  .string()
  .default("")
  .refine(
    (s) =>
      !s ||
      (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
        !isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s),
    "Enter a valid calendar date.",
  );
const relation = z.number().int().positive().nullable().default(null);
const base = {
  name,
  note: text,
  version: z.number().int().positive().optional(),
};
export const schemas = {
  contacts: z
    .object({
      ...base,
      company: text,
      email,
      phone: text,
      source: z.enum(sources).default("other"),
      background: text,
      permission: z
        .enum(["unknown", "subscribed", "unsubscribed"])
        .default("unknown"),
      evidence: text,
      confirm_consent: z.boolean().default(false),
      tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    })
    .strict(),
  sites: z
    .object({
      ...base,
      contact_id: z.number().int().positive(),
      address: z.string().trim().min(1).max(1000),
      access_notes: text,
    })
    .strict(),
  leads: z
    .object({
      ...base,
      email,
      phone: text,
      address: text,
      service: text,
      source: z.enum(sources).default("other"),
      details: text,
      stage: z.enum(stages).default("new"),
      contact_id: relation,
      site_id: relation,
      followup: date,
    })
    .strict(),
  quotes: z
    .object({
      ...base,
      contact_id: z.number().int().positive(),
      site_id: relation,
      lead_id: relation,
      amount_cents: z
        .number()
        .int()
        .min(0)
        .max(9999999999)
        .nullable()
        .default(null),
      scope: text,
      exclusions: text,
      valid_until: date,
      status: z
        .enum(["draft", "sent", "accepted", "declined"])
        .default("draft"),
    })
    .strict(),
  invoices: z
    .object({
      ...base,
      contact_id: z.number().int().positive(),
      site_id: relation,
      amount_cents: z
        .number()
        .int()
        .min(0)
        .max(9999999999)
        .nullable()
        .default(null),
      scope: text,
      exclusions: text,
      due_date: date,
      status: z.enum(["draft", "issued", "paid", "void"]).default("draft"),
    })
    .strict(),
  segments: z
    .object({
      ...base,
      tag: z.string().trim().max(60).default(""),
      source: z.enum(["", ...sources]).default(""),
    })
    .strict(),
};
export const enquirySchema = z
  .object({
    first_name: name,
    last_name: name,
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    phone: text,
    address: text,
    service: z.string().trim().min(1).max(100),
    message: z
      .string()
      .trim()
      .min(10, "Please include at least 10 characters about your project.")
      .max(10000),
    website: z.string().max(0, "Submission rejected.").default(""),
  })
  .strict();
export class AppError extends Error {
  constructor(status, message, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
export function check(condition, message, field = "") {
  if (!condition)
    throw new AppError(422, message, field ? { [field]: message } : {});
}
export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(
      422,
      "Please correct the highlighted fields.",
      Object.fromEntries(
        result.error.issues.map((i) => [i.path[0] || "form", i.message]),
      ),
    );
  return result.data;
}
