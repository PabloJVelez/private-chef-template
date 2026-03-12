import { defineWidgetConfig } from "@medusajs/admin-sdk";
import {
  Container,
  Heading,
  Button,
  toast,
  Input,
  Label,
  Text,
  Badge,
} from "@medusajs/ui";
import { useStripeConnectStatus, useStripeConnectAccountLinkMutation } from "../hooks/stripe-connect";
import { useState } from "react";
import type { StripeConnectStatus } from "../../sdk";

const STATUS_LABELS: Record<StripeConnectStatus, string> = {
  not_connected: "Not connected",
  onboarding_incomplete: "Onboarding incomplete",
  pending_verification: "Pending verification",
  active: "Active",
};

const StripeConnectStoreWidget = () => {
  const { data, isLoading } = useStripeConnectStatus();
  const accountLinkMutation = useStripeConnectAccountLinkMutation();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");

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
      toast.error("Could not start Stripe onboarding", {
        description: e instanceof Error ? e.message : "Unknown error",
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
      toast.error("Could not get Stripe link", {
        description: e instanceof Error ? e.message : "Unknown error",
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
              status === "active"
                ? "green"
                : status === "not_connected"
                  ? "grey"
                  : "orange"
            }
          >
            {STATUS_LABELS[status]}
          </Badge>
        </div>

        {status === "not_connected" && (
          <div className="flex flex-col gap-4 rounded-lg border border-ui-border-base p-4">
            <Text className="text-ui-fg-subtle">
              Connect your Stripe account to accept payments and receive payouts.
            </Text>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="stripe-widget-business_name">
                  Business name (optional)
                </Label>
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

        {(status === "onboarding_incomplete" ||
          status === "pending_verification") && (
          <div className="flex flex-col gap-4 rounded-lg border border-ui-border-base p-4">
            <Text className="text-ui-fg-subtle">
              {status === "onboarding_incomplete"
                ? "Complete your Stripe account setup to start accepting payments."
                : "Your account is being verified by Stripe. You can update details in the meantime."}
            </Text>
            <Button
              onClick={handleCompleteOrUpdate}
              disabled={accountLinkMutation.isPending}
            >
              {status === "onboarding_incomplete"
                ? "Complete Stripe Setup"
                : "Update Account Details"}
            </Button>
          </div>
        )}

        {status === "active" && account && (
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
                  <dd>{stripe_account?.charges_enabled ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="text-ui-fg-muted">Payouts enabled</dt>
                  <dd>{stripe_account?.payouts_enabled ? "Yes" : "No"}</dd>
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
  zone: "store.details.after",
});

export default StripeConnectStoreWidget;
