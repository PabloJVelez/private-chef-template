# Stripe Connect Express + Direct Charges Migration Research

- Owner: PabloJVelez
- Date: 2026-04-05
- Task Hub: `.devagent/workspace/tasks/active/2026-04-05_stripe-connect-express-direct-charges-migration/`

## Classification & Assumptions

**Classification:** Implementation design — migrating from Custom accounts + destination charges to Express accounts + direct charges.

**Assumptions:**
- [INFERRED] The platform will adopt "Stripe handles pricing" Connect billing to eliminate per-account and per-payout fees.
- [INFERRED] This is a forward-only migration: new chefs get Express accounts; existing Custom accounts are re-onboarded to new Express accounts.
- [INFERRED] The platform wants chefs to be merchants of record with Stripe fees, refunds, and chargebacks debiting the chef's account.

## Research Plan (What Was Validated)

1. **Express account creation API** — what changes from `type: "custom"` to `type: "express"`, capabilities, and onboarding flow
2. **Direct charges API** — how to create PaymentIntents on the connected account, the `Stripe-Account` header pattern, `application_fee_amount` compatibility
3. **Stripe.js client-side** — the `stripeAccount` parameter in `loadStripe()`, how Elements/PaymentElement work with direct charges
4. **Refund mechanics** — which account is debited, `refund_application_fee` behavior, removal of `reverse_transfer` concerns
5. **Webhook routing** — Connect webhooks for direct charge events, `event.account` property, webhook endpoint configuration
6. **Connect billing model** — "Stripe handles pricing" vs "You handle pricing" cost implications
7. **Medusa payment provider constraints** — `AbstractPaymentProvider` interface, `getWebhookActionAndData` session correlation, webhook listener routes

## Sources

1. [Stripe: Create direct charges](https://docs.stripe.com/connect/direct-charges) — PaymentIntent creation with `Stripe-Account` header, `application_fee_amount`, refund mechanics, Stripe.js setup with `stripeAccount`. Accessed 2026-04-05.
2. [Stripe: Express connected accounts](https://docs.stripe.com/connect/express-accounts) — Account creation with `type: "express"`, AccountLink onboarding, Express Dashboard. Accessed 2026-04-05.
3. [Stripe: Connect pricing](https://stripe.com/us/connect/pricing) — "Stripe handles pricing" vs "You handle pricing" fee structures. Accessed 2026-04-05.
4. [Stripe: Connect webhooks](https://docs.stripe.com/connect/webhooks) — Connect webhook types, `connect: true` endpoint configuration, `event.account` property. Accessed 2026-04-05.
5. [Stripe: Disputes on Connect](https://docs.stripe.com/connect/disputes) — Dispute liability by charge type and controller properties. Accessed 2026-04-05.
6. [Stripe: Fee behavior on connected accounts](https://docs.stripe.com/connect/direct-charges-fee-payer-behavior) — Who pays Stripe fees under direct charges. Accessed 2026-04-05.
7. [Medusa: Payment Module Provider](https://docs.medusajs.com/resources/references/payment/provider) — `AbstractPaymentProvider` interface, `getWebhookActionAndData`. Accessed 2026-04-05.
8. [Medusa: Payment Webhook Events](https://docs.medusajs.com/resources/commerce-modules/payment/webhook-events) — Webhook listener route at `/hooks/payment/{identifier}_{id}`, session correlation via `session_id`. Accessed 2026-04-05.

## Findings & Tradeoffs

### 1. Express Account Creation (vs Custom)

**Current code** (`stripe-connect-account/service.ts` line 68–75):
```typescript
const accountParams: Stripe.AccountCreateParams = {
  type: "custom",
  country: country || "US",
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
};
```

**Required change:** Replace `type: "custom"` with `type: "express"`.

**Key differences:**
- Express accounts use Stripe-hosted onboarding and provide an **Express Dashboard** to connected accounts. The current code already uses Stripe-hosted onboarding via AccountLinks — this flow is identical for Express accounts.
- Express accounts have **lower platform KYC burden** — Stripe handles identity verification directly.
- Express accounts support **direct charges, destination charges, and separate charges/transfers** (same as Custom). So the switch to direct charges is independent of the account type switch.
- The `capabilities` request (`card_payments`, `transfers`) works the same for Express.
- **Express Dashboard:** Chefs get a Stripe-hosted dashboard to view payouts, payments, and basic account info. The platform can provide a link to this dashboard. This is a UX improvement over Custom accounts where chefs had no Stripe visibility.

**Tradeoff:** Express accounts give the platform less control over the onboarding UX (Stripe-hosted only), but since the current code already uses Stripe-hosted onboarding, there is no regression.

**Migration constraint (confirmed):** Stripe does not allow changing an account's type after creation. Existing Custom accounts must be re-onboarded as new Express accounts.

### 2. Direct Charges — PaymentIntent Creation

**Current code** (`stripe-connect/service.ts` lines 346–360, initiatePayment):
```typescript
// Current: destination charges on platform account
paymentIntentParams.on_behalf_of = connectedAccountId;
paymentIntentParams.transfer_data = { destination: connectedAccountId };
if (applicationFeeAmount > 0) {
  paymentIntentParams.application_fee_amount = applicationFeeAmount;
}
const paymentIntent = await this.stripe_.paymentIntents.create(paymentIntentParams);
```

**Required change:** Create the PaymentIntent on the connected account using the `Stripe-Account` header:
```typescript
// Target: direct charges on connected account
if (applicationFeeAmount > 0) {
  paymentIntentParams.application_fee_amount = applicationFeeAmount;
}
// REMOVE: on_behalf_of, transfer_data
const paymentIntent = await this.stripe_.paymentIntents.create(
  paymentIntentParams,
  { stripeAccount: connectedAccountId }
);
```

**Stripe API pattern for direct charges:**
- **Server-side:** All Stripe API calls for the payment (create, retrieve, update, capture, refund, cancel) must include `{ stripeAccount: connectedAccountId }` as request options.
- **`application_fee_amount`:** Still works with direct charges. The fee is transferred from the connected account to the platform account after payment processing.
- **Remove:** `transfer_data.destination` (not used with direct charges), `on_behalf_of` (not needed — the charge is already on the connected account).

**Funds flow with direct charges + application fee:**
- Customer pays $100 (charge on connected account)
- Stripe fee: ~$3.20 (deducted from connected account)
- Application fee: e.g. $5.00 (transferred to platform)
- Connected account net: $91.80

### 3. All Stripe API Calls Need `stripeAccount` Option

Every method that interacts with a PaymentIntent (or Charge/Refund) must pass the connected account context:

| Method | Current | Target |
|--------|---------|--------|
| `initiatePayment` | `stripe_.paymentIntents.create(params)` | `stripe_.paymentIntents.create(params, { stripeAccount })` |
| `authorizePayment` | `stripe_.paymentIntents.retrieve(id)` | `stripe_.paymentIntents.retrieve(id, { stripeAccount })` |
| `capturePayment` | `stripe_.paymentIntents.retrieve(id)` / `.capture(id)` | Both need `{ stripeAccount }` |
| `retrievePayment` | `stripe_.paymentIntents.retrieve(id)` | `stripe_.paymentIntents.retrieve(id, { stripeAccount })` |
| `getPaymentStatus` | `stripe_.paymentIntents.retrieve(id)` | `stripe_.paymentIntents.retrieve(id, { stripeAccount })` |
| `updatePayment` | `stripe_.paymentIntents.update(id, params)` | `stripe_.paymentIntents.update(id, params, { stripeAccount })` |
| `cancelPayment` | `stripe_.paymentIntents.cancel(id)` | `stripe_.paymentIntents.cancel(id, {}, { stripeAccount })` |
| `deletePayment` | `stripe_.paymentIntents.retrieve/cancel` | Both need `{ stripeAccount }` |
| `refundPayment` | `stripe_.refunds.create(params)` | `stripe_.refunds.create(params, { stripeAccount })` |

**Implementation approach:** Store `connected_account_id` in the payment data (already done — `StripeConnectPaymentData.connected_account_id`). Retrieve it from `data` in each method and pass as `stripeAccount` option. This avoids re-fetching the connected account ID from DB on every API call.

### 4. Stripe.js Client-Side — `stripeAccount` Parameter

**Current code** (`StripeElementsProvider.tsx` line 15):
```typescript
const stripePromise = useMemo(() => (
  env.STRIPE_PUBLIC_KEY ? loadStripe(env.STRIPE_PUBLIC_KEY) : null
), []);
```

**Required change:** Pass `stripeAccount` to `loadStripe`:
```typescript
const stripePromise = useMemo(() => (
  env.STRIPE_PUBLIC_KEY
    ? loadStripe(env.STRIPE_PUBLIC_KEY, { stripeAccount: connectedAccountId })
    : null
), [connectedAccountId]);
```

**How this works:**
- The `stripeAccount` option tells Stripe.js to scope all operations to the connected account.
- The `client_secret` from the PaymentIntent (created on the connected account) is still used to initialize Elements.
- The platform's publishable key is still used (not the connected account's key).
- Stripe confirms the payment on the connected account because `stripeAccount` is set.

**How to expose `connectedAccountId` to the storefront:**
The `connected_account_id` is already stored in payment session data (`StripeConnectPaymentData.connected_account_id`). The storefront can read it from `cart.payment_collection.payment_sessions[].data.connected_account_id`.

### 5. Refund Mechanics Under Direct Charges

**Current code** (`stripe-connect/service.ts` lines 522–531):
```typescript
const refundParams: Stripe.RefundCreateParams = {
  payment_intent: paymentIntentId,
  refund_application_fee: this.config_.refundApplicationFee,
};
const refund = await this.stripe_.refunds.create(refundParams);
```

**Required change:** Add `stripeAccount` option:
```typescript
const refund = await this.stripe_.refunds.create(
  refundParams,
  { stripeAccount: connectedAccountId }
);
```

**Key behavior differences:**

| Aspect | Destination Charges (current) | Direct Charges (target) |
|--------|-------------------------------|-------------------------|
| **Refund debits** | Platform account | Connected account |
| **`refund_application_fee`** | Refunds the app fee from platform to connected | Refunds the app fee from platform back to connected account |
| **`reverse_transfer`** | Needed to pull funds back from connected account | **Not applicable** (no transfers to reverse) |
| **Dispute debits** | Platform account | Connected account (platform may be liable for negative balances) |

**What this means:** The `PASS_STRIPE_FEE_TO_CHEF` workaround becomes unnecessary. Under direct charges, Stripe fees are natively deducted from the connected account's balance. The platform never sees these fees on its own balance.

### 6. Webhook Routing for Direct Charges

**Current webhook setup:**
- Payment webhooks: Medusa's built-in route at `/hooks/payment/stripe-connect_stripe-connect` (handled by `getWebhookActionAndData`)
- Connect account webhooks: Custom route at `/webhooks/stripe-connect` (handles `account.updated`)

**Direct charges webhook behavior:**
- Payment events for direct charges (e.g. `payment_intent.succeeded`) are delivered to **Connect webhook endpoints** on the platform, not account-level webhook endpoints.
- Each event includes a top-level `account` property identifying the connected account.
- The platform must configure a **Connect webhook endpoint** (Dashboard: select "Events on Connected accounts", or API: `connect: true`).

**Impact on current code:**
- The Medusa built-in webhook route (`/hooks/payment/...`) calls `getWebhookActionAndData` on the provider. This should still work IF the webhook is registered as a Connect endpoint.
- The `getWebhookActionAndData` method currently uses `pi.metadata.resource_id || pi.metadata.session_id || pi.id` for session correlation. This still works because we set these in metadata when creating the PaymentIntent on the connected account.
- **Important:** Webhook signature verification must use the correct webhook secret. For Connect webhooks, Stripe uses the same signing mechanism but the events come through the Connect endpoint.

**Medusa webhook listener route:**
- Medusa provides `/hooks/payment/{identifier}_{id}` as the webhook listener route.
- For the `stripe-connect` provider with id `stripe-connect`, this would be `/hooks/payment/stripe-connect_stripe-connect`.
- This route delegates to `getWebhookActionAndData` and uses the returned `session_id` to correlate with Medusa payment sessions.
- **No change needed** to the Medusa webhook mechanism itself — just ensure the Stripe webhook endpoint is registered as a Connect endpoint.

### 7. Connect Billing Model

**"Stripe handles pricing" (recommended):**
- **No per-account fees** — platforms don't pay $2/month per active account
- **No per-payout fees** — no 0.25% + $0.25 per payout
- **No payout volume fees** — eliminated
- **No tax reporting fees** — eliminated
- Stripe sets processing fees directly on the connected account
- Platform earns revenue through `application_fee_amount` only
- Platform can qualify for revenue share from Stripe

**"You handle pricing":**
- $2/month per active account (any month payouts are sent)
- 0.25% + $0.25 per payout
- Platform collects all fees and pays Stripe separately
- More pricing flexibility but higher cost overhead

**Recommendation:** "Stripe handles pricing" is the clear winner for a SaaS storefront builder with a subscription model. Platform revenue comes from the monthly subscription ($49.99) + `application_fee_amount` on transactions. No need to micro-manage Stripe processing fee calculations.

### 8. What Gets Removed

The following code and config become unnecessary with direct charges:

| Item | Location | Reason for removal |
|------|----------|-------------------|
| `PASS_STRIPE_FEE_TO_CHEF` env var | `.env.template`, `medusa-config.ts` | Stripe fees natively deducted from connected account under direct charges |
| `STRIPE_FEE_PERCENT` env var | `.env.template` | No gross-up needed |
| `STRIPE_FEE_FLAT_CENTS` env var | `.env.template` | No gross-up needed |
| `passStripeFeeToChef` config | `types.ts`, `service.ts` | No gross-up needed |
| `stripeFeePercent` / `stripeFeeFlatCents` config | `types.ts`, `service.ts` | No gross-up needed |
| `estimateStripeProcessingFee()` util | `utils/estimate-stripe-processing-fee.ts` | No gross-up needed |
| `payoutAdminFieldsForAmount()` method | `service.ts` | No more estimated Stripe fee display in admin |
| `pass_stripe_fee_to_chef` / `stripe_processing_fee_estimate` on payment data | `types.ts`, `service.ts` | Admin widget needs simplification |
| `transfer_data` / `on_behalf_of` on PaymentIntent | `service.ts` initiatePayment | Not used with direct charges |
| `persistDataFromPaymentIntent()` method | `service.ts` | `transfer_data.destination` no longer exists; `application_fee_amount` can be stored directly |
| Admin payout breakdown logic for "estimated Stripe fee" | `order-stripe-payout-breakdown.tsx` | Simplified: Stripe fees visible on chef's Express Dashboard, not estimated by platform |

### 9. `persistDataFromPaymentIntent` and Admin Widget Changes

**Current behavior:** The admin order widget shows a payout breakdown with the estimated Stripe processing fee (passed through via `application_fee_amount` gross-up). It reads `pass_stripe_fee_to_chef` and `stripe_processing_fee_estimate` from payment data.

**With direct charges:** Stripe fees are not visible on the platform's PaymentIntent (they're on the connected account's BalanceTransaction). The admin widget should show:
- Order total
- Platform application fee (commission)
- Chef payout = Order total - Application fee - Stripe fees (but Stripe fees are on the connected account, not the platform)

The admin widget would either:
1. **Simplify** to show just "Application Fee" (commission) and note that Stripe fees are deducted from the chef's account.
2. **Retrieve** the connected account's BalanceTransaction to show actual Stripe fees (more complex, requires `Stripe-Account` header).

**Recommendation:** Option 1 for initial migration. The chef can see actual Stripe fees in their Express Dashboard.

### 10. Storefront `StripeElementsProvider` Data Flow

**Current flow:**
1. Medusa creates PaymentIntent on platform account (with `transfer_data.destination`)
2. Returns `client_secret` in payment session data
3. Storefront uses `loadStripe(publishableKey)` — no `stripeAccount`
4. Elements initialized with `client_secret`

**Direct charges flow:**
1. Medusa creates PaymentIntent on connected account (with `stripeAccount` header)
2. Returns `client_secret` and `connected_account_id` in payment session data
3. Storefront uses `loadStripe(publishableKey, { stripeAccount: connectedAccountId })`
4. Elements initialized with `client_secret`

**Key consideration:** The `stripeAccount` must be available before `loadStripe` is called. Since it's stored in the payment session data, the storefront reads it from `cart.payment_collection.payment_sessions[].data.connected_account_id` — which is already populated by the current code.

## Recommendation

**Proceed with Express + direct charges migration.** The changes are well-scoped and all Stripe API patterns are confirmed by official documentation.

**Recommended approach:**

1. **Account module:** Change `type: "custom"` → `type: "express"` in `getOrCreateStripeAccount()`. No other changes needed to the onboarding flow — AccountLinks work the same.

2. **Payment provider:** Refactor all Stripe API calls to include `{ stripeAccount: connectedAccountId }`. Remove `transfer_data`, `on_behalf_of`, and the entire `PASS_STRIPE_FEE_TO_CHEF` / fee gross-up logic. The `connected_account_id` is already stored in payment data; use it for subsequent API calls.

3. **Storefront:** Pass `stripeAccount` to `loadStripe()` using the `connected_account_id` from payment session data.

4. **Webhooks:** Register the payment webhook endpoint as a Connect endpoint in Stripe Dashboard. No code changes needed — the `getWebhookActionAndData` method and Medusa's webhook routing work the same.

5. **Admin widget:** Simplify payout breakdown to show commission only. Remove Stripe fee estimation. Consider adding an Express Dashboard link for the chef.

6. **Connect billing:** Adopt "Stripe handles pricing" to eliminate per-account and per-payout fees.

## Repo Next Steps (Checklist)

- [ ] Update `stripe-connect-account/service.ts`: change `type: "custom"` to `type: "express"` in `getOrCreateStripeAccount()`
- [ ] Update `stripe-connect/service.ts`: add `{ stripeAccount }` option to all Stripe API calls (create, retrieve, update, capture, cancel, refund)
- [ ] Update `stripe-connect/service.ts`: remove `transfer_data.destination`, `on_behalf_of` from `initiatePayment`
- [ ] Remove `PASS_STRIPE_FEE_TO_CHEF` / `STRIPE_FEE_PERCENT` / `STRIPE_FEE_FLAT_CENTS` from env, config, types
- [ ] Remove `estimateStripeProcessingFee` util and all references
- [ ] Remove `payoutAdminFieldsForAmount`, `pass_stripe_fee_to_chef`, `stripe_processing_fee_estimate` from types and service
- [ ] Simplify `persistDataFromPaymentIntent` — store `application_fee_amount` directly
- [ ] Update `StripeElementsProvider.tsx`: pass `stripeAccount` to `loadStripe()`
- [ ] Update `order-stripe-payout-breakdown.tsx`: remove estimated Stripe fee; simplify to commission-only view
- [ ] Update `.env.template`: remove deprecated vars, add notes about direct charges
- [ ] Update `docs/stripe-connect-and-fees.md`: reflect Express + direct charges model
- [ ] Update admin widget to show Express Dashboard link when account is active
- [ ] Register Stripe webhook as Connect endpoint (instructions in docs)
- [ ] Update `stripe-connect-store-widget.tsx`: change "Custom account" references to "Express account"
- [ ] Design re-onboarding path for existing chefs on Custom accounts (new Express account creation)

## Risks & Open Questions

### Risks

1. **Webhook registration:** The Stripe webhook endpoint must be explicitly registered as a Connect endpoint. If using the Medusa built-in webhook route, confirm it can receive Connect webhook events (events with `account` property). May need to configure the webhook in Stripe Dashboard with "Events on Connected accounts" selected.

2. **PaymentIntent metadata for session correlation:** The current code stores `resource_id` and `session_id` in PaymentIntent metadata. With direct charges, the metadata is still available on the PaymentIntent (it's on the connected account). However, confirm that Medusa's webhook processing correctly resolves the payment session from the `session_id` returned by `getWebhookActionAndData`.

3. **Existing orders with destination charges:** Historical orders have PaymentIntents on the platform account. Refunding these orders after migration must still use the old code path (no `stripeAccount` header). Consider a backward-compatibility check: if `connected_account_id` is in payment data AND charge is a direct charge, use `stripeAccount`; otherwise, use platform-level refund.

4. **Stripe fee visibility in admin:** Under direct charges, the platform does not have direct visibility into what Stripe charged the connected account. The admin widget loses the ability to show "Stripe processing fee" unless the platform queries the connected account's BalanceTransaction.

5. **Dispute liability:** For Express accounts, the platform is responsible for handling disputes (same as Custom). Under direct charges, the disputed amount debits the connected account, but the platform may be liable for negative balances. Must set up dispute monitoring.

### Open Questions

1. **Connect billing enrollment:** Does "Stripe handles pricing" require any Stripe Dashboard configuration or sales team contact, or can it be enabled self-serve?

2. **Express Dashboard access for chefs:** Should the admin widget include a link to the chef's Express Dashboard login? Stripe provides a `stripe.accounts.createLoginLink(accountId)` API for this.

3. **Capture method:** The current code defaults to `automatic` capture. Under direct charges, `manual` capture (authorize then capture) still works with `stripeAccount`. No change needed, but confirm if the `post-event-capture-ticket-payments` workflow needs updates.

4. **Multi-currency:** Direct charges with `application_fee_amount` in multi-currency scenarios — confirm that the application fee currency matches the charge currency (Stripe's default behavior for direct charges).

5. **`updatePayment` with stripeAccount:** The current `updatePayment` method doesn't receive `connected_account_id` in its input. It would need to extract it from the existing payment data (the `data` parameter). Confirm the data flow.
