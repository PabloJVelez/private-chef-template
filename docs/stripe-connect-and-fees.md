# Stripe Connect and Platform Fees

This template supports two Stripe Connect account paths:

- Express onboarding for chefs who need a Stripe account created through the platform.
- Standard OAuth for chefs who already have a Stripe account and want to connect it.

Both paths produce one active connected account in the app database. Checkout uses direct charges: the PaymentIntent is created on the connected chef account with the platform secret key and Stripe SDK `{ stripeAccount: connectedAccountId }`. The platform collects its commission with `application_fee_amount`.

With direct charges, Stripe processing fees, refunds, and chargebacks are handled on the connected chef account balance, not the platform balance. The admin payout widget shows customer charge, platform commission, and chef take-home before Stripe processing fees.

## Environment Variables

Set backend runtime variables in the Medusa environment. Set storefront variables in the storefront environment.

### Medusa Backend

- `STRIPE_API_KEY` - Platform Stripe secret key for the current mode, such as `sk_test_...` or `sk_live_...`. Required for account status, OAuth exchange, webhooks, and payment flows.
- `MEDUSA_ADMIN_URL` - Public Medusa Admin app URL used for Express onboarding return/refresh links. Example: `https://api.example.com/app` or `http://localhost:7000`.
- `STRIPE_CONNECT_CLIENT_ID` - Stripe Connect OAuth client id for existing Standard account connections. Required for the `Connect Stripe` admin action.
- `STRIPE_CONNECT_OAUTH_REDIRECT_URI` - Backend callback URL registered in Stripe for existing-account OAuth. Example: `https://api.example.com/admin/stripe-connect/oauth/callback`.
- `STRIPE_CONNECT_STATE_SECRET` - Optional HMAC secret for OAuth state. If unset, the module falls back to `COOKIE_SECRET` or `JWT_SECRET`.
- `STRIPE_WEBHOOK_SECRET` - Signing secret for the Medusa payment webhook endpoint that receives connected-account payment events.
- `STRIPE_CONNECT_WEBHOOK_SECRET` - Signing secret for the account lifecycle webhook endpoint that receives Connect account events.
- `REFUND_APPLICATION_FEE` - Set to `true` to refund the platform application fee when refunding a direct charge. Default is `false`.

### Platform Fees

Fees can be per-unit or percentage based. The payment provider writes the computed platform commission to Stripe as `application_fee_amount`.

- `PLATFORM_FEE_PERCENT` - Legacy cart-level percentage fallback, such as `10` for 10%.
- `PLATFORM_FEE_PER_UNIT_BASED` - Set to `true` to compute fees from cart line items.
- `PLATFORM_FEE_MODE_TICKETS` - `per_unit` or `percent` for event ticket lines.
- `PLATFORM_FEE_PER_TICKET_CENTS` - Fixed cents per event ticket when ticket mode is `per_unit`.
- `PLATFORM_FEE_PERCENT_EVENTS` - Percentage fee for event ticket lines when ticket mode is `percent`.
- `PLATFORM_FEE_MODE_PRODUCTS` - `per_unit` or `percent` for product lines.
- `PLATFORM_FEE_PER_PRODUCT_CENTS` - Fixed cents per product unit when product mode is `per_unit`.
- `PLATFORM_FEE_PERCENT_PRODUCTS` - Percentage fee for product lines when product mode is `percent`.

### Storefront

- `STRIPE_PUBLIC_KEY` - Platform Stripe publishable key for the current mode, such as `pk_test_...` or `pk_live_...`.
- `MEDUSA_PUBLISHABLE_KEY` - Medusa publishable API key for the storefront.

The storefront still uses the platform publishable key. For direct charges, Stripe.js is initialized with:

```ts
loadStripe(STRIPE_PUBLIC_KEY, { stripeAccount: connectedAccountId })
```

The `connectedAccountId` comes from the active Medusa payment session data as `connected_account_id`.

## Stripe Dashboard Setup

Use matching test-mode and live-mode settings. Do not mix test keys, live keys, test client ids, live client ids, or webhook secrets.

### Connect Platform

1. In Stripe Dashboard, open Connect settings for the platform account.
2. Enable the account types the template needs:
   - Express for new chef onboarding.
   - Standard OAuth for chefs connecting an existing Stripe account.
3. Configure Connect pricing for the platform. This template assumes Stripe handles pricing unless the business has explicitly chosen a different model.
4. Add the platform branding and support details chefs should see during Stripe-hosted onboarding.

### Existing Stripe Account OAuth

1. In Stripe Dashboard, find the Connect OAuth client id for the current mode.
2. Set `STRIPE_CONNECT_CLIENT_ID` to that client id.
3. Add the backend callback URL as an allowed redirect URI:

   ```text
   https://<MEDUSA_BACKEND_HOST>/admin/stripe-connect/oauth/callback
   ```

4. Set `STRIPE_CONNECT_OAUTH_REDIRECT_URI` to the exact same URL.
5. In Medusa Admin, use `Connect Stripe`. The chef can sign into an existing Stripe account or create one through Stripe's hosted flow.

### Express Onboarding

1. Set `MEDUSA_ADMIN_URL` to the public admin URL.
2. In Medusa Admin, use the Express account-link path when a chef needs platform-guided onboarding.
3. Stripe collects identity, business, tax, and payout details in its hosted flow.
4. Return to Medusa Admin and confirm the status reaches `Active`.

The generic admin dashboard action chooses the right destination for the saved account type:

- Express accounts receive a single-use Express Dashboard login link.
- Standard accounts open the regular Stripe Dashboard for the account owner.

## Webhooks

This template uses two webhook routes. Keep their signing secrets separate unless you intentionally configure one Stripe endpoint to deliver all events to one URL.

### Payment Webhook

Medusa payment provider webhook URL:

```text
https://<MEDUSA_BACKEND_HOST>/hooks/payment/stripe-connect
```

Register this as a Connect webhook endpoint that listens to events on connected accounts. This is required because direct-charge PaymentIntents live on `acct_...`, not only on the platform account.

Subscribe to:

- `payment_intent.succeeded`
- `payment_intent.amount_capturable_updated`
- `payment_intent.payment_failed`
- `charge.refunded`

Copy this endpoint's `whsec_...` value into:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Account Lifecycle Webhook

Custom account lifecycle route:

```text
https://<MEDUSA_BACKEND_HOST>/webhooks/stripe-connect
```

Subscribe to:

- `account.updated`
- `account.application.deauthorized`

Copy this endpoint's `whsec_...` value into:

```bash
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
```

`account.updated` keeps `details_submitted`, `charges_enabled`, and `payouts_enabled` synced. `account.application.deauthorized` marks a connected Standard account as disconnected.

For local testing, expose Medusa with an HTTPS tunnel such as ngrok and use the tunnel URL in Stripe. Stripe cannot call `localhost` directly.

## Payment Provider ID

The Medusa provider id is `stripe-connect`, so the storefront payment provider id is:

```text
pp_stripe-connect_stripe-connect
```

Use this id everywhere the storefront initiates or completes payment sessions. Old or stale payment sessions missing `connected_account_id` must be recreated before rendering Stripe Elements.

## Test Checklist

Run this checklist in test mode before deploying live credentials, then repeat the core checkout/webhook checks in the live cutover window with a small real payment if appropriate.

### Account Connection

- [ ] With no connected account, Medusa Admin shows `Not connected`.
- [ ] `Connect Stripe` starts the Standard OAuth flow when `STRIPE_CONNECT_CLIENT_ID` and `STRIPE_CONNECT_OAUTH_REDIRECT_URI` are set.
- [ ] OAuth callback stores a `stripe_connect_account` row with `account_type=standard`, `connection_method=oauth`, and a `stripe_account_id` starting with `acct_`.
- [ ] Express onboarding still creates or reuses an Express account row when using the Express account-link route.
- [ ] `account.updated` webhook syncs `details_submitted`, `charges_enabled`, and `payouts_enabled`.
- [ ] `account.application.deauthorized` marks the stored row disconnected and the admin status returns `Not connected`.

### Payment Element Checkout

- [ ] Region payment providers include `pp_stripe-connect_stripe-connect`.
- [ ] Checkout page creates a pending Stripe Connect payment session when one is missing.
- [ ] The active payment session data includes `client_secret`, `connected_account_id`, `application_fee_amount`, `connected_account_type`, and `connected_account_connection_method`.
- [ ] Storefront initializes Stripe.js with the platform publishable key and `{ stripeAccount: connected_account_id }`.
- [ ] Completing checkout creates an order and the Stripe PaymentIntent is visible on the connected account.
- [ ] Stripe shows the application fee on the payment.

### Express Checkout

- [ ] Apple Pay, Google Pay, Link, or card express checkout renders when available.
- [ ] Express checkout address updates refresh cart totals and shipping rates.
- [ ] The payment session returned after address or shipping changes still includes `connected_account_id`.
- [ ] Express checkout completes and redirects to the order success page.

### Shipping and Stale Sessions

- [ ] Changing shipping method recreates or updates the Stripe Connect payment session.
- [ ] A pending Connect session with `client_secret` but no `connected_account_id` is refreshed before Stripe Elements renders.
- [ ] A pending non-Connect session is not used for final checkout.
- [ ] Checkout completion rejects any provider id other than `pp_stripe-connect_stripe-connect`.

### Webhook Sync

- [ ] `payment_intent.succeeded` reaches `/hooks/payment/stripe-connect` from the connected account event stream.
- [ ] `payment_intent.amount_capturable_updated` reaches `/hooks/payment/stripe-connect` for manual-capture flows.
- [ ] `payment_intent.payment_failed` maps to a failed payment action.
- [ ] Webhook signatures validate with the matching endpoint secret.

### Refunds

- [ ] Refund from Medusa Admin scopes the refund call to the connected account.
- [ ] If `REFUND_APPLICATION_FEE=false`, the platform keeps the application fee.
- [ ] If `REFUND_APPLICATION_FEE=true`, Stripe refunds the application fee according to the direct-charge refund behavior.
- [ ] Admin payout breakdown still shows customer charge, platform commission, and chef take-home.

## Related Documentation

- [Custom to Express migration changelog](./stripe-connect-custom-to-express-migration.md)
- [Porting Express direct charges to sibling projects](./porting-express-direct-charges-sibling-project.md)
