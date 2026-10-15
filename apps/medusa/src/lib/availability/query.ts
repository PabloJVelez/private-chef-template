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
import { availabilitySettingsSchema, calculateSlots, type Interval } from './slots';
import { googleBusy } from './google-busy';

export async function availableSlots(
  container: MedusaContainer,
  date: string,
  experienceId: string,
  ignoreEventId?: string,
) {
  const availability = container.resolve<AvailabilityModuleService>('availability');
  const [raw] = await availability.listAvailabilitySettings({ id: 'chef-default' });
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
  const chef = container.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
  const google = container.resolve<GoogleCalendarConnectionModuleService>(GOOGLE_CALENDAR_CONNECTION_MODULE);
  const busy: Interval[] = [];
  const candidateSlots = calculateSlots(date, settings, experience, []);

  const pending = new Set<string>();
  for (let skip = 0; ; skip += 250) {
    const events = await chef.listChefEvents({}, { skip, take: 250 });
    for (const e of events) {
      if (e.status === 'pending' && !e.acceptanceToken) pending.add(e.id);
      if (e.id !== ignoreEventId && (e.status === 'confirmed' || e.status === 'completed' || e.acceptanceToken)) {
        if (!e.occupiedStart || !e.occupiedEnd) throw new Error('An existing booking needs an availability backfill.');
        busy.push({ start: new Date(e.occupiedStart).toISOString(), end: new Date(e.occupiedEnd).toISOString() });
      }
    }
    if (events.length < 250) break;
  }
  if (settings.google_mode === 'required' && candidateSlots.length > 0) {
    const ignored = new Set<string>();
    const connection = await google.getPrimaryConnection();
    for (let skip = 0; ; skip += 250) {
      const maps = await google.listGoogleCalendarSyncMaps({}, { skip, take: 250 });
      for (const map of maps)
        if (map.connectionId === connection?.id && pending.has(map.chefEventId)) ignored.add(map.googleEventId);
      if (maps.length < 250) break;
    }
    const day = DateTime.fromISO(date, { zone: settings.timezone }).startOf('day');
    if (!day.isValid) throw new Error('Invalid availability date.');
    busy.push(...(await googleBusy(google, day.toUTC().toISO()!, day.plus({ days: 1 }).toUTC().toISO()!, ignored)));
  }
  const now = DateTime.utc();
  return {
    timezone: settings.timezone,
    date,
    experienceId,
    minDate: now
      .setZone(settings.timezone)
      .startOf('day')
      .plus({ days: experience.requires_advance_notice ? experience.advance_notice_days : 0 })
      .toISODate(),
    maxDate: now.setZone(settings.timezone).plus({ months: 6 }).toISODate(),
    slots: calculateSlots(date, settings, experience, busy, now),
    experience,
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
