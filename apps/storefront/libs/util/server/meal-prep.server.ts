import { baseMedusaConfig } from './client.server';
import { parseMealPrep, type MealPrepRead } from '@libs/meal-prep';

// Request-scoped deduplication only. Never cache across customer reads or saves.
const reads = new WeakMap<Request, Promise<MealPrepRead>>();
export function readMealPrep(request: Request): Promise<MealPrepRead> {
  const existing = reads.get(request);
  if (existing) return existing;
  const read = (async (): Promise<MealPrepRead> => {
    try {
      const response = await fetch(`${baseMedusaConfig.baseUrl}/store/meal-prep`, {
        cache: 'no-store',
        headers: { 'x-publishable-api-key': baseMedusaConfig.publishableKey || '' },
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return { ok: false };
      return { ok: true, discovery: parseMealPrep(await response.json()) };
    } catch {
      return { ok: false };
    }
  })();
  reads.set(request, read);
  return read;
}
