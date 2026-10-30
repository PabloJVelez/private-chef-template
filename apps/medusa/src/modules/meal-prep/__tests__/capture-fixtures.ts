import { emptyMealPrepSetup } from "../../../lib/availability/slots";
import type {
  SaveCaptureInput,
  OfferBody,
  SelectionBody,
} from "../capture-contracts";
import type { MealPrepPrincipal } from "../contracts";
export const chef: MealPrepPrincipal = {
  role: "chef",
  actorId: "chef-user",
  chefId: "chef-default",
};
export const customer: MealPrepPrincipal = {
  role: "customer",
  actorId: "customer-user",
  chefId: "chef-default",
  customerId: "customer-1",
};
export const offer: OfferBody = {
  kind: "offer",
  dates: { kind: "week", startsOn: "2026-12-29" },
  dishes: [
    {
      dishId: "dish-1",
      name: "Soup",
      description: null,
      basePriceRevisionId: "price-ref",
    },
    {
      dishId: "dish-2",
      name: "Salad",
      description: null,
      basePriceRevisionId: null,
    },
  ],
  packages: [
    { id: "package-1", name: "Requested package", dishIds: ["dish-1"] },
  ],
  menus: [
    {
      id: "menu-1",
      name: "Requested visit menu",
      dishIds: ["dish-1", "dish-2"],
    },
  ],
};
export const general = {
  allergies: ["Peanuts"],
  dietaryRestrictions: ["No gluten"],
  preferences: ["Mild"],
  householdSize: 3,
  portionPreferences: "Larger portions",
};
export const household: SaveCaptureInput = {
  captureId: "household-1",
  expectedVersion: 0,
  idempotencyKey: "household",
  customerId: "customer-1",
  householdId: null,
  body: {
    kind: "household",
    intake: {
      method: "in_home",
      ...general,
      address: "PRIVATE ADDRESS",
      homeAccess: "PRIVATE ACCESS",
      equipment: "Oven",
      storage: "Fridge",
      containers: "Glass",
    },
  },
};
export const offerInput: SaveCaptureInput = {
  captureId: "offer-1",
  expectedVersion: 0,
  idempotencyKey: "offer",
  customerId: null,
  householdId: null,
  body: offer,
};
export function request(
  offerRevisionId = "offer-rev",
  intakeRevisionId = "intake-rev",
): SaveCaptureInput & { body: SelectionBody } {
  return {
    captureId: "selection-1",
    expectedVersion: 0,
    idempotencyKey: "selection",
    customerId: "customer-1",
    householdId: "household-1",
    body: {
      kind: "selection",
      requestedDate: "2027-01-01",
      method: "in_home",
      offerRevisionId,
      intakeRevisionId,
      selection: {
        style: "individual_dishes",
        lines: [{ dishId: "dish-1", quantity: 2, servings: 7 }],
      },
    },
  };
}
export function enabledSetup() {
  const setup = emptyMealPrepSetup();
  for (const value of Object.values(setup.methods)) value.enabled = true;
  for (const key of Object.keys(setup.selection_styles))
    setup.selection_styles[key as "package"] = true;
  return setup;
}
