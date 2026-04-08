# Porting Express + direct charges (checklist for child projects, e.g. sdoa)

This document is a **copy-paste reference** for aligning a fork/sibling app with **private-chef-template** after the migration from Custom accounts + destination charges to **Express + direct charges**. Adjust paths and provider IDs if your project differs.

---

## 1) Stripe Dashboard — Connect webhooks

Medusa v2 exposes the **payment provider** webhook at:

```text
POST https://<MEDUSA_BACKEND_HOST>/hooks/payment/<payment_provider_id>
```

In this template, `medusa-config.ts` registers the custom provider with **`id: 'stripe-connect'`**, so the path is:

```text
https://<MEDUSA_BACKEND_HOST>/hooks/payment/stripe-connect
```

**If your child project uses a different `id` in `medusa-config`**, the last path segment must match that id exactly.

### A) Payment intents (required for reliable async flows with direct charges)

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL:** `https://<MEDUSA_BACKEND_HOST>/hooks/payment/<your-provider-id>` (e.g. `stripe-connect`).
3. Enable **listening to events on connected accounts** (Stripe UI wording varies, e.g. *“Listen to events on Connected accounts”* / *events from your connected accounts*).  
   **Why:** With direct charges, the PaymentIntent exists **on** `acct_…`; those events are not the same as “platform account only” webhooks.
4. **Event types** to subscribe (match what the provider’s `getWebhookActionAndData` handles in this template):
   - `payment_intent.succeeded`
   - `payment_intent.amount_capturable_updated`
   - `payment_intent.payment_failed`
   - `charge.refunded` (optional; template maps it but returns `not_supported` — safe to include for future use)

5. **Signing secret:** Copy the endpoint’s **`whsec_…`** into Medusa as:

   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

   This secret is **for this specific endpoint URL**. It is **not** the same as the platform’s “default” webhook unless you deliberately reuse one endpoint for everything (not recommended when you have two URLs).

### B) Connect account lifecycle (optional but typical for onboarding sync)

This template also has a **custom** route for **`account.updated`**:

```text
POST https://<MEDUSA_BACKEND_HOST>/webhooks/stripe-connect
```

1. Add a **second** webhook endpoint in Stripe pointing to that URL (or a separate Connect-focused endpoint, depending on how you organize Dashboard config).
2. Subscribe at least to: **`account.updated`** (under Connect / connected account events, per Stripe’s picker).
3. **Signing secret** →

   ```bash
   STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
   ```

### Secrets summary

| Env var | Stripe endpoint URL | Typical use |
|--------|----------------------|-------------|
| `STRIPE_WEBHOOK_SECRET` | `/hooks/payment/<provider-id>` | PaymentIntent (and related) events from **connected accounts** |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `/webhooks/stripe-connect` | `account.updated` for DB onboarding state |

**Same secret vs separate:** Use **separate** signing secrets unless Stripe is configured with **one** endpoint URL for **all** those events (unusual here because Medusa uses two different routes). Each Dashboard endpoint has its own `whsec_…`.

### Local dev

Expose Medusa with **ngrok** (or similar) and use the **HTTPS** URL in Stripe. Stripe cannot call `localhost` directly.

---

## 2) `application_fee_amount` vs “platform commission” (after dropping destination charges)

**They are the same number in code:** whatever you compute as the platform’s take is passed straight to Stripe as `application_fee_amount` on the PaymentIntent. There is **no** separate “destination transfer” math.

**Where it is set (this template):**

- **Direct charge:** `stripe.paymentIntents.create(params, { stripeAccount: connectedAccountId })`.
- **`params.application_fee_amount`** = platform fee in **smallest currency unit** (cents for USD), **only if** `> 0`.

**How the fee is computed:**

1. **Cart-level mode** (`PLATFORM_FEE_PER_UNIT_BASED` is not `true`):
   - `application_fee_amount = round(cart_total_in_cents * (PLATFORM_FEE_PERCENT / 100))`.
   - If `PLATFORM_FEE_PERCENT <= 0`, fee is `0`.

2. **Per-line mode** (`PLATFORM_FEE_PER_UNIT_BASED=true`):
   - Load cart line items (SKU, quantity, unit price in cents).
   - Classify lines: SKU starts with **`EVENT-`** → “event/ticket” rules; else → “product” rules.
   - Sum fees using `PLATFORM_FEE_MODE_TICKETS` / `PLATFORM_FEE_MODE_PRODUCTS` as `per_unit` or `percent`, with cents or percent from env (`PLATFORM_FEE_PER_TICKET_CENTS`, `PLATFORM_FEE_PER_PRODUCT_CENTS`, `PLATFORM_FEE_PERCENT_EVENTS`, `PLATFORM_FEE_PERCENT_PRODUCTS`, fallback `PLATFORM_FEE_PERCENT`).
   - If no lines or cart id missing, **fallback** to the same cart-level percentage as (1).

3. **`updatePayment` (amount change):** In this template, fee is **recalculated with cart-level percentage only** (no line-item recompute), because update lacks reliable cart line context — port the same limitation or improve explicitly in the child project.

**Admin “platform commission” display:** Read **`application_fee_amount`** from persisted payment `data` (and gross from PI amount / payment amount / order total). That matches Stripe’s **Collected fee** on the connected account’s payment view.

**Removed with direct charges:** Any logic that **grossed up** `application_fee_amount` to approximate Stripe card fees (`PASS_STRIPE_FEE_TO_CHEF`) — Stripe card fees are borne on the **connected account** balance, not duplicated in the application fee.

---

## 3) `PASS_STRIPE_FEE_TO_CHEF` / `passStripeFeeToChef` and admin “Stripe fees” UI

**Removed entirely from the template:**

- Env: `PASS_STRIPE_FEE_TO_CHEF`, `STRIPE_FEE_PERCENT`, `STRIPE_FEE_FLAT_CENTS`.
- `medusa-config` provider options: `useStripeConnect`, `passStripeFeeToChef`, `stripeFeePercent`, `stripeFeeFlatCents`, legacy env `connectedAccountId` fallback.
- Code: `estimate-stripe-processing-fee.ts` (deleted), all gross-up branches in fee calculation, `payoutAdminFieldsForAmount`-style fields on payment `data`.
- Payment session / payment `data` fields: `pass_stripe_fee_to_chef`, `stripe_processing_fee_estimate`.

**Admin order payout UI (this template):**

- Shows **Charged to customer**, **Platform commission** (from `application_fee_amount`), **Chef take-home** = charged − commission (economic split **before** Stripe’s own processing fees).
- **No** row labeled “Stripe processing fees” or estimated pass-through — chefs see real Stripe fees in the **Express Dashboard**.

**Copy guidance for sdoa:** Remove any admin copy that implies the platform is passing through or estimating card fees in-app; point operators to Express Dashboard for processor fees.

---

## 4) `loadStripe` / Elements — `stripeAccount`

**Requirement:** With direct charges, the PaymentIntent and `client_secret` belong to the **connected account**. Initialize Stripe.js **in that context**.

**Pattern (this template — storefront):**

1. Read the active Medusa payment session for your Connect provider (here: `provider_id === 'pp_stripe-connect_stripe-connect'` — **derive `pp_<id>_<id>` from your Medusa provider registration if different**).
2. From `session.data`, read:
   - `client_secret` — required for Elements.
   - `connected_account_id` — Stripe account id `acct_…` returned by the provider at `initiatePayment`.

3. **Initialize:**

   ```ts
   loadStripe(STRIPE_PUBLISHABLE_KEY, connectedAccountId ? { stripeAccount: connectedAccountId } : undefined)
   ```

4. **`<Elements>`** options: pass `clientSecret` (default in template). **Key** the `Elements` tree on `clientSecret` so a new PI forces a remount.

**Platform publishable key:** Still use the **platform’s** publishable key; `stripeAccount` scopes the session to the connected account (do not swap to a different publishable key unless your integration explicitly requires it).

---

## 5) Connect billing — “Stripe handles pricing”

**This template assumes Connect pricing mode is configured in the Stripe Dashboard**, not via a special API call in app code.

- **Where (typical):** Stripe Dashboard → **Settings** → **Connect** → **Pricing** (wording may vary slightly).
- **Choice:** **Stripe handles pricing** (vs “You handle pricing”) so the platform avoids extra Connect line items such as per-active-account / per-payout fees described in Stripe’s Connect pricing docs.
- **Mirror in sdoa:** Use the **same Stripe platform account** (or parallel test/live accounts) and set the **same Connect pricing choice** you use for the template, so unit economics match expectations.

**Note:** Exact fee schedules change over time; always verify against [Stripe Connect pricing](https://stripe.com/connect/pricing) and your Dashboard for the account you use in each environment (test vs live).

---

## Quick implementation parity checklist (code)

When porting sdoa, verify:

- [ ] `stripe.accounts.create` uses **`type: 'express'`** (not `custom`).
- [ ] `paymentIntents.create` uses **`{ stripeAccount: acctId }`** and **no** `transfer_data` / `on_behalf_of`.
- [ ] All PI retrieve/capture/cancel/update/refund calls pass **`{ stripeAccount }`** when acting on an existing PI (using stored `connected_account_id` on payment data).
- [ ] `initiatePayment` returns **`connected_account_id`** and **`application_fee_amount`** on session data for storefront + admin.
- [ ] Storefront **`loadStripe(..., { stripeAccount })`** matches the above.
- [ ] Two webhook URLs and two secrets unless you intentionally collapse them (not recommended without careful Stripe configuration).
- [ ] Docs and `.env` no longer reference removed fee gross-up env vars.

---

*Derived from **private-chef-template** after the Express + direct charges migration. Provider id and routes follow Medusa v2 defaults (`/hooks/payment/:provider` from `@medusajs/medusa`).*
