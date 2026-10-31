import { canonicalJson } from "../service";
import { stageRevisionSchema } from "../contracts";
import { mealPrepFeatures, requireMealPrepFeature } from "../feature-controls";

describe("meal-prep foundation boundaries", () => {
  it("cannot activate unfinished capabilities through environment flags", () => {
    const previous = process.env.MEAL_PREP_ENABLED;
    process.env.MEAL_PREP_ENABLED = "true";
    try {
      for (const feature of Object.keys(
        mealPrepFeatures,
      ) as (keyof typeof mealPrepFeatures)[]) {
        expect(() => requireMealPrepFeature(feature)).toThrow("disabled");
      }
      expect(Object.isFrozen(mealPrepFeatures)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.MEAL_PREP_ENABLED;
      else process.env.MEAL_PREP_ENABLED = previous;
    }
  });
  it("hashes equivalent JSON identically without losing array order or null distinctions", () => {
    expect(canonicalJson({ b: { d: 4, c: 3 }, a: 1 })).toBe(
      canonicalJson({ a: 1, b: { c: 3, d: 4 } }),
    );
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
  });
  it("rejects non-JSON content, unsafe versions and command fields that imply approval", () => {
    const command = {
      subjectId: "s",
      expectedVersion: 0,
      idempotencyKey: "k",
      kind: "menu",
      body: {},
    };
    for (const invalid of [
      { ...command, expectedVersion: -1 },
      { ...command, expectedVersion: 1.5 },
      { ...command, expectedVersion: Number.MAX_SAFE_INTEGER },
      { ...command, approved: true },
      { ...command, body: { amount: Infinity } },
      { ...command, body: { missing: undefined } },
    ])
      expect(stageRevisionSchema.safeParse(invalid).success).toBe(false);
  });
});
