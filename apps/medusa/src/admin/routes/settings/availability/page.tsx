import { defineRouteConfig } from '@medusajs/admin-sdk';
import { Button, Container, Heading, Input, Text, toast } from '@medusajs/ui';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAdminAvailability, useAdminSaveAvailabilityMutation } from '../../../hooks/availability';
import { useAdminListExperienceTypes } from '../../../hooks/experience-types';
import { availabilitySettingsSchema, type Settings } from '../../../../lib/availability/slots';
import { NoticeRules } from '../../../components/availability/notice-rules';
import GoogleCalendarPanel from '../../../components/availability/google-calendar-panel';
import { ExceptionsEditor } from '../../../components/availability/exceptions-editor';
import { HelpTip } from '../../../components/availability/help-tip';
import { WorkingDays } from '../../../components/availability/working-days';
import { cleanSettings, emptySettings } from '../../../components/availability/editor';

const timezoneNames = (() => {
  const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
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
const friendlyZone = (zone: string) =>
  `${zone.split('/').slice(1).join(' / ').replace(/_/g, ' ') || zone} · ${zone}`;

const AvailabilityPage = () => {
  const query = useAdminAvailability();
  const mutation = useAdminSaveAvailabilityMutation();
  const experiences = useAdminListExperienceTypes();
  const form = useForm<Settings>({
    resolver: zodResolver(availabilitySettingsSchema),
    defaultValues: emptySettings(),
    mode: 'onChange',
  });
  const initialized = useRef(false);
  const editVersion = useRef(0);
  const [hasSaved, setHasSaved] = useState(false);
  const { isDirty: dirty, isValid, isSubmitting } = form.formState;
  const saving = mutation.isPending || isSubmitting;
  const error = mutation.error?.message;
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [discardVersion, setDiscardVersion] = useState(0);
  const [workingOpen, setWorkingOpen] = useState(false);
  const [timezoneEditing, setTimezoneEditing] = useState(false);
  const settings = form.watch();
  const timezoneValid = availabilitySettingsSchema.shape.timezone.safeParse(settings.timezone).success;
  const edit = (next: Settings) => {
    editVersion.current += 1;
    if (mutation.isError) mutation.reset();
    // Nested schedule editors supply complete field values, including deletions.
    for (const key of Object.keys(cleanSettings(next)) as (keyof Settings)[]) {
      form.setValue(key, next[key], { shouldDirty: true, shouldValidate: true });
    }
  };
  useEffect(() => {
    if (query.data && !initialized.current) {
      initialized.current = true;
      setHasSaved(!!query.data.settings);
      form.reset(query.data.settings ? cleanSettings(query.data.settings) : {
        ...emptySettings(),
        notice_rules: query.data.initial_notice_rules ?? [],
      });
    }
  }, [query.data, form.reset]);
  useEffect(() => {
    if (!dirty && !exceptionOpen && !workingOpen) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, exceptionOpen, workingOpen]);
  const save = async (snapshot: Settings) => {
    if (!dirty || mutation.isPending || exceptionOpen || workingOpen) return;
    const submittedVersion = editVersion.current;
    try {
      const response = await mutation.mutateAsync(snapshot);
      const current = form.getValues();
      form.reset(cleanSettings(response.settings));
      // Advance the saved baseline without losing input made during the request.
      // RHF performs structural dirty checks, independent of JSON object key order.
      if (editVersion.current !== submittedVersion) {
        form.reset(current, { keepDefaultValues: true });
      }
      setHasSaved(true);
      toast.success('Availability saved');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Could not save. Your changes are still here; please try again.';
      toast.error('Save failed', { description: message, duration: 5000 });
    }
  };
  if (!initialized.current)
    return (
      <Container>
        <Text>{query.isError ? 'Unable to load your schedule.' : 'Loading availability…'}</Text>
        {query.isError && <Button onClick={() => query.refetch()}>Retry</Button>}
      </Container>
    );
  return (
    <div className="relative space-y-4 pb-6">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ui-bg-base p-3 shadow-sm">
        <div>
          <Heading>Availability</Heading>
          <Text size="small" role="status">
            {saving
              ? 'Saving… You can keep editing.'
              : error
                ? 'Not saved — try again'
                : dirty || exceptionOpen || workingOpen
                  ? 'Unsaved changes'
                  : 'All changes saved'}
          </Text>
        </div>
        {(dirty || saving || exceptionOpen || workingOpen) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {error && (
              <Text className="w-full text-ui-fg-error" size="small" role="alert">
                {error}
              </Text>
            )}
            {(exceptionOpen || workingOpen || !isValid) && (
              <Text size="small" className="w-full text-ui-fg-subtle" role="status">
                {workingOpen
                  ? 'Apply the working-day changes below, then save availability.'
                  : exceptionOpen
                    ? 'Apply or cancel the date editor below, then save availability.'
                    : 'Check the highlighted availability settings before saving.'}
              </Text>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!!saving}
              onClick={() => {
                form.reset();
                mutation.reset();
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
              isLoading={!!saving}
              disabled={!dirty || !!saving || !isValid || exceptionOpen || workingOpen}
            >
              Save availability
            </Button>
          </div>
        )}
        {error && !dirty && !saving && (
          <Text className="w-full text-ui-fg-error" size="small" role="alert">
            {error}
          </Text>
        )}
      </div>
      <form
        id="availability-settings"
        aria-label="Availability settings"
        className="space-y-4"
        onSubmit={form.handleSubmit(save)}
      >
        {!hasSaved && (
          <Text>
            No arrival times are offered until you save your schedule. Start with your timezone and usual
            hours.
            {!!query.data?.initial_notice_rules?.length && ' Your existing advance-notice requirements are included below. Review them before saving your first schedule.'}
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
          <ExceptionsEditor
            key={discardVersion}
            settings={settings}
            onChange={edit}
            onEditing={setExceptionOpen}
          />
        </Container>
        {experiences.data ? (
          <NoticeRules
            rules={settings.notice_rules ?? []}
            experiences={experiences.data.experience_types}
            onChange={(notice_rules) => edit({ ...settings, notice_rules })}
          />
        ) : (
          <Container>
            <Heading level="h2">Advance notice</Heading>
            <Text>{experiences.isError ? 'Unable to load experiences.' : 'Loading experiences…'}</Text>
            {experiences.isError && (
              <Button type="button" onClick={() => experiences.refetch()}>
                Retry
              </Button>
            )}
          </Container>
        )}
        <GoogleCalendarPanel
          checkWhenConnected={settings.google_mode === 'required'}
          unsaved={dirty || exceptionOpen || workingOpen}
        >
          <label className="block text-sm">
            Check for conflicts in
            <select
              className="mt-1 block w-full rounded border p-2"
              value={settings.google_mode}
              onChange={(e) =>
                edit({
                  ...settings,
                  google_mode: e.target.value as Settings['google_mode'],
                })
              }
            >
              <option value="required">Bookings and Google Calendar (when connected)</option>
              <option value="internal_only">Bookings only — ignore Google conflicts</option>
            </select>
          </label>
        </GoogleCalendarPanel>
      </form>
    </div>
  );
};
export const config = defineRouteConfig({ label: 'Availability' });
export default AvailabilityPage;
