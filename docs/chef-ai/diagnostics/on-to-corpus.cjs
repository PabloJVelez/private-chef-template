// Frozen original 12-case corpus: do not alter expectations/repetitions after seeing results.
const day = (day) => ({ kind: "day_of_month", day }),
  iso = (value) => ({ kind: "iso", value });
const base = {
  target: "context",
  targetDate: null,
  date: day(29),
  time: null,
  clarification: "none",
  continuation: false,
};
const cases = [
  ["move-to", "Can you move it to the 29th?", base, 10],
  ["change-to", "Can you change the date to the 29th?", base, 10],
  [
    "on-to",
    "Move the event on the 30th to the 29th.",
    { ...base, target: "date", targetDate: day(30) },
    3,
  ],
  [
    "on-time",
    "Change the time of the event on the 29th to 2 PM.",
    {
      ...base,
      target: "date",
      targetDate: day(29),
      date: null,
      time: "14:00",
    },
    3,
  ],
  [
    "tomorrow",
    "Move it to tomorrow.",
    { ...base, date: { kind: "relative_day", offset: 1 } },
    3,
  ],
  [
    "explicit",
    "Move the event on November 30 2026 to December 1 2026.",
    {
      ...base,
      target: "date",
      targetDate: iso("2026-11-30"),
      date: iso("2026-12-01"),
    },
    3,
  ],
  [
    "time",
    "Change its arrival time to 5 PM.",
    { ...base, date: null, time: "17:00" },
    3,
  ],
  [
    "target-fragment",
    "This is for the event on the 30th.",
    {
      ...base,
      target: "date",
      targetDate: day(30),
      date: null,
      continuation: true,
    },
    3,
  ],
  [
    "time-fragment",
    "At 5 PM.",
    { ...base, date: null, time: "17:00", continuation: true },
    3,
  ],
  [
    "month",
    "Move it to December 1.",
    { ...base, date: { kind: "month_day", month: 12, day: 1, year: null } },
    3,
  ],
  [
    "month-time",
    "Change the event on November 30 to 2 PM.",
    {
      ...base,
      target: "date",
      targetDate: { kind: "month_day", month: 11, day: 30, year: null },
      date: null,
      time: "14:00",
    },
    3,
  ],
  ["date-time", "Move it to the 29th at 2 PM.", { ...base, time: "14:00" }, 3],
];

module.exports = { cases, day, base };
