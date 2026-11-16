import { composeSchedule } from "../presentation";
const event: any = {
  id: "display:a",
  source: { type: "private-event", id: "a" },
  title: "QA ScheduleEdit",
  status: "pending",
  timeZone: "America/Chicago",
  requestedTime: { start: "2026-11-30T20:00:00Z" },
  displayTime: { start: "2026-11-30T23:00:00Z" },
  appointmentTime: { start: "2026-12-01T16:00:00Z" },
};
it("single pending sentence uses recorded arrival, never estimated display or browser timezone", () => {
  const answer = composeSchedule({
    complete: true,
    entries: [event],
    message: "",
  });
  expect(answer.presentation).toBe("answer");
  expect(answer.message).toBe(
    "You have one pending request, QA ScheduleEdit, on November 30, 2026 at 2:00 PM.",
  );
  expect(answer.entries[0]).toBe(event);
});
it("confirmed uses appointment; missing arrival and incomplete reads never invent time/availability", () => {
  expect(
    composeSchedule({
      complete: true,
      entries: [{ ...event, status: "confirmed" }],
      message: "",
    }).message,
  ).toContain("December 1, 2026 at 10:00 AM");
  expect(
    composeSchedule({
      complete: true,
      entries: [{ ...event, requestedTime: null }],
      message: "",
    }).message,
  ).toContain("no recorded arrival");
  expect(
    composeSchedule({ complete: false, entries: [], message: "Incomplete" })
      .presentation,
  ).toBe("unavailable");
  expect(
    composeSchedule({ complete: true, entries: [event, event], message: "" })
      .presentation,
  ).toBe("list");
});
