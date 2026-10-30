import { withinGlobalHours } from "../global-hours";
import type { Settings } from "../../../lib/availability/slots";
const settings: Settings = {
  timezone: "America/New_York",
  google_mode: "internal_only",
  weekly: { "1": [{ start: "09:00", end: "17:00" }] },
  overrides: {},
  notice_rules: [
    { enabled: true, days: 100, scope: "all", experience_ids: [] },
  ],
};
it("uses global hours/closures without private-event notice rules or a recurrence horizon", () => {
  expect(
    withinGlobalHours("2030-11-04T14:00Z", "2030-11-04T22:00Z", settings),
  ).toBe(true);
  expect(
    withinGlobalHours(
      "2030-11-04T14:00Z",
      "2030-11-04T22:00:00.001Z",
      settings,
    ),
  ).toBe(false);
  expect(
    withinGlobalHours("2030-11-04T14:00Z", "2030-11-04T15:00Z", {
      ...settings,
      overrides: { "2030-11-04": [] },
    }),
  ).toBe(false);
});
it("checks every occupied segment, including partial minutes and a closed gap", () => {
  const s = {
    ...settings,
    weekly: {
      "1": [
        { start: "09:00", end: "10:00" },
        { start: "11:00", end: "17:00" },
      ],
    },
  };
  expect(
    withinGlobalHours("2026-11-02T14:59:59Z", "2026-11-02T16:00:01Z", s),
  ).toBe(false);
  expect(
    withinGlobalHours("2026-11-02T14:00:00.001Z", "2026-11-02T15:00:00Z", s),
  ).toBe(true);
  expect(withinGlobalHours("invalid", "2026-11-02T15:00Z", s)).toBe(false);
  expect(withinGlobalHours("2026-11-02T15:00Z", "2026-11-02T15:00Z", s)).toBe(
    false,
  );
});
it("walks real instants through DST folds and gaps without shifting a requested interval", () => {
  const s = {
    ...settings,
    weekly: {},
    overrides: {
      "2026-11-01": [{ start: "01:30", end: "02:00" }],
      "2027-03-14": [{ start: "01:00", end: "04:00" }],
    },
  };
  expect(withinGlobalHours("2026-11-01T05:30Z", "2026-11-01T06:00Z", s)).toBe(
    true,
  );
  expect(withinGlobalHours("2026-11-01T06:30Z", "2026-11-01T07:00Z", s)).toBe(
    true,
  );
  expect(withinGlobalHours("2026-11-01T05:30Z", "2026-11-01T07:00Z", s)).toBe(
    false,
  );
  expect(withinGlobalHours("2027-03-14T06:00Z", "2027-03-14T08:00Z", s)).toBe(
    true,
  );
});
