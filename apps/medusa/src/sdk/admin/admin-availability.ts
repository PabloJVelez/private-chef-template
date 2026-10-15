import type { Client } from '@medusajs/js-sdk';
import type { Settings } from '../../lib/availability/slots';
export class AdminAvailabilityResource {
  constructor(private client: Client) {}
  get() {
    return this.client.fetch<{ settings: Settings | null }>('/admin/availability');
  }
  save(settings: Settings) {
    return this.client.fetch('/admin/availability', { method: 'POST', body: settings });
  }
}
