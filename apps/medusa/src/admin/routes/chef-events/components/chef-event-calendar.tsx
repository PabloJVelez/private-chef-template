"use client"

import { useCallback, useMemo } from "react"
import { Calendar, Views, type View } from "react-big-calendar"
import "react-big-calendar/lib/css/react-big-calendar.css"
import "../../../styles/rbc-overrides.css"

import { useNavigate, useSearchParams } from "react-router-dom"
import { DateTime } from "luxon"
import { Button, Drawer, Text, toast } from "@medusajs/ui"

import { localizer } from "../../../lib/calendar-localizer"
import { useAdminListChefEvents } from "../../../hooks/chef-events"
import {
  useGoogleCalendarApproveIncidentMutation,
  useGoogleCalendarDenyIncidentMutation,
  useGoogleCalendarResyncMutation,
  useGoogleCalendarStatus,
} from "../../../hooks/google-calendar"
import { chefEventToRbc, type RBCEvent } from "./event-adapter"
import { eventTypeOptions } from "../schemas"
import { chefEventStatusToDisplayHex } from "../../../../lib/chef-event-google-calendar-colors"
import { requestedStartInEventZone } from "../../../../lib/chef-event-datetime-display"

const MOBILE_MEDIA_QUERY = "(max-width: 767px)"
const CALENDAR_DATE_PARAM = "date"
const CALENDAR_VIEW_PARAM = "view"
const CALENDAR_INCIDENT_PARAM = "incident"

const isSupportedView = (value: string | null): value is View => {
  return value === Views.MONTH || value === Views.AGENDA
}

const parseQueryDate = (value: string | null): Date | null => {
  if (!value) {
    return null
  }
  const dt = DateTime.fromISO(value)
  if (!dt.isValid) {
    return null
  }
  return dt.startOf("day").toJSDate()
}

function getInitialCalendarView(): View {
  if (typeof window === "undefined") {
    return Views.MONTH
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches ? Views.AGENDA : Views.MONTH
}

export const ChefEventCalendar = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: googleCalendarStatus } = useGoogleCalendarStatus()
  const resyncMutation = useGoogleCalendarResyncMutation()
  const approveIncidentMutation = useGoogleCalendarApproveIncidentMutation()
  const denyIncidentMutation = useGoogleCalendarDenyIncidentMutation()

  const queryView = searchParams.get(CALENDAR_VIEW_PARAM)
  const view: View = isSupportedView(queryView) ? queryView : getInitialCalendarView()
  const date = parseQueryDate(searchParams.get(CALENDAR_DATE_PARAM)) ?? new Date()

  const updateCalendarParams = useCallback(
    (nextDate: Date, nextView: View) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set(CALENDAR_DATE_PARAM, DateTime.fromJSDate(nextDate).toISODate() ?? "")
        next.set(CALENDAR_VIEW_PARAM, nextView)
        return next
      })
    },
    [setSearchParams]
  )

  const setCalendarDate = useCallback(
    (nextDate: Date) => {
      updateCalendarParams(nextDate, view)
    },
    [updateCalendarParams, view]
  )

  const setCalendarView = useCallback(
    (nextView: View) => {
      updateCalendarParams(date, nextView)
    },
    [date, updateCalendarParams]
  )

  const openIncidentDrawer = useCallback(
    (id: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set(CALENDAR_INCIDENT_PARAM, id)
        return next
      })
    },
    [setSearchParams]
  )

  const closeIncidentDrawer = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete(CALENDAR_INCIDENT_PARAM)
      return next
    })
  }, [setSearchParams])

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

  const selectedIncidentId = searchParams.get(CALENDAR_INCIDENT_PARAM)
  const selectedIncident = useMemo(() => {
    const incidents = googleCalendarStatus?.pendingIncidents ?? []
    if (!selectedIncidentId) {
      return null
    }
    return incidents.find((incident) => incident.id === selectedIncidentId) ?? null
  }, [googleCalendarStatus?.pendingIncidents, selectedIncidentId])

  const selectedChefEvent = useMemo(() => {
    if (!selectedIncident) {
      return null
    }
    const chefEvents = data?.chefEvents ?? []
    return (
      chefEvents.find((evt) => String(evt.id) === String(selectedIncident.chefEventId)) ??
      null
    )
  }, [data?.chefEvents, selectedIncident])

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
          return (
            <div className="flex items-center justify-center sm:items-start sm:justify-start sm:gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full sm:mt-[6px]"
                style={{ backgroundColor: color }}
              />
              <div className="hidden min-w-0 leading-tight sm:block">
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
    []
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

  const handleApproveIncident = async (id: string) => {
    try {
      await approveIncidentMutation.mutateAsync(id)
      toast.success("Cancellation approved")
      closeIncidentDrawer()
    } catch (error) {
      toast.error("Could not approve cancellation", {
        description: error instanceof Error ? error.message : "Unknown error",
        duration: 5000,
      })
    }
  }

  const handleDenyIncident = async (id: string) => {
    try {
      await denyIncidentMutation.mutateAsync(id)
      toast.success("Cancellation denied and event restored in Google")
      closeIncidentDrawer()
    } catch (error) {
      toast.error("Could not deny cancellation", {
        description: error instanceof Error ? error.message : "Unknown error",
        duration: 5000,
      })
    }
  }

  const selectedEventStart = selectedChefEvent
    ? requestedStartInEventZone(selectedChefEvent)
    : null
  const selectedEventDateLabel =
    selectedEventStart && selectedEventStart.isValid
      ? selectedEventStart.toFormat("LLL d, yyyy")
      : "Unknown date"
  const selectedEventTimeLabel =
    selectedEventStart && selectedEventStart.isValid
      ? selectedEventStart.toFormat("h:mm a")
      : "Unknown time"
  const selectedHostLabel = selectedChefEvent
    ? [selectedChefEvent.firstName, selectedChefEvent.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "Host not set"
    : "Host not found"
  const pendingCount = googleCalendarStatus?.pendingIncidents?.length ?? 0
  const firstPendingIncidentId = googleCalendarStatus?.pendingIncidents?.[0]?.id

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

      {pendingCount > 0 ? (
        <div className="mb-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-ui-fg-base">
                Events cancelled through Google Calendar
              </div>
              <div className="text-xs text-ui-fg-subtle">
                {pendingCount} pending review
              </div>
            </div>
            <Button
              size="small"
              variant="secondary"
              onClick={() => firstPendingIncidentId && openIncidentDrawer(firstPendingIncidentId)}
              disabled={!firstPendingIncidentId}
            >
              Review
            </Button>
          </div>
        </div>
      ) : null}

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
          onView={setCalendarView}
          date={date}
          onNavigate={setCalendarDate}
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
            setCalendarDate(next)
            setCalendarView(Views.AGENDA)
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

      <Drawer
        open={Boolean(selectedIncident)}
        onOpenChange={(open) => {
          if (!open) {
            closeIncidentDrawer()
          }
        }}
      >
        <Drawer.Content className="max-w-xl bg-ui-bg-base sm:inset-y-0 sm:right-0 sm:rounded-none sm:border-y-0 sm:border-r-0 sm:border-l">
          <Drawer.Header>
            <Drawer.Title>Review Google cancellation request</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body>
            {selectedIncident ? (
              <div className="space-y-4">
                <Text className="text-ui-fg-subtle">
                  Google attempted to cancel this event. Decide whether to apply that
                  cancellation in the app or keep the app event and restore it in Google.
                </Text>

                <div className="space-y-2 rounded-md border border-ui-border-base p-3">
                  <div>
                    <Text size="small" className="text-ui-fg-subtle">
                      Event
                    </Text>
                    <Text weight="plus">
                      {String(selectedIncident.payload?.summary || "Chef event")}
                    </Text>
                  </div>
                  <div>
                    <Text size="small" className="text-ui-fg-subtle">
                      Host
                    </Text>
                    <Text>{selectedHostLabel}</Text>
                  </div>
                  <div>
                    <Text size="small" className="text-ui-fg-subtle">
                      Scheduled for
                    </Text>
                    <Text>
                      {selectedEventDateLabel} at {selectedEventTimeLabel}
                    </Text>
                  </div>
                </div>
              </div>
            ) : null}
          </Drawer.Body>
          <Drawer.Footer>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={closeIncidentDrawer}>
                Close
              </Button>
              {selectedIncident ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => handleDenyIncident(selectedIncident.id)}
                    disabled={denyIncidentMutation.isPending}
                  >
                    Deny & restore in Google
                  </Button>
                  <Button
                    onClick={() => handleApproveIncident(selectedIncident.id)}
                    disabled={approveIncidentMutation.isPending}
                  >
                    Approve cancellation
                  </Button>
                </>
              ) : null}
            </div>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </div>
  )
}

export default ChefEventCalendar
