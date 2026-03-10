# Stripe Connect Admin & Webhook Snippets (Sibling Project Reference)

## Admin API — `GET /admin/stripe-connect` and `DELETE /admin/stripe-connect`

```ts
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { STRIPE_CONNECT_ACCOUNT_MODULE } from '../../../modules/stripe-connect-account';
import type StripeConnectAccountModuleService from '../../../modules/stripe-connect-account/service';

export type StripeConnectStatus =
  | 'not_connected'
  | 'onboarding_incomplete'
  | 'pending_verification'
  | 'active';

function deriveStatus(
  detailsSubmitted: boolean,
  chargesEnabled: boolean,
): StripeConnectStatus {
  if (chargesEnabled) return 'active';
  if (detailsSubmitted) return 'pending_verification';
  return 'onboarding_incomplete';
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    STRIPE_CONNECT_ACCOUNT_MODULE,
  ) as StripeConnectAccountModuleService;

  const [account] = await svc.listStripeAccounts({}, { take: 1 });

  if (!account) {
    res.status(200).json({
      account: null,
      stripe_account: null,
      status: 'not_connected' as const,
    });
    return;
  }

  await svc.syncAccountStatus(account.stripe_account_id);

  const [updated] = await svc.listStripeAccounts(
    { id: account.id },
    { take: 1 },
  );
  const record = updated ?? account;

  const stripeAccount = await svc.fetchStripeAccountFromStripe(
    record.stripe_account_id,
  );

  const status = deriveStatus(
    record.details_submitted,
    record.charges_enabled,
  );

  const stripeSnapshot =
    stripeAccount &&
    ({
      id: stripeAccount.id,
      details_submitted: stripeAccount.details_submitted,
      charges_enabled: stripeAccount.charges_enabled,
      payouts_enabled: stripeAccount.payouts_enabled,
      business_profile:
        stripeAccount.business_profile &&
        typeof stripeAccount.business_profile === 'object'
          ? {
              name: (stripeAccount.business_profile as { name?: string }).name,
              url: (stripeAccount.business_profile as { url?: string }).url,
            }
          : null,
    } as const);

  res.status(200).json({
    account: {
      id: record.id,
      stripe_account_id: record.stripe_account_id,
      details_submitted: record.details_submitted,
      charges_enabled: record.charges_enabled,
    },
    stripe_account: stripeSnapshot,
    status,
  });
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    STRIPE_CONNECT_ACCOUNT_MODULE,
  ) as StripeConnectAccountModuleService;

  const [account] = await svc.listStripeAccounts({}, { take: 1 });
  if (!account) {
    res.status(200).json({ deleted: false });
    return;
  }

  await svc.deleteStripeAccounts(account.id);
  res.status(200).json({ deleted: true });
}
```

## Admin API — `POST /admin/stripe-connect/account-link`

```ts
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { z } from 'zod';
import { STRIPE_CONNECT_ACCOUNT_MODULE } from '../../../../modules/stripe-connect-account';
import type StripeConnectAccountModuleService from '../../../../modules/stripe-connect-account/service';

const bodySchema = z.object({
  business_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  country: z.string().optional(),
});

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    STRIPE_CONNECT_ACCOUNT_MODULE,
  ) as StripeConnectAccountModuleService;

  const parsed = bodySchema.safeParse(req.body ?? {});
  const body = parsed.success ? parsed.data : {};

  const businessName = body.business_name;
  const email = body.email && body.email !== '' ? body.email : undefined;
  const country = body.country;

  try {
    const { stripe_account_id } = await svc.getOrCreateStripeAccount(
      businessName,
      email,
      country,
    );
    const { url } = await svc.getAccountLink(stripe_account_id);
    res.status(200).json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create account link';
    res.status(400).json({ message });
  }
}
```

## Webhook — `POST /webhooks/stripe-connect` (`account.updated`)

```ts
/**
 * Stripe Connect account.updated webhook.
 * Syncs DB state when Stripe sends account.updated.
 *
 * Note: Signature verification requires the raw request body. If using body parser
 * middleware, configure this route to receive raw body (e.g. express.raw()) or
 * Stripe signature verification will fail when STRIPE_CONNECT_WEBHOOK_SECRET is set.
 */
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import Stripe from 'stripe';
import { STRIPE_CONNECT_ACCOUNT_MODULE } from '../../../modules/stripe-connect-account';
import type StripeConnectAccountModuleService from '../../../modules/stripe-connect-account/service';

const STRIPE_CONNECT_WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '';

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const signature = req.headers['stripe-signature'] as string | undefined;
  let payload: string | Buffer;

  const body = req.body;
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    payload = body;
  } else if (body && typeof body === 'object') {
    if (STRIPE_CONNECT_WEBHOOK_SECRET) {
      res.status(400).json({
        error: 'Raw body required for webhook signature verification. Configure this route to receive raw body.',
      });
      return;
    }
    const event = body as Stripe.Event;
    if (event.type === 'account.updated') {
      const account = event.data?.object as Stripe.Account;
      if (account?.id) {
        const svc = req.scope.resolve(
          STRIPE_CONNECT_ACCOUNT_MODULE,
        ) as StripeConnectAccountModuleService;
        await svc.syncAccountStatus(account.id);
      }
    }
    res.status(200).json({ received: true });
    return;
  } else {
    res.status(400).json({ error: 'Missing body' });
    return;
  }

  if (STRIPE_CONNECT_WEBHOOK_SECRET && signature) {
    try {
      const stripe = new Stripe(process.env.STRIPE_API_KEY || '');
      stripe.webhooks.constructEvent(
        payload,
        signature,
        STRIPE_CONNECT_WEBHOOK_SECRET,
      );
    } catch (err) {
      res.status(400).json({ error: 'Webhook signature verification failed' });
      return;
    }
  }

  const event = JSON.parse(
    typeof payload === 'string' ? payload : payload.toString('utf8'),
  ) as Stripe.Event;

  if (event.type === 'account.updated') {
    const account = event.data?.object as Stripe.Account;
    if (account?.id) {
      const svc = req.scope.resolve(
        STRIPE_CONNECT_ACCOUNT_MODULE,
      ) as StripeConnectAccountModuleService;
      await svc.syncAccountStatus(account.id);
    }
  }

  res.status(200).json({ received: true });
}
```

## Admin UI Widget — `stripe-connect-store-widget.tsx`

```tsx
import { defineWidgetConfig } from '@medusajs/admin-sdk';
import {
  Container,
  Heading,
  Button,
  toast,
  Input,
  Label,
  Text,
  Badge,
} from '@medusajs/ui';
import { useStripeConnectStatus, useStripeConnectAccountLinkMutation } from '../hooks/stripe-connect';
import { useState } from 'react';
import type { StripeConnectStatus } from '../../sdk/admin/admin-stripe-connect';

const STATUS_LABELS: Record<StripeConnectStatus, string> = {
  not_connected: 'Not connected',
  onboarding_incomplete: 'Onboarding incomplete',
  pending_verification: 'Pending verification',
  active: 'Active',
};

const StripeConnectStoreWidget = () => {
  const { data, isLoading } = useStripeConnectStatus();
  const accountLinkMutation = useStripeConnectAccountLinkMutation();
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');

  const handleConnect = async () => {
    try {
      const res = await accountLinkMutation.mutateAsync({
        business_name: businessName || undefined,
        email: email || undefined,
      });
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch (e) {
      toast.error('Could not start Stripe onboarding', {
        description: e instanceof Error ? e.message : 'Unknown error',
        duration: 5000,
      });
    }
  };

  const handleCompleteOrUpdate = async () => {
    try {
      const res = await accountLinkMutation.mutateAsync({});
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch (e) {
      toast.error('Could not get Stripe link', {
        description: e instanceof Error ? e.message : 'Unknown error',
        duration: 5000,
      });
    }
  };

  if (isLoading || !data) {
    return (
      <Container>
        <div className="flex h-32 items-center justify-center">
          <Text className="text-ui-fg-muted">Loading Stripe Connect…</Text>
        </div>
      </Container>
    );
  }

  const { account, stripe_account } = data;
  const status = data.status as StripeConnectStatus;

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-4 px-6 py-6">
        <div className="flex items-center justify-between">
          <Heading level="h2">Stripe Connect</Heading>
          <Badge
            size="large"
            color={
              status === 'active'
                ? 'green'
                : status === 'not_connected'
                  ? 'grey'
                  : 'orange'
            }
          >
            {STATUS_LABELS[status]}
          </Badge>
        </div>

        {status === 'not_connected' && (
          <div className="flex flex-col gap-4 rounded-lg border border-ui-border-base p-4">
            <Text className="text-ui-fg-subtle">
              Connect your Stripe account to accept payments and receive payouts.
            </Text>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="stripe-widget-business_name">Business name (optional)</Label>
                <Input
                  id="stripe-widget-business_name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Acme Inc."
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="stripe-widget-email">Email (optional)</Label>
                <Input
                  id="stripe-widget-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <Button
              onClick={handleConnect}
              disabled={accountLinkMutation.isPending}
            >
              Connect with Stripe
            </Button>
          </div>
        )}

        {(status === 'onboarding_incomplete' || status === 'pending_verification') &&
          (
            <div className="flex flex-col gap-4 rounded-lg border border-ui-border-base p-4">
              <Text className="text-ui-fg-subtle">
                {status === 'onboarding_incomplete'
                  ? 'Complete your Stripe account setup to start accepting payments.'
                  : 'Your account is being verified by Stripe. You can update details in the meantime.'}
              </Text>
              <Button
                onClick={handleCompleteOrUpdate}
                disabled={accountLinkMutation.isPending}
              >
                {status === 'onboarding_incomplete'
                  ? 'Complete Stripe Setup'
                  : 'Update Account Details'}
              </Button>
            </div>
          )}

        {status === 'active' && account && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-ui-border-base p-4">
              <Heading level="h3" className="mb-3 text-base">
                Account details
              </Heading>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ui-fg-muted">Stripe account ID</dt>
                  <dd className="font-mono">{account.stripe_account_id}</dd>
                </div>
                {stripe_account?.business_profile?.name && (
                  <div>
                    <dt className="text-ui-fg-muted">Business name</dt>
                    <dd>{stripe_account.business_profile.name}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-ui-fg-muted">Charges enabled</dt>
                  <dd>{stripe_account?.charges_enabled ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt className="text-ui-fg-muted">Payouts enabled</dt>
                  <dd>{stripe_account?.payouts_enabled ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
            </div>
            <Button
              variant="secondary"
              onClick={handleCompleteOrUpdate}
              disabled={accountLinkMutation.isPending}
            >
              Update Account Details
            </Button>
          </div>
        )}
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: 'store.details.after',
});

export default StripeConnectStoreWidget;
```

