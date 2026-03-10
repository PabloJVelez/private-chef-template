/**
 * Stripe Connect Payment Provider
 *
 * When USE_STRIPE_CONNECT is true: destination charges with application_fee_amount
 * and transfer_data.destination. When false: standard PaymentIntent (no Connect).
 */
import Stripe from 'stripe';
import {
  AbstractPaymentProvider,
  MedusaError,
  PaymentSessionStatus,
  BigNumber,
} from '@medusajs/framework/utils';
import type {
  Logger,
  ICartModuleService,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  ProviderWebhookPayload,
  WebhookActionResult,
} from '@medusajs/framework/types';
import type {
  StripeConnectProviderOptions,
  StripeConnectConfig,
  StripeConnectPaymentData,
  PlatformFeeLineItem,
} from './types';
import { getSmallestUnit } from './utils/get-smallest-unit';
import { getPlatformFeeConfigFromEnv } from './utils/get-fee-config';
import { calculatePlatformFeeFromLines } from './utils/platform-fee';

interface StripeConnectAccountService {
  getConnectedAccountId(): Promise<string | null>;
}

type InjectedDependencies = {
  logger: Logger;
  stripeConnectAccountModuleService?: StripeConnectAccountService;
  cart?: ICartModuleService;
};

const NO_ACCOUNT_MESSAGE =
  'Stripe Connect is enabled but no account has been onboarded. Complete onboarding in the admin first.';

class StripeConnectProviderService extends AbstractPaymentProvider<StripeConnectProviderOptions> {
  static identifier = 'stripe-connect';

  protected config_: StripeConnectConfig;
  protected logger_: Logger;
  protected stripe_: Stripe;
  protected stripeConnectAccountService_?: StripeConnectAccountService;
  private cartModuleService_?: ICartModuleService;
  private static readonly LOG_PREFIX = '[stripe-connect]';

  constructor(
    { logger, stripeConnectAccountModuleService, cart }: InjectedDependencies,
    options: StripeConnectProviderOptions,
  ) {
    super({ logger, stripeConnectAccountModuleService, cart }, options);
    this.cartModuleService_ = cart;

    if (!options.apiKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        'Stripe API key is required for stripe-connect provider',
      );
    }

    const useStripeConnect = options.useStripeConnect === true;
    const envAccountId = options.connectedAccountId || '';
    if (envAccountId && !envAccountId.startsWith('acct_')) {
      logger.warn(
        `${StripeConnectProviderService.LOG_PREFIX} Invalid connected account ID format (env). Must start with "acct_".`,
      );
    }

    this.stripeConnectAccountService_ = stripeConnectAccountModuleService;
    const feeConfig = getPlatformFeeConfigFromEnv();
    this.config_ = {
      apiKey: options.apiKey,
      useStripeConnect,
      connectedAccountId: useStripeConnect && envAccountId.startsWith('acct_') ? envAccountId : '',
      refundApplicationFee: options.refundApplicationFee ?? false,
      passStripeFeeToChef: options.passStripeFeeToChef ?? false,
      stripeFeePercent: options.stripeFeePercent ?? 2.9,
      stripeFeeFlatCents: options.stripeFeeFlatCents ?? 30,
      webhookSecret: options.webhookSecret,
      automaticPaymentMethods: options.automaticPaymentMethods ?? true,
      captureMethod: options.captureMethod ?? 'automatic',
      ...feeConfig,
    };

    this.logger_ = logger;
    this.stripe_ = new Stripe(this.config_.apiKey);

    if (this.config_.useStripeConnect) {
      this.logger_.info(
        `${StripeConnectProviderService.LOG_PREFIX} Connect enabled (account from DB or env), fee ${this.config_.feePercent}%`,
      );
    }
    this.logger_.info(
      `${StripeConnectProviderService.LOG_PREFIX} [fee] config: feePerUnitBased=${this.config_.feePerUnitBased} feeModeTickets=${this.config_.feeModeTickets} feePerTicketCents=${this.config_.feePerTicketCents} feeModeBento=${this.config_.feeModeBento} feePerBoxCents=${this.config_.feePerBoxCents} feePercentTickets=${this.config_.feePercentTickets} feePercentBento=${this.config_.feePercentBento}`,
    );
    if (!this.config_.useStripeConnect) {
      this.logger_.info(
        `${StripeConnectProviderService.LOG_PREFIX} Standard Stripe mode (Connect not enabled).`,
      );
    }
  }

  private isConnectEnabled(): boolean {
    return this.config_.useStripeConnect;
  }

  private async getConnectedAccountId(): Promise<string | null> {
    if (!this.config_.useStripeConnect) return null;
    if (this.config_.connectedAccountId) return this.config_.connectedAccountId;

    if (!this.stripeConnectAccountService_) {
      this.logger_.warn(
        `${StripeConnectProviderService.LOG_PREFIX} stripeConnectAccountModuleService not available — add it to the payment module's dependencies in medusa-config.ts.`,
      );
      return null;
    }

    try {
      return await this.stripeConnectAccountService_.getConnectedAccountId();
    } catch (e) {
      this.logger_.warn(
        `${StripeConnectProviderService.LOG_PREFIX} Failed to resolve connected account: ${(e as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Resolves cart to line items with sku, quantity, unit_price_cents via cart module.
   * Returns [] if cart module is unavailable or cart has no items. Used for per-line platform fee.
   */
  private async getCartLines(cartId: string): Promise<PlatformFeeLineItem[]> {
    if (!this.cartModuleService_) {
      this.logger_.warn(
        `${StripeConnectProviderService.LOG_PREFIX} [fee] getCartLines: no cartModuleService, returning []`,
      );
      return [];
    }
    try {
      const items = await this.cartModuleService_.listLineItems(
        { cart_id: cartId },
        { take: 500 },
      );
      this.logger_.info(
        `${StripeConnectProviderService.LOG_PREFIX} [fee] getCartLines(cartId=${cartId}) raw items=${items.length}`,
      );
      return items.map((item) => ({
        sku: item.variant_sku ?? '',
        quantity: Number(item.quantity) || 0,
        unit_price_cents: Math.round(Number(item.unit_price) || 0),
      }));
    } catch (e) {
      this.logger_.warn(
        `${StripeConnectProviderService.LOG_PREFIX} getCartLines failed: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  private calculateApplicationFee(amount: number): number {
    if (this.config_.feePercent <= 0) {
      return 0;
    }

    const baseFee = Math.round(amount * (this.config_.feePercent / 100));

    if (!this.config_.passStripeFeeToChef) {
      return baseFee;
    }

    const estimatedStripeFee =
      Math.round(amount * (this.config_.stripeFeePercent / 100)) +
      this.config_.stripeFeeFlatCents;

    return baseFee + estimatedStripeFee;
  }

  private mapStripeStatus(
    stripeStatus: Stripe.PaymentIntent.Status,
  ): PaymentSessionStatus {
    switch (stripeStatus) {
      case 'succeeded':
        return PaymentSessionStatus.CAPTURED;
      case 'processing':
        return PaymentSessionStatus.PENDING;
      case 'requires_capture':
        return PaymentSessionStatus.AUTHORIZED;
      case 'requires_action':
      case 'requires_confirmation':
      case 'requires_payment_method':
        return PaymentSessionStatus.REQUIRES_MORE;
      case 'canceled':
        return PaymentSessionStatus.CANCELED;
      default:
        return PaymentSessionStatus.PENDING;
    }
  }

  private getPaymentIntentId(data?: Record<string, unknown>): string | undefined {
    if (!data) return undefined;
    return data.id as string | undefined;
  }

  async initiatePayment(
    input: InitiatePaymentInput,
  ): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context, data: inputData } = input;
    const amountInCents = getSmallestUnit(
      amount as unknown as number,
      currency_code,
    );

    const dataObj = inputData as Record<string, unknown> | undefined;
    const ctx = context as Record<string, unknown> | undefined;
    const cartIdFromData = typeof dataObj?.cart_id === 'string' ? dataObj.cart_id : undefined;
    const cartIdFromContext = (ctx?.cart_id ?? ctx?.resource_id) as string | undefined;
    const cartId = cartIdFromData ?? cartIdFromContext;

    let applicationFeeAmount: number;
    if (!this.config_.feePerUnitBased) {
      applicationFeeAmount = this.calculateApplicationFee(amountInCents);
      this.logger_.info(
        `${StripeConnectProviderService.LOG_PREFIX} [fee] mode=per_cart amount=${amountInCents} cents → application_fee=${applicationFeeAmount} (${this.config_.feePercent}% of cart)`,
      );
    } else {
      this.logger_.info(
        `${StripeConnectProviderService.LOG_PREFIX} [fee] mode=per_unit cart_id=${cartId ?? 'none'} (from data=${!!cartIdFromData} context_keys=${ctx ? Object.keys(ctx).join(',') : 'none'})`,
      );
      if (cartId and typeof cartId === 'string') {
        try {
          const lines = await this.getCartLines(cartId);
          this.logger_.info(
            `${StripeConnectProviderService.LOG_PREFIX} [fee] cart lines count=${lines.length} items=${JSON.stringify(lines.map((l) => ({ sku: l.sku, qty: l.quantity, unit_cents: l.unit_price_cents })))}`,
          );
          if (lines.length > 0) {
            applicationFeeAmount = calculatePlatformFeeFromLines(
              lines,
              this.config_,
            );
            this.logger_.info(
              `${StripeConnectProviderService.LOG_PREFIX} [fee] platform fee from lines=${applicationFeeAmount} cents`,
            );
          } else {
            applicationFeeAmount = this.calculateApplicationFee(amountInCents);
            this.logger_.info(
              `${StripeConnectProviderService.LOG_PREFIX} [fee] no cart lines, fallback to cart % → application_fee=${applicationFeeAmount}`,
            );
          }
        } catch (e) {
          this.logger_.warn(
            `${StripeConnectProviderService.LOG_PREFIX} Could not resolve cart lines for per-line fee, using percentage of total: ${(e as Error).message}`,
          );
          applicationFeeAmount = this.calculateApplicationFee(amountInCents);
        }
      } else {
        applicationFeeAmount = this.calculateApplicationFee(amountInCents);
        this.logger_.info(
          `${StripeConnectProviderService.LOG_PREFIX} [fee] no cart_id in context/data, fallback to cart % → application_fee=${applicationFeeAmount}`,
        );
      }
    }

    try {
      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: amountInCents,
        currency: currency_code.toLowerCase(),
        capture_method: this.config_.captureMethod,
        metadata: {
          ...(context and {
            session_id: String(
              (context as Record<string, unknown>).session_id or '',
            ),
            resource_id: String(
              (context as Record<string, unknown>).resource_id or '',
            ),
          }),
        },
      };

      if (this.config_.automaticPaymentMethods) {
        paymentIntentParams.automatic_payment_methods = { enabled: true };
      }

      let connectedAccountId: string | null = null;
      if (this.isConnectEnabled()) {
        connectedAccountId = await this.getConnectedAccountId();
        if (!connectedAccountId) {
          this.logger_.error(
            `${StripeConnectProviderService.LOG_PREFIX} ${NO_ACCOUNT_MESSAGE}`,
          );
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            NO_ACCOUNT_MESSAGE,
          );
        }
        paymentIntentParams.on_behalf_of = connectedAccountId;
        paymentIntentParams.transfer_data = {
          destination: connectedAccountId,
        };
        if (applicationFeeAmount > 0) {
          paymentIntentParams.application_fee_amount = applicationFeeAmount;
        }
      }

      const paymentIntent =
        await this.stripe_.paymentIntents.create(paymentIntentParams);

      this.logger_.info(
        `${StripeConnectProviderService.LOG_PREFIX} Created PaymentIntent ${paymentIntent.id}: amount=${amountInCents} ${currency_code}` +
          (this.isConnectEnabled()
            ? ` application_fee_amount=${applicationFeeAmount}`
            : ''),
      );

      const paymentData: StripeConnectPaymentData = {
        id: paymentIntent.id,
        client_secret: paymentIntent.client_secret or undefined,
        status: paymentIntent.status,
        amount: amountInCents,
        currency: currency_code.toLowerCase(),
        connected_account_id: connectedAccountId ?? undefined,
        application_fee_amount: this.isConnectEnabled()
          ? applicationFeeAmount
          : undefined,
      };

      return {
        id: paymentIntent.id,
        data: paymentData as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      this.logger_.error(
        `${StripeConnectProviderService.LOG_PREFIX} Failed to create PaymentIntent: ${stripeError.message}` +
          (stripeError.code ? ` (code: ${stripeError.code})` : '') +
          (stripeError.param ? ` (param: ${stripeError.param})` : ''),
      );

      if (
        stripeError.code === 'account_invalid' ||
        stripeError.param === 'transfer_data[destination]'
      ) {
        this.logger_.error(
          `${StripeConnectProviderService.LOG_PREFIX} Connected account "${this.config_.connectedAccountId}" is invalid or not onboarded.`,
        );
      }

      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Failed to initiate payment: ${stripeError.message}`,
      );
    }
  }

  // ... rest of service unchanged from sibling project ...
}

export default StripeConnectProviderService;

