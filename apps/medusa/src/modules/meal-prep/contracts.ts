import { z } from "zod";

export const MEAL_PREP_CONTRACT = "1.1-r4" as const;
export const fulfillmentMethods = ["in_home", "delivery", "pickup"] as const;
export const selectionStyles = [
  "individual_dishes",
  "package",
  "chosen_menu",
  "tailored_plan",
] as const;
export const revisionKinds = [
  "arrangement",
  "menu",
  "quote",
  "change",
] as const;
export const changeTypes = [
  "menu",
  "portions",
  "reschedule",
  "skip",
  "pause",
] as const;
export type FulfillmentMethod = (typeof fulfillmentMethods)[number];
export type SelectionStyle = (typeof selectionStyles)[number];

// Scheduling intent only. No materializer, horizon, DST resolution or payment clock.
type LocalSlot = Readonly<{ id: string; weekday: number; localTime: string }>;
export type RecurrenceIntent =
  | Readonly<{
      kind: "weekly";
      timezone: string;
      anchorDate: string;
      slot: LocalSlot;
    }>
  | Readonly<{
      kind: "fortnightly";
      timezone: string;
      anchorDate: string;
      slot: LocalSlot;
    }>
  | Readonly<{
      kind: "multiple_weekly";
      timezone: string;
      anchorDate: string;
      slots: readonly LocalSlot[];
    }>
  | Readonly<{
      kind: "custom_dates";
      timezone: string;
      dates: readonly Readonly<{
        id: string;
        localDate: string;
        localTime: string;
      }>[];
    }>;

export type ServiceCapabilities = Readonly<{
  methods: Readonly<Record<FulfillmentMethod, boolean>>;
  selectionStyles: Readonly<Record<SelectionStyle, boolean>>;
}>;
export type DishSelection = Readonly<{
  dishId: string;
  offerRevisionId: string;
  servings: number;
  // Servings do not imply a billing unit or a payable amount.
  basePriceRevisionId: string | null;
}>;
export type PriceSnapshot =
  | Readonly<{ status: "unknown" }>
  | Readonly<{
      status: "proposed";
      currency: string;
      totalMinor: number;
      pricingPolicyVersion: string;
    }>;

// These interfaces deliberately do not choose a customer authentication mechanism.
export type MealPrepPrincipal = Readonly<
  { actorId: string; chefId: string } & (
    | { role: "chef" }
    | { role: "customer"; customerId: string }
  )
>;

const id = z.string().min(1).max(200);
export const principalSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("chef"), actorId: id, chefId: id }).strict(),
  z
    .object({
      role: z.literal("customer"),
      actorId: id,
      chefId: id,
      customerId: id,
    })
    .strict(),
]);
const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(jsonValue),
  ]),
);
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// An opaque, private draft envelope, NOT a validated offer/recurrence/price or a payable quote.
// Future commands must validate their typed content and decisions before approval/application.
export const stageRevisionSchema = z
  .object({
    subjectId: id,
    expectedVersion: z.number().int().nonnegative().max(2147483646),
    idempotencyKey: id,
    kind: z.enum(revisionKinds),
    body: z.record(jsonValue),
  })
  .strict();
export type StageRevisionInput = z.infer<typeof stageRevisionSchema>;
export type StageRevisionResult = Readonly<{
  revisionId: string;
  version: number;
}>;
