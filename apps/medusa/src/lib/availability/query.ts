import type { MedusaContainer } from '@medusajs/framework/types';
import { MedusaError } from '@medusajs/framework/utils';
import { DateTime } from 'luxon';
import AvailabilityModuleService from '../../modules/availability/service';
import ChefEventModuleService from '../../modules/chef-event/service';
import ExperienceTypeModuleService from '../../modules/experience-type/service';
import GoogleCalendarConnectionModuleService from '../../modules/google-calendar-connection/service';
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from '../../modules/google-calendar-connection';
import { EXPERIENCE_TYPE_MODULE } from '../../modules/experience-type';
import { CHEF_EVENT_MODULE } from '../../modules/chef-event';
import { advanceNoticeDays, availabilitySettingsSchema, calculateSlots, overlaps, type Interval } from './slots';
import { googleBusy } from './google-busy';

/** Bound advisory reads below storefront proxy timeouts, including token refresh and pagination. */
async function advisoryGoogleRead(read: () => Promise<Interval[]>): Promise<Interval[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<Interval[]>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Google availability deadline exceeded.')), 8000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadSchedule(container: MedusaContainer, experienceId: string) {
  const [raw] = await container
    .resolve<AvailabilityModuleService>('availability')
    .listAvailabilitySettings({ id: 'chef-default' });
  if (!raw)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'Availability has not been configured. Please contact the chef.',
    );
  const settings = availabilitySettingsSchema.parse(raw);
  const experience = await container
    .resolve<ExperienceTypeModuleService>(EXPERIENCE_TYPE_MODULE)
    .retrieveExperienceType(experienceId);
  if (!experience.is_active) throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Experience is not available.');
  const now = DateTime.utc();
  const today = now.setZone(settings.timezone).startOf('day');
  return {
    settings,
    experience,
    now,
    minDate: today
      .plus({ days: advanceNoticeDays(settings, experience) })
      .toISODate()!,
    maxDate: today.plus({ months: 6 }).toISODate()!,
  };
}

/** Reuse one internal-booking read and one paginated Google lookup for a bounded set of days. */
async function calculateDates(
  container: MedusaContainer,
  schedule: Awaited<ReturnType<typeof loadSchedule>>,
  dates: string[],
  ignoreEventId?: string,
) {
  const { settings, experience, now } = schedule;
  const candidates = dates.map((date) => ({ date, slots: calculateSlots(date, settings, experience, [], now) }));
  if (!candidates.some((day) => day.slots.length)) return candidates;
  const chef = container.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
  const busy: Interval[] = [];
  const pending = new Set<string>();
  for (let skip = 0; ; skip += 250) {
    const events = await chef.listChefEvents({}, { skip, take: 250 });
    for (const event of events) {
      if (event.status === 'pending' && !event.acceptanceToken) pending.add(event.id);
      if (
        event.id !== ignoreEventId &&
        (event.status === 'confirmed' || event.status === 'completed' || event.acceptanceToken)
      ) {
        if (!event.occupiedStart || !event.occupiedEnd)
          throw new Error('An existing booking needs an availability backfill.');
        busy.push({
          start: new Date(event.occupiedStart).toISOString(),
          end: new Date(event.occupiedEnd).toISOString(),
        });
      }
    }
    if (events.length < 250) break;
  }
  if (settings.google_mode === 'required') {
    // Google is advisory: failures never remove internal booking protection or
    // prevent a request. Only add Google conflicts after a complete lookup.
    try {
      const conflicts = await advisoryGoogleRead(async () => {
        const google = container.resolve<GoogleCalendarConnectionModuleService>(GOOGLE_CALENDAR_CONNECTION_MODULE);
        const connection = await google.getPrimaryConnection();
        if (connection) {
          const ignored = new Set<string>();
          for (let skip = 0; ; skip += 250) {
            const maps = await google.listGoogleCalendarSyncMaps({}, { skip, take: 250 });
            for (const map of maps)
              if (map.connectionId === connection?.id && pending.has(map.chefEventId)) ignored.add(map.googleEventId);
            if (maps.length < 250) break;
          }
          const first = DateTime.fromISO(dates[0], { zone: settings.timezone }).startOf('day');
          const last = DateTime.fromISO(dates[dates.length - 1], { zone: settings.timezone })
            .plus({ days: 1 })
            .startOf('day');
          return googleBusy(google, first.toUTC().toISO()!, last.toUTC().toISO()!, ignored);
        }
        return [];
      });
      busy.push(...conflicts);
    } catch {
      container.resolve('logger')?.warn('Google availability lookup unavailable; using internal bookings only.');
    }
  }
  return candidates.map(({ date, slots }) => ({
    date,
    slots: slots.filter(
      (slot) => !busy.some((interval) => overlaps({ start: slot.occupiedStart, end: slot.occupiedEnd }, interval)),
    ),
  }));
}

export async function availableSlots(
  container: MedusaContainer,
  date: string,
  experienceId: string,
  ignoreEventId?: string,
) {
  const schedule = await loadSchedule(container, experienceId);
  const [day] = await calculateDates(container, schedule, [date], ignoreEventId);
  return {
    timezone: schedule.settings.timezone,
    date,
    experienceId,
    minDate: schedule.minDate,
    maxDate: schedule.maxDate,
    slots: day.slots,
    experience: schedule.experience,
  };
}

export async function availableCalendar(container: MedusaContainer, experienceId: string, month?: string) {
  const schedule = await loadSchedule(container, experienceId);
  const selectedMonth = month || schedule.minDate.slice(0, 7);
  const first = DateTime.fromISO(`${selectedMonth}-01`, { zone: schedule.settings.timezone });
  if (!/^\d{4}-\d{2}$/.test(selectedMonth) || !first.isValid)
    throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Choose a valid month.');
  const dates = Array.from({ length: first.daysInMonth! }, (_, index) => first.plus({ days: index }).toISODate()!);
  const result = await calculateDates(container, schedule, dates);
  return {
    month: selectedMonth,
    experienceId,
    timezone: schedule.settings.timezone,
    minDate: schedule.minDate,
    maxDate: schedule.maxDate,
    dates: result.map(({ date, slots }) => ({ date, available: slots.length > 0 })),
  };
}

export async function requireSlot(
  container: MedusaContainer,
  date: string,
  experienceId: string,
  slotStart: string,
  ignoreEventId?: string,
) {
  const result = await availableSlots(container, date, experienceId, ignoreEventId);
  const slot = result.slots.find((s) => s.start === new Date(slotStart).toISOString());
  if (!slot)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'That arrival time is no longer available. Please choose another time.',
    );
  return { ...result, slot };
}
