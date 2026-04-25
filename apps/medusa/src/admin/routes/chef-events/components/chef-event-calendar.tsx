"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar, Views, type View } from "react-big-calendar"
import "react-big-calendar/lib/css/react-big-calendar.css"
import "../../../styles/rbc-overrides.css"

import { useNavigate } from "react-router-dom"
import { DateTime } from "luxon"
import { Button, toast } from "@medusajs/ui"

import { localizer } from "../../../lib/calendar-localizer"
import { useAdminListChefEvents } from "../../../hooks/chef-events"
import {
  useGoogleCalendarResyncMutation,
  useGoogleCalendarStatus,
} from "../../../hooks/google-calendar"
import { chefEventToRbc, type RBCEvent } from "./event-adapter"
import { eventTypeOptions } from "../schemas"
import { chefEventStatusToDisplayHex } from "../../../../lib/chef-event-google-calendar-colors"

const MOBILE_MEDIA_QUERY = "(max-width: 767px)"

function getInitialCalendarView(): View {
  if (typeof window === "undefined") {
    return Views.MONTH
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches ? Views.AGENDA : Views.MONTH
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener?.("change", onChange)
    return () => mql.removeEventListener?.("change", onChange)
  }, [])

  return isMobile
}

export const ChefEventCalendar = () => {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { data: googleCalendarStatus } = useGoogleCalendarStatus()
  const resyncMutation = useGoogleCalendarResyncMutation()

  const [view, setView] = useState<View>(getInitialCalendarView)
  const [date, setDate] = useState<Date>(new Date())

  // Keep your existing filters; add range later if/when supported
  const { data, isLoading } = useAdminListChefEvents({
    q: "",
    status: "",
    eventType: "",
    locationType: "",
    limit: 1000,
    offset: 0,
  })

  const events: RBCEvent[] = useMemo(
    () => (data?.chefEvents ?? []).map(chefEventToRbc),
    [data?.chefEvents]
  )

  // keyboard shortcuts parity
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        setDate((d) => DateTime.fromJSDate(d).plus({ months: -1 }).toJSDate())
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        setDate((d) => DateTime.fromJSDate(d).plus({ months: 1 }).toJSDate())
      } else if (e.key.toLowerCase() === "t") {
        setDate(new Date())
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const components = useMemo(
    () => ({
      // Single-letter weekday headers on mobile (S M T W T F S), full on larger.
      header: ({ date: headerDate, label }: { date: Date; label: string }) => {
        const dt = DateTime.fromJSDate(headerDate)
        return (
          <>
            <span className="inline sm:hidden">{dt.toFormat("ccccc")}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        )
      },
      month: {
        event: ({ event }: { event: RBCEvent }) => {
          const typeLabel = event.resource
            ? eventTypeOptions.find(
                (o) => o.value === (event.resource as any).eventType
              )?.label
            : undefined
          const status = (event.resource as any)?.status as string | undefined
          const color = chefEventStatusToDisplayHex(status)
          if (isMobile) {
            return (
              <div
                className="flex items-center justify-center"
                title={event.title}
                aria-label={event.title}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
            )
          }
          return (
            <div className="flex items-start gap-1">
              <span
                className="mt-[6px] inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-xs text-[var(--fg-base)]">{event.title}</div>
                {typeLabel && (
                  <div className="truncate text-[11px] text-[var(--fg-muted)]">{typeLabel}</div>
                )}
              </div>
            </div>
          )
        },
        dateHeader: ({ date: cellDate, isOffRange }: { date: Date; isOffRange?: boolean }) => {
          const dt = DateTime.fromJSDate(cellDate)
          const now = DateTime.now()
          const isToday = dt.hasSame(now, "day")
          // Show the "MMM d" prefix ONLY for off-range days that are on the
          // first row (previous month padding) or last row (next month padding)
          // AND only on viewports wide enough to read it. On mobile we rely on
          // the muted color from `.rbc-off-range` to distinguish padding days
          // so that cell widths stay usable on narrow screens.
          const numericLabel = dt.toFormat("d")
          const extendedLabel = isOffRange ? dt.toFormat("MMM d") : numericLabel
          return (
            <div className="flex justify-end">
              <span
                className={[
                  "rounded-full px-1.5 py-[1px] text-[11px] leading-5 sm:px-2 sm:text-xs",
                  isToday
                    ? "bg-[var(--accent-base)] text-white"
                    : "text-[var(--fg-muted)]",
                  isOffRange && !isToday ? "opacity-75" : "",
                ].join(" ")}
                title={dt.toFormat("EEEE, MMMM d, yyyy")}
              >
                <span className="sm:hidden">{numericLabel}</span>
                <span className="hidden sm:inline">{extendedLabel}</span>
              </span>
            </div>
          )
        },
      },
      agenda: {
        event: ({ event }: { event: RBCEvent }) => {
          const status = (event.resource as any)?.status as string | undefined
          const color = chefEventStatusToDisplayHex(status)
          return (
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="truncate">{event.title}</span>
            </div>
          )
        },
      },
      event: ({ title }: { title: string }) => (
        <div className="truncate text-xs leading-tight">{title}</div>
      ),
    }),
    [isMobile]
  )

  // Work around TSX typing friction by casting Calendar
  const RBCalendar = Calendar as any

  const isMonth = view === Views.MONTH
  // Month needs a fixed-height grid so each week row has breathing room.
  // Agenda should grow to its content so we don't show a giant empty pane
  // after the last event.
  const hostHeightClasses = isMonth
    ? "h-[calc(100dvh-13rem)] min-h-[360px] overflow-x-hidden sm:h-[calc(100dvh-12.5rem)] sm:min-h-[420px] md:h-[calc(100dvh-11rem)] md:min-h-[520px]"
    : "h-auto max-h-[calc(100dvh-11rem)] overflow-y-auto overflow-x-hidden md:max-h-[calc(100dvh-9rem)]"

  const handleResync = async () => {
    try {
      await resyncMutation.mutateAsync()
      toast.success("Google Calendar resync started")
    } catch (error) {
      toast.error("Could not start resync", {
        description: error instanceof Error ? error.message : "Unknown error",
        duration: 5000,
      })
    }
  }

  return (
    <div className="w-full min-w-0 px-2 pb-4 pt-2 sm:px-4 md:px-6">
      <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-xs text-ui-fg-subtle">
        <div>
          Google Calendar sync:{" "}
          <span className="font-medium text-ui-fg-base">
            {googleCalendarStatus?.status === "active"
              ? "Connected"
              : googleCalendarStatus?.status === "sync_error"
                ? "Sync error"
                : googleCalendarStatus?.status === "reauthorization_required"
                  ? "Reauthorization required"
                  : "Not connected"}
          </span>
        </div>
        {googleCalendarStatus?.status === "active" ? (
          <Button
            size="small"
            variant="secondary"
            onClick={handleResync}
            isLoading={resyncMutation.isPending}
            disabled={resyncMutation.isPending}
          >
            Resync
          </Button>
        ) : null}
      </div>
      <div
        className={[
          "chef-events-calendar-rbc-host w-full min-w-0",
          hostHeightClasses,
        ].join(" ")}
      >
        <RBCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          formats={{
            dateFormat: "d",
            weekdayFormat: "ccc",
            monthHeaderFormat: "MMMM yyyy",
            // Shorter agenda header like "Apr 19 – May 19" so the toolbar
            // label fits on one row on mobile.
            agendaHeaderFormat: ({ start, end }: { start: Date; end: Date }) => {
              const s = DateTime.fromJSDate(start)
              const e = DateTime.fromJSDate(end)
              const sameYear = s.year === e.year
              const startLabel = s.toFormat(sameYear ? "MMM d" : "MMM d, yyyy")
              const endLabel = e.toFormat("MMM d, yyyy")
              return `${startLabel} – ${endLabel}`
            },
            agendaDateFormat: "MMM d",
            agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
              `${DateTime.fromJSDate(start).toFormat("h:mm a")} – ${DateTime.fromJSDate(end).toFormat("h:mm a")}`,
          }}
          views={[Views.MONTH, Views.AGENDA]}
          popup
          selectable={false}
          tooltipAccessor={(e: RBCEvent) => e.title}
          components={components}
          onSelectEvent={(evt: RBCEvent) => navigate(`/chef-events/${evt.id}`)}
          onDrillDown={(next: Date) => {
            // Month date-number click — switch to agenda focused on that day.
            setDate(next)
            setView(Views.AGENDA)
          }}
          culture="en-US"
          step={30}
          timeslots={2}
          style={{ height: isMonth ? "100%" : "auto" }}
        />
      </div>

      {isLoading && (
        <div className="py-4 text-center text-sm text-[var(--fg-muted)] sm:py-6">
          Loading events…
        </div>
      )}
    </div>
  )
}

export default ChefEventCalendar
