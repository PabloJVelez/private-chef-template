# Research — React Email preview server (private-chef-template)

## Classification & assumptions

- **Classification:** Implementation design — enable local React Email preview for Medusa Resend templates, aligned with a completed sibling task (**sdoa**, `2026-02-15_react-email-preview-server`).
- **Inferred problem statement:** Developers cannot reliably use the React Email dev preview for templates under `apps/medusa/src/modules/resend/emails/` because the preview server only surfaces files that include `export default`; this repo’s templates are integrated with Resend via **named** exports only. The goal is to add the missing preview conventions (and optional script ergonomics) without breaking `ResendNotificationProviderService` imports.
- **Assumptions:** `[INFERRED]` Sibling clarification/plan (port `3001`, `dev:all` + `concurrently`) remains the preferred default unless product owner opts out. `[INFERRED]` No new email templates are in scope for this research pass.

## Research plan (what was validated)

1. Whether `apps/medusa` already defines `dev:email`, `react-email`, and `@react-email/preview-server`, and whether a fixed preview port or `dev:all` exists.
2. Exact template inventory and export pattern vs. React Email CLI discovery rules.
3. How `service.ts` resolves templates and which named exports must remain stable.
4. Parity with sibling task scope (five templates, single flat directory).
5. Official React Email CLI documentation for `--dir`, `--port`, `PreviewProps`, and `export default` heuristics.

## Sources (links and versions)

| Reference | Type | Freshness | Notes |
| --- | --- | --- | --- |
| [React Email CLI — `email dev`](https://react.email/docs/cli) | External (official) | Fetched 2026-03-23 | `--dir`, `--port` (default 3000), `PreviewProps`, sidebar heuristics (`export default` regex). |
| `apps/medusa/package.json` | Internal | 2026-03-23 | Scripts and devDependencies. |
| `apps/medusa/src/modules/resend/service.ts` | Internal | 2026-03-23 | `Templates` enum, named imports, `templates` map. |
| `apps/medusa/src/modules/resend/emails/*.tsx` | Internal | 2026-03-23 | Five templates; one named export each; no `export default`. |
| Sibling task hub (read-only): `/Users/pablo/Personal/development/sdoa/sdoa/.devagent/workspace/tasks/completed/2026-02-15_react-email-preview-server/` | External workspace | 2026-02-15 artifacts | Prior research, clarification, and implementation plan for the same feature set. |

## Findings & tradeoffs

1. **Scripts and dependencies:** `dev:email` is already `"email dev --dir ./src/modules/resend/emails"` with no `--port`. `react-email` `^4.2.4` and `@react-email/preview-server` `4.2.4` are present in `apps/medusa` devDependencies. There is **no** `dev:all` script and **no** `concurrently` in `apps/medusa/package.json` (unlike the sibling plan). `concurrently` exists elsewhere in the monorepo (`apps/storefront`) but does not help Medusa email preview until added to `apps/medusa` if desired.

2. **Template inventory:** Exactly **five** `.tsx` files match the sibling plan: `chef-event-accepted.tsx`, `chef-event-rejected.tsx`, `chef-event-requested.tsx`, `event-details-resend.tsx`, `order-placed.tsx`. Flat directory under `resend/emails/`; no subfolder refactor required for preview.

3. **Export pattern:** Each file exports a single **named** function (`orderPlacedEmail`, `chefEventRequestedEmail`, etc.). Grep confirms **no** `export default` and **no** `PreviewProps` in any template today — consistent with why the preview sidebar would stay empty.

4. **Resend integration:** `service.ts` imports the five named functions and maps them by `Templates` enum keys. Adding a **default export** of the underlying React component (plus optional `Component.PreviewProps`) in the **same file** does not require changing import paths or the `templates` map, matching the sibling research conclusion.

5. **Official preview behavior:** React Email documents that sidebar inclusion requires (a) extension `.js`/`.jsx`/`.tsx` and (b) an `export default` match. Sample preview data is supplied via `PreviewProps` on the default-exported component. Static assets for preview live under `<emails-dir>/static` and are served at `/static/...`.

6. **`order-placed` typing:** The template uses Medusa types (`OrderDTO`, `CustomerDTO`, `BigNumberValue`) for real sends; preview can use a **minimal mock object** that satisfies how the JSX reads fields (sibling plan already called this out).

### Tradeoffs

| Approach | Pros | Cons |
| --- | --- | --- |
| Default export + `PreviewProps` only (no script changes) | Smallest diff; preview works | Port may still default to 3000; no one-command “Medusa + preview” |
| Add `--port 3001` (or `-p 3001` per CLI) to `dev:email` | Avoids clash with other apps on 3000 | Must document chosen port for the team |
| Add `dev:all` + `concurrently` in `apps/medusa` | Matches sibling DX | Extra devDependency and script maintenance |

## Recommendation

1. Treat this repo as **structurally aligned** with the sibling task (same directory, same five templates). The **gap** is entirely **export conventions** for the preview server plus **optional** script polish.
2. For implementation planning, mirror the sibling approach: per file, keep existing named exports; add `export default` pointing at the main component, `Component.PreviewProps` with realistic sample data, and export the props type where it helps TypeScript (pattern already documented in sibling plan).
3. Include **`--port 3001`** on `dev:email` if local port conflicts are likely; add **`dev:all`** and **`concurrently`** in `apps/medusa` only if the team wants one command for backend + preview (confirm with owner — listed as open in task hub).
4. Do **not** change `service.ts` imports unless a template file is renamed (out of scope).

## Repo next steps (checklist)

- [ ] Confirm with owner: fixed port `3001` and whether `dev:all` + `concurrently` are required for this monorepo or optional.
- [ ] Run **`devagent create-plan`** using this packet + sibling plan as inputs; scope tasks to `apps/medusa/package.json` and the five email modules.
- [ ] After implementation: run `yarn dev:email` from `apps/medusa`, verify all five entries in the sidebar and render; smoke-test one Resend notification path.

## Risks & open questions

| Item | Type | Mitigation / next step |
| --- | --- | --- |
| Port 3000 vs other local apps | Risk | Set explicit `--port` in `dev:email` or document override. |
| `PreviewProps` shape drift vs real notification payloads | Risk | Base mock data on actual `notification.data` shapes used in subscribers/workflows; adjust during plan/implementation. |
| Owner preference on `dev:all` | Question | Resolved in clarify-task or inline decision in plan. |
