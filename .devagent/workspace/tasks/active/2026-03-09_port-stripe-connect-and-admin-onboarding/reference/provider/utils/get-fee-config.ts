/**
 * Platform fee configuration read from env (PLATFORM_FEE_*).
 * Used by the Stripe Connect provider so medusa-config only passes Connect options.
 */
import type { PlatformFeeMode } from '../types';

export interface PlatformFeeConfigFromEnv {
  feePercent: number;
  feePerUnitBased: boolean;
  feeModeTickets: PlatformFeeMode;
  feeModeBento: PlatformFeeMode;
  feePerTicketCents: number;
  feePerBoxCents: number;
  feePercentTickets: number;
  feePercentBento: number;
}

export function getPlatformFeeConfigFromEnv(): PlatformFeeConfigFromEnv {
  const feePercent = parseInt(process.env.PLATFORM_FEE_PERCENT || '5', 10);
  const feePerUnitBased = process.env.PLATFORM_FEE_PER_UNIT_BASED === 'true';
  const feeModeTickets = (process.env.PLATFORM_FEE_MODE_TICKETS || 'percent') as PlatformFeeMode;
  const feeModeBento = (process.env.PLATFORM_FEE_MODE_BENTO || 'percent') as PlatformFeeMode;
  const feePerTicketCents = parseInt(process.env.PLATFORM_FEE_PER_TICKET_CENTS || '0', 10);
  const feePerBoxCents = parseInt(process.env.PLATFORM_FEE_PER_BOX_CENTS || '0', 10);
  const feePercentTickets =
    process.env.PLATFORM_FEE_PERCENT_TICKETS != null
      ? parseInt(process.env.PLATFORM_FEE_PERCENT_TICKETS, 10)
      : feePercent;
  const feePercentBento =
    process.env.PLATFORM_FEE_PERCENT_BENTO != null
      ? parseInt(process.env.PLATFORM_FEE_PERCENT_BENTO, 10)
      : feePercent;

  return {
    feePercent,
    feePerUnitBased,
    feeModeTickets,
    feeModeBento,
    feePerTicketCents,
    feePerBoxCents,
    feePercentTickets,
    feePercentBento,
  };
}

