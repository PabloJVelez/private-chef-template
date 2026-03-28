# Research — Stripe processing fee line on admin order payout widget

- Classification: Implementation design (admin UI + payment `data` persistence)
- Requested by: PabloJVelez (inferred from task hub / git context)
- Last updated: 2026-03-28
- Related task hub: `.devagent/workspace/tasks/completed/2026-03-28_order-commission-widget-stripe-fees/`
- Storage path: `.devagent/workspace/tasks/completed/2026-03-28_order-commission-widget-stripe-fees/research/2026-03-28_stripe-processing-fee-line-order-widget.md`

## Inferred problem statement

The **Payout summary** admin widget (`apps/medusa/src/admin/widgets/order-commission-widget.tsx`) shows **Charged to customer**, **Platform commission** (`payment.data.application_fee_amount`), and **Chef take-home** (gross minus application fee). Stakeholders want an additional **Stripe processing fees** line so the breakdown reconciles visually and conceptually, reflecting the intent that **processing fees are assessed to the platform but passed through to the connected account (chef)**.

## Assumptions

- `[INFERRED]` “Stripe processing fees” in the UI should align with either **(a)** the **estimated** fee baked into Connect fee logic, **(b)** the **actual** fee Stripe records on the charge’s balance transaction, or **(c)** both—with copy that distinguishes estimate vs actual if they differ.
- `[INFERRED]` The admin widget should continue to avoid calling Stripe from the browser; any Stripe retrieval stays **server-side** in the provider or a dedicated admin API if introduced.

## Research plan (what was validated)

1. What the widget reads today and how **take-home** is computed.
2. Whether the stripe-connect provider already models **pass-through** processing fees and how that affects **`application_fee_amount`**.
3. What is persisted on **`payment.data`** after authorize/capture/retrieve.
4. Whether **webhooks** or other code paths already capture **actual** Stripe fees.
5. Gaps: **per-line fee** path vs **cart-level** fee path for gross-up consistency.
6. Whether **medusa-config** exposes `passStripeFeeToChef` / fee tuning options.

## Sources

| Reference | Type | Notes |
| --- | --- | --- |
| `apps/medusa/src/admin/widgets/order-commission-widget.tsx` | Code | Gross from `data.amount` / payment `amount` / order `total`; commission from `data.application_fee_amount`; take-home = gross − commission. |
| `apps/medusa/src/modules/stripe-connect/service.ts` | Code | `calculateApplicationFee`, `persistDataFromPaymentIntent`, authorize/capture/retrieve return shapes; webhooks. |
| `apps/medusa/src/modules/stripe-connect/types.ts` | Code | `passStripeFeeToChef`, `stripeFeePercent`, `stripeFeeFlatCents`; `StripeConnectPaymentData`. |
| `apps/medusa/src/modules/stripe-connect/utils/platform-fee.ts` | Code | Line-based platform fee only (no Stripe gross-up). |
| `apps/medusa/medusa-config.ts` | Code | Provider options passed today (no `passStripeFeeToChef` in snippet reviewed). |
| [Stripe API — Balance Transaction](https://docs.stripe.com/api/balance_transactions/object) | Docs | `fee` (integer, cents) and `fee_details` describe processing cost for the transaction. |

## Findings and tradeoffs

### 1. Current widget math

- **Charged to customer** uses the PaymentIntent amount in smallest units when present (`data.amount`), else payment/order fallbacks.
- **Platform commission** is the full **`application_fee_amount`** from persisted payment `data`.
- **Chef take-home** = gross − `application_fee_amount` when both are known.

There is **no** separate field for Stripe processing fees in `payment.data` today.

### 2. Provider already estimates a “Stripe fee” component when configured

In `StripeConnectProviderService.calculateApplicationFee` (`service.ts`):

- Base platform fee = `round(amount * feePercent / 100)`.
- If **`passStripeFeeToChef`** is true, the application fee adds  
  `round(amount * (stripeFeePercent / 100)) + stripeFeeFlatCents` (defaults **2.9% + 30¢**).

So **`application_fee_amount` on the PaymentIntent** can represent **platform commission + estimated Stripe processing fee** in one number. The admin widget currently labels that **entire** amount “Platform commission,” which is **semantically misleading** when gross-up is enabled.

### 3. What gets persisted from Stripe

`persistDataFromPaymentIntent` only merges **`application_fee_amount`** and **`connected_account_id`** into Medusa payment `data` (plus id/status/amount/currency in authorize/capture paths). It does **not** persist:

- a split between platform vs Stripe-fee portions, or  
- **actual** Stripe fees from balance transactions.

### 4. Actual vs estimated fee

- **Estimated:** Deterministic from charge amount and the same formula as `calculateApplicationFee` (and configurable `stripeFeePercent` / `stripeFeeFlatCents`). Can be recomputed or stored at capture time **without** an extra Stripe call if amount + config are known.
- **Actual:** Stripe exposes fees on the **Balance Transaction** attached to the **Charge** (`fee`, `fee_details`), per [Stripe Balance Transaction object](https://docs.stripe.com/api/balance_transactions/object). This generally requires retrieving the charge with `expand` (or a follow-up API call) **after** the charge exists — often slightly **async** relative to “payment succeeded.”

Tradeoff: **estimated** matches what was used to set `application_fee_amount` and keeps admin self-contained; **actual** matches Stripe’s ledger but needs persistence (webhook or capture-time retrieve) and handling for pending/unavailable states.

### 5. Webhooks do not record processing fees today

`getWebhookActionAndData` handles `payment_intent.succeeded`, failures, etc., but returns only session correlation and amount — it does **not** fetch or store balance transaction fees. The separate route `api/webhooks/stripe-connect/route.ts` is for **account.updated**, not payment fees.

### 6. Configuration wiring gap

`medusa-config.ts` passes `apiKey`, `useStripeConnect`, `refundApplicationFee`, and `webhookSecret` to the provider. **`passStripeFeeToChef` / `stripeFeePercent` / `stripeFeeFlatCents` are not set from env in that file** (grep shows no `PASS_STRIPE_FEE` usage under `apps/medusa`). The gross-up logic **exists** but defaults to **`passStripeFeeToChef: false`** unless options are added.

### 7. Per-line (`feePerUnitBased`) vs cart-level fee inconsistency

When **`feePerUnitBased`** is true and cart lines exist, **`initiatePayment`** sets `applicationFeeAmount` from **`calculatePlatformFeeFromLines`** only. That path **does not** add the **`passStripeFeeToChef`** stripe estimate (unlike `calculateApplicationFee` for cart-level mode). If gross-up is enabled in the future, **per-line orders could diverge** from the intended “platform + Stripe estimate” model unless the same gross-up is applied after line totals.

## Recommendation

1. **Clarify semantics in the UI (minimum viable):**  
   - Treat **`application_fee_amount`** as **total platform retention** from the charge.  
   - When displaying a **Stripe processing fees** line, prefer **splitting** that total for explanation:
     - **Stripe processing fees (est.)** = same formula as `calculateApplicationFee`’s stripe component:  
       `round(gross * stripeFeePercent/100) + stripeFeeFlatCents` when pass-through is in effect.  
     - **Platform commission** = `application_fee_amount − stripe_processing_estimate` (clamp at ≥ 0).  
   - **Chef take-home** = `gross − application_fee_amount` (unchanged; still matches Stripe Connect transfer math).

2. **Persist optional breakdown fields** on payment `data` (provider `persistDataFromPaymentIntent` or capture/initiate outputs) so the admin widget does **not** need env/config copies of `stripeFeePercent` / `stripeFeeFlatCents` and so historical orders reflect **what was used at capture**:
   - e.g. `stripe_fee_estimate_amount`, `platform_commission_amount` (both smallest currency unit), or store `pass_stripe_fee_to_chef` flag + recompute only when safe.

3. **Phase 2 (optional):** Persist **actual** `stripe_fee_actual_amount` from Balance Transaction via capture-time retrieve or a `charge.succeeded` / `payment_intent.succeeded` handler that loads `latest_charge` with expand — show “Final Stripe fees (from Stripe)” when present, else fall back to estimate.

4. **Product/config:** Wire **`passStripeFeeToChef`** (and fee %) from env in `medusa-config.ts` if operators are expected to toggle pass-through without code changes; align **per-line** fee path with gross-up if both features are on.

## Repo next steps (checklist)

- [ ] Decide: **estimate-only** line, **actual** line, or **both** with labels.
- [ ] Decide whether **platform commission** row should show **net of Stripe pass-through** when gross-up is enabled (recommended for honest labeling).
- [ ] Extend `persistDataFromPaymentIntent` / `StripeConnectPaymentData` (and widget `fields` query) with the minimal fields needed for the chosen approach.
- [ ] Fix or document **per-line + passStripeFeeToChef** interaction in `initiatePayment`.
- [ ] Update `order-commission-widget.tsx` rows and empty states (e.g. when estimate is N/A because pass-through is off — show “—” or “Absorbed by platform” per product copy).
- [ ] Manual test: Connect order with gross-up on and off; compare to Stripe Dashboard fee for a spot check.

## Risks and open questions

| Item | Notes |
| --- | --- |
| Admin bundle cannot read server env for fee % | Without persisted fields, the widget would duplicate magic numbers or need a tiny admin API — **persist on payment `data`** is preferable. |
| Estimate ≠ actual Stripe fee | International cards, disputes, pricing changes — use clear **“estimated”** labeling unless actual is persisted. |
| `application_fee_amount` &lt; recomputed stripe estimate | Edge cases (PI updates, partial captures) — use `max(0, application_fee − estimate)` and sane fallbacks. |
| **NEEDS CLARIFICATION** | Should the Stripe line appear when **pass-through is off** (informational only vs hidden)? |
