# Stripe Connect & Platform Fees

This template uses **Stripe Connect Express accounts** with **direct charges** so that each chef is the merchant of record. The platform collects its cut via `application_fee_amount` on each PaymentIntent.

With direct charges, Stripe processing fees, refunds, and chargebacks are debited from the connected (chef) account — not the platform.

## Environment variables

### Required for payments

- **`STRIPE_API_KEY`** — Stripe secret key (test or live). Required for all payment flows.

### Stripe Connect

- **`MEDUSA_ADMIN_URL`** — Full URL of the Medusa Admin app (e.g. `http://localhost:7000`). Required for the Stripe Connect onboarding flow (Express account links).
- **`STRIPE_CONNECT_WEBHOOK_SECRET`** — Webhook signing secret for the Connect endpoint (`account.updated`). Optional; if set, the webhook route must receive the raw request body for signature verification.

### Payment webhooks

- **`STRIPE_WEBHOOK_SECRET`** — Webhook secret for payment intents (payments, refunds). **Important:** This must be registered as a Connect webhook endpoint in Stripe so that direct charge events from connected accounts are forwarded to the platform.

### Platform fees

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

- **`REFUND_APPLICATION_FEE`** — Set to `true` to refund the platform's application fee when a direct charge is refunded. With direct charges, the refund amount is debited from the connected account.

## Admin onboarding

The connected account is managed via the admin UI:

1. Open **Medusa Admin** → **Settings** (or **Store**) and find the **Stripe Connect** widget.
2. Click **Connect with Stripe** — Stripe handles the Express onboarding (identity verification, bank details, etc.).
3. When status is **Active**, payments will use that connected account for direct charges.
4. Click **Express Dashboard** to open the chef's Stripe Express Dashboard (payouts, balance, etc.).

The widget shows status: **Not connected**, **Onboarding incomplete**, **Pending verification**, or **Active**. You can **Update Account Details** to return to Stripe's onboarding flow.

## Connect billing model

This template is designed for **"Stripe handles pricing"** — the platform does not incur additional per-account, per-payout, or payout-volume fees from Stripe. Configure this in your Stripe Dashboard under **Settings → Connect → Pricing**.

## Webhooks

- **Payment webhooks** — Register your Stripe webhook endpoint as a **Connect webhook endpoint** (select "Events on Connected accounts") so that `payment_intent.succeeded`, `payment_intent.amount_capturable_updated`, and similar events from direct charges are forwarded to the platform. Configure `STRIPE_WEBHOOK_SECRET` accordingly.
- **Connect account webhook** — To keep the stored Connect account status in sync, configure a separate Stripe webhook for **Connect** → **account.updated** and set `STRIPE_CONNECT_WEBHOOK_SECRET`. The backend route is `POST /webhooks/stripe-connect`.

## Provider ID

The payment provider ID is **`pp_stripe-connect_stripe-connect`**. Storefront and seed scripts use this when creating payment sessions and checking payment methods.

## Related documentation

- [Custom → Express migration changelog](./stripe-connect-custom-to-express-migration.md) — summary of code and configuration changes when switching from Custom accounts and destination charges to Express and direct charges.
