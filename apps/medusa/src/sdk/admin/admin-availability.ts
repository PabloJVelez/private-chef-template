import type { Client } from '@medusajs/js-sdk';
import type { NoticeRule, Settings } from '../../lib/availability/slots';
export class AdminAvailabilityResource {
  constructor(private client: Client) {}
  get() {
    return this.client.fetch<{ settings: Settings | null; initial_notice_rules?: NoticeRule[] }>('/admin/availability');
  }
  save(settings: Settings) {
    return this.client.fetch<{ settings: Settings }>('/admin/availability', { method: 'POST', body: settings });
  }
}
