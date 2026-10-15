import { defineRouteConfig } from '@medusajs/admin-sdk';
import { Button, Container, Heading, Input, Text, toast } from '@medusajs/ui';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { sdk } from '../../../sdk';
import GoogleCalendarPanel from '../../components/availability/google-calendar-panel';
import type { Settings } from '../../../lib/availability/slots';
type Window = { start: string; end: string };
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function Windows({ value, onChange }: { value: Window[]; onChange: (v: Window[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {value.map((w, i) => (
        <div className="flex gap-2" key={i}>
          <Input
            aria-label="Window start"
            type="time"
            value={w.start}
            onChange={(e) => onChange(value.map((v, n) => (n === i ? { ...v, start: e.target.value } : v)))}
          />
          <Input
            aria-label="Window end"
            type="time"
            value={w.end}
            onChange={(e) => onChange(value.map((v, n) => (n === i ? { ...v, end: e.target.value } : v)))}
          />
          <Button type="button" variant="secondary" onClick={() => onChange(value.filter((_, n) => n !== i))}>
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...value, { start: '', end: '' }])}>
        Add hours
      </Button>
    </div>
  );
}
const AvailabilityPage = () => {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['availability'], queryFn: () => sdk.admin.availability.get() });
  const [settings, setSettings] = useState<Settings>({
    timezone: '',
    weekly: {},
    overrides: {},
    google_mode: 'required',
  });
  const [overrideDate, setOverrideDate] = useState('');
  useEffect(() => {
    if (query.data?.settings) setSettings(query.data.settings);
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => sdk.admin.availability.save(settings),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['availability'] });
      toast.success('Availability saved');
    },
    onError: (e) => toast.error(e.message),
  });
  if (query.isLoading) return <Text>Loading availability…</Text>;
  if (query.isError) return <Text role="alert">Unable to load availability. Refresh to retry.</Text>;
  return (
    <div className="flex flex-col gap-6">
      <Container className="space-y-6">
        <Heading>Availability</Heading>
        {!query.data?.settings && (
          <Text>Not configured. No arrival times are offered until you save working hours.</Text>
        )}
        <Text>
          Pending requests do not reserve time. Accepted bookings do. Hours include the full occupied period, including
          travel and buffers.
        </Text>
        <label className="block">
          Chef timezone
          <Input
            placeholder="America/Chicago"
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
          />
        </label>
        <Heading level="h2">Weekly working hours</Heading>
        {days.map((day, i) => (
          <div className="grid grid-cols-1 gap-3 border-b py-3 sm:grid-cols-2" key={day}>
            <Text>
              {day}
              {!settings.weekly[String(i + 1) as '1']?.length && ' — closed'}
            </Text>
            <Windows
              value={settings.weekly[String(i + 1) as '1'] || []}
              onChange={(v) => setSettings({ ...settings, weekly: { ...settings.weekly, [i + 1]: v } })}
            />
          </div>
        ))}
        <Heading level="h2">Date overrides</Heading>
        <Text>Overrides replace the weekly hours. An override with no hours closes that date.</Text>
        <div className="flex gap-2">
          <Input
            aria-label="Override date"
            type="date"
            value={overrideDate}
            onChange={(e) => setOverrideDate(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!overrideDate}
            onClick={() => setSettings({ ...settings, overrides: { ...settings.overrides, [overrideDate]: [] } })}
          >
            Add date
          </Button>
        </div>
        {Object.entries(settings.overrides)
          .sort()
          .map(([date, windows]) => (
            <div className="space-y-2 border-b py-3" key={date}>
              <Text>
                {date} — {windows.length ? 'Custom hours' : 'Closed'}
              </Text>
              <Windows
                value={windows}
                onChange={(v) => setSettings({ ...settings, overrides: { ...settings.overrides, [date]: v } })}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  const next = { ...settings.overrides };
                  delete next[date];
                  setSettings({ ...settings, overrides: next });
                }}
              >
                Use weekly hours
              </Button>
            </div>
          ))}
        <Heading level="h2">Conflict checks</Heading>
        <label className="block">
          Calendar source
          <select
            className="block w-full rounded border p-2"
            value={settings.google_mode}
            onChange={(e) => setSettings({ ...settings, google_mode: e.target.value as Settings['google_mode'] })}
          >
            <option value="required">Internal bookings + Google Calendar (required)</option>
            <option value="internal_only">Internal bookings only (ignore Google conflicts)</option>
          </select>
        </label>
        <Text>
          Google failures block new slots when Google is required. The selected connected calendar is checked; other
          calendars are not included.
        </Text>
        <Text>
          Configure duration, off-site preparation, travel each way and cleanup in{' '}
          <Link className="underline" to="/experience-types">
            Experience Types
          </Link>
          . On-site preparation is already part of arrival-to-finish duration.
        </Text>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          Save availability
        </Button>
      </Container>
      <GoogleCalendarPanel />
    </div>
  );
};
export const config = defineRouteConfig({ label: 'Availability' });

export default AvailabilityPage;
