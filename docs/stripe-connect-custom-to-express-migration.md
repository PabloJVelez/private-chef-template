# Migration: Custom accounts + destination charges → Express + direct charges

This document records what changed in the template when Stripe Connect was switched from **Custom** connected accounts with **destination charges** to **Express** accounts with **direct charges**. Use it for onboarding engineers, upgrading forks, or auditing the integration.

## Why the change

- **Before:** The platform created `type: "custom"` accounts and charged customers on the **platform** Stripe account using destination charges (`on_behalf_of` + `transfer_data.destination` + `application_fee_amount`). Stripe fees, refunds, and chargebacks were primarily debited from the **platform** balance.
- **After:** The platform creates `type: "express"` accounts and creates PaymentIntents **on the connected account** (Stripe `Stripe-Account` header / Node SDK `{ stripeAccount }`). The platform still takes its cut via `application_fee_amount`. Stripe fees, refunds, and chargebacks are primarily debited from the **connected** account—the chef is the merchant of record.

Stripe does not allow changing an existing connected account’s type. Existing Custom accounts must be removed in Stripe and in the app database, then the chef completes Express onboarding again.

---

## 1. Connected account creation (`stripe-connect-account`)

| Area | Before (Custom) | After (Express) |
|------|------------------|-----------------|
| Account type | `type: "custom"` in `Stripe.AccountCreateParams` | `type: "express"` |
| Chef dashboard | No Express Dashboard | Stripe-hosted **Express Dashboard** |
| New API | — | `createExpressDashboardLink(stripeAccountId)` → `stripe.accounts.createLoginLink()` |

**Primary file:** `apps/medusa/src/modules/stripe-connect-account/service.ts`

---

## 2. Payment provider (`stripe-connect`)

| Area | Before | After |
|------|--------|-------|
| Charge model | Destination charge on platform account | Direct charge on connected account |
| `PaymentIntent` creation | `paymentIntents.create(params)` on platform, with `transfer_data.destination` and `on_behalf_of` | `paymentIntents.create(params, { stripeAccount: connectedAccountId })` |
| Other Stripe calls | Same platform context | Pass `{ stripeAccount }` using `connected_account_id` from stored payment `data` |
| `USE_STRIPE_CONNECT` | Toggled Connect vs “plain” Stripe | **Removed** — Connect is always on |
| `connectedAccountId` in config | Optional env fallback | **Removed** — account only from DB (`getConnectedAccountId`) |
| `PASS_STRIPE_FEE_TO_CHEF` / gross-up | Optional estimated Stripe fee added to `application_fee_amount` | **Removed** — chef pays Stripe fees on their balance under direct charges |
| Fee estimation util | `estimate-stripe-processing-fee.ts` | **Deleted** |
| Payment session / payment `data` | Included `pass_stripe_fee_to_chef`, `stripe_processing_fee_estimate` | Only Connect-relevant fields (e.g. `connected_account_id`, `application_fee_amount`) |
| `persistDataFromPaymentIntent` | Read `transfer_data.destination` for `connected_account_id` | Uses explicit `connected_account_id` argument; `application_fee_amount` from PI |

**Primary files:**

- `apps/medusa/src/modules/stripe-connect/service.ts`
- `apps/medusa/src/modules/stripe-connect/types.ts`

**Platform commission logic** (`PLATFORM_FEE_*` env, per-line vs cart percentage) is unchanged: it still drives `application_fee_amount`.

---

## 3. Medusa configuration

**File:** `apps/medusa/medusa-config.ts`

Removed from env parsing and from the `stripe-connect` provider `options`:

- `USE_STRIPE_CONNECT`
- `PASS_STRIPE_FEE_TO_CHEF`
- `STRIPE_FEE_PERCENT`
- `STRIPE_FEE_FLAT_CENTS`

Provider options retained (among others): `apiKey`, `refundApplicationFee`, `webhookSecret`.

---

## 4. Storefront (Stripe.js)

Direct charges require Elements to run in the context of the connected account.

**File:** `apps/storefront/app/components/checkout/StripePayment/StripeElementsProvider.tsx`

- **Before:** `loadStripe(publishableKey)` only.
- **After:** `loadStripe(publishableKey, { stripeAccount: connectedAccountId })` where `connected_account_id` comes from the active payment session’s `data` (set by the provider in `initiatePayment`).

---

## 5. Admin UI

### Store onboarding widget

**File:** `apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx`

- Removed optional business name / email fields before “Connect with Stripe” (Express onboarding collects this in Stripe’s flow).
- **Active** state: **Express Dashboard** button opens a single-use login URL from the backend.

### Express Dashboard login endpoint

- **New route:** `POST /admin/stripe-connect/express-login` — `apps/medusa/src/api/admin/stripe-connect/express-login/route.ts`
- **SDK:** `AdminStripeConnectResource.createExpressLoginLink()` — `apps/medusa/src/sdk/admin/admin-stripe-connect.ts`
- **Hook:** `useStripeConnectExpressLoginMutation()` — `apps/medusa/src/admin/hooks/stripe-connect.ts`

### Order payout breakdown

**Files:**

- `apps/medusa/src/lib/order-stripe-payout.ts` — `extractPlatformCommission` no longer returns Stripe fee pass-through fields.
- `apps/medusa/src/admin/components/order-stripe-payout-breakdown.tsx` — Shows charged amount, platform commission, and chef take-home only (no “Stripe processing fees” estimate row).

---

## 6. Workflows and jobs

**File:** `apps/medusa/src/workflows/post-event-capture-ticket-payments.ts`

- No code changes required: it uses Medusa’s `capturePaymentWorkflow`, which calls the payment provider’s `capturePayment` (which now scopes Stripe calls with `{ stripeAccount }` when `connected_account_id` is present on the payment).

---

## 7. Environment template

**File:** `apps/medusa/.env.template`

- Removed variables and comments for `USE_STRIPE_CONNECT`, `PASS_STRIPE_FEE_TO_CHEF`, `STRIPE_FEE_PERCENT`, `STRIPE_FEE_FLAT_CENTS`.
- Clarified that payment webhooks should be set up for Connect when using direct charges.

---

## 8. Operational / Stripe Dashboard

- **Connect pricing:** The template is aligned with **“Stripe handles pricing”** for Connect fees where applicable; configure in Stripe Dashboard (Connect settings).
- **Webhooks:** The **payment** webhook endpoint should be registered to receive **events on connected accounts** so `payment_intent.*` from direct charges reach Medusa. See `docs/stripe-connect-and-fees.md`.
- **`account.updated`:** Existing `POST /webhooks/stripe-connect` flow for onboarding sync remains relevant; see `docs/stripe-connect-and-fees.md`.

---

## 9. Reference checklist for upgrades

1. Remove deprecated env vars from `.env` (match `.env.template`).
2. In Stripe Dashboard, ensure Connect webhooks cover connected-account payment events.
3. For each store that had a **Custom** account: delete the linked account in Stripe and remove the corresponding row in the app’s Stripe account table so onboarding creates a new **Express** account.
4. Re-test checkout, capture/refund, and admin Express Dashboard link in test mode.

---

## Related docs

- **Day-to-day setup and env vars:** `docs/stripe-connect-and-fees.md`
- **Task research / decisions (internal):** `.devagent/workspace/tasks/active/2026-04-05_stripe-connect-express-direct-charges-migration/`
