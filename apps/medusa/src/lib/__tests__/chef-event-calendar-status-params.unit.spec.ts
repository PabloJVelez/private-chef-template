import {
  calendarStatusSetsEqual,
  DEFAULT_CALENDAR_STATUSES,
  parseCalendarStatusesUrlParam,
  serializeCalendarStatusesUrlParam,
  sortCalendarStatuses,
} from "../chef-event-calendar-status-params"

describe("chef-event-calendar-status-params", () => {
  describe("parseCalendarStatusesUrlParam", () => {
    it("returns default when raw is null", () => {
      expect(parseCalendarStatusesUrlParam(null)).toEqual([...DEFAULT_CALENDAR_STATUSES])
    })

    it("returns default when raw is empty", () => {
      expect(parseCalendarStatusesUrlParam("")).toEqual([...DEFAULT_CALENDAR_STATUSES])
    })

    it("returns default when raw is only whitespace", () => {
      expect(parseCalendarStatusesUrlParam("  ,  ")).toEqual([...DEFAULT_CALENDAR_STATUSES])
    })

    it("ignores invalid tokens and keeps valid", () => {
      expect(parseCalendarStatusesUrlParam("completed,foo,bogus")).toEqual(["completed"])
    })

    it("dedupes and sorts", () => {
      expect(parseCalendarStatusesUrlParam("completed,pending,confirmed,pending")).toEqual([
        "pending",
        "confirmed",
        "completed",
      ])
    })
  })

  describe("serializeCalendarStatusesUrlParam", () => {
    it("returns null for default set regardless of order", () => {
      expect(serializeCalendarStatusesUrlParam(["confirmed", "pending"])).toBeNull()
    })

    it("returns CSV for non-default selection", () => {
      expect(serializeCalendarStatusesUrlParam(["completed"])).toBe("completed")
    })

    it("round-trips with parse for non-default", () => {
      const ser = serializeCalendarStatusesUrlParam(["cancelled", "pending"])
      expect(ser).toBe("pending,cancelled")
      expect(parseCalendarStatusesUrlParam(ser)).toEqual(["pending", "cancelled"])
    })
  })

  describe("sortCalendarStatuses", () => {
    it("orders by canonical order", () => {
      expect(sortCalendarStatuses(["completed", "pending", "cancelled"])).toEqual([
        "pending",
        "cancelled",
        "completed",
      ])
    })
  })

  describe("calendarStatusSetsEqual", () => {
    it("compares order-insensitively", () => {
      expect(calendarStatusSetsEqual(["confirmed", "pending"], ["pending", "confirmed"])).toBe(
        true
      )
    })
  })
})
