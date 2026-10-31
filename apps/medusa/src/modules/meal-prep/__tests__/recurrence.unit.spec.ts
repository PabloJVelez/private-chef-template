import { generateCandidates, recurrenceSchema } from "../recurrence";
const fixed = {
  timezone: "America/New_York",
  anchorDate: "2026-12-21",
  slot: { id: "visit", weekday: 1, localTime: "10:00" },
};
const generate = (
  recurrence: any,
  bounds = { from: "2026-12-20", through: "2027-01-25" },
) =>
  generateCandidates({
    arrangementId: "a",
    revisionId: "r",
    recurrence,
    bounds,
  });
describe("explicitly bounded recurrence", () => {
  it("weekly respects anchor and inclusive dates without copying menus", () => {
    const rows = generate({ kind: "weekly", ...fixed });
    expect(rows.map((r) => r.localDate)).toEqual([
      "2026-12-21",
      "2026-12-28",
      "2027-01-04",
      "2027-01-11",
      "2027-01-18",
      "2027-01-25",
    ]);
    expect(rows[0].resolution).toEqual({
      status: "resolved",
      instant: "2026-12-21T15:00:00.000Z",
    });
    expect(rows[0]).not.toHaveProperty("menu");
  });
  it("fortnightly stays anchored across ISO years and 53-week years", () => {
    expect(
      generate({ kind: "fortnightly", ...fixed }).map((r) => r.localDate),
    ).toEqual(["2026-12-21", "2027-01-04", "2027-01-18"]);
  });
  it("multiple slots have independent identity, including two visits on the same day", () => {
    const rows = generate(
      {
        kind: "multiple_weekly",
        timezone: "UTC",
        anchorDate: "2027-01-04",
        slots: [
          { id: "am", weekday: 1, localTime: "09:00" },
          { id: "pm", weekday: 1, localTime: "17:00" },
          { id: "wed", weekday: 3, localTime: "11:00" },
        ],
      },
      { from: "2027-01-04", through: "2027-01-10" },
    );
    expect(rows.map((r) => r.slotId)).toEqual(["am", "pm", "wed"]);
    expect(new Set(rows.map((r) => r.generationKey)).size).toBe(3);
  });
  it("custom dates are explicit, sorted and not coerced into weekly recurrence", () => {
    const rows = generate({
      kind: "custom_dates",
      timezone: "UTC",
      dates: [
        { id: "later", localDate: "2027-01-13", localTime: "09:00" },
        { id: "early", localDate: "2026-12-22", localTime: "08:00" },
        { id: "outside", localDate: "2028-01-01", localTime: "08:00" },
      ],
    });
    expect(rows.map((r) => r.slotId)).toEqual(["early", "later"]);
  });
  it("overlapping bounds and retries preserve keys; revision changes create a distinct namespace", () => {
    const recurrence = { kind: "weekly" as const, ...fixed };
    const first = generate(recurrence);
    const second = generate(recurrence, {
      from: "2027-01-04",
      through: "2027-01-11",
    });
    expect(second).toEqual(first.slice(2, 4));
    expect(
      generateCandidates({
        arrangementId: "a",
        revisionId: "r2",
        recurrence,
        bounds: { from: "2027-01-04", through: "2027-01-11" },
      })[0].generationKey,
    ).not.toBe(second[0].generationKey);
  });
  it.each([
    ["2027-03-14", "02:30", "gap", []],
    [
      "2027-11-07",
      "01:30",
      "fold",
      ["2027-11-07T05:30:00.000Z", "2027-11-07T06:30:00.000Z"],
    ],
  ])(
    "reports New York DST %s %s without a silent choice",
    (localDate, localTime, status, instants) => {
      const rows = generate(
        {
          kind: "custom_dates",
          timezone: "America/New_York",
          dates: [{ id: "dst", localDate, localTime }],
        },
        { from: localDate as string, through: localDate as string },
      );
      expect(rows[0].resolution).toEqual({ status, instants });
    },
  );
  it("also detects non-hour DST transitions and skipped calendar days", () => {
    expect(
      generate(
        {
          kind: "custom_dates",
          timezone: "Australia/Lord_Howe",
          dates: [{ id: "half", localDate: "2027-04-04", localTime: "01:45" }],
        },
        { from: "2027-04-04", through: "2027-04-04" },
      )[0].resolution.status,
    ).toBe("fold");
    expect(
      generate(
        {
          kind: "custom_dates",
          timezone: "Pacific/Apia",
          dates: [{ id: "skip", localDate: "2011-12-30", localTime: "12:00" }],
        },
        { from: "2011-12-30", through: "2011-12-30" },
      )[0].resolution.status,
    ).toBe("gap");
  });
  it("requires bounds, valid calendar/timezone/clock, matching anchor, and unique slot IDs", () => {
    expect(() =>
      generateCandidates({
        arrangementId: "a",
        revisionId: "r",
        recurrence: { kind: "weekly", ...fixed },
      } as any),
    ).toThrow();
    for (const patch of [
      { timezone: "invalid" },
      { anchorDate: "2027-02-30" },
      { anchorDate: "2026-12-22" },
      { slot: { ...fixed.slot, localTime: "24:00" } },
    ])
      expect(
        recurrenceSchema.safeParse({ kind: "weekly", ...fixed, ...patch })
          .success,
      ).toBe(false);
    expect(
      recurrenceSchema.safeParse({
        kind: "multiple_weekly",
        timezone: "UTC",
        anchorDate: "2027-01-01",
        slots: [fixed.slot, fixed.slot],
      }).success,
    ).toBe(false);
    expect(() =>
      generate(
        { kind: "weekly", ...fixed },
        { from: "2027-01-02", through: "2027-01-01" },
      ),
    ).toThrow();
  });
});
