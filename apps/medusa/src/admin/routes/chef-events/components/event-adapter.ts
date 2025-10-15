import { DateTime } from "luxon"
import type { AdminChefEventDTO } from "../../../../sdk/admin/admin-chef-events"

export type RBCEvent = {
  id: string | number
  title: string
  start: Date
  end: Date
  allDay?: boolean
  resource?: AdminChefEventDTO
}

const toDateTime = (value: unknown) => {
  if (!value) return DateTime.invalid("invalid date")
  if (typeof value === "string") return DateTime.fromISO(value)
  try {
    // Handles Date and date-like values
    return DateTime.fromJSDate(new Date(value as any))
  } catch {
    return DateTime.invalid("invalid date")
  }
}

export const chefEventToRbc = (e: AdminChefEventDTO): RBCEvent => {
  const fullName = [e.firstName, e.lastName].filter(Boolean).join(" ").trim()
  const title = [formatTime12Hour(e.requestedTime) || "", fullName || "Untitled"]
    .filter(Boolean)
    .join(" ")

  // Prefer explicit start/end from API if available
  const startAt = (e as any).startAt as string | undefined
  const endAt = (e as any).endAt as string | undefined

  let startDT: DateTime
  let endDT: DateTime

  if (startAt) {
    startDT = DateTime.fromISO(startAt)
  } else {
    // Combine requestedDate + requestedTime
    const base = toDateTime((e as any).requestedDate)
    const [h, m] = (e.requestedTime || "00:00").split(":").map(Number)
    startDT = base.set({ hour: h || 0, minute: m || 0, second: 0, millisecond: 0 })
  }

  if (endAt) {
    endDT = DateTime.fromISO(endAt)
  } else {
    const durationMin = (e as any).estimatedDuration ?? 60
    endDT = startDT.plus({ minutes: durationMin })
  }

  return {
    id: e.id,
    start: startDT.toJSDate(),
    end: endDT.toJSDate(),
    allDay: Boolean((e as any).allDay),
    title,
    resource: e,
  }
}

/** 24h -> 12h (keeps parity with current UI) */
export const formatTime12Hour = (time?: string | null) => {
  if (!time) return ""
  const [h, m] = time.split(":").map(Number)
  const period = (h ?? 0) >= 12 ? "PM" : "AM"
  const display = (h ?? 0) === 0 ? 12 : (h ?? 0) > 12 ? (h ?? 0) - 12 : (h ?? 0)
  return `${display}:${String(m ?? 0).padStart(2, "0")} ${period}`
}
