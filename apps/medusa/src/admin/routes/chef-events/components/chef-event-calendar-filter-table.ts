import { createDataTableColumnHelper, createDataTableFilterHelper } from "@medusajs/ui"

import { statusOptions } from "../schemas"

/** Dummy row for Medusa UI `useDataTable` (filters only; no visible table). */
export type ChefCalendarFilterRow = { _rid: string }

export const CHEF_CALENDAR_FILTER_TABLE_DATA: ChefCalendarFilterRow[] = [{ _rid: "chef-calendar" }]

export const getChefCalendarFilterRowId = (row: ChefCalendarFilterRow) => row._rid

const columnHelper = createDataTableColumnHelper<ChefCalendarFilterRow>()

export const chefCalendarFilterColumns = [
  columnHelper.display({
    id: "__placeholder",
    header: "",
    cell: () => null,
    size: 0,
    maxSize: 0,
  }),
]

const filterHelper = createDataTableFilterHelper<ChefCalendarFilterRow>()

export const chefCalendarFilterDefinitions = [
  filterHelper.accessor("_rid", {
    type: "multiselect",
    label: "Status",
    options: statusOptions.map((o) => ({ label: o.label, value: o.value })),
    searchable: true,
  }),
]
