# Admin Order Commission Widget Plan

- Owner: PabloJVelez
- Last Updated: 2026-03-20
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-20_admin-order-commission-widget/`
- Stakeholders: PabloJVelez (session owner)

---

## PART 1: PRODUCT CONTEXT

### Summary

Chefs using the Medusa Admin cannot see how much platform commission was taken per order. The Stripe Connect provider already computes and sets `application_fee_amount` on PaymentIntents at creation time, but the provider's `authorize` and `capture` methods return a minimal `data` payload that omits the fee—so Medusa's stored Payment record loses it. This plan addresses both the data persistence gap and the admin UI surface: enrich the provider's lifecycle methods, then add a widget to the order detail page labeled "Platform commission."

### Context & Problem

- The stripe-connect provider (`apps/medusa/src/modules/stripe-connect/service.ts`) sets `application_fee_amount` on the PI via `initiatePayment`, storing it in the session's `data` (`StripeConnectPaymentData`).
- However, when `authorizePayment` runs, a new **Payment** record is created from its returned `data`—which today only contains `{id, status, amount, currency}`. Capture does the same. This means the fee is lost from the persisted Payment.
- Chefs have no visibility into the commission the platform retains per order.

Source: [Research packet](../research/2026-03-20_admin-order-commission-visibility.md), [Clarification packet](../clarification/2026-03-20_initial-clarification.md).

### Objectives & Success Metrics

- **Objective:** After any stripe-connect order, the Medusa-persisted Payment `data` includes `application_fee_amount`, and the admin order detail page shows **"Platform commission"** with the correct value.
- **Success:** A chef opens an order → sees commission → amount matches the PI's `application_fee_amount`.

### Users & Insights

- **Primary user:** Chef (merchant) viewing orders in Medusa Admin.
- **Insight:** Commission transparency builds trust; chefs want to know exactly what was taken per order.

### Solution Principles

- Data should be self-contained in Medusa—no on-demand Stripe calls from the admin.
- Amounts are in **smallest currency unit** (cents); the widget formats them using the order's `currency_code`.
- Follow existing admin widget patterns (`defineWidgetConfig`, `@medusajs/ui` components).

### Scope Definition

**In Scope:**

- Enrich `authorizePayment`, `capturePayment`, and `retrievePayment` return `data` to include `application_fee_amount` (and `connected_account_id` for completeness).
- Admin widget on **order detail** page showing **"Platform commission"**.
- Sensible behavior: hide widget when provider is not stripe-connect; show "$0.00" or "No platform commission" when Connect is on but fee is zero.

**Out of Scope / Future:**

- Orders **list** column.
- Historical order backfill.
- On-demand Stripe retrieve from the admin.
- Per-line fee breakdown in the widget.

### Functional Narrative

#### Flow: Chef views order commission

- **Trigger:** Chef navigates to Admin → Orders → clicks an order.
- **Experience:** The order detail page renders normally. In the side column (after payment/fulfillment sections), a "Platform Commission" section appears showing the commission amount formatted to the order currency (e.g. "$5.00"). If the order was not processed through stripe-connect, the widget renders nothing. If Connect was on but fee was zero, the widget shows "$0.00."
- **Acceptance criteria:** Commission matches the Stripe PaymentIntent's `application_fee_amount`; non–stripe-connect orders show no widget.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions

- **Scope:** Two files changed, one file created.
- **Assumptions:**
  - Medusa's Payment Module stores the `data` returned by `authorizePayment` on the Payment record and replaces it with `capturePayment`'s returned `data` (confirmed via [Medusa docs on `capturePayment`](https://docs.medusajs.com/resources/references/payment/provider#capturepayment)).
  - `AdminOrder` provided to detail widgets includes `payment_collections` with nested `payment_sessions[].payment.data` (verify during implementation; if not, the widget will need `useQuery` to refetch with expanded fields).
  - The provider's `provider_id` on sessions/payments is `pp_stripe-connect` (Medusa convention: `pp_<id>` where id is from `medusa-config.ts`).

### Implementation Tasks

#### Task 1: Enrich stripe-connect provider lifecycle `data`

- **Objective:** Ensure `authorizePayment`, `capturePayment`, and `retrievePayment` return `application_fee_amount` (and `connected_account_id`) from the Stripe PaymentIntent, so Medusa's stored Payment record preserves the fee.
- **Impacted Modules/Files:**
  - `apps/medusa/src/modules/stripe-connect/service.ts` — `authorizePayment` (~347–383), `capturePayment` (~385–439), `retrievePayment` (~549–574)
- **References:**
  - `StripeConnectPaymentData` type in `apps/medusa/src/modules/stripe-connect/types.ts` (already defines `application_fee_amount?: number` and `connected_account_id?: string`)
  - [Medusa docs: `capturePayment` data flow](https://docs.medusajs.com/resources/references/payment/provider#capturepayment)
- **Dependencies:** None (provider is self-contained).
- **Acceptance Criteria:**
  - `authorizePayment` returned `data` includes `application_fee_amount` and `connected_account_id` from the retrieved PaymentIntent (when Connect is enabled).
  - `capturePayment` returned `data` (all three code paths: already succeeded, requires_capture, unexpected state) includes `application_fee_amount` and `connected_account_id`.
  - `retrievePayment` returned `data` includes `application_fee_amount` and `connected_account_id`.
  - Existing fields (`id`, `status`, `amount`, `currency`, `client_secret` where applicable) are unchanged.
  - No regressions: non-Connect mode or zero-fee flows still work.
- **Subtasks:**
  1. **`authorizePayment`** — After retrieving the PI (~line 356), add `application_fee_amount` and `connected_account_id` to the returned `data` object using `paymentIntent.application_fee_amount ?? undefined` and `(paymentIntent.transfer_data?.destination as string) ?? undefined`.
  2. **`capturePayment`** — Three return paths (~396–429). In each, after retrieving/capturing the PI, add the same two fields from the relevant `existingIntent` or `paymentIntent` variable.
  3. **`retrievePayment`** — After retrieving the PI (~558), add the same two fields.
- **Testing Criteria:**
  - Place a test order with Connect enabled and non-zero fee. Inspect the Payment record's `data` via `GET /admin/orders/:id` (expanding payment collections/sessions/payments). Confirm `application_fee_amount` is present and correct.
  - Place a test order with Connect disabled. Confirm `application_fee_amount` is absent or `undefined` (no errors).
- **Validation Plan:** Manual API inspection of order payload; if project has provider tests, add assertions for return shape.

#### Task 2: Create order commission admin widget

- **Objective:** Add a widget to the order detail page that reads the stripe-connect payment's `data.application_fee_amount` and displays **"Platform commission"** with formatted currency.
- **Impacted Modules/Files:**
  - `apps/medusa/src/admin/widgets/order-commission-widget.tsx` — **new file**
- **References:**
  - Existing widget pattern: `apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx`
  - [Medusa order detail widget zones](https://docs.medusajs.com/resources/commerce-modules/order/admin-widget-zones) — using `order.details.side.after`
  - [Medusa personalized-order widget example](https://docs.medusajs.com/resources/recipes/personalized-products/example#step-8-show-an-orders-personalized-items-in-medusa-admin) — `DetailWidgetProps<AdminOrder>` usage
  - `@medusajs/ui` components: `Container`, `Heading`, `Text`, `Badge`
- **Dependencies:** Task 1 (fee must be persisted in payment `data`).
- **Acceptance Criteria:**
  - Widget appears in the order detail side column for orders with a stripe-connect payment.
  - Displays heading **"Platform Commission"** and the fee formatted with the order's currency (e.g. "$5.00").
  - Widget renders nothing (returns `<></>`) when:
    - No stripe-connect payment session/payment exists on the order, OR
    - Connect is not the provider (non–`pp_stripe-connect` provider_id).
  - When Connect is on but fee is `0` or `null`/`undefined`: show "No platform commission" in muted text.
- **Subtasks:**
  1. **Widget component** — Accept `DetailWidgetProps<AdminOrder>`, traverse `order.payment_collections → payment_sessions → payment → data`, find the stripe-connect entry, read `application_fee_amount`.
  2. **Currency formatting** — Convert smallest-unit integer to display string using `Intl.NumberFormat` (or a simple `(amount / 100).toFixed(2)` with currency symbol). Use `order.currency_code` for locale.
  3. **Widget config** — `defineWidgetConfig({ zone: "order.details.side.after" })`.
  4. **Empty/hide logic** — If no stripe-connect payment found → render nothing. If fee is zero → render "No platform commission."
- **Testing Criteria:**
  - Open an order with Connect fee in Admin → widget shows correct amount.
  - Open an order without stripe-connect → widget is absent.
  - Open an order with Connect enabled but $0 fee → widget shows "No platform commission."
- **Validation Plan:** Manual admin UI verification across the three scenarios above.

#### Task 3: Verify data availability in `AdminOrder` widget props

- **Objective:** Confirm that the `AdminOrder` object provided via `DetailWidgetProps` in the order detail page includes nested `payment_collections[].payment_sessions[].payment.data` by default. If not, adjust the widget to fetch expanded data.
- **Impacted Modules/Files:**
  - `apps/medusa/src/admin/widgets/order-commission-widget.tsx` (may need `useQuery` + SDK call if default props lack nested data)
- **References:**
  - [Medusa Admin API — GET /admin/orders/:id](https://docs.medusajs.com/api/admin)
- **Dependencies:** Task 1 (provider must persist fee), Task 2 (widget must exist).
- **Acceptance Criteria:**
  - Widget reliably reads `application_fee_amount` from the order prop or from a refetched order.
  - No unnecessary API calls if default props already include the data.
- **Subtasks:**
  1. **Inspect** — Log or inspect `data` prop in widget dev tools. Check if `payment_collections[0].payment_sessions[0].payment.data.application_fee_amount` is present.
  2. **If missing** — Add a `useQuery` that calls `sdk.admin.order.retrieve(order.id, { fields: "+payment_collections.payment_sessions.payment.data" })` (or equivalent expanded fields) and use the refetched data.
- **Testing Criteria:** Widget displays correct fee from props or refetch; console shows no errors for missing nested paths.
- **Validation Plan:** Manual check; optionally guard with `?.` chaining throughout.

### Implementation Guidance

**From `.cursor/rules/medusa-development.mdc`:**
- Use `MedusaError` for error handling in provider code.
- Validate inputs at API boundaries; use Zod where needed.
- Follow naming conventions: PascalCase for types, camelCase for variables, kebab-case for files.

**From `.cursor/rules/remix-storefront-components.mdc` (applicable to admin widgets):**
- Use `@medusajs/ui` components (`Container`, `Heading`, `Text`) for consistent styling.
- Use `clsx` or Tailwind for conditional classes.

**From admin widget precedent (`apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx`):**
- Import `defineWidgetConfig` from `@medusajs/admin-sdk`.
- Import UI primitives from `@medusajs/ui`.
- Export default component + named `config`.

**From Medusa docs ([order widget zones](https://docs.medusajs.com/resources/commerce-modules/order/admin-widget-zones)):**
- Zone `order.details.side.after` adds content at the end of the second column.
- Widget receives `DetailWidgetProps<AdminOrder>` with `data` prop containing the order.

---

## Risks & Open Questions

| Item | Type | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| `AdminOrder` widget props may not include nested `payment.data` by default | Risk | Implementer | Task 3: inspect and refetch if needed | During implementation |
| `provider_id` string may differ from `pp_stripe-connect` | Risk | Implementer | Log actual `provider_id` from a test order; adjust widget filter | During implementation |
| Historical orders created before provider fix will lack `application_fee_amount` in Payment `data` | Risk | PabloJVelez | Accepted for v1; widget shows empty state; backfill is out of scope | Deferred |
| Stripe `PaymentIntent.application_fee_amount` may be `null` on non-Connect PIs (provider running in standard mode) | Risk | Implementer | Guard with `?? undefined`; widget treats absent/null as "no fee" | During implementation |

---

## Progress Tracking

Refer to the AGENTS.md file in the task directory for instructions on tracking and reporting progress during implementation.

---

## Appendices & References

- **Research packet:** `research/2026-03-20_admin-order-commission-visibility.md`
- **Clarification packet:** `clarification/2026-03-20_initial-clarification.md`
- **Task hub:** `AGENTS.md`
- **Coding standards:** `.cursor/rules/medusa-development.mdc`, `.cursor/rules/typescript-patterns.mdc`
- **Medusa docs:**
  - [Order admin widget zones](https://docs.medusajs.com/resources/commerce-modules/order/admin-widget-zones)
  - [Personalized order widget recipe](https://docs.medusajs.com/resources/recipes/personalized-products/example#step-8-show-an-orders-personalized-items-in-medusa-admin)
  - [Payment provider `capturePayment` data flow](https://docs.medusajs.com/resources/references/payment/provider#capturepayment)
  - [Payment `data` property lifecycle](https://docs.medusajs.com/resources/commerce-modules/payment/payment#data-property)
- **Existing code:**
  - `apps/medusa/src/modules/stripe-connect/service.ts` — provider lifecycle methods
  - `apps/medusa/src/modules/stripe-connect/types.ts` — `StripeConnectPaymentData`
  - `apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx` — widget pattern reference
  - `apps/medusa/medusa-config.ts` — provider registration (`id: 'stripe-connect'`)
