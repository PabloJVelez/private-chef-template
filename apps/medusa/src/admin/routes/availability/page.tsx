import { defineRouteConfig } from '@medusajs/admin-sdk';
import { Button, Container, Heading, Input, Text } from '@medusajs/ui';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { sdk } from '../../../sdk';
import { availabilitySettingsSchema, type Settings } from '../../../lib/availability/slots';
import GoogleCalendarPanel from '../../components/availability/google-calendar-panel';
import { ExceptionsEditor } from '../../components/availability/exceptions-editor';
import { HelpTip } from '../../components/availability/help-tip';
import { WorkingDays } from '../../components/availability/working-days';
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
    if (!dirty || !validation.success || state.saving || exceptionOpen || copyFrom) return;
    const id = ++saveId.current;
    const snapshot = validation.data;
    dispatch({ type: 'saving', id, snapshot });
    try {
      const response = await sdk.admin.availability.save(snapshot);
      dispatch({ type: 'saved', id, settings: response.settings });
      client.setQueryData(['availability'], response);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        {state.error && !dirty && !state.saving && (
          <Text className="w-full text-ui-fg-error" size="small" role="alert">
            {state.error}
          </Text>
        )}
      </div>
      <form
        aria-label="Availability settings"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {!state.saved && (
          <Text>
            No arrival times are offered until you save your schedule. Start with your timezone and usual hours.
          </Text>
        )}
        <Container className="space-y-4">
          <div className="flex items-center gap-1">
            <Heading level="h2">Your usual week</Heading>
            <HelpTip
              label="About working hours"
              content="Choose when you’re available to work. Leave room for the whole visit, preparation, travel and cleanup—not only the client’s arrival."
            />
          </div>
          <label className="block max-w-md text-sm">
            Your timezone
            <Input
              list="chef-timezones"
              placeholder="Search a city or timezone"
              value={settings.timezone}
              aria-invalid={!timezoneValid}
              aria-describedby={!timezoneValid ? 'availability-timezone-error' : undefined}
              onChange={(e) => edit({ ...settings, timezone: e.target.value })}
            />
            <datalist id="chef-timezones">
              {timezoneNames.map((zone) => (
                <option value={zone} label={friendlyZone(zone)} key={zone} />
              ))}
            </datalist>
          </label>
          {!timezoneValid && (
            <Text id="availability-timezone-error" size="small" className="text-ui-fg-error">
              Choose a timezone from the list, such as Chicago or London.
            </Text>
          )}
          <WorkingDays
            key={discardVersion}
            settings={settings}
            onChange={edit}
            onCopy={(day) => {
              setCopyFrom(day);
              setTargets([]);
              setReplace(false);
              setCopyError('');
            }}
          />
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
                  type="button"
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
                <Button type="button" size="small" variant="secondary" onClick={() => setCopyFrom('')}>
                  Cancel
                </Button>
              </div>
            </fieldset>
          )}
        </Container>
        <Container>
          <ExceptionsEditor key={discardVersion} settings={settings} onChange={edit} onEditing={setExceptionOpen} />
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
        {(dirty || state.saving) && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ui-border-base pt-4">
            {state.error && (
              <Text className="w-full text-ui-fg-error" size="small" role="alert">
                {state.error}
              </Text>
            )}
            {(exceptionOpen || copyFrom || !validation.success) && (
              <Text size="small" className="w-full text-ui-fg-subtle" role="status">
                {exceptionOpen || copyFrom
                  ? 'Apply or cancel the open editor before saving.'
                  : 'Check the highlighted timezone or hours before saving.'}
              </Text>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!!state.saving}
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
              type="submit"
              isLoading={!!state.saving}
              disabled={!dirty || !!state.saving || !validation.success || exceptionOpen || !!copyFrom}
            >
              Save availability
            </Button>
          </div>
        )}
      </form>
      <div className="flex flex-wrap items-center gap-2 rounded border p-4 text-sm">
        <Text size="small">Set experience duration, preparation, travel and cleanup in Experiences.</Text>
        <HelpTip
          label="About booking requests and experience duration"
          content="Pending requests do not reserve time. Accepted bookings do. Clients see arrival times only when the full working period fits, including preparation, travel and cleanup. On-site preparation is already included in arrival-to-finish duration. Split overnight hours across dates; periods can touch but cannot overlap."
        />
        <Link className="underline" to="/experience-types">
          Manage experiences
        </Link>
      </div>
    </div>
  );
};
export const config = defineRouteConfig({ label: 'Availability' });
export default AvailabilityPage;
