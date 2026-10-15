import { DateTime } from 'luxon';
import type GoogleCalendarConnectionModuleService from '../../modules/google-calendar-connection/service';
import { ensureValidAccessToken } from '../google-calendar/tokens';
import type { Interval } from './slots';

export async function googleBusy(
  service: GoogleCalendarConnectionModuleService,
  start: string,
  end: string,
  ignoredPendingMirrorIds: Set<string>,
): Promise<Interval[]> {
  const connection = await service.getPrimaryConnection();
  if (!connection || connection.status !== 'active')
    throw new Error('Google Calendar is unavailable. Reconnect or resolve the sync error in Availability settings.');
  const token = await ensureValidAccessToken(connection as unknown as Record<string, unknown>, async (payload) => {
    await service.updateGoogleCalendarConnections({ id: connection.id, ...payload });
  });
  const busy: Interval[] = [];
  let pageToken: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId || 'primary')}/events`,
    );
    url.searchParams.set('timeMin', start);
    url.searchParams.set('timeMax', end);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403
          ? 'Google busy access denied. Reconnect Google Calendar in Availability settings.'
          : 'Google Calendar lookup failed. Please retry.',
      );
    const body = await response.json();
    if (!Array.isArray(body.items) || typeof body.timeZone !== 'string')
      throw new Error('Invalid Google Calendar response.');
    for (const event of body.items) {
      if (!event || typeof event.id !== 'string') throw new Error('Invalid Google event.');
      if (event.status === 'cancelled' || event.transparency === 'transparent' || ignoredPendingMirrorIds.has(event.id))
        continue;
      const parse = (value: { dateTime?: string; date?: string } | undefined) => {
        if (value?.dateTime) return DateTime.fromISO(value.dateTime, { setZone: true });
        if (value?.date) return DateTime.fromISO(value.date, { zone: body.timeZone });
        return DateTime.invalid('Missing event interval');
      };
      const from = parse(event.start),
        to = parse(event.end);
      if (!from.isValid || !to.isValid || to <= from) throw new Error('Invalid Google busy interval.');
      busy.push({ start: from.toUTC().toISO()!, end: to.toUTC().toISO()! });
    }
    if (!body.nextPageToken) return busy;
    if (typeof body.nextPageToken !== 'string' || seen.has(body.nextPageToken))
      throw new Error('Invalid Google pagination.');
    pageToken = body.nextPageToken;
    seen.add(body.nextPageToken);
  }
  throw new Error('Google Calendar lookup exceeded its page limit.');
}
