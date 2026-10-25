/* Browser-only errors are handled locally; do not import backend Medusa errors. */
/* eslint-disable @medusajs/use-medusa-error-not-generic-error */
import type { CalendarResult } from './AvailabilityCalendar';

/** Component-scoped discovery cache; selected-date availability is always fetched separately. */
export class CalendarCache {
  private values = new Map<string, { at: number; value: CalendarResult }>();
  private pending = new Map<string, Promise<CalendarResult>>();
  private controllers = new Set<AbortController>();
  private generation = 0;
  peek(experience: string, month: string) {
    const entry = this.values.get(`${experience}:${month}`);
    return entry && Date.now() - entry.at < 60000 ? entry.value : null;
  }
  clear() {
    this.generation++;
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
    this.pending.clear();
    this.values.clear();
  }
  load(experience: string, month: string): Promise<CalendarResult> {
    const cached = this.peek(experience, month);
    if (cached) return Promise.resolve(cached);
    const key = `${experience}:${month}`;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const controller = new AbortController();
    const generation = this.generation;
    this.controllers.add(controller);
    const params = new URLSearchParams({ experience_id: experience });
    if (month) params.set('month', month);
    const promise = fetch(`/api/availability-calendar?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Calendar unavailable');
        const value: CalendarResult = await response.json();
        if (value.experienceId !== experience || (month && value.month !== month) || controller.signal.aborted)
          throw new Error('Calendar context changed');
        if (generation !== this.generation) throw new Error('Calendar refreshed');
        const entry = { at: Date.now(), value };
        this.values.set(key, entry);
        this.values.set(`${experience}:${value.month}`, entry);
        return value;
      })
      .finally(() => {
        this.controllers.delete(controller);
        if (this.pending.get(key) === promise) this.pending.delete(key);
      });
    this.pending.set(key, promise);
    return promise;
  }
}
