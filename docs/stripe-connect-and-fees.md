# Stripe Connect & Platform Fees

This template uses a custom **Stripe Connect** payment provider so the platform can collect configurable application fees and route the remainder to a connected chef/vendor Stripe account.

## Environment variables

### Required for payments

- **`STRIPE_API_KEY`** — Stripe secret key (test or live). Required for all payment flows.

### Stripe Connect (optional)

- **`USE_STRIPE_CONNECT`** — Set to `true` to use Stripe Connect (destination charges). When `false`, the provider behaves like standard Stripe (no Connect).
- **`MEDUSA_ADMIN_URL`** — Full URL of the Medusa Admin app (e.g. `http://localhost:7000`). Required for the Stripe Connect onboarding flow (account links).
- **`STRIPE_CONNECT_WEBHOOK_SECRET`** — Webhook signing secret for the Connect endpoint (`account.updated`). Optional; if set, the webhook route must receive the raw request body for signature verification.

### Payment webhooks

- **`STRIPE_WEBHOOK_SECRET`** — Webhook secret for payment intents (payments, refunds). Used by the stripe-connect provider for payment webhooks.

### Platform fees (when using Stripe Connect)

Fees can be per-unit (events vs products) or a percentage. Events are identified by line items whose product SKU starts with `EVENT-`; all other line items are treated as products.

- **Events**
  - **`PLATFORM_FEE_MODE_EVENTS`** — `per_unit` or `percent` (default: `per_unit`).
  - **`PLATFORM_FEE_PER_EVENT_CENTS`** — Fixed fee per event unit in cents (e.g. `100` = $1 per ticket).
  - **`PLATFORM_FEE_PERCENT_EVENTS`** — Percentage fee for events (e.g. `10` = 10%) when mode is `percent`.
- **Products**
  - **`PLATFORM_FEE_MODE_PRODUCTS`** — `per_unit` or `percent`.
  - **`PLATFORM_FEE_PER_PRODUCT_CENTS`** — Fixed fee per product unit in cents.
  - **`PLATFORM_FEE_PERCENT_PRODUCTS`** — Percentage fee for products when mode is `percent`.
- **Legacy (if per-unit env vars are not set)**  
  **`PLATFORM_FEE_PERCENT`** — Single percentage applied to the total (e.g. `10` = 10%).

### Refunds

- **`REFUND_APPLICATION_FEE`** — Set to `true` to refund the platform’s application fee when a Connect charge is refunded.

## Admin onboarding

When Stripe Connect is enabled, the connected account is managed via the admin UI (no `STRIPE_CONNECTED_ACCOUNT_ID` in env):

1. Open **Medusa Admin** → **Settings** (or **Store**) and find the **Stripe Connect** widget.
2. Click **Connect with Stripe** and complete the Stripe Connect onboarding (Custom account).
3. When status is **Active**, payments will use that connected account for destination charges.

The widget shows status: **Not connected**, **Onboarding incomplete**, **Pending verification**, or **Active**. You can **Update Account Details** to get a new account link from Stripe.

## Webhooks

- **Payment webhooks** — Use your existing Stripe webhook endpoint for payment events; configure `STRIPE_WEBHOOK_SECRET` and point Stripe to the payment webhook URL used by the template.
- **Connect account webhook** — To keep the stored Connect account status in sync, configure a Stripe webhook for **Connect** → **account.updated** and set `STRIPE_CONNECT_WEBHOOK_SECRET`. The backend route is `POST /webhooks/stripe-connect`; it must receive the **raw body** for signature verification.

## Provider ID

The payment provider ID is **`pp_stripe-connect_stripe-connect`**. Storefront and seed scripts use this when creating payment sessions and checking payment methods.
