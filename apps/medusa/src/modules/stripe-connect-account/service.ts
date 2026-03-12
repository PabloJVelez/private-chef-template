/**
 * Stripe Connect Account Module Service
 * Manages the single connected Stripe account (Custom) and Account Link flow.
 */
import Stripe from "stripe";
import { MedusaService } from "@medusajs/framework/utils";
import StripeAccount from "./models/stripe-account";

export type StripeConnectAccountModuleOptions = {
  stripeApiKey?: string;
  adminUrl?: string;
};

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

  /**
   * Creates a Stripe Custom account (or reuses existing DB row) and returns the DB record.
   */
  async getOrCreateStripeAccount(
    businessName?: string,
    email?: string,
    country?: string,
  ): Promise<{ id: string; stripe_account_id: string }> {
    const stripe = this.getStripe();
    const [existing] = await this.listStripeAccounts({}, { take: 1 });
    if (existing) {
      return {
        id: existing.id,
        stripe_account_id: existing.stripe_account_id,
      };
    }

    const accountParams: Stripe.AccountCreateParams = {
      type: "custom",
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

    const created = await this.createStripeAccounts({
      stripe_account_id: account.id,
      details_submitted: account.details_submitted ?? false,
      charges_enabled: account.charges_enabled ?? false,
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
    let baseUrl = this.getAdminUrl();
    baseUrl = baseUrl.replace(/\/$/, "");
    const storeSettingsPath = "/settings/store";
    const pathWithApp = baseUrl.endsWith("/app")
      ? `${baseUrl}${storeSettingsPath}`
      : `${baseUrl}/app${storeSettingsPath}`;
    const returnUrl = pathWithApp;
    const refreshUrl = pathWithApp;

    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return { url: link.url };
  }

  /**
   * Fetches account from Stripe and updates the DB row (details_submitted, charges_enabled).
   */
  async syncAccountStatus(stripeAccountId: string): Promise<void> {
    const stripe = this.getStripe();
    const account = await stripe.accounts.retrieve(stripeAccountId);

    const [existing] = await this.listStripeAccounts({
      stripe_account_id: stripeAccountId,
    });
    if (existing) {
      await this.updateStripeAccounts({
        id: existing.id,
        details_submitted: account.details_submitted ?? false,
        charges_enabled: account.charges_enabled ?? false,
      });
    }
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
   * Returns the connected account id only when charges_enabled is true; otherwise null.
   */
  async getConnectedAccountId(): Promise<string | null> {
    const [record] = await this.listStripeAccounts(
      { charges_enabled: true },
      { take: 1 },
    );
    return record ? record.stripe_account_id : null;
  }
}

export default StripeConnectAccountModuleService;

