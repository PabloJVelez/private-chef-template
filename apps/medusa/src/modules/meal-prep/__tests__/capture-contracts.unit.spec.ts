import {
  offer,
  offerInput,
  household,
  general,
  request,
  enabledSetup,
} from "./capture-fixtures";
import {
  parseCapture,
  offerIncludesDate,
  validateSelection,
  offerContentProjection,
  localDateSchema,
} from "../capture-contracts";
import { mealPrepFeatures } from "../feature-controls";

test("date and explicit week boundaries across year-end and leap day", () => {
  for (const date of ["2026-12-29", "2027-01-01", "2027-01-04"])
    expect(offerIncludesDate(offer, date)).toBe(true);
  for (const date of ["2026-12-28", "2027-01-05"])
    expect(offerIncludesDate(offer, date)).toBe(false);
  const dated = {
    ...offer,
    dates: { kind: "date" as const, date: "2028-02-29" },
  };
  expect(offerIncludesDate(dated, "2028-02-29")).toBe(true);
  expect(offerIncludesDate(dated, "2028-03-01")).toBe(false);
  for (const date of [
    "2026-02-29",
    "2028-02-30",
    "2026-13-01",
    "2026-1-01",
    "2026-01-01T00:00:00Z",
  ])
    expect(localDateSchema.safeParse(date).success).toBe(false);
});
test.each([
  "individual_dishes",
  "package",
  "chosen_menu",
  "tailored_plan",
] as const)(
  "validates %s as a request with independent servings and quantity",
  (style) => {
    const input = request();
    const lines = [{ dishId: "dish-1", quantity: 2, servings: 7 }];
    input.body.selection =
      style === "package"
        ? { style, packageId: "package-1", lines }
        : style === "chosen_menu"
          ? { style, menuId: "menu-1", lines }
          : style === "tailored_plan"
            ? { style, brief: "Chef proposal requested", lines: [] }
            : { style, lines };
    expect(parseCapture(input)).toEqual(input);
    expect(() =>
      validateSelection(input.body, offer, enabledSetup()),
    ).not.toThrow();
    const disabled = enabledSetup();
    disabled.selection_styles[style] = false;
    expect(() => validateSelection(input.body, offer, disabled)).toThrow(
      "METHOD_OR_STYLE_DISABLED",
    );
  },
);
test.each(["in_home", "delivery", "pickup"] as const)(
  "method %s must be independently enabled",
  (method) => {
    const input = request();
    input.body.method = method;
    const setup = enabledSetup();
    expect(() => validateSelection(input.body, offer, setup)).not.toThrow();
    setup.methods[method].enabled = false;
    expect(() => validateSelection(input.body, offer, setup)).toThrow(
      "METHOD_OR_STYLE_DISABLED",
    );
  },
);
test.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid quantity/servings %s",
  (value) => {
    for (const field of ["quantity", "servings"]) {
      const input = request();
      (input.body.selection.lines[0] as any)[field] = value;
      expect(() => parseCapture(input)).toThrow("INVALID_INPUT");
    }
  },
);
test("high servings remain request data without a count-based rejection", () => {
  const input = request();
  input.body.selection.lines[0].servings = 1000000;
  expect(() =>
    validateSelection(
      parseCapture(input).body as typeof input.body,
      offer,
      enabledSetup(),
    ),
  ).not.toThrow();
});
test("rejects unoffered dishes, invalid options, dates and duplicate lines", () => {
  const input = request();
  input.body.selection.lines[0].dishId = "unknown";
  expect(() => validateSelection(input.body, offer, enabledSetup())).toThrow(
    "INVALID_SELECTION",
  );
  input.body.selection = {
    style: "package",
    packageId: "package-1",
    lines: [{ dishId: "dish-2", quantity: 1, servings: 1 }],
  };
  expect(() => validateSelection(input.body, offer, enabledSetup())).toThrow(
    "INVALID_SELECTION",
  );
  input.body.selection = {
    style: "chosen_menu",
    menuId: "forged",
    lines: [{ dishId: "dish-1", quantity: 1, servings: 1 }],
  };
  expect(() => validateSelection(input.body, offer, enabledSetup())).toThrow(
    "INVALID_SELECTION",
  );
  input.body = request().body;
  input.body.requestedDate = "2027-01-05";
  expect(() => validateSelection(input.body, offer, enabledSetup())).toThrow(
    "INVALID_SELECTION",
  );
  input.body.selection.lines.push(input.body.selection.lines[0]);
  expect(() => parseCapture(input)).toThrow("INVALID_INPUT");
});
test("offer references are unique and internally valid", () => {
  for (const body of [
    { ...offer, dishes: [...offer.dishes, offer.dishes[0]] },
    { ...offer, menus: [{ id: "bad", name: "Bad", dishIds: ["missing"] }] },
  ])
    expect(() => parseCapture({ ...offerInput, body })).toThrow(
      "INVALID_INPUT",
    );
});
test("conditional intake keeps general data but rejects home access/equipment on delivery and pickup", () => {
  expect(parseCapture(household)).toEqual(household);
  for (const intake of [
    {
      method: "delivery",
      ...general,
      address: null,
      deliveryInstructions: null,
    },
    { method: "pickup", ...general },
  ]) {
    expect(() =>
      parseCapture({ ...household, body: { kind: "household", intake } }),
    ).not.toThrow();
    for (const field of ["homeAccess", "equipment", "storage", "containers"])
      expect(() =>
        parseCapture({
          ...household,
          body: {
            kind: "household",
            intake: { ...intake, [field]: "PRIVATE" },
          },
        }),
      ).toThrow("INVALID_INPUT");
  }
});
test("strict contracts reject pricing, capacity, card data and identity injection; errors contain no private values", () => {
  for (const extra of [
    { price: 0 },
    { chargeable: true },
    { spendingCap: 100 },
    { remainingServings: 1 },
    { cardNumber: "SECRET CARD" },
    { chefId: "forged" },
  ]) {
    expect(() => parseCapture({ ...request(), ...extra })).toThrow(
      /^INVALID_INPUT$/,
    );
    expect(() =>
      parseCapture({ ...request(), body: { ...request().body, ...extra } }),
    ).toThrow(/^INVALID_INPUT$/);
  }
  expect(Object.values(mealPrepFeatures).every((flag) => flag === false)).toBe(
    true,
  );
});
test("public-content projection accepts only offer content and excludes price references", () => {
  expect(offerContentProjection(offer).dishes[0]).toEqual({
    dishId: "dish-1",
    name: "Soup",
    description: null,
  });
  expect(() => offerContentProjection(household.body)).toThrow();
  expect(() =>
    offerContentProjection({ ...offer, homeAccess: "PRIVATE" }),
  ).toThrow();
});
