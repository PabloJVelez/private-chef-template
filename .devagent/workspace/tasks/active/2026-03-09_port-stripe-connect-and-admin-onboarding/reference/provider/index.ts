/**
 * Stripe Connect Payment Provider Module
 */
import { ModuleProvider, Modules } from '@medusajs/framework/utils';
import StripeConnectProviderService from './service';

export default ModuleProvider(Modules.PAYMENT, {
  services: [StripeConnectProviderService],
});

