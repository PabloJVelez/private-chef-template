// apps/storefront/libs/util/server/client.server.ts
import { MedusaPluginsSDK } from '@lambdacurry/medusa-plugins-sdk';
import { buildNewLRUCache } from './cache-builder.server';
import { config } from './config.server';

// Order of preference:
// - INTERNAL_...   : private URL if you have one (same-region, no CDN)
// - PUBLIC_...     : public base URL (your onrender.com backend)
// - MEDUSA_BACKEND_URL : generic fallback
// - VITE_...       : if you happened to set it on the service too
// - localhost      : dev fallback only
const MEDUSA_BACKEND_URL =
  process.env.INTERNAL_MEDUSA_API_URL ??
  process.env.PUBLIC_MEDUSA_API_URL ??
  process.env.MEDUSA_BACKEND_URL ??
  process.env.VITE_MEDUSA_BACKEND_URL ??
  'http://localhost:9000';

export const baseMedusaConfig = {
  baseUrl: MEDUSA_BACKEND_URL.replace(/\/+$/, ''),
  debug: process.env.NODE_ENV === 'development',
  // NOTE: config should already read MEDUSA_PUBLISHABLE_KEY from env
  publishableKey: config.MEDUSA_PUBLISHABLE_KEY,
};

export const sdk = new MedusaPluginsSDK(baseMedusaConfig);
export const sdkCache = buildNewLRUCache({ max: 1000 });
