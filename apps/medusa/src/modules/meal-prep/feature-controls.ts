// PR 1 is persistence infrastructure only. Environment variables cannot activate
// incomplete flows. Enabling a capability requires a reviewed implementation.
export const mealPrepFeatures = Object.freeze({
  administration: false,
  customerAccess: false,
  scheduling: false,
  approvalExecution: false,
  paymentCollection: false,
  manualPaymentLinks: false,
  autopay: false,
  outboxDispatch: false,
} as const);

export function requireMealPrepFeature(
  feature: keyof typeof mealPrepFeatures,
): void {
  if (!mealPrepFeatures[feature])
    throw new Error(`Meal prep capability disabled: ${feature}`);
}

export const unresolvedMealPrepDecisions = Object.freeze([
  "D01",
  "D02",
  "D03",
  "D04",
  "D05",
  "D06",
  "D07",
  "D08",
  "D09",
  "D10",
  "D11",
  "D12",
] as const);
