"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar, Views, type View } from "react-big-calendar"
import "react-big-calendar/lib/css/react-big-calendar.css"
import "../../../styles/rbc-overrides.css"

// no local buttons in this component; toolbar is RBC
import { useNavigate } from "react-router-dom"
import { DateTime } from "luxon"

import { localizer } from "../../../lib/calendar-localizer"
import { useAdminListChefEvents } from "../../../hooks/chef-events"
import { chefEventToRbc, type RBCEvent } from "./event-adapter"
import { eventTypeOptions } from "../schemas"

interface ChefEventCalendarProps {
  onCreateEvent: () => void
}

// no MonthPicker; we'll use RBC's default toolbar

export const ChefEventCalendar = ({ onCreateEvent }: ChefEventCalendarProps) => {
  const navigate = useNavigate()

  // RBC state
  const [view, setView] = useState<View>(Views.MONTH)
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
      // Custom month event: dot + time/name + type subtitle
      month: {
        event: ({ event }: { event: RBCEvent }) => {
          const typeLabel = event.resource
            ? eventTypeOptions.find((o) => o.value === (event.resource as any).eventType)?.label
            : undefined
          const status = (event.resource as any)?.status as string | undefined
          const color = status === "confirmed"
            ? "#16a34a" // green-600
            : status === "cancelled"
            ? "#ef4444" // red-500
            : status === "completed"
            ? "#3b82f6" // blue-500
            : "#ea580c" // pending / default - orange-600
          return (
            <div className="flex items-start gap-1">
              <span className="mt-[6px] inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-xs text-[var(--fg-base)]">{event.title}</div>
                {typeLabel && (
                  <div className="truncate text-[11px] text-[var(--fg-muted)]">{typeLabel}</div>
                )}
              </div>
            </div>
          )
        },
        dateHeader: ({ date }: { date: Date }) => {
          const dt = DateTime.fromJSDate(date)
          const isToday = dt.hasSame(DateTime.now(), "day")
          return (
            <div className="flex justify-end">
              <span
                className={[
                  "text-xs px-2 py-[2px] rounded-full",
                  isToday ? "bg-[var(--accent-base)] text-white" : "text-[var(--fg-muted)]",
                ].join(" ")}
                title={dt.toFormat("EEEE, MMMM d, yyyy")}
              >
                {dt.toFormat("d")}
              </span>
            </div>
          )
        },
      },
      // Agenda row: show colored dot with title
      agenda: {
        event: ({ event }: { event: RBCEvent }) => {
          const status = (event.resource as any)?.status as string | undefined
          const color = status === "confirmed"
            ? "#16a34a"
            : status === "cancelled"
            ? "#ef4444"
            : status === "completed"
            ? "#3b82f6"
            : "#ea580c"
          return (
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="truncate">{event.title}</span>
            </div>
          )
        },
      },
      // Default event renderer (fallback)
      event: ({ title }: { title: string }) => <div className="truncate text-xs leading-tight">{title}</div>,
      // keep RBC's default toolbar
    }),
    []
  )

  // Work around TSX typing friction by casting Calendar
  const RBCalendar = Calendar as any

  return (
    <>
      {/* Calendar */}
      <div className="p-3">
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
            dateFormat: "d", // 1..31 without leading zero
            weekdayFormat: "ccc", // Sun..Sat
            monthHeaderFormat: "MMMM yyyy",
          }}
          views={[Views.MONTH, Views.AGENDA]}
          popup
          selectable={false}
          tooltipAccessor={(e: RBCEvent) => e.title}
          components={components}
          onSelectEvent={(evt: RBCEvent) => navigate(`/chef-events/${evt.id}`)}
          culture="en-US"
          step={30}
          timeslots={2}
          // Use CSS for visual theming; keep propGetters default
          style={{ height: "calc(100vh - 260px)", minHeight: 520 }}
        />

        {isLoading && (
          <div className="py-6 text-center text-sm text-[var(--fg-muted)]">
            Loading events…
          </div>
        )}
      </div>
    </>
  )
}

export default ChefEventCalendar
