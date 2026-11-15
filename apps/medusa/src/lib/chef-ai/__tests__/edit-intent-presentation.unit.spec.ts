import { formatProposedEdit } from "../edit-intent-presentation";
import type { EditIntent } from "../edit-intent";
it.each([
  [{ kind: "day_of_month", day: 29 }, "29th"],
  [{ kind: "day_of_month", day: 1 }, "1st"],
  [{ kind: "day_of_month", day: 2 }, "2nd"],
  [{ kind: "day_of_month", day: 3 }, "3rd"],
  [{ kind: "day_of_month", day: 11 }, "11th"],
  [{ kind: "day_of_month", day: 12 }, "12th"],
  [{ kind: "day_of_month", day: 13 }, "13th"],
  [{ kind: "day_of_month", day: 21 }, "21st"],
  [{ kind: "iso", value: "2026-11-29" }, "November 29, 2026"],
  [{ kind: "iso", value: "2026-13-29" }, "2026-13-29"],
  [{ kind: "month_day", month: 12, day: 1, year: null }, "December 1"],
  [{ kind: "month_day", month: 12, day: 1, year: 2027 }, "December 1, 2027"],
  [{ kind: "relative_day", offset: 1 }, "Tomorrow"],
  [{ kind: "relative_day", offset: 0 }, "Today"],
  [{ kind: "relative_day", offset: -1 }, "Yesterday"],
  [{ kind: "relative_day", offset: 3 }, "In 3 days"],
  [{ kind: "relative_day", offset: -2 }, "2 days ago"],
])(
  "formats typed expression %j without choosing a target month or browser date",
  (date, expected) => {
    expect(
      formatProposedEdit({ date: date as EditIntent["date"], time: null }),
    ).toBe(`Proposed date: ${expected}`);
  },
);
it("shows both proposed fields, and never treats a target date as a new date", () => {
  expect(
    formatProposedEdit({
      date: { kind: "day_of_month", day: 29 },
      time: "14:30",
    }),
  ).toBe("Proposed date: 29th · Proposed time: 2:30 PM");
  const wrong: EditIntent = {
    target: "date",
    targetDate: { kind: "day_of_month", day: 29 },
    date: null,
    time: null,
    clarification: "none",
  };
  expect(formatProposedEdit(wrong)).toBe("New date/time not captured");
  expect(formatProposedEdit({ date: null, time: "00:00" })).toBe(
    "Proposed time: 12 AM",
  );
});
