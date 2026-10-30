import { z } from "zod";
import type { MealPrepSetup } from "../../lib/availability/slots";

const id = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(4000);
const positiveInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Invalid calendar date");
const dates = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("date"), date: localDateSchema }).strict(),
  // Explicit seven-day interval; no inferred week-start weekday or timezone.
  z.object({ kind: z.literal("week"), startsOn: localDateSchema }).strict(),
]);
const dish = z
  .object({
    dishId: id,
    name: text,
    description: text.nullable(),
    basePriceRevisionId: id.nullable(), // provenance only; never a price or billing unit
  })
  .strict();
const option = z
  .object({ id, name: text, dishIds: z.array(id).min(1) })
  .strict();
export const offerBodySchema = z
  .object({
    kind: z.literal("offer"),
    dates,
    dishes: z.array(dish).min(1),
    packages: z.array(option),
    menus: z.array(option),
  })
  .strict()
  .superRefine((body, ctx) => {
    const unique = (values: string[]) => new Set(values).size === values.length;
    if (
      !unique(body.dishes.map((d) => d.dishId)) ||
      !unique(body.packages.map((p) => p.id)) ||
      !unique(body.menus.map((m) => m.id))
    )
      ctx.addIssue({ code: "custom", message: "Duplicate offer reference" });
    for (const entry of [...body.packages, ...body.menus])
      if (
        !unique(entry.dishIds) ||
        entry.dishIds.some(
          (dishId) => !body.dishes.some((d) => d.dishId === dishId),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid option dish reference",
        });
  });
const generalIntake = {
  allergies: z.array(text),
  dietaryRestrictions: z.array(text),
  preferences: z.array(text),
  householdSize: positiveInteger.nullable(),
  portionPreferences: text.nullable(),
};
// Null is explicitly unanswered. These drafts do not decide intake completeness.
const intake = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("in_home"),
      ...generalIntake,
      address: text.nullable(),
      homeAccess: text.nullable(),
      equipment: text.nullable(),
      storage: text.nullable(),
      containers: text.nullable(),
    })
    .strict(),
  z
    .object({
      method: z.literal("delivery"),
      ...generalIntake,
      address: text.nullable(),
      deliveryInstructions: text.nullable(),
    })
    .strict(),
  z.object({ method: z.literal("pickup"), ...generalIntake }).strict(),
]);
export const householdBodySchema = z
  .object({ kind: z.literal("household"), intake })
  .strict();
const line = z
  .object({ dishId: id, quantity: positiveInteger, servings: positiveInteger })
  .strict();
const lines = z.array(line).superRefine((items, ctx) => {
  if (new Set(items.map((l) => l.dishId)).size !== items.length)
    ctx.addIssue({ code: "custom", message: "Duplicate selected dish" });
});
const selection = z.discriminatedUnion("style", [
  z
    .object({
      style: z.literal("individual_dishes"),
      lines: lines.refine((l) => l.length > 0),
    })
    .strict(),
  z
    .object({
      style: z.literal("package"),
      packageId: id,
      lines: lines.refine((l) => l.length > 0),
    })
    .strict(),
  z
    .object({
      style: z.literal("chosen_menu"),
      menuId: id,
      lines: lines.refine((l) => l.length > 0),
    })
    .strict(),
  z.object({ style: z.literal("tailored_plan"), brief: text, lines }).strict(),
]);
export const selectionBodySchema = z
  .object({
    kind: z.literal("selection"),
    requestedDate: localDateSchema,
    method: z.enum(["in_home", "delivery", "pickup"]),
    offerRevisionId: id,
    intakeRevisionId: id,
    selection,
  })
  .strict();
export const captureBodySchema = z.union([
  offerBodySchema,
  householdBodySchema,
  selectionBodySchema,
]);
export const saveCaptureSchema = z
  .object({
    captureId: id,
    expectedVersion: z.number().int().nonnegative().max(2147483646),
    idempotencyKey: id,
    // Identity fields are required on retries and may never change.
    customerId: id.nullable(),
    householdId: id.nullable(),
    body: captureBodySchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    const valid =
      input.body.kind === "offer"
        ? input.customerId === null && input.householdId === null
        : input.body.kind === "household"
          ? input.customerId !== null && input.householdId === null
          : input.customerId !== null && input.householdId !== null;
    if (!valid)
      ctx.addIssue({ code: "custom", message: "Invalid capture ownership" });
  });
export type SaveCaptureInput = z.infer<typeof saveCaptureSchema>;
export type CaptureBody = z.infer<typeof captureBodySchema>;
export type OfferBody = z.infer<typeof offerBodySchema>;
export type SelectionBody = z.infer<typeof selectionBodySchema>;
export type CaptureResult = { revisionId: string; version: number };
export class MealPrepCaptureError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "STALE_VERSION"
      | "IDEMPOTENCY_CONFLICT"
      | "STALE_REFERENCE"
      | "INVALID_SELECTION"
      | "METHOD_OR_STYLE_DISABLED",
  ) {
    super(code);
  }
}
// Do not propagate Zod issues containing submitted values to logs or callers.
export function parseCapture(input: unknown): SaveCaptureInput {
  const parsed = saveCaptureSchema.safeParse(input);
  if (!parsed.success) throw new MealPrepCaptureError("INVALID_INPUT");
  return parsed.data;
}
export function offerIncludesDate(offer: OfferBody, date: string): boolean {
  localDateSchema.parse(date);
  if (offer.dates.kind === "date") return offer.dates.date === date;
  const offset =
    (Date.parse(`${date}T00:00:00Z`) -
      Date.parse(`${offer.dates.startsOn}T00:00:00Z`)) /
    86400000;
  return offset >= 0 && offset < 7;
}
/** Content validation only. This is NOT availability, delivery-area eligibility,
 * an approval, an order, or a quote. PR 5 must repeat it against the agreed date. */
export function validateSelection(
  body: SelectionBody,
  offer: OfferBody,
  setup: MealPrepSetup,
): void {
  if (
    !setup.methods[body.method].enabled ||
    !setup.selection_styles[body.selection.style]
  )
    throw new MealPrepCaptureError("METHOD_OR_STYLE_DISABLED");
  if (!offerIncludesDate(offer, body.requestedDate))
    throw new MealPrepCaptureError("INVALID_SELECTION");
  let allowed = offer.dishes.map((d) => d.dishId);
  const selected = body.selection;
  if (selected.style === "package" || selected.style === "chosen_menu") {
    const option =
      selected.style === "package"
        ? offer.packages.find((p) => p.id === selected.packageId)
        : offer.menus.find((m) => m.id === selected.menuId);
    if (!option) throw new MealPrepCaptureError("INVALID_SELECTION");
    allowed = option.dishIds;
  }
  // A requested subset is not an approved package composition or price formula.
  if (selected.lines.some((l) => !allowed.includes(l.dishId)))
    throw new MealPrepCaptureError("INVALID_SELECTION");
}
/** Explicit public-content projection for future reviewed adapters. No route exposes it. */
export function offerContentProjection(body: unknown) {
  const offer = offerBodySchema.parse(body);
  return {
    dates: offer.dates,
    dishes: offer.dishes.map(({ dishId, name, description }) => ({
      dishId,
      name,
      description,
    })),
    packages: offer.packages,
    menus: offer.menus,
  };
}
