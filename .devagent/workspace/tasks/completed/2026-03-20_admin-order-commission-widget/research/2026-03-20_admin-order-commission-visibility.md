# Research — Admin order commission visibility (Stripe Connect / PaymentIntent)

- Mode: Task
- Requested By: PabloJVelez (inferred from git config / task hub)
- Last Updated: 2026-03-20
- Related Task Hub: `.devagent/workspace/tasks/completed/2026-03-20_admin-order-commission-widget/`
- Storage Path: `.devagent/workspace/tasks/completed/2026-03-20_admin-order-commission-widget/research/2026-03-20_admin-order-commission-visibility.md`

## Request Overview

**Inferred problem statement:** The product owner wants chefs to see **platform commission per order** on the **Medusa Admin** order experience, ideally grounded in **Stripe PaymentIntent** data (e.g. Connect `application_fee_amount`).

**Assumptions (tagged):**

- `[INFERRED]` “Commission” means the platform’s **application fee** on destination charges (Stripe Connect), not Stripe processing fees unless explicitly grossed up via `passStripeFeeToChef`.
- `[INFERRED]` The admin surface is **order detail** (widget), not only the order list, unless scope expands later.

**Desired outcome:** Clear, evidence-based path to implement a widget: where fee is defined today, what is persisted on the Medusa side, and how the admin UI should obtain it (embedded order payload vs custom admin API).

## Research Questions

| ID | Question | Status | Notes |
| --- | --- | --- | --- |
| Q1 | Where is Connect commission computed and applied on the PaymentIntent? | Answered | `stripe-connect` provider: `application_fee_amount` + `transfer_data.destination` |
| Q2 | Is `application_fee_amount` persisted on Medusa payments/sessions for later admin reads? | Follow-up | Init/update return rich `data`; authorize/capture return **minimal** `data` — verify merge behavior in Payment Module |
| Q3 | How should the admin UI be extended for order details? | Answered | Medusa v2 widgets: `order.details.after`, `order.details.side.after`, etc.; props `DetailWidgetProps<AdminOrder>` |
| Q4 | Are there multiple fee models to display separately? | Answered (code) | Per-cart % vs per-line (event vs product by SKU) — **single** PI `application_fee_amount` is the charged total |
| Q5 | If DB payload lacks fee, can we rely on Stripe retrieve? | Open | Needs server-side route + secret key; rate limits and security |

## Key Findings

1. **Commission is implemented as Stripe `application_fee_amount`** on destination charges when Connect is enabled, with fee logic in `calculatePlatformFeeFromLines` / cart fallback (`apps/medusa/src/modules/stripe-connect/`).
2. **`initiatePayment` and `updatePayment`** return `StripeConnectPaymentData` including `application_fee_amount`; **`authorizePayment` and `capturePayment`** return only `id`, `status`, `amount`, `currency` — not the fee. Whether the fee remains in stored session/payment `data` depends on how Medusa merges provider responses (confirm during implementation).
3. **Admin extension pattern exists:** `defineWidgetConfig` + zones such as **`order.details.after`**; widget receives **`AdminOrder`** via `DetailWidgetProps` ([Medusa recipe — personalized order items](https://docs.medusajs.com/resources/recipes/personalized-products/example#step-8-show-an-orders-personalized-items-in-medusa-admin)).
4. **Admin API** exposes `payment_collections[].payment_sessions[].data` and payments’ `data` as generic objects ([Admin API order shape](https://docs.medusajs.com/api/admin)) — suitable for `id` (PI) + optional `application_fee_amount` if present.
5. **Display semantics:** One authoritative number for “platform commission” on the charge is **`application_fee_amount`** on the PaymentIntent (Stripe’s field for the platform’s fee in Connect flows). Per-line breakdown is not stored on the PI unless added via **metadata** (not done today).

## Detailed Findings

### Q1 — Fee computation and PaymentIntent

- **Destination charges:** When Connect is on, the provider sets `transfer_data.destination`, `on_behalf_of`, and optionally `application_fee_amount` (`apps/medusa/src/modules/stripe-connect/service.ts`, create path ~271–301).
- **Fee amount:** Derived from cart total or from line items via `calculatePlatformFeeFromLines` (`apps/medusa/src/modules/stripe-connect/utils/platform-fee.ts`) when `feePerUnitBased` is true; events vs products distinguished by SKU prefix `EVENT-`.
- **Types:** `StripeConnectPaymentData` includes optional `application_fee_amount` (`apps/medusa/src/modules/stripe-connect/types.ts`).

### Q2 — Persisted Medusa payment `data`

Evidence from provider return values:

- **Rich data (includes fee):** `initiatePayment` returns `data` with `application_fee_amount` set when Connect is enabled (~312–325). `updatePayment` returns fee from `paymentIntent.application_fee_amount` (~641–652).
- **Minimal data (no fee):** `authorizePayment` (~365–372) and `capturePayment` (~397–414) return only PI id, status, amount, currency.

**Implication:** If the payment session’s stored `data` is **replaced** by the authorize/capture response, the admin may **not** see `application_fee_amount` unless the framework **merges** or unless fee is re-fetched from Stripe.

**Recommendation:** During implementation, inspect a real order’s `payment_collections` / `payments` JSON in Admin API (or DB). If `application_fee_amount` is missing, either:

- **Provider fix (preferred for self-contained admin):** extend `authorizePayment` / `capturePayment` (and optionally `retrievePayment`) to include `application_fee_amount` from the retrieved `PaymentIntent` in returned `data`, matching `StripeConnectPaymentData`; or  
- **On-demand admin API:** new `GET /admin/...` that retrieves PI by `data.id` server-side and returns fee (never expose secret key to the browser).

### Q3 — Admin widget placement

- Official examples use `zone: "order.details.after"` or `order.details.side.after` with `DetailWidgetProps<AdminOrder>` ([personalized products](https://docs.medusajs.com/resources/recipes/personalized-products/example#step-8-show-an-orders-personalized-items-in-medusa-admin), [gift message](https://docs.medusajs.com/resources/how-to-tutorials/tutorials/gift-message#step-4-show-gift-options-in-admin-dashboard)).
- Injection zone reference: [Order module admin widget zones](https://docs.medusajs.com/resources/commerce-modules/order/admin-widget-zones).
- Existing project precedent: `apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx` uses `store.details.after` — same `defineWidgetConfig` pattern.

### Q4 — Multiple fee models

- Configuration allows **different rules** for event vs product lines, but Stripe receives **one** `application_fee_amount` per PaymentIntent. The widget should show that **total** unless product asks for a **breakdown**, which would require extra metadata or recomputing from **order line items** (duplicating fee logic client-side — fragile).

### Q5 — Stripe metadata

- PI `metadata` currently stores `session_id` / `resource_id` for webhooks (~275–279), not fee breakdown.

## Comparative / Alternatives Analysis

| Approach | Pros | Cons |
| --- | --- | --- |
| Read fee from order’s payment `data` only | No extra API; fast | May be absent if overwritten on authorize/capture |
| Enrich provider `authorize`/`capture` `data` with PI fields | Stays in Medusa payment records | Small provider change; must stay in sync with Stripe |
| Custom admin route + Stripe retrieve | Always accurate | Latency; Stripe rate limits; must secure and audit |

## Implications for Implementation

- **Widget:** New file under `apps/medusa/src/admin/widgets/`, zone `order.details.side.after` or `order.details.after`, typed with `DetailWidgetProps<AdminOrder>` (or `HttpTypes.AdminOrder` per Medusa docs).
- **Data path:** Traverse `order.payment_collections` → payments or sessions with `provider_id` containing `stripe-connect` (confirm actual `provider_id` string in config) → read `data.application_fee_amount` and `data.id` (PI).
- **Formatting:** Amounts in **smallest currency unit** (cents); use order `currency_code` for display.
- **Empty state:** If Connect disabled or fee zero/absent, show muted “No platform commission recorded” or hide widget — **product decision** (see open questions).

## Risks & Open Questions

| Item | Type | Mitigation / Next Step |
| --- | --- | --- |
| Payment `data` may not include `application_fee_amount` after authorize | Risk | Inspect live order JSON; adjust provider returns or add admin API |
| Default `AdminOrder` query may omit nested `data` | Risk | Use `useQuery` + `sdk.admin.order.retrieve(id, { fields: ... })` if needed (confirm JS SDK `fields` support) |
| Listing page-only widget | Question | Task text said “orders page”; clarify list vs detail vs both |
| Historical orders before any provider fix | Risk | Stripe retrieve backfill or accept “—” for legacy |

## Recommended Follow-ups

1. **`devagent create-plan`** — File-level plan: widget component, provider `data` enrichment (if needed), optional admin route, tests.
2. **Spike (implementation phase):** Log or inspect one completed order’s admin API payload for `payment_sessions[0].data` and captured `payments[0].data`.
3. **Product:** Confirm UX for partial refunds / `refund_application_fee` config (chef-visible label: “Platform commission (at capture)” vs current net).

## Sources

| Reference | Type | Freshness | Access Notes |
| --- | --- | --- | --- |
| `apps/medusa/src/modules/stripe-connect/service.ts` | Code | 2026-03-20 | Fee creation, authorize/capture return shapes |
| `apps/medusa/src/modules/stripe-connect/types.ts` | Code | 2026-03-20 | `StripeConnectPaymentData` |
| `apps/medusa/src/modules/stripe-connect/utils/platform-fee.ts` | Code | 2026-03-20 | Per-line fee rules |
| `apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx` | Code | 2026-03-20 | Widget config precedent |
| [Medusa — Order admin widget zones](https://docs.medusajs.com/resources/commerce-modules/order/admin-widget-zones) | Docs | Medusa docs (retrieved 2026-03-20) | Zone names and `AdminOrder` props |
| [Medusa — Personalized order widget example](https://docs.medusajs.com/resources/recipes/personalized-products/example#step-8-show-an-orders-personalized-items-in-medusa-admin) | Docs | 2026-03-20 | `order.details.after` + `DetailWidgetProps` |
| [Medusa Admin API — Order / payment session `data`](https://docs.medusajs.com/api/admin) | Docs | 2026-03-20 | `payment_sessions[].data`, `payments[].data` |

---

## Repo Next Steps (checklist)

- [ ] Inspect real `GET /admin/orders/:id` (or SDK equivalent) payload for stripe-connect payment session/payment `data` and note if `application_fee_amount` is present after capture.
- [ ] If absent, patch `authorizePayment` / `capturePayment` (and possibly `retrievePayment`) to pass through `application_fee_amount` from Stripe’s `PaymentIntent` in returned `data`.
- [ ] Add admin widget to display commission from `data` or from a thin admin custom route.
- [ ] Add manual test matrix: Connect on/off, fee 0, event+product mixed cart, refund with `refund_application_fee` true vs false (labeling only).
