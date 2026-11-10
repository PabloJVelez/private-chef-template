"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { WorkspaceCalendar } from "./workspace-calendar"
import "../../../styles/workspace-calendar.css"

import { useNavigate, useSearchParams, type SetURLSearchParams } from "react-router-dom"
import { DateTime } from "luxon"
import { Button, Drawer, Text, Tooltip, toast, useDataTable } from "@medusajs/ui"

import { useAdminRetrieveChefEvent } from "../../../hooks/chef-events"
import {
  useGoogleCalendarApproveIncidentMutation,
  useGoogleCalendarDenyIncidentMutation,
  useGoogleCalendarResyncMutation,
  useGoogleCalendarStatus,
} from "../../../hooks/google-calendar"
import {
  CALENDAR_STATUSES_URL_PARAM,
  type ChefEventCalendarStatus,
  calendarStatusSetsEqual,
  DEFAULT_CALENDAR_STATUSES,
  parseCalendarStatusesUrlParam,
  serializeCalendarStatusesUrlParam,
  sortCalendarStatuses,
} from "../../../../lib/chef-event-calendar-status-params"
import { ChefEventCalendarFilterBar } from "./chef-event-calendar-filter-bar"
import {
  CHEF_CALENDAR_FILTER_TABLE_DATA,
  chefCalendarFilterColumns,
  chefCalendarFilterDefinitions,
  getChefCalendarFilterRowId,
} from "./chef-event-calendar-filter-table"
import { requestedStartInEventZone } from "../../../../lib/chef-event-datetime-display"

import { useAdminWorkspaceCalendar } from '../../../hooks/chef-workspace'
import { calendarRangeKey, type CalendarView, type VisibleCalendarRange } from '../../../lib/workspace-calendar-range'

const MOBILE_MEDIA_QUERY = "(max-width: 767px)"
const CALENDAR_DATE_PARAM = "date"
const CALENDAR_VIEW_PARAM = "view"
const CALENDAR_INCIDENT_PARAM = "incident"

const isSupportedView = (value: string | null): value is CalendarView => {
  return value === "month" || value === "agenda" || value === "day"
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

function getInitialCalendarView(): CalendarView {
  if (typeof window === "undefined") {
    return "month"
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches ? "agenda" : "month"
}

function isChefEventCalendarStatus(v: unknown): v is ChefEventCalendarStatus {
  return (
    v === "pending" ||
    v === "confirmed" ||
    v === "cancelled" ||
    v === "completed"
  )
}

/**
 * Collapse default status selection so the Status chip hides (Medusa orders pattern).
 * Preserves `{ _rid: [] }` while the chef is configuring a newly added filter.
 */
function normalizeCalendarFilteringState(next: Record<string, unknown>): Record<string, unknown> {
  if (!("_rid" in next)) {
    return {}
  }
  const rid = next._rid
  if (!Array.isArray(rid)) {
    return {}
  }
  if (rid.length === 0) {
    return { _rid: [] }
  }
  const sorted = sortCalendarStatuses(rid.filter(isChefEventCalendarStatus))
  if (sorted.length === 0) {
    return { _rid: [] }
  }
  if (calendarStatusSetsEqual(sorted, DEFAULT_CALENDAR_STATUSES)) {
    return {}
  }
  return { _rid: sorted }
}

function syncStatusesUrlFromFiltering(
  normalized: Record<string, unknown>,
  setSearchParams: SetURLSearchParams
) {
  if (!("_rid" in normalized)) {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev)
      n.delete(CALENDAR_STATUSES_URL_PARAM)
      return n
    })
    return
  }
  const rid = normalized._rid
  if (!Array.isArray(rid) || rid.length === 0) {
    return
  }
  const sorted = sortCalendarStatuses(rid.filter(isChefEventCalendarStatus))
  setSearchParams((prev) => {
    const n = new URLSearchParams(prev)
    const serialized = serializeCalendarStatusesUrlParam(sorted)
    if (serialized === null) {
      n.delete(CALENDAR_STATUSES_URL_PARAM)
    } else {
      n.set(CALENDAR_STATUSES_URL_PARAM, serialized)
    }
    return n
  })
}

export const ChefEventCalendar = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: googleCalendarStatus } = useGoogleCalendarStatus()
  const resyncMutation = useGoogleCalendarResyncMutation()
  const approveIncidentMutation = useGoogleCalendarApproveIncidentMutation()
  const denyIncidentMutation = useGoogleCalendarDenyIncidentMutation()

  const queryView = searchParams.get(CALENDAR_VIEW_PARAM)
  const view: CalendarView = isSupportedView(queryView) ? queryView : getInitialCalendarView()
  const date = parseQueryDate(searchParams.get(CALENDAR_DATE_PARAM)) ?? new Date()

  const updateCalendarParams = useCallback(
    (nextDate: Date, nextView: CalendarView) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set(CALENDAR_DATE_PARAM, DateTime.fromJSDate(nextDate).toISODate() ?? "")
        next.set(CALENDAR_VIEW_PARAM, nextView)
        return next
      })
    },
    [setSearchParams]
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

  const statusesQuery = searchParams.get(CALENDAR_STATUSES_URL_PARAM) ?? ""
  const [filtering, setFiltering] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (!statusesQuery.trim()) {
      setFiltering((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      return
    }
    const parsed = parseCalendarStatusesUrlParam(statusesQuery)
    setFiltering((prev) => {
      const prevRid = prev._rid
      if (Array.isArray(prevRid) && JSON.stringify(prevRid) === JSON.stringify(parsed)) {
        return prev
      }
      return { _rid: parsed }
    })
  }, [statusesQuery])

  const handleFilteringChange = useCallback(
    (next: Record<string, unknown>) => {
      const normalized = normalizeCalendarFilteringState(next)
      setFiltering(normalized)
      syncStatusesUrlFromFiltering(normalized, setSearchParams)
    },
    [setSearchParams]
  )

  const filterTable = useDataTable({
    columns: chefCalendarFilterColumns,
    data: CHEF_CALENDAR_FILTER_TABLE_DATA,
    getRowId: getChefCalendarFilterRowId,
    rowCount: 1,
    filters: chefCalendarFilterDefinitions,
    filtering: {
      state: filtering,
      onFilteringChange: handleFilteringChange,
    },
    pagination: {
      state: { pageIndex: 0, pageSize: 10 },
      onPaginationChange: () => {},
    },
  })

  const handleClearCalendarFilters = useCallback(() => {
    filterTable.clearFilters()
  }, [filterTable])

  const effectiveStatuses = useMemo(
    () => parseCalendarStatusesUrlParam(statusesQuery),
    [statusesQuery]
  )

  const [visibleRange, setVisibleRange] = useState<VisibleCalendarRange | null>(null)
  const rangeReady = visibleRange?.key === calendarRangeKey(date, view)
  const { data, isLoading, isError, error, refetch } = useAdminWorkspaceCalendar({
    statuses: effectiveStatuses,
    start: visibleRange?.start ?? "",
    end: visibleRange?.end ?? "",
  }, { enabled: rangeReady })
  const loading = !rangeReady || isLoading
  const failed = rangeReady && isError
  const events = !rangeReady || isError ? [] : data?.entries ?? []
  const handleRange = useCallback((next: VisibleCalendarRange) => {
    setVisibleRange((previous) => previous?.key === next.key && previous.start === next.start && previous.end === next.end ? previous : next)
  }, [])

  const selectedIncidentId = searchParams.get(CALENDAR_INCIDENT_PARAM)
  const selectedIncident = useMemo(() => {
    const incidents = googleCalendarStatus?.pendingIncidents ?? []
    if (!selectedIncidentId) {
      return null
    }
    return incidents.find((incident) => incident.id === selectedIncidentId) ?? null
  }, [googleCalendarStatus?.pendingIncidents, selectedIncidentId])

  // Incidents may belong to a different range or a hidden status. Fetch only the selected detail.
  const { data: selectedChefEvent } = useAdminRetrieveChefEvent(selectedIncident?.chefEventId ?? '', {
    enabled: Boolean(selectedIncident),
  })

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
    <div className="flex w-full min-w-0 flex-col divide-y">
      <div className="flex flex-col gap-2 px-4 py-3 text-xs text-ui-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
      <div className="flex flex-wrap items-center gap-2 text-xs text-ui-fg-subtle">
        <span>Times shown in {DateTime.local().zoneName}</span>
        <Tooltip content="Pending requests show requested time, not confirmed appointments. Open an event for details. Protected time is available in event tooltips. An empty calendar does not mean the chef is available.">
          <button type="button" className="underline underline-offset-2">About this calendar</button>
        </Tooltip>
      </div>
        {googleCalendarStatus?.status === "active" ? (
          <Button
            size="small"
            variant="secondary"
            onClick={handleResync}
            isLoading={resyncMutation.isPending}
            disabled={resyncMutation.isPending}
            className="self-start sm:self-auto"
          >
            Resync
          </Button>
        ) : null}
      </div>

      {pendingCount > 0 ? (
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
            className="self-start sm:self-auto"
          >
            Review
          </Button>
        </div>
      ) : null}

      {failed && (
        <div role="alert" className="px-4 py-3 sm:px-6">
          <Text>Calendar unavailable. {error instanceof Error ? error.message : 'Could not load the complete range.'}</Text>
          <Button size="small" variant="secondary" onClick={() => refetch()}>Retry</Button>
        </div>
      )}
      <ChefEventCalendarFilterBar instance={filterTable} onClearAll={handleClearCalendarFilters} />
      <WorkspaceCalendar
        date={date}
        view={view}
        entries={events}
        loading={loading}
        failed={failed}
        onNavigate={updateCalendarParams}
        onRange={handleRange}
        onSelectEvent={(entry) => navigate(entry.detailPath)}
      />

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
