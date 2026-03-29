# Override Medusa Admin with Vite Plugin Unlock

- Owner: PabloJVelez
- Last Updated: 2026-03-29
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-03-29_override-medusa-admin-overrides/`

## Summary
This task integrates the `@unlockable/vite-plugin-unlock` Vite plugin into the Medusa backend so we can override specific `@medusajs/dashboard` admin pages without forking, starting with updating the sign-in page copy to say "Welcome to Private Chef's Admin" and renaming the Orders table Fulfillment column to "Fulfillment for Event". The goal is to keep using the upstream Medusa admin while customizing key UI surfaces for the Private Chef product.

## Key Decisions
- [2026-03-29] Decision: Track Medusa admin override work via DevAgent task hub and use `@unlockable/vite-plugin-unlock`'s Medusa preset with a local overrides directory (for example, `./src/admin/overrides`) as the primary mechanism for admin customizations.

## Progress Log
- [2026-03-29] Event: Created task hub and AGENTS.md for Medusa admin overrides (sign-in page and orders table Fulfillment column).
- [2026-03-29] Event: Added implementation plan for vite-plugin-unlock wiring, `login.tsx` / `order-list-table.tsx` overrides, and chef-hat asset — see `plan/2026-03-29_medusa-admin-vite-unlock-overrides.md`.

## Implementation Checklist
- [ ] Wire up `@unlockable/vite-plugin-unlock` in `medusa-config.ts` using the Medusa preset and choose an overrides directory (for example, `./src/admin/overrides`).
- [ ] Identify the exact `@medusajs/dashboard` source files for the admin sign-in page and orders table, then design minimal overrides that preserve existing behavior.
- [ ] Implement a sign-in page override that changes the main heading text to "Welcome to Private Chef's Admin" while keeping the existing authentication flow intact.
- [ ] Implement an orders table override (or column hook override) so the Fulfillment column label reads "Fulfillment for Event" across the orders list UI.
- [ ] Add tests or a manual QA checklist to verify the overrides survive Medusa/dashboard upgrades and do not break HMR or navigation.

## Open Questions
- Are there additional admin pages (beyond sign-in and orders list) that should be customized as part of this effort?
- Do we need different copy or behavior for staging vs production environments for these overrides?

## References
- [2026-03-29] Plugin Docs: `https://github.com/unlockablejs/vite-plugin-unlock` — primary reference for using `@unlockable/vite-plugin-unlock` with Medusa admin overrides.
- [2026-03-29] Plan: `.devagent/workspace/tasks/active/2026-03-29_override-medusa-admin-overrides/plan/2026-03-29_medusa-admin-vite-unlock-overrides.md`
- [2026-03-29] Clarification: `clarification/2026-03-29_initial-clarification.md`
