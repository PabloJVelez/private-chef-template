"use client"

import { useEffect, useState } from "react"
import { XMark } from "@medusajs/icons"
import {
  Button,
  Checkbox,
  DropdownMenu,
  Popover,
  type UseDataTableReturn,
} from "@medusajs/ui"

import type { ChefCalendarFilterRow } from "./chef-event-calendar-filter-table"

/** Default value for a freshly-added filter (multiselect/select start as `[]`). */
function defaultFilterValueForType(type: string): unknown {
  if (type === "select" || type === "multiselect") {
    return []
  }
  if (type === "string") {
    return ""
  }
  return null
}

interface ChefEventCalendarFilterBarProps {
  instance: UseDataTableReturn<ChefCalendarFilterRow>
  onClearAll: () => void
}

/**
 * Medusa Orders–style filter bar for the chef events calendar. Renders the
 * subtle gray strip with active filter chips, a text "Add filter" dropdown,
 * and a "Clear all" affordance. Reads/writes filter state directly on the
 * `useDataTable` instance (no `DataTableContextProvider` deep import, which
 * isn't part of the public package exports in this version of `@medusajs/ui`).
 */
export function ChefEventCalendarFilterBar({
  instance,
  onClearAll,
}: ChefEventCalendarFilterBarProps) {
  const filtering = instance.getFiltering()
  const enabledIds = Object.keys(filtering)
  const allFilters = instance.getFilters()
  const available = allFilters.filter((f) => !enabledIds.includes(f.id))
  const hasActiveFilters = enabledIds.length > 0

  return (
    <div className="bg-ui-bg-subtle flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-2 px-4 py-2 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {enabledIds.map((id) => {
          const meta = instance.getFilterMeta(id)
          if (!meta) {
            return null
          }
          return (
            <ChefEventCalendarFilterChip
              key={id}
              id={id}
              meta={meta}
              value={filtering[id]}
              onUpdate={(value) => instance.updateFilter({ id, value })}
              onRemove={() => instance.removeFilter(id)}
            />
          )
        })}
        {available.length > 0 ? (
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button type="button" variant="secondary" size="small">
                Add filter
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start">
              {available.map((filter) => (
                <DropdownMenu.Item
                  key={filter.id}
                  onSelect={(event) => {
                    event.preventDefault()
                    instance.addFilter({
                      id: filter.id,
                      value: defaultFilterValueForType(filter.type),
                    })
                  }}
                >
                  {filter.label ?? filter.id}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu>
        ) : null}
      </div>
      {hasActiveFilters ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="transparent"
            size="small"
            onClick={onClearAll}
          >
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  )
}

interface ChefEventCalendarFilterChipProps {
  id: string
  meta: ReturnType<UseDataTableReturn<ChefCalendarFilterRow>["getFilterMeta"]>
  value: unknown
  onUpdate: (value: unknown) => void
  onRemove: () => void
}

/**
 * Medusa-style filter pill: `Label · is · value(s) · ✕`. Currently only the
 * `multiselect` filter type is in use on the chef events calendar; other types
 * fall back to a non-interactive label so the chip still renders.
 */
function ChefEventCalendarFilterChip({
  id,
  meta,
  value,
  onUpdate,
  onRemove,
}: ChefEventCalendarFilterChipProps) {
  if (!meta) {
    return null
  }

  const label = meta.label ?? id
  const isMultiselect = meta.type === "multiselect"
  const options = isMultiselect && Array.isArray(meta.options) ? meta.options : []
  const selectedValues =
    isMultiselect && Array.isArray(value)
      ? (value as unknown[]).filter((v): v is string => typeof v === "string")
      : []
  const hasValue = selectedValues.length > 0
  const displayValue = hasValue
    ? selectedValues
        .map(
          (v) =>
            options.find((o) => typeof o.value === "string" && o.value === v)?.label ?? v,
        )
        .join(", ")
    : null

  // Auto-open the popover when the chip is added with no value yet (mirrors
  // Medusa's `DataTableFilter` behavior for newly-added filters).
  const [open, setOpen] = useState(() => isMultiselect && !hasValue)

  // Keep the popover open if state externally returns to "no value" (e.g. the
  // chef cleared selections without choosing anything else).
  useEffect(() => {
    if (isMultiselect && !hasValue) {
      setOpen(true)
    }
  }, [hasValue, isMultiselect])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next && !hasValue) {
      // Closed without a meaningful selection – remove the chip entirely.
      onRemove()
    }
  }

  const toggleValue = (raw: unknown) => {
    if (typeof raw !== "string") {
      return
    }
    if (selectedValues.includes(raw)) {
      onUpdate(selectedValues.filter((v) => v !== raw))
    } else {
      onUpdate([...selectedValues, raw])
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <div className="bg-ui-bg-field shadow-borders-base txt-compact-small-plus flex shrink-0 items-stretch overflow-hidden rounded-md">
        <div
          className={[
            "flex items-center px-2 py-1 text-ui-fg-muted",
            hasValue ? "border-r" : "",
          ].join(" ")}
        >
          {label}
        </div>
        {hasValue ? (
          <>
            <div className="flex items-center border-r px-2 py-1 text-ui-fg-muted">
              is
            </div>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="hover:bg-ui-bg-base-hover active:bg-ui-bg-base-pressed transition-fg flex flex-1 items-center border-r px-2 py-1 text-ui-fg-subtle outline-none"
              >
                {displayValue}
              </button>
            </Popover.Trigger>
            <button
              type="button"
              className="hover:bg-ui-bg-base-hover active:bg-ui-bg-base-pressed transition-fg flex size-7 items-center justify-center text-ui-fg-muted outline-none"
              onClick={onRemove}
              aria-label={`Remove ${label} filter`}
            >
              <XMark />
            </button>
          </>
        ) : (
          <Popover.Anchor />
        )}
      </div>
      {isMultiselect ? (
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="bg-ui-bg-component p-0 outline-none"
        >
          <div className="flex w-[220px] flex-col p-1">
            {options.map((option) => {
              const optValue = option.value
              const optKey =
                typeof optValue === "string" ? optValue : JSON.stringify(optValue)
              const isSelected =
                typeof optValue === "string" && selectedValues.includes(optValue)
              return (
                <label
                  key={optKey}
                  className="hover:bg-ui-bg-base-hover txt-compact-small flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleValue(optValue)}
                  />
                  <span className="text-ui-fg-base">{option.label}</span>
                </label>
              )
            })}
          </div>
        </Popover.Content>
      ) : null}
    </Popover>
  )
}
