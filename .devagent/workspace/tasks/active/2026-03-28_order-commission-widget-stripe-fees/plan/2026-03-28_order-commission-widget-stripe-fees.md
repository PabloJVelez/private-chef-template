# Order commission widget — Stripe processing fees line

- Owner: PabloJVelez
- Last Updated: 2026-03-28
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-28_order-commission-widget-stripe-fees/`
- Stakeholders: PabloJVelez (requestor, decision maker)

---

## PART 1: PRODUCT CONTEXT

### Summary

Operators viewing a Medusa **admin order** with Stripe Connect need a **Payout summary** that separates **estimated card processing cost** from **platform commission** when the business **passes Stripe fees through to the chef** (`passStripeFeeToChef`). Today the widget shows only gross, full `application_fee_amount` as “Platform commission,” and take-home—which is correct for Stripe math but misleading when the application fee bundles an estimated processing component. v1 adds a **Stripe processing fees** row (estimate only), keeps **chef take-home** as **gross − application_fee_amount**, and relabels the middle amount so **platform commission** means the **remainder** after the estimate when pass-through is on.

### Context & problem

- **Current state:** `order-commission-widget.tsx` reads `application_fee_amount` and gross from `payment_collections.payments[].data` ([research](../research/2026-03-28_stripe-processing-fee-line-order-widget.md)).
- **Pain:** When gross-up is enabled, the full application fee is not purely “platform commission”; operators cannot see the processing slice.
- **Trigger:** Clarification **1A / 2A / 3A** — estimated fee only, **hide** the row when pass-through is off, neutral label **Stripe processing fees** ([clarification](../clarification/2026-03-28_initial-clarification.md)).

### Objectives & success metrics

- **O1:** With pass-through **on**, payout rows reconcile visually: charged → Stripe processing fees (est.) → platform commission (net) → chef take-home; **take-home** still equals gross − `application_fee_amount`.
- **O2:** With pass-through **off**, UI matches **current** behavior (no Stripe fees row).
- **O3:** Admin needs **no** env vars and **no** live Stripe calls; values come from persisted **`payment.data`**.

### Users & insights

- **Primary user:** Operator / chef using Medusa Admin order detail.
- **Insight:** Historical orders must reflect **config at capture time** → persist flags/amounts on payment `data`, not only current env.

### Solution principles

- Single source of truth for the **estimate formula** (shared util used by provider and auditable in one place).
- Smallest currency unit end-to-end; same patterns as existing widget (`formatFromSmallestUnit`, `parseNumericSmallest`).
- Do not expand scope to **actual** Balance Transaction fees in v1.

### Scope definition

- **In scope:** Provider persistence, optional env wiring from `medusa-config`, per-line fee + gross-up alignment, admin widget UI + `fields` query, `.env.template` hints.
- **Out of scope / future:** Actual Stripe fees from Balance Transactions; storefront; automated E2E unless already standard for admin widgets.

### Functional narrative

#### Flow — Pass-through on

- **Trigger:** Order paid via `pp_stripe-connect_stripe-connect` with `pass_stripe_fee_to_chef` persisted true and `stripe_processing_fee_estimate` present on payment `data`.
- **Experience:** Payout summary shows **Charged to customer**, **Stripe processing fees** (−estimate), **Platform commission** (−(application_fee − estimate)), **Chef take-home** (gross − application_fee).
- **Acceptance:** `estimate + platform_net === application_fee_amount` (within integer cents); take-home unchanged vs pre-change.

#### Flow — Pass-through off or legacy payment

- **Trigger:** Field absent/false or estimate zero with no pass-through flag (treat as off).
- **Experience:** Same as today: charged, platform commission = full application fee, take-home.
- **Acceptance:** No Stripe fees row.

### Technical notes & dependencies

- **New `payment.data` keys (snake_case, align with existing):** `pass_stripe_fee_to_chef` (boolean), `stripe_processing_fee_estimate` (number, smallest unit). Omit or false when pass-through off; legacy orders lack fields → hide row.
- **Config:** `.env` already documents `PASS_STRIPE_FEE_TO_CHEF` / `STRIPE_FEE_*` in some setups but **`medusa-config.ts` does not pass them into provider `options`** — wire so runtime matches env.
- **Per-line fees:** When `feePerUnitBased` + lines apply, **`initiatePayment` does not add** the Stripe gross-up today; add the same `+ estimateStripeFee(amount)` as cart-level `calculateApplicationFee` when `passStripeFeeToChef` is true.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & assumptions

- **Scope:** Medusa app `apps/medusa` — stripe-connect module + admin widget + medusa-config + `.env.template`.
- **Assumptions:** Medusa merges provider `data` such that enrichments on authorize/capture remain visible on stored payments (already relied upon for `application_fee_amount`).
- **Out of scope:** Migrations, Stripe Dashboard changes, actual-fee webhooks.

### Implementation tasks

#### Task 1: Shared estimate helper and types

- **Objective:** One function for **estimated** processing fee: `round(amountSmallest * stripeFeePercent/100) + stripeFeeFlatCents`, matching `StripeConnectProviderService.calculateApplicationFee` ([`service.ts`](apps/medusa/src/modules/stripe-connect/service.ts) lines ~170–184). Export from a small util (e.g. `utils/estimate-stripe-processing-fee.ts`) taking amount + `{ stripeFeePercent, stripeFeeFlatCents }`.
- **Impacted modules/files:** `apps/medusa/src/modules/stripe-connect/utils/estimate-stripe-processing-fee.ts` (new); `apps/medusa/src/modules/stripe-connect/types.ts` — extend `StripeConnectPaymentData` with optional `pass_stripe_fee_to_chef?`, `stripe_processing_fee_estimate?`.
- **References:** Clarification packet; research packet §2–3.
- **Dependencies:** None.
- **Acceptance criteria:** Unit behavior matches existing inline formula for sample amounts (e.g. 10000 cents, 2.9%, 30 → predictable value); TypeScript types compile.
- **Testing criteria:** `yarn workspace medusa build` (or repo-standard Medusa build) passes; optional: tiny unit test colocated or under existing test layout if the repo already tests `utils/`.
- **Validation plan:** Build + spot-check formula against `calculateApplicationFee` delta (base fee vs base+stripe).

#### Task 2: Persist breakdown on payment `data` (stripe-connect provider)

- **Objective:** Whenever provider returns payment `data` (at least **`initiatePayment`**, **`authorizePayment`**, **`capturePayment`**, **`retrievePayment`**, **`updatePayment`** when Connect is on), merge:
  - `pass_stripe_fee_to_chef: true` and `stripe_processing_fee_estimate` when `config_.passStripeFeeToChef` is true (estimate from **charge amount** in smallest units);
  - when false, set `pass_stripe_fee_to_chef: false` and **omit** `stripe_processing_fee_estimate` (or omit both for minimal payload — widget treats missing as off).
- **Implementation detail:** Add a private helper e.g. `connectPayoutDataForAmount(amountSmallest: number)` returning the extra keys, and spread into existing return objects next to `persistDataFromPaymentIntent` results.
- **Per-line gross-up fix:** In `initiatePayment`, when `feePerUnitBased` and lines produced `applicationFeeAmount`, if `passStripeFeeToChef`, add `estimateStripeProcessingFee(amountInCents, config)` to `applicationFeeAmount` before creating/updating the PI (mirror cart path).
- **Impacted modules/files:** `apps/medusa/src/modules/stripe-connect/service.ts` (primary).
- **References:** Research §6–7 (per-line inconsistency).
- **Dependencies:** Task 1.
- **Acceptance criteria:** New Connect captures persist the two fields when env pass-through is true; existing behavior when false; per-line + pass-through produces PI fee consistent with cart-level gross-up intent.
- **Testing criteria:** `yarn medusa build` (or equivalent) passes.
- **Validation plan:** Manual: place test order with pass-through on/off; inspect Admin API order retrieve `payment_collections.payments.data` for new keys.

#### Task 3: Wire env → `medusa-config` provider options

- **Objective:** Pass `passStripeFeeToChef`, `stripeFeePercent`, `stripeFeeFlatCents` from `process.env` into the stripe-connect provider `options` in [`medusa-config.ts`](apps/medusa/medusa-config.ts) (parse booleans/numbers safely; match existing env names in `apps/medusa/.env` if present: `PASS_STRIPE_FEE_TO_CHEF`, `STRIPE_FEE_PERCENT`, `STRIPE_FEE_FLAT_CENTS`). Document in [`apps/medusa/.env.template`](apps/medusa/.env.template) with commented examples.
- **Impacted modules/files:** `apps/medusa/medusa-config.ts`, `apps/medusa/.env.template`.
- **Dependencies:** None (can parallelize with Task 1; before manual E2E of Task 2).
- **Acceptance criteria:** Toggling env changes provider behavior without code edits; template lists variables.
- **Testing criteria:** Config loads without throwing when vars unset (sensible defaults per `types.ts`).
- **Validation plan:** Local smoke: start Medusa with pass-through true, confirm logs / PI creation includes gross-up (existing logging).

#### Task 4: Admin widget — conditional row and net platform commission

- **Objective:** Update [`order-commission-widget.tsx`](apps/medusa/src/admin/widgets/order-commission-widget.tsx):
  - Extend `sdk.admin.order.retrieve` `fields` to include new `data` keys.
  - Parse `pass_stripe_fee_to_chef` and `stripe_processing_fee_estimate` from the same payment row used today.
  - If pass-through **on** and estimate is a finite number **> 0**: show **Stripe processing fees** row (−formatted estimate); **Platform commission** = −`max(0, application_fee_amount - estimate)`; sublabel/percent for platform row should use **net** commission vs gross if you keep a percent line (product: percent of charge = `net / gross`, not `full fee / gross`).
  - If pass-through **off** or missing: **omit** Stripe row; platform commission = full `application_fee_amount` (current).
  - **Chef take-home** remains `gross - application_fee_amount` (unchanged).
- **Impacted modules/files:** `apps/medusa/src/admin/widgets/order-commission-widget.tsx`.
- **Dependencies:** Tasks 2–3 (for real data; can develop against mocked shapes first).
- **Acceptance criteria:** Matches clarification acceptance checklist; no regressions when fields absent.
- **Testing criteria:** Build admin bundle / `yarn medusa build`; lint clean for touched files.
- **Validation plan:** Manual order detail check for both modes.

### Implementation guidance

- **From `.cursor/rules/typescript-patterns.mdc`:** Prefer type guards / narrow parsing for unknown `payment.data` fields; avoid `any`.
- **From `.cursor/rules/medusa-development.mdc`:** Keep provider changes in the payment module service; validate inputs at boundaries; use existing `MedusaError` patterns for provider failures.
- **From `.cursor/rules/remix-storefront-routing.mdc`:** N/A (admin-only).
- **Project testing:** Workspace rules describe unit/integration patterns; this change has **no** mandated new test files if build + manual verification suffice for v1—add a unit test for the pure estimate helper if quick.

### Release & delivery strategy

- Ship behind existing Connect flag; no feature flag required. Operators enable pass-through via env when ready.

---

## Risks & open questions

| Item | Type | Owner | Mitigation / next step |
| --- | --- | --- | --- |
| Integer rounding: `estimate + net !== application_fee` by 1¢ | Risk | Eng | Clamp platform net to `max(0, application_fee - estimate)`; document rounding source is Stripe fee formula. |
| Old orders lack new `data` keys | Risk | — | Expected; widget hides Stripe row (same as pass-through off). |
| `console.log('feeConfig', …)` in provider constructor | Risk | Eng | Optional cleanup while touching `service.ts` (noise in logs). |

---

## Progress tracking

Track execution in the task hub [`AGENTS.md`](.devagent/workspace/tasks/active/2026-03-28_order-commission-widget-stripe-fees/AGENTS.md) during `implement-plan`.

---

## Appendices & references

- Research: `.devagent/workspace/tasks/active/2026-03-28_order-commission-widget-stripe-fees/research/2026-03-28_stripe-processing-fee-line-order-widget.md`
- Clarification: `.devagent/workspace/tasks/active/2026-03-28_order-commission-widget-stripe-fees/clarification/2026-03-28_initial-clarification.md`
- Prior commission widget task: `.devagent/workspace/tasks/completed/2026-03-20_admin-order-commission-widget/`
- Code: `apps/medusa/src/modules/stripe-connect/service.ts`, `apps/medusa/src/admin/widgets/order-commission-widget.tsx`, `apps/medusa/medusa-config.ts`
