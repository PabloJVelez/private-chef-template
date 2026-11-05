import { defineRouteConfig } from '@medusajs/admin-sdk';
import { Button, Container, Heading, Input, Select, Tabs, Text, toast } from '@medusajs/ui';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAdminAvailability, useAdminSaveAvailabilityMutation } from '../../../hooks/availability';
import { useAdminListExperienceTypes } from '../../../hooks/experience-types';
import { availabilitySettingsSchema, type Settings } from '../../../../lib/availability/slots';
import { NoticeRules } from '../../../components/availability/notice-rules';
import { MealPrepSetupEditor } from '../../../components/availability/meal-prep-setup';
import GoogleCalendarPanel from '../../../components/availability/google-calendar-panel';
import { ExceptionsEditor } from '../../../components/availability/exceptions-editor';
import { HelpTip } from '../../../components/availability/help-tip';
import { WorkingDays } from '../../../components/availability/working-days';
import { cleanSettings, emptySettings } from '../../../components/availability/editor';

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

const tabClassName =
  'rounded-none border-0 border-b-2 border-transparent px-4 py-3 data-[state=active]:border-ui-fg-base data-[state=active]:bg-transparent data-[state=active]:shadow-none';

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
  const reloadInFlight = useRef(false);
  const [reloading, setReloading] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const { isDirty: dirty, isValid, isSubmitting } = form.formState;
  const saving = mutation.isPending || isSubmitting;
  const error = mutation.error?.message;
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [discardVersion, setDiscardVersion] = useState(0);
  const [workingOpen, setWorkingOpen] = useState(false);
  const [mealEditing, setMealEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('availability');
  const mealTabTrigger = useRef<HTMLButtonElement>(null);
  const availabilityTabTrigger = useRef<HTMLButtonElement>(null);
  const [timezoneEditing, setTimezoneEditing] = useState(false);
  const settings = form.watch();
  const timezoneValid = availabilitySettingsSchema.shape.timezone.safeParse(settings.timezone).success;
  const edit = (next: Settings) => {
    if (reloadInFlight.current) return;
    editVersion.current += 1;
    if (mutation.isError) mutation.reset();
    // Nested schedule editors supply complete field values, including deletions.
    for (const key of Object.keys(cleanSettings(next)) as (keyof Settings)[]) {
      form.setValue(key, next[key], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };
  useEffect(() => {
    if (query.data && !initialized.current) {
      initialized.current = true;
      setHasSaved(!!query.data.settings);
      form.reset(
        query.data.settings
          ? cleanSettings(query.data.settings)
          : {
              ...emptySettings(),
              notice_rules: query.data.initial_notice_rules ?? [],
            },
      );
    }
  }, [query.data, form.reset]);
  useEffect(() => {
    if (!dirty && !exceptionOpen && !workingOpen && !mealEditing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, exceptionOpen, workingOpen, mealEditing]);
  const save = async (snapshot: Settings) => {
    if (reloadInFlight.current || !dirty || mutation.isPending || exceptionOpen || workingOpen || mealEditing) return;
    const submittedVersion = editVersion.current;
    try {
      const response = await mutation.mutateAsync(snapshot);
      const current = form.getValues();
      form.reset(cleanSettings(response.settings));
      // Advance the saved baseline without losing input made during the request.
      // RHF performs structural dirty checks, independent of JSON object key order.
      if (editVersion.current !== submittedVersion) {
        form.reset({ ...current, version: response.settings.version }, { keepDefaultValues: true });
      }
      setHasSaved(true);
      toast.success('Availability saved');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not save. Your changes are still here; please try again.';
      toast.error('Save failed', { description: message, duration: 5000 });
    }
  };
  const reloadSaved = async () => {
    if (reloadInFlight.current || saving) return;
    // Reload discards the whole draft. Never attach a fresh revision to stale values.
    reloadInFlight.current = true;
    setReloading(true);
    try {
      const response = await query.refetch();
      if (response.isError) throw response.error;
      if (!response.data) throw new Error('No saved settings were returned.');
      form.reset(
        response.data.settings
          ? cleanSettings(response.data.settings)
          : {
              ...emptySettings(),
              notice_rules: response.data.initial_notice_rules ?? [],
            },
      );
      setHasSaved(!!response.data.settings);
      mutation.reset();
      setDiscardVersion((v) => v + 1);
      setWorkingOpen(false);
      setMealEditing(false);
      setExceptionOpen(false);
      setTimezoneEditing(false);
    } catch (error) {
      toast.error('Reload failed', {
        description: error instanceof Error ? error.message : 'Your draft is still here; please try again.',
        duration: 5000,
      });
    } finally {
      reloadInFlight.current = false;
      setReloading(false);
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
            {reloading
              ? 'Reloading saved settings…'
              : saving
                ? 'Saving… You can keep editing.'
                : error
                  ? 'Not saved — try again'
                  : dirty || exceptionOpen || workingOpen || mealEditing
                    ? 'Unsaved changes'
                    : 'All changes saved'}
          </Text>
        </div>
        {(dirty || saving || exceptionOpen || workingOpen || mealEditing) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {error && (
              <Text className="w-full text-ui-fg-error" size="small" role="alert">
                {error}
              </Text>
            )}
            {(exceptionOpen || workingOpen || mealEditing || !isValid) && (
              <Text size="small" className="w-full text-ui-fg-subtle" role="status">
                {mealEditing
                  ? 'Apply or cancel the Meal Prep editor, then save availability.'
                  : workingOpen
                    ? 'Apply the working-day changes in Availability, then save availability.'
                    : exceptionOpen
                      ? 'Apply or cancel the date editor in Availability, then save availability.'
                      : 'Check the highlighted settings before saving.'}
              </Text>
            )}
            {(workingOpen || exceptionOpen) && activeTab !== 'availability' && (
              <Button
                type="button"
                variant="secondary"
                disabled={reloading}
                onClick={() => {
                  setActiveTab('availability');
                  availabilityTabTrigger.current?.focus();
                }}
              >
                Review availability edits
              </Button>
            )}
            {mealEditing && activeTab !== 'meal-prep' && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setActiveTab('meal-prep');
                  mealTabTrigger.current?.focus();
                }}
                disabled={reloading}
              >
                Review Meal Prep edits
              </Button>
            )}
            {error && (
              <Button type="button" variant="secondary" disabled={!!saving || reloading} onClick={reloadSaved}>
                Reload saved settings (discard draft)
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!!saving || reloading}
              onClick={() => {
                if (reloadInFlight.current || saving) return;
                form.reset();
                mutation.reset();
                setWorkingOpen(false);
                setMealEditing(false);
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
              disabled={reloading || !dirty || !!saving || !isValid || exceptionOpen || workingOpen || mealEditing}
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
        aria-busy={reloading}
        onClickCapture={(event) => {
          if (reloadInFlight.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onChangeCapture={(event) => {
          if (reloadInFlight.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onSubmit={(event) => {
          if (reloadInFlight.current) {
            event.preventDefault();
            return;
          }
          void form.handleSubmit(save)(event);
        }}
      >
        <fieldset disabled={reloading} className="min-w-0 space-y-4">
          {/* Keep shared editors mounted across tabs so pending input is never dropped. */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <Tabs.List aria-label="Availability settings sections" className="gap-0 border-b border-ui-border-base">
              <Tabs.Trigger ref={availabilityTabTrigger} value="availability" className={tabClassName}>
                Availability
              </Tabs.Trigger>
              <Tabs.Trigger value="private-events" className={tabClassName}>
                Private events
              </Tabs.Trigger>
              <Tabs.Trigger ref={mealTabTrigger} value="meal-prep" className={tabClassName}>
                Meal Prep
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content
              value="availability"
              forceMount
              hidden={activeTab !== 'availability'}
              className="pt-4 space-y-4"
            >
              {!hasSaved && (
                <Text>
                  No arrival times are offered until you save your schedule. Start with your timezone and usual hours.
                  {!!query.data?.initial_notice_rules?.length &&
                    ' Your existing advance-notice requirements are in Private events. Review them before saving your first schedule.'}
                </Text>
              )}
              <section aria-labelledby="shared-availability-heading" className="space-y-4">
                <Heading level="h2" id="shared-availability-heading" className="sr-only">
                  Shared availability
                </Heading>
                <Container className="divide-y divide-ui-border-base p-0">
                  <div className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <Heading level="h2">Working hours</Heading>
                      <HelpTip
                        label="About working hours"
                        content="Choose when you’re available to work. Leave room for the whole visit, preparation, travel and cleanup—not only the client’s arrival."
                      />
                    </div>
                    <Text size="small" className="text-ui-fg-subtle">
                      One schedule for private events and meal prep.
                    </Text>
                  </div>
                  <div className="space-y-4 px-6 py-4">
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
                  </div>
                </Container>
                <Container>
                  <ExceptionsEditor
                    key={discardVersion}
                    settings={settings}
                    onChange={edit}
                    onEditing={setExceptionOpen}
                  />
                </Container>
                <GoogleCalendarPanel
                  checkWhenConnected={settings.google_mode === 'required'}
                  unsaved={dirty || exceptionOpen || workingOpen || mealEditing}
                >
                  <label className="block text-sm">
                    Check for conflicts in
                    <Select
                      value={settings.google_mode}
                      onValueChange={(mode) =>
                        edit({
                          ...settings,
                          google_mode: mode as Settings['google_mode'],
                        })
                      }
                    >
                      <Select.Trigger aria-label="Check for conflicts in" className="mt-1">
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content className="z-50">
                        <Select.Item value="required">Bookings and Google Calendar (when connected)</Select.Item>
                        <Select.Item value="internal_only">Bookings only — ignore Google conflicts</Select.Item>
                      </Select.Content>
                    </Select>
                  </label>
                </GoogleCalendarPanel>
              </section>
            </Tabs.Content>
            <Tabs.Content
              value="private-events"
              forceMount
              hidden={activeTab !== 'private-events'}
              className="pt-4 space-y-4"
            >
              <Text size="small" className="text-ui-fg-subtle">
                Booking preferences for private events. Working hours and time off are managed in Availability.
              </Text>
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
            </Tabs.Content>
            <Tabs.Content value="meal-prep" forceMount hidden={activeTab !== 'meal-prep'} className="pt-4 space-y-4">
              <MealPrepSetupEditor
                key={discardVersion}
                value={settings.meal_prep}
                disabled={reloading}
                onViewAvailability={() => {
                  setActiveTab('availability');
                  availabilityTabTrigger.current?.focus();
                }}
                onChange={(meal_prep) => edit({ ...settings, meal_prep })}
                onEditing={setMealEditing}
              />
            </Tabs.Content>
          </Tabs>
        </fieldset>
      </form>
    </div>
  );
};
export const config = defineRouteConfig({ label: 'Availability' });
export default AvailabilityPage;
