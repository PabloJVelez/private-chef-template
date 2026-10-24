import { defineRouteConfig } from '@medusajs/admin-sdk';
import { Button, Container, Heading, Input, Text } from '@medusajs/ui';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sdk } from '../../../sdk';
import { availabilitySettingsSchema, type Settings } from '../../../lib/availability/slots';
import GoogleCalendarPanel from '../../components/availability/google-calendar-panel';
import { ExceptionsEditor } from '../../components/availability/exceptions-editor';
import { HelpTip } from '../../components/availability/help-tip';
import { WorkingDays } from '../../components/availability/working-days';
import { editorReducer, equalSettings, initialEditor } from '../../components/availability/editor';

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
  const [workingOpen, setWorkingOpen] = useState(false);
  const [timezoneEditing, setTimezoneEditing] = useState(false);
  const dirty = !equalSettings(state.saved, state.draft);
  const settings = state.draft;
  const validation = availabilitySettingsSchema.safeParse(settings);
  const timezoneValid = availabilitySettingsSchema.shape.timezone.safeParse(settings.timezone).success;
  const edit = (next: Settings) => dispatch({ type: 'edit', settings: next });
  useEffect(() => {
    if (query.data) dispatch({ type: 'receive', settings: query.data.settings });
  }, [query.data]);
  useEffect(() => {
    if (!dirty && !exceptionOpen && !workingOpen) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, exceptionOpen, workingOpen]);
  const save = async () => {
    if (!dirty || !validation.success || state.saving || exceptionOpen || workingOpen) return;
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
                : dirty || exceptionOpen || workingOpen
                  ? 'Unsaved changes'
                  : 'All changes saved'}
          </Text>
        </div>
        {(dirty || state.saving) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {state.error && (
              <Text className="w-full text-ui-fg-error" size="small" role="alert">
                {state.error}
              </Text>
            )}
            {(exceptionOpen || workingOpen || !validation.success) && (
              <Text size="small" className="w-full text-ui-fg-subtle" role="status">
                {exceptionOpen || workingOpen
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
                setWorkingOpen(false);
                setTimezoneEditing(false);
                setExceptionOpen(false);
                setDiscardVersion((value) => value + 1);
              }}
            >
              Discard
            </Button>
            <Button
              type="submit"
              form="availability-settings"
              isLoading={!!state.saving}
              disabled={!dirty || !!state.saving || !validation.success || exceptionOpen || workingOpen}
            >
              Save availability
            </Button>
          </div>
        )}
        {state.error && !dirty && !state.saving && (
          <Text className="w-full text-ui-fg-error" size="small" role="alert">
            {state.error}
          </Text>
        )}
      </div>
      <form
        id="availability-settings"
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
          <div className="flex flex-wrap items-center gap-2">
            <Text size="small" className="text-ui-fg-subtle">
              Timezone: {settings.timezone ? friendlyZone(settings.timezone) : 'Not set'}
            </Text>
            {!timezoneEditing && timezoneValid && (
              <Button type="button" size="small" variant="secondary" onClick={() => setTimezoneEditing(true)}>
                Change timezone
              </Button>
            )}
          </div>
          {(timezoneEditing || !timezoneValid) && (
            <div className="space-y-2">
              <label className="block max-w-md text-sm">
                Your timezone
                <Input
                  list="chef-timezones"
                  autoFocus
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
              <Button
                type="button"
                size="small"
                variant="secondary"
                disabled={!timezoneValid}
                onClick={() => setTimezoneEditing(false)}
              >
                Done
              </Button>
            </div>
          )}
          <WorkingDays key={discardVersion} settings={settings} onChange={edit} onEditing={setWorkingOpen} />
        </Container>
        <Container>
          <ExceptionsEditor key={discardVersion} settings={settings} onChange={edit} onEditing={setExceptionOpen} />
        </Container>
        <GoogleCalendarPanel
          checkWhenConnected={settings.google_mode === 'required'}
          unsaved={dirty || exceptionOpen || workingOpen}
        >
          <label className="block text-sm">
            Check for conflicts in
            <select
              className="mt-1 block w-full rounded border p-2"
              value={settings.google_mode}
              onChange={(e) => edit({ ...settings, google_mode: e.target.value as Settings['google_mode'] })}
            >
              <option value="required">Bookings and Google Calendar (when connected)</option>
              <option value="internal_only">Bookings only — ignore Google conflicts</option>
            </select>
          </label>
          <Text size="small" className="text-ui-fg-subtle">
            Google Calendar is optional. Without a connection, only bookings are checked. When connected and enabled,
            calendar lookup failures pause availability until resolved or switched to bookings only.
          </Text>
        </GoogleCalendarPanel>
      </form>
    </div>
  );
};
export const config = defineRouteConfig({ label: 'Availability' });
export default AvailabilityPage;
