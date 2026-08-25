import type { Client } from "@medusajs/js-sdk";

export type StripeConnectStatus =
  | "not_connected"
  | "onboarding_incomplete"
  | "pending_verification"
  | "active";

export interface StripeConnectAccountSnapshot {
  id: string;
  stripe_account_id: string;
  account_type: "express" | "standard";
  connection_method: "platform_onboarding" | "oauth";
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  connected_at: string | null;
  disconnected_at: string | null;
}

export interface StripeConnectStripeSnapshot {
  id: string;
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  business_profile: {
    name?: string;
    url?: string;
  } | null;
}

export interface StripeConnectStatusResponse {
  account: StripeConnectAccountSnapshot | null;
  stripe_account: StripeConnectStripeSnapshot | null;
  status: StripeConnectStatus;
}

export interface StripeConnectAccountLinkBody {
  business_name?: string;
  email?: string;
  country?: string;
}

export interface StripeConnectAccountLinkResponse {
  url: string;
}

export interface StripeConnectOAuthLinkResponse {
  url: string;
}

export interface StripeConnectDashboardLinkResponse {
  url: string;
  mode: "express_login" | "stripe_dashboard";
  message?: string;
}

export class AdminStripeConnectResource {
  constructor(private client: Client) {}

  async getStatus() {
    return this.client.fetch<StripeConnectStatusResponse>(
      "/admin/stripe-connect",
      { method: "GET" },
    );
  }

  async createAccountLink(body: StripeConnectAccountLinkBody = {}) {
    return this.client.fetch<StripeConnectAccountLinkResponse>(
      "/admin/stripe-connect/account-link",
      { method: "POST", body },
    );
  }

  async createStandardOAuthLink() {
    return this.client.fetch<StripeConnectOAuthLinkResponse>(
      "/admin/stripe-connect/oauth/start",
      { method: "POST" },
    );
  }

  async deleteAccount() {
    return this.client.fetch<{ deleted: boolean }>("/admin/stripe-connect", {
      method: "DELETE",
    });
  }

  async createDashboardLink() {
    return this.client.fetch<StripeConnectDashboardLinkResponse>(
      "/admin/stripe-connect/dashboard-link",
      { method: "POST" },
    );
  }

  async createExpressLoginLink() {
    return this.createDashboardLink();
  }
}
