import type { Client } from '@medusajs/js-sdk';
import type { NoticeRule, Settings } from '../../lib/availability/slots';
export type MealPrepWorkReview = {
  blocks: { id: string; purpose: string; start: string; end: string; linked_occurrences: number }[];
  order_serving_totals: null;
};
export class AdminAvailabilityResource {
  constructor(private client: Client) {}
  get() {
    return this.client.fetch<{ settings: Settings | null; initial_notice_rules?: NoticeRule[] }>('/admin/availability');
  }
  workReview(query: { start: string; end: string }) {
    return this.client.fetch<MealPrepWorkReview>('/admin/availability/meal-prep-review', { query });
  }
  save(settings: Settings) {
    return this.client.fetch<{ settings: Settings }>('/admin/availability', { method: 'POST', body: settings });
  }
}
