/**
 * Stripe Connect Account Module Service
 * Manages the single connected Stripe account and Account Link flow.
 */
import crypto from "node:crypto";
import Stripe from "stripe";
import { MedusaService } from "@medusajs/framework/utils";
import StripeAccount from "./models/stripe-account";

export type StripeConnectAccountType = "express" | "standard";
export type StripeConnectConnectionMethod = "platform_onboarding" | "oauth";

export type StripeConnectAccountModuleOptions = {
  stripeApiKey?: string;
  adminUrl?: string;
  connectClientId?: string;
  oauthRedirectUri?: string;
  oauthStateSecret?: string;
};

type StripeAccountRecord = {
  id: string;
  stripe_account_id: string;
  account_type?: StripeConnectAccountType;
  connection_method?: StripeConnectConnectionMethod;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  connected_at?: Date | string | null;
  disconnected_at?: Date | string | null;
};

export type ConnectedStripeAccount = {
  stripe_account_id: string;
  account_type: StripeConnectAccountType;
  connection_method: StripeConnectConnectionMethod;
};

type RegisterConnectedStripeAccountInput = {
  stripeAccountId: string;
  accountType?: StripeConnectAccountType;
  connectionMethod?: StripeConnectConnectionMethod;
};

type StripeConnectOAuthStatePayload = {
  nonce: string;
  ts: number;
  returnTo?: string;
};

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

class StripeConnectAccountModuleService extends MedusaService({
  StripeAccount,
}) {
  protected options_: StripeConnectAccountModuleOptions;
  private stripe_: Stripe | null = null;

  constructor(container: unknown, options?: StripeConnectAccountModuleOptions) {
    super(container, options);
    this.options_ = options ?? {};
    const apiKey = this.options_.stripeApiKey;
    if (apiKey) {
      this.stripe_ = new Stripe(apiKey);
    }
  }

  private getStripe(): Stripe {
    if (!this.stripe_) {
      throw new Error(
        "Stripe Connect Account module requires stripeApiKey option.",
      );
    }
    return this.stripe_;
  }

  private getAdminUrl(): string {
    const url =
      this.options_.adminUrl ||
      process.env.MEDUSA_ADMIN_URL ||
      process.env.ADMIN_BACKEND_URL;
    if (!url) {
      throw new Error(
        "Stripe Connect Account module requires adminUrl option or MEDUSA_ADMIN_URL or ADMIN_BACKEND_URL env.",
      );
    }
    return url.replace(/\/$/, "");
  }

  async getAdminStoreSettingsUrl(params?: Record<string, string>): Promise<string> {
    let baseUrl = this.getAdminUrl();
    baseUrl = baseUrl.replace(/\/$/, "");
    const storeSettingsPath = "/settings/store";
    const pathWithApp = baseUrl.endsWith("/app")
      ? `${baseUrl}${storeSettingsPath}`
      : `${baseUrl}/app${storeSettingsPath}`;
    const url = new URL(pathWithApp);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private getConnectClientId(): string {
    const clientId =
      this.options_.connectClientId || process.env.STRIPE_CONNECT_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        "Stripe Connect OAuth requires STRIPE_CONNECT_CLIENT_ID.",
      );
    }
    return clientId;
  }

  private getOAuthRedirectUri(): string {
    const redirectUri =
      this.options_.oauthRedirectUri ||
      process.env.STRIPE_CONNECT_OAUTH_REDIRECT_URI;
    if (!redirectUri) {
      throw new Error(
        "Stripe Connect OAuth requires STRIPE_CONNECT_OAUTH_REDIRECT_URI.",
      );
    }
    return redirectUri;
  }

  private getOAuthStateSecret(): string {
    const secret =
      this.options_.oauthStateSecret ||
      process.env.STRIPE_CONNECT_STATE_SECRET ||
      process.env.COOKIE_SECRET ||
      process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        "Stripe Connect OAuth requires STRIPE_CONNECT_STATE_SECRET, COOKIE_SECRET, or JWT_SECRET.",
      );
    }
    return secret;
  }

  private buildOAuthState(payload: StripeConnectOAuthStatePayload): string {
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url",
    );
    const signature = crypto
      .createHmac("sha256", this.getOAuthStateSecret())
      .update(body)
      .digest("base64url");
    return `${body}.${signature}`;
  }

  private parseAndVerifyOAuthState(
    state: string,
  ): StripeConnectOAuthStatePayload {
    const [body, signature] = state.split(".");
    if (!body || !signature) {
      throw new Error("Invalid Stripe Connect OAuth state format.");
    }

    const expected = crypto
      .createHmac("sha256", this.getOAuthStateSecret())
      .update(body)
      .digest("base64url");
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new Error("Invalid Stripe Connect OAuth state signature.");
    }

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as StripeConnectOAuthStatePayload;

    if (!payload.nonce || typeof payload.ts !== "number") {
      throw new Error("Malformed Stripe Connect OAuth state payload.");
    }

    if (Date.now() - payload.ts > OAUTH_STATE_MAX_AGE_MS) {
      throw new Error("Expired Stripe Connect OAuth state.");
    }

    return payload;
  }

  private getAccountTypeFromStripeAccount(
    account: Stripe.Account,
  ): StripeConnectAccountType {
    if (account.type === "standard" || account.type === "express") {
      return account.type;
    }

    throw new Error(
      `Unsupported Stripe Connect account type for ${account.id}: ${account.type}`,
    );
  }

  private getAccountStatusSnapshot(account: Stripe.Account): {
    account_type: StripeConnectAccountType;
    details_submitted: boolean;
    charges_enabled: boolean;
    payouts_enabled: boolean;
  } {
    return {
      account_type: this.getAccountTypeFromStripeAccount(account),
      details_submitted: account.details_submitted ?? false,
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
    };
  }

  /**
   * Creates a Stripe Express account (or reuses existing DB row) and returns the DB record.
   * Business name and email are optional prefill — Stripe handles KYC during Express onboarding.
   */
  async getOrCreateStripeAccount(
    businessName?: string,
    email?: string,
    country?: string,
  ): Promise<{ id: string; stripe_account_id: string }> {
    const stripe = this.getStripe();
    const [existing] = (await this.listStripeAccounts(
      {},
      { take: 1 },
    )) as StripeAccountRecord[];
    if (existing) {
      return {
        id: existing.id,
        stripe_account_id: existing.stripe_account_id,
      };
    }

    const accountParams: Stripe.AccountCreateParams = {
      type: "express",
      country: country || "US",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    };
    if (businessName || email) {
      accountParams.business_profile = {};
      if (businessName) accountParams.business_profile.name = businessName;
      if (email) accountParams.email = email;
    }

    const account = await stripe.accounts.create(accountParams);
    const status = this.getAccountStatusSnapshot(account);

    const created = await this.createStripeAccounts({
      stripe_account_id: account.id,
      account_type: "express",
      connection_method: "platform_onboarding",
      details_submitted: status.details_submitted,
      charges_enabled: status.charges_enabled,
      payouts_enabled: status.payouts_enabled,
      connected_at: new Date(),
      disconnected_at: null,
    });

    const record = Array.isArray(created) ? created[0] : created;
    return {
      id: record.id,
      stripe_account_id: record.stripe_account_id,
    };
  }

  /**
   * Returns a Stripe Account Link for hosted onboarding (refresh_url and return_url point to admin).
   * Ensures /app is in the path so redirect lands on the Medusa admin UI, not the backend root.
   */
  async getAccountLink(stripeAccountId: string): Promise<{ url: string }> {
    const stripe = this.getStripe();
    const returnUrl = await this.getAdminStoreSettingsUrl();
    const refreshUrl = returnUrl;

    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return { url: link.url };
  }

  /**
   * Builds a Stripe OAuth URL for chefs connecting an existing Standard account.
   */
  async getStandardAccountOAuthUrl(): Promise<{ url: string }> {
    const returnTo = await this.getAdminStoreSettingsUrl();
    const state = this.buildOAuthState({
      nonce: crypto.randomBytes(16).toString("hex"),
      ts: Date.now(),
      returnTo,
    });

    const url = new URL("https://connect.stripe.com/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.getConnectClientId());
    url.searchParams.set("scope", "read_write");
    url.searchParams.set("redirect_uri", this.getOAuthRedirectUri());
    url.searchParams.set("state", state);

    return { url: url.toString() };
  }

  /**
   * Exchanges an OAuth code for a connected Standard account and persists it.
   */
  async completeStandardAccountOAuth(input: {
    code: string;
    state: string;
  }): Promise<{ id: string; stripe_account_id: string; return_to: string }> {
    const statePayload = this.parseAndVerifyOAuthState(input.state);
    const stripe = this.getStripe();
    const token = await stripe.oauth.token({
      grant_type: "authorization_code",
      code: input.code,
    });

    if (!token.stripe_user_id) {
      throw new Error("Stripe OAuth token response did not include account id.");
    }

    const account = await this.registerConnectedStripeAccount({
      stripeAccountId: token.stripe_user_id,
      accountType: "standard",
      connectionMethod: "oauth",
    });

    return {
      ...account,
      return_to: statePayload.returnTo || (await this.getAdminStoreSettingsUrl()),
    };
  }

  /**
   * Registers an already-connected Stripe account. Future Standard OAuth routes
   * should call this after exchanging the OAuth code and receiving stripe_user_id.
   */
  async registerConnectedStripeAccount(
    input: RegisterConnectedStripeAccountInput,
  ): Promise<{ id: string; stripe_account_id: string }> {
    const stripe = this.getStripe();
    const stripeAccountId = input.stripeAccountId;
    const account = await stripe.accounts.retrieve(stripeAccountId);
    const status = this.getAccountStatusSnapshot(account);
    const accountType = input.accountType ?? status.account_type;
    const connectionMethod =
      input.connectionMethod ??
      (accountType === "standard" ? "oauth" : "platform_onboarding");

    const [existingByStripeId] = (await this.listStripeAccounts({
      stripe_account_id: stripeAccountId,
    })) as StripeAccountRecord[];

    if (existingByStripeId) {
      const updated = await this.updateStripeAccounts({
        id: existingByStripeId.id,
        stripe_account_id: stripeAccountId,
        account_type: accountType,
        connection_method: connectionMethod,
        details_submitted: status.details_submitted,
        charges_enabled: status.charges_enabled,
        payouts_enabled: status.payouts_enabled,
        disconnected_at: null,
      });
      const record = Array.isArray(updated) ? updated[0] : updated;
      return {
        id: record.id,
        stripe_account_id: record.stripe_account_id,
      };
    }

    const [existing] = (await this.listStripeAccounts(
      {},
      { take: 1 },
    )) as StripeAccountRecord[];

    if (existing) {
      const updated = await this.updateStripeAccounts({
        id: existing.id,
        stripe_account_id: stripeAccountId,
        account_type: accountType,
        connection_method: connectionMethod,
        details_submitted: status.details_submitted,
        charges_enabled: status.charges_enabled,
        payouts_enabled: status.payouts_enabled,
        connected_at: new Date(),
        disconnected_at: null,
      });
      const record = Array.isArray(updated) ? updated[0] : updated;
      return {
        id: record.id,
        stripe_account_id: record.stripe_account_id,
      };
    }

    const created = await this.createStripeAccounts({
      stripe_account_id: stripeAccountId,
      account_type: accountType,
      connection_method: connectionMethod,
      details_submitted: status.details_submitted,
      charges_enabled: status.charges_enabled,
      payouts_enabled: status.payouts_enabled,
      connected_at: new Date(),
      disconnected_at: null,
    });

    const record = Array.isArray(created) ? created[0] : created;
    return {
      id: record.id,
      stripe_account_id: record.stripe_account_id,
    };
  }

  /**
   * Fetches account from Stripe and updates the DB row (details_submitted, charges_enabled).
   */
  async syncAccountStatus(stripeAccountId: string): Promise<void> {
    const stripe = this.getStripe();
    const account = await stripe.accounts.retrieve(stripeAccountId);
    const status = this.getAccountStatusSnapshot(account);

    const [existing] = (await this.listStripeAccounts({
      stripe_account_id: stripeAccountId,
    })) as StripeAccountRecord[];
    if (existing) {
      await this.updateStripeAccounts({
        id: existing.id,
        account_type: existing.account_type ?? status.account_type,
        details_submitted: status.details_submitted,
        charges_enabled: status.charges_enabled,
        payouts_enabled: status.payouts_enabled,
      });
    }
  }

  /**
   * Marks a connected account inactive after Stripe sends account.application.deauthorized.
   */
  async markStripeAccountDisconnected(stripeAccountId: string): Promise<void> {
    const [existing] = (await this.listStripeAccounts({
      stripe_account_id: stripeAccountId,
    })) as StripeAccountRecord[];

    if (!existing) {
      return;
    }

    await this.updateStripeAccounts({
      id: existing.id,
      charges_enabled: false,
      payouts_enabled: false,
      disconnected_at: new Date(),
    });
  }

  /**
   * Fetches the Stripe API account object for admin display (e.g. business_profile, payouts_enabled).
   * Named to avoid collision with MedusaService-generated retrieveStripeAccount (DB by id).
   */
  async fetchStripeAccountFromStripe(
    stripeAccountId: string,
  ): Promise<Stripe.Account | null> {
    try {
      const stripe = this.getStripe();
      return await stripe.accounts.retrieve(stripeAccountId);
    } catch {
      return null;
    }
  }

  /**
   * Returns the active connected account only when charges are enabled and the account is not disconnected.
   */
  async getConnectedAccount(): Promise<ConnectedStripeAccount | null> {
    const records = (await this.listStripeAccounts(
      { charges_enabled: true },
      { take: 10 },
    )) as StripeAccountRecord[];
    const record = records.find((item) => !item.disconnected_at);
    if (!record) {
      return null;
    }

    return {
      stripe_account_id: record.stripe_account_id,
      account_type: record.account_type ?? "express",
      connection_method: record.connection_method ?? "platform_onboarding",
    };
  }

  /**
   * Returns the active connected account id for legacy callers.
   */
  async getConnectedAccountId(): Promise<string | null> {
    const account = await this.getConnectedAccount();
    return account?.stripe_account_id ?? null;
  }

  /**
   * Generates a single-use Express Dashboard login link for the connected account.
   * Only works for Express accounts with charges_enabled.
   */
  async createExpressDashboardLink(
    stripeAccountId: string,
  ): Promise<{ url: string }> {
    const stripe = this.getStripe();
    const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
    return { url: loginLink.url };
  }
}

export default StripeConnectAccountModuleService;
