import { defineRouteConfig } from '@medusajs/admin-sdk';
import { Button, Container, Heading, Input, Text } from '@medusajs/ui';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { sdk } from '../../../sdk';
import { availabilitySettingsSchema, type Settings } from '../../../lib/availability/slots';
import GoogleCalendarPanel from '../../components/availability/google-calendar-panel';
import { ArrivalPreview } from '../../components/availability/arrival-preview';
import { ExceptionsEditor } from '../../components/availability/exceptions-editor';
import { HoursEditor } from '../../components/availability/hours-editor';
import { copyDays, dayNames, editorReducer, equalSettings, initialEditor } from '../../components/availability/editor';

const timezoneNames = (() => {
  const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  return [
    'UTC',
    ...(supported?.('timeZone') || [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
    ]),
  ];
})();
const friendlyZone = (zone: string) => `${zone.split('/').slice(1).join(' / ').replace(/_/g, ' ') || zone} · ${zone}`;

const AvailabilityPage = () => {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['availability'], queryFn: () => sdk.admin.availability.get() });
  const [state, dispatch] = useReducer(editorReducer, undefined, initialEditor);
  const saveId = useRef(0);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [discardVersion, setDiscardVersion] = useState(0);
  const [copyFrom, setCopyFrom] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [replace, setReplace] = useState(false);
  const [copyError, setCopyError] = useState('');
  const dirty = !equalSettings(state.saved, state.draft);
  const settings = state.draft;
  const validation = availabilitySettingsSchema.safeParse(settings);
  const timezoneValid = availabilitySettingsSchema.shape.timezone.safeParse(settings.timezone).success;
  const edit = (next: Settings) => dispatch({ type: 'edit', settings: next });
  useEffect(() => {
    if (query.data) dispatch({ type: 'receive', settings: query.data.settings });
  }, [query.data]);
  useEffect(() => {
    if (!dirty && !exceptionOpen) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, exceptionOpen]);
  const save = async () => {
    if (!validation.success || state.saving || exceptionOpen || copyFrom) return;
    const id = ++saveId.current;
    const snapshot = validation.data;
    dispatch({ type: 'saving', id, snapshot });
    try {
      const response = await sdk.admin.availability.save(snapshot);
      dispatch({ type: 'saved', id, settings: response.settings });
      client.setQueryData(['availability'], response);
      client.invalidateQueries({ queryKey: ['availability-preview'] });
    } catch (error) {
      dispatch({
        type: 'failed',
        id,
        message:
          error instanceof Error ? error.message : 'Could not save. Your changes are still here; please try again.',
      });
    }
  };
  if (!state.initialized)
    return (
      <Container>
        <Text>{query.isError ? 'Unable to load your schedule.' : 'Loading availability…'}</Text>
        {query.isError && <Button onClick={() => query.refetch()}>Retry</Button>}
      </Container>
    );
  return (
    <div className="relative space-y-4 pb-6">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-ui-bg-base p-4 shadow-sm">
        <div>
          <Heading>Availability</Heading>
          <Text size="small" role="status">
            {state.saving
              ? 'Saving… You can keep editing.'
              : state.error
                ? 'Not saved — try again'
                : dirty || exceptionOpen
                  ? 'Unsaved changes'
                  : 'All changes saved'}
          </Text>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!!state.saving || (!dirty && !exceptionOpen)}
            onClick={() => {
              dispatch({ type: 'discard' });
              setCopyFrom('');
              setExceptionOpen(false);
              setDiscardVersion((value) => value + 1);
            }}
          >
            Discard
          </Button>
          <Button
            disabled={!dirty || !!state.saving || !validation.success || exceptionOpen || !!copyFrom}
            onClick={save}
          >
            Save availability
          </Button>
        </div>
        {(state.error || exceptionOpen || copyFrom || (dirty && !validation.success)) && (
          <Text className="w-full text-ui-fg-error" size="small" role="alert">
            {state.error ||
              (exceptionOpen || copyFrom
                ? 'Apply or cancel the open editor before saving.'
                : 'Check the highlighted timezone or hours before saving.')}
          </Text>
        )}
      </div>
      {!state.saved && (
        <Text>
          No arrival times are offered until you save your schedule. Start with your timezone and usual hours.
        </Text>
      )}
      <Container className="space-y-4">
        <div>
          <Heading level="h2">Your usual week</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Choose when you’re available to work. Leave room for the whole visit, preparation, travel and cleanup—not
            only the client’s arrival.
          </Text>
        </div>
        <label className="block max-w-md text-sm">
          Your timezone
          <Input
            list="chef-timezones"
            placeholder="Search a city or timezone"
            value={settings.timezone}
            aria-invalid={!timezoneValid}
            onChange={(e) => edit({ ...settings, timezone: e.target.value })}
          />
          <datalist id="chef-timezones">
            {timezoneNames.map((zone) => (
              <option value={zone} label={friendlyZone(zone)} key={zone} />
            ))}
          </datalist>
        </label>
        {!timezoneValid && (
          <Text size="small" className="text-ui-fg-error">
            Choose a timezone from the list, such as Chicago or London.
          </Text>
        )}
        <div className="divide-y">
          {dayNames.map((day, index) => {
            const key = String(index + 1);
            const hours = settings.weekly[key as '1'] || [];
            return (
              <div className="grid gap-2 py-3 md:grid-cols-[170px_1fr_auto]" key={day}>
                <label className="flex items-center gap-2 self-start py-1 text-sm">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`${day} available`}
                    checked={!!hours.length}
                    onChange={(e) => dispatch({ type: 'toggle', day: key, enabled: e.target.checked })}
                  />
                  <span className="font-medium">{day}</span>
                  <span className="sr-only">Available</span>
                </label>
                {hours.length ? (
                  <HoursEditor
                    label={day}
                    value={hours}
                    onChange={(value) => edit({ ...settings, weekly: { ...settings.weekly, [key]: value } })}
                  />
                ) : (
                  <Text size="small" className="py-1 text-ui-fg-muted">
                    Unavailable
                  </Text>
                )}
                {hours.length > 0 && (
                  <Button
                    size="small"
                    variant="transparent"
                    className="self-start justify-self-start"
                    onClick={() => {
                      setCopyFrom(key);
                      setTargets([]);
                      setReplace(false);
                      setCopyError('');
                    }}
                  >
                    Copy hours
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {copyFrom && (
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Copy {dayNames[Number(copyFrom) - 1]}’s hours</legend>
            <div className="flex flex-wrap gap-3">
              {dayNames.map((day, index) => {
                const key = String(index + 1);
                return key === copyFrom ? null : (
                  <label className="flex gap-1 text-sm" key={day}>
                    <input
                      type="checkbox"
                      checked={targets.includes(key)}
                      onChange={(e) => {
                        setTargets(e.target.checked ? [...targets, key] : targets.filter((target) => target !== key));
                        setReplace(false);
                      }}
                    />
                    {day}
                  </label>
                );
              })}
            </div>
            {targets.some((day) => settings.weekly[day as '1']?.length) && (
              <label className="block text-sm">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace
                existing hours on selected days
              </label>
            )}
            {copyError && (
              <Text role="alert" className="text-ui-fg-error">
                {copyError}
              </Text>
            )}
            <div className="flex gap-2">
              <Button
                size="small"
                onClick={() => {
                  try {
                    edit(copyDays(settings, copyFrom, targets, replace));
                    setCopyFrom('');
                  } catch (e) {
                    setCopyError((e as Error).message);
                  }
                }}
              >
                Apply copy
              </Button>
              <Button size="small" variant="secondary" onClick={() => setCopyFrom('')}>
                Cancel
              </Button>
            </div>
          </fieldset>
        )}
      </Container>
      <Container>
        <ExceptionsEditor key={discardVersion} settings={settings} onChange={edit} onEditing={setExceptionOpen} />
      </Container>
      <Container>
        <ArrivalPreview configured={!!state.saved} dirty={dirty || exceptionOpen} revision={state.revision} />
      </Container>
      <GoogleCalendarPanel required={settings.google_mode === 'required'} unsaved={dirty || exceptionOpen}>
        <label className="block text-sm">
          Check for conflicts in
          <select
            className="mt-1 block w-full rounded border p-2"
            value={settings.google_mode}
            onChange={(e) => edit({ ...settings, google_mode: e.target.value as Settings['google_mode'] })}
          >
            <option value="required">Bookings and Google Calendar</option>
            <option value="internal_only">Bookings only — ignore Google conflicts</option>
          </select>
        </label>
        <Text size="small" className="text-ui-fg-subtle">
          Only the connected calendar is checked. If Google is required and cannot be checked, clients cannot request
          those times.
        </Text>
      </GoogleCalendarPanel>
      <details className="rounded border p-4 text-sm">
        <summary className="cursor-pointer font-medium">How hours and booking requests work</summary>
        <div className="mt-3 space-y-2">
          <Text size="small">
            Pending requests do not reserve time. Accepted bookings do. Clients see arrival times only when the full
            working period fits, including the experience’s preparation, travel and cleanup.
          </Text>
          <Text size="small">
            Set duration and extra time in{' '}
            <Link className="underline" to="/experience-types">
              Experiences
            </Link>
            . On-site preparation is already included in arrival-to-finish duration. Split overnight hours across dates;
            periods can touch but cannot overlap.
          </Text>
        </div>
      </details>
    </div>
  );
};
export const config = defineRouteConfig({ label: 'Availability' });
export default AvailabilityPage;
