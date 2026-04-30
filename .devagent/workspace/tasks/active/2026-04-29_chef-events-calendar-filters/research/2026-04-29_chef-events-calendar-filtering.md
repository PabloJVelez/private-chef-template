# Chef Events calendar filtering — research packet

- **Classification:** Implementation design (admin UX + API query shape)
- **Last updated:** 2026-04-29
- **Storage path:** `.devagent/workspace/tasks/active/2026-04-29_chef-events-calendar-filters/research/2026-04-29_chef-events-calendar-filtering.md`
- **Related task hub:** `.devagent/workspace/tasks/active/2026-04-29_chef-events-calendar-filters/AGENTS.md`

## Inferred problem statement

[INFERRED] The user did not paste a fresh problem statement in `/research`; this packet addresses the active task: **reduce noise on the Chef Events admin calendar** by letting chefs **include/exclude one or more event statuses** (and other useful dimensions), with UX aligned to **Medusa admin patterns** (Orders list as visual reference).

## Assumptions

- [INFERRED] Work targets `apps/medusa` admin routes and the existing `GET /admin/chef-events` API unless research shows a different split.
- [INFERRED] “Medusa patterns” includes both this repo’s **dashboard override** (`~dashboard` `_DataTable` on orders) and **official Medusa Admin UI** `DataTable` + filter helpers from `@medusajs/ui`.

## Research plan (what was validated)

1. Where the calendar loads data and which query params are sent today.
2. Which filters the admin API already supports and how they map to the module service.
3. Chef-event domain fields available for additional filters (status, type, location, experience link, text search).
4. How this repo implements **Orders** list filters (override) vs **Medusa UI** documented patterns.
5. Whether multi-value status is representable with existing `MedusaService` list filters (e.g. `$in`).

## Sources (with links / paths)

| Reference | Type | Freshness |
| --- | --- | --- |
| `apps/medusa/src/admin/routes/chef-events/components/chef-event-calendar.tsx` | Code | 2026-04-29 |
| `apps/medusa/src/api/admin/chef-events/route.ts` | Code | 2026-04-29 |
| `apps/medusa/src/modules/chef-event/models/chef-event.ts` | Code | 2026-04-29 |
| `apps/medusa/src/modules/chef-event/service.ts` | Code | 2026-04-29 |
| `apps/medusa/src/admin/overrides/order-list-table.tsx` | Code | 2026-04-29 |
| `apps/medusa/src/api/store/menus/route.ts` (`status: { $in: ... }`) | Code pattern | 2026-04-29 |
| Medusa Docs — [Data Table (Admin components)](https://docs.medusajs.com/resources/admin-components/components/data-table#example-datatable-with-data-fetching) | External | Medusa official (retrieved 2026-04-29 via project MCP) |
| Medusa UI — [Configure filters in DataTable](https://docs.medusajs.com/ui/components/data-table#configure-filters-in-datatable) | External | Medusa official (retrieved 2026-04-29 via project MCP) |

## Findings and tradeoffs

### 1. Calendar today always requests “wide open” filters

`ChefEventCalendar` calls `useAdminListChefEvents` with empty string sentinels for categorical filters and a **high limit**:

```109:117:apps/medusa/src/admin/routes/chef-events/components/chef-event-calendar.tsx
  // Keep your existing filters; add range later if/when supported
  const { data, isLoading } = useAdminListChefEvents({
    q: "",
    status: "",
    eventType: "",
    locationType: "",
    limit: 1000,
    offset: 0,
  })
```

**Implication:** All statuses are returned; the inline comment explicitly defers range filtering. Any product default (e.g. hide `completed`/`cancelled`) must be implemented by changing these arguments (and/or API defaults), not only UI.

### 2. Admin list route already accepts single-value filters but not multi-status

`GET` handler builds a flat `filters` object:

```30:44:apps/medusa/src/api/admin/chef-events/route.ts
  const { q, status, eventType, locationType } = req.query
  const limit = parseInt(req.query.limit as string) || 20
  const offset = parseInt(req.query.offset as string) || 0
  
  const filters: any = {}
  if (q) filters.q = q
  if (status && status !== 'all') filters.status = status
  if (eventType && eventType !== 'all') filters.eventType = eventType
  if (locationType && locationType !== 'all') filters.locationType = locationType
  
  const [chefEvents, count] = await chefEventModuleService.listAndCountChefEvents(filters, {
```

**Findings:**

- **Status / eventType / locationType** are single-value equality filters. Selecting **multiple statuses** (core requirement) needs either:
  - **API + route change:** parse repeated query keys or a comma-separated list and pass `status: { $in: [...] }` into `listAndCountChefEvents` (same style as store menus listing uses `$in` in `apps/medusa/src/api/store/menus/route.ts`), **or**
  - **Client-only filter** after fetch — simpler but keeps transferring cancelled/completed rows when the chef does not want them; **not recommended** at `limit: 1000` scale and privacy/noise goals.
- **`q`:** The route forwards `filters.q` to `listAndCountChefEvents`. The module service is a plain `MedusaService` with no custom list method in `apps/medusa/src/modules/chef-event/service.ts`. **[NEEDS CLARIFICATION / verify]** whether `q` is interpreted by the generated list API or is effectively a no-op / error at runtime. If no-op, text search for the calendar requires an explicit `$or` / `$ilike` composition on `firstName`, `lastName`, `email`, etc., similar to menus’ `name: { $ilike: ... }` pattern.

### 3. Domain model supports rich secondary filters

From `ChefEvent` model: `status` enum (`pending` | `confirmed` | `cancelled` | `completed`), `eventType`, `experience_type_id`, `locationType`, `depositPaid`, `requestedDate` + `requestedTime`, contact fields, etc. (`apps/medusa/src/modules/chef-event/models/chef-event.ts`).

**Chef-relevant filter candidates (prioritized):**

| Filter | Feasibility | Notes |
| --- | --- | --- |
| **Status (multi)** | High (with `$in` or multiple round-trips) | Core ask; align labels with `statusOptions` in `apps/medusa/src/admin/routes/chef-events/schemas.ts`. |
| **Event type** | High | API already supports `eventType`; catalog may also use `experience_type_id` — **not** exposed on list route yet; add if chefs distinguish experiences by linked type. |
| **Location type** | High | Already on API. |
| **Deposit paid** | Medium | Add query + filter object field if product wants “balance due” triage. |
| **Date range** | Medium / split | **Server:** add `requested_date_gte` / `lte` (or reuse Medusa date operators) so month view does not require shipping 1000 rows. **Client:** filter RBC events only — OK as stopgap but does not reduce payload. |
| **Text search** | Medium | Depends on clarifying `q` behavior (see above). |

### 4. Two “Medusa patterns” exist in this repo — pick deliberately

**A. Orders override (dashboard bundle)**  
`apps/medusa/src/admin/overrides/order-list-table.tsx` uses `~dashboard` hooks (`useOrderTableFilters`, `useOrderTableQuery`) and `_DataTable` with `filters`, `search`, and `queryObject={raw}` so filters sync with URL/search params used by the JS SDK.

**Pros:** Matches the screenshot the chef cited (core Orders UI). **Cons:** Chef Events page is **not** a table; `_DataTable` is a poor structural fit unless the calendar is rebuilt as a secondary view. Reusing **only** query-string conventions without importing the full dashboard table may be enough for visual parity.

**B. Official Medusa Admin UI (`@medusajs/ui`)**  
Documentation shows `createDataTableFilterHelper`, `DataTableFilteringState`, and `useDataTable` feeding `sdk.admin.*.list` with arrays for multi-select status, plus `<DataTable.FilterMenu />` and `<DataTable.Search />` in a toolbar ([Admin Data Table example](https://docs.medusajs.com/resources/admin-components/components/data-table#example-datatable-with-data-fetching)).

**Pros:** Native to Medusa UI v2; multi-select “select” type is documented. **Cons:** Toolbar is designed around a `DataTable` instance; for a **calendar-only** page you may compose a **similar toolbar** (filter menu + search) using the same primitives **or** replicate layout with `Select` / `DropdownMenu` from `@medusajs/ui` for a lighter integration.

**Recommendation:** Prefer **`@medusajs/ui` filter primitives + URL `useSearchParams`** (calendar already uses URL state for `date`, `view`, `incident`) so filters are **shareable and refresh-safe**, consistent with the post–Google Calendar sync UX work. Mirror **Orders** placement (toolbar between header/sync strip and calendar controls) for visual consistency, without importing `~dashboard` unless you intentionally standardize on dashboard `_DataTable` everywhere.

### 5. Performance note

Current `limit: 1000` assumes “all events fit.” Server-side status (and ideally **date window**) filtering reduces payload and keeps the calendar responsive as history grows.

## Recommendation

1. **Extend `GET /admin/chef-events`** to accept **multiple statuses** (documented query shape in SDK types) and map to `listAndCountChefEvents({ status: { $in: selected } , ... })`.
2. **Verify or implement `q`** as real text search on safe string columns; remove dead `q` passthrough if unsupported.
3. **Admin UI:** Add a **toolbar row** on `ChefEventsPage` or inside `ChefEventCalendar` **above** calendar navigation, using Medusa UI styling; wire state to **URL search params** alongside existing `date` / `view` / `incident` keys.
4. **Secondary filters** for v1: **location type**, **event type** (existing API); consider **experience_type_id** and **date range** once API supports them.
5. **Product default:** Decide in `clarify-task` whether the initial filter set excludes `completed` and `cancelled` (common chef default) vs show-all.

## Repo next steps (checklist)

- [ ] Spike: confirm `listAndCountChefEvents` accepts `{ status: { $in: string[] } }` for the chef_event model (Medusa v2 query API).
- [ ] Trace JS SDK / `AdminListChefEventsQuery` for array serialization of `status` (repeat keys vs comma list).
- [ ] Prototype toolbar layout in `chef-event-calendar.tsx` or `chef-events/page.tsx` without changing business logic.
- [ ] If `q` is invalid today, spec `$or`/`$ilike` fields for search in the route (and tests).
- [ ] Run `devagent clarify-task` on default visible statuses and URL param namespacing (prefix vs flat keys).

## Risks and open questions

| Item | Type | Mitigation |
| --- | --- | --- |
| `q` filter behavior undocumented / ineffective | Risk | Integration test or manual HTTP GET against `/admin/chef-events?q=...` |
| Dashboard `_DataTable` vs `@medusajs/ui` `DataTable` divergence | Risk | Pick one pattern per surface; document in plan |
| Default filter hides revenue-relevant “completed” history | Question | Product / clarify-task |
| `experience_type_id` filter needs join or denormalized index | Risk | Scope to `eventType` string first if simpler |
