# Research: Medusa Admin Overrides with `@unlockable/vite-plugin-unlock`

## Classification & Assumptions
- **Type**: Implementation design research for admin UI customization.
- **Inferred Problem Statement**: We need a maintainable way to customize specific Medusa admin (`@medusajs/dashboard`) pages — notably the sign-in page and the Orders list table — without forking the dashboard, by integrating `@unlockable/vite-plugin-unlock` and implementing minimal overrides.
- **Assumptions**:
  - [INFERRED] The Medusa backend in this repo runs the standard `@medusajs/dashboard` admin app built with Vite and supports `medusa-config.ts`-level Vite configuration.
  - [INFERRED] We want to keep pulling upstream Medusa admin updates while layering custom UI changes for the Private Chef product.
  - [INFERRED] The immediate customizations are: (1) change the sign-in page heading text to "Welcome to Private Chef's Admin"; (2) rename the Orders list table "Fulfillment" column header to "Fulfillment for Event" without altering underlying data/behavior.

## Research Plan
- Confirm how `@unlockable/vite-plugin-unlock` integrates with Medusa via `medusa-config.ts` and where it looks for overrides.
- Identify which `@medusajs/dashboard` source files (pages/hooks) correspond to:
  - The admin **sign-in page**.
  - The **Orders list table columns** and, specifically, the Fulfillment column label.
- Determine what kind of override we should create for each (page vs component vs hook), including required exports.
- Clarify matching rules (basename vs path) and how to organize overrides under `src/admin/overrides`.
- Document recommended override filenames and minimal coding approach to achieve the requested copy changes while preserving behavior and HMR.

## Sources
- **Plugin docs** — `@unlockable/vite-plugin-unlock` README (GitHub) — explains Medusa preset, override directory, page/component/hook override patterns, alias support, and matching rules. ([unlockablejs/vite-plugin-unlock](https://github.com/unlockablejs/vite-plugin-unlock))
- **Medusa admin package** — `@medusajs/dashboard` source under `node_modules/@medusajs/dashboard/src/**` (local exploration recommended during implementation) to locate the actual filenames for the sign-in page and the Orders list table columns hook/component.
- **This repo** — `medusa-config.ts` (not yet inspected) to confirm current admin config and ensure adding `admin.vite` plugin wiring aligns with project patterns.

## Findings & Tradeoffs

### 1. Integrating `vite-plugin-unlock` with Medusa
- The plugin provides a Medusa preset that wires everything through `medusa-config.ts`:
  - Import `unlock` from `"@unlockable/vite-plugin-unlock"` and `medusa` from `"@unlockable/vite-plugin-unlock/medusa"`.
  - Configure the Medusa admin section with `vite: () => ({ plugins: [unlock(medusa())] })`.
- By default, the Medusa preset:
  - Uses `./src/admin/overrides` (relative to the Medusa app root) as the overrides directory.
  - Scans `@medusajs/dashboard/src/**` for source files and matches overrides by **basename** (filename only), so our override file just needs the same filename as the target page/component/hook.
  - Handles admin-specific wiring: redirects the dashboard entry from the built `dist` bundle to the source entry, optimizes CSS loading, and injects HMR boundaries for routes/widgets. This keeps dev experience smooth and lets us focus only on custom files.
- Tradeoffs:
  - **Pros**: No fork of `@medusajs/dashboard`; small, targeted overrides; still on the upgrade path; HMR works for overrides.
  - **Cons**: We depend on the plugin’s matching behavior and on `@medusajs/dashboard` not renaming the underlying source files. Upstream changes to filenames may silently break overrides until noticed.

### 2. Overriding the sign-in page
- The README’s **Override a Page** section shows the pattern for page overrides in Medusa:
  - Place a file in `src/admin/overrides` whose **basename** matches the original page file (for example, `order-list.tsx` for the Orders list page).
  - Page overrides must export `{ Component }` for React Router lazy loading.
- For the **sign-in page**, the concrete filename in `@medusajs/dashboard` is not specified in the README but, based on Medusa admin conventions, it is usually something like `sign-in.tsx`, `login.tsx`, or similar under an `authentication`/`auth` directory.
  - During implementation, we should inspect `node_modules/@medusajs/dashboard/src/` and search for the page that renders the "Welcome to Medusa" text (likely `sign-in.tsx` or `signin.tsx`).
  - Once identified, we create an override file whose basename matches that file, for example `sign-in.tsx` in `src/admin/overrides/pages/`.
- The override page can either:
  - Rebuild the page entirely, using Medusa UI components and hooks; or
  - Wrap/reuse the original logic via the `~dashboard` alias if we want to keep most behavior.
- For this task, a pragmatic approach is to **copy the original sign-in page source** into the override file and change only the main heading text from "Welcome to Medusa" (or similar) to **"Welcome to Private Chef's Admin"**, leaving the form behavior and layout intact.

### 3. Overriding the Orders list Fulfillment column label
- The README indicates two possible override styles for list pages:
  - Override the entire **page** (for example, `order-list.tsx`) by exporting `{ Component }`.
  - Override a **hook** such as `use-order-table-columns.tsx` to customize columns while preserving the surrounding page implementation.
- For a minimal change (renaming the Fulfillment header to **"Fulfillment for Event"**), overriding the **columns hook** is likely the least invasive:
  - Locate `use-order-table-columns.tsx` in `@medusajs/dashboard/src/**`.
  - Create `src/admin/overrides/hooks/use-order-table-columns.tsx` (path is flexible; only basename matters).
  - In the override, import the original hook implementation using the `~dashboard` alias and then adjust the label for the Fulfillment column.
    - Example approach (conceptual): call the original hook to get `columns`, map over them, and when `column.id` or `column.header` matches "fulfillment", return a modified column object with `header: "Fulfillment for Event"`.
- Alternatively, we could override the entire `order-list.tsx` page, but that couples us more tightly to upstream implementation details (filters, pagination, layout). Using the **hook override** keeps the surface area small.

### 4. Matching, organization, and aliases
- Override files are discovered **recursively** in the overrides directory, so we can organize them as:
  - `src/admin/overrides/pages/sign-in.tsx`
  - `src/admin/overrides/hooks/use-order-table-columns.tsx`
- But structurally, only the filename matters for matching.
- Inside overrides, we can import from the original dashboard source via the alias generated by the plugin:
  - `~dashboard` → `@medusajs/dashboard` source tree.
  - This allows patterns such as:
    - Importing the original columns hook and modifying its output.
    - Importing shared components, icons, or utils.

## Recommendation
- **Integration**:
  - Update `apps/medusa/medusa-config.ts` (or equivalent) to add `@unlockable/vite-plugin-unlock` with the Medusa preset under `admin.vite`, using the default overrides path `./src/admin/overrides` and enabling `debug: true` initially to confirm which files are being overridden.
- **Sign-in page override**:
  - Identify the dashboard sign-in source file in `node_modules/@medusajs/dashboard/src/**` and note its basename.
  - Create an override file with that basename in `src/admin/overrides/pages/`, copy the original implementation, and change ONLY the heading text to **"Welcome to Private Chef's Admin"**.
  - Keep all form behavior, validation, and routing exactly as in the original to minimize drift.
- **Orders Fulfillment column override**:
  - Identify the `use-order-table-columns.tsx` (or equivalent) hook used by the Orders list page.
  - Implement an override hook file with the same basename that:
    - Imports the original hook from `~dashboard/.../use-order-table-columns`.
    - Calls it, then maps the returned columns to rename the Fulfillment column header to **"Fulfillment for Event"**.
  - Export the modified hook using the same API as the original.
- **Upgrade-resilience**:
  - Keep overrides as thin wrappers where possible (especially for the Orders columns hook) so that future Medusa/dashboard updates require only minimal adjustments.

## Repo Next Steps (Checklist)
- [ ] Inspect `apps/medusa/medusa-config.ts` to confirm admin config and wire `@unlockable/vite-plugin-unlock` with the Medusa preset and `./src/admin/overrides`.
- [ ] Explore `node_modules/@medusajs/dashboard/src/**` to locate the sign-in page file and the Orders columns hook or relevant components.
- [ ] Add `src/admin/overrides/pages/<sign-in-filename>.tsx` that replicates the original sign-in page but updates the main heading to "Welcome to Private Chef's Admin".
- [ ] Add `src/admin/overrides/hooks/use-order-table-columns.tsx` (or equivalent) that wraps and tweaks the original hook, renaming the Fulfillment header to "Fulfillment for Event".
- [ ] Run the Medusa admin locally with `debug: true` for the plugin to verify which files are being overridden and confirm the new copy appears as expected.
- [ ] Document any discovered exact filenames and import paths in the task hub (AGENTS.md or a follow-up note) for future reference.

## Risks & Open Questions
- **Filename stability**: If `@medusajs/dashboard` renames the sign-in page or Orders columns hook in future releases, our overrides will silently stop matching. Mitigation: enable plugin debug logs and include a quick regression check after dashboard upgrades.
- **Hook API changes**: If Medusa changes the shape of the columns hook return value, the override logic that maps columns may need updates.
- **Open Question**: Should we take this opportunity to introduce any additional Orders table customizations (e.g., event-specific columns) or keep this change strictly to renaming the Fulfillment header for now?
