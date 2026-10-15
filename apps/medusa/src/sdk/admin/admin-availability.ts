import type { Client } from '@medusajs/js-sdk';
import type { Settings } from '../../lib/availability/slots';
export class AdminAvailabilityResource {
  constructor(private client: Client) {}
  get() {
    return this.client.fetch<{ settings: Settings | null }>('/admin/availability');
  }
  preview(date: string, experienceId: string) {
    return this.client.fetch<{
      timezone: string;
      date: string;
      experienceId: string;
      slots: { start: string; label: string }[];
    }>('/admin/availability/preview', { query: { date, experience_id: experienceId } });
  }
  save(settings: Settings) {
    return this.client.fetch<{ settings: Settings }>('/admin/availability', { method: 'POST', body: settings });
  }
}
